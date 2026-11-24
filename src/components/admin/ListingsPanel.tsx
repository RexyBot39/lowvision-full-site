import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, XCircle, Trash2, ShieldAlert, Inbox } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { Notice } from './AdminUI';
import { professionBySlug, SERVICE_MODES, AGE_GROUPS, PAYMENT_OPTIONS } from '../../data/professions';

type Status = 'pending' | 'approved' | 'rejected' | 'removed';
type Listing = Record<string, string | string[]>;

interface AdminListing {
  id: number;
  status: Status;
  data: Listing;
  published: Listing | null;
  owner_hidden: boolean;
  review_note: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  account_email: string;
  account_name: string;
}

const FIELD_LABELS: Record<string, string> = {
  fullName: 'Name', credentials: 'Credentials', specialties: 'Professions', practiceName: 'Practice', street: 'Street',
  city: 'City', region: 'State/province', postalCode: 'Postal code', country: 'Country', serviceArea: 'Area served',
  phone: 'Phone', publicEmail: 'Public email', website: 'Website', serviceModes: 'How they see clients',
  ageGroups: 'Ages', payment: 'Payment', languages: 'Languages', bio: 'Bio', licenseInfo: 'License / certification',
};

const lists: Record<string, readonly { key: string; label: string }[]> = { serviceModes: SERVICE_MODES, ageGroups: AGE_GROUPS, payment: PAYMENT_OPTIONS };
function show(key: string, v: string | string[] | undefined): string {
  if (Array.isArray(v)) {
    if (key === 'specialties') return v.map((s) => professionBySlug(s)?.singular ?? s).join(', ');
    return v.map((x) => lists[key]?.find((o) => o.key === x)?.label ?? x).join(', ');
  }
  return v ?? '';
}
const same = (a: unknown, b: unknown) => JSON.stringify(Array.isArray(a) ? [...a].sort() : a ?? '') === JSON.stringify(Array.isArray(b) ? [...b].sort() : b ?? '');
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '');

export function ListingsPanel({ onCounts }: { onCounts: (pending: number | null) => void }) {
  const [filter, setFilter] = useState<Status | 'all'>('pending');
  const [items, setItems] = useState<AdminListing[] | null>(null);
  const [counts, setCounts] = useState<Record<Status, number>>({ pending: 0, approved: 0, rejected: 0, removed: 0 });
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const d = await api<{ listings: AdminListing[]; counts: Record<Status, number> }>(`/admin/listings?status=${filter}`);
      setItems(d.listings);
      setCounts(d.counts);
      onCounts(d.counts.pending);
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load listings.');
    }
  }, [filter, onCounts]);

  useEffect(() => { void load(); }, [load]);

  const filters: { key: Status | 'all'; label: string }[] = [
    { key: 'pending', label: `To review (${counts.pending})` },
    { key: 'approved', label: `Approved (${counts.approved})` },
    { key: 'rejected', label: `Changes requested (${counts.rejected})` },
    { key: 'removed', label: `Removed (${counts.removed})` },
    { key: 'all', label: 'All' },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Professionals' self-submitted listings for the <Link to="/find-a-professional" className="text-blue-700 hover:underline">Find a Professional</Link> directory. Nothing is public until approved. Verify the license or certification before approving.
      </p>
      <div role="group" aria-label="Filter listings" className="flex flex-wrap gap-1 rounded-lg border border-gray-300 bg-white p-0.5 w-fit">
        {filters.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)} aria-pressed={filter === f.key}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${filter === f.key ? 'bg-blue-700 text-white' : 'text-gray-700 hover:bg-gray-100'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {error && <Notice icon="warning" title="Something went wrong">{error}</Notice>}

      {items === null ? (
        <p role="status" className="text-gray-600">Loading listings…</p>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <Inbox className="h-8 w-8 text-gray-400 mx-auto mb-2" aria-hidden="true" />
          <p className="text-gray-600">{filter === 'pending' ? 'Nothing to review.' : 'No listings here.'}</p>
        </div>
      ) : (
        <ul className="space-y-4">{items.map((l) => <ListingReview key={l.id} l={l} onDone={load} />)}</ul>
      )}
    </div>
  );
}

function ListingReview({ l, onDone }: { l: AdminListing; onDone: () => void }) {
  const [mode, setMode] = useState<'reject' | 'remove' | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const d = l.data;
  const changed = l.published ? Object.keys(FIELD_LABELS).filter((k) => !same(d[k], l.published?.[k])) : null;
  const isEdit = l.status === 'pending' && !!l.published;

  async function act(action: 'approve' | 'reject' | 'remove') {
    setBusy(true);
    setError('');
    try {
      await api(`/admin/listings/${l.id}/${action}`, { method: 'POST', body: action === 'approve' ? {} : { note } });
      setMode(null);
      setNote('');
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  }

  const badge: Record<Status, string> = {
    pending: 'bg-amber-100 text-amber-900', approved: 'bg-green-100 text-green-900', rejected: 'bg-red-100 text-red-900', removed: 'bg-gray-200 text-gray-800',
  };
  const statusLabel: Record<Status, string> = { pending: isEdit ? 'Edit to review' : 'New, to review', approved: 'Approved', rejected: 'Changes requested', removed: 'Removed' };

  return (
    <li className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{show('fullName', d.fullName)}{d.credentials ? `, ${d.credentials}` : ''}</h3>
          <p className="text-sm text-blue-800">{show('specialties', d.specialties)}</p>
          <p className="text-xs text-gray-500 mt-1">
            Account: <a href={`mailto:${l.account_email}`} className="text-blue-700 hover:underline">{l.account_email}</a> · Submitted {when(l.submitted_at)}
            {l.owner_hidden && ' · Hidden by owner'}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge[l.status]}`}>{statusLabel[l.status]}</span>
      </div>

      <div className="mt-3 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
        <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
        <span><strong>Verify:</strong> {show('licenseInfo', d.licenseInfo) || '—'}</span>
      </div>

      {isEdit && changed && (
        <p className="mt-3 text-sm text-gray-800"><strong>Changed since approval:</strong> {changed.length ? changed.map((k) => FIELD_LABELS[k]).join(', ') : 'nothing'}</p>
      )}

      <dl className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
        {Object.keys(FIELD_LABELS).filter((k) => !['fullName', 'credentials', 'specialties', 'licenseInfo'].includes(k) && show(k, d[k])).map((k) => (
          <div key={k} className={k === 'bio' ? 'sm:col-span-2' : ''}>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {FIELD_LABELS[k]}{isEdit && changed?.includes(k) && <span className="ml-1 normal-case text-amber-700">(changed)</span>}
            </dt>
            <dd className="text-gray-800 whitespace-pre-line break-words">{show(k, d[k])}</dd>
            {isEdit && changed?.includes(k) && show(k, l.published?.[k]) && (
              <dd className="text-xs text-gray-500 line-through break-words">{show(k, l.published?.[k])}</dd>
            )}
          </div>
        ))}
      </dl>

      {l.review_note && <p className="mt-3 text-sm text-gray-700"><strong>Last note to the professional:</strong> {l.review_note}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}

      {mode ? (
        <div className="mt-4 space-y-2">
          <label htmlFor={`note-${l.id}`} className="block text-sm font-medium text-gray-800">
            {mode === 'reject' ? 'What needs to change? The professional will see this note.' : 'Why is this listing being removed? The professional will see this note.'}
          </label>
          <textarea id={`note-${l.id}`} rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600" />
          <div className="flex gap-2">
            <button type="button" disabled={busy || !note.trim()} onClick={() => void act(mode)} className="px-3 py-2 text-sm font-semibold text-white bg-red-700 rounded-lg hover:bg-red-800 disabled:opacity-50">
              {mode === 'reject' ? 'Request changes' : 'Remove listing'}
            </button>
            <button type="button" onClick={() => { setMode(null); setNote(''); }} className="px-3 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {l.status !== 'approved' && (
            <button type="button" disabled={busy} onClick={() => void act('approve')} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-green-700 rounded-lg hover:bg-green-800 disabled:opacity-50">
              <CheckCircle className="h-4 w-4" aria-hidden="true" />{l.status === 'removed' ? 'Restore and approve' : 'Approve'}
            </button>
          )}
          {l.status === 'pending' && (
            <button type="button" onClick={() => setMode('reject')} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50">
              <XCircle className="h-4 w-4" aria-hidden="true" />Request changes
            </button>
          )}
          {l.status !== 'removed' && (
            <button type="button" onClick={() => setMode('remove')} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-700 border border-red-200 rounded-lg hover:bg-red-50">
              <Trash2 className="h-4 w-4" aria-hidden="true" />Remove
            </button>
          )}
          {l.published && l.status !== 'removed' && !l.owner_hidden && (
            <Link to={`/find-a-professional/p/${l.id}`} className="px-3 py-2 text-sm font-medium text-blue-800 border border-blue-200 rounded-lg hover:bg-blue-50">View public listing</Link>
          )}
        </div>
      )}
    </li>
  );
}
