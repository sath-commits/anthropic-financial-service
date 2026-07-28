import 'server-only';

import { callDataService } from '@/lib/data-service';
import { isCashEquivalent, shouldPriceAtCostBasis } from '@/lib/cash-equivalents';
import {
  DEFAULT_USD_TO_INR_RATE,
  DEFAULT_USD_TO_SGD_RATE,
  positionCurrency,
  toUsd,
  type Currency,
} from '@/lib/currency';
import { mergePortfolioPositions } from '@/lib/portfolio-merge';
import { readLatestPlaidSnapshot, readPlaidSnapshotHistory } from '@/lib/plaid/snapshots';
import { readSettings } from '@/lib/server/settings-store';
import { estimatedMortgageBalance, stableRef } from './calculations';
import { isInsuranceCategory, isSingaporeHdb, managementMode } from './policy';
import { assertFinanceBrainSafe } from './safety';
import type { FinanceBrainPosition, FinanceBrainSnapshot } from './types';

interface PropertyRecord {
  id?: string;
  name?: string;
  location?: string;
  currency?: Currency;
  currentPrice?: number;
  ownership?: 'outright' | 'mortgage';
  originalLoan?: number;
  annualInterestRate?: number;
  loanTermYears?: number;
  loanStartDate?: string;
}

interface OtherAssetRecord {
  id?: string;
  category?: string;
  currency?: Currency;
  currentValue?: number;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export async function buildFinanceBrainSnapshot(now = new Date()): Promise<FinanceBrainSnapshot> {
  const [settings, plaid, history] = await Promise.all([
    readSettings(),
    readLatestPlaidSnapshot(),
    readPlaidSnapshotHistory(new Date(now.getTime() - 365 * 86400000)),
  ]);
  const connectedBrokerages = plaid?.items.map(item => item.institutionName) ?? [];
  const merged = mergePortfolioPositions(settings.positions ?? [], plaid?.positions ?? [], connectedBrokerages).positions;
  const analyticalPositions = merged.filter(position => position.accountType !== 'cpf');
  const symbols = Array.from(new Set(analyticalPositions
    .filter(position => !shouldPriceAtCostBasis(position.symbol)
      && !position.preferInstitutionPrice)
    .map(position => position.symbol.trim().toUpperCase())
    .filter(Boolean)));
  const [quotesRaw, sgdRaw, inrRaw, earningsRaw] = await Promise.all([
    callDataService('get_batch_quotes', { symbols }),
    callDataService('get_quote', { symbol: 'SGD=X' }),
    callDataService('get_quote', { symbol: 'INR=X' }),
    callDataService('get_earnings_calendar', { symbols }),
  ]);
  const quotes = Array.isArray(quotesRaw) ? quotesRaw as Array<{ symbol?: string; price?: number }> : [];
  const quoteMap = Object.fromEntries(quotes.filter(q => q.symbol && finite(q.price)).map(q => [q.symbol!, q.price!]));
  const usdToSgd = finite((sgdRaw as { price?: unknown } | null)?.price) ? (sgdRaw as { price: number }).price : DEFAULT_USD_TO_SGD_RATE;
  const usdToInr = finite((inrRaw as { price?: unknown } | null)?.price) ? (inrRaw as { price: number }).price : DEFAULT_USD_TO_INR_RATE;
  const warnings: string[] = [];
  const cpfValueUsd = merged
    .filter(position => position.accountType === 'cpf')
    .reduce((sum, position) => {
      const currency = positionCurrency(position.currency);
      const nativeValue = position.avgCost * Math.pow(1.045, position.holdingDays / 365) * position.shares;
      return sum + toUsd(nativeValue, currency, usdToSgd, usdToInr);
    }, 0);

  const positions: FinanceBrainPosition[] = analyticalPositions.map(position => {
    const currency = positionCurrency(position.currency);
    const institution = position.brokerage?.trim() || 'Manual';
    const accountName = position.accountName?.trim() || undefined;
    const accountRef = stableRef('acct', `${institution}|${position.plaidAccountId ?? accountName ?? ''}|${position.accountType}`);
    const livePrice = quoteMap[position.symbol];
    const usesCost = shouldPriceAtCostBasis(position.symbol);
    const usesManual = finite(position.currentValue);
    const usesInstitution = position.preferInstitutionPrice && finite(position.fallbackPrice);
    const nativePrice = usesManual ? position.currentValue!
      : usesCost ? position.avgCost
      : usesInstitution ? position.fallbackPrice!
      : livePrice ?? position.fallbackPrice ?? position.avgCost;
    const priceSource: FinanceBrainPosition['priceSource'] = usesManual
      ? 'manual' : usesCost ? 'cost_basis' : livePrice !== undefined ? 'live' : usesInstitution || position.fallbackPrice !== undefined ? 'institution' : 'cost_basis';
    const currentPriceUsd = toUsd(nativePrice, currency, usdToSgd, usdToInr);
    const averageCostUsd = toUsd(position.avgCost, currency, usdToSgd, usdToInr);
    const marketValueUsd = currentPriceUsd * position.shares;
    const hasCostBasis = position.hasCostBasis !== false || isCashEquivalent(position.symbol, position.assetClass);
    if (priceSource === 'cost_basis' && !usesCost) warnings.push(`No current price was available for ${position.symbol}; cost basis was used.`);
    if (!hasCostBasis) warnings.push(`Cost basis is unavailable for ${position.symbol}.`);
    return {
      accountRef, institution, accountType: position.accountType,
      managementMode: managementMode(position), symbol: position.symbol, name: position.name,
      assetClass: position.assetClass, currency, shares: position.shares,
      averageCostUsd, currentPriceUsd, marketValueUsd,
      unrealizedGainLossUsd: hasCostBasis ? marketValueUsd - averageCostUsd * position.shares : undefined,
      unrealizedGainLossPct: hasCostBasis && averageCostUsd > 0 ? (currentPriceUsd / averageCostUsd - 1) * 100 : undefined,
      holdingDays: position.holdingPeriodKnown === false ? undefined : position.holdingDays,
      hasCostBasis, priceSource,
    };
  });
  if (
    analyticalPositions.some(position => position.brokerage?.toLowerCase().includes('robinhood'))
    && !positions.some(position => position.managementMode === 'agentic_satellite')
  ) {
    warnings.push('No Robinhood account matched the configured agentic account; all Robinhood accounts are user-managed.');
  }

  const accountMap = new Map<string, FinanceBrainSnapshot['accounts'][number]>();
  for (const position of positions) {
    const existing = accountMap.get(position.accountRef);
    if (existing) existing.marketValueUsd += position.marketValueUsd;
    else accountMap.set(position.accountRef, {
      accountRef: position.accountRef, institution: position.institution,
      accountType: position.accountType,
      managementMode: position.managementMode, marketValueUsd: position.marketValueUsd,
    });
  }

  const investmentValue = positions.reduce((sum, position) => sum + position.marketValueUsd, 0);
  const byClass = new Map<string, number>();
  for (const position of positions) byClass.set(position.assetClass, (byClass.get(position.assetClass) ?? 0) + position.marketValueUsd);
  const target = settings.profile?.targetAllocation ?? {};
  const allocation = Array.from(new Set([...byClass.keys(), ...Object.keys(target)])).map(assetClass => {
    const marketValueUsd = byClass.get(assetClass) ?? 0;
    const currentPct = investmentValue ? marketValueUsd / investmentValue * 100 : 0;
    const rawTarget = target[assetClass];
    const targetPct = rawTarget === undefined ? undefined : rawTarget <= 1 ? rawTarget * 100 : rawTarget;
    return { assetClass, currentPct, targetPct, driftPct: targetPct === undefined ? undefined : currentPct - targetPct, marketValueUsd };
  });

  const properties = (settings.properties ?? []).flatMap((value, index) => {
    const property = value as PropertyRecord;
    if (!finite(property.currentPrice) || isSingaporeHdb(property)) return [];
    if (property.ownership === 'mortgage'
      && (!property.originalLoan || !property.annualInterestRate || !property.loanTermYears || !property.loanStartDate)) {
      warnings.push(`Mortgage terms are incomplete for ${stableRef('property', property.id ?? String(index))}.`);
    }
    const currency = positionCurrency(property.currency);
    const currentValueUsd = toUsd(property.currentPrice, currency, usdToSgd, usdToInr);
    const mortgageUsd = toUsd(estimatedMortgageBalance(property, now), currency, usdToSgd, usdToInr);
    return [{
      propertyRef: stableRef('property', property.id ?? String(index)), currency,
      currentValueUsd, estimatedMortgageBalanceUsd: mortgageUsd, equityUsd: currentValueUsd - mortgageUsd,
      annualInterestRate: property.annualInterestRate, loanTermYears: property.loanTermYears,
      loanStartDate: property.loanStartDate,
    }];
  });
  const singaporeHdbEquityUsd = (settings.properties ?? []).reduce<number>((sum, value) => {
    const property = value as PropertyRecord;
    if (!finite(property.currentPrice) || !isSingaporeHdb(property)) return sum;
    const currency = positionCurrency(property.currency);
    const equity = property.currentPrice - estimatedMortgageBalance(property, now);
    return sum + toUsd(equity, currency, usdToSgd, usdToInr);
  }, 0);
  const otherAssets = (settings.otherAssets ?? []).flatMap((value, index) => {
    const asset = value as OtherAssetRecord;
    if (!finite(asset.currentValue) || isInsuranceCategory(asset.category)) return [];
    const currency = positionCurrency(asset.currency);
    return [{
      assetRef: stableRef('asset', asset.id ?? String(index)), category: asset.category?.trim() || 'Other',
      currency, currentValueUsd: toUsd(asset.currentValue, currency, usdToSgd, usdToInr),
    }];
  });

  const historicalValues = history.map(snapshot => ({
    capturedAt: snapshot.capturedAt,
    institutionReportedValueUsd: snapshot.positions
      .filter(position => position.accountType !== 'cpf')
      .reduce((sum, position) =>
      sum + toUsd((position.fallbackPrice ?? position.avgCost) * position.shares, positionCurrency(position.currency), usdToSgd, usdToInr), 0),
    positionCount: snapshot.positions.filter(position => position.accountType !== 'cpf').length,
  }));
  const holdingChanges: FinanceBrainSnapshot['history']['holdingChanges'] = [];
  for (let index = 1; index < history.length; index += 1) {
    const previous = new Map(history[index - 1].positions.map(position => [position.externalId, position]));
    const current = new Map(history[index].positions.map(position => [position.externalId, position]));
    for (const key of new Set([...previous.keys(), ...current.keys()])) {
      const before = previous.get(key);
      const after = current.get(key);
      if ((after ?? before)?.accountType === 'cpf') continue;
      const previousShares = before?.shares ?? 0;
      const currentShares = after?.shares ?? 0;
      if (Math.abs(previousShares - currentShares) < 0.000001) continue;
      const position = after ?? before!;
      const institution = position.brokerage?.trim() || 'Unknown';
      holdingChanges.push({
        capturedAt: history[index].capturedAt, institution,
        accountRef: stableRef('acct', `${institution}|${position.plaidAccountId ?? position.accountName?.trim() ?? ''}|${position.accountType}`),
        symbol: position.symbol, previousShares, currentShares, shareChange: currentShares - previousShares,
      });
    }
  }

  const snapshotAgeHours = plaid ? (now.getTime() - new Date(plaid.capturedAt).getTime()) / 3600000 : null;
  const status = !plaid ? 'unavailable' : plaid.errors.length ? 'partial' : snapshotAgeHours! > 96 ? 'stale' : 'fresh';
  if (!plaid) warnings.push('No stored Plaid holdings snapshot is available.');
  if (!settings.profile) warnings.push('The retirement and risk profile is not configured.');
  if (status === 'stale') warnings.push('The stored Plaid snapshot is more than 96 hours old.');
  for (const error of plaid?.errors ?? []) {
    const institution = plaid?.items.find(item => item.itemId === error.itemId)?.institutionName ?? 'A connected institution';
    warnings.push(`${institution} reported sync error ${error.code}.`);
  }

  const earnings = Array.isArray(earningsRaw) ? earningsRaw as Array<{ symbol?: string; earnings_date?: string; eps_estimate?: number | null }> : [];
  const upcomingEarnings = earnings.flatMap(event => {
    if (!event.symbol || !event.earnings_date) return [];
    const daysUntil = Math.round((new Date(event.earnings_date).getTime() - now.getTime()) / 86400000);
    return daysUntil >= 0 && daysUntil <= 60
      ? [{ symbol: event.symbol, earningsDate: event.earnings_date, epsEstimate: event.eps_estimate ?? null, daysUntil }]
      : [];
  }).sort((a, b) => a.daysUntil - b.daysUntil);

  const propertyEquity = properties.reduce((sum, property) => sum + property.equityUsd, 0);
  const liabilities = properties.reduce((sum, property) => sum + property.estimatedMortgageBalanceUsd, 0);
  const otherAssetsValue = otherAssets.reduce((sum, asset) => sum + asset.currentValueUsd, 0);
  const result: FinanceBrainSnapshot = {
    schemaVersion: 1, generatedAt: now.toISOString(), baseCurrency: 'USD',
    freshness: { plaidSnapshotAt: plaid?.capturedAt ?? null, pricedAt: now.toISOString(), ageHours: snapshotAgeHours, status },
    household: {
      investmentValue, propertyEquity, otherAssetsValue, liabilities,
      estimatedNetWorth: investmentValue + cpfValueUsd + propertyEquity + singaporeHdbEquityUsd + otherAssetsValue,
      netWorthOnly: { cpfValueUsd, singaporeHdbEquityUsd },
    },
    profile: settings.profile ? {
      currentAge: settings.profile.currentAge, retirementAge: settings.profile.retirementAge,
      monthlyContribution: settings.profile.monthlyContribution, riskTolerance: settings.profile.riskTolerance,
      primaryGoal: settings.profile.primaryGoal, targetAllocation: settings.profile.targetAllocation,
    } : null,
    accounts: Array.from(accountMap.values()), positions, allocation, properties, otherAssets,
    history: { portfolioValues: historicalValues, holdingChanges: holdingChanges.slice(-1000) },
    upcomingEarnings, warnings: Array.from(new Set(warnings)),
  };
  assertFinanceBrainSafe(result);
  return result;
}
