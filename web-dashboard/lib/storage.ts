import type { UserPosition, InvestorProfile } from './types';

const POSITIONS_KEY = 'portfolio-ai:positions';
const PROFILE_KEY   = 'portfolio-ai:profile';

export function savePositions(positions: UserPosition[]) {
  localStorage.setItem(POSITIONS_KEY, JSON.stringify(positions));
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

export function clearAll() {
  localStorage.removeItem(POSITIONS_KEY);
  localStorage.removeItem(PROFILE_KEY);
}

export function hasOnboarded(): boolean {
  if (typeof window === 'undefined') return false;
  const pos = localStorage.getItem(POSITIONS_KEY);
  try { return pos ? JSON.parse(pos).length > 0 : false; }
  catch { return false; }
}
