import type { UserPosition, InvestorProfile, ThesisEntry } from './types';

const POSITIONS_KEY = 'portfolio-ai:positions';
const POSITION_BACKUPS_KEY = 'portfolio-ai:position-backups';
const POSITIONS_DIRTY_KEY = 'portfolio-ai:positions-dirty';
const PROFILE_KEY   = 'portfolio-ai:profile';
const THESIS_KEY    = 'portfolio-ai:theses';

interface StoredSettings {
  positions?: UserPosition[];
  profile?: InvestorProfile;
}

interface SavePositionsOptions {
  allowEmptyPositions?: boolean;
}

function normalizePositions(positions: UserPosition[]): UserPosition[] {
  return positions.map(position => ({ ...position, brokerage: position.brokerage?.trim() || 'Fidelity' }));
}

function persistSettings(settings: StoredSettings, options: SavePositionsOptions = {}) {
  void fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...settings, ...options }),
  }).then(res => {
    if (!res.ok) throw new Error('Settings store rejected the update');
    if (settings.positions !== undefined && localStorage.getItem(POSITIONS_KEY) === JSON.stringify(settings.positions)) {
      localStorage.removeItem(POSITIONS_DIRTY_KEY);
    }
  }).catch(() => {
    // Browser storage remains authoritative until a later retry succeeds.
  });
}

export function savePositions(positions: UserPosition[], options: SavePositionsOptions = {}) {
  positions = normalizePositions(positions);
  const current = loadPositions();
  if (!positions.length && current?.length && !options.allowEmptyPositions) return;
  if (current) saveBrowserSnapshot(current);
  saveBrowserSnapshot(positions);
  try {
    localStorage.setItem(POSITIONS_KEY, JSON.stringify(positions));
    localStorage.setItem(POSITIONS_DIRTY_KEY, '1');
  } catch {
    // The Railway volume write below remains the durable fallback.
  }
  persistSettings({ positions }, options);
}

function saveBrowserSnapshot(positions: UserPosition[]) {
  try {
    const raw = localStorage.getItem(POSITION_BACKUPS_KEY);
    const snapshots = raw ? JSON.parse(raw) as Array<{ savedAt: string; positions: UserPosition[] }> : [];
    snapshots.push({ savedAt: new Date().toISOString(), positions });
    localStorage.setItem(POSITION_BACKUPS_KEY, JSON.stringify(snapshots.slice(-100)));
  } catch {
    // Browser snapshots are best-effort; the Railway volume keeps full history.
  }
}

function loadLatestBrowserSnapshot(): UserPosition[] | null {
  try {
    const raw = localStorage.getItem(POSITION_BACKUPS_KEY);
    const snapshots = raw ? JSON.parse(raw) as Array<{ savedAt: string; positions: UserPosition[] }> : [];
    for (const snapshot of snapshots.reverse()) {
      if (Array.isArray(snapshot.positions)) return snapshot.positions;
    }
  } catch {
    // No usable local snapshots.
  }
  return null;
}

export function loadPositions(): UserPosition[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(POSITIONS_KEY);
    return raw ? normalizePositions(JSON.parse(raw) as UserPosition[]) : null;
  } catch {
    return loadLatestBrowserSnapshot();
  }
}

export function saveProfile(profile: InvestorProfile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  persistSettings({ profile });
}

export function downloadSettingsBackup(positions: UserPosition[], profile: InvestorProfile | null) {
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), positions, profile }, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `beta-than-nothing-portfolio-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function loadProfile(): InvestorProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function hydrateSettings(): Promise<StoredSettings> {
  const localPositions = loadPositions() ?? undefined;
  const localProfile = loadProfile() ?? undefined;
  const localPositionsAreNewer = localStorage.getItem(POSITIONS_DIRTY_KEY) === '1';
  try {
    const res = await fetch('/api/settings', { cache: 'no-store' });
    if (!res.ok) throw new Error('Settings store unavailable');
    const server = await res.json() as StoredSettings;
    if (server.positions) server.positions = normalizePositions(server.positions);
    const positions = localPositionsAreNewer && localPositions
      ? localPositions
      : server.positions?.length === 0 && localPositions?.length
      ? localPositions
      : server.positions ?? localPositions;
    const profile = server.profile ?? localProfile;
    if (positions) localStorage.setItem(POSITIONS_KEY, JSON.stringify(positions));
    if (profile) localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    if ((localPositionsAreNewer || !server.positions || server.positions.some(position => !position.brokerage)) && localPositions) persistSettings({ positions: localPositions });
    if (!server.profile && localProfile) persistSettings({ profile: localProfile });
    return { positions, profile };
  } catch {
    return { positions: localPositions, profile: localProfile };
  }
}

// ─── Portfolio display cache (instant first-paint) ────────────────────────────

const PORTFOLIO_CACHE_KEY = 'portfolio-ai:display-cache-v1';
const PORTFOLIO_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 h

export function savePortfolioCache(data: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PORTFOLIO_CACHE_KEY, JSON.stringify({ d: data, t: Date.now() }));
  } catch {}
}

export function loadPortfolioCache<T>(): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PORTFOLIO_CACHE_KEY);
    if (!raw) return null;
    const { d, t } = JSON.parse(raw) as { d: T; t: number };
    if (Date.now() - t > PORTFOLIO_CACHE_TTL) return null;
    return d;
  } catch {
    return null;
  }
}

export function clearAll() {
  localStorage.removeItem(POSITIONS_KEY);
  localStorage.removeItem(PROFILE_KEY);
}

// ─── Thesis Tracker (from thesis-tracker skill) ───────────────────────────────

export function loadAllTheses(): ThesisEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(THESIS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveThesis(entry: ThesisEntry) {
  const all = loadAllTheses();
  const idx = all.findIndex(t => t.symbol === entry.symbol);
  if (idx >= 0) all[idx] = entry;
  else all.push(entry);
  localStorage.setItem(THESIS_KEY, JSON.stringify(all));
}

export function loadThesis(symbol: string): ThesisEntry | null {
  return loadAllTheses().find(t => t.symbol === symbol) ?? null;
}

export function deleteThesis(symbol: string) {
  const all = loadAllTheses().filter(t => t.symbol !== symbol);
  localStorage.setItem(THESIS_KEY, JSON.stringify(all));
}

export function hasOnboarded(): boolean {
  if (typeof window === 'undefined') return false;
  const pos = localStorage.getItem(POSITIONS_KEY);
  try { return pos ? JSON.parse(pos).length > 0 : false; }
  catch { return false; }
}
