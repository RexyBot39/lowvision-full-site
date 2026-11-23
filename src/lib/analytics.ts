/**
 * Site analytics.
 *
 * The server says which provider to use (GET /api/analytics-config):
 *
 * - "posthog": PostHog in cookieless mode, sent through our own /ingest proxy.
 *   No cookies, localStorage or person profiles; no autocapture or session
 *   recording; query strings and hashes are stripped from every URL before
 *   sending.
 * - "builtin": the first-party daily counter (server/public-api.mjs). Path and
 *   first-visit referrer host only.
 *
 * Either way, visitors with Do Not Track or Global Privacy Control are never
 * tracked, nothing is sent from `npm run dev`, and admin pages aren't counted.
 */

import type { PostHog } from 'posthog-js';

type Config = { provider: 'posthog'; key: string; apiHost: string; uiHost: string } | { provider: 'builtin' };

/** Custom events. Keep in sync with TRACKED_EVENTS in server/posthog.mjs. */
export type TrackedEvent = 'intake_started' | 'intake_completed' | 'contact_submitted' | 'assistant_question';

let ready: Promise<{ config: Config; ph: PostHog | null }> | null = null;
let lastPath: string | null = null;
let sentReferrer = false;

function disabled(): boolean {
  if (typeof window === 'undefined' || import.meta.env.DEV) return true;
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
    if (config.provider !== 'posthog') return { config, ph: null };

    const { default: posthog } = await import('posthog-js');
    posthog.init(config.key, {
      api_host: config.apiHost,
      ui_host: config.uiHost,
      defaults: '2026-01-30',
      cookieless_mode: 'always',
      persistence: 'memory',
      person_profiles: 'never',
      respect_dnt: true,
      capture_pageview: false, // sent by trackPageview() on each route change
      capture_pageleave: true,
      autocapture: false,
      disable_session_recording: true,
      disable_surveys: true,
      // No feature flags: the /flags request bypasses before_send and would send
      // the full first URL (including any query string).
      advanced_disable_flags: true,
      before_send: (event) => {
        if (!event) return event;
        for (const [k, v] of Object.entries(event.properties ?? {})) event.properties[k] = stripUrl(v);
        return event;
      },
    });
    return { config, ph: posthog };
  })().catch(() => ({ config: { provider: 'builtin' } as Config, ph: null }));
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

/** Record a custom event. Only sent when PostHog is the provider. Never pass personal details. */
export function trackEvent(name: TrackedEvent, properties?: Record<string, string | number | boolean>): void {
  if (disabled()) return;
  void init().then(({ ph }) => ph?.capture(name, properties));
}
