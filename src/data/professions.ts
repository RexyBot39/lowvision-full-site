/**
 * Professions in the "Find a Professional" directory.
 * The slugs must match PROFESSION_SLUGS in server/professions.mjs (the server
 * validates submissions against that list).
 */

export interface Profession {
  slug: string;
  /** Plural, for headings and menus. */
  label: string;
  /** Singular, for listing cards. */
  singular: string;
  credentials: string;
  description: string;
  whenToSee: string[];
}

export const professions: Profession[] = [
  {
    slug: 'low-vision-optometrists',
    label: 'Low Vision Optometrists',
    singular: 'Low Vision Optometrist',
    credentials: 'OD; some hold a Diplomate in Low Vision Rehabilitation (FAAO)',
    description: 'Optometrists who specialize in evaluating remaining vision and prescribing magnifiers, telescopes, filters and other low vision devices.',
    whenToSee: ['Glasses no longer help enough with reading or daily tasks', 'You want to try magnifiers or other devices', 'You need a low vision exam to start rehabilitation'],
  },
  {
    slug: 'ophthalmologists',
    label: 'Ophthalmologists & Retina Specialists',
    singular: 'Ophthalmologist',
    credentials: 'MD or DO; subspecialties include retina, glaucoma, neuro-ophthalmology and pediatrics',
    description: 'Medical doctors who diagnose and treat eye diseases with medicine, injections, laser and surgery.',
    whenToSee: ['Diagnosis and medical treatment of an eye disease', 'Injections for wet AMD or diabetic eye disease', 'Inherited retinal disease care, genetic testing and clinical trials'],
  },
  {
    slug: 'occupational-therapists',
    label: 'Occupational Therapists (Low Vision)',
    singular: 'Occupational Therapist',
    credentials: 'OTR/L; some hold AOTA Specialty Certification in Low Vision (SCLV)',
    description: 'Therapists who help people with vision loss do daily tasks safely, such as cooking, medication management, reading and home safety. Often covered by Medicare with a referral.',
    whenToSee: ['Daily tasks have become hard or unsafe', 'You want training at home', 'You have Medicare and need covered rehabilitation'],
  },
  {
    slug: 'vision-rehabilitation-therapists',
    label: 'Vision Rehabilitation Therapists',
    singular: 'Vision Rehabilitation Therapist',
    credentials: 'CVRT (ACVREP certified)',
    description: 'Specialists who teach adaptive skills for independent living: labeling, cooking, money management, communication, braille and technology.',
    whenToSee: ['Learning new ways to manage daily life', 'Organizing and labeling your home', 'Learning braille or accessible technology'],
  },
  {
    slug: 'orientation-mobility-specialists',
    label: 'Orientation & Mobility Specialists',
    singular: 'Orientation & Mobility Specialist',
    credentials: 'COMS (ACVREP certified); NOMC',
    description: 'Specialists who teach safe, independent travel: white cane skills, street crossings, public transit and route planning.',
    whenToSee: ['Getting around has become difficult or unsafe', 'Learning to use a white cane', 'Preparing to travel to work or school independently'],
  },
  {
    slug: 'low-vision-therapists',
    label: 'Certified Low Vision Therapists',
    singular: 'Certified Low Vision Therapist',
    credentials: 'CLVT (ACVREP certified)',
    description: 'Therapists who train people to use their remaining vision and prescribed devices effectively, such as eccentric viewing and magnifier technique.',
    whenToSee: ['After getting new low vision devices', 'Learning to use your remaining vision more effectively'],
  },
  {
    slug: 'assistive-technology-specialists',
    label: 'Assistive Technology Specialists',
    singular: 'Assistive Technology Specialist',
    credentials: 'CATIS (ACVREP certified); other AT certifications',
    description: 'Instructors who teach screen readers, magnification software, smartphones, braille displays and other accessible technology.',
    whenToSee: ['Learning a screen reader or magnification software', 'Making a smartphone or computer accessible', 'Technology for work or school'],
  },
  {
    slug: 'teachers-visual-impairments',
    label: 'Teachers of Students with Visual Impairments',
    singular: 'Teacher of Students with Visual Impairments',
    credentials: 'TVI / TSVI state certification',
    description: 'Special educators who support students from birth through high school with braille, technology, accessible materials and functional vision assessments.',
    whenToSee: ['A child with vision loss needs school supports', 'Functional vision or learning media assessments', 'Braille instruction'],
  },
  {
    slug: 'vocational-rehabilitation-counselors',
    label: 'Vocational Rehabilitation Counselors',
    singular: 'Vocational Rehabilitation Counselor',
    credentials: 'CRC and state VR agency staff',
    description: 'Counselors who help people with vision loss keep a job, change careers, get training and arrange workplace accommodations.',
    whenToSee: ['Vision loss is affecting your job', 'Planning education or training for work', 'Requesting workplace accommodations'],
  },
  {
    slug: 'counselors-therapists',
    label: 'Counselors & Mental Health Therapists',
    singular: 'Counselor / Therapist',
    credentials: 'LPC, LCSW, LMFT, psychologist',
    description: 'Mental health professionals experienced with vision loss, who help with grief, adjustment, anxiety, depression and family stress.',
    whenToSee: ['Adjusting to a new diagnosis', 'Feeling low, anxious or isolated', 'Family members need support too'],
  },
  {
    slug: 'genetic-counselors',
    label: 'Genetic Counselors',
    singular: 'Genetic Counselor',
    credentials: 'CGC (ABGC certified)',
    description: 'Counselors who explain genetic testing for inherited eye diseases and what results mean for you and your family.',
    whenToSee: ['Considering genetic testing for an inherited retinal disease', 'Understanding a test result', 'Family planning questions'],
  },
  {
    slug: 'other-vision-professionals',
    label: 'Other Vision Professionals',
    singular: 'Vision Professional',
    credentials: 'Orthoptists, braille transcribers, DeafBlind interpreters and support service providers, and others',
    description: 'Other professionals who serve people with low vision and blindness.',
    whenToSee: ['Specialized services not covered by the categories above'],
  },
];

export const professionBySlug = (slug: string) => professions.find((p) => p.slug === slug);

export const labelFor = (list: readonly { key: string; label: string }[], key: string) => list.find((x) => x.key === key)?.label ?? key;

export const SERVICE_MODES = [
  { key: 'inPerson', label: 'In person (office or clinic)' },
  { key: 'telehealth', label: 'Telehealth / video' },
  { key: 'homeVisits', label: 'Home or community visits' },
] as const;

export const AGE_GROUPS = [
  { key: 'children', label: 'Children' },
  { key: 'teens', label: 'Teens' },
  { key: 'adults', label: 'Adults' },
  { key: 'seniors', label: 'Older adults' },
] as const;

export const PAYMENT_OPTIONS = [
  { key: 'medicare', label: 'Medicare' },
  { key: 'medicaid', label: 'Medicaid' },
  { key: 'va', label: 'VA / Veterans' },
  { key: 'private', label: 'Private insurance' },
  { key: 'selfPay', label: 'Self-pay' },
  { key: 'slidingScale', label: 'Sliding scale / reduced fee' },
  { key: 'free', label: 'Free (agency or nonprofit)' },
] as const;
