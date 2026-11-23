/**
 * Privacy-friendly, first-party page-view counting.
 *
 * Sends only the page path (no query string or hash) and, for the first page
 * of a visit, the hostname of the site that linked here. No cookies, no
 * localStorage, no identifiers, no third parties. The server turns each event
 * into a daily counter (see server/public-api.mjs). Visitors with Do Not Track
 * or Global Privacy Control turned on are never counted.
 */

let lastPath: string | null = null;
let sentReferrer = false;

function optedOut(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.doNotTrack === '1' || nav.globalPrivacyControl === true;
}

export function trackPageview(path: string): void {
  if (typeof window === 'undefined' || import.meta.env.DEV) return;
  if (path === lastPath) return;
  lastPath = path;
  if (optedOut()) return;

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
