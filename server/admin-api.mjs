/**
 * Admin API, mounted at /api/admin. Used by the /admin dashboard.
 *
 * Access: a signed-in account whose email is in ADMIN_EMAILS, or a request with
 * `Authorization: Bearer $ADMIN_TOKEN` (for scripts and curl).
 *
 *   GET   /api/admin/analytics?days=30       PostHog data, or the built-in counter
 *   GET   /api/admin/contact-messages?status=new|handled|all&limit=100
 *   PATCH /api/admin/contact-messages/:id    { status: "new" | "handled" }
 *   GET   /api/admin/listings?status=pending|approved|rejected|removed|all
 *   POST  /api/admin/listings/:id/approve    publish the submitted version
 *   POST  /api/admin/listings/:id/reject     { note } (shown to the professional)
 *   POST  /api/admin/listings/:id/remove     { note } take it off the public site
 *   GET   /api/admin/seo                     latest DataForSEO snapshot + history
 *   POST  /api/admin/seo/refresh             fetch a new snapshot (costs money; 10-min cooldown)
 *   GET   /api/admin/seo/snapshots/:id/raw   download a snapshot's raw DataForSEO responses
 */

import express from 'express';
import { timingSafeEqual, createHash } from 'node:crypto';
import { db } from './db.mjs';
import { loadUser, isAdminEmail } from './api.mjs';
import { posthog, posthogOverview, reportingEnabled, collectionEnabled, TRACKED_EVENTS } from './posthog.mjs';
import {
  seoConfig, seoEnabled, refreshSeo, seoRefreshRunning, compareKeywords, pagesFromKeywords, MANUAL_COOLDOWN_MS,
} from './seo.mjs';

export const adminRouter = express.Router();

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const sha256 = (s) => createHash('sha256').update(s).digest();

function tokenMatches(req) {
  const expected = process.env.ADMIN_TOKEN;
  const given = (req.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  // Compare hashes so lengths always match for timingSafeEqual.
  return !!expected && expected.length >= 16 && !!given && timingSafeEqual(sha256(given), sha256(expected));
}

adminRouter.use((_req, res, next) => {
  res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
  next();
});
adminRouter.use(wrap(loadUser));
adminRouter.use((req, res, next) => {
  if (tokenMatches(req) || (req.user && isAdminEmail(req.user.email))) return next();
  return res.status(req.user ? 403 : 401).json({ error: req.user ? 'This account is not an admin.' : 'Not signed in' });
});

// CSRF: same rule as the account API.
adminRouter.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !req.is('application/json')) {
    return res.status(415).json({ error: 'Expected application/json' });
  }
  next();
});
adminRouter.use(express.json({ limit: '10kb' }));

const clampDays = (v) => Math.min(Math.max(Math.trunc(Number(v)) || 30, 1), 365);

// ── analytics ──────────────────────────────────────────────────────────────

async function builtinOverview(days) {
  const empty = { views: 0, visitors: 0 };
  if (!db) {
    return { source: 'builtin', days, generatedAt: new Date().toISOString(), totals: empty, previous: empty,
      daily: [], topPages: [], topReferrers: [], devices: [], countries: [], events: null };
  }
  const cur = `day > CURRENT_DATE - $1::int`;
  const prev = `day > CURRENT_DATE - 2 * $1::int AND day <= CURRENT_DATE - $1::int`;
  const [t, p, daily, pages, refs] = await Promise.all([
    db.query(`SELECT COALESCE(SUM(views), 0)::int AS v FROM page_views WHERE ${cur}`, [days]),
    db.query(`SELECT COALESCE(SUM(views), 0)::int AS v FROM page_views WHERE ${prev}`, [days]),
    db.query(`SELECT to_char(day, 'YYYY-MM-DD') AS day, SUM(views)::int AS views FROM page_views WHERE ${cur} GROUP BY day ORDER BY day`, [days]),
    db.query(`SELECT path AS key, SUM(views)::int AS views FROM page_views WHERE ${cur} GROUP BY path ORDER BY views DESC LIMIT 25`, [days]),
    db.query(`SELECT referrer AS key, SUM(views)::int AS views FROM page_views WHERE ${cur} AND referrer <> '' GROUP BY referrer ORDER BY views DESC LIMIT 10`, [days]),
  ]);
  // The built-in counter has no visitor identity at all, so visitors are unknown (null).
  const noVisitors = (rows) => rows.map((r) => ({ ...r, visitors: null }));
  return {
    source: 'builtin',
    days,
    generatedAt: new Date().toISOString(),
    totals: { views: t.rows[0].v, visitors: null },
    previous: { views: p.rows[0].v, visitors: null },
    daily: daily.rows.map((r) => ({ ...r, visitors: null })),
    topPages: noVisitors(pages.rows),
    topReferrers: noVisitors(refs.rows),
    devices: [],
    countries: [],
    events: null,
  };
}

adminRouter.get('/analytics', wrap(async (req, res) => {
  const days = clampDays(req.query.days);
  const status = {
    collecting: collectionEnabled() ? 'posthog' : 'builtin',
    reporting: reportingEnabled() ? 'posthog' : 'builtin',
    posthogUrl: reportingEnabled() ? `${posthog.appHost}/project/${encodeURIComponent(posthog.projectId)}` : null,
    trackedEvents: TRACKED_EVENTS,
  };
  if (reportingEnabled()) {
    try {
      return res.json({ ...(await posthogOverview(days)), status });
    } catch (err) {
      console.error('[admin] PostHog query failed', err);
      const fallback = await builtinOverview(days);
      return res.json({ ...fallback, status, warning: 'Could not reach PostHog, so this shows the built-in counter instead. Check POSTHOG_PROJECT_ID and POSTHOG_PERSONAL_API_KEY.' });
    }
  }
  res.json({ ...(await builtinOverview(days)), status });
}));

// ── contact messages ───────────────────────────────────────────────────────

adminRouter.get('/contact-messages', wrap(async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not configured' });
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const status = ['new', 'handled'].includes(req.query.status) ? req.query.status : null;
  const [{ rows }, counts] = await Promise.all([
    db.query(
      `SELECT id, name, email, type, message, status, created_at FROM contact_messages
       WHERE ($1::text IS NULL OR status = $1) ORDER BY created_at DESC LIMIT $2`,
      [status, limit],
    ),
    db.query(`SELECT status, count(*)::int AS n FROM contact_messages GROUP BY status`),
  ]);
  const byStatus = Object.fromEntries(counts.rows.map((r) => [r.status, r.n]));
  res.json({ messages: rows, counts: { new: byStatus.new ?? 0, handled: byStatus.handled ?? 0 } });
}));

adminRouter.patch('/contact-messages/:id', wrap(async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not configured' });
  const id = Number(req.params.id);
  const status = req.body?.status;
  if (!Number.isInteger(id) || !['new', 'handled'].includes(status)) {
    return res.status(400).json({ error: 'Invalid request' });
  }
  const { rowCount } = await db.query('UPDATE contact_messages SET status = $1 WHERE id = $2', [status, id]);
  if (!rowCount) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
}));


// ── SEO (DataForSEO snapshots) ─────────────────────────────────────────────

function seoMeta() {
  return {
    configured: seoEnabled(),
    target: seoConfig.target,
    locationCode: seoConfig.locationCode,
    languageCode: seoConfig.languageCode,
    keywordLimit: seoConfig.keywordLimit,
    autoRefreshDays: seoConfig.autoRefreshDays,
    refreshing: seoRefreshRunning(),
  };
}

adminRouter.get('/seo', wrap(async (_req, res) => {
  const meta = seoMeta();
  if (!db) return res.json({ ...meta, latest: null, history: [] });
  const [latestQ, historyQ] = await Promise.all([
    db.query(
      `SELECT id, created_at, trigger, cost, summary, data, errors FROM seo_snapshots
       WHERE target = $1 ORDER BY created_at DESC LIMIT 2`,
      [seoConfig.target],
    ),
    db.query(
      `SELECT id, created_at, trigger, cost, summary->'keywords' AS keywords, summary->'etv' AS etv,
              summary->'top3' AS top3, summary->'top10' AS top10, summary->'backlinks'->'referringDomains' AS referring_domains,
              summary->'keywordsAvailable' AS keywords_available, errors
       FROM seo_snapshots WHERE target = $1 ORDER BY created_at DESC LIMIT 52`,
      [seoConfig.target],
    ),
  ]);
  const [cur, prev] = latestQ.rows;
  let latest = null;
  if (cur) {
    // Only compare keyword lists when both snapshots actually fetched keywords.
    const prevKeywords = prev?.summary?.keywordsAvailable ? prev.data.keywords : null;
    const { keywords, lost } = compareKeywords(cur.data.keywords ?? [], prevKeywords);
    latest = {
      id: cur.id,
      createdAt: cur.created_at,
      trigger: cur.trigger,
      cost: Number(cur.cost),
      summary: cur.summary,
      previous: prev ? { id: prev.id, createdAt: prev.created_at, summary: prev.summary } : null,
      keywords,
      lost,
      pages: pagesFromKeywords(keywords),
      competitors: cur.data.competitors ?? [],
      errors: cur.errors ?? {},
    };
  }
  const nextAuto =
    meta.configured && meta.autoRefreshDays && cur
      ? new Date(new Date(cur.created_at).getTime() + meta.autoRefreshDays * 86_400_000).toISOString()
      : null;
  res.json({
    ...meta,
    nextAutoRefresh: nextAuto,
    latest,
    history: historyQ.rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      trigger: r.trigger,
      cost: Number(r.cost),
      keywords: r.keywords_available === false ? null : r.keywords,
      etv: r.keywords_available === false ? null : r.etv,
      top3: r.keywords_available === false ? null : r.top3,
      top10: r.keywords_available === false ? null : r.top10,
      referringDomains: r.referring_domains,
      failed: Object.keys(r.errors ?? {}),
    })),
  });
}));

adminRouter.post('/seo/refresh', wrap(async (_req, res) => {
  if (!seoEnabled()) {
    return res.status(400).json({ error: 'DataForSEO is not configured. Set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD.' });
  }
  if (seoRefreshRunning()) return res.status(409).json({ error: 'A refresh is already running. Please wait.' });
  const { rows } = await db.query(
    `SELECT created_at FROM seo_snapshots WHERE target = $1 AND trigger = 'manual' ORDER BY created_at DESC LIMIT 1`,
    [seoConfig.target],
  );
  const last = rows[0] ? new Date(rows[0].created_at).getTime() : 0;
  const wait = last + MANUAL_COOLDOWN_MS - Date.now();
  if (wait > 0) {
    return res.status(429).json({ error: `Fresh data was fetched recently. Try again in ${Math.ceil(wait / 60000)} minute(s).` });
  }
  try {
    const id = await refreshSeo('manual');
    res.status(201).json({ id });
  } catch (err) {
    console.error('[seo] manual refresh failed', err);
    res.status(502).json({ error: `DataForSEO: ${err.message}` });
  }
}));

adminRouter.get('/seo/snapshots/:id/raw', wrap(async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not configured' });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
  const { rows } = await db.query(
    `SELECT id, created_at, target, location_code, language_code, trigger, cost, errors, raw FROM seo_snapshots WHERE id = $1`,
    [id],
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  const day = new Date(rows[0].created_at).toISOString().slice(0, 10);
  res.set('Content-Disposition', `attachment; filename="dataforseo-${rows[0].target}-${day}-${id}.json"`);
  res.type('application/json').send(JSON.stringify(rows[0], null, 2));
}));


// ── professional directory moderation ──────────────────────────────────────

const LISTING_STATUSES = ['pending', 'approved', 'rejected', 'removed'];

adminRouter.get('/listings', wrap(async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not configured' });
  const status = LISTING_STATUSES.includes(req.query.status) ? req.query.status : null;
  const [{ rows }, counts] = await Promise.all([
    db.query(
      `SELECT l.id, l.status, l.data, l.published, l.owner_hidden, l.review_note, l.submitted_at, l.reviewed_at, l.created_at,
              u.email AS account_email, u.name AS account_name
       FROM professional_listings l JOIN users u ON u.id = l.user_id
       WHERE ($1::text IS NULL OR l.status = $1)
       ORDER BY (l.status = 'pending') DESC, l.submitted_at DESC LIMIT 500`,
      [status],
    ),
    db.query(`SELECT status, count(*)::int AS n FROM professional_listings GROUP BY status`),
  ]);
  res.json({
    listings: rows,
    counts: Object.fromEntries(LISTING_STATUSES.map((s) => [s, counts.rows.find((r) => r.status === s)?.n ?? 0])),
  });
}));

async function moderate(req, res, action) {
  if (!db) return res.status(503).json({ error: 'Database not configured' });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
  const note = String(req.body?.note ?? '').trim().slice(0, 1000);
  if ((action === 'reject' || action === 'remove') && !note) {
    return res.status(400).json({ error: 'Add a short note explaining why. The professional will see it.' });
  }
  const sql = {
    approve: `UPDATE professional_listings SET status = 'approved', published = data, review_note = NULL, reviewed_at = now() WHERE id = $1 RETURNING id, status`,
    reject: `UPDATE professional_listings SET status = 'rejected', review_note = $2, reviewed_at = now() WHERE id = $1 RETURNING id, status`,
    remove: `UPDATE professional_listings SET status = 'removed', published = NULL, review_note = $2, reviewed_at = now() WHERE id = $1 RETURNING id, status`,
  }[action];
  const { rows } = await db.query(sql, action === 'approve' ? [id] : [id, note]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true, listing: rows[0] });
}

adminRouter.post('/listings/:id/approve', wrap((req, res) => moderate(req, res, 'approve')));
adminRouter.post('/listings/:id/reject', wrap((req, res) => moderate(req, res, 'reject')));
adminRouter.post('/listings/:id/remove', wrap((req, res) => moderate(req, res, 'remove')));

adminRouter.use((_req, res) => res.status(404).json({ error: 'Not found' }));

adminRouter.use((err, _req, res, _next) => {
  console.error('[admin]', err);
  if (!res.headersSent) res.status(500).json({ error: 'Something went wrong.' });
});
