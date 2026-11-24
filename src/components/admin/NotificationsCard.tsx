import { useCallback, useEffect, useState } from 'react';
import { Mail, CheckCircle, AlertTriangle, RefreshCw, Send } from 'lucide-react';
import { api, ApiError } from '../../lib/api';

interface OutboxRow {
  id: number;
  kind: string;
  to_addresses: string;
  subject: string;
  status: 'pending' | 'sent' | 'failed';
  attempts: number;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
}

interface NotifyStatus {
  configured: boolean;
  enabled: boolean;
  problems: string[];
  from: string | null;
  crmUrl: string | null;
  adminRecipients: string[];
  counts: { pending: number; sent: number; failed: number };
  recent: OutboxRow[];
}

const KIND_LABELS: Record<string, string> = {
  listingSubmitted: 'Listing received',
  listingApproved: 'Listing approved',
  listingChangesRequested: 'Listing changes requested',
  listingRemoved: 'Listing removed',
  adminListingToReview: 'Admin: listing to review',
  adminContactMessage: 'Admin: contact message',
  passwordReset: 'Password reset',
  test: 'Test',
};
const when = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

/** Email notification status, test send and recent log, for the admin Messages tab. */
export function NotificationsCard() {
  const [s, setS] = useState<NotifyStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showLog, setShowLog] = useState(false);

  const load = useCallback(async (fresh = false) => {
    try {
      setS(await api<NotifyStatus>(`/admin/notifications${fresh ? '?fresh=1' : ''}`));
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load email status.');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function sendTest() {
    setBusy(true);
    setTestMsg(null);
    try {
      const d = await api<{ to: string }>('/admin/notifications/test', { method: 'POST', body: {} });
      setTestMsg({ ok: true, text: `Test email sent to ${d.to}. Check that inbox (and its spam folder).` });
    } catch (err) {
      setTestMsg({ ok: false, text: err instanceof ApiError ? err.message : 'The test failed.' });
    } finally {
      setBusy(false);
      void load(true);
    }
  }

  async function retry(id: number) {
    try {
      await api(`/admin/notifications/${id}/retry`, { method: 'POST', body: {} });
    } catch {
      /* the log shows the result */
    }
    void load();
  }

  if (error) return <p role="alert" className="text-sm text-red-700">{error}</p>;
  if (!s) return null;

  const healthy = s.enabled && s.problems.length === 0;
  const Icon = healthy ? CheckCircle : AlertTriangle;

  return (
    <section aria-labelledby="notify-heading" className={`rounded-xl border p-5 ${healthy ? 'border-gray-200 bg-white' : 'border-amber-200 bg-amber-50'}`}>
      <div className="flex flex-wrap items-start gap-3">
        <Mail className="h-6 w-6 text-blue-700 shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <h2 id="notify-heading" className="font-semibold text-gray-900 flex items-center gap-2">
            Email notifications
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${healthy ? 'bg-green-100 text-green-900' : 'bg-amber-200 text-amber-950'}`}>
              <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {healthy ? 'Working' : s.configured ? 'Needs attention' : 'Off'}
            </span>
          </h2>
          <p className="text-sm text-gray-700 mt-1">
            {s.enabled
              ? <>Sent through the CRM from <strong>{s.from}</strong>. Admin alerts go to {s.adminRecipients.length ? s.adminRecipients.join(', ') : <em>nobody (set NOTIFY_ADMIN_EMAILS or ADMIN_EMAILS)</em>}.</>
              : 'Professionals and admins get no emails until this is set up.'}
          </p>
          {s.problems.length > 0 && (
            <ul className="mt-2 space-y-1.5 text-sm text-amber-950 list-disc pl-5">
              {s.problems.map((p) => <li key={p}>{p}</li>)}
            </ul>
          )}
          {s.enabled && (
            <p className="mt-2 text-xs text-gray-600">
              Last 30 days: {s.counts.sent} sent · {s.counts.pending} waiting · {s.counts.failed} failed
            </p>
          )}
          {testMsg && <p role="status" className={`mt-2 text-sm ${testMsg.ok ? 'text-green-800' : 'text-red-700'}`}>{testMsg.text}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {s.enabled && (
            <button type="button" onClick={() => void sendTest()} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-60">
              <Send className="h-4 w-4" aria-hidden="true" />{busy ? 'Sending…' : 'Send test email'}
            </button>
          )}
          <button type="button" onClick={() => void load(true)} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-800 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />Check again
          </button>
        </div>
      </div>

      {s.recent.length > 0 && (
        <div className="mt-4">
          <button type="button" onClick={() => setShowLog((v) => !v)} aria-expanded={showLog} className="text-sm font-medium text-blue-700 hover:underline">
            {showLog ? 'Hide recent emails' : `Show recent emails (${s.recent.length})`}
          </button>
          {showLog && (
            <div className="relative overflow-x-auto mt-2">
              <table className="w-full text-sm min-w-[36rem]">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-200">
                    <th scope="col" className="text-left font-medium py-2 pr-3">When</th>
                    <th scope="col" className="text-left font-medium py-2 pr-3">Email</th>
                    <th scope="col" className="text-left font-medium py-2 pr-3">To</th>
                    <th scope="col" className="text-left font-medium py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {s.recent.map((r) => (
                    <tr key={r.id} className="border-b border-gray-100 align-top">
                      <td className="py-2 pr-3 whitespace-nowrap text-gray-600">{when(r.created_at)}</td>
                      <td className="py-2 pr-3 text-gray-800">{KIND_LABELS[r.kind] ?? r.kind}</td>
                      <td className="py-2 pr-3 text-gray-700 break-all">{r.to_addresses.split(';').join(', ')}</td>
                      <td className="py-2">
                        {r.status === 'sent' && <span className="text-green-800">Sent</span>}
                        {r.status === 'pending' && <span className="text-amber-800">Waiting{r.attempts ? ` (try ${r.attempts + 1})` : ''}</span>}
                        {r.status === 'failed' && (
                          <span className="text-red-700">
                            Failed{' '}
                            <button type="button" onClick={() => void retry(r.id)} className="ml-1 underline">Retry</button>
                          </span>
                        )}
                        {r.last_error && r.status !== 'sent' && <span className="block text-xs text-gray-500 break-words">{r.last_error}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
