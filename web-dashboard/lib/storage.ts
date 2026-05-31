import type { UserPosition, InvestorProfile, ThesisEntry } from './types';

const POSITIONS_KEY = 'portfolio-ai:positions';
const PROFILE_KEY   = 'portfolio-ai:profile';
const THESIS_KEY    = 'portfolio-ai:theses';

interface StoredSettings {
  positions?: UserPosition[];
  profile?: InvestorProfile;
}

function persistSettings(settings: StoredSettings) {
  void fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  }).catch(() => {
    // Browser storage remains available when the server store is unreachable.
  });
}

export function savePositions(positions: UserPosition[]) {
  localStorage.setItem(POSITIONS_KEY, JSON.stringify(positions));
  persistSettings({ positions });
}

export function loadPositions(): UserPosition[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(POSITIONS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveProfile(profile: InvestorProfile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  persistSettings({ profile });
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
  try {
    const res = await fetch('/api/settings', { cache: 'no-store' });
    if (!res.ok) throw new Error('Settings store unavailable');
    const server = await res.json() as StoredSettings;
    const positions = server.positions ?? localPositions;
    const profile = server.profile ?? localProfile;
    if (positions) localStorage.setItem(POSITIONS_KEY, JSON.stringify(positions));
    if (profile) localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    if (!server.positions && localPositions) persistSettings({ positions: localPositions });
    if (!server.profile && localProfile) persistSettings({ profile: localProfile });
    return { positions, profile };
  } catch {
    return { positions: localPositions, profile: localProfile };
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
