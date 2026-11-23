/**
 * Site analytics.
 *
 * The server says which provider to use (GET /api/analytics-config):
 *
 * - "posthog": PostHog, sent through our own /ingest proxy. Query strings
 *   and hashes are stripped from every URL before sending.
 * - "builtin": the first-party daily counter (server/public-api.mjs). Path and
 *   first-visit referrer host only.
 *
 * Either way, visitors with Do Not Track or Global Privacy Control are never
 * tracked, and admin pages aren't counted.
 */

import type { PostHog } from 'posthog-js';

type Config = { provider: 'posthog'; key: string; apiHost: string; uiHost: string } | { provider: 'builtin' };

/** Custom events. Keep in sync with TRACKED_EVENTS in server/posthog.mjs. */
export type TrackedEvent =
  | 'intake_started'
  | 'intake_completed'
  | 'contact_submitted'
  | 'assistant_question'
  | 'account_signed_in'
  | 'account_created'
  | 'directory_search_submitted'
  | 'site_search_submitted'
  | 'intake_progress_saved';

let ready: Promise<{ config: Config; ph: PostHog | null }> | null = null;
let lastPath: string | null = null;
let sentReferrer = false;

function disabled(): boolean {
  if (typeof window === 'undefined') return true;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.doNotTrack === '1' || nav.globalPrivacyControl === true;
}

/** Remove query strings and hashes from anything that looks like a URL. */
function stripUrl(value: unknown): unknown {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) return value;
  try {
    const u = new URL(value);
    return u.origin + u.pathname;
  } catch {
    return value;
  }
}

function init() {
  ready ??= (async () => {
    let config: Config = { provider: 'builtin' };
    try {
      const res = await fetch('/api/analytics-config', { credentials: 'omit' });
      if (res.ok) config = await res.json();
    } catch {
      /* fall back to the built-in counter */
    }
    if (config.provider !== 'posthog') {
      if (import.meta.env.DEV) {
        throw new Error(
          'POSTHOG_PROJECT_KEY variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once POSTHOG_PROJECT_KEY is configured',
        );
      }
      return { config, ph: null };
    }

    const { default: posthog } = await import('posthog-js');
    posthog.init(config.key, {
      api_host: config.apiHost,
      ui_host: config.uiHost,
      defaults: '2026-01-30',
      capture_pageview: false, // sent by trackPageview() on each route change
      before_send: (event) => {
        if (!event) return event;
        for (const [k, v] of Object.entries(event.properties ?? {})) event.properties[k] = stripUrl(v);
        return event;
      },
    });
    return { config, ph: posthog };
  })().catch((error) => {
    if (import.meta.env.DEV) throw error;
    return { config: { provider: 'builtin' } as Config, ph: null };
  });
  return ready;
}

function sendBuiltin(path: string) {
  let referrer = '';
  if (!sentReferrer) {
    sentReferrer = true;
    try {
      const ref = document.referrer ? new URL(document.referrer) : null;
      if (ref && ref.hostname !== location.hostname) referrer = ref.origin;
    } catch {
      /* ignore malformed referrer */
    }
  }
  fetch('/api/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, referrer }),
    keepalive: true,
    credentials: 'omit',
  }).catch(() => {
    /* analytics must never affect the page */
  });
}

export function trackPageview(path: string): void {
  if (path === lastPath) return;
  lastPath = path;
  if (disabled() || path === '/admin' || path.startsWith('/admin/')) return;
  void init().then(({ ph }) => {
    if (ph) ph.capture('$pageview');
    else sendBuiltin(path);
  });
}

/** Associate the browser's anonymous activity with the authenticated account. */
export function identifyUser(user: { id: number; email: string; name: string; isAdmin?: boolean }): void {
  if (disabled()) return;
  void init().then(({ ph }) => {
    ph?.identify(String(user.id), {
      email: user.email,
      name: user.name,
      is_admin: user.isAdmin === true,
    });
  });
}

/** Clear the authenticated identity when the account session ends. */
export function resetUser(): void {
  if (disabled() || !ready) return;
  void ready.then(({ ph }) => ph?.reset());
}

/** Record a custom event. Only sent when PostHog is the provider. Never pass personal details. */
export function trackEvent(name: TrackedEvent, properties?: Record<string, string | number | boolean>): void {
  if (disabled()) return;
  void init().then(({ ph }) => ph?.capture(name, properties));
}
