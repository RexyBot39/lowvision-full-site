import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { CheckCircle, Clock, AlertTriangle, EyeOff, Eye, Trash2, XCircle } from 'lucide-react';
import { ContentPageLayout } from '../components/ui/ContentPageLayout';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { professions, SERVICE_MODES, AGE_GROUPS, PAYMENT_OPTIONS } from '../data/professions';

interface ListingForm {
  fullName: string;
  credentials: string;
  specialties: string[];
  practiceName: string;
  street: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  serviceArea: string;
  phone: string;
  publicEmail: string;
  website: string;
  serviceModes: string[];
  ageGroups: string[];
  payment: string[];
  languages: string;
  bio: string;
  licenseInfo: string;
}

interface OwnListing {
  id: number;
  status: 'pending' | 'approved' | 'rejected' | 'removed';
  listing: ListingForm;
  isPublic: boolean;
  hasPublishedVersion: boolean;
  ownerHidden: boolean;
  reviewNote: string | null;
  submittedAt: string;
  reviewedAt: string | null;
}

const EMPTY: ListingForm = {
  fullName: '', credentials: '', specialties: [], practiceName: '', street: '', city: '', region: '', postalCode: '',
  country: 'United States', serviceArea: '', phone: '', publicEmail: '', website: '', serviceModes: [], ageGroups: [],
  payment: [], languages: 'English', bio: '', licenseInfo: '',
};

const MANAGE_PATH = '/professionals/list-your-practice/manage';
const inputCls = 'w-full px-3 py-2.5 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600';
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString([], { dateStyle: 'medium' }) : '');

export function ManageListingPage() {
  const { user, loading } = useAuth();
  const [own, setOwn] = useState<OwnListing | null | undefined>(undefined);
  const [form, setForm] = useState<ListingForm>(EMPTY);
  const [attest, setAttest] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!user) return;
    api<{ listing: OwnListing | null }>('/directory/my-listing')
      .then((d) => {
        setOwn(d.listing);
        if (d.listing) setForm({ ...EMPTY, ...d.listing.listing });
        else setForm((f) => ({ ...f, fullName: user.name }));
        setEditing(!d.listing);
      })
      .catch((err) => setMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not load your listing.' }));
  }, [user]);

  if (loading) return <ContentPageLayout title="Your Directory Listing"><p role="status">Checking your account…</p></ContentPageLayout>;
  if (!user) return <Navigate to={`/login?redirectTo=${encodeURIComponent(MANAGE_PATH)}`} replace />;

  const set = <K extends keyof ListingForm>(key: K, value: ListingForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const toggle = (key: 'specialties' | 'serviceModes' | 'ageGroups' | 'payment', value: string) =>
    setForm((f) => ({ ...f, [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value] }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const errs: Record<string, string> = {};
    if (!form.fullName.trim()) errs.fullName = 'Enter your name.';
    if (form.specialties.length === 0) errs.specialties = 'Choose at least one profession.';
    if (form.specialties.length > 3) errs.specialties = 'Choose up to 3 professions.';
    if (!form.city.trim()) errs.city = 'Enter a city.';
    if (!form.region.trim()) errs.region = 'Enter a state or province.';
    if (form.serviceModes.length === 0) errs.serviceModes = 'Choose at least one way you see clients.';
    if (!form.phone.trim() && !form.publicEmail.trim() && !form.website.trim()) errs.contact = 'Add at least one way to contact you: phone, email or website.';
    if (!form.licenseInfo.trim()) errs.licenseInfo = 'Enter your license or certification details so we can verify them.';
    if (!attest) errs.attest = 'Please confirm the statement.';
    setErrors(errs);
    if (Object.keys(errs).length) {
      setMessage({ kind: 'error', text: 'Please fix the highlighted fields.' });
      return;
    }
    setSaving(true);
    try {
      const d = await api<{ listing: OwnListing }>('/directory/my-listing', { method: 'PUT', body: { listing: form, attest } });
      setOwn(d.listing);
      setForm({ ...EMPTY, ...d.listing.listing });
      setEditing(false);
      setAttest(false);
      setMessage({ kind: 'ok', text: d.listing.status === 'approved' ? 'Saved. No changes needed review.' : 'Submitted for review. Thank you!' });
      window.scrollTo(0, 0);
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      setMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not save. Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  async function setHidden(hidden: boolean) {
    try {
      const d = await api<{ listing: OwnListing }>('/directory/my-listing/visibility', { method: 'POST', body: { hidden } });
      setOwn(d.listing);
      setMessage({ kind: 'ok', text: hidden ? 'Your listing is hidden from the directory.' : 'Your listing is visible again.' });
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not update visibility.' });
    }
  }

  async function remove() {
    if (!window.confirm('Delete your listing permanently? This removes it from the directory right away.')) return;
    try {
      await api('/directory/my-listing', { method: 'DELETE', body: {} });
      setOwn(null);
      setForm({ ...EMPTY, fullName: user?.name ?? '' });
      setEditing(true);
      setMessage({ kind: 'ok', text: 'Your listing was deleted.' });
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not delete the listing.' });
    }
  }

  return (
    <ContentPageLayout
      title="Your Directory Listing"
      subtitle="Create or update your free listing in the Find a Professional directory."
      breadcrumbs={[{ label: 'For Professionals', href: '/professionals' }, { label: 'List Your Practice', href: '/professionals/list-your-practice' }, { label: 'Your Listing' }]}
    >
      <div className="space-y-8">
        {message && (
          <p role={message.kind === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-4 py-3 text-sm ${message.kind === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-green-200 bg-green-50 text-green-800'}`}>
            {message.text}
          </p>
        )}

        {own === undefined ? (
          <p role="status" className="text-gray-600">Loading your listing…</p>
        ) : (
          <>
            {own && <StatusPanel own={own} onHide={setHidden} onDelete={remove} onEdit={() => setEditing(true)} editing={editing} />}
            {own?.status === 'removed' ? null : editing ? (
              <ListingFormView form={form} set={set} toggle={toggle} errors={errors} attest={attest} setAttest={setAttest}
                saving={saving} onSubmit={save} isUpdate={!!own} onCancel={own ? () => { setEditing(false); setForm({ ...EMPTY, ...own.listing }); setErrors({}); } : undefined} />
            ) : null}
          </>
        )}
      </div>
    </ContentPageLayout>
  );
}

function StatusPanel({ own, onHide, onDelete, onEdit, editing }: {
  own: OwnListing; onHide: (hidden: boolean) => void; onDelete: () => void; onEdit: () => void; editing: boolean;
}) {
  const s = {
    pending: own.hasPublishedVersion
      ? { icon: Clock, tone: 'amber', title: 'Your changes are under review', text: 'Your previously approved listing stays visible in the directory until the changes are approved.' }
      : { icon: Clock, tone: 'amber', title: 'Submitted: under review', text: 'We check the license or certification you provided, usually within a few business days. We’ll email you the result, and you can check back here anytime.' },
    approved: { icon: CheckCircle, tone: 'green', title: own.ownerHidden ? 'Approved, but hidden by you' : 'Live in the directory', text: own.ownerHidden ? 'Your listing is approved but not shown. Make it visible again anytime.' : 'People can find you in the directory under each profession you chose.' },
    rejected: { icon: XCircle, tone: 'red', title: 'Changes needed', text: own.hasPublishedVersion ? 'Your latest changes weren\'t approved. Your previously approved listing is still visible.' : 'Your listing wasn\'t approved yet. Please update it and resubmit.' },
    removed: { icon: AlertTriangle, tone: 'red', title: 'Removed from the directory', text: 'This listing was removed by Low Vision Navigator. Contact us if you think this was a mistake.' },
  }[own.status];
  const tones: Record<string, string> = { amber: 'border-amber-200 bg-amber-50', green: 'border-green-200 bg-green-50', red: 'border-red-200 bg-red-50' };
  const Icon = s.icon;

  return (
    <section aria-label="Listing status" className={`rounded-xl border p-5 ${tones[s.tone]}`}>
      <div className="flex gap-3">
        <Icon className="h-6 w-6 shrink-0 text-gray-800" aria-hidden="true" />
        <div className="flex-1">
          <h2 className="font-semibold text-gray-900">{s.title}</h2>
          <p className="text-sm text-gray-700 mt-0.5">{s.text}</p>
          {own.reviewNote && (own.status === 'rejected' || own.status === 'removed') && (
            <p className="mt-2 text-sm text-gray-900"><strong>Note from our reviewer:</strong> {own.reviewNote}</p>
          )}
          <p className="mt-2 text-xs text-gray-600">Submitted {when(own.submittedAt)}{own.reviewedAt ? ` · Last reviewed ${when(own.reviewedAt)}` : ''}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {own.isPublic && <Link to={`/find-a-professional/p/${own.id}`} className="px-3 py-2 text-sm font-medium text-blue-800 bg-white border border-blue-200 rounded-lg hover:bg-blue-50">View public listing</Link>}
        {own.status !== 'removed' && !editing && (
          <button type="button" onClick={onEdit} className="px-3 py-2 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800">Edit listing</button>
        )}
        {own.hasPublishedVersion && own.status !== 'removed' && (
          <button type="button" onClick={() => onHide(!own.ownerHidden)} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-800 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
            {own.ownerHidden ? <><Eye className="h-4 w-4" aria-hidden="true" />Show in directory</> : <><EyeOff className="h-4 w-4" aria-hidden="true" />Hide from directory</>}
          </button>
        )}
        <button type="button" onClick={onDelete} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-50">
          <Trash2 className="h-4 w-4" aria-hidden="true" />Delete listing
        </button>
      </div>
    </section>
  );
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-800 mb-1.5">{label}</label>
      {hint && <p id={`${id}-hint`} className="text-xs text-gray-500 -mt-1 mb-1.5">{hint}</p>}
      {children}
      {error && <p id={`${id}-err`} role="alert" className="mt-1 text-sm text-red-700">{error}</p>}
    </div>
  );
}

function CheckGroup({ legend, name, options, values, onToggle, error, hint }: {
  legend: string; name: string; options: readonly { key: string; label: string }[]; values: string[]; onToggle: (v: string) => void; error?: string; hint?: string;
}) {
  return (
    <fieldset aria-describedby={error ? `${name}-err` : undefined}>
      <legend className="text-sm font-medium text-gray-800 mb-1.5">{legend}</legend>
      {hint && <p className="text-xs text-gray-500 -mt-1 mb-2">{hint}</p>}
      <div className="grid sm:grid-cols-2 gap-2">
        {options.map((o) => (
          <label key={o.key} className="flex items-start gap-2.5 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 cursor-pointer hover:border-blue-300">
            <input type="checkbox" name={name} checked={values.includes(o.key)} onChange={() => onToggle(o.key)} className="mt-0.5 h-5 w-5 rounded border-gray-300 text-blue-700 focus:ring-blue-600" />
            {o.label}
          </label>
        ))}
      </div>
      {error && <p id={`${name}-err`} role="alert" className="mt-1 text-sm text-red-700">{error}</p>}
    </fieldset>
  );
}

function ListingFormView({ form, set, toggle, errors, attest, setAttest, saving, onSubmit, isUpdate, onCancel }: {
  form: ListingForm;
  set: <K extends keyof ListingForm>(key: K, value: ListingForm[K]) => void;
  toggle: (key: 'specialties' | 'serviceModes' | 'ageGroups' | 'payment', value: string) => void;
  errors: Record<string, string>;
  attest: boolean;
  setAttest: (v: boolean) => void;
  saving: boolean;
  onSubmit: (e: React.FormEvent) => void;
  isUpdate: boolean;
  onCancel?: () => void;
}) {
  const professionOptions = professions.map((p) => ({ key: p.slug, label: p.label }));
  const text = (key: keyof ListingForm, props: { label: string; hint?: string; autoComplete?: string; type?: string; maxLength?: number; required?: boolean }) => (
    <Field id={`f-${key}`} label={`${props.label}${props.required ? '' : ' (optional)'}`} hint={props.hint} error={errors[key]}>
      <input id={`f-${key}`} type={props.type ?? 'text'} value={form[key] as string} onChange={(e) => set(key, e.target.value as never)}
        autoComplete={props.autoComplete} maxLength={props.maxLength ?? 200} className={inputCls}
        aria-invalid={!!errors[key]} aria-describedby={[props.hint && `f-${key}-hint`, errors[key] && `f-${key}-err`].filter(Boolean).join(' ') || undefined} />
    </Field>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-10" aria-busy={saving}>
      <section className="space-y-5" aria-labelledby="sec-who">
        <h2 id="sec-who" className="text-xl font-bold text-gray-900">About you</h2>
        <div className="grid sm:grid-cols-2 gap-5">
          {text('fullName', { label: 'Full name', autoComplete: 'name', maxLength: 100, required: true })}
          {text('credentials', { label: 'Credentials', hint: 'As you want them shown, e.g. "OD, FAAO" or "OTR/L, SCLV"', maxLength: 100 })}
        </div>
        <CheckGroup legend="Profession (choose up to 3)" name="specialties" options={professionOptions} values={form.specialties}
          onToggle={(v) => toggle('specialties', v)} error={errors.specialties} hint="Your listing appears under each profession you choose." />
        {text('practiceName', { label: 'Practice or organization', autoComplete: 'organization', maxLength: 150 })}
        <Field id="f-bio" label="About your services (optional)" hint="Up to 1,500 characters. Describe who you help and how." error={errors.bio}>
          <textarea id="f-bio" rows={6} maxLength={1500} value={form.bio} onChange={(e) => set('bio', e.target.value)} className={inputCls} aria-describedby="f-bio-hint" />
        </Field>
      </section>

      <section className="space-y-5" aria-labelledby="sec-where">
        <h2 id="sec-where" className="text-xl font-bold text-gray-900">Where and how you see clients</h2>
        {text('street', { label: 'Street address', hint: 'Shown publicly. Leave blank if you only offer telehealth or home visits.', autoComplete: 'street-address' })}
        <div className="grid sm:grid-cols-2 gap-5">
          {text('city', { label: 'City', autoComplete: 'address-level2', maxLength: 100, required: true })}
          {text('region', { label: 'State or province', autoComplete: 'address-level1', maxLength: 100, required: true })}
          {text('postalCode', { label: 'ZIP or postal code', autoComplete: 'postal-code', maxLength: 20 })}
          <Field id="f-country" label="Country">
            <select id="f-country" value={form.country} onChange={(e) => set('country', e.target.value)} className={`${inputCls} bg-white`}>
              {['United States', 'Canada', 'United Kingdom', 'Australia', 'Other'].map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
        </div>
        {text('serviceArea', { label: 'Area served', hint: 'e.g. "Greater Boston", "Statewide", "Telehealth across Ohio"' })}
        <CheckGroup legend="How you see clients" name="serviceModes" options={SERVICE_MODES} values={form.serviceModes} onToggle={(v) => toggle('serviceModes', v)} error={errors.serviceModes} />
        <CheckGroup legend="Ages served (optional)" name="ageGroups" options={AGE_GROUPS} values={form.ageGroups} onToggle={(v) => toggle('ageGroups', v)} />
        <CheckGroup legend="Payment accepted (optional)" name="payment" options={PAYMENT_OPTIONS} values={form.payment} onToggle={(v) => toggle('payment', v)} />
        {text('languages', { label: 'Languages', hint: 'e.g. "English, Spanish, ASL"' })}
      </section>

      <section className="space-y-5" aria-labelledby="sec-contact">
        <h2 id="sec-contact" className="text-xl font-bold text-gray-900">Public contact details</h2>
        <p className="text-sm text-gray-600 -mt-2">Add at least one. Only what you enter here is shown publicly.</p>
        {errors.contact && <p role="alert" className="text-sm text-red-700">{errors.contact}</p>}
        <div className="grid sm:grid-cols-2 gap-5">
          {text('phone', { label: 'Phone', type: 'tel', autoComplete: 'tel', maxLength: 40 })}
          {text('publicEmail', { label: 'Public email', type: 'email', autoComplete: 'email', maxLength: 254 })}
        </div>
        {text('website', { label: 'Website', type: 'url', autoComplete: 'url', hint: 'e.g. www.example.com' })}
      </section>

      <section className="space-y-5" aria-labelledby="sec-verify">
        <h2 id="sec-verify" className="text-xl font-bold text-gray-900">Verification (private)</h2>
        {text('licenseInfo', { label: 'License or certification', required: true, hint: 'e.g. "Optometry license #12345, Massachusetts" or "ACVREP COMS #6789". Used only to verify your listing; never shown publicly.' })}
        <div>
          <label className="flex items-start gap-3 text-sm text-gray-800">
            <input type="checkbox" checked={attest} onChange={(e) => setAttest(e.target.checked)} className="mt-0.5 h-5 w-5 rounded border-gray-300 text-blue-700 focus:ring-blue-600" aria-invalid={!!errors.attest} />
            <span>I confirm that I am the professional named in this listing (or authorized to list them), that the information is accurate, and that I hold the licenses or certifications listed. I understand Low Vision Navigator may verify credentials and may decline or remove listings.</span>
          </label>
          {errors.attest && <p role="alert" className="mt-1 text-sm text-red-700">{errors.attest}</p>}
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={saving} className="px-6 py-3 text-base font-semibold text-white bg-blue-700 rounded-xl hover:bg-blue-800 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2">
          {saving ? 'Submitting…' : isUpdate ? 'Submit changes for review' : 'Submit listing for review'}
        </button>
        {onCancel && <button type="button" onClick={onCancel} className="px-5 py-3 text-base font-medium text-gray-800 border border-gray-300 rounded-xl hover:bg-gray-50">Cancel</button>}
      </div>
    </form>
  );
}
