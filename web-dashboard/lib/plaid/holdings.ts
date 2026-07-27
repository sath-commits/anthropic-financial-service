import 'server-only';

import type {
  Holding,
  InvestmentAccount,
  InvestmentsHoldingsGetResponse,
  Security,
} from 'plaid';
import { isCashEquivalent } from '@/lib/cash-equivalents';
import type { UserPosition } from '@/lib/types';
import { getPlaidClient, plaidError } from './client';
import {
  decryptPlaidAccessToken,
  listPlaidItems,
  updatePlaidItemStatus,
  type PlaidItemStatus,
  type StoredPlaidItem,
} from './store';
import {
  readLatestPlaidSnapshot,
  writePlaidSnapshot,
  type PlaidHoldingsSnapshot,
} from './snapshots';

export interface PlaidHoldingsResult {
  positions: UserPosition[];
  items: PlaidItemStatus[];
  errors: Array<{ itemId: string; code: string; message: string }>;
}

function accountType(subtype: string | null): UserPosition['accountType'] {
  const normalized = subtype?.toLowerCase() ?? '';
  if (normalized === 'hsa') return 'hsa';
  if (normalized === 'roth') return 'roth_ira';
  if (normalized === 'ira' || normalized.includes('ira') || normalized === 'sarsep') return 'ira';
  if (
    normalized.includes('401')
    || normalized.includes('403')
    || normalized.includes('457')
    || normalized.includes('pension')
    || normalized.includes('profit sharing')
    || normalized.includes('thrift savings')
    || normalized === 'retirement'
  ) return '401k';
  return 'taxable';
}

const TICKER_ASSET_CLASSES: Record<string, string> = {
  AGG: 'Bonds', BND: 'Bonds', BNDX: 'Bonds', GOVT: 'Bonds', IUSB: 'Bonds', SGOV: 'Bonds', TLT: 'Bonds',
  DBC: 'Gold / Commodities', GLD: 'Gold / Commodities', IAU: 'Gold / Commodities', PDBC: 'Gold / Commodities', SLV: 'Gold / Commodities',
  EEM: 'Emerging Markets', IEMG: 'Emerging Markets', VWO: 'Emerging Markets',
  IEFA: 'International', IXUS: 'International', VEA: 'International', VXUS: 'International',
  IJR: 'US Small/Mid Cap', IWM: 'US Small/Mid Cap', VB: 'US Small/Mid Cap', VO: 'US Small/Mid Cap', VXF: 'US Small/Mid Cap',
  REET: 'REITs', SCHH: 'REITs', USRT: 'REITs', VNQ: 'REITs',
};

function assetClass(security: Security): string {
  const ticker = security.ticker_symbol?.trim().toUpperCase() ?? '';
  if (TICKER_ASSET_CLASSES[ticker]) return TICKER_ASSET_CLASSES[ticker];
  if (security.is_cash_equivalent || security.type === 'cash') return 'Cash';
  if (security.type === 'fixed income') return 'Bonds';
  if (security.subtype === 'real estate investment trust') return 'REITs';
  if (security.type === 'cryptocurrency' || security.type === 'derivative' || security.type === 'other') return 'Alternatives';
  return 'US Large Cap';
}

function holdingPeriod(holding: Holding): {
  purchaseDate?: string;
  holdingDays: number;
  holdingPeriodKnown: boolean;
} {
  const dates = (holding.tax_lots ?? [])
    .map(lot => lot.original_purchase_datetime)
    .filter((value): value is string => Boolean(value))
    .map(value => new Date(value))
    .filter(date => Number.isFinite(date.getTime()));
  if (!dates.length) return { holdingDays: 366, holdingPeriodKnown: false };

  // The newest lot is the conservative date for determining whether any part
  // of an aggregated position may still be short-term.
  const newest = new Date(Math.max(...dates.map(date => date.getTime())));
  return {
    purchaseDate: newest.toISOString().slice(0, 10),
    holdingDays: Math.max(0, Math.floor((Date.now() - newest.getTime()) / 86400000)),
    holdingPeriodKnown: dates.length === (holding.tax_lots?.length ?? 0),
  };
}

function supportedCurrency(code: string | null): UserPosition['currency'] {
  if (code === 'SGD' || code === 'INR') return code;
  return 'USD';
}

function normalizeHolding(
  item: StoredPlaidItem,
  holding: Holding,
  securities: Map<string, Security>,
  accounts: Map<string, InvestmentAccount>,
): UserPosition | null {
  if (!Number.isFinite(holding.quantity) || holding.quantity === 0) return null;
  const security = securities.get(holding.security_id);
  const account = accounts.get(holding.account_id);
  if (!security || !account) return null;

  const ticker = security.ticker_symbol?.trim().toUpperCase();
  const symbol = ticker || `PLAID-${holding.security_id.slice(0, 8).toUpperCase()}`;
  const classifiedAssetClass = assetClass(security);
  const isCashLike = isCashEquivalent(symbol, classifiedAssetClass);
  const preferInstitutionPrice = isCashLike
    || !security.market_identifier_code
    || symbol.includes(':')
    || symbol.includes('.');
  const hasReportedCostBasis = holding.cost_basis !== null
    && Number.isFinite(holding.cost_basis)
    && holding.quantity !== 0;
  const hasCostBasis = hasReportedCostBasis || isCashLike;
  const avgCost = hasReportedCostBasis
    ? Math.abs(holding.cost_basis! / holding.quantity)
    : Math.abs(holding.institution_price);
  const period = holdingPeriod(holding);

  return {
    symbol,
    name: security.name?.trim() || symbol,
    shares: holding.quantity,
    avgCost,
    accountType: accountType(account.subtype),
    currency: supportedCurrency(holding.iso_currency_code),
    brokerage: item.institutionName,
    holdingDays: period.holdingDays,
    holdingPeriodKnown: period.holdingPeriodKnown,
    assetClass: classifiedAssetClass,
    purchaseDate: period.purchaseDate,
    fallbackPrice: Math.abs(holding.institution_price),
    preferInstitutionPrice,
    hasCostBasis,
    source: 'plaid',
    externalId: `${item.itemId}:${holding.account_id}:${holding.security_id}`,
    plaidItemId: item.itemId,
    plaidAccountId: holding.account_id,
    plaidSecurityId: holding.security_id,
    accountName: account.name,
    accountMask: account.mask ?? undefined,
  };
}

function normalizeResponse(
  item: StoredPlaidItem,
  response: InvestmentsHoldingsGetResponse,
): UserPosition[] {
  const securities = new Map(response.securities.map(security => [security.security_id, security]));
  const accounts = new Map(response.accounts.map(account => [account.account_id, account]));
  return response.holdings
    .map(holding => normalizeHolding(item, holding, securities, accounts))
    .filter((position): position is UserPosition => position !== null);
}

async function fetchPlaidHoldings(): Promise<PlaidHoldingsResult> {
  const client = getPlaidClient();
  const storedItems = await listPlaidItems();
  const positions: UserPosition[] = [];
  const errors: PlaidHoldingsResult['errors'] = [];

  for (const item of storedItems) {
    try {
      const response = await client.investmentsHoldingsGet({
        access_token: decryptPlaidAccessToken(item),
      });
      positions.push(...normalizeResponse(item, response.data));
      await updatePlaidItemStatus(item.itemId, {
        lastSyncedAt: new Date().toISOString(),
        lastError: null,
      });
    } catch (error) {
      const detail = plaidError(error);
      errors.push({ itemId: item.itemId, code: detail.code, message: detail.message });
      await updatePlaidItemStatus(item.itemId, {
        lastError: `${detail.code}: ${detail.message}`,
      });
    }
  }

  const refreshedItems = await listPlaidItems();
  return {
    positions,
    items: refreshedItems.map(item => ({
      itemId: item.itemId,
      institutionId: item.institutionId,
      institutionName: item.institutionName,
      connectedAt: item.connectedAt,
      lastSyncedAt: item.lastSyncedAt,
      lastWebhookAt: item.lastWebhookAt,
      lastError: item.lastError,
    })),
    errors,
  };
}

export async function syncPlaidHoldings(): Promise<PlaidHoldingsSnapshot> {
  const previous = await readLatestPlaidSnapshot();
  const result = await fetchPlaidHoldings();
  const failedItemIds = new Set(result.errors.map(error => error.itemId));
  const activeItemIds = new Set(result.items.map(item => item.itemId));
  const retainedPositions = (previous?.positions ?? []).filter(position =>
    Boolean(position.plaidItemId)
    && activeItemIds.has(position.plaidItemId!)
    && failedItemIds.has(position.plaidItemId!),
  );
  const snapshot: PlaidHoldingsSnapshot = {
    version: 1,
    capturedAt: new Date().toISOString(),
    positions: [...result.positions, ...retainedPositions],
    items: result.items,
    errors: result.errors,
  };
  await writePlaidSnapshot(snapshot);
  return snapshot;
}
