// Profession slugs accepted by the directory. Keep in sync with
// src/data/professions.ts (labels and descriptions live there).
export const PROFESSION_SLUGS = [
  'low-vision-optometrists',
  'ophthalmologists',
  'occupational-therapists',
  'vision-rehabilitation-therapists',
  'orientation-mobility-specialists',
  'low-vision-therapists',
  'assistive-technology-specialists',
  'teachers-visual-impairments',
  'vocational-rehabilitation-counselors',
  'counselors-therapists',
  'genetic-counselors',
  'other-vision-professionals',
];
export const SERVICE_MODE_KEYS = ['inPerson', 'telehealth', 'homeVisits'];
export const AGE_GROUP_KEYS = ['children', 'teens', 'adults', 'seniors'];
export const PAYMENT_KEYS = ['medicare', 'medicaid', 'va', 'private', 'selfPay', 'slidingScale', 'free'];

// Singular labels for emails (match src/data/professions.ts).
const LABELS = {
  'low-vision-optometrists': 'Low Vision Optometrist',
  ophthalmologists: 'Ophthalmologist',
  'occupational-therapists': 'Occupational Therapist',
  'vision-rehabilitation-therapists': 'Vision Rehabilitation Therapist',
  'orientation-mobility-specialists': 'Orientation & Mobility Specialist',
  'low-vision-therapists': 'Certified Low Vision Therapist',
  'assistive-technology-specialists': 'Assistive Technology Specialist',
  'teachers-visual-impairments': 'Teacher of Students with Visual Impairments',
  'vocational-rehabilitation-counselors': 'Vocational Rehabilitation Counselor',
  'counselors-therapists': 'Counselor / Therapist',
  'genetic-counselors': 'Genetic Counselor',
  'other-vision-professionals': 'Vision Professional',
};
export const professionLabel = (slug) => LABELS[slug] ?? slug;
