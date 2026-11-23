/**
 * PostHog integration.
 *
 * Collection: the browser sends events to /ingest on our own domain, and this
 * server forwards them to PostHog. That keeps the site's strict CSP
 * (connect-src 'self') and stops ad blockers from dropping events. The
 * visitor's IP is forwarded only so PostHog can estimate country and compute
 * its cookieless daily visitor hash; turn on "Discard client IP data" in the
 * PostHog project so it isn't stored.
 *
 * Reporting: the admin dashboard runs HogQL queries server-side with a
 * personal API key, which never reaches the browser.
 *
 * Environment:
 *   POSTHOG_PROJECT_KEY        phc_… project API key (public; enables collection)
 *   POSTHOG_REGION             "us" (default) or "eu"
 *   POSTHOG_PROJECT_ID         numeric project id (for the admin dashboard)
 *   POSTHOG_PERSONAL_API_KEY   phx_… personal key with "query:read" (for the admin dashboard)
 *   POSTHOG_INGEST_HOST / POSTHOG_ASSETS_HOST / POSTHOG_APP_HOST
 *                              optional overrides (self-hosted PostHog)
 */

import express from 'express';

const region = process.env.POSTHOG_REGION === 'eu' ? 'eu' : 'us';
const strip = (u) => u.replace(/\/+$/, '');

export const posthog = {
  projectKey: process.env.POSTHOG_PROJECT_KEY?.trim() || '',
  projectId: process.env.POSTHOG_PROJECT_ID?.trim() || '',
  personalKey: process.env.POSTHOG_PERSONAL_API_KEY?.trim() || '',
  ingestHost: strip(process.env.POSTHOG_INGEST_HOST || `https://${region}.i.posthog.com`),
  assetsHost: strip(process.env.POSTHOG_ASSETS_HOST || `https://${region}-assets.i.posthog.com`),
  appHost: strip(process.env.POSTHOG_APP_HOST || `https://${region}.posthog.com`),
};

export const collectionEnabled = () => !!posthog.projectKey;
export const reportingEnabled = () => !!(posthog.projectId && posthog.personalKey);

// ── /ingest proxy ──────────────────────────────────────────────────────────

const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'transfer-encoding', 'content-length', 'content-encoding', 'upgrade',
]);

export const ingestProxy = express.Router();
ingestProxy.use(express.raw({ type: () => true, limit: '5mb' }));
ingestProxy.use(async (req, res) => {
  if (!collectionEnabled()) return res.status(404).end();
  const upstream = req.path.startsWith('/static/') ? posthog.assetsHost : posthog.ingestHost;
  const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
  const headers = {};
  for (const name of ['content-type', 'content-encoding', 'user-agent', 'accept', 'accept-language']) {
    const v = req.get(name);
    if (v) headers[name] = v;
  }
  if (req.ip) headers['x-forwarded-for'] = req.ip;
  try {
    const r = await fetch(upstream + req.path + query, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) || !req.body?.length ? undefined : req.body,
      signal: AbortSignal.timeout(10_000),
    });
    res.status(r.status);
    r.headers.forEach((v, k) => {
      if (!HOP_BY_HOP.has(k) && !k.startsWith('access-control-') && k !== 'set-cookie') res.setHeader(k, v);
    });
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch (err) {
    console.warn('[posthog] ingest proxy failed:', err.message);
    if (!res.headersSent) res.status(502).end();
  }
});

// ── HogQL queries for the admin dashboard ──────────────────────────────────

export const TRACKED_EVENTS = ['intake_started', 'intake_completed', 'contact_submitted', 'assistant_question'];

async function hogql(query) {
  const r = await fetch(`${posthog.appHost}/api/projects/${encodeURIComponent(posthog.projectId)}/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${posthog.personalKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query }, name: 'lvn-admin-dashboard' }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`PostHog query failed (${r.status}): ${text.slice(0, 300)}`);
  }
  const data = await r.json();
  return data.results ?? [];
}

const cache = new Map(); // days -> { at, value }
const CACHE_MS = 5 * 60 * 1000;

/** Analytics overview for the last `days` days (integer 1–365), from PostHog. */
export async function posthogOverview(days) {
  const hit = cache.get(days);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  // `days` is a validated integer, so interpolating it is safe.
  const pv = `event = '$pageview'`;
  const cur = `timestamp >= now() - INTERVAL ${days} DAY`;
  const prev = `timestamp >= now() - INTERVAL ${days * 2} DAY AND timestamp < now() - INTERVAL ${days} DAY`;
  const top = (expr, limit, extra = '') =>
    `SELECT ${expr} AS k, count() AS views, count(DISTINCT distinct_id) AS visitors FROM events
     WHERE ${pv} AND ${cur} AND ${expr} IS NOT NULL AND ${expr} != '' ${extra}
     GROUP BY k ORDER BY views DESC LIMIT ${limit}`;

  const [totals, prevTotals, daily, pages, referrers, devices, countries, events] = await Promise.all([
    hogql(`SELECT count(), count(DISTINCT distinct_id) FROM events WHERE ${pv} AND ${cur}`),
    hogql(`SELECT count(), count(DISTINCT distinct_id) FROM events WHERE ${pv} AND ${prev}`),
    hogql(`SELECT toDate(timestamp) AS day, count(), count(DISTINCT distinct_id) FROM events
           WHERE ${pv} AND ${cur} GROUP BY day ORDER BY day`),
    hogql(top('properties.$pathname', 25)),
    hogql(top('properties.$referring_domain', 10, `AND properties.$referring_domain != '$direct'`)),
    hogql(top('properties.$device_type', 5)),
    hogql(top('properties.$geoip_country_name', 10)),
    hogql(`SELECT event, count() FROM events WHERE ${cur} AND event IN (${TRACKED_EVENTS.map((e) => `'${e}'`).join(',')})
           GROUP BY event`),
  ]);

  const rows = (r) => r.map(([key, views, visitors]) => ({ key: String(key), views: Number(views), visitors: Number(visitors) }));
  const eventCounts = Object.fromEntries(TRACKED_EVENTS.map((e) => [e, 0]));
  for (const [name, count] of events) eventCounts[name] = Number(count);

  const value = {
    source: 'posthog',
    days,
    generatedAt: new Date().toISOString(),
    totals: { views: Number(totals[0]?.[0] ?? 0), visitors: Number(totals[0]?.[1] ?? 0) },
    previous: { views: Number(prevTotals[0]?.[0] ?? 0), visitors: Number(prevTotals[0]?.[1] ?? 0) },
    daily: daily.map(([day, views, visitors]) => ({ day: String(day).slice(0, 10), views: Number(views), visitors: Number(visitors) })),
    topPages: rows(pages),
    topReferrers: rows(referrers),
    devices: rows(devices),
    countries: rows(countries),
    events: eventCounts,
  };
  cache.set(days, { at: Date.now(), value });
  return value;
}
