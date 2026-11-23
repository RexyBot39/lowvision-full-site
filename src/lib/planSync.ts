/**
 * Keeps the intake plan in localStorage (what the UI reads) in sync with the
 * signed-in user's account on the server.
 */
import { api } from './api';

export const PLAN_STORAGE_KEY = 'clearpath_intake_v1';
export const PLAN_SYNC_EVENT = 'lvn:plan-synced';

let signedIn = false;
let pushTimer: ReturnType<typeof setTimeout> | undefined;

function readLocal(): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(PLAN_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** True when the stored plan holds answers beyond the empty default. */
function hasProgress(plan: Record<string, unknown> | null): boolean {
  if (!plan) return false;
  const answers = (plan.answers ?? {}) as Record<string, unknown>;
  return !!plan.isComplete || Number(plan.currentStep) > 0 || Object.keys(answers).some((k) => k !== 'mode');
}

/** Called after sign-in / session restore: the account's plan wins if it has one. */
export async function syncOnSignIn(): Promise<void> {
  signedIn = true;
  try {
    const { plan } = await api<{ plan: Record<string, unknown> | null }>('/plan');
    if (plan) {
      localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(plan));
      window.dispatchEvent(new Event(PLAN_SYNC_EVENT));
    } else {
      const local = readLocal();
      if (hasProgress(local)) await api('/plan', { method: 'PUT', body: { plan: local } });
    }
  } catch (err) {
    console.warn('[plan sync] initial sync failed', err);
  }
}

/** Called on sign-out: forget the plan on this device (it stays on the account). */
export function stopSync(): void {
  signedIn = false;
  clearTimeout(pushTimer);
  try {
    localStorage.removeItem(PLAN_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(PLAN_SYNC_EVENT));
}

/** Debounced upload of the current local plan. No-op when signed out. */
export function schedulePlanPush(): void {
  if (!signedIn) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    const local = readLocal();
    const request = local
      ? api('/plan', { method: 'PUT', body: { plan: local } })
      : api('/plan', { method: 'DELETE', body: {} });
    request.catch((err) => console.warn('[plan sync] upload failed', err));
  }, 1000);
}
