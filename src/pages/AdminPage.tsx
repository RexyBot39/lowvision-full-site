import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BarChart3, Mail, RefreshCw, ExternalLink, CheckCircle, Inbox, Search } from 'lucide-react';
import { Card, Notice, StatTile } from '../components/admin/AdminUI';
import { fmt, nf, niceTicks, useWidth } from '../components/admin/format';
import { SeoPanel } from '../components/admin/SeoPanel';
import { PageSEO } from '../components/seo/PageSEO';
import { useAuth } from '../contexts/AuthContext';
import { api, ApiError } from '../lib/api';

// ── types (mirror server/admin-api.mjs) ──────────────────────────────────────

interface Row { key: string; views: number; visitors: number | null }
interface DayRow { day: string; views: number; visitors: number | null }
interface Analytics {
  source: 'posthog' | 'builtin';
  days: number;
  generatedAt: string;
  totals: { views: number; visitors: number | null };
  previous: { views: number; visitors: number | null };
  daily: DayRow[];
  topPages: Row[];
  topReferrers: Row[];
  devices: Row[];
  countries: Row[];
  events: Record<string, number> | null;
  warning?: string;
  status: { collecting: 'posthog' | 'builtin'; reporting: 'posthog' | 'builtin'; posthogUrl: string | null };
}
interface ContactMessage {
  id: number; name: string; email: string; type: string; message: string;
  status: 'new' | 'handled'; created_at: string;
}

type Tab = 'analytics' | 'seo' | 'messages';
const RANGES = [7, 30, 90] as const;
const TYPE_LABELS: Record<string, string> = {
  'incorrect-listing': 'Incorrect listing',
  suggest: 'Suggest a resource',
  help: 'Help finding services',
  accessibility: 'Accessibility issue',
  other: 'Other',
};

const fmtDay = (iso: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', opts);

// ── page ─────────────────────────────────────────────────────────────────────

export function AdminPage() {
  const { user, loading } = useAuth();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab');
  const tab: Tab = tabParam === 'messages' || tabParam === 'seo' ? tabParam : 'analytics';
  const [newCount, setNewCount] = useState<number | null>(null);

  const setTab = (t: Tab) => {
    const next = new URLSearchParams(params);
    if (t === 'analytics') next.delete('tab'); else next.set('tab', t);
    setParams(next, { replace: true });
  };

  return (
    <div className="bg-gray-50 min-h-[70vh]">
      <PageSEO title="Admin Dashboard" description="Site analytics and contact messages." noIndex />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-3 mb-6">
          <BarChart3 className="h-7 w-7 text-blue-700" aria-hidden="true" />
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        </div>

        {loading ? (
          <p className="text-gray-600" role="status">Checking your account…</p>
        ) : !user ? (
          <Notice icon="info" title="Sign in to continue">
            The admin dashboard is only available to admin accounts.{' '}
            <Link to="/login?redirectTo=/admin" className="text-blue-700 font-medium underline">Sign in</Link>
          </Notice>
        ) : !user.isAdmin ? (
          <Notice icon="warning" title="This account isn't an admin">
            You're signed in as {user.email}. To give an account access, add its email address to the{' '}
            <code className="font-mono text-sm">ADMIN_EMAILS</code> variable on the web service and redeploy.
          </Notice>
        ) : (
          <>
            <div role="tablist" aria-label="Admin sections" className="flex gap-1 border-b border-gray-200 mb-6">
              <TabButton id="analytics" active={tab === 'analytics'} onSelect={() => setTab('analytics')}>
                <BarChart3 className="h-4 w-4" aria-hidden="true" /> Analytics
              </TabButton>
              <TabButton id="seo" active={tab === 'seo'} onSelect={() => setTab('seo')}>
                <Search className="h-4 w-4" aria-hidden="true" /> SEO
              </TabButton>
              <TabButton id="messages" active={tab === 'messages'} onSelect={() => setTab('messages')}>
                <Mail className="h-4 w-4" aria-hidden="true" /> Messages
                {newCount ? (
                  <span className="ml-1 rounded-full bg-blue-700 text-white text-xs font-semibold px-2 py-0.5">
                    {newCount}<span className="sr-only"> new</span>
                  </span>
                ) : null}
              </TabButton>
            </div>
            <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
              {tab === 'analytics' && <AnalyticsPanel />}
              {tab === 'seo' && <SeoPanel />}
              {tab === 'messages' && <MessagesPanel onCounts={setNewCount} />}
            </div>
            {tab !== 'messages' && <MessageCountLoader onCounts={setNewCount} />}
          </>
        )}
      </div>
    </div>
  );
}

function TabButton({ id, active, onSelect, children }: { id: string; active: boolean; onSelect: () => void; children: React.ReactNode }) {
  return (
    <button
      role="tab"
      id={`tab-${id}`}
      aria-selected={active}
      aria-controls={`panel-${id}`}
      onClick={onSelect}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 rounded-t-md ${
        active ? 'border-blue-700 text-blue-800' : 'border-transparent text-gray-600 hover:text-gray-900'
      }`}
    >
      {children}
    </button>
  );
}

function MessageCountLoader({ onCounts }: { onCounts: (n: number | null) => void }) {
  useEffect(() => {
    api<{ counts: { new: number } }>('/admin/contact-messages?limit=1')
      .then((d) => onCounts(d.counts.new))
      .catch(() => onCounts(null));
  }, [onCounts]);
  return null;
}

// ── analytics ────────────────────────────────────────────────────────────────

function AnalyticsPanel() {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (d: number) => {
    setBusy(true);
    setError('');
    try {
      setData(await api<Analytics>(`/admin/analytics?days=${d}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load analytics.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(days); }, [days, load]);

  const daily = useMemo(() => (data ? fillDays(data.daily, data.days, data.source === 'posthog') : []), [data]);
  const isPosthog = data?.source === 'posthog';

  return (
    <div className="space-y-6">
      {/* Filters: one row, above everything they scope */}
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Date range" className="inline-flex rounded-lg border border-gray-300 bg-white p-0.5">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setDays(r)}
              aria-pressed={days === r}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${
                days === r ? 'bg-blue-700 text-white' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              Last {r} days
            </button>
          ))}
        </div>
        <button
          onClick={() => void load(days)}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 border border-gray-300 bg-white rounded-lg hover:bg-gray-50 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
        >
          <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh
        </button>
        {data?.status.posthogUrl && (
          <a
            href={data.status.posthogUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline"
          >
            Open in PostHog <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
        <span className="text-xs text-gray-500 sm:ml-auto" role="status">
          {busy ? 'Loading…' : data ? `Source: ${isPosthog ? 'PostHog' : 'built-in counter'} · updated ${new Date(data.generatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}
        </span>
      </div>

      {error && <Notice icon="warning" title="Couldn't load analytics">{error}</Notice>}
      {data?.warning && <Notice icon="warning" title="PostHog unavailable">{data.warning}</Notice>}
      {data && data.status.reporting === 'builtin' && !data.warning && <SetupNotice collecting={data.status.collecting} />}

      {data && (
        // Refetch keeps the frame: hold the previous render, dimmed, while loading.
        <div className={`space-y-6 transition-opacity ${busy ? 'opacity-60' : ''}`} aria-busy={busy}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatTile label="Page views" value={data.totals.views} previous={data.previous.views} days={data.days} />
            <StatTile
              label="Visitors"
              value={data.totals.visitors}
              previous={data.previous.visitors}
              days={data.days}
              note={isPosthog ? 'Counted once per day (cookieless)' : 'Needs PostHog'}
            />
            <StatTile label="Intakes completed" value={data.events?.intake_completed ?? null} note={data.events ? `${fmt(data.events.intake_started)} started` : 'Needs PostHog'} />
            <StatTile label="Assistant questions" value={data.events?.assistant_question ?? null} note={data.events ? `${fmt(data.events.contact_submitted)} contact messages` : 'Needs PostHog'} />
          </div>

          <Card title="Page views per day" subtitle={`Last ${data.days} days`}>
            <DailyChart rows={daily} />
          </Card>

          <div className="grid lg:grid-cols-2 gap-6">
            <RankedList title="Top pages" rows={data.topPages} keyLabel="Page" empty="No page views yet." link />
            <RankedList title="Top referrers" rows={data.topReferrers} keyLabel="Site" empty="No visits from other sites yet." />
            {isPosthog && <RankedList title="Devices" rows={data.devices} keyLabel="Device" empty="No data yet." />}
            {isPosthog && <RankedList title="Countries" rows={data.countries} keyLabel="Country" empty="No data yet." />}
          </div>

          {data.events && <IntakeFunnel started={data.events.intake_started} completed={data.events.intake_completed} />}
        </div>
      )}
    </div>
  );
}

function SetupNotice({ collecting }: { collecting: 'posthog' | 'builtin' }) {
  return (
    <Notice icon="info" title={collecting === 'posthog' ? 'PostHog is collecting, but reports aren\'t connected yet' : 'Showing the built-in page-view counter'}>
      <p className="mb-2">
        {collecting === 'posthog'
          ? 'Events are going to PostHog. To show them here, add these variables to the web service:'
          : 'Connect PostHog for visitors, devices, countries, and intake/assistant events. Add these variables to the web service and redeploy:'}
      </p>
      <ul className="list-disc pl-5 space-y-0.5 font-mono text-xs">
        {collecting !== 'posthog' && <li>POSTHOG_PROJECT_KEY (phc_…, starts collection)</li>}
        <li>POSTHOG_PROJECT_ID (number in your PostHog project URL)</li>
        <li>POSTHOG_PERSONAL_API_KEY (phx_…, with the query:read scope)</li>
        <li>POSTHOG_REGION = us or eu</li>
      </ul>
    </Notice>
  );
}

function RankedList({ title, rows, keyLabel, empty, link }: {
  title: string; rows: Row[]; keyLabel: string; empty: string; link?: boolean;
}) {
  const max = Math.max(1, ...rows.map((r) => r.views));
  const hasVisitors = rows.some((r) => r.visitors != null);
  return (
    <Card title={title}>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">{empty}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 border-b border-gray-100">
              <th scope="col" className="text-left font-medium pb-2">{keyLabel}</th>
              {hasVisitors && <th scope="col" className="text-right font-medium pb-2 w-20">Visitors</th>}
              <th scope="col" className="text-right font-medium pb-2 w-20">Views</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-gray-50 last:border-0">
                <td className="py-2 pr-3 max-w-0">
                  {link && r.key.startsWith('/') ? (
                    <a href={r.key} className="block truncate text-gray-800 hover:text-blue-700 hover:underline" title={r.key}>{r.key}</a>
                  ) : (
                    <span className="block truncate text-gray-800" title={r.key}>{r.key}</span>
                  )}
                  <div className="mt-1 h-1 rounded-full bg-gray-100" aria-hidden="true">
                    <div className="h-1 rounded-full bg-blue-600" style={{ width: `${(r.views / max) * 100}%` }} />
                  </div>
                </td>
                {hasVisitors && <td className="py-2 text-right tabular-nums text-gray-600">{fmt(r.visitors)}</td>}
                <td className="py-2 text-right tabular-nums font-medium text-gray-900">{fmt(r.views)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function IntakeFunnel({ started, completed }: { started: number; completed: number }) {
  const rate = started > 0 ? Math.round((completed / started) * 100) : null;
  return (
    <Card title="Intake questionnaire" subtitle="Started vs. completed in this period">
      <div className="space-y-3">
        {[
          { label: 'Started', value: started },
          { label: 'Completed', value: completed },
        ].map(({ label, value }) => (
          <div key={label}>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-700">{label}</span>
              <span className="font-medium text-gray-900 tabular-nums">{fmt(value)}</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100" aria-hidden="true">
              <div className="h-2 rounded-full bg-blue-600" style={{ width: `${started ? Math.min(100, (value / started) * 100) : 0}%` }} />
            </div>
          </div>
        ))}
        <p className="text-sm text-gray-600">
          {rate == null ? 'No intakes started yet.' : <>Completion rate: <strong className="text-gray-900">{rate}%</strong></>}
        </p>
      </div>
    </Card>
  );
}

// ── daily chart ──────────────────────────────────────────────────────────────

/** Fill in days with no data so the chart has one bar per day. */
function fillDays(rows: DayRow[], days: number, withVisitors: boolean): DayRow[] {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const out: DayRow[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.push(byDay.get(iso) ?? { day: iso, views: 0, visitors: withVisitors ? 0 : null });
  }
  return out;
}

function DailyChart({ rows }: { rows: DayRow[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const height = 220;
  const pad = { top: 12, right: 8, bottom: 26, left: 44 };
  const plotW = Math.max(0, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;
  const ticks = niceTicks(Math.max(0, ...rows.map((r) => r.views)));
  const yMax = ticks[ticks.length - 1] || 1;
  const slot = rows.length ? plotW / rows.length : 0;
  const barW = Math.max(1, Math.min(24, slot - 2)); // capped at 24px, 2px gap between bars
  const y = (v: number) => pad.top + plotH - (v / yMax) * plotH;
  const labelIdx = rows.length ? Array.from(new Set([0, Math.floor((rows.length - 1) / 2), rows.length - 1])) : [];
  const hasVisitors = rows.some((r) => r.visitors != null);

  const activeRow = active != null ? rows[active] : null;
  const tipX = active != null ? pad.left + slot * active + slot / 2 : 0;

  return (
    <div>
      <div ref={ref} className="relative" onPointerLeave={() => setActive(null)}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={`Bar chart of page views per day over ${rows.length} days. Use the table view for exact values.`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? '#9ca3af' : '#e5e7eb'} strokeWidth={1} />
                <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="#6b7280">{nf.format(t)}</text>
              </g>
            ))}
            {rows.map((r, i) => {
              const x = pad.left + slot * i + (slot - barW) / 2;
              const h = Math.max(0, y(0) - y(r.views));
              const radius = Math.min(4, barW / 2, h);
              return (
                <g key={r.day}>
                  {h > 0 && (
                    <path
                      d={`M${x},${y(0)} V${y(r.views) + radius} Q${x},${y(r.views)} ${x + radius},${y(r.views)} H${x + barW - radius} Q${x + barW},${y(r.views)} ${x + barW},${y(r.views) + radius} V${y(0)} Z`}
                      fill={active === i ? '#1d4ed8' : '#2563eb'}
                    />
                  )}
                  {/* Hit target: the whole day column, taller and wider than the bar */}
                  <rect
                    x={pad.left + slot * i}
                    y={pad.top}
                    width={slot}
                    height={plotH}
                    fill="transparent"
                    onPointerEnter={() => setActive(i)}
                    onPointerMove={() => setActive(i)}
                  />
                </g>
              );
            })}
            {labelIdx.map((i) => (
              <text
                key={i}
                x={pad.left + slot * i + slot / 2}
                y={height - 8}
                fontSize={11}
                fill="#6b7280"
                textAnchor={i === 0 ? 'start' : i === rows.length - 1 ? 'end' : 'middle'}
              >
                {fmtDay(rows[i].day)}
              </text>
            ))}
          </svg>
        )}
        {activeRow && (
          <div
            className="pointer-events-none absolute z-10 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-md text-xs whitespace-nowrap"
            style={{
              left: Math.min(Math.max(tipX, 70), width - 70),
              top: Math.max(0, y(activeRow.views) - 56),
              transform: 'translateX(-50%)',
            }}
          >
            <p className="text-base font-bold text-gray-900 tabular-nums">{fmt(activeRow.views)} <span className="text-xs font-normal text-gray-500">views</span></p>
            {activeRow.visitors != null && <p className="text-gray-700 tabular-nums">{fmt(activeRow.visitors)} visitors</p>}
            <p className="text-gray-500">{fmtDay(activeRow.day, { weekday: 'short', month: 'short', day: 'numeric' })}</p>
          </div>
        )}
      </div>

      <button
        onClick={() => setShowTable((v) => !v)}
        aria-expanded={showTable}
        className="mt-3 text-sm font-medium text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 rounded"
      >
        {showTable ? 'Hide table' : 'Show as table'}
      </button>
      {showTable && (
        <div className="mt-3 max-h-80 overflow-y-auto border border-gray-100 rounded-lg">
          <table className="w-full text-sm">
            <caption className="sr-only">Page views per day</caption>
            <thead className="sticky top-0 bg-gray-50">
              <tr className="text-xs text-gray-500">
                <th scope="col" className="text-left font-medium px-3 py-2">Date</th>
                {hasVisitors && <th scope="col" className="text-right font-medium px-3 py-2">Visitors</th>}
                <th scope="col" className="text-right font-medium px-3 py-2">Views</th>
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((r) => (
                <tr key={r.day} className="border-t border-gray-100">
                  <th scope="row" className="text-left font-normal px-3 py-1.5 text-gray-700">{fmtDay(r.day, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</th>
                  {hasVisitors && <td className="text-right px-3 py-1.5 tabular-nums text-gray-600">{fmt(r.visitors)}</td>}
                  <td className="text-right px-3 py-1.5 tabular-nums text-gray-900">{fmt(r.views)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── messages ─────────────────────────────────────────────────────────────────

function MessagesPanel({ onCounts }: { onCounts: (n: number | null) => void }) {
  const [filter, setFilter] = useState<'new' | 'handled' | 'all'>('new');
  const [messages, setMessages] = useState<ContactMessage[] | null>(null);
  const [counts, setCounts] = useState({ new: 0, handled: 0 });
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const d = await api<{ messages: ContactMessage[]; counts: { new: number; handled: number } }>(
        `/admin/contact-messages?status=${filter}&limit=200`,
      );
      setMessages(d.messages);
      setCounts(d.counts);
      onCounts(d.counts.new);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load messages.');
    }
  }, [filter, onCounts]);

  useEffect(() => { void load(); }, [load]);

  async function setStatus(m: ContactMessage, status: 'new' | 'handled') {
    setUpdating(m.id);
    try {
      await api(`/admin/contact-messages/${m.id}`, { method: 'PATCH', body: { status } });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update the message.');
    } finally {
      setUpdating(null);
    }
  }

  const filters = [
    { key: 'new', label: `New (${counts.new})` },
    { key: 'handled', label: `Handled (${counts.handled})` },
    { key: 'all', label: `All (${counts.new + counts.handled})` },
  ] as const;

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Filter messages" className="inline-flex rounded-lg border border-gray-300 bg-white p-0.5">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${
              filter === f.key ? 'bg-blue-700 text-white' : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <Notice icon="warning" title="Something went wrong">{error}</Notice>}

      {messages === null ? (
        <p className="text-gray-600" role="status">Loading messages…</p>
      ) : messages.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <Inbox className="h-8 w-8 text-gray-400 mx-auto mb-2" aria-hidden="true" />
          <p className="text-gray-600">{filter === 'new' ? 'No new messages. You\'re all caught up.' : 'No messages here.'}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {messages.map((m) => (
            <li key={m.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                <div>
                  <p className="font-semibold text-gray-900">{m.name}</p>
                  <a href={`mailto:${m.email}`} className="text-sm text-blue-700 hover:underline break-all">{m.email}</a>
                </div>
                <div className="text-right">
                  <span className="inline-block rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                    {TYPE_LABELS[m.type] ?? m.type}
                  </span>
                  <p className="text-xs text-gray-500 mt-1">
                    <time dateTime={m.created_at}>{new Date(m.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</time>
                  </p>
                </div>
              </div>
              <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{m.message}</p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <a
                  href={`mailto:${m.email}?subject=${encodeURIComponent('Re: your message to Low Vision Navigator')}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
                >
                  <Mail className="h-4 w-4" aria-hidden="true" /> Reply
                </a>
                <button
                  onClick={() => void setStatus(m, m.status === 'new' ? 'handled' : 'new')}
                  disabled={updating === m.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
                >
                  {m.status === 'new' ? (
                    <><CheckCircle className="h-4 w-4" aria-hidden="true" /> Mark handled</>
                  ) : (
                    'Mark as new'
                  )}
                </button>
                {m.status === 'handled' && <span className="text-xs text-gray-500">Handled</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
