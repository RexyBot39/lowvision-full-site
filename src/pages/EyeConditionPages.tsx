import type { ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle, ExternalLink, FlaskConical, Dna, BookOpen, Info } from 'lucide-react';
import { ContentPageLayout } from '../components/ui/ContentPageLayout';
import {
  eyeConditions,
  otherInheritedConditions,
  getCondition,
  CONDITIONS_LAST_REVIEWED,
  CONDITIONS_LAST_REVIEWED_ISO,
  type EyeCondition,
  type LinkItem,
} from '../data/eyeConditions';

const DOMAIN = 'https://lowvisionnavigator.org';
const HUB = { label: 'Eye Conditions', href: '/eye-conditions' };

// ── shared bits ──────────────────────────────────────────────────────────────

function SmartLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  if (/^https?:\/\//.test(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {children}
        <ExternalLink className="inline h-3.5 w-3.5 ml-1 -mt-0.5" aria-hidden="true" />
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  }
  return <Link to={href} className={className}>{children}</Link>;
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="text-xl sm:text-2xl font-bold text-gray-900 mb-4">{title}</h2>
      {children}
    </section>
  );
}

function Prose({ paragraphs }: { paragraphs: string[] }) {
  return (
    <div className="space-y-3">
      {paragraphs.map((p) => (
        <p key={p.slice(0, 40)} className="text-gray-700 leading-relaxed">{p}</p>
      ))}
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item} className="flex gap-2.5 text-gray-700 leading-relaxed">
          <span className="mt-2 h-1.5 w-1.5 rounded-full bg-blue-600 shrink-0" aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function ReviewedNote() {
  return (
    <p className="text-sm text-gray-500">
      Last reviewed {CONDITIONS_LAST_REVIEWED}. Treatments and trials change quickly; check with your eye doctor about what applies to you.
    </p>
  );
}

const trialsUrl = (query: string) => `https://clinicaltrials.gov/search?cond=${encodeURIComponent(query)}`;

// ── hub ──────────────────────────────────────────────────────────────────────

function ConditionCard({ c }: { c: EyeCondition }) {
  return (
    <li>
      <Link
        to={`/eye-conditions/${c.slug}`}
        className="group block h-full bg-white rounded-xl border border-gray-200 p-5 hover:border-blue-400 hover:shadow-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
      >
        <h3 className="text-base font-semibold text-gray-900 group-hover:text-blue-800">{c.name}</h3>
        <p className="mt-1.5 text-sm text-gray-600 leading-relaxed">{c.summary}</p>
        <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-blue-700">
          Read the guide <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </Link>
    </li>
  );
}

export function EyeConditionsHubPage() {
  const common = eyeConditions.filter((c) => c.group === 'common');
  const inherited = eyeConditions.filter((c) => c.group === 'inherited');
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Eye Conditions That Cause Low Vision',
    url: `${DOMAIN}/eye-conditions`,
    hasPart: eyeConditions.map((c) => ({ '@type': 'MedicalWebPage', name: c.name, url: `${DOMAIN}/eye-conditions/${c.slug}` })),
  };

  return (
    <ContentPageLayout
      title="Eye Conditions"
      subtitle="Plain-language guides to the conditions that most often cause low vision: what each one does to vision, today's treatments, and what helps day to day."
      description="Guides to macular degeneration, glaucoma, diabetic eye disease, CVI, retinitis pigmentosa, Stargardt disease, Usher syndrome and LCA, with treatments, genetic testing, clinical trials and practical low vision help."
      breadcrumbs={[{ label: 'Eye Conditions' }]}
      schema={schema}
    >
      <div className="space-y-12">
        <Section id="common-heading" title="Most common causes of low vision">
          <ul className="grid sm:grid-cols-2 gap-4">{common.map((c) => <ConditionCard key={c.slug} c={c} />)}</ul>
        </Section>

        <Section id="inherited-heading" title="Inherited retinal diseases">
          <p className="text-gray-700 leading-relaxed mb-5">
            Inherited retinal diseases (IRDs) are caused by changes in genes the retina needs. More than 300 genes are known. A genetic diagnosis matters more than ever, because new treatments and most clinical trials target specific genes.
          </p>
          <ul className="grid sm:grid-cols-2 gap-4">{inherited.map((c) => <ConditionCard key={c.slug} c={c} />)}</ul>

          <h3 className="text-lg font-semibold text-gray-900 mt-8 mb-3">Other inherited retinal diseases</h3>
          <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
            {otherInheritedConditions.map((o) => (
              <li key={o.name} className="text-sm leading-relaxed">
                <SmartLink href={o.href} className="font-semibold text-blue-700 hover:underline">{o.name}</SmartLink>
                <span className="text-gray-600">: {o.summary}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-gray-500">These links go to the Foundation Fighting Blindness, which has detailed pages on rare retinal diseases.</p>
        </Section>

        <Section id="next-heading" title="Research, genetics and terms">
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { icon: Dna, title: 'Genetic testing', text: 'Why it matters, how to get tested (including at no cost), and what results mean.', href: '/eye-conditions/genetic-testing' },
              { icon: FlaskConical, title: 'Clinical trials & research', text: 'Approved treatments, how to find and judge a trial, and how to avoid unproven clinics.', href: '/eye-conditions/clinical-trials' },
              { icon: BookOpen, title: 'Glossary', text: 'Plain-language definitions of the terms you\'ll hear at the eye doctor.', href: '/glossary' },
            ].map(({ icon: Icon, title, text, href }) => (
              <Link key={href} to={href} className="block bg-blue-50 rounded-xl border border-blue-100 p-5 hover:border-blue-300 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700">
                <Icon className="h-6 w-6 text-blue-700 mb-2" aria-hidden="true" />
                <h3 className="font-semibold text-gray-900">{title}</h3>
                <p className="mt-1 text-sm text-gray-600">{text}</p>
              </Link>
            ))}
          </div>
        </Section>

        <div className="rounded-xl border border-gray-200 bg-white p-5 flex gap-3">
          <Info className="h-5 w-5 text-blue-700 shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-sm text-gray-700 leading-relaxed">
            Whatever the condition, low vision rehabilitation can help you keep doing what matters to you.{' '}
            <Link to="/intake/start" className="font-medium text-blue-700 hover:underline">Take the 2–6 minute intake</Link> to get a personal plan, or{' '}
            <Link to="/resources" className="font-medium text-blue-700 hover:underline">find services near you</Link>.
          </p>
        </div>
        <ReviewedNote />
      </div>
    </ContentPageLayout>
  );
}

// ── condition page ───────────────────────────────────────────────────────────

export function EyeConditionPage() {
  const { slug = '' } = useParams();
  const c = getCondition(slug);
  if (!c) return <Navigate to="/eye-conditions" replace />;

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'MedicalWebPage',
    name: c.name,
    url: `${DOMAIN}/eye-conditions/${c.slug}`,
    lastReviewed: CONDITIONS_LAST_REVIEWED_ISO,
    audience: { '@type': 'PeopleAudience', audienceType: 'Patients and caregivers' },
    about: {
      '@type': 'MedicalCondition',
      name: c.name,
      ...(c.alternateNames ? { alternateName: c.alternateNames } : {}),
      possibleTreatment: c.treatments.items.map((t) => ({ '@type': 'MedicalTherapy', name: t.name })),
    },
  };

  return (
    <ContentPageLayout
      title={c.name}
      subtitle={c.summary}
      description={`${c.summary} Symptoms, treatments as of ${CONDITIONS_LAST_REVIEWED}, and practical low vision help.`}
      breadcrumbs={[HUB, { label: c.shortName }]}
      schema={schema}
      showDisclaimer
    >
      <div className="space-y-12">
        <dl className="grid sm:grid-cols-2 gap-px rounded-xl overflow-hidden border border-gray-200 bg-gray-200">
          {c.quickFacts.map((f) => (
            <div key={f.label} className="bg-white p-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">{f.label}</dt>
              <dd className="mt-1 text-gray-900">{f.value}</dd>
            </div>
          ))}
        </dl>

        {c.urgent && (
          <div role="note" className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
            <AlertTriangle className="h-5 w-5 text-red-700 shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-sm text-red-900 leading-relaxed"><strong>Urgent:</strong> {c.urgent}</p>
          </div>
        )}

        <Section id="what-heading" title={`What is ${c.shortName.replace(/ \(.*\)$/, '')}?`}>
          <Prose paragraphs={c.whatItIs} />
        </Section>

        <Section id="vision-heading" title="How it affects vision">
          <Prose paragraphs={c.howItAffectsVision} />
          <h3 className="text-base font-semibold text-gray-900 mt-6 mb-3">Everyday tasks that often get harder</h3>
          <Bullets items={c.dailyImpacts} />
        </Section>

        {c.warningSigns && (
          <Section id="signs-heading" title="Warning signs">
            {c.warningSigns.intro && <p className="text-gray-700 mb-3">{c.warningSigns.intro}</p>}
            <Bullets items={c.warningSigns.items} />
          </Section>
        )}

        <Section id="causes-heading" title={c.causes.heading}>
          {c.causes.paragraphs.length > 0 && <div className="mb-4"><Prose paragraphs={c.causes.paragraphs} /></div>}
          {c.causes.bullets && <Bullets items={c.causes.bullets} />}
        </Section>

        <Section id="treatment-heading" title="Treatment today">
          <p className="text-gray-700 mb-4">{c.treatments.intro}</p>
          <div className="space-y-3">
            {c.treatments.items.map((t) => (
              <div key={t.name} className="rounded-xl border border-gray-200 bg-white p-5">
                <h3 className="font-semibold text-gray-900">{t.name}</h3>
                <p className="mt-1.5 text-sm text-gray-700 leading-relaxed">{t.detail}</p>
              </div>
            ))}
          </div>
          {c.treatments.note && <p className="mt-4 text-gray-700">{c.treatments.note}</p>}
        </Section>

        <Section id="helps-heading" title="What helps day to day">
          <ul className="grid sm:grid-cols-2 gap-4">
            {c.whatHelps.map((h) => (
              <li key={h.title} className="rounded-xl border border-teal-100 bg-teal-50/60 p-5">
                <h3 className="font-semibold text-gray-900">{h.title}</h3>
                <p className="mt-1.5 text-sm text-gray-700 leading-relaxed">{h.detail}</p>
                {h.link && (
                  <SmartLink href={h.link.href} className="mt-2 inline-flex items-center text-sm font-medium text-teal-800 hover:underline">
                    {h.link.label}
                  </SmartLink>
                )}
              </li>
            ))}
          </ul>
        </Section>

        <Section id="questions-heading" title="Questions to ask your eye doctor">
          <ul className="space-y-2.5">
            {c.questions.map((q) => (
              <li key={q} className="flex gap-2.5 text-gray-700">
                <CheckCircle className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="research-heading" title="Research and clinical trials">
          <Prose paragraphs={c.research} />
          <div className="mt-4 flex flex-wrap gap-3">
            <Link to="/eye-conditions/clinical-trials" className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2">
              How to find and judge a trial <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <SmartLink href={trialsUrl(c.trialsQuery)} className="inline-flex items-center px-4 py-2 text-sm font-medium text-blue-800 border border-blue-200 bg-white rounded-lg hover:bg-blue-50">
              {c.shortName.replace(/ \(.*\)$/, '')} trials on ClinicalTrials.gov
            </SmartLink>
          </div>
        </Section>

        <Section id="more-heading" title="Learn more">
          <div className="grid sm:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-2">On this site</h3>
              <LinkList links={c.related} />
            </div>
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-2">Trusted organizations</h3>
              <LinkList links={c.externalResources} />
            </div>
          </div>
        </Section>

        <ReviewedNote />
      </div>
    </ContentPageLayout>
  );
}

function LinkList({ links }: { links: LinkItem[] }) {
  return (
    <ul className="space-y-2">
      {links.map((l) => (
        <li key={l.href}>
          <SmartLink href={l.href} className="text-blue-700 hover:underline">{l.label}</SmartLink>
        </li>
      ))}
    </ul>
  );
}

// ── genetic testing ──────────────────────────────────────────────────────────

export function GeneticTestingPage() {
  const steps = [
    { title: 'Talk to a retina specialist or genetic counselor', text: 'They confirm that an inherited retinal disease is likely, choose the right test (usually a panel of hundreds of retina genes), and order it.' },
    { title: 'Give a saliva or blood sample', text: 'Often collected at the clinic, or with a kit mailed to your home.' },
    { title: 'Wait for results', text: 'Usually several weeks. Your doctor or a genetic counselor goes through them with you.' },
    { title: 'Genetic counseling', text: 'A counselor explains what the result means for you, your treatment options, trials, and your family.' },
  ];
  const results = [
    { title: 'A clear (positive) result', text: 'One or two gene changes known to cause disease explain your condition. This confirms the diagnosis and inheritance pattern, and may open doors to treatment or trials.' },
    { title: 'A variant of uncertain significance (VUS)', text: 'A change was found, but it isn\'t yet known whether it causes disease. VUS results are common. They can be reclassified as science advances, so ask how you\'ll be told about updates.' },
    { title: 'No cause found', text: 'This doesn\'t mean your condition isn\'t genetic. The cause may be in a gene not yet linked to disease, or in a part of DNA the test doesn\'t read. Retesting with newer methods in a few years can help.' },
  ];
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'MedicalWebPage',
    name: 'Genetic Testing for Inherited Retinal Diseases',
    url: `${DOMAIN}/eye-conditions/genetic-testing`,
    lastReviewed: CONDITIONS_LAST_REVIEWED_ISO,
    about: { '@type': 'MedicalTest', name: 'Genetic testing for inherited retinal disease' },
  };

  return (
    <ContentPageLayout
      title="Genetic Testing for Inherited Retinal Diseases"
      subtitle="Why a genetic diagnosis matters, how to get tested (including at no cost), and how to understand the results."
      description="Genetic testing for retinitis pigmentosa, Stargardt, Usher syndrome, LCA and other inherited retinal diseases: why it matters, no-cost testing programs, genetic counseling, results and privacy protections."
      breadcrumbs={[HUB, { label: 'Genetic Testing' }]}
      schema={schema}
      showDisclaimer
    >
      <div className="space-y-12">
        <Section id="why-heading" title="Why get tested?">
          <p className="text-gray-700 leading-relaxed mb-4">More than 300 genes are linked to inherited retinal diseases (IRDs). Finding the gene behind yours can:</p>
          <Bullets
            items={[
              'Confirm the exact diagnosis, since several IRDs look alike on an eye exam',
              'Show how the condition is inherited, and who else in the family may be at risk or a carrier',
              'Give a better idea of how the condition may change over time',
              'Determine eligibility for gene-specific treatment, such as Luxturna for RPE65, and for most clinical trials',
              'Help with family planning decisions',
            ]}
          />
        </Section>

        <Section id="how-heading" title="How testing works">
          <ol className="space-y-4">
            {steps.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <span className="w-8 h-8 rounded-full bg-blue-700 text-white font-bold text-sm flex items-center justify-center shrink-0">{i + 1}</span>
                <div>
                  <h3 className="font-semibold text-gray-900">{s.title}</h3>
                  <p className="text-sm text-gray-700 mt-1 leading-relaxed">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="cost-heading" title="Cost and no-cost programs">
          <div className="space-y-4">
            <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-5">
              <h3 className="font-semibold text-gray-900">My Retina Tracker® Genetic Testing Program</h3>
              <p className="mt-1.5 text-sm text-gray-700 leading-relaxed">
                Run by the Foundation Fighting Blindness, this program provides genetic testing and genetic counseling at no cost to people in the U.S. with an eligible inherited retinal disease diagnosis, including RP, Stargardt disease, Usher syndrome, LCA, choroideremia, achromatopsia, cone-rod dystrophy and Best disease. Your eye care provider orders the test through the program; you can't order it yourself.
              </p>
              <SmartLink href="https://www.fightingblindness.org/open-access-genetic-testing-program" className="mt-2 inline-flex text-sm font-medium text-teal-800 hover:underline">
                Program details and eligible diagnoses
              </SmartLink>
            </div>
            <p className="text-gray-700 leading-relaxed">
              Insurance coverage for genetic testing varies. Many plans cover it when a specialist documents that results will guide care. Some testing companies and trial sponsors also offer sponsored testing programs, so ask your retina specialist which options they use.
            </p>
          </div>
        </Section>

        <Section id="results-heading" title="Understanding your results">
          <div className="space-y-3">
            {results.map((r) => (
              <div key={r.title} className="rounded-xl border border-gray-200 bg-white p-5">
                <h3 className="font-semibold text-gray-900">{r.title}</h3>
                <p className="mt-1.5 text-sm text-gray-700 leading-relaxed">{r.text}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section id="counselor-heading" title="Finding a genetic counselor">
          <p className="text-gray-700 leading-relaxed">
            Genetic counselors are trained to explain results and what they mean for your family. Many offer appointments by phone or video. Search the National Society of Genetic Counselors directory, or ask your retina specialist for a referral.
          </p>
          <SmartLink href="https://findageneticcounselor.nsgc.org/" className="mt-2 inline-flex text-blue-700 hover:underline">Find a Genetic Counselor (NSGC)</SmartLink>
        </Section>

        <Section id="privacy-heading" title="Privacy and discrimination protections">
          <p className="text-gray-700 leading-relaxed mb-3">
            In the U.S., the Genetic Information Nondiscrimination Act (GINA) stops health insurers and most employers from using your genetic information against you. GINA does <strong>not</strong> cover life insurance, disability insurance or long-term care insurance, so some people arrange those policies before testing.
          </p>
          <p className="text-gray-700 leading-relaxed">
            Ask any testing program or registry how your data is stored and shared, and whether it is ever shared with companies or researchers.
          </p>
        </Section>

        <Section id="registry-heading" title="Join a patient registry">
          <p className="text-gray-700 leading-relaxed">
            Registries help researchers understand rare diseases and find people for clinical trials. The free{' '}
            <SmartLink href="https://www.fightingblindness.org/my-retina-tracker-registry" className="text-blue-700 hover:underline">My Retina Tracker® Registry</SmartLink>{' '}
            collects information from people with inherited retinal diseases and can notify you about relevant research. If your doctor ordered testing through the My Retina Tracker program, you are registered automatically.
          </p>
        </Section>

        <div className="flex flex-wrap gap-3">
          <Link to="/eye-conditions/clinical-trials" className="text-blue-700 hover:underline">Clinical trials & research</Link>
          <Link to="/eye-conditions/retinitis-pigmentosa" className="text-blue-700 hover:underline">Retinitis pigmentosa</Link>
          <Link to="/eye-conditions/stargardt-disease" className="text-blue-700 hover:underline">Stargardt disease</Link>
          <Link to="/eye-conditions" className="text-blue-700 hover:underline">All eye conditions</Link>
        </div>
        <ReviewedNote />
      </div>
    </ContentPageLayout>
  );
}

// ── clinical trials & research ───────────────────────────────────────────────

export function ClinicalTrialsPage() {
  const approved = [
    { condition: 'Wet AMD and diabetic macular edema', therapy: 'Anti-VEGF injections such as aflibercept (Eylea), ranibizumab (Lucentis), faricimab (Vabysmo), plus biosimilars' },
    { condition: 'Geographic atrophy (advanced dry AMD)', therapy: 'Pegcetacoplan (Syfovre, 2023) and avacincaptad pegol (Izervay, 2023)' },
    { condition: 'RPE65-related LCA and RP', therapy: 'Voretigene neparvovec (Luxturna, 2017), a one-time gene therapy' },
    { condition: 'Macular telangiectasia type 2 (MacTel)', therapy: 'Revakinagene taroretcel (Encelto, 2025), an implant that releases a protective protein' },
    { condition: 'Geographic atrophy', therapy: 'PRIMA retinal implant: approved in the European Union; U.S. review in progress as of late 2026' },
  ];
  const phases = [
    { phase: 'Phase 1', text: 'Is it safe, and what dose? A small number of people, sometimes with advanced disease.' },
    { phase: 'Phase 2', text: 'Does it seem to work? More people, often comparing doses or against no treatment.' },
    { phase: 'Phase 3', text: 'Does it work better than current care, and what are the side effects? Hundreds of people at many sites. The results support FDA approval.' },
  ];
  const questions = [
    'What is the study trying to find out, and what phase is it?',
    'Could I get a placebo or "sham" treatment?',
    'What are the possible risks to my vision?',
    'How many visits are there, for how long, and where?',
    'Who pays for the treatment, tests and travel?',
    'Will joining this trial stop me from joining others later?',
    'What happens at the end of the study? Can I keep getting the treatment if it works?',
    'Who do I call if I have a problem?',
  ];
  const redFlags = [
    'You are asked to pay for the "treatment" itself',
    'It treats many unrelated diseases with the same cells or procedure',
    'Both eyes are treated on the same day',
    'It isn\'t listed on ClinicalTrials.gov, or the listing is only a registry with no FDA oversight',
    'Claims rely on testimonials rather than published results',
  ];
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'MedicalWebPage',
    name: 'Clinical Trials and Research for Vision Loss',
    url: `${DOMAIN}/eye-conditions/clinical-trials`,
    lastReviewed: CONDITIONS_LAST_REVIEWED_ISO,
  };

  return (
    <ContentPageLayout
      title="Clinical Trials & Research"
      subtitle="Which treatments are approved today, how to find a clinical trial, what to ask before joining, and how to spot unproven clinics."
      description="A guide to clinical trials for retinal diseases and vision loss: approved therapies as of late 2026, trial phases, finding trials on ClinicalTrials.gov, questions to ask, and warning signs of unproven stem cell clinics."
      breadcrumbs={[HUB, { label: 'Clinical Trials & Research' }]}
      schema={schema}
      showDisclaimer
    >
      <div className="space-y-12">
        <Section id="approved-heading" title="Approved treatments (as of late 2026)">
          <p className="text-gray-700 mb-4">A few years ago, almost none of these existed. Today there are approved treatments for several retinal diseases:</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[32rem]">
              <caption className="sr-only">Approved treatments for retinal diseases</caption>
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th scope="col" className="text-left px-3 py-2.5 font-semibold text-gray-700">Condition</th>
                  <th scope="col" className="text-left px-3 py-2.5 font-semibold text-gray-700">Treatment</th>
                </tr>
              </thead>
              <tbody>
                {approved.map((a) => (
                  <tr key={a.therapy} className="border-b border-gray-100">
                    <th scope="row" className="text-left px-3 py-2.5 font-medium text-gray-900 align-top">{a.condition}</th>
                    <td className="px-3 py-2.5 text-gray-700">{a.therapy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-gray-600">
            For an up-to-date list of therapies in development, see the{' '}
            <SmartLink href="https://www.fightingblindness.org/clinical-trial-pipeline" className="text-blue-700 hover:underline">Foundation Fighting Blindness clinical trial pipeline</SmartLink>.
          </p>
        </Section>

        <Section id="types-heading" title="What's being studied">
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { t: 'Gene therapy', d: 'Delivers a working copy of a gene to retinal cells. Usually for one specific gene.' },
              { t: 'Gene-agnostic therapies', d: 'Aim to protect retinal cells regardless of which gene is involved, so more people may benefit.' },
              { t: 'RNA therapies', d: 'Fix or skip faulty instructions at the RNA level for specific gene changes.' },
              { t: 'Optogenetics', d: 'Makes surviving retinal cells sensitive to light after photoreceptors are lost.' },
              { t: 'Cell therapy', d: 'Replaces or supports damaged retinal cells using lab-grown cells.' },
              { t: 'Retinal implants', d: 'Electronic devices that send signals to the retina or brain to create a form of vision.' },
            ].map((x) => (
              <div key={x.t} className="rounded-xl border border-gray-200 bg-white p-5">
                <h3 className="font-semibold text-gray-900">{x.t}</h3>
                <p className="mt-1.5 text-sm text-gray-700">{x.d}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section id="phases-heading" title="How clinical trials work">
          <div className="space-y-3">
            {phases.map((p) => (
              <div key={p.phase} className="flex gap-4 rounded-xl border border-gray-200 bg-white p-4">
                <span className="font-bold text-blue-800 w-20 shrink-0">{p.phase}</span>
                <p className="text-sm text-gray-700">{p.text}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-gray-700 leading-relaxed">
            Before joining, you go through informed consent: the team explains the study, its risks and your rights. You can leave a trial at any time. Sponsors usually pay for the study treatment and study tests, and many reimburse travel.
          </p>
        </Section>

        <Section id="find-heading" title="Finding a trial">
          <ol className="space-y-3 list-decimal pl-5 text-gray-700 leading-relaxed">
            <li><strong>Know your diagnosis, ideally your gene.</strong> Many trials require a confirmed genetic diagnosis. <Link to="/eye-conditions/genetic-testing" className="text-blue-700 hover:underline">Read about genetic testing</Link>.</li>
            <li>
              <strong>Search ClinicalTrials.gov</strong>, the U.S. government's registry of studies. Search for your condition (and gene, if known), then filter by "Recruiting" and location.{' '}
              <SmartLink href="https://clinicaltrials.gov/" className="text-blue-700 hover:underline">ClinicalTrials.gov</SmartLink>
            </li>
            <li><strong>Join a registry</strong> such as the <SmartLink href="https://www.fightingblindness.org/my-retina-tracker-registry" className="text-blue-700 hover:underline">My Retina Tracker® Registry</SmartLink>, so researchers can find you.</li>
            <li><strong>Ask your retina specialist.</strong> They often know about trials before they are widely advertised, and can help you judge if one fits.</li>
          </ol>
        </Section>

        <Section id="ask-heading" title="Questions to ask before joining">
          <ul className="space-y-2.5">
            {questions.map((q) => (
              <li key={q} className="flex gap-2.5 text-gray-700">
                <CheckCircle className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="flags-heading" title="Beware of unproven &quot;stem cell&quot; clinics">
          <div className="rounded-xl border border-red-200 bg-red-50 p-5">
            <p className="text-sm text-red-900 leading-relaxed mb-3">
              Some clinics charge thousands of dollars for unapproved cell injections into the eye. People have lost their sight from them, and the FDA has warned the public about unapproved stem cell products. Be very cautious if:
            </p>
            <ul className="space-y-1.5 text-sm text-red-900">
              {redFlags.map((f) => (
                <li key={f} className="flex gap-2"><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" /><span>{f}</span></li>
              ))}
            </ul>
          </div>
          <p className="mt-3 text-sm text-gray-700">Legitimate trials don’t charge you for the treatment being tested. When in doubt, ask your retina specialist before agreeing to anything.</p>
        </Section>

        <div className="flex flex-wrap gap-3">
          <Link to="/eye-conditions" className="text-blue-700 hover:underline">All eye conditions</Link>
          <Link to="/eye-conditions/genetic-testing" className="text-blue-700 hover:underline">Genetic testing</Link>
          <Link to="/professionals/research-evidence" className="text-blue-700 hover:underline">Research & evidence for professionals</Link>
        </div>
        <ReviewedNote />
      </div>
    </ContentPageLayout>
  );
}
