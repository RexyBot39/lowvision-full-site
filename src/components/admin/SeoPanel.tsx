import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Download, Search as SearchIcon, ChevronDown, ChevronUp } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { Card, Notice, StatTile } from './AdminUI';
import { fmt, nf } from './format';

// ── types (mirror server/admin-api.mjs + server/seo.mjs) ─────────────────────

interface Keyword {
  keyword: string;
  position: number;
  previousPosition: number | null;
  change: number | null;
  status: 'new' | 'up' | 'down' | 'same';
  url: string | null;
  volume: number | null;
  cpc: number | null;
  difficulty: number | null;
  intent: string | null;
  etv: number | null;
}
interface Backlinks {
  rank: number | null; backlinks: number | null; referringDomains: number | null;
  referringDomainsNofollow: number | null; brokenBacklinks: number | null; spamScore: number | null;
}
interface Summary {
  keywords: number; etv: number; top3: number; top10: number;
  distribution: { key: string; label: string; count: number }[];
  movement: { new: number; up: number; down: number; lost: number } | null;
  backlinks: Backlinks | null;
  keywordsAvailable: boolean;
}
interface SeoData {
  configured: boolean;
  target: string;
  locationCode: number;
  languageCode: string;
  keywordLimit: number;
  autoRefreshDays: number;
  refreshing: boolean;
  nextAutoRefresh: string | null;
  latest: null | {
    id: number;
    createdAt: string;
    trigger: string;
    cost: number;
    summary: Summary;
    previous: { id: number; createdAt: string; summary: Summary } | null;
    keywords: Keyword[];
    lost: { keyword: string; position: number; url: string | null; volume: number | null }[];
    pages: { path: string; keywords: number; top10: number; etv: number; best: string | null; bestPosition: number }[];
    competitors: { domain: string; sharedKeywords: number | null; avgPosition: number | null; keywords: number | null; etv: number | null }[];
    errors: Record<string, { message: string; code: number | string | null }>;
  };
  history: {
    id: number; createdAt: string; trigger: string; cost: number;
    keywords: number | null; etv: number | null; top3: number | null; top10: number | null;
    referringDomains: number | null; failed: string[];
  }[];
}

const SOURCE_LABELS: Record<string, string> = {
  rankedKeywords: 'Ranked keywords',
  competitors: 'Competitors',
  backlinks: 'Backlinks',
};
const LOCATIONS: Record<number, string> = { 2840: 'United States', 2124: 'Canada', 2826: 'United Kingdom', 2036: 'Australia' };

const money = (n: number) => `$${n.toFixed(n < 1 ? 3 : 2)}`;
const when = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
const pathOf = (url: string | null) => {
  if (!url) return '—';
  try {
    return new URL(url).pathname || '/';
  } catch {
    return url;
  }
};

// ── panel ────────────────────────────────────────────────────────────────────

export function SeoPanel() {
  const [data, setData] = useState<SeoData | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await api<SeoData>('/admin/seo'));
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load SEO data.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function refresh() {
    setRefreshing(true);
    setRefreshMsg('');
    setError('');
    try {
      await api('/admin/seo/refresh', { method: 'POST', body: {} });
      await load();
      setRefreshMsg('Fresh data fetched from DataForSEO.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The refresh failed.');
    } finally {
      setRefreshing(false);
    }
  }

  if (!data) {
    return error ? <Notice icon="warning" title="Couldn't load SEO data">{error}</Notice> : <p className="text-gray-600" role="status">Loading SEO data…</p>;
  }

  if (!data.configured) return <SeoSetupNotice />;

  const latest = data.latest;
  const location = LOCATIONS[data.locationCode] ?? `location ${data.locationCode}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => void refresh()}
          disabled={refreshing || data.refreshing}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
          {refreshing ? 'Fetching from DataForSEO…' : 'Fetch fresh data'}
        </button>
        {latest && (
          <a
            href={`/api/admin/seo/snapshots/${latest.id}/raw`}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 border border-gray-300 bg-white rounded-lg hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
          >
            <Download className="h-4 w-4" aria-hidden="true" /> Raw JSON
          </a>
        )}
        <p className="text-xs text-gray-500 sm:ml-auto" role="status">
          {refreshing
            ? 'This can take up to a minute.'
            : latest
              ? <>Google · {location} · {data.target} · snapshot {when(latest.createdAt)} ({latest.trigger}, cost {money(latest.cost)})</>
              : `Google · ${location} · ${data.target}`}
        </p>
      </div>
      <p className="text-xs text-gray-500 -mt-3">
        Each fetch is billed by DataForSEO (usually about $0.05–$0.20).{' '}
        {data.autoRefreshDays
          ? <>A new snapshot is also taken automatically every {data.autoRefreshDays} day{data.autoRefreshDays === 1 ? '' : 's'}{data.nextAutoRefresh ? <> (next after {when(data.nextAutoRefresh)})</> : null}.</>
          : 'Automatic snapshots are off.'}
      </p>

      {refreshMsg && <p role="status" className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{refreshMsg}</p>}
      {error && <Notice icon="warning" title="DataForSEO request failed">{error}</Notice>}

      {!latest ? (
        <Card title="No SEO data yet">
          <p className="text-sm text-gray-600">
            Click <strong>Fetch fresh data</strong> to take the first snapshot of how {data.target} ranks on Google ({location}).
          </p>
        </Card>
      ) : (
        <SnapshotView data={data} latest={latest} />
      )}
    </div>
  );
}

function SeoSetupNotice() {
  return (
    <Notice icon="info" title="Connect DataForSEO to see SEO data">
      <p className="mb-2">Add these variables to the web service and redeploy:</p>
      <ul className="list-disc pl-5 space-y-0.5 font-mono text-xs">
        <li>DATAFORSEO_LOGIN (your API login, from the DataForSEO dashboard)</li>
        <li>DATAFORSEO_PASSWORD (your API password, not your account password)</li>
        <li>SEO_LOCATION_CODE (optional; 2840 = United States, 2124 = Canada)</li>
      </ul>
    </Notice>
  );
}

function SnapshotView({ data, latest }: { data: SeoData; latest: NonNullable<SeoData['latest']> }) {
  const s = latest.summary;
  const prev = latest.previous?.summary;
  const comparable = !!prev?.keywordsAvailable;
  const failed = Object.entries(latest.errors);

  const movement = useMemo(() => {
    if (latest.previous && comparable) {
      const count = (st: Keyword['status']) => latest.keywords.filter((k) => k.status === st).length;
      return { new: count('new'), up: count('up'), down: count('down'), lost: latest.lost.length, since: 'since last snapshot' };
    }
    return s.movement ? { ...s.movement, since: "per DataForSEO's last update" } : null;
  }, [latest, comparable, s.movement]);

  return (
    <div className="space-y-6">
      {failed.length > 0 && (
        <Notice icon="warning" title="Part of this snapshot is missing">
          <ul className="list-disc pl-5 space-y-0.5">
            {failed.map(([name, e]) => (
              <li key={name}>
                <strong>{SOURCE_LABELS[name] ?? name}:</strong> {e.message}
                {e.code === 40204 && ' (your DataForSEO plan may not include this API)'}
              </li>
            ))}
          </ul>
        </Notice>
      )}

      {s.keywordsAvailable && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile label="Ranking keywords" value={s.keywords} previous={comparable ? prev?.keywords : undefined} compareLabel="vs last snapshot" />
          <StatTile label="Est. monthly visits from Google" value={s.etv} previous={comparable ? prev?.etv : undefined} compareLabel="vs last snapshot" note="DataForSEO traffic estimate" />
          <StatTile label="Keywords in top 3" value={s.top3} previous={comparable ? prev?.top3 : undefined} compareLabel="vs last snapshot" />
          <StatTile label="Keywords on page 1" value={s.top10} previous={comparable ? prev?.top10 : undefined} compareLabel="vs last snapshot" />
        </div>
      )}

      {s.backlinks && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile label="Referring domains" value={s.backlinks.referringDomains} previous={prev?.backlinks?.referringDomains} compareLabel="vs last snapshot" />
          <StatTile label="Backlinks" value={s.backlinks.backlinks} previous={prev?.backlinks?.backlinks} compareLabel="vs last snapshot" />
          <StatTile label="Domain rank" value={s.backlinks.rank} note="DataForSEO rank, 0–1,000" />
          <StatTile label="Broken backlinks" value={s.backlinks.brokenBacklinks} note={s.backlinks.spamScore != null ? `Spam score ${s.backlinks.spamScore}` : undefined} />
        </div>
      )}

      {s.keywordsAvailable && (
        <div className="grid lg:grid-cols-2 gap-6">
          <Card title="Where the site ranks" subtitle="Keywords by Google position">
            <Distribution rows={s.distribution} />
          </Card>
          <Card title="Movement" subtitle={movement?.since}>
            {movement ? <Movement m={movement} /> : <p className="text-sm text-gray-500">Movement appears after the second snapshot.</p>}
          </Card>
        </div>
      )}

      {s.keywordsAvailable && <KeywordsTable keywords={latest.keywords} limit={data.keywordLimit} total={s.keywords} />}

      {latest.lost.length > 0 && <LostKeywords lost={latest.lost} />}

      <div className="grid lg:grid-cols-2 gap-6">
        {s.keywordsAvailable && <PagesTable pages={latest.pages} />}
        {!latest.errors.competitors && <CompetitorsTable rows={latest.competitors} />}
      </div>

      <HistoryTable history={data.history} />
    </div>
  );
}

// ── pieces ───────────────────────────────────────────────────────────────────

function Distribution({ rows }: { rows: Summary['distribution'] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Number of keywords in each range of Google positions</caption>
      <thead className="sr-only">
        <tr><th scope="col">Position</th><th scope="col">Keywords</th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <th scope="row" className="py-1.5 pr-3 text-left font-normal text-gray-700 w-20 whitespace-nowrap">{r.label}</th>
            <td className="py-1.5">
              <div className="flex items-center gap-3">
                <div className="flex-1 h-3 rounded-r bg-gray-100" aria-hidden="true">
                  <div className="h-3 rounded-r bg-blue-600" style={{ width: `${(r.count / max) * 100}%` }} />
                </div>
                <span className="w-12 text-right tabular-nums font-medium text-gray-900">{fmt(r.count)}</span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Movement({ m }: { m: { new: number; up: number; down: number; lost: number } }) {
  const items = [
    { label: 'New', value: m.new, sym: '+', cls: 'text-blue-800' },
    { label: 'Improved', value: m.up, sym: '▲', cls: 'text-green-800' },
    { label: 'Declined', value: m.down, sym: '▼', cls: 'text-red-800' },
    { label: 'Lost', value: m.lost, sym: '−', cls: 'text-gray-700' },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3">
      {items.map((i) => (
        <div key={i.label} className="rounded-lg bg-gray-50 px-4 py-3">
          <dt className="text-sm text-gray-600"><span aria-hidden="true" className={`${i.cls} font-bold mr-1`}>{i.sym}</span>{i.label}</dt>
          <dd className="text-2xl font-bold text-gray-900 tabular-nums">{fmt(i.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function Change({ k }: { k: Keyword }) {
  if (k.status === 'new') return <span className="text-blue-800 font-medium">New</span>;
  if (k.change == null || k.change === 0) return <span className="text-gray-400" aria-label="No change">—</span>;
  const up = k.change > 0;
  return (
    <span className={`font-medium ${up ? 'text-green-800' : 'text-red-800'}`}>
      <span aria-hidden="true">{up ? '▲' : '▼'} {Math.abs(k.change)}</span>
      <span className="sr-only">{up ? 'up' : 'down'} {Math.abs(k.change)}</span>
    </span>
  );
}

type SortKey = 'keyword' | 'position' | 'change' | 'volume' | 'etv';
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'top3', label: 'Top 3' },
  { key: 'top10', label: 'Page 1' },
  { key: 'up', label: 'Improved' },
  { key: 'down', label: 'Declined' },
  { key: 'new', label: 'New' },
] as const;
type FilterKey = (typeof FILTERS)[number]['key'];

function KeywordsTable({ keywords, limit, total }: { keywords: Keyword[]; limit: number; total: number }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'etv', dir: 'desc' });
  const [shown, setShown] = useState(50);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = keywords.filter((k) => {
      if (needle && !k.keyword.toLowerCase().includes(needle) && !(k.url ?? '').toLowerCase().includes(needle)) return false;
      if (filter === 'top3') return k.position <= 3;
      if (filter === 'top10') return k.position <= 10;
      if (filter === 'up' || filter === 'down' || filter === 'new') return k.status === filter;
      return true;
    });
    const val = (k: Keyword): number | string => {
      switch (sort.key) {
        case 'keyword': return k.keyword;
        case 'position': return k.position;
        case 'change': return k.change ?? (k.status === 'new' ? Number.MAX_SAFE_INTEGER : 0);
        case 'volume': return k.volume ?? -1;
        case 'etv': return k.etv ?? -1;
      }
    };
    out.sort((a, b) => {
      const x = val(a), y = val(b);
      const c = typeof x === 'string' ? x.localeCompare(String(y)) : x - (y as number);
      return sort.dir === 'asc' ? c : -c;
    });
    return out;
  }, [keywords, q, filter, sort]);

  useEffect(() => setShown(50), [q, filter, sort]);

  const header = (key: SortKey, label: string, align: 'left' | 'right' = 'right') => {
    const active = sort.key === key;
    return (
      <th scope="col" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={`pb-2 font-medium whitespace-nowrap ${align === 'left' ? 'text-left' : 'text-right pl-3'}`}>
        <button
          onClick={() => setSort({ key, dir: active ? (sort.dir === 'asc' ? 'desc' : 'asc') : key === 'keyword' || key === 'position' ? 'asc' : 'desc' })}
          className={`inline-flex items-center gap-0.5 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 rounded ${active ? 'text-gray-900' : ''}`}
        >
          {label}
          {active && (sort.dir === 'asc' ? <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />)}
        </button>
      </th>
    );
  };

  return (
    <Card
      title="Ranking keywords"
      subtitle={total > keywords.length ? `Showing the ${nf.format(keywords.length)} most valuable of ${nf.format(total)} (limit ${nf.format(limit)})` : `${nf.format(keywords.length)} keywords`}
    >
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <label className="relative flex-1 min-w-[12rem] max-w-sm">
          <span className="sr-only">Search keywords or pages</span>
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search keywords or pages"
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </label>
        <div role="group" aria-label="Filter keywords" className="inline-flex flex-wrap rounded-lg border border-gray-300 bg-white p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={`px-2.5 py-1.5 text-sm font-medium rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${
                filter === f.key ? 'bg-blue-700 text-white' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <p className="sr-only" role="status">{rows.length} keywords match</p>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">No keywords match.</p>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full text-sm min-w-[40rem]">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-100">
                {header('keyword', 'Keyword', 'left')}
                {header('position', 'Position')}
                {header('change', 'Change')}
                {header('volume', 'Searches/mo')}
                {header('etv', 'Est. visits')}
                <th scope="col" className="pb-2 pl-4 font-medium text-left">Page</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, shown).map((k) => (
                <tr key={k.keyword} className="border-b border-gray-50 last:border-0">
                  <th scope="row" className="py-2 pr-3 text-left font-normal text-gray-900">{k.keyword}</th>
                  <td className="py-2 text-right tabular-nums font-semibold text-gray-900">{k.position}</td>
                  <td className="py-2 text-right tabular-nums"><Change k={k} /></td>
                  <td className="py-2 text-right tabular-nums text-gray-700">{fmt(k.volume)}</td>
                  <td className="py-2 text-right tabular-nums text-gray-700">{k.etv == null ? '—' : nf.format(Math.round(k.etv))}</td>
                  <td className="py-2 pl-4 max-w-[16rem]">
                    {k.url ? (
                      <a href={pathOf(k.url)} className="block truncate text-blue-700 hover:underline" title={k.url}>{pathOf(k.url)}</a>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > shown && (
        <button
          onClick={() => setShown((n) => n + 100)}
          className="mt-3 text-sm font-medium text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 rounded"
        >
          Show more ({nf.format(rows.length - shown)} remaining)
        </button>
      )}
    </Card>
  );
}

function LostKeywords({ lost }: { lost: NonNullable<SeoData['latest']>['lost'] }) {
  const [open, setOpen] = useState(false);
  return (
    <Card title={`Keywords no longer ranking (${nf.format(lost.length)})`} subtitle="Ranked in the previous snapshot but not this one">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-sm font-medium text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 rounded"
      >
        {open ? 'Hide list' : 'Show list'}
      </button>
      {open && (
        <div className="relative overflow-x-auto mt-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-100">
                <th scope="col" className="pb-2 text-left font-medium">Keyword</th>
                <th scope="col" className="pb-2 text-right font-medium">Was at</th>
                <th scope="col" className="pb-2 text-right font-medium">Searches/mo</th>
                <th scope="col" className="pb-2 pl-4 text-left font-medium">Page</th>
              </tr>
            </thead>
            <tbody>
              {lost.slice(0, 200).map((k) => (
                <tr key={k.keyword} className="border-b border-gray-50 last:border-0">
                  <th scope="row" className="py-1.5 text-left font-normal text-gray-900">{k.keyword}</th>
                  <td className="py-1.5 text-right tabular-nums">{k.position}</td>
                  <td className="py-1.5 text-right tabular-nums text-gray-700">{fmt(k.volume)}</td>
                  <td className="py-1.5 pl-4 text-gray-700 truncate max-w-[14rem]">{pathOf(k.url)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function PagesTable({ pages }: { pages: NonNullable<SeoData['latest']>['pages'] }) {
  return (
    <Card title="Top ranking pages" subtitle="By estimated visits from Google">
      {pages.length === 0 ? (
        <p className="text-sm text-gray-500">No ranking pages yet.</p>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-100">
                <th scope="col" className="pb-2 text-left font-medium">Page</th>
                <th scope="col" className="pb-2 pl-3 text-right font-medium whitespace-nowrap">Keywords</th>
                <th scope="col" className="pb-2 pl-3 text-right font-medium whitespace-nowrap">Page 1</th>
                <th scope="col" className="pb-2 pl-3 text-right font-medium whitespace-nowrap">Est. visits</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((p) => (
                <tr key={p.path} className="border-b border-gray-50 last:border-0">
                  <td className="py-2 pr-3 max-w-0 w-full">
                    <a href={p.path} className="block truncate text-gray-800 hover:text-blue-700 hover:underline" title={p.path}>{p.path}</a>
                    {p.best && <span className="block truncate text-xs text-gray-500">Best: “{p.best}” at #{p.bestPosition}</span>}
                  </td>
                  <td className="py-2 pl-3 text-right tabular-nums text-gray-700">{nf.format(p.keywords)}</td>
                  <td className="py-2 pl-3 text-right tabular-nums text-gray-700">{nf.format(p.top10)}</td>
                  <td className="py-2 pl-3 text-right tabular-nums font-medium text-gray-900">{nf.format(p.etv)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function CompetitorsTable({ rows }: { rows: NonNullable<SeoData['latest']>['competitors'] }) {
  return (
    <Card title="Competing sites" subtitle="Sites ranking for the same keywords">
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">No competitors found yet. This fills in as the site ranks for more keywords.</p>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-100">
                <th scope="col" className="pb-2 text-left font-medium">Site</th>
                <th scope="col" className="pb-2 text-right font-medium">Shared keywords</th>
                <th scope="col" className="pb-2 text-right font-medium">Avg. position</th>
                <th scope="col" className="pb-2 text-right font-medium">Their est. visits</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.domain} className="border-b border-gray-50 last:border-0">
                  <th scope="row" className="py-2 pr-3 text-left font-normal text-gray-900 truncate max-w-[12rem]">{c.domain}</th>
                  <td className="py-2 text-right tabular-nums text-gray-700">{fmt(c.sharedKeywords)}</td>
                  <td className="py-2 text-right tabular-nums text-gray-700">{c.avgPosition ?? '—'}</td>
                  <td className="py-2 text-right tabular-nums text-gray-700">{fmt(c.etv)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function HistoryTable({ history }: { history: SeoData['history'] }) {
  return (
    <Card title="Snapshot history" subtitle="Each row is one fetch from DataForSEO">
      <div className="relative overflow-x-auto">
        <table className="w-full text-sm min-w-[36rem]">
          <thead>
            <tr className="text-xs text-gray-500 border-b border-gray-100">
              <th scope="col" className="pb-2 text-left font-medium">Date</th>
              <th scope="col" className="pb-2 text-right font-medium">Keywords</th>
              <th scope="col" className="pb-2 text-right font-medium">Page 1</th>
              <th scope="col" className="pb-2 text-right font-medium">Est. visits</th>
              <th scope="col" className="pb-2 text-right font-medium">Ref. domains</th>
              <th scope="col" className="pb-2 text-right font-medium">Cost</th>
              <th scope="col" className="pb-2 pl-4 text-left font-medium"><span className="sr-only">Download</span></th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.id} className="border-b border-gray-50 last:border-0">
                <th scope="row" className="py-2 text-left font-normal text-gray-800 whitespace-nowrap">
                  {when(h.createdAt)} <span className="text-xs text-gray-500">({h.trigger})</span>
                  {h.failed.length > 0 && <span className="block text-xs text-amber-800">Missing: {h.failed.map((f) => SOURCE_LABELS[f] ?? f).join(', ')}</span>}
                </th>
                <td className="py-2 text-right tabular-nums">{fmt(h.keywords)}</td>
                <td className="py-2 text-right tabular-nums">{fmt(h.top10)}</td>
                <td className="py-2 text-right tabular-nums">{fmt(h.etv)}</td>
                <td className="py-2 text-right tabular-nums">{fmt(h.referringDomains)}</td>
                <td className="py-2 text-right tabular-nums text-gray-600">{money(h.cost)}</td>
                <td className="py-2 pl-4">
                  <a href={`/api/admin/seo/snapshots/${h.id}/raw`} className="text-blue-700 hover:underline whitespace-nowrap">
                    Raw JSON<span className="sr-only"> for {when(h.createdAt)}</span>
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
