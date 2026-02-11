/**
 * Form schema for "Monthly Care Coordination Monitoring Contact" form
 * Based on AGENTS.md specification
 */

// Header fields
export interface FormHeader {
  recipientName: string;
  date: string;
  time: string;
  recipientIdentifier: string;
  dob: string;
  location: string;
}

// Care Coordination Type checkboxes
export interface CareCoordinationType {
  sih: boolean;
  hcbw: boolean;
}

// Contact Type checkboxes
export interface ContactType {
  faceToFaceVisit: boolean;
  otherMonitoringContact: boolean;
  homeVisit: boolean;
  serviceSiteVisit: boolean;
  whatService: string;
}

// Narrative sections
export interface NarrativeSections {
  recipientAndVisitObservations: string;
  healthEmotionalStatus: string;  // Med changes, doctor visits, behavior, incidents, falls, hospital visits
  reviewOfServices: string;
  progressTowardGoals: string;
  additionalNotes: string;
}

// Complete form data structure
export interface MonthlyCareCoordinationForm {
  header: FormHeader;
  careCoordinationType: CareCoordinationType;
  contactType: ContactType;
  narrative: NarrativeSections;
  notesForReviewer: string;
}

// Field confidence levels for UI highlighting
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface FieldConfidence {
  field: string;
  confidence: ConfidenceLevel;
  source?: string;  // OCR source snippet/region
}

// Extraction result from OCR + LLM processing
export interface ExtractionResult {
  form: MonthlyCareCoordinationForm;
  confidence: FieldConfidence[];
  rawText: string;  // Original OCR text (not logged per HIPAA)
}

// Empty form template
export function createEmptyForm(): MonthlyCareCoordinationForm {
  return {
    header: {
      recipientName: '',
      date: '',
      time: '',
      recipientIdentifier: '',
      dob: '',
      location: ''
    },
    careCoordinationType: {
      sih: false,
      hcbw: false
    },
    contactType: {
      faceToFaceVisit: false,
      otherMonitoringContact: false,
      homeVisit: false,
      serviceSiteVisit: false,
      whatService: ''
    },
    narrative: {
      recipientAndVisitObservations: '',
      healthEmotionalStatus: '',
      reviewOfServices: '',
      progressTowardGoals: '',
      additionalNotes: ''
    },
    notesForReviewer: ''
  };
}
