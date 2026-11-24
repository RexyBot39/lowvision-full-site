import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { ContentPageLayout } from '../components/ui/ContentPageLayout';

interface Term {
  term: string;
  definition: string;
  /** Optional page on this site with more detail. */
  href?: string;
}

const terms: Term[] = [
  { term: 'Acuity (visual acuity)', definition: 'How sharp your vision is, usually measured by the smallest letters you can read on a chart. Written as a fraction such as 20/40: what you see at 20 feet, a person with typical vision sees at 40 feet.' },
  { term: 'AMD (age-related macular degeneration)', definition: 'A disease of the macula that damages central vision, mostly in people over 50. It has dry and wet forms.', href: '/eye-conditions/macular-degeneration' },
  { term: 'Amsler grid', definition: 'A square grid of lines used at home to check for new wavy or missing areas in central vision, an early sign of wet AMD.' },
  { term: 'Anti-VEGF', definition: 'Medicines injected into the eye that block a protein (VEGF) driving abnormal, leaky blood vessels. Used for wet AMD and diabetic macular edema.' },
  { term: 'Assistive technology (AT)', definition: 'Devices and software that help with daily tasks, such as screen readers, magnifiers and talking devices.', href: '/devices-technology' },
  { term: 'Autosomal dominant', definition: 'An inheritance pattern where one changed copy of a gene is enough to cause the condition. Each child of an affected parent has a 50% chance of inheriting it.' },
  { term: 'Autosomal recessive', definition: 'An inheritance pattern where both copies of a gene must be changed. Parents are usually unaffected carriers; each of their children has a 25% chance of being affected.' },
  { term: 'Bioptic telescope', definition: 'A small telescope mounted on glasses, used for brief distance viewing. Some U.S. states allow bioptic driving with training.', href: '/devices-technology/optical-devices' },
  { term: 'Blind spot (scotoma)', definition: 'An area of missing or reduced vision within the visual field. In AMD, a central scotoma blocks what you look at directly.' },
  { term: 'Carrier', definition: 'Someone with one changed copy of a gene for a recessive or X-linked condition who usually has no symptoms but can pass it on.' },
  { term: 'Cataract', definition: 'Clouding of the eye\'s lens. Common with aging and in some retinal diseases; usually treatable with surgery.' },
  { term: 'Charles Bonnet syndrome', definition: 'Seeing things that aren\'t there (patterns, people, faces) because of vision loss, not a mental illness. Common in people with low vision and often reassuring to learn about.' },
  { term: 'Clinical trial', definition: 'A research study testing whether a treatment is safe and works, in phases 1 to 3.', href: '/eye-conditions/clinical-trials' },
  { term: 'Cones', definition: 'Light-sensing cells in the retina, concentrated in the macula, that handle detail and color vision in good light.' },
  { term: 'Contrast sensitivity', definition: 'The ability to see objects that don\'t stand out much from their background, such as a gray step on gray pavement. Often reduced in low vision even when acuity is fair.' },
  { term: 'CVI (cortical / cerebral visual impairment)', definition: 'Vision loss caused by how the brain processes visual information rather than by the eyes.', href: '/eye-conditions/cortical-visual-impairment' },
  { term: 'CVRT (certified vision rehabilitation therapist)', definition: 'A professional who teaches daily living skills, such as cooking, labeling, medication management and technology, to people with vision loss.', href: '/rehab-training/adl-training' },
  { term: 'Diabetic macular edema (DME)', definition: 'Swelling of the macula from leaking blood vessels in diabetes; the most common cause of vision loss in diabetes.', href: '/eye-conditions/diabetic-eye-disease' },
  { term: 'Drusen', definition: 'Yellow deposits under the retina. Larger, softer drusen are a sign of AMD.' },
  { term: 'Eccentric viewing', definition: 'A technique for looking slightly away from an object so that healthy retina beside a central blind spot does the seeing.', href: '/rehab-training/visual-skills-training' },
  { term: 'Functional vision', definition: 'How well you use your vision for real tasks like reading, cooking or getting around, as opposed to test results alone.', href: '/rehab-training/functional-vision-assessment' },
  { term: 'Gene therapy', definition: 'Treatment that delivers a working copy of a gene to cells. Luxturna is an approved gene therapy for RPE65-related retinal disease.' },
  { term: 'Genetic counselor', definition: 'A health professional who helps people understand genetic test results and what they mean for them and their family.', href: '/eye-conditions/genetic-testing' },
  { term: 'Geographic atrophy (GA)', definition: 'An advanced form of dry AMD in which patches of retinal cells waste away.', href: '/eye-conditions/macular-degeneration' },
  { term: 'Glaucoma', definition: 'Diseases that damage the optic nerve, usually reducing side vision first.', href: '/eye-conditions/glaucoma' },
  { term: 'Hemianopia', definition: 'Loss of the same half of the visual field in both eyes, often after a stroke or brain injury.' },
  { term: 'IEP (Individualized Education Program)', definition: 'A legal plan for a U.S. student receiving special education services, which can include vision services, braille and accommodations.', href: '/community-support/education-services' },
  { term: 'IRD (inherited retinal disease)', definition: 'A retinal disease caused by a gene change, such as retinitis pigmentosa, Stargardt disease or LCA.', href: '/eye-conditions' },
  { term: 'Legal blindness', definition: 'In the U.S., best-corrected acuity of 20/200 or worse in the better eye, or a visual field of 20 degrees or less. Many legally blind people still have useful vision.', href: '/start-here/what-is-low-vision' },
  { term: 'Low vision', definition: 'Vision loss that glasses, contact lenses, medicine or surgery can\'t fully correct, and that makes everyday tasks hard.', href: '/start-here/what-is-low-vision' },
  { term: 'Low vision specialist', definition: 'An optometrist or ophthalmologist trained to evaluate how you use your remaining vision and to prescribe devices and rehabilitation.', href: '/resources?type=Low+Vision+Clinic' },
  { term: 'Macula', definition: 'The small central part of the retina responsible for sharp, detailed vision.' },
  { term: 'Nystagmus', definition: 'Involuntary, repetitive eye movements. Often seen with vision loss that starts in infancy.' },
  { term: 'O&M (orientation and mobility)', definition: 'Training in getting around safely and independently, including cane skills and route planning. Taught by a certified O&M specialist (COMS).', href: '/rehab-training/orientation-mobility' },
  { term: 'Optic nerve', definition: 'The nerve that carries visual signals from the eye to the brain. Damaged in glaucoma and optic atrophy.' },
  { term: 'Peripheral vision', definition: 'Side vision: what you see outside the center of your gaze. Important for getting around safely.' },
  { term: 'Photoreceptors', definition: 'Rods and cones, the retina\'s light-sensing cells.' },
  { term: 'PRL (preferred retinal locus)', definition: 'The spot of healthy retina a person with central vision loss learns to use instead of the damaged center.' },
  { term: 'Retina', definition: 'The light-sensitive layer at the back of the eye that turns light into signals for the brain.' },
  { term: 'Retina specialist', definition: 'An ophthalmologist with extra training in diseases of the retina, including inherited retinal diseases.' },
  { term: 'Retinitis pigmentosa (RP)', definition: 'A group of inherited diseases causing gradual loss of night and side vision.', href: '/eye-conditions/retinitis-pigmentosa' },
  { term: 'Rods', definition: 'Light-sensing cells spread across the outer retina that work in dim light and handle side vision.' },
  { term: 'RPE (retinal pigment epithelium)', definition: 'A layer of cells that supports and nourishes the photoreceptors.' },
  { term: 'Screen reader', definition: 'Software that reads on-screen text aloud or sends it to a braille display, such as VoiceOver, TalkBack, NVDA or JAWS.', href: '/devices-technology/software-apps' },
  { term: 'TVI (teacher of students with visual impairments)', definition: 'A specially trained teacher who supports students with vision loss in school, including braille, technology and accommodations.', href: '/community-support/education-services' },
  { term: 'Variant of uncertain significance (VUS)', definition: 'A genetic change whose effect isn\'t known yet. It may be reclassified as research advances.', href: '/eye-conditions/genetic-testing' },
  { term: 'Video magnifier (CCTV)', definition: 'A camera and screen that enlarge text and objects, with adjustable contrast and colors.', href: '/devices-technology/electronic-digital-aids' },
  { term: 'Visual field', definition: 'The whole area you can see without moving your eyes, measured in degrees.' },
  { term: 'Vocational rehabilitation (VR)', definition: 'A state program that helps people with disabilities, including vision loss, prepare for, find and keep jobs.', href: '/community-support/employment-vocational' },
  { term: 'X-linked', definition: 'An inheritance pattern where the gene is on the X chromosome. It mostly affects males; females are often carriers with milder or no symptoms.' },
];

const slug = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, '').trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function GlossaryPage() {
  const [q, setQ] = useState('');
  const sorted = useMemo(() => [...terms].sort((a, b) => a.term.localeCompare(b.term)), []);
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? sorted.filter((t) => t.term.toLowerCase().includes(n) || t.definition.toLowerCase().includes(n)) : sorted;
  }, [q, sorted]);
  const letters = useMemo(() => [...new Set(sorted.map((t) => t.term[0].toUpperCase()))], [sorted]);

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    name: 'Low Vision Glossary',
    url: 'https://lowvisionnavigator.org/glossary',
    hasDefinedTerm: sorted.map((t) => ({ '@type': 'DefinedTerm', name: t.term, description: t.definition })),
  };

  return (
    <ContentPageLayout
      title="Glossary"
      subtitle="Plain-language definitions of terms you'll hear from eye doctors, therapists and schools."
      description="A plain-language glossary of low vision and eye health terms: visual acuity, legal blindness, scotoma, eccentric viewing, inherited retinal disease, O&M, TVI, CVRT, anti-VEGF and more."
      breadcrumbs={[{ label: 'Glossary' }]}
      schema={schema}
    >
      <div className="space-y-8">
        <label className="relative block max-w-md">
          <span className="sr-only">Search the glossary</span>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search terms, e.g. acuity"
            className="w-full pl-9 pr-3 py-2.5 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </label>

        {!q && (
          <nav aria-label="Jump to letter" className="flex flex-wrap gap-1.5">
            {letters.map((l) => (
              <a key={l} href={`#letter-${l}`} className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-sm font-semibold text-blue-800 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700">
                {l}
              </a>
            ))}
          </nav>
        )}

        <p className="sr-only" role="status">{shown.length} terms</p>
        {shown.length === 0 ? (
          <p className="text-gray-600">No terms match “{q}”. Try another word, or <Link to="/search" className="text-blue-700 hover:underline">search the whole site</Link>.</p>
        ) : (
          <dl className="divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white">
            {shown.map((t, i) => {
              const letter = t.term[0].toUpperCase();
              const firstOfLetter = !q && (i === 0 || shown[i - 1].term[0].toUpperCase() !== letter);
              return (
                <div key={t.term} id={slug(t.term)} className="p-5 scroll-mt-28">
                  {firstOfLetter && <span id={`letter-${letter}`} className="block scroll-mt-28" aria-hidden="true" />}
                  <dt className="font-semibold text-gray-900">{t.term}</dt>
                  <dd className="mt-1 text-gray-700 leading-relaxed">
                    {t.definition}
                    {t.href && (
                      <>
                        {' '}
                        <Link to={t.href} className="text-blue-700 hover:underline whitespace-nowrap">Learn more<span className="sr-only"> about {t.term}</span></Link>
                      </>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
      </div>
    </ContentPageLayout>
  );
}
