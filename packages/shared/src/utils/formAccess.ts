/**
 * Type-Safe Form Field Accessors
 * Eliminates string-path typos and provides autocomplete
 */

import type {
  MonthlyCareCoordinationForm,
  FormHeader,
  CareCoordinationType,
  NarrativeSections,
  Signature,
  FieldPath,
  FieldMetadata,
} from '../schema/mccmc_v2.js';

// ============================================================================
// Section Types
// ============================================================================

export type FormSection = 'header' | 'careCoordinationType' | 'narrative' | 'signature';

export type HeaderField = keyof FormHeader;
export type CareTypeField = keyof CareCoordinationType;
export type NarrativeField = keyof NarrativeSections;
export type SignatureField = keyof Signature;

// ============================================================================
// Type-safe Getters
// ============================================================================

export function getHeaderField<K extends HeaderField>(
  form: MonthlyCareCoordinationForm,
  field: K
): FormHeader[K] {
  return form.header[field];
}

export function getCareTypeField<K extends CareTypeField>(
  form: MonthlyCareCoordinationForm,
  field: K
): CareCoordinationType[K] {
  return form.careCoordinationType[field];
}

export function getNarrativeField<K extends NarrativeField>(
  form: MonthlyCareCoordinationForm,
  field: K
): NarrativeSections[K] {
  return form.narrative[field];
}

export function getSignatureField<K extends SignatureField>(
  form: MonthlyCareCoordinationForm,
  field: K
): Signature[K] {
  return form.signature[field];
}

// ============================================================================
// Type-safe Setters
// ============================================================================

export function setHeaderField<K extends HeaderField>(
  form: MonthlyCareCoordinationForm,
  field: K,
  value: FormHeader[K]
): void {
  form.header[field] = value;
}

export function setCareTypeField<K extends CareTypeField>(
  form: MonthlyCareCoordinationForm,
  field: K,
  value: CareCoordinationType[K]
): void {
  form.careCoordinationType[field] = value;
}

export function setNarrativeField<K extends NarrativeField>(
  form: MonthlyCareCoordinationForm,
  field: K,
  value: NarrativeSections[K]
): void {
  form.narrative[field] = value;
}

export function setSignatureField<K extends SignatureField>(
  form: MonthlyCareCoordinationForm,
  field: K,
  value: Signature[K]
): void {
  form.signature[field] = value;
}

// ============================================================================
// Generic Field Access (with runtime validation)
// ============================================================================

export function getFieldValue(
  form: MonthlyCareCoordinationForm,
  path: FieldPath
): string | boolean {
  const [section, field] = path.split('.') as [FormSection, string];

  switch (section) {
    case 'header':
      return getHeaderField(form, field as HeaderField);
    case 'careCoordinationType':
      return getCareTypeField(form, field as CareTypeField) as boolean;
    case 'narrative':
      return getNarrativeField(form, field as NarrativeField);
    case 'signature':
      return getSignatureField(form, field as SignatureField);
    default:
      throw new Error(`Unknown section: ${section}`);
  }
}

export function setFieldValue(
  form: MonthlyCareCoordinationForm,
  path: FieldPath,
  value: string | boolean
): void {
  const [section, field] = path.split('.') as [FormSection, string];

  switch (section) {
    case 'header':
      setHeaderField(form, field as HeaderField, value as string);
      break;
    case 'careCoordinationType':
      setCareTypeField(form, field as CareTypeField, value as boolean);
      break;
    case 'narrative':
      setNarrativeField(form, field as NarrativeField, value as string);
      break;
    case 'signature':
      setSignatureField(form, field as SignatureField, value as string);
      break;
    default:
      throw new Error(`Unknown section: ${section}`);
  }
}

// ============================================================================
// Field Metadata (extends schema definition)
// ============================================================================

export { FieldMetadata };

// Extended metadata with runtime information
interface ExtendedFieldMetadata extends FieldMetadata {
  fieldType: 'string' | 'boolean';
}

export const FIELD_METADATA: Record<FieldPath, ExtendedFieldMetadata> = {
  // Header fields
  'header.recipientName': {
    path: 'header.recipientName',
    label: 'Recipient Name',
    type: 'text',
    required: false,
    section: 'header',
    fieldType: 'string',
  },
  'header.date': {
    path: 'header.date',
    label: 'Date',
    type: 'text',
    required: false,
    section: 'header',
    fieldType: 'string',
  },
  'header.time': {
    path: 'header.time',
    label: 'Time',
    type: 'text',
    required: false,
    section: 'header',
    fieldType: 'string',
  },
  'header.recipientIdentifier': {
    path: 'header.recipientIdentifier',
    label: 'Recipient ID',
    type: 'text',
    required: false,
    section: 'header',
    fieldType: 'string',
  },
  'header.dob': {
    path: 'header.dob',
    label: 'Date of Birth',
    type: 'text',
    required: false,
    section: 'header',
    fieldType: 'string',
  },
  'header.location': {
    path: 'header.location',
    label: 'Location',
    type: 'text',
    required: false,
    section: 'header',
    fieldType: 'string',
  },

  // Care Coordination Type fields
  'careCoordinationType.sih': {
    path: 'careCoordinationType.sih',
    label: 'SIH',
    type: 'checkbox',
    required: false,
    section: 'careCoordinationType',
    fieldType: 'boolean',
  },
  'careCoordinationType.hcbw': {
    path: 'careCoordinationType.hcbw',
    label: 'HCBW',
    type: 'checkbox',
    required: false,
    section: 'careCoordinationType',
    fieldType: 'boolean',
  },

  // Narrative fields
  'narrative.recipientAndVisitObservations': {
    path: 'narrative.recipientAndVisitObservations',
    label: 'Recipient & Visit Observations',
    type: 'textarea',
    required: false,
    section: 'narrative',
    fieldType: 'string',
  },
  'narrative.healthEmotionalStatus': {
    path: 'narrative.healthEmotionalStatus',
    label: 'Health/Emotional Status',
    type: 'textarea',
    required: false,
    section: 'narrative',
    fieldType: 'string',
  },
  'narrative.reviewOfServices': {
    path: 'narrative.reviewOfServices',
    label: 'Review of Services',
    type: 'textarea',
    required: false,
    section: 'narrative',
    fieldType: 'string',
  },
  'narrative.progressTowardGoals': {
    path: 'narrative.progressTowardGoals',
    label: 'Progress Toward Goals',
    type: 'textarea',
    required: false,
    section: 'narrative',
    fieldType: 'string',
  },
  'narrative.additionalNotes': {
    path: 'narrative.additionalNotes',
    label: 'Additional Notes',
    type: 'textarea',
    required: false,
    section: 'narrative',
    fieldType: 'string',
  },
  'narrative.followUpTasks': {
    path: 'narrative.followUpTasks',
    label: 'Follow Up Tasks',
    type: 'textarea',
    required: false,
    section: 'narrative',
    fieldType: 'string',
  },

  // Signature fields
  'signature.careCoordinatorName': {
    path: 'signature.careCoordinatorName',
    label: 'Care Coordinator Name',
    type: 'text',
    required: false,
    section: 'signature',
    fieldType: 'string',
  },
  'signature.signature': {
    path: 'signature.signature',
    label: 'Signature',
    type: 'text',
    required: false,
    section: 'signature',
    fieldType: 'string',
  },
  'signature.dateSigned': {
    path: 'signature.dateSigned',
    label: 'Date Signed',
    type: 'text',
    required: false,
    section: 'signature',
    fieldType: 'string',
  },
};

export function getFieldMetadata(path: FieldPath): FieldMetadata | undefined {
  return FIELD_METADATA[path];
}

export function isRequiredField(path: FieldPath): boolean {
  return FIELD_METADATA[path]?.required ?? false;
}

export function getFieldLabel(path: FieldPath): string {
  return FIELD_METADATA[path]?.label ?? path;
}

export function getAllFields(): FieldPath[] {
  return Object.keys(FIELD_METADATA) as FieldPath[];
}

export function getFieldsBySection(section: FormSection | string): FieldPath[] {
  return getAllFields().filter(path => FIELD_METADATA[path].section === section);
}

// ============================================================================
// Form Utility Functions
// ============================================================================

/**
 * Check if a form field has a meaningful value
 */
export function hasValue(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (typeof value === 'boolean') {
    return true; // Boolean fields always have a value (true/false)
  }
  return false;
}

/**
 * Check if a form field is empty
 */
export function isFieldEmpty(form: MonthlyCareCoordinationForm, path: FieldPath): boolean {
  const value = getFieldValue(form, path);
  if (typeof value === 'boolean') {
    return false; // Checkboxes are never "empty"
  }
  return !value || value.trim().length === 0;
}

/**
 * Get completion statistics for the form
 */
export function getCompletionStats(form: MonthlyCareCoordinationForm): {
  total: number;
  filled: number;
  percentage: number;
} {
  const fields = getAllFields();
  const filled = fields.filter(path => !isFieldEmpty(form, path)).length;

  return {
    total: fields.length,
    filled,
    percentage: Math.round((filled / fields.length) * 100),
  };
}

/**
 * Get all empty required fields
 */
export function getEmptyRequiredFields(form: MonthlyCareCoordinationForm): FieldPath[] {
  return getAllFields().filter(path => isRequiredField(path) && isFieldEmpty(form, path));
}

/**
 * Create a form diff between two forms
 */
export interface FieldDiff {
  path: FieldPath;
  previous: string | boolean;
  current: string | boolean;
  changed: boolean;
}

export function diffForms(
  previous: MonthlyCareCoordinationForm,
  current: MonthlyCareCoordinationForm
): FieldDiff[] {
  return getAllFields().map(path => {
    const prevValue = getFieldValue(previous, path);
    const currValue = getFieldValue(current, path);

    return {
      path,
      previous: prevValue,
      current: currValue,
      changed: prevValue !== currValue,
    };
  });
}

/**
 * Clone a form deeply
 */
export function cloneForm(form: MonthlyCareCoordinationForm): MonthlyCareCoordinationForm {
  return {
    header: { ...form.header },
    careCoordinationType: { ...form.careCoordinationType },
    narrative: { ...form.narrative },
    signature: { ...form.signature },
  };
}

// ============================================================================
// Form Access Utilities Object
// ============================================================================

export const FormAccess = {
  // Getters
  getHeader: getHeaderField,
  getCareType: getCareTypeField,
  getNarrative: getNarrativeField,
  getSignature: getSignatureField,
  get: getFieldValue,

  // Setters
  setHeader: setHeaderField,
  setCareType: setCareTypeField,
  setNarrative: setNarrativeField,
  setSignature: setSignatureField,
  set: setFieldValue,

  // Metadata
  getMetadata: getFieldMetadata,
  isRequired: isRequiredField,
  getLabel: getFieldLabel,
  getAllFields,
  getFieldsBySection,

  // Utilities
  hasValue,
  isEmpty: isFieldEmpty,
  getCompletionStats,
  getEmptyRequiredFields,
  diff: diffForms,
  clone: cloneForm,
};
