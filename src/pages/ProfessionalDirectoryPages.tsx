import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Search, MapPin, Phone, Globe, Mail, Video, Home, Building2, ArrowRight, CheckCircle, Info, UserPlus, ShieldCheck } from 'lucide-react';
import { ContentPageLayout } from '../components/ui/ContentPageLayout';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { professions, professionBySlug, labelFor, AGE_GROUPS, PAYMENT_OPTIONS, SERVICE_MODES } from '../data/professions';

const DOMAIN = 'https://lowvisionnavigator.org';
const DIRECTORY = { label: 'Find a Professional', href: '/find-a-professional' };

export interface PublicListing {
  id: number;
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
  updatedAt?: string;
}

const professionName = (slug: string) => professionBySlug(slug)?.singular ?? slug;
const displayHost = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
};

const MODE_ICONS: Record<string, typeof Video> = { inPerson: Building2, telehealth: Video, homeVisits: Home };

function Disclaimer() {
  return (
    <div className="flex gap-3 rounded-xl border border-gray-200 bg-white p-4">
      <ShieldCheck className="h-5 w-5 text-blue-700 shrink-0 mt-0.5" aria-hidden="true" />
      <p className="text-sm text-gray-600 leading-relaxed">
        Listings are submitted by the professionals themselves. Low Vision Navigator reviews each listing and the credentials it claims before publishing, but doesn't endorse any provider. Check licensure, fees and insurance directly with the provider.
      </p>
    </div>
  );
}

function ListYourPracticeBanner() {
  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
      <UserPlus className="h-7 w-7 text-teal-700 shrink-0" aria-hidden="true" />
      <div className="flex-1">
        <h2 className="font-semibold text-gray-900">Are you a vision professional?</h2>
        <p className="text-sm text-gray-700 mt-0.5">Listing is free. Add your practice so people with low vision and their families can find you.</p>
      </div>
      <Link to="/professionals/list-your-practice" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2">
        List your practice <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  );
}

// ── listing card ─────────────────────────────────────────────────────────────

export function ListingCard({ p }: { p: PublicListing }) {
  const place = [p.city, p.region].filter(Boolean).join(', ');
  return (
    <li className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            <Link to={`/find-a-professional/p/${p.id}`} className="hover:text-blue-800 hover:underline">
              {p.fullName}{p.credentials ? `, ${p.credentials}` : ''}
            </Link>
          </h3>
          <p className="text-sm text-blue-800 font-medium">{p.specialties.map(professionName).join(' · ')}</p>
          {p.practiceName && <p className="text-sm text-gray-700">{p.practiceName}</p>}
        </div>
        {place && (
          <p className="flex items-center gap-1 text-sm text-gray-600">
            <MapPin className="h-4 w-4" aria-hidden="true" /> {place}
          </p>
        )}
      </div>
      <ul className="mt-3 flex flex-wrap gap-2" aria-label="How they see clients">
        {p.serviceModes.map((m) => {
          const Icon = MODE_ICONS[m] ?? Building2;
          return (
            <li key={m} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
              <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {labelFor(SERVICE_MODES, m)}
            </li>
          );
        })}
      </ul>
      {p.bio && <p className="mt-3 text-sm text-gray-700 line-clamp-3">{p.bio}</p>}
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {p.phone && <a href={`tel:${p.phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1.5 text-blue-700 hover:underline"><Phone className="h-4 w-4" aria-hidden="true" />{p.phone}</a>}
        {p.website && <a href={p.website} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1.5 text-blue-700 hover:underline"><Globe className="h-4 w-4" aria-hidden="true" />{displayHost(p.website)}<span className="sr-only"> (opens in a new tab)</span></a>}
        <Link to={`/find-a-professional/p/${p.id}`} className="inline-flex items-center gap-1 font-medium text-blue-700 hover:underline">
          Full profile<span className="sr-only"> for {p.fullName}</span> <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </li>
  );
}

// ── directory (all, or one profession) ───────────────────────────────────────

export function FindProfessionalPage() {
  const { specialty: specialtyParam } = useParams();
  const profession = specialtyParam ? professionBySlug(specialtyParam) : undefined;

  const [specialty, setSpecialty] = useState(profession?.slug ?? '');
  const [q, setQ] = useState('');
  const [telehealth, setTelehealth] = useState(false);
  const [age, setAge] = useState('');
  const [payment, setPayment] = useState('');
  const [results, setResults] = useState<PublicListing[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState('');

  useEffect(() => setSpecialty(profession?.slug ?? ''), [profession?.slug]);

  useEffect(() => {
    api<{ counts: Record<string, number> }>('/directory/summary').then((d) => setCounts(d.counts)).catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (specialty) params.set('specialty', specialty);
    if (q.trim()) params.set('q', q.trim());
    if (telehealth) params.set('telehealth', '1');
    if (age) params.set('age', age);
    if (payment) params.set('payment', payment);
    const t = setTimeout(() => {
      api<{ professionals: PublicListing[] }>(`/directory/professionals?${params}`)
        .then((d) => { setResults(d.professionals); setError(''); })
        .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load the directory.'));
    }, 250);
    return () => clearTimeout(t);
  }, [specialty, q, telehealth, age, payment]);

  if (specialtyParam && !profession) return <Navigate to="/find-a-professional" replace />;

  const title = profession ? `Find ${profession.label}` : 'Find a Professional';
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    url: `${DOMAIN}/find-a-professional${profession ? `/${profession.slug}` : ''}`,
  };

  return (
    <ContentPageLayout
      title={title}
      subtitle={profession ? profession.description : 'Low vision specialists, therapists, teachers and counselors who list themselves on Low Vision Navigator. Search by profession, location and how they see clients.'}
      description={profession ? `Find ${profession.label.toLowerCase()} near you or by telehealth. ${profession.description}` : 'Find low vision optometrists, occupational therapists, O&M specialists, vision rehabilitation therapists, TVIs, counselors and other vision professionals.'}
      breadcrumbs={profession ? [DIRECTORY, { label: profession.label }] : [{ label: 'Find a Professional' }]}
      schema={schema}
    >
      <div className="space-y-8">
        {profession ? (
          <section aria-labelledby="about-heading" className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 id="about-heading" className="font-semibold text-gray-900">When to see a {profession.singular.toLowerCase()}</h2>
            <ul className="mt-2 space-y-1.5">
              {profession.whenToSee.map((w) => (
                <li key={w} className="flex gap-2 text-sm text-gray-700"><CheckCircle className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" aria-hidden="true" />{w}</li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-gray-600"><strong>Credentials:</strong> {profession.credentials}</p>
          </section>
        ) : (
          <section aria-labelledby="browse-heading">
            <h2 id="browse-heading" className="text-xl font-bold text-gray-900 mb-4">Browse by profession</h2>
            <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {professions.map((p) => (
                <li key={p.slug}>
                  <Link to={`/find-a-professional/${p.slug}`} className="flex items-center justify-between gap-3 h-full rounded-xl border border-gray-200 bg-white px-4 py-3 hover:border-blue-400 hover:shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700">
                    <span className="text-sm font-medium text-gray-900">{p.label}</span>
                    {counts[p.slug] ? <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800">{counts[p.slug]}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="search-heading" className="space-y-4">
          <h2 id="search-heading" className="text-xl font-bold text-gray-900">{profession ? 'Search listings' : 'Search all listings'}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="relative sm:col-span-2">
              <span className="sr-only">Search by name, city, state or ZIP</span>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, city, state or ZIP"
                className="w-full pl-9 pr-3 py-2.5 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600" />
            </label>
            {!profession && (
              <label className="block">
                <span className="sr-only">Profession</span>
                <select value={specialty} onChange={(e) => setSpecialty(e.target.value)} className="w-full px-3 py-2.5 text-base border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600">
                  <option value="">All professions</option>
                  {professions.map((p) => <option key={p.slug} value={p.slug}>{p.label}</option>)}
                </select>
              </label>
            )}
            <label className="block">
              <span className="sr-only">Ages served</span>
              <select value={age} onChange={(e) => setAge(e.target.value)} className="w-full px-3 py-2.5 text-base border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600">
                <option value="">Any age</option>
                {AGE_GROUPS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="sr-only">Payment accepted</span>
              <select value={payment} onChange={(e) => setPayment(e.target.value)} className="w-full px-3 py-2.5 text-base border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600">
                <option value="">Any payment</option>
                {PAYMENT_OPTIONS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-800 py-2.5">
              <input type="checkbox" checked={telehealth} onChange={(e) => setTelehealth(e.target.checked)} className="h-5 w-5 rounded border-gray-300 text-blue-700 focus:ring-blue-600" />
              Offers telehealth
            </label>
          </div>

          <p className="text-sm text-gray-600" role="status">
            {error ? '' : results === null ? 'Loading listings…' : `${results.length} ${results.length === 1 ? 'professional' : 'professionals'} found`}
          </p>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          {results && results.length > 0 && (
            <ul className="space-y-3">{results.map((p) => <ListingCard key={p.id} p={p} />)}</ul>
          )}
          {results && results.length === 0 && !error && (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center">
              <p className="text-gray-700">No listings match yet. Try removing a filter, or find services through our <Link to="/resources" className="text-blue-700 hover:underline">resource directory</Link>.</p>
            </div>
          )}
        </section>

        <ListYourPracticeBanner />
        <Disclaimer />
      </div>
    </ContentPageLayout>
  );
}

// ── one listing ──────────────────────────────────────────────────────────────

export function ProfessionalProfilePage() {
  const { id } = useParams();
  const [p, setP] = useState<PublicListing | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ professional: PublicListing }>(`/directory/professionals/${encodeURIComponent(id ?? '')}`)
      .then((d) => setP(d.professional))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load this listing.'));
  }, [id]);

  const address = p ? [p.street, [p.city, p.region].filter(Boolean).join(', '), p.postalCode, p.country].filter(Boolean).join(' · ') : '';

  return (
    <ContentPageLayout
      title={p ? `${p.fullName}${p.credentials ? `, ${p.credentials}` : ''}` : error ? 'Listing not available' : 'Loading…'}
      subtitle={p ? p.specialties.map(professionName).join(' · ') : undefined}
      breadcrumbs={[DIRECTORY, { label: p?.fullName ?? 'Profile' }]}
    >
      {error ? (
        <div className="space-y-4">
          <p className="text-gray-700">{error}</p>
          <Link to="/find-a-professional" className="text-blue-700 hover:underline">Back to the directory</Link>
        </div>
      ) : !p ? (
        <p className="text-gray-600" role="status">Loading listing…</p>
      ) : (
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            {p.practiceName && <p className="text-lg font-medium text-gray-900">{p.practiceName}</p>}
            {p.bio && (
              <section aria-labelledby="bio-heading">
                <h2 id="bio-heading" className="text-xl font-bold text-gray-900 mb-2">About</h2>
                <p className="text-gray-700 leading-relaxed whitespace-pre-line">{p.bio}</p>
              </section>
            )}
            <section aria-labelledby="services-heading">
              <h2 id="services-heading" className="text-xl font-bold text-gray-900 mb-3">Services</h2>
              <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
                <Detail term="How they see clients" value={p.serviceModes.map((m) => labelFor(SERVICE_MODES, m)).join(', ')} />
                <Detail term="Ages served" value={p.ageGroups.map((a) => labelFor(AGE_GROUPS, a)).join(', ')} />
                <Detail term="Payment accepted" value={p.payment.map((a) => labelFor(PAYMENT_OPTIONS, a)).join(', ')} />
                <Detail term="Languages" value={p.languages} />
                <Detail term="Area served" value={p.serviceArea} />
              </dl>
            </section>
            <Disclaimer />
          </div>

          <aside aria-label="Contact" className="space-y-4">
            <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
              <h2 className="font-semibold text-gray-900">Contact</h2>
              {address && <p className="flex gap-2 text-sm text-gray-700"><MapPin className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />{address}</p>}
              {p.phone && <a href={`tel:${p.phone.replace(/[^\d+]/g, '')}`} className="flex gap-2 text-sm text-blue-700 hover:underline"><Phone className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />{p.phone}</a>}
              {p.publicEmail && <a href={`mailto:${p.publicEmail}`} className="flex gap-2 text-sm text-blue-700 hover:underline break-all"><Mail className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />{p.publicEmail}</a>}
              {p.website && <a href={p.website} target="_blank" rel="noopener noreferrer nofollow" className="flex gap-2 text-sm text-blue-700 hover:underline break-all"><Globe className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />{displayHost(p.website)}<span className="sr-only"> (opens in a new tab)</span></a>}
            </div>
            <div className="flex flex-wrap gap-2">
              {p.specialties.map((s) => (
                <Link key={s} to={`/find-a-professional/${s}`} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800 hover:bg-blue-100">
                  More {professionBySlug(s)?.label.toLowerCase() ?? s}
                </Link>
              ))}
            </div>
            <p className="text-xs text-gray-500">
              Is this you? <Link to="/professionals/list-your-practice/manage" className="text-blue-700 hover:underline">Manage your listing</Link>.
            </p>
          </aside>
        </div>
      )}
    </ContentPageLayout>
  );
}

function Detail({ term, value }: { term: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">{term}</dt>
      <dd className="mt-0.5 text-gray-800">{value}</dd>
    </div>
  );
}

// ── landing page for professionals ───────────────────────────────────────────

export function ListYourPracticePage() {
  const { user } = useAuth();
  const steps = [
    { t: 'Create a free account', d: 'Or sign in if you already have one. One account manages one listing.' },
    { t: 'Fill in your listing', d: 'Your professions (up to 3), where and how you see clients, ages served, payment accepted and a short bio.' },
    { t: 'We review it', d: 'We check the license or certification you provide. Approved listings appear in the directory under each profession you chose.' },
    { t: 'Keep it current', d: 'Edit anytime. Changes are reviewed too, and your approved listing stays visible meanwhile. You can hide or delete it whenever you like.' },
  ];
  const manageHref = '/professionals/list-your-practice/manage';
  const ctaHref = user ? manageHref : `/login?mode=signup&redirectTo=${encodeURIComponent(manageHref)}`;

  return (
    <ContentPageLayout
      title="List Your Practice"
      subtitle="A free listing in the Low Vision Navigator directory helps people with vision loss, their families and referring clinicians find you."
      description="Vision professionals can list themselves for free in the Low Vision Navigator directory: low vision optometrists, OTs, CVRTs, O&M specialists, TVIs, counselors and more."
      breadcrumbs={[{ label: 'For Professionals', href: '/professionals' }, { label: 'List Your Practice' }]}
    >
      <div className="space-y-10">
        <div className="flex flex-wrap gap-3">
          <Link to={ctaHref} className="inline-flex items-center gap-1.5 px-5 py-3 text-base font-semibold text-white bg-blue-700 rounded-xl hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2">
            {user ? 'Create or edit your listing' : 'Get started (free)'} <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </Link>
          {!user && (
            <Link to={`/login?redirectTo=${encodeURIComponent(manageHref)}`} className="inline-flex items-center px-5 py-3 text-base font-medium text-gray-800 border border-gray-300 rounded-xl hover:bg-gray-50">
              I already have an account
            </Link>
          )}
        </div>

        <section aria-labelledby="who-heading">
          <h2 id="who-heading" className="text-xl font-bold text-gray-900 mb-3">Who can list</h2>
          <p className="text-gray-700 mb-4">Licensed or certified professionals who serve people with low vision or blindness, in {professions.length} categories:</p>
          <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
            {professions.map((p) => (
              <li key={p.slug} className="text-sm text-gray-700"><span className="font-medium text-gray-900">{p.label}</span> <span className="text-gray-500">({p.credentials})</span></li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="how-heading">
          <h2 id="how-heading" className="text-xl font-bold text-gray-900 mb-4">How it works</h2>
          <ol className="space-y-4">
            {steps.map((s, i) => (
              <li key={s.t} className="flex gap-4">
                <span className="w-8 h-8 rounded-full bg-blue-700 text-white font-bold text-sm flex items-center justify-center shrink-0">{i + 1}</span>
                <div>
                  <h3 className="font-semibold text-gray-900">{s.t}</h3>
                  <p className="text-sm text-gray-700 mt-0.5">{s.d}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="rules-heading" className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 id="rules-heading" className="font-semibold text-gray-900 flex items-center gap-2"><Info className="h-5 w-5 text-blue-700" aria-hidden="true" />Listing guidelines</h2>
          <ul className="mt-3 space-y-1.5 text-sm text-gray-700 list-disc pl-5">
            <li>Listings are free. There are no paid placements or rankings.</li>
            <li>List yourself, or a professional you're authorized to list. One listing per account.</li>
            <li>Your license or certification details are used only for verification and are never shown publicly.</li>
            <li>Only the contact details you choose to share are public.</li>
            <li>We may decline or remove listings that are inaccurate, promotional, or outside the scope of low vision and blindness services.</li>
          </ul>
        </section>

        <p className="text-sm text-gray-600">
          Looking for a professional instead? <Link to="/find-a-professional" className="text-blue-700 hover:underline">Search the directory</Link>.
        </p>
      </div>
    </ContentPageLayout>
  );
}
