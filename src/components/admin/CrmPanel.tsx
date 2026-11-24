import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, RefreshCw, Search, UserPlus, ChevronLeft, ChevronRight, Building2, Mail, Phone, Globe, CheckCircle } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { Card, Notice, StatTile } from './AdminUI';
import { fmt } from './format';

// ── types (mirror server/crm-admin.mjs) ──────────────────────────────────────

interface CrmStatus {
  configured: boolean;
  reachable?: boolean;
  crmUrl?: string;
  apiUser?: string | null;
  version?: string | null;
  problems: string[];
  counts?: { accounts: number | null; contacts: number | null; campaigns: number | null };
  outreachList?: { id?: string; name: string; link?: string; missing?: boolean; members?: { accounts: number | null; contacts: number | null } | null };
  links?: { home: string; campaigns: string; accounts: string };
}
interface Account {
  id: string; name: string; website?: string | null; phoneNumber?: string | null; emailAddress?: string | null; description?: string | null;
  billingAddressCity?: string | null; billingAddressState?: string | null; billingAddressCountry?: string | null; link: string;
}
interface Contact { id: string; firstName?: string; lastName?: string; title?: string; emailAddress?: string; phoneNumber?: string; link: string }
interface Campaign {
  id: string; name: string; status: string; type: string; startDate?: string | null; createdAt?: string; link: string;
  sentCount?: number; openedCount?: number; clickedCount?: number; optedOutCount?: number; bouncedCount?: number;
}
interface SyncResult {
  apply: boolean;
  stats: { total: number; created: number; updated: number; unchanged: number; linked: number; failed: number; listCreated: boolean; listName: string };
  failures: string[];
  moreFailures: number;
}

type Section = 'overview' | 'organizations' | 'campaigns';
const btn = 'inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 disabled:opacity-60';
const btnPrimary = `${btn} text-white bg-blue-700 hover:bg-blue-800`;
const btnSecondary = `${btn} text-gray-800 bg-white border border-gray-300 hover:bg-gray-50`;
const input = 'w-full px-3 py-2 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600';
const errMsg = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

function CrmLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline">
      {children} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /><span className="sr-only">(opens EspoCRM in a new tab)</span>
    </a>
  );
}

// ── panel ────────────────────────────────────────────────────────────────────

export function CrmPanel() {
  const [section, setSection] = useState<Section>('overview');
  const [status, setStatus] = useState<CrmStatus | null>(null);
  const [error, setError] = useState('');

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await api<CrmStatus>('/admin/crm/status'));
      setError('');
    } catch (err) {
      setError(errMsg(err, 'Could not load the CRM status.'));
    }
  }, []);
  useEffect(() => { void loadStatus(); }, [loadStatus]);

  if (error) return <Notice icon="warning" title="CRM unavailable">{error}</Notice>;
  if (!status) return <p role="status" className="text-gray-600">Connecting to the CRM…</p>;
  if (!status.configured) {
    return (
      <Notice icon="info" title="Connect the CRM">
        <p className="mb-2">The CRM tab manages EspoCRM from here. Add these variables to the website service and redeploy:</p>
        <ul className="list-disc pl-5 font-mono text-xs space-y-0.5">
          <li>ESPOCRM_URL (e.g. https://crm.lowvisionnavigator.org)</li>
          <li>ESPOCRM_API_KEY (the API user's key from EspoCRM → Administration → API Users)</li>
        </ul>
      </Notice>
    );
  }

  const sections: { key: Section; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'organizations', label: 'Organizations' },
    { key: 'campaigns', label: 'Campaigns' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="CRM sections" className="inline-flex rounded-lg border border-gray-300 bg-white p-0.5">
          {sections.map((s) => (
            <button key={s.key} onClick={() => setSection(s.key)} aria-pressed={section === s.key}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${section === s.key ? 'bg-blue-700 text-white' : 'text-gray-700 hover:bg-gray-100'}`}>
              {s.label}
            </button>
          ))}
        </div>
        {status.links && <span className="sm:ml-auto"><CrmLink href={status.links.home}>Open EspoCRM</CrmLink></span>}
      </div>

      {status.problems.length > 0 && (
        <Notice icon="warning" title={status.reachable === false ? 'Can’t reach the CRM' : 'The CRM needs attention'}>
          <ul className="list-disc pl-5 space-y-1">{status.problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </Notice>
      )}

      {status.reachable !== false && (
        <>
          {section === 'overview' && <Overview status={status} onSynced={loadStatus} />}
          {section === 'organizations' && <Organizations />}
          {section === 'campaigns' && <Campaigns status={status} />}
        </>
      )}
    </div>
  );
}

// ── overview ─────────────────────────────────────────────────────────────────

function Overview({ status, onSynced }: { status: CrmStatus; onSynced: () => void }) {
  const c = status.counts;
  const members = status.outreachList?.members;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Organizations" value={c?.accounts ?? null} />
        <StatTile label="Contacts" value={c?.contacts ?? null} />
        <StatTile label="On the outreach list" value={members ? (members.accounts ?? 0) + (members.contacts ?? 0) : null}
          note={members ? `${fmt(members.accounts)} organizations · ${fmt(members.contacts)} people` : 'List not created yet'} />
        <StatTile label="Campaigns" value={c?.campaigns ?? null} />
      </div>
      <p className="text-xs text-gray-500">
        Connected to {status.crmUrl} as API user <strong>{status.apiUser ?? '—'}</strong>{status.version ? ` · EspoCRM ${status.version}` : ''}.
        {status.outreachList?.link && <> Outreach list: <CrmLink href={status.outreachList.link}>{status.outreachList.name}</CrmLink></>}
      </p>
      <SyncCard onSynced={onSynced} />
      <Card title="Next steps for outreach">
        <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700">
          <li>Sync the directory into the CRM (above).</li>
          <li>In <strong>Organizations</strong>, add a contact person with an email for each organization you want to reach. The directory has no email addresses.</li>
          <li>In EspoCRM, create a campaign that targets the outreach list, with an email template and a mass email. Its results appear under <strong>Campaigns</strong> here.</li>
        </ol>
      </Card>
    </div>
  );
}

function SyncCard({ onSynced }: { onSynced: () => void }) {
  const [scope, setScope] = useState<'all' | 'na'>('na');
  const [busy, setBusy] = useState<'preview' | 'apply' | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState('');

  async function run(apply: boolean) {
    setBusy(apply ? 'apply' : 'preview');
    setError('');
    try {
      const r = await api<SyncResult>('/admin/crm/sync', { method: 'POST', body: { apply, countries: scope === 'na' ? ['US', 'CA'] : [] } });
      setResult(r);
      if (apply) onSynced();
    } catch (err) {
      setError(errMsg(err, 'The sync failed.'));
    } finally {
      setBusy(null);
    }
  }

  const s = result?.stats;
  const changes = s ? s.created + s.updated : 0;

  return (
    <Card title="Sync the directory into the CRM">
      <p className="text-sm text-gray-700 mb-4">
        Adds the site's resource directory to the CRM as organizations on the outreach list. Organizations are matched by name; fields you've edited in the CRM are never overwritten. Preview first: nothing changes until you apply.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-gray-800">
          <span>Organizations from</span>
          <select value={scope} onChange={(e) => { setScope(e.target.value as 'all' | 'na'); setResult(null); }} className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg bg-white">
            <option value="na">United States and Canada</option>
            <option value="all">All countries</option>
          </select>
        </label>
        <button type="button" onClick={() => void run(false)} disabled={!!busy} className={btnSecondary}>
          <RefreshCw className={`h-4 w-4 ${busy === 'preview' ? 'animate-spin' : ''}`} aria-hidden="true" />{busy === 'preview' ? 'Checking…' : 'Preview'}
        </button>
        {result && !result.apply && changes > 0 && (
          <button type="button" onClick={() => void run(true)} disabled={!!busy} className={btnPrimary}>
            {busy === 'apply' ? 'Syncing… (up to a minute)' : `Apply ${changes} change${changes === 1 ? '' : 's'}`}
          </button>
        )}
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      {s && (
        <div role="status" className={`mt-4 rounded-lg border p-4 text-sm ${result.apply ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
          <p className="font-semibold text-gray-900">{result.apply ? 'Sync complete' : 'Preview'}{` (${fmt(s.total)} organizations)`}</p>
          <p className="mt-1 text-gray-700">
            {result.apply ? 'Created' : 'Would create'} {fmt(s.created)} · {result.apply ? 'filled in' : 'would fill in'} {fmt(s.updated)} · unchanged {fmt(s.unchanged)}
            {result.apply ? ` · on the outreach list ${fmt(s.linked)}` : ''}{s.failed ? ` · failed ${fmt(s.failed)}` : ''}
          </p>
          {s.listCreated && <p className="mt-1 text-gray-700">The list "{s.listName}" {result.apply ? 'was created' : 'will be created'}.</p>}
          {!result.apply && changes === 0 && <p className="mt-1 text-gray-700">Everything is already up to date.</p>}
          {result.failures.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-red-800">
              {result.failures.map((f) => <li key={f}>{f}</li>)}
              {result.moreFailures > 0 && <li>…and {result.moreFailures} more</li>}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

// ── organizations ────────────────────────────────────────────────────────────

function Organizations() {
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<{ total: number; accounts: Account[] } | null>(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      api<{ total: number; accounts: Account[] }>(`/admin/crm/accounts?offset=${offset}&q=${encodeURIComponent(q.trim())}`)
        .then((d) => { setData(d); setError(''); })
        .catch((err) => setError(errMsg(err, 'Could not load organizations.')));
    }, 300);
    return () => clearTimeout(t);
  }, [q, offset]);

  const place = (a: Account) => [a.billingAddressCity, a.billingAddressState, a.billingAddressCountry].filter(Boolean).join(', ');

  return (
    <div className="space-y-4">
      <label className="relative block max-w-md">
        <span className="sr-only">Search organizations</span>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
        <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} placeholder="Search organizations" className={`${input} pl-9`} />
      </label>
      {error && <Notice icon="warning" title="Something went wrong">{error}</Notice>}
      {!data ? <p role="status" className="text-gray-600">Loading organizations…</p> : (
        <>
          <p className="text-sm text-gray-600" role="status">{fmt(data.total)} organization{data.total === 1 ? '' : 's'}{q.trim() ? ` matching “${q.trim()}”` : ''}</p>
          {data.accounts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-gray-600">
              No organizations{q.trim() ? ' match' : ' yet. Use the sync on the Overview to add the directory'}.
            </div>
          ) : (
            <ul className="space-y-2">
              {data.accounts.map((a) => (
                <li key={a.id} className="rounded-xl border border-gray-200 bg-white">
                  <button type="button" onClick={() => setOpenId(openId === a.id ? null : a.id)} aria-expanded={openId === a.id}
                    className="w-full flex flex-wrap items-start justify-between gap-2 p-4 text-left hover:bg-gray-50 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700">
                    <span className="min-w-0">
                      <span className="block font-semibold text-gray-900">{a.name}</span>
                      {place(a) && <span className="block text-sm text-gray-600">{place(a)}</span>}
                    </span>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${a.emailAddress ? 'bg-green-100 text-green-900' : 'bg-amber-100 text-amber-900'}`}>
                      {a.emailAddress ? 'Has email' : 'No email yet'}
                    </span>
                  </button>
                  {openId === a.id && <AccountDetail id={a.id} onChanged={(acc) => setData((d) => d && { ...d, accounts: d.accounts.map((x) => (x.id === acc.id ? { ...x, ...acc } : x)) })} />}
                </li>
              ))}
            </ul>
          )}
          {data.total > 25 && (
            <div className="flex items-center gap-3">
              <button type="button" className={btnSecondary} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 25))}>
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />Previous
              </button>
              <span className="text-sm text-gray-600">{offset + 1}–{Math.min(offset + 25, data.total)} of {fmt(data.total)}</span>
              <button type="button" className={btnSecondary} disabled={offset + 25 >= data.total} onClick={() => setOffset(offset + 25)}>
                Next<ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AccountDetail({ id, onChanged }: { id: string; onChanged: (a: Account) => void }) {
  const [detail, setDetail] = useState<{ account: Account; contacts: Contact[] } | null>(null);
  const [error, setError] = useState('');
  const [edit, setEdit] = useState<{ emailAddress: string; phoneNumber: string; website: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [adding, setAdding] = useState(false);
  const [contact, setContact] = useState({ firstName: '', lastName: '', title: '', emailAddress: '', phoneNumber: '' });

  useEffect(() => {
    api<{ account: Account; contacts: Contact[] }>(`/admin/crm/accounts/${id}`)
      .then((d) => {
        setDetail(d);
        setEdit({ emailAddress: d.account.emailAddress ?? '', phoneNumber: d.account.phoneNumber ?? '', website: d.account.website ?? '' });
      })
      .catch((err) => setError(errMsg(err, 'Could not load this organization.')));
  }, [id]);

  async function save() {
    if (!edit) return;
    setSaving(true); setMsg(''); setError('');
    try {
      const d = await api<{ account: Account }>(`/admin/crm/accounts/${id}`, { method: 'PUT', body: edit });
      setDetail((x) => x && { ...x, account: d.account });
      onChanged(d.account);
      setMsg('Saved to the CRM.');
    } catch (err) {
      setError(errMsg(err, 'Could not save.'));
    } finally {
      setSaving(false);
    }
  }

  async function addContact(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setMsg(''); setError('');
    try {
      const d = await api<{ contact: Contact; addedToList: boolean }>(`/admin/crm/accounts/${id}/contacts`, { method: 'POST', body: contact });
      setDetail((x) => x && { ...x, contacts: [...x.contacts, d.contact] });
      setContact({ firstName: '', lastName: '', title: '', emailAddress: '', phoneNumber: '' });
      setAdding(false);
      setMsg(d.addedToList ? 'Contact added and put on the outreach list.' : 'Contact added.');
    } catch (err) {
      setError(errMsg(err, 'Could not add the contact.'));
    } finally {
      setSaving(false);
    }
  }

  if (error && !detail) return <p role="alert" className="px-4 pb-4 text-sm text-red-700">{error}</p>;
  if (!detail || !edit) return <p role="status" className="px-4 pb-4 text-sm text-gray-600">Loading…</p>;
  const a = detail.account;

  return (
    <div className="border-t border-gray-100 p-4 space-y-5">
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-700">
        {a.website && <span className="inline-flex items-center gap-1.5"><Globe className="h-4 w-4" aria-hidden="true" />{a.website}</span>}
        {a.phoneNumber && <span className="inline-flex items-center gap-1.5"><Phone className="h-4 w-4" aria-hidden="true" />{a.phoneNumber}</span>}
        <CrmLink href={a.link}>Open in EspoCRM</CrmLink>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-gray-900 mb-2">Organization details</h4>
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="block text-sm"><span className="block text-gray-700 mb-1">General email</span>
            <input type="email" value={edit.emailAddress} onChange={(e) => setEdit({ ...edit, emailAddress: e.target.value })} className={input} placeholder="info@example.org" /></label>
          <label className="block text-sm"><span className="block text-gray-700 mb-1">Phone</span>
            <input type="tel" value={edit.phoneNumber} onChange={(e) => setEdit({ ...edit, phoneNumber: e.target.value })} className={input} /></label>
          <label className="block text-sm"><span className="block text-gray-700 mb-1">Website</span>
            <input type="url" value={edit.website} onChange={(e) => setEdit({ ...edit, website: e.target.value })} className={input} /></label>
        </div>
        <button type="button" onClick={() => void save()} disabled={saving} className={`${btnPrimary} mt-3`}>{saving ? 'Saving…' : 'Save details'}</button>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-gray-900 mb-2">Contacts ({detail.contacts.length})</h4>
        {detail.contacts.length === 0 ? (
          <p className="text-sm text-gray-600">No contacts yet. Add the person you want to reach; they'll go on the outreach list.</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
            {detail.contacts.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>
                  <span className="font-medium text-gray-900">{[c.firstName, c.lastName].filter(Boolean).join(' ')}</span>
                  {c.title && <span className="text-gray-600"> · {c.title}</span>}
                  {c.emailAddress && <span className="block text-gray-700 break-all"><Mail className="inline h-3.5 w-3.5 mr-1" aria-hidden="true" />{c.emailAddress}</span>}
                </span>
                <CrmLink href={c.link}>Open</CrmLink>
              </li>
            ))}
          </ul>
        )}
        {adding ? (
          <form onSubmit={addContact} className="mt-3 grid sm:grid-cols-2 gap-3 rounded-lg border border-blue-100 bg-blue-50/50 p-3">
            <label className="block text-sm"><span className="block text-gray-700 mb-1">First name</span><input value={contact.firstName} onChange={(e) => setContact({ ...contact, firstName: e.target.value })} className={input} autoComplete="off" /></label>
            <label className="block text-sm"><span className="block text-gray-700 mb-1">Last name</span><input value={contact.lastName} onChange={(e) => setContact({ ...contact, lastName: e.target.value })} className={input} autoComplete="off" /></label>
            <label className="block text-sm"><span className="block text-gray-700 mb-1">Job title (optional)</span><input value={contact.title} onChange={(e) => setContact({ ...contact, title: e.target.value })} className={input} autoComplete="off" /></label>
            <label className="block text-sm"><span className="block text-gray-700 mb-1">Email</span><input type="email" required value={contact.emailAddress} onChange={(e) => setContact({ ...contact, emailAddress: e.target.value })} className={input} autoComplete="off" /></label>
            <div className="sm:col-span-2 flex gap-2">
              <button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'Adding…' : 'Add contact'}</button>
              <button type="button" onClick={() => setAdding(false)} className={btnSecondary}>Cancel</button>
            </div>
          </form>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className={`${btnSecondary} mt-3`}><UserPlus className="h-4 w-4" aria-hidden="true" />Add contact</button>
        )}
      </div>
      {msg && <p role="status" className="text-sm text-green-800 flex items-center gap-1.5"><CheckCircle className="h-4 w-4" aria-hidden="true" />{msg}</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

// ── campaigns ────────────────────────────────────────────────────────────────

function Campaigns({ status }: { status: CrmStatus }) {
  const [data, setData] = useState<{ total: number; campaigns: Campaign[] } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<{ total: number; campaigns: Campaign[] }>('/admin/crm/campaigns').then(setData).catch((err) => setError(errMsg(err, 'Could not load campaigns.')));
  }, []);
  const rate = (n?: number, d?: number) => (d ? ` (${Math.round(((n ?? 0) / d) * 100)}%)` : '');

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-700">
        Campaigns are created and sent in EspoCRM; results show here.{' '}
        {status.links && <CrmLink href={`${status.links.campaigns}/create`}>Create a campaign in EspoCRM</CrmLink>}
      </p>
      {error && <Notice icon="warning" title="Something went wrong">{error}</Notice>}
      {!data ? <p role="status" className="text-gray-600">Loading campaigns…</p> : data.campaigns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-gray-600">
          <Building2 className="h-7 w-7 mx-auto mb-2 text-gray-400" aria-hidden="true" />
          No campaigns yet.
        </div>
      ) : (
        <div className="relative overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm min-w-[40rem]">
            <caption className="sr-only">Email campaigns and their results</caption>
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-200">
                <th scope="col" className="text-left font-medium px-4 py-2.5">Campaign</th>
                <th scope="col" className="text-left font-medium px-3 py-2.5">Status</th>
                <th scope="col" className="text-right font-medium px-3 py-2.5">Sent</th>
                <th scope="col" className="text-right font-medium px-3 py-2.5">Opened</th>
                <th scope="col" className="text-right font-medium px-3 py-2.5">Clicked</th>
                <th scope="col" className="text-right font-medium px-3 py-2.5">Opted out</th>
                <th scope="col" className="text-right font-medium px-4 py-2.5">Bounced</th>
              </tr>
            </thead>
            <tbody>
              {data.campaigns.map((c) => (
                <tr key={c.id} className="border-b border-gray-100 last:border-0">
                  <th scope="row" className="text-left font-normal px-4 py-2.5">
                    <a href={c.link} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-700 hover:underline">{c.name}<span className="sr-only"> (opens EspoCRM in a new tab)</span></a>
                    <span className="block text-xs text-gray-500">{c.type}{c.startDate ? ` · starts ${c.startDate}` : ''}</span>
                  </th>
                  <td className="px-3 py-2.5 text-gray-700">{c.status}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmt(c.sentCount ?? null)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmt(c.openedCount ?? null)}<span className="text-gray-500">{rate(c.openedCount, c.sentCount)}</span></td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmt(c.clickedCount ?? null)}<span className="text-gray-500">{rate(c.clickedCount, c.sentCount)}</span></td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmt(c.optedOutCount ?? null)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmt(c.bouncedCount ?? null)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
