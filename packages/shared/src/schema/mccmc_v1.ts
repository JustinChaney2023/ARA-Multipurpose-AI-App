/**
 * MCCMC v1 Form Schema with Zod validation
 * Monthly Care Coordination Monitoring Contact
 */

import { z } from 'zod';

// Confidence level for extracted fields
export const ConfidenceLevelSchema = z.enum(['high', 'medium', 'low']);
export type ConfidenceLevel = z.infer<typeof ConfidenceLevelSchema>;

// Field confidence info
export const FieldConfidenceSchema = z.object({
  field: z.string(),
  confidence: ConfidenceLevelSchema,
  ocrConfidence: z.number().min(0).max(100).optional(),
  source: z.string().optional(),
});
export type FieldConfidence = z.infer<typeof FieldConfidenceSchema>;

// Header fields
export const FormHeaderSchema = z.object({
  recipientName: z.string().default(''),
  date: z.string().default(''),
  time: z.string().default(''),
  recipientIdentifier: z.string().default(''),
  dob: z.string().default(''),
  location: z.string().default(''),
});
export type FormHeader = z.infer<typeof FormHeaderSchema>;

// Care Coordination Type
export const CareCoordinationTypeSchema = z.object({
  sih: z.boolean().default(false),
  hcbw: z.boolean().default(false),
});
export type CareCoordinationType = z.infer<typeof CareCoordinationTypeSchema>;

// Contact Type
export const ContactTypeSchema = z.object({
  faceToFaceVisit: z.boolean().default(false),
  otherMonitoringContact: z.boolean().default(false),
  homeVisit: z.boolean().default(false),
  serviceSiteVisit: z.boolean().default(false),
  whatService: z.string().default(''),
});
export type ContactType = z.infer<typeof ContactTypeSchema>;

// Narrative sections
export const NarrativeSectionsSchema = z.object({
  recipientAndVisitObservations: z.string().default(''),
  healthEmotionalStatus: z.string().default(''),
  reviewOfServices: z.string().default(''),
  progressTowardGoals: z.string().default(''),
  additionalNotes: z.string().default(''),
});
export type NarrativeSections = z.infer<typeof NarrativeSectionsSchema>;

// Complete form schema
export const MonthlyCareCoordinationFormSchema = z.object({
  header: FormHeaderSchema,
  careCoordinationType: CareCoordinationTypeSchema,
  contactType: ContactTypeSchema,
  narrative: NarrativeSectionsSchema,
  notesForReviewer: z.string().default(''),
});
export type MonthlyCareCoordinationForm = z.infer<typeof MonthlyCareCoordinationFormSchema>;

// Extraction result from OCR + LLM processing
export const ExtractionResultSchema = z.object({
  form: MonthlyCareCoordinationFormSchema,
  confidence: z.array(FieldConfidenceSchema),
  rawText: z.string(),
  extractionMethod: z.enum(['ocr-only', 'llm-structured', 'llm-categorized', 'vision-llm']).default('ocr-only'),
  ollamaAvailable: z.boolean().default(false),
});
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

// Create empty form with defaults
export function createEmptyForm(): MonthlyCareCoordinationForm {
  return MonthlyCareCoordinationFormSchema.parse({
    header: {
      recipientName: '',
      date: '',
      time: '',
      recipientIdentifier: '',
      dob: '',
      location: '',
    },
    careCoordinationType: {
      sih: false,
      hcbw: false,
    },
    contactType: {
      faceToFaceVisit: false,
      otherMonitoringContact: false,
      homeVisit: false,
      serviceSiteVisit: false,
      whatService: '',
    },
    narrative: {
      recipientAndVisitObservations: '',
      healthEmotionalStatus: '',
      reviewOfServices: '',
      progressTowardGoals: '',
      additionalNotes: '',
    },
    notesForReviewer: '',
  });
}

// Validate form data
export function validateForm(data: unknown): MonthlyCareCoordinationForm {
  return MonthlyCareCoordinationFormSchema.parse(data);
}

// Safe parse form data
export function safeValidateForm(data: unknown): { success: true; data: MonthlyCareCoordinationForm } | { success: false; error: z.ZodError } {
  const result = MonthlyCareCoordinationFormSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

// Get field path from form structure
export type FieldPath = 
  | `header.${keyof FormHeader}`
  | `careCoordinationType.${keyof CareCoordinationType}`
  | `contactType.${keyof ContactType}`
  | `narrative.${keyof NarrativeSections}`
  | 'notesForReviewer';

// Field metadata for UI
export interface FieldMetadata {
  path: FieldPath;
  label: string;
  type: 'text' | 'checkbox' | 'textarea';
  required: boolean;
  section: string;
}

// All fields metadata
export const FORM_FIELDS: FieldMetadata[] = [
  // Header
  { path: 'header.recipientName', label: 'Recipient Name', type: 'text', required: true, section: 'Header' },
  { path: 'header.date', label: 'Date', type: 'text', required: true, section: 'Header' },
  { path: 'header.time', label: 'Time', type: 'text', required: false, section: 'Header' },
  { path: 'header.recipientIdentifier', label: 'Recipient Identifier', type: 'text', required: false, section: 'Header' },
  { path: 'header.dob', label: 'Date of Birth', type: 'text', required: false, section: 'Header' },
  { path: 'header.location', label: 'Location', type: 'text', required: false, section: 'Header' },
  // Care Coordination Type
  { path: 'careCoordinationType.sih', label: 'SIH', type: 'checkbox', required: false, section: 'Care Coordination Type' },
  { path: 'careCoordinationType.hcbw', label: 'HCBW', type: 'checkbox', required: false, section: 'Care Coordination Type' },
  // Contact Type
  { path: 'contactType.faceToFaceVisit', label: 'Face to Face Visit with Client', type: 'checkbox', required: false, section: 'Contact Type' },
  { path: 'contactType.otherMonitoringContact', label: 'Other Monitoring Contact with Client or Legal Rep', type: 'checkbox', required: false, section: 'Contact Type' },
  { path: 'contactType.homeVisit', label: 'Home Visit', type: 'checkbox', required: false, section: 'Contact Type' },
  { path: 'contactType.serviceSiteVisit', label: 'Service Site Visit', type: 'checkbox', required: false, section: 'Contact Type' },
  { path: 'contactType.whatService', label: 'What Service', type: 'text', required: false, section: 'Contact Type' },
  // Narrative
  { path: 'narrative.recipientAndVisitObservations', label: 'Recipient & Visit Observations', type: 'textarea', required: false, section: 'Narrative' },
  { path: 'narrative.healthEmotionalStatus', label: 'Health/Emotional Status', type: 'textarea', required: false, section: 'Narrative' },
  { path: 'narrative.reviewOfServices', label: 'Review of Services', type: 'textarea', required: false, section: 'Narrative' },
  { path: 'narrative.progressTowardGoals', label: 'Progress toward Goals', type: 'textarea', required: false, section: 'Narrative' },
  { path: 'narrative.additionalNotes', label: 'Additional Notes', type: 'textarea', required: false, section: 'Narrative' },
  // Reviewer notes
  { path: 'notesForReviewer', label: 'Notes for Reviewer', type: 'textarea', required: false, section: 'Reviewer' },
];
