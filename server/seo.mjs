/**
 * SEO data from DataForSEO (https://dataforseo.com), for the /admin SEO tab.
 *
 * DataForSEO bills per request, so the dashboard never calls it directly.
 * Instead this module fetches a *snapshot* (on demand from the dashboard, and
 * automatically every SEO_AUTO_REFRESH_DAYS), stores it in Postgres
 * (seo_snapshots), and the dashboard reads the stored snapshots. Each
 * snapshot keeps DataForSEO's raw responses so they can be downloaded or
 * re-parsed later, plus a normalized copy for the dashboard.
 *
 * Endpoints used (all "live", one task each):
 *   dataforseo_labs/google/ranked_keywords/live    keywords the site ranks for
 *   dataforseo_labs/google/competitors_domain/live sites competing for the same keywords
 *   backlinks/summary/live                         backlink totals (needs a Backlinks
 *                                                  subscription; skipped if not active)
 *
 * Environment:
 *   DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD   API credentials (required)
 *   SEO_TARGET             domain to analyse (default: CANONICAL_HOST or lowvisionnavigator.org)
 *   SEO_LOCATION_CODE      DataForSEO location code (default 2840 = United States)
 *   SEO_LANGUAGE_CODE      default "en"
 *   SEO_KEYWORD_LIMIT      max ranked keywords per snapshot, 1–1000 (default 1000)
 *   SEO_AUTO_REFRESH_DAYS  automatic snapshot interval in days (default 7; 0 = off)
 *   DATAFORSEO_API_HOST    optional override (default https://api.dataforseo.com)
 */

import { db } from './db.mjs';

const num = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));

export const seoConfig = {
  login: process.env.DATAFORSEO_LOGIN?.trim() || '',
  password: process.env.DATAFORSEO_PASSWORD?.trim() || '',
  host: (process.env.DATAFORSEO_API_HOST || 'https://api.dataforseo.com').replace(/\/+$/, ''),
  target: (process.env.SEO_TARGET || process.env.CANONICAL_HOST || 'lowvisionnavigator.org')
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, ''),
  locationCode: num(process.env.SEO_LOCATION_CODE, 2840),
  languageCode: process.env.SEO_LANGUAGE_CODE?.trim() || 'en',
  keywordLimit: Math.min(Math.max(Math.trunc(num(process.env.SEO_KEYWORD_LIMIT, 1000)), 1), 1000),
  autoRefreshDays: Math.max(0, num(process.env.SEO_AUTO_REFRESH_DAYS, 7)),
};

export const seoEnabled = () => !!(seoConfig.login && seoConfig.password && db);

/** Minimum time between manual refreshes, to avoid accidental spend. */
export const MANUAL_COOLDOWN_MS = 10 * 60 * 1000;

// ── DataForSEO client ──────────────────────────────────────────────────────

class DataForSeoError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

/** POST one task to a DataForSEO endpoint. Returns { result, cost, raw }. */
async function dfs(path, task) {
  const auth = Buffer.from(`${seoConfig.login}:${seoConfig.password}`).toString('base64');
  const r = await fetch(`${seoConfig.host}/v3/${path}`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([task]),
    signal: AbortSignal.timeout(120_000),
  });
  const raw = await r.json().catch(() => null);
  if (!r.ok || !raw) {
    const msg = raw?.status_message || `HTTP ${r.status}`;
    throw new DataForSeoError(r.status === 401 ? 'DataForSEO rejected the login or password.' : msg, raw?.status_code ?? r.status);
  }
  if (raw.status_code !== 20000) throw new DataForSeoError(raw.status_message || 'DataForSEO error', raw.status_code);
  const t = raw.tasks?.[0];
  if (!t || t.status_code !== 20000) {
    throw new DataForSeoError(t?.status_message || 'DataForSEO task failed', t?.status_code);
  }
  return { result: t.result?.[0] ?? null, cost: Number(raw.cost) || 0, raw };
}

// ── normalization ──────────────────────────────────────────────────────────

const BUCKETS = [
  { key: '1', label: '#1', from: 1, to: 1 },
  { key: '2-3', label: '2–3', from: 2, to: 3 },
  { key: '4-10', label: '4–10', from: 4, to: 10 },
  { key: '11-20', label: '11–20', from: 11, to: 20 },
  { key: '21-50', label: '21–50', from: 21, to: 50 },
  { key: '51-100', label: '51–100', from: 51, to: 100 },
];

function normalizeKeywords(result) {
  const items = Array.isArray(result?.items) ? result.items : [];
  const keywords = [];
  for (const it of items) {
    const kd = it?.keyword_data ?? {};
    const serp = it?.ranked_serp_element?.serp_item ?? {};
    const keyword = kd.keyword;
    const position = serp.rank_group ?? serp.rank_absolute;
    if (!keyword || position == null) continue;
    const rc = serp.rank_changes ?? {};
    keywords.push({
      keyword: String(keyword),
      position: Number(position),
      // DataForSEO's own change estimate (absolute ranks), used when we have no earlier snapshot.
      dfsChange:
        rc.previous_rank_absolute != null && serp.rank_absolute != null
          ? Number(rc.previous_rank_absolute) - Number(serp.rank_absolute)
          : null,
      dfsNew: rc.is_new === true,
      url: serp.url ?? null,
      volume: kd.keyword_info?.search_volume ?? null,
      cpc: kd.keyword_info?.cpc ?? null,
      difficulty: kd.keyword_properties?.keyword_difficulty ?? null,
      intent: kd.search_intent_info?.main_intent ?? null,
      etv: serp.etv ?? null,
    });
  }
  return keywords;
}

function summarize(result, keywords) {
  const o = result?.metrics?.organic ?? null;
  const sum = (...keys) => keys.reduce((n, k) => n + (Number(o?.[k]) || 0), 0);
  const distribution = o
    ? [
        sum('pos_1'),
        sum('pos_2_3'),
        sum('pos_4_10'),
        sum('pos_11_20'),
        sum('pos_21_30', 'pos_31_40', 'pos_41_50'),
        sum('pos_51_60', 'pos_61_70', 'pos_71_80', 'pos_81_90', 'pos_91_100'),
      ]
    : BUCKETS.map((b) => keywords.filter((k) => k.position >= b.from && k.position <= b.to).length);
  return {
    keywords: Number(o?.count ?? result?.total_count ?? keywords.length) || 0,
    etv: o?.etv != null ? Math.round(Number(o.etv)) : Math.round(keywords.reduce((n, k) => n + (Number(k.etv) || 0), 0)),
    top3: distribution[0] + distribution[1],
    top10: distribution[0] + distribution[1] + distribution[2],
    distribution: BUCKETS.map((b, i) => ({ key: b.key, label: b.label, count: distribution[i] })),
    movement: o
      ? { new: Number(o.is_new) || 0, up: Number(o.is_up) || 0, down: Number(o.is_down) || 0, lost: Number(o.is_lost) || 0 }
      : null,
  };
}

function normalizeCompetitors(result) {
  const items = Array.isArray(result?.items) ? result.items : [];
  return items
    .filter((c) => c?.domain && c.domain.replace(/^www\./, '') !== seoConfig.target)
    .slice(0, 15)
    .map((c) => ({
      domain: String(c.domain),
      sharedKeywords: c.intersections ?? null,
      avgPosition: c.avg_position != null ? Math.round(Number(c.avg_position) * 10) / 10 : null,
      keywords: c.full_domain_metrics?.organic?.count ?? null,
      etv: c.full_domain_metrics?.organic?.etv != null ? Math.round(Number(c.full_domain_metrics.organic.etv)) : null,
    }));
}

function normalizeBacklinks(result) {
  if (!result) return null;
  return {
    rank: result.rank ?? null,
    backlinks: result.backlinks ?? null,
    referringDomains: result.referring_domains ?? null,
    referringDomainsNofollow: result.referring_domains_nofollow ?? null,
    brokenBacklinks: result.broken_backlinks ?? null,
    spamScore: result.backlinks_spam_score ?? null,
  };
}

// ── snapshots ──────────────────────────────────────────────────────────────

let running = null; // in-process guard; an advisory lock guards across instances

/**
 * Fetch fresh data from DataForSEO and store it as a snapshot.
 * Returns the new snapshot id. Throws if every request failed.
 */
export function refreshSeo(trigger) {
  running ??= (async () => {
    const client = await db.connect();
    try {
      const { rows: lock } = await client.query('SELECT pg_try_advisory_lock(727301) AS ok');
      if (!lock[0].ok) throw new DataForSeoError('An SEO refresh is already running.', 'busy');
      try {
        return await fetchAndStore(trigger);
      } finally {
        await client.query('SELECT pg_advisory_unlock(727301)');
      }
    } finally {
      client.release();
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

export const seoRefreshRunning = () => !!running;

async function fetchAndStore(trigger) {
  const base = { target: seoConfig.target, location_code: seoConfig.locationCode, language_code: seoConfig.languageCode };
  const calls = {
    rankedKeywords: dfs('dataforseo_labs/google/ranked_keywords/live', { ...base, limit: seoConfig.keywordLimit }),
    competitors: dfs('dataforseo_labs/google/competitors_domain/live', { ...base, limit: 20, exclude_top_domains: true }),
    backlinks: dfs('backlinks/summary/live', { target: seoConfig.target, include_subdomains: true }),
  };
  const names = Object.keys(calls);
  const settled = await Promise.allSettled(Object.values(calls));

  const raw = {};
  const errors = {};
  const results = {};
  let cost = 0;
  settled.forEach((s, i) => {
    const name = names[i];
    if (s.status === 'fulfilled') {
      raw[name] = s.value.raw;
      results[name] = s.value.result;
      cost += s.value.cost;
    } else {
      errors[name] = { message: s.reason?.message ?? String(s.reason), code: s.reason?.code ?? null };
    }
  });

  if (!results.rankedKeywords && !results.competitors && !results.backlinks) {
    // Nothing usable; don't store an empty snapshot. Report the most informative error.
    const first = errors.rankedKeywords ?? Object.values(errors)[0];
    throw new DataForSeoError(first?.message ?? 'DataForSEO returned no data', first?.code);
  }

  const keywords = normalizeKeywords(results.rankedKeywords);
  const data = {
    keywords,
    competitors: normalizeCompetitors(results.competitors),
    backlinks: normalizeBacklinks(results.backlinks),
  };
  const summary = {
    ...summarize(results.rankedKeywords, keywords),
    backlinks: data.backlinks,
    keywordsAvailable: !!results.rankedKeywords,
  };

  const { rows } = await db.query(
    `INSERT INTO seo_snapshots (target, location_code, language_code, trigger, cost, summary, data, raw, errors)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [seoConfig.target, seoConfig.locationCode, seoConfig.languageCode, trigger, cost, summary, data, raw, errors],
  );
  console.log(`[seo] snapshot ${rows[0].id} stored (${trigger}, ${keywords.length} keywords, $${cost.toFixed(4)})`);
  return rows[0].id;
}

/** Add change-vs-previous-snapshot to each keyword, and list keywords that dropped out. */
export function compareKeywords(current, previous) {
  const prev = new Map((previous ?? []).map((k) => [k.keyword, k]));
  const seen = new Set();
  const keywords = current.map((k) => {
    seen.add(k.keyword);
    const p = prev.get(k.keyword);
    let change = null;
    let status = 'same';
    if (previous) {
      if (!p) status = 'new';
      else change = p.position - k.position;
    } else {
      change = k.dfsChange;
      if (k.dfsNew) status = 'new';
    }
    if (status !== 'new' && change != null) status = change > 0 ? 'up' : change < 0 ? 'down' : 'same';
    return { ...k, change, status, previousPosition: p?.position ?? null };
  });
  const lost = previous ? previous.filter((k) => !seen.has(k.keyword)) : [];
  return { keywords, lost };
}

/** Keywords grouped by ranking page. */
export function pagesFromKeywords(keywords) {
  const pages = new Map();
  for (const k of keywords) {
    if (!k.url) continue;
    let path = k.url;
    try {
      path = new URL(k.url).pathname || '/';
    } catch {
      /* keep as is */
    }
    const p = pages.get(path) ?? { path, keywords: 0, top10: 0, etv: 0, best: null, bestPosition: Infinity };
    p.keywords += 1;
    if (k.position <= 10) p.top10 += 1;
    p.etv += Number(k.etv) || 0;
    if (k.position < p.bestPosition) {
      p.bestPosition = k.position;
      p.best = k.keyword;
    }
    pages.set(path, p);
  }
  return [...pages.values()]
    .map((p) => ({ ...p, etv: Math.round(p.etv) }))
    .sort((a, b) => b.etv - a.etv || b.keywords - a.keywords)
    .slice(0, 25);
}

// ── scheduler ──────────────────────────────────────────────────────────────

export function startSeoScheduler() {
  if (!seoEnabled() || !seoConfig.autoRefreshDays) return;
  let lastFailure = 0;
  const check = async () => {
    if (Date.now() - lastFailure < 86_400_000) return; // after a failure, retry once a day
    try {
      const { rows } = await db.query(
        `SELECT created_at FROM seo_snapshots WHERE target = $1 ORDER BY created_at DESC LIMIT 1`,
        [seoConfig.target],
      );
      const last = rows[0]?.created_at ? new Date(rows[0].created_at).getTime() : 0;
      if (Date.now() - last >= seoConfig.autoRefreshDays * 86_400_000 && !running) {
        await refreshSeo('scheduled');
      }
    } catch (err) {
      lastFailure = Date.now();
      console.error('[seo] scheduled refresh failed (retrying in 24h):', err.message);
    }
  };
  // First check a minute after startup, then hourly.
  setTimeout(check, 60_000).unref();
  setInterval(check, 60 * 60 * 1000).unref();
  console.log(`[seo] automatic DataForSEO refresh every ${seoConfig.autoRefreshDays} day(s) for ${seoConfig.target}`);
}
