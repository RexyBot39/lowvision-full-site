/**
 * Eye condition guides (/eye-conditions/*).
 *
 * Plain-language, low-vision-focused summaries. Treatment facts are as of
 * LAST_REVIEWED; check them against current sources (FDA, AAO, NEI,
 * Foundation Fighting Blindness pipeline) when you update this file.
 */

export const CONDITIONS_LAST_REVIEWED = 'November 2026';
export const CONDITIONS_LAST_REVIEWED_ISO = '2026-11-24';

export interface LinkItem {
  label: string;
  href: string;
}

export interface EyeCondition {
  slug: string;
  name: string;
  shortName: string;
  alternateNames?: string[];
  group: 'common' | 'inherited';
  /** One sentence for cards and meta descriptions. */
  summary: string;
  quickFacts: { label: string; value: string }[];
  whatItIs: string[];
  howItAffectsVision: string[];
  dailyImpacts: string[];
  warningSigns?: { intro?: string; items: string[] };
  urgent?: string;
  causes: { heading: string; paragraphs: string[]; bullets?: string[] };
  treatments: { intro: string; items: { name: string; detail: string }[]; note?: string };
  whatHelps: { title: string; detail: string; link?: LinkItem }[];
  questions: string[];
  research: string[];
  /** Search term for ClinicalTrials.gov. */
  trialsQuery: string;
  externalResources: LinkItem[];
  related: LinkItem[];
}

const LV_EXAM: LinkItem = { label: 'Find low vision services', href: '/resources?type=Low+Vision+Clinic' };

export const eyeConditions: EyeCondition[] = [
  // ── Age-related macular degeneration ─────────────────────────────────────
  {
    slug: 'macular-degeneration',
    name: 'Age-Related Macular Degeneration (AMD)',
    shortName: 'Macular Degeneration (AMD)',
    alternateNames: ['AMD', 'ARMD', 'dry AMD', 'wet AMD', 'geographic atrophy'],
    group: 'common',
    summary:
      'The most common cause of low vision in older adults. AMD damages the macula, the part of the retina used for reading, faces and fine detail, while side vision usually stays.',
    quickFacts: [
      { label: 'Who it affects', value: 'Mostly people over 50; risk rises sharply with age' },
      { label: 'Vision affected', value: 'Central vision; side (peripheral) vision usually stays' },
      { label: 'Types', value: 'Dry (most cases), including geographic atrophy; and wet (neovascular)' },
      { label: 'Treatment', value: 'Injections for wet AMD and for geographic atrophy; supplements for some dry AMD' },
    ],
    whatItIs: [
      'The macula is the small central part of the retina that gives sharp, detailed vision. In AMD, the cells of the macula are gradually damaged. Almost everyone with AMD starts with the dry form, marked by yellow deposits called drusen under the retina.',
      'Dry AMD can progress slowly to an advanced stage called geographic atrophy (GA), where patches of retinal cells waste away. In a smaller share of people, AMD turns into the wet (neovascular) form: abnormal blood vessels grow under the retina and leak fluid or blood, which can damage vision quickly.',
    ],
    howItAffectsVision: [
      'AMD affects the center of what you look at. Straight lines can look wavy, a blurry or dark patch can sit in the middle of your view, and colors can look faded. Because side vision usually remains, most people with AMD can still walk around familiar places, even when reading and recognizing faces become hard.',
      'AMD on its own does not cause total blindness. Most people keep useful side vision, and learning to use it well is one of the main goals of low vision rehabilitation.',
    ],
    dailyImpacts: [
      'Reading print, mail, prices and medication labels',
      'Recognizing faces, even of people you know well',
      'Telling time, writing checks, using phones and remotes',
      'Driving, especially reading signs',
      'Seeing steps and curbs in low contrast',
    ],
    warningSigns: {
      intro: 'See an eye doctor promptly, within days, if you notice:',
      items: [
        'Straight lines (door frames, tiles, an Amsler grid) suddenly looking wavy or bent',
        'A new dark, blurry or empty spot in the center of your vision',
        'A sudden drop in vision in one eye',
      ],
    },
    urgent:
      'A sudden change can mean dry AMD has turned into wet AMD. Wet AMD treated early usually keeps more vision, so don\'t wait for your next routine visit.',
    causes: {
      heading: 'Risk factors',
      paragraphs: [
        'AMD is caused by a mix of aging, genetics and environment. Researchers have found that part of the immune system, called the complement system, is overactive in many people with AMD.',
      ],
      bullets: [
        'Age, especially over 60',
        'Family history of AMD',
        'Smoking, the biggest risk you can change',
        'Being of European descent (AMD is more common, though it affects all groups)',
        'Cardiovascular risk factors such as high blood pressure',
      ],
    },
    treatments: {
      intro: 'There is no cure yet, but treatments can slow vision loss for many people:',
      items: [
        {
          name: 'Wet AMD: anti-VEGF injections',
          detail:
            'Medicines injected into the eye stop leaking blood vessels and often stabilize, sometimes improve, vision. Examples include aflibercept (Eylea), ranibizumab (Lucentis), faricimab (Vabysmo) and bevacizumab (Avastin, used off-label), plus biosimilars. Injections are repeated, often every 1–4 months, so travel to appointments matters.',
        },
        {
          name: 'Geographic atrophy (advanced dry AMD)',
          detail:
            'Two FDA-approved injections slow the growth of the damaged areas: pegcetacoplan (Syfovre, approved February 2023) and avacincaptad pegol (Izervay, approved August 2023). They slow further loss; they do not restore vision already lost.',
        },
        {
          name: 'Intermediate dry AMD: AREDS2 vitamins',
          detail:
            'A specific supplement formula (vitamins C and E, zinc, copper, lutein and zeaxanthin) lowered the risk of progressing to advanced AMD in the large AREDS2 study. It\'s recommended only for certain stages, so ask your eye doctor whether it applies to you.',
        },
        {
          name: 'Retinal implant (in development)',
          detail:
            'A small wireless retinal implant for geographic atrophy, called PRIMA, has been approved in the European Union; U.S. approval was in progress as of late 2026.',
        },
      ],
      note: 'Low vision rehabilitation helps at every stage, alongside medical treatment, not instead of it.',
    },
    whatHelps: [
      { title: 'A low vision exam', detail: 'Finds the right magnification and lighting for your tasks, and checks how well you use your side vision.', link: LV_EXAM },
      { title: 'Learning eccentric viewing', detail: 'Training to look slightly off-center so a healthy part of the retina does the work.', link: { label: 'Visual skills training', href: '/rehab-training/visual-skills-training' } },
      { title: 'Magnifiers and video magnifiers', detail: 'Handheld and stand magnifiers for short tasks; video magnifiers (CCTVs) for longer reading.', link: { label: 'Electronic & digital aids', href: '/devices-technology/electronic-digital-aids' } },
      { title: 'Better lighting and contrast', detail: 'Task lamps aimed at your reading, bold-line paper, and contrasting tape on steps make a big difference.', link: { label: 'Home modifications', href: '/rehab-training/home-modifications' } },
      { title: 'Phone and tablet features', detail: 'Zoom, large text, voice assistants and apps that read text aloud.', link: { label: 'Software & apps', href: '/devices-technology/software-apps' } },
    ],
    questions: [
      'Do I have dry or wet AMD, and what stage is it?',
      'Is it in one eye or both?',
      'Should I take AREDS2 supplements?',
      'Am I a candidate for treatment for geographic atrophy?',
      'How should I check my vision at home between visits, for example with an Amsler grid?',
      'Can you refer me for a low vision evaluation and rehabilitation?',
    ],
    research: [
      'Research is very active, especially for geographic atrophy: gene therapies, cell-based treatments, new complement-blocking drugs, and longer-lasting treatments for wet AMD that reduce the number of injections.',
    ],
    trialsQuery: 'Macular Degeneration',
    externalResources: [
      { label: 'National Eye Institute: AMD', href: 'https://www.nei.nih.gov/learn-about-eye-health/eye-conditions-and-diseases/age-related-macular-degeneration' },
      { label: 'Foundation Fighting Blindness: AMD resource center', href: 'https://www.fightingblindness.org/age-related-macular-degeneration-resource-center' },
    ],
    related: [
      { label: 'Optical devices', href: '/devices-technology/optical-devices' },
      { label: 'Medicare coverage for low vision', href: '/coverage-funding/medicare' },
      { label: 'Support for seniors', href: '/community-support/senior-support' },
    ],
  },

  // ── Glaucoma ─────────────────────────────────────────────────────────────
  {
    slug: 'glaucoma',
    name: 'Glaucoma',
    shortName: 'Glaucoma',
    alternateNames: ['open-angle glaucoma', 'angle-closure glaucoma'],
    group: 'common',
    summary:
      'A group of diseases that damage the optic nerve, usually starting with side vision. Early glaucoma often has no symptoms, and lost vision can\'t be restored, but treatment can slow it.',
    quickFacts: [
      { label: 'Who it affects', value: 'Mostly adults over 40; higher risk with family history and African or Hispanic ancestry' },
      { label: 'Vision affected', value: 'Side (peripheral) vision first; central vision late' },
      { label: 'Symptoms early on', value: 'Usually none, which is why regular eye exams matter' },
      { label: 'Treatment', value: 'Eye drops, laser and surgery slow or stop further damage' },
    ],
    whatItIs: [
      'Glaucoma is damage to the optic nerve, the cable that carries signals from the eye to the brain. It is often, but not always, linked to higher pressure inside the eye. The most common type, open-angle glaucoma, progresses slowly over years.',
      'Angle-closure glaucoma is less common. It can develop suddenly when fluid can\'t drain from the eye, and that is a medical emergency.',
    ],
    howItAffectsVision: [
      'Glaucoma usually narrows vision from the outside in. People often don\'t notice early loss because the other eye and the brain fill in the gaps. In advanced glaucoma, only a small central area may remain ("tunnel vision"), and contrast and glare tolerance can also suffer.',
    ],
    dailyImpacts: [
      'Bumping into things or people to the side',
      'Missing steps, curbs and objects on the floor',
      'Crossing streets and moving through crowds',
      'Driving, especially seeing cars and pedestrians to the side',
      'Moving between bright and dim places',
    ],
    warningSigns: {
      items: [
        'Open-angle glaucoma usually has no warning signs until vision is lost. A dilated eye exam is the only way to catch it early.',
      ],
    },
    urgent:
      'Go to an emergency room or eye doctor right away if you have sudden severe eye pain, headache, nausea or vomiting, blurred vision and halos around lights. These can be signs of acute angle-closure glaucoma.',
    causes: {
      heading: 'Risk factors',
      paragraphs: [],
      bullets: [
        'Age over 40, rising with each decade',
        'A parent or sibling with glaucoma',
        'African, Hispanic or Asian ancestry (different types of glaucoma are more common in different groups)',
        'High eye pressure, thin corneas, high nearsightedness',
        'Diabetes, eye injury, long-term steroid use',
      ],
    },
    treatments: {
      intro: 'Treatment can\'t restore lost vision but can protect what remains:',
      items: [
        { name: 'Eye drops', detail: 'Daily drops that lower eye pressure. Using them every day as prescribed is the single most important part of treatment.' },
        { name: 'Laser treatment', detail: 'Selective laser trabeculoplasty (SLT) helps fluid drain and can reduce or replace drops for some people.' },
        { name: 'Surgery', detail: 'Minimally invasive glaucoma surgery (MIGS), trabeculectomy and drainage tubes create new drainage paths when drops and laser aren\'t enough.' },
      ],
    },
    whatHelps: [
      { title: 'Orientation & mobility (O&M) training', detail: 'Techniques for scanning, using a white cane, and getting around safely with a narrow field.', link: { label: 'Orientation & mobility', href: '/rehab-training/orientation-mobility' } },
      { title: 'Scanning training', detail: 'Moving your eyes and head systematically to make up for missing side vision.', link: { label: 'Visual skills training', href: '/rehab-training/visual-skills-training' } },
      { title: 'Glare control and lighting', detail: 'Filters, hats and even lighting help with glare and with moving between bright and dim areas.', link: { label: 'Glare & light management', href: '/devices-technology/glare-light-management' } },
      { title: 'Help with eye drops', detail: 'Drop guides, large-print or color-coded schedules, and phone reminders make daily drops easier.', link: { label: 'Daily living aids', href: '/devices-technology/daily-living-aids' } },
      { title: 'Home safety', detail: 'Clear walkways, contrast strips on stair edges and good lighting reduce falls.', link: { label: 'Home modifications', href: '/rehab-training/home-modifications' } },
    ],
    questions: [
      'What type of glaucoma do I have, and how advanced is it?',
      'What is my target eye pressure?',
      'How do my visual field tests compare over time?',
      'Am I a candidate for laser treatment?',
      'Is it still safe for me to drive?',
      'Should my brothers, sisters and children be checked?',
    ],
    research: [
      'Research is looking at ways to protect and regenerate the optic nerve (neuroprotection), longer-lasting drug implants that replace daily drops, and better tools to detect progression early.',
    ],
    trialsQuery: 'Glaucoma',
    externalResources: [
      { label: 'National Eye Institute: Glaucoma', href: 'https://www.nei.nih.gov/learn-about-eye-health/eye-conditions-and-diseases/glaucoma' },
      { label: 'Glaucoma Research Foundation', href: 'https://glaucoma.org' },
    ],
    related: [
      { label: 'Orientation & mobility', href: '/rehab-training/orientation-mobility' },
      { label: 'Transportation help', href: '/financial-support/transportation' },
      { label: 'Find services near you', href: '/resources' },
    ],
  },

  // ── Diabetic eye disease ─────────────────────────────────────────────────
  {
    slug: 'diabetic-eye-disease',
    name: 'Diabetic Eye Disease',
    shortName: 'Diabetic Eye Disease',
    alternateNames: ['diabetic retinopathy', 'diabetic macular edema', 'DME', 'proliferative diabetic retinopathy'],
    group: 'common',
    summary:
      'Diabetes can damage the blood vessels of the retina (diabetic retinopathy) and cause swelling in the macula (diabetic macular edema). It is a leading cause of vision loss in working-age adults, and much of it can be prevented.',
    quickFacts: [
      { label: 'Who it affects', value: 'People with type 1 or type 2 diabetes; risk grows with years of diabetes' },
      { label: 'Vision affected', value: 'Can be blurry, patchy or fluctuating; central vision if the macula swells' },
      { label: 'Prevention', value: 'A dilated eye exam at least yearly, plus blood sugar, blood pressure and cholesterol control' },
      { label: 'Treatment', value: 'Injections, laser, steroid implants and surgery' },
    ],
    whatItIs: [
      'Over time, high blood sugar damages the small blood vessels in the retina. In early (non-proliferative) retinopathy, vessels weaken and leak. In proliferative retinopathy, fragile new vessels grow and can bleed into the eye or pull on the retina.',
      'Diabetic macular edema (DME) is swelling of the macula from leaking fluid. It can happen at any stage and is the most common cause of vision loss in diabetes.',
    ],
    howItAffectsVision: [
      'Vision may be blurry, have dark spots or floaters, or change from day to day with blood sugar levels. Laser treatment for advanced disease can save central vision but may reduce side and night vision.',
    ],
    dailyImpacts: [
      'Reading glucose meters, insulin pens and medication labels',
      'Seeing at night or in dim light',
      'Fluctuating vision that makes glasses prescriptions hard to get right',
      'Checking feet and skin for injuries',
      'Driving',
    ],
    warningSigns: {
      intro: 'Early diabetic eye disease often has no symptoms. See an eye doctor promptly for:',
      items: ['A sudden shower of new floaters or a curtain over your vision', 'Sudden blurring or a dark area in your vision', 'Vision that changes a lot from day to day'],
    },
    urgent: 'Sudden vision loss, a shower of floaters or a curtain over your vision can mean bleeding or retinal detachment. Seek same-day care.',
    causes: {
      heading: 'Risk factors',
      paragraphs: [],
      bullets: [
        'Years living with diabetes',
        'Blood sugar that stays high (a high A1C)',
        'High blood pressure and high cholesterol',
        'Kidney disease',
        'Pregnancy in people with existing diabetes',
        'Smoking',
      ],
    },
    treatments: {
      intro: 'Treatment works best when started early, before vision is affected:',
      items: [
        { name: 'Anti-VEGF injections', detail: 'The main treatment for macular edema and also used for proliferative retinopathy (for example aflibercept, ranibizumab, faricimab, bevacizumab).' },
        { name: 'Laser', detail: 'Focal laser for some macular swelling; scatter (panretinal) laser to shrink abnormal vessels in proliferative disease.' },
        { name: 'Steroid implants', detail: 'Long-acting implants placed in the eye for macular edema that doesn\'t respond to injections.' },
        { name: 'Vitrectomy surgery', detail: 'Removes blood from inside the eye or repairs a retina being pulled by scar tissue.' },
      ],
      note: 'Controlling blood sugar, blood pressure and cholesterol slows eye disease and protects the kidneys and nerves too.',
    },
    whatHelps: [
      { title: 'Accessible diabetes tools', detail: 'Talking glucose meters, continuous glucose monitors with phone apps, and insulin pens with audible clicks.', link: { label: 'Daily living aids', href: '/devices-technology/daily-living-aids' } },
      { title: 'A low vision exam', detail: 'Fluctuating vision is common; a low vision specialist can find magnification and lighting that still work on bad days.', link: LV_EXAM },
      { title: 'Daily living training', detail: 'A vision rehabilitation therapist or OT can set up medication, insulin and foot-care routines that don\'t depend on sight.', link: { label: 'OT & ADL training', href: '/rehab-training/adl-training' } },
      { title: 'Benefits if you can\'t work', detail: 'If vision loss affects your job, vocational rehabilitation or disability benefits may help.', link: { label: 'Employment & vocational help', href: '/community-support/employment-vocational' } },
    ],
    questions: [
      'What stage is my retinopathy, and do I have macular edema?',
      'How often do I need eye exams and treatment?',
      'Will treatment affect my side or night vision?',
      'What blood sugar and blood pressure targets protect my eyes?',
      'Can you refer me to low vision services?',
    ],
    research: [
      'Research focuses on longer-lasting injections, eye-drop and oral treatments, and AI screening tools. Some FDA-cleared AI systems can now detect diabetic retinopathy from retinal photos in primary care offices.',
    ],
    trialsQuery: 'Diabetic Retinopathy',
    externalResources: [
      { label: 'National Eye Institute: Diabetic retinopathy', href: 'https://www.nei.nih.gov/learn-about-eye-health/eye-conditions-and-diseases/diabetic-retinopathy' },
      { label: 'American Diabetes Association', href: 'https://diabetes.org/' },
    ],
    related: [
      { label: 'Employment & vocational help', href: '/community-support/employment-vocational' },
      { label: 'SSDI', href: '/financial-support/ssdi' },
      { label: 'Medicaid', href: '/coverage-funding/medicaid' },
    ],
  },

  // ── Cortical / cerebral visual impairment ────────────────────────────────
  {
    slug: 'cortical-visual-impairment',
    name: 'Cortical / Cerebral Visual Impairment (CVI)',
    shortName: 'Cortical Visual Impairment (CVI)',
    alternateNames: ['CVI', 'cerebral visual impairment', 'neurological visual impairment'],
    group: 'common',
    summary:
      'Vision loss caused by how the brain processes what the eyes see, rather than by the eyes themselves. CVI is a leading cause of visual impairment in children in developed countries.',
    quickFacts: [
      { label: 'Who it affects', value: 'Mostly children with early brain injury or neurological conditions; adults after stroke or brain injury' },
      { label: 'The eyes', value: 'Often look healthy on a standard eye exam' },
      { label: 'Key feature', value: 'Vision varies with the environment, fatigue and familiarity' },
      { label: 'Outlook', value: 'Many children\'s functional vision improves with the right supports' },
    ],
    whatItIs: [
      'In CVI, the eyes may work normally, but the visual pathways and areas of the brain that make sense of what is seen are damaged or developed differently. Common causes include lack of oxygen around birth, premature birth (periventricular leukomalacia), hydrocephalus, brain malformations, infections, seizures and some genetic conditions.',
      'Because the problem is in the brain, a child may "pass" a basic eye exam yet struggle to use vision. Children with CVI may also have an eye condition at the same time.',
    ],
    howItAffectsVision: [
      'Children with CVI often see better in familiar, uncluttered settings. They may notice moving or brightly colored objects (often red or yellow) more easily, be slow to look at things, find faces and busy scenes hard, see better at near than far, or look at lights.',
      'Adults can develop cerebral visual impairment after a stroke or brain injury, for example losing half the visual field in both eyes (hemianopia) or having trouble recognizing objects or faces.',
    ],
    dailyImpacts: [
      'Finding a toy or object on a patterned background',
      'Recognizing familiar people by face',
      'Moving through crowded or busy spaces',
      'Using vision and reaching at the same time',
      'Using vision well when tired, ill or in a new place',
    ],
    causes: {
      heading: 'Common causes',
      paragraphs: [],
      bullets: [
        'Hypoxic-ischemic brain injury around birth',
        'Premature birth and periventricular leukomalacia',
        'Hydrocephalus and brain malformations',
        'Infections such as meningitis',
        'Seizure disorders and some genetic syndromes',
        'In adults: stroke, traumatic brain injury, tumors',
      ],
    },
    treatments: {
      intro: 'There is no medicine for CVI, but supports make a real difference:',
      items: [
        { name: 'Functional vision assessment', detail: 'An assessment by a teacher of students with visual impairments (TVI) or a specialist experienced with CVI. Tools such as the CVI Range describe how a child uses vision and guide planning.', },
        { name: 'Adapting the environment', detail: 'Reducing clutter, using high-contrast and preferred colors, good lighting, and presenting objects the same way each time.' },
        { name: 'Early intervention and school services', detail: 'Services from birth (early intervention) and through school (an IEP with vision services) build visual skills over time.' },
        { name: 'For adults after stroke', detail: 'Scanning training, prism glasses for some field losses, and occupational therapy.' },
      ],
    },
    whatHelps: [
      { title: 'A TVI with CVI training', detail: 'Ask the school district or early intervention program for a teacher of students with visual impairments who knows CVI.', link: { label: 'School services (TVI, IEP, 504)', href: '/community-support/education-services' } },
      { title: 'Functional vision assessment', detail: 'Looks at how vision is used in real activities, not just eye health.', link: { label: 'Functional vision assessment', href: '/rehab-training/functional-vision-assessment' } },
      { title: 'Family support', detail: 'Connect with other families and family-focused programs.', link: { label: 'Youth & family pathways', href: '/community-support/youth-family-pathways' } },
    ],
    questions: [
      'Has my child been evaluated for CVI, and by whom?',
      'Which CVI characteristics does my child show, and how should we adapt their environment?',
      'Should my child also be checked for an eye condition or a need for glasses?',
      'What vision services should be in my child\'s IFSP or IEP?',
      'How often should my child\'s functional vision be reassessed?',
    ],
    research: [
      'Research is improving how CVI is identified and measured, so children are diagnosed earlier, and studying which interventions help most.',
    ],
    trialsQuery: 'Cortical Visual Impairment',
    externalResources: [
      { label: 'Perkins School for the Blind: CVI Now', href: 'https://www.perkins.org/cvi-now/' },
      { label: 'American Printing House for the Blind: CVI resources', href: 'https://www.aph.org/' },
    ],
    related: [
      { label: 'School services', href: '/community-support/education-services' },
      { label: 'Caregiver & family support', href: '/community-support/caregiver-family' },
      { label: 'Start the intake as a caregiver', href: '/intake/start?mode=caregiver' },
    ],
  },

  // ── Retinitis pigmentosa ─────────────────────────────────────────────────
  {
    slug: 'retinitis-pigmentosa',
    name: 'Retinitis Pigmentosa (RP)',
    shortName: 'Retinitis Pigmentosa (RP)',
    alternateNames: ['RP', 'rod-cone dystrophy'],
    group: 'inherited',
    summary:
      'A group of inherited retinal diseases that cause gradual loss of night and side vision, often starting in childhood or the teen years.',
    quickFacts: [
      { label: 'Who it affects', value: 'About 1 in 4,000 people; often diagnosed in childhood or young adulthood' },
      { label: 'Vision affected', value: 'Night vision and side vision first; central vision later in many people' },
      { label: 'Inherited?', value: 'Yes. Changes in dozens of genes can cause RP' },
      { label: 'Treatment', value: 'One approved gene therapy for a specific gene (RPE65); many trials under way' },
    ],
    whatItIs: [
      'RP is caused by changes in genes needed by the retina\'s light-sensing cells, the photoreceptors. Rods, which work in dim light and handle side vision, usually fail first. Cones, which handle central and color vision, are often affected later.',
      'RP can happen on its own or as part of a syndrome that affects other parts of the body, such as Usher syndrome (with hearing loss) or Bardet-Biedl syndrome.',
    ],
    howItAffectsVision: [
      'Trouble seeing at night or in dim places is usually the first sign. Side vision then narrows over years, leading to "tunnel vision". How fast it progresses varies widely, even within one family. Many people keep useful central vision well into adulthood.',
    ],
    dailyImpacts: [
      'Getting around at night or in dim restaurants and theaters',
      'Adjusting when moving from bright to dark places',
      'Bumping into people and objects to the side',
      'Driving, especially at night',
      'Glare sensitivity outdoors',
    ],
    causes: {
      heading: 'How RP is inherited',
      paragraphs: [
        'More than 60 genes are linked to RP. Commonly involved genes include RHO, USH2A, RPGR, PRPH2, RP1, PRPF31 and EYS. RP can be passed down in three main ways:',
      ],
      bullets: [
        'Autosomal recessive: both parents carry one changed copy without symptoms; each child has a 25% chance of having RP.',
        'Autosomal dominant: one affected parent; each child has a 50% chance of having RP.',
        'X-linked: mostly affects males; carrier females can have milder symptoms. An affected father can\'t pass it to his sons.',
        'Sometimes no one else in the family is affected. Genetic testing can often still find the cause.',
      ],
    },
    treatments: {
      intro: 'There is no cure for most types of RP yet, but there are real options:',
      items: [
        { name: 'Gene therapy for RPE65', detail: 'Voretigene neparvovec (Luxturna), FDA-approved in 2017, treats RP and Leber congenital amaurosis caused by changes in both copies of the RPE65 gene. It requires a genetic diagnosis.' },
        { name: 'Treating complications', detail: 'Cataracts and swelling in the macula (cystoid macular edema) are common in RP and can often be treated, sometimes improving vision.' },
        { name: 'Clinical trials', detail: 'Gene therapies for specific genes, gene-agnostic therapies meant to work regardless of the gene, optogenetics, cell therapy and retinal implants are in trials. A confirmed genetic diagnosis is often required to join.', },
      ],
    },
    whatHelps: [
      { title: 'Genetic testing', detail: 'Confirms the diagnosis and inheritance pattern, and is often needed for trials and gene therapy.', link: { label: 'Genetic testing guide', href: '/eye-conditions/genetic-testing' } },
      { title: 'Orientation & mobility training', detail: 'Cane skills, night travel and scanning techniques, best learned before vision becomes very limited.', link: { label: 'Orientation & mobility', href: '/rehab-training/orientation-mobility' } },
      { title: 'Lighting for night vision', detail: 'Bright flashlights, motion-sensor night lights and smartphone night-vision apps.', link: { label: 'Daily living aids', href: '/devices-technology/daily-living-aids' } },
      { title: 'Glare control', detail: 'Filters and tinted lenses can reduce glare and help with light adjustment.', link: { label: 'Glare & light management', href: '/devices-technology/glare-light-management' } },
      { title: 'Planning ahead for work and school', detail: 'Vocational rehabilitation and school supports can be set up early.', link: { label: 'Employment & vocational help', href: '/community-support/employment-vocational' } },
    ],
    questions: [
      'Has my RP been confirmed with genetic testing? Which gene is involved?',
      'What is my inheritance pattern, and what does that mean for my children and siblings?',
      'Do I have cataracts or macular swelling that could be treated?',
      'How has my visual field changed since my last visit?',
      'Am I a candidate for any approved treatment or clinical trial?',
      'Can you refer me to low vision services and O&M training?',
    ],
    research: [
      'RP is one of the most active areas of retinal research. Trials include gene therapies for X-linked RP (RPGR) and other specific genes, therapies designed to work regardless of the gene, optogenetics (making surviving retinal cells sensitive to light), and stem-cell-based therapies.',
    ],
    trialsQuery: 'Retinitis Pigmentosa',
    externalResources: [
      { label: 'Foundation Fighting Blindness: Retinitis pigmentosa', href: 'https://www.fightingblindness.org/diseases/retinitis-pigmentosa' },
      { label: 'National Eye Institute: Retinitis pigmentosa', href: 'https://www.nei.nih.gov/learn-about-eye-health/eye-conditions-and-diseases/retinitis-pigmentosa' },
    ],
    related: [
      { label: 'Usher syndrome', href: '/eye-conditions/usher-syndrome' },
      { label: 'Clinical trials & research', href: '/eye-conditions/clinical-trials' },
      { label: 'Guide dog services', href: '/community-support/guide-dog-services' },
    ],
  },

  // ── Stargardt disease ────────────────────────────────────────────────────
  {
    slug: 'stargardt-disease',
    name: 'Stargardt Disease',
    shortName: 'Stargardt Disease',
    alternateNames: ['Stargardt macular dystrophy', 'juvenile macular degeneration', 'fundus flavimaculatus', 'ABCA4 retinopathy'],
    group: 'inherited',
    summary:
      'The most common inherited macular disease. It causes central vision loss, usually starting in childhood or the teen years, while side vision usually stays.',
    quickFacts: [
      { label: 'Who it affects', value: 'About 1 in 8,000–10,000 people; usually starts in childhood or adolescence, sometimes later' },
      { label: 'Vision affected', value: 'Central vision; side vision usually stays' },
      { label: 'Inherited?', value: 'Yes, usually autosomal recessive (ABCA4 gene)' },
      { label: 'Treatment', value: 'No approved treatment yet; several in trials' },
    ],
    whatItIs: [
      'Stargardt disease is usually caused by changes in both copies of the ABCA4 gene. The gene helps clear by-products of the visual cycle. When it doesn\'t work, a toxic waste material (lipofuscin) builds up and damages cells in the macula.',
      'It is sometimes called "juvenile macular degeneration", but it is a different disease from age-related macular degeneration.',
    ],
    howItAffectsVision: [
      'Central vision becomes blurry or develops blind spots, making reading, seeing the board at school and recognizing faces difficult. Color vision may be affected and adjusting to darkness can be slow. Because side vision is usually kept, most people move around independently.',
    ],
    dailyImpacts: [
      'Reading print and screens at a normal size',
      'Seeing the board or slides at school and work',
      'Recognizing faces',
      'Driving; many people with Stargardt don\'t meet the vision standard for a license',
    ],
    causes: {
      heading: 'How Stargardt is inherited',
      paragraphs: [
        'Most Stargardt disease is autosomal recessive: a child inherits one changed ABCA4 gene from each parent, who are usually unaffected carriers. Each child of two carriers has a 25% chance of having the disease. Rarer forms caused by other genes (such as ELOVL4) are dominant.',
      ],
    },
    treatments: {
      intro: 'There is no approved treatment yet. What eye specialists commonly advise:',
      items: [
        { name: 'Avoid extra vitamin A', detail: 'Supplements with added vitamin A (retinol or beta-carotene, including some eye vitamins) are commonly advised against, because vitamin A feeds the build-up that damages the retina. A normal diet is fine. Ask your doctor before taking eye supplements, especially AREDS formulas.' },
        { name: 'UV and bright-light protection', detail: 'Sunglasses and hats outdoors are commonly recommended to protect the retina.' },
        { name: 'Clinical trials', detail: 'Oral drugs that slow vitamin A processing, gene therapies for ABCA4, RNA-based treatments and cell therapies are being studied.' },
      ],
    },
    whatHelps: [
      { title: 'Genetic testing', detail: 'Confirms Stargardt disease (it can look like other conditions) and is usually needed to join trials.', link: { label: 'Genetic testing guide', href: '/eye-conditions/genetic-testing' } },
      { title: 'School accommodations', detail: 'Large print, magnification, screen readers and seating near the board, written into an IEP or 504 plan.', link: { label: 'School services', href: '/community-support/education-services' } },
      { title: 'Eccentric viewing training', detail: 'Learning to use the healthier part of the retina beside the damaged center.', link: { label: 'Visual skills training', href: '/rehab-training/visual-skills-training' } },
      { title: 'Technology', detail: 'Screen magnification, text-to-speech and phone camera apps for reading.', link: { label: 'Software & apps', href: '/devices-technology/software-apps' } },
    ],
    questions: [
      'Has the diagnosis been confirmed with genetic testing?',
      'Which supplements should I avoid?',
      'What protection from sunlight do you recommend?',
      'Are there clinical trials I might qualify for?',
      'Can you refer me (or my child) for a low vision evaluation and school vision services?',
    ],
    research: [
      'Stargardt research is very active. Approaches include oral drugs that reduce the build-up of toxic by-products, ABCA4 gene therapies (which are challenging because the gene is large), RNA editing and RNA-based therapies, and cell replacement.',
    ],
    trialsQuery: 'Stargardt Disease',
    externalResources: [
      { label: 'Foundation Fighting Blindness: Stargardt disease', href: 'https://www.fightingblindness.org/diseases/stargardt-disease' },
      { label: 'National Eye Institute: Stargardt disease', href: 'https://www.nei.nih.gov/learn-about-eye-health/eye-conditions-and-diseases/stargardt-disease' },
    ],
    related: [
      { label: 'Macular degeneration (AMD)', href: '/eye-conditions/macular-degeneration' },
      { label: 'Youth & family pathways', href: '/community-support/youth-family-pathways' },
      { label: 'Clinical trials & research', href: '/eye-conditions/clinical-trials' },
    ],
  },

  // ── Usher syndrome ───────────────────────────────────────────────────────
  {
    slug: 'usher-syndrome',
    name: 'Usher Syndrome',
    shortName: 'Usher Syndrome',
    alternateNames: ['Usher type 1', 'Usher type 2', 'Usher type 3', 'deafblindness'],
    group: 'inherited',
    summary:
      'An inherited condition that combines hearing loss with retinitis pigmentosa, and sometimes balance problems. It is the most common genetic cause of combined deafness and blindness.',
    quickFacts: [
      { label: 'Who it affects', value: 'People born with or developing hearing loss who later develop RP' },
      { label: 'Vision affected', value: 'Night and side vision first (retinitis pigmentosa)' },
      { label: 'Inherited?', value: 'Yes, autosomal recessive' },
      { label: 'Types', value: '1, 2 and 3, by hearing, balance and when symptoms start' },
    ],
    whatItIs: [
      'Usher syndrome is caused by changes in genes that are needed by both the inner ear and the retina. Many people are first identified through hearing loss, and the vision changes of RP appear later.',
    ],
    howItAffectsVision: [
      'Vision changes follow the pattern of retinitis pigmentosa: trouble in dim light, then narrowing side vision. Combined with hearing loss, this affects communication, lip-reading and getting around, so planning both vision and hearing supports together matters.',
    ],
    dailyImpacts: [
      'Lip-reading and following sign language as side vision narrows',
      'Group conversations and noisy places',
      'Getting around at night, especially with balance problems',
      'Access to information and alerts at home and work',
    ],
    causes: {
      heading: 'Types and genes',
      paragraphs: ['Usher syndrome is autosomal recessive. Each child of two carrier parents has a 25% chance of having it.'],
      bullets: [
        'Type 1: profound hearing loss from birth, balance problems, and RP starting in childhood. A common gene is MYO7A.',
        'Type 2: moderate-to-severe hearing loss from birth, normal balance, and RP starting in the teens or early adulthood. The most common type; USH2A is the most common gene.',
        'Type 3: hearing loss that progresses over time, variable balance, and RP. A common gene is CLRN1.',
      ],
    },
    treatments: {
      intro: 'There is no approved treatment for the vision loss yet:',
      items: [
        { name: 'Hearing support', detail: 'Hearing aids and cochlear implants, with early implantation often recommended for type 1.' },
        { name: 'Vision care', detail: 'The same as for RP, including treatment of cataracts and macular swelling.' },
        { name: 'Clinical trials', detail: 'RNA-based therapies targeting specific USH2A changes and gene therapies (for example for MYO7A) are in clinical trials.' },
      ],
    },
    whatHelps: [
      { title: 'DeafBlind services', detail: 'The Helen Keller National Center offers training and regional support for people with combined vision and hearing loss.', link: { label: 'Helen Keller National Center', href: 'https://www.helenkeller.org/' } },
      { title: 'Free communication equipment', detail: 'The iCanConnect program (National Deaf-Blind Equipment Distribution Program) provides phones, computers and braille devices at no cost to eligible people.', link: { label: 'iCanConnect', href: 'https://www.icanconnect.org/' } },
      { title: 'O&M training', detail: 'Cane and travel skills that account for both vision and balance.', link: { label: 'Orientation & mobility', href: '/rehab-training/orientation-mobility' } },
      { title: 'Genetic testing', detail: 'Confirms the type and gene, which matters for trials.', link: { label: 'Genetic testing guide', href: '/eye-conditions/genetic-testing' } },
    ],
    questions: [
      'Which type of Usher syndrome do I have, and which gene?',
      'Should my hearing and vision teams coordinate my care?',
      'Am I eligible for trials targeting my gene change?',
      'How can I plan communication methods for the future (tactile sign, braille)?',
    ],
    research: [
      'Trials include RNA-based therapies that skip a faulty section of the USH2A gene and gene therapies for MYO7A. Many require a specific gene change confirmed by testing.',
    ],
    trialsQuery: 'Usher Syndrome',
    externalResources: [
      { label: 'Foundation Fighting Blindness: Usher syndrome', href: 'https://www.fightingblindness.org/diseases/usher-syndrome' },
      { label: 'Usher Syndrome Coalition', href: 'https://www.usher-syndrome.org/' },
    ],
    related: [
      { label: 'Retinitis pigmentosa', href: '/eye-conditions/retinitis-pigmentosa' },
      { label: 'Braille & literacy tools', href: '/devices-technology/braille-literacy-tools' },
      { label: 'Employment & vocational help', href: '/community-support/employment-vocational' },
    ],
  },

  // ── Leber congenital amaurosis ───────────────────────────────────────────
  {
    slug: 'leber-congenital-amaurosis',
    name: 'Leber Congenital Amaurosis (LCA)',
    shortName: 'Leber Congenital Amaurosis (LCA)',
    alternateNames: ['LCA', 'early-onset severe retinal dystrophy', 'EOSRD'],
    group: 'inherited',
    summary:
      'A group of inherited retinal diseases that cause severe vision loss from birth or early infancy. One form has an FDA-approved gene therapy.',
    quickFacts: [
      { label: 'Who it affects', value: 'Infants; usually noticed in the first months of life' },
      { label: 'Vision affected', value: 'Severe vision loss, often with nystagmus (shaking eye movements)' },
      { label: 'Inherited?', value: 'Yes. More than 25 genes are known; usually autosomal recessive' },
      { label: 'Treatment', value: 'Gene therapy for RPE65-related LCA; trials for other genes' },
    ],
    whatItIs: [
      'In LCA, the retina doesn\'t work properly from birth. Parents may first notice that their baby doesn\'t follow faces or objects, has wandering or shaking eyes (nystagmus), stares at lights, or presses on their eyes (the oculo-digital sign).',
      'Common genes include CEP290, GUCY2D, CRB1 and RPE65. The gene affects both how vision changes over time and which treatments or trials may apply.',
    ],
    howItAffectsVision: [
      'Vision ranges from light perception to low vision, and some forms change over time. Early support helps children develop language, movement and literacy skills using all their senses.',
    ],
    dailyImpacts: [
      'Early development: reaching, crawling and walking',
      'Learning to read; many children learn braille, some use large print or both',
      'Getting around independently as they grow',
    ],
    causes: {
      heading: 'How LCA is inherited',
      paragraphs: [
        'Most LCA is autosomal recessive: both parents carry one changed copy of the same gene, and each child has a 25% chance of being affected. Genetic testing is essential, because treatment and trial eligibility depend on the gene.',
      ],
    },
    treatments: {
      intro: 'Treatment depends on the gene:',
      items: [
        { name: 'RPE65 gene therapy', detail: 'Voretigene neparvovec (Luxturna), FDA-approved in December 2017, is a one-time treatment for people with changes in both copies of RPE65 who still have enough viable retinal cells. It improved navigation in dim light in its trials.' },
        { name: 'Clinical trials', detail: 'Gene therapies and RNA-based therapies for other genes, such as GUCY2D, CEP290 and LCA5, are in trials.' },
      ],
    },
    whatHelps: [
      { title: 'Early intervention (birth to 3)', detail: 'Free developmental services under IDEA Part C, including vision services. Ask your pediatrician for a referral as soon as there\'s a concern.', link: { label: 'Youth & family pathways', href: '/community-support/youth-family-pathways' } },
      { title: 'A TVI and an O&M specialist', detail: 'Support for braille, early concepts and movement from the preschool years.', link: { label: 'School services', href: '/community-support/education-services' } },
      { title: 'Genetic testing and counseling', detail: 'Finds the gene and helps the family understand chances for future children.', link: { label: 'Genetic testing guide', href: '/eye-conditions/genetic-testing' } },
      { title: 'Braille and literacy tools', detail: 'Early braille exposure, tactile books and accessible technology.', link: { label: 'Braille & literacy tools', href: '/devices-technology/braille-literacy-tools' } },
    ],
    questions: [
      'Which gene is causing my child\'s LCA?',
      'Is my child a candidate for gene therapy or a clinical trial?',
      'How might my child\'s vision change over time?',
      'What early intervention and vision services should start now?',
      'What does the inheritance pattern mean for future children?',
    ],
    research: [
      'LCA was the first inherited retinal disease with an FDA-approved gene therapy, and it remains a leading area for gene and RNA therapy trials.',
    ],
    trialsQuery: 'Leber Congenital Amaurosis',
    externalResources: [
      { label: 'Foundation Fighting Blindness: LCA', href: 'https://www.fightingblindness.org/diseases/leber-congenital-amaurosis-lca' },
      { label: 'National Eye Institute: Inherited retinal diseases', href: 'https://www.nei.nih.gov/learn-about-eye-health/eye-conditions-and-diseases' },
    ],
    related: [
      { label: 'Caregiver & family support', href: '/community-support/caregiver-family' },
      { label: 'Clinical trials & research', href: '/eye-conditions/clinical-trials' },
      { label: 'Start the intake as a caregiver', href: '/intake/start?mode=caregiver' },
    ],
  },
];

/** Inherited retinal diseases without their own page yet: short summaries with links out. */
export const otherInheritedConditions: { name: string; summary: string; href: string }[] = [
  { name: 'Achromatopsia', summary: 'Little or no color vision from birth, with light sensitivity and reduced sharpness; usually stable.', href: 'https://www.fightingblindness.org/diseases/achromatopsia' },
  { name: 'Choroideremia', summary: 'X-linked; mostly affects males, with night blindness then narrowing side vision.', href: 'https://www.fightingblindness.org/diseases/choroideremia' },
  { name: 'X-linked retinoschisis (XLRS)', summary: 'Splitting of retinal layers in boys and men, affecting central vision from childhood.', href: 'https://www.fightingblindness.org/diseases/x-linked-retinoschisis-xlrs' },
  { name: 'Best disease', summary: 'A dominant macular disease (BEST1 gene) that can reduce central vision, often later in life.', href: 'https://www.fightingblindness.org/diseases/best-disease' },
  { name: 'Bardet-Biedl syndrome (BBS)', summary: 'RP-like vision loss with other features such as extra fingers or toes, obesity and kidney problems.', href: 'https://www.fightingblindness.org/diseases/bardet-biedl-syndrome-bbs' },
  { name: 'Cone-rod dystrophy', summary: 'Central and color vision are affected first, then night and side vision.', href: 'https://www.fightingblindness.org/diseases/rare-retinal-conditions' },
];

export function getCondition(slug: string) {
  return eyeConditions.find((c) => c.slug === slug);
}
