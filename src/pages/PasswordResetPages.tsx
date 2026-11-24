import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle, Eye, EyeOff, Loader2, Mail } from 'lucide-react';
import { PageSEO } from '../components/seo/PageSEO';
import { api, ApiError } from '../lib/api';

function Shell({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-12">
      <PageSEO title={title} description={intro} noIndex />
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-block mb-4">
            <img src="/logo.png" alt="Low Vision Navigator" width={864} height={240} className="h-14 w-auto mx-auto" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          <p className="text-base text-gray-600 mt-2">{intro}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">{children}</div>
        <p className="mt-6 text-center">
          <Link to="/login" className="text-sm font-medium text-blue-700 hover:underline">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}

function ErrorBox({ text }: { text: string }) {
  return (
    <div className="mb-5 flex gap-2.5 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800" role="alert">
      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}

const inputCls = 'w-full px-3.5 py-2.5 text-base border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent';
const buttonCls = 'w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-700 text-white text-base font-semibold rounded-xl hover:bg-blue-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:opacity-50';

// ── /forgot-password ─────────────────────────────────────────────────────────

export function ForgotPasswordPage() {
  const location = useLocation();
  const prefill = (location.state as { email?: string } | null)?.email ?? '';
  const [email, setEmail] = useState(prefill);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<{ emailEnabled: boolean } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    setSending(true);
    try {
      const d = await api<{ ok: boolean; emailEnabled: boolean }>('/auth/forgot', { method: 'POST', body: { email: email.trim() } });
      setSent({ emailEnabled: d.emailEnabled });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <Shell title="Check your email" intro="If there's an account for that address, a reset link is on its way.">
        {sent.emailEnabled ? (
          <div className="space-y-3 text-gray-700" role="status">
            <Mail className="h-8 w-8 text-blue-700" aria-hidden="true" />
            <p>We sent a link to <strong>{email.trim()}</strong> if it matches an account. It works once and expires in 1 hour.</p>
            <p className="text-sm text-gray-600">Don't see it after a few minutes? Check your spam folder, or try again.</p>
            <button type="button" onClick={() => setSent(null)} className="text-sm font-medium text-blue-700 hover:underline">Send another link</button>
          </div>
        ) : (
          <div className="flex gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900" role="status">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Password reset emails aren't available on this site yet. Please{' '}
              <Link to="/about/contact" className="font-medium underline">contact us</Link> and we'll help you get back into your account.
            </span>
          </div>
        )}
      </Shell>
    );
  }

  return (
    <Shell title="Forgot your password?" intro="Enter the email you use to sign in. We'll email you a link to choose a new password.">
      {error && <ErrorBox text={error} />}
      <form onSubmit={submit} noValidate className="space-y-4" aria-busy={sending}>
        <div>
          <label htmlFor="forgot-email" className="block text-sm font-medium text-gray-700 mb-1.5">Email address</label>
          <input id="forgot-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={inputCls} />
        </div>
        <button type="submit" disabled={sending} className={buttonCls}>
          {sending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Email me a reset link
        </button>
      </form>
      <p className="mt-4 text-sm text-gray-600">
        Signed up with Google? Use <Link to="/login" className="text-blue-700 hover:underline">Continue with Google</Link>, or request a link here to add a password.
      </p>
    </Shell>
  );
}

// ── /reset-password?token=… ──────────────────────────────────────────────────

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const [token] = useState(() => params.get('token') ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  // Keep the one-time token out of the address bar and browser history.
  useEffect(() => {
    if (params.get('token')) window.history.replaceState(null, '', '/reset-password');
  }, [params]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    setSaving(true);
    try {
      await api('/auth/reset', { method: 'POST', body: { token, password } });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (!token) {
    return (
      <Shell title="Reset link missing" intro="This page needs the link from your password reset email.">
        <Link to="/forgot-password" className={buttonCls}>Request a new link</Link>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell title="Password changed" intro="You're signed in with your new password.">
        <div className="space-y-4" role="status">
          <p className="flex gap-2 text-gray-700"><CheckCircle className="h-5 w-5 text-green-700 shrink-0" aria-hidden="true" />For your security, we signed you out on your other devices.</p>
          {/* Full page load, so the whole site picks up the new sign-in. */}
          <a href="/saved-plan" className={buttonCls}>Continue</a>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title="Choose a new password" intro="Use at least 8 characters. A short phrase is easy to remember and hard to guess.">
      {error && (
        <>
          <ErrorBox text={error} />
          {/invalid or has expired/.test(error) && (
            <p className="-mt-2 mb-4 text-sm"><Link to="/forgot-password" className="font-medium text-blue-700 hover:underline">Request a new reset link</Link></p>
          )}
        </>
      )}
      <form onSubmit={submit} noValidate className="space-y-4" aria-busy={saving}>
        <div>
          <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-1.5">New password</label>
          <div className="relative">
            <input id="new-password" type={show ? 'text' : 'password'} autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required className={`${inputCls} pr-11`} />
            <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700">
              {show ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
            </button>
          </div>
        </div>
        <div>
          <label htmlFor="confirm-new-password" className="block text-sm font-medium text-gray-700 mb-1.5">Confirm new password</label>
          <input id="confirm-new-password" type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required className={inputCls} />
        </div>
        <button type="submit" disabled={saving} className={buttonCls}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Save new password
        </button>
      </form>
    </Shell>
  );
}
