/**
 * MCCMC v2 Form Schema - Updated based on user requirements
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

// Care Coordination Type (checkboxes)
export const CareCoordinationTypeSchema = z.object({
  sih: z.boolean().default(false),
  hcbw: z.boolean().default(false),
});
export type CareCoordinationType = z.infer<typeof CareCoordinationTypeSchema>;

// Main narrative sections
export const NarrativeSectionsSchema = z.object({
  // Main section - Recipient & Visit observations
  recipientAndVisitObservations: z.string().default(''),
  
  // Health section - combined
  healthEmotionalStatus: z.string().default(''),
  
  // Review of Services
  reviewOfServices: z.string().default(''),
  
  // Progress toward goals
  progressTowardGoals: z.string().default(''),
  
  // Additional notes
  additionalNotes: z.string().default(''),
  
  // NEW: Care coordinator follow up tasks
  followUpTasks: z.string().default(''),
});
export type NarrativeSections = z.infer<typeof NarrativeSectionsSchema>;

// Signature section (NEW)
export const SignatureSchema = z.object({
  careCoordinatorName: z.string().default(''),
  signature: z.string().default(''),
  dateSigned: z.string().default(''),
});
export type Signature = z.infer<typeof SignatureSchema>;

// Complete form schema
export const MonthlyCareCoordinationFormSchema = z.object({
  header: FormHeaderSchema,
  careCoordinationType: CareCoordinationTypeSchema,
  narrative: NarrativeSectionsSchema,
  signature: SignatureSchema,
});
export type MonthlyCareCoordinationForm = z.infer<typeof MonthlyCareCoordinationFormSchema>;

// Extraction result
export const ExtractionResultSchema = z.object({
  form: MonthlyCareCoordinationFormSchema,
  confidence: z.array(FieldConfidenceSchema),
  rawText: z.string(),
  extractionMethod: z.enum(['ocr-only', 'llm-structured', 'llm-categorized', 'vision-llm', 'manual']).default('ocr-only'),
  ollamaAvailable: z.boolean().default(false),
  // NEW: OCR preview shown to user before form fill
  ocrPreview: z.string().optional(),
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
    narrative: {
      recipientAndVisitObservations: '',
      healthEmotionalStatus: '',
      reviewOfServices: '',
      progressTowardGoals: '',
      additionalNotes: '',
      followUpTasks: '',
    },
    signature: {
      careCoordinatorName: '',
      signature: '',
      dateSigned: '',
    },
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

// Field metadata for UI
export type FieldPath = 
  | `header.${keyof FormHeader}`
  | `careCoordinationType.${keyof CareCoordinationType}`
  | `narrative.${keyof NarrativeSections}`
  | `signature.${keyof Signature}`;

export interface FieldMetadata {
  path: FieldPath;
  label: string;
  type: 'text' | 'checkbox' | 'textarea';
  required: boolean;
  section: string;
  placeholder?: string;
}

// All fields metadata
export const FORM_FIELDS: FieldMetadata[] = [
  // Header
  { path: 'header.recipientName', label: 'Recipient Name', type: 'text', required: true, section: 'Header', placeholder: 'Enter recipient name' },
  { path: 'header.date', label: 'Date', type: 'text', required: true, section: 'Header', placeholder: 'MM/DD/YYYY' },
  { path: 'header.time', label: 'Time', type: 'text', required: false, section: 'Header', placeholder: 'HH:MM' },
  { path: 'header.recipientIdentifier', label: 'Recipient Identifier', type: 'text', required: false, section: 'Header', placeholder: 'ID number' },
  { path: 'header.dob', label: 'Date of Birth', type: 'text', required: false, section: 'Header', placeholder: 'MM/DD/YYYY' },
  { path: 'header.location', label: 'Location', type: 'text', required: false, section: 'Header', placeholder: 'Visit location' },
  
  // Care Coordination Type
  { path: 'careCoordinationType.sih', label: 'SIH', type: 'checkbox', required: false, section: 'Care Coordination Type' },
  { path: 'careCoordinationType.hcbw', label: 'HCBW', type: 'checkbox', required: false, section: 'Care Coordination Type' },
  
  // Narrative sections
  { 
    path: 'narrative.recipientAndVisitObservations', 
    label: 'Recipient & Visit Observations', 
    type: 'textarea', 
    required: false, 
    section: 'Observations',
    placeholder: 'What are they doing, communicating, any concerns regarding home/site status, misc. information, etc.'
  },
  { 
    path: 'narrative.healthEmotionalStatus', 
    label: 'Health/Emotional Status, Med Changes, Doctor Visits, Behavior Changes, Critical Incidents, Falls, Hospital/Urgent Care Visits', 
    type: 'textarea', 
    required: false, 
    section: 'Health',
    placeholder: 'Describe health status, medication changes, doctor visits, behaviors, incidents, falls, hospital visits...'
  },
  { 
    path: 'narrative.reviewOfServices', 
    label: 'Review of Services', 
    type: 'textarea', 
    required: false, 
    section: 'Services',
    placeholder: 'Review current services being provided'
  },
  { 
    path: 'narrative.progressTowardGoals', 
    label: 'Progress Toward Goals', 
    type: 'textarea', 
    required: false, 
    section: 'Goals',
    placeholder: 'How is the recipient doing on their goals? Are current goals supporting the recipient? Any changes needed?'
  },
  { 
    path: 'narrative.additionalNotes', 
    label: 'Additional Notes', 
    type: 'textarea', 
    required: false, 
    section: 'Notes',
    placeholder: 'Any additional information'
  },
  { 
    path: 'narrative.followUpTasks', 
    label: 'Care Coordinator Follow Up Tasks', 
    type: 'textarea', 
    required: false, 
    section: 'Follow Up',
    placeholder: 'List any follow-up tasks for the care coordinator'
  },
  
  // Signature
  { path: 'signature.careCoordinatorName', label: 'Care Coordinator Name', type: 'text', required: false, section: 'Signature', placeholder: 'Your name' },
  { path: 'signature.signature', label: 'Signature', type: 'text', required: false, section: 'Signature', placeholder: 'Type your signature' },
  { path: 'signature.dateSigned', label: 'Date Signed', type: 'text', required: false, section: 'Signature', placeholder: 'MM/DD/YYYY' },
];
