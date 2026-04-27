/**
 * Centralized Form Validation
 * Single source of truth for form validation rules
 */

import type { MonthlyCareCoordinationForm, FieldPath } from '../schema/mccmc_v2.js';

import { DateTimeUtils } from './dateTime.js';
import { FormAccess, getEmptyRequiredFields } from './formAccess.js';

// ============================================================================
// Validation Types
// ============================================================================

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  path: FieldPath;
  /** Alias for `path` — used by some consumers that expect `field`. */
  field?: FieldPath;
  message: string;
  severity: ValidationSeverity;
  code: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  infos: ValidationIssue[];
  all: ValidationIssue[];
}

export type ValidationRule = (
  value: unknown,
  form: MonthlyCareCoordinationForm
) => ValidationIssue | null;

// ============================================================================
// Field Validation Rules
// ============================================================================

export const ValidationRules = {
  required:
    (fieldName: string): ValidationRule =>
    value => {
      if (!value || (typeof value === 'string' && value.trim().length === 0)) {
        return {
          path: '' as FieldPath, // Will be set by validator
          message: `${fieldName} is required`,
          severity: 'error',
          code: 'REQUIRED',
        };
      }
      return null;
    },

  dateFormat:
    (fieldName: string): ValidationRule =>
    value => {
      if (!value) return null;
      if (typeof value !== 'string') {
        return {
          path: '' as FieldPath,
          message: `${fieldName} must be a string`,
          severity: 'error',
          code: 'INVALID_TYPE',
        };
      }
      if (!DateTimeUtils.isValidDate(value)) {
        return {
          path: '' as FieldPath,
          message: `${fieldName} should be in MM/DD/YYYY format`,
          severity: 'error',
          code: 'INVALID_DATE_FORMAT',
        };
      }
      if (!DateTimeUtils.isDatePlausible(value)) {
        return {
          path: '' as FieldPath,
          message: `${fieldName} appears to be an invalid date`,
          severity: 'warning',
          code: 'IMPLAUSIBLE_DATE',
        };
      }
      return null;
    },

  timeFormat:
    (fieldName: string): ValidationRule =>
    value => {
      if (!value) return null;
      if (typeof value !== 'string') {
        return {
          path: '' as FieldPath,
          message: `${fieldName} must be a string`,
          severity: 'error',
          code: 'INVALID_TYPE',
        };
      }
      if (!DateTimeUtils.isValidTime(value)) {
        return {
          path: '' as FieldPath,
          message: `${fieldName} should be in HH:MM format`,
          severity: 'warning',
          code: 'INVALID_TIME_FORMAT',
        };
      }
      return null;
    },

  minLength:
    (fieldName: string, min: number): ValidationRule =>
    value => {
      if (!value || typeof value !== 'string') return null;
      if (value.trim().length < min) {
        return {
          path: '' as FieldPath,
          message: `${fieldName} should be at least ${min} characters`,
          severity: 'warning',
          code: 'MIN_LENGTH',
        };
      }
      return null;
    },

  maxLength:
    (fieldName: string, max: number): ValidationRule =>
    value => {
      if (!value || typeof value !== 'string') return null;
      if (value.length > max) {
        return {
          path: '' as FieldPath,
          message: `${fieldName} should not exceed ${max} characters`,
          severity: 'warning',
          code: 'MAX_LENGTH',
        };
      }
      return null;
    },

  pattern:
    (fieldName: string, regex: RegExp, message: string): ValidationRule =>
    value => {
      if (!value || typeof value !== 'string') return null;
      if (!regex.test(value)) {
        return {
          path: '' as FieldPath,
          message,
          severity: 'error',
          code: 'PATTERN_MISMATCH',
        };
      }
      return null;
    },
};

// ============================================================================
// Field Validation Configurations
// ============================================================================

interface FieldValidationConfig {
  rules: ValidationRule[];
}

const FIELD_VALIDATIONS: Partial<Record<FieldPath, FieldValidationConfig>> = {
  'header.recipientName': {
    rules: [
      ValidationRules.minLength('Recipient name', 2),
      ValidationRules.maxLength('Recipient name', 100),
    ],
  },
  'header.date': {
    rules: [ValidationRules.dateFormat('Date')],
  },
  'header.time': {
    rules: [ValidationRules.timeFormat('Time')],
  },
  'header.recipientIdentifier': {
    rules: [ValidationRules.maxLength('Recipient ID', 50)],
  },
  'header.dob': {
    rules: [ValidationRules.dateFormat('Date of birth')],
  },
  'header.location': {
    rules: [ValidationRules.maxLength('Location', 100)],
  },
  'narrative.recipientAndVisitObservations': {
    rules: [
      ValidationRules.minLength('Recipient & Visit Observations', 20),
      ValidationRules.maxLength('Recipient & Visit Observations', 3000),
    ],
  },
  'narrative.healthEmotionalStatus': {
    rules: [
      ValidationRules.minLength('Health/Emotional Status', 20),
      ValidationRules.maxLength('Health/Emotional Status', 3000),
    ],
  },
  'narrative.reviewOfServices': {
    rules: [
      ValidationRules.minLength('Review of Services', 20),
      ValidationRules.maxLength('Review of Services', 3000),
    ],
  },
  'narrative.progressTowardGoals': {
    rules: [
      ValidationRules.minLength('Progress Toward Goals', 20),
      ValidationRules.maxLength('Progress Toward Goals', 3000),
    ],
  },
  'narrative.additionalNotes': {
    rules: [ValidationRules.maxLength('Additional Notes', 3000)],
  },
  'narrative.followUpTasks': {
    rules: [ValidationRules.maxLength('Follow Up Tasks', 3000)],
  },
  'signature.careCoordinatorName': {
    rules: [ValidationRules.maxLength('Care Coordinator Name', 100)],
  },
  'signature.dateSigned': {
    rules: [ValidationRules.dateFormat('Date signed')],
  },
};

// ============================================================================
// Form Validation Functions
// ============================================================================

/**
 * Validate a single field
 */
export function validateField(
  path: FieldPath,
  form: MonthlyCareCoordinationForm
): ValidationIssue[] {
  const config = FIELD_VALIDATIONS[path];
  if (!config) return [];

  const value = FormAccess.get(form, path);
  const issues: ValidationIssue[] = [];

  for (const rule of config.rules) {
    const issue = rule(value, form);
    if (issue) {
      issues.push({ ...issue, path, field: path });
    }
  }

  return issues;
}

/**
 * Validate the entire form (business logic validation)
 * Note: Different from schema validation in schema/mccmc_v2.ts
 */
export function validateFormData(form: MonthlyCareCoordinationForm): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const infos: ValidationIssue[] = [];

  // Check required fields
  const emptyRequired = getEmptyRequiredFields(form);
  for (const path of emptyRequired) {
    const label = FormAccess.getLabel(path);
    errors.push({
      path,
      message: `${label} is required`,
      severity: 'error',
      code: 'REQUIRED',
    });
  }

  // Run field-specific validations
  const allFields = FormAccess.getAllFields();
  for (const path of allFields) {
    const issues = validateField(path, form);
    for (const issue of issues) {
      switch (issue.severity) {
        case 'error':
          errors.push(issue);
          break;
        case 'warning':
          warnings.push(issue);
          break;
        case 'info':
          infos.push(issue);
          break;
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    infos,
    all: [...errors, ...warnings, ...infos],
  };
}

/**
 * Quick validation - just check if form is valid
 */
export function isFormValid(form: MonthlyCareCoordinationForm): boolean {
  return validateFormData(form).valid;
}

/**
 * Get first error for a specific field
 */
export function getFieldError(
  path: FieldPath,
  form: MonthlyCareCoordinationForm
): ValidationIssue | null {
  const issues = validateField(path, form);
  return issues.find(i => i.severity === 'error') || null;
}

/**
 * Apply smart defaults to a form
 */
export function applySmartDefaults(
  form: MonthlyCareCoordinationForm
): Partial<MonthlyCareCoordinationForm> {
  const updates: Partial<MonthlyCareCoordinationForm> = {};

  // Default location to Home if empty
  if (!form.header.location) {
    updates.header = { ...form.header, location: 'Home' };
  }

  return updates;
}

/**
 * Auto-format field values
 */
export function autoFormatField(path: FieldPath, value: string): string {
  const metadata = FormAccess.getMetadata(path);
  if (!metadata) return value;

  // Date fields
  if (
    path.includes('date') ||
    path.includes('Date') ||
    path.includes('dob') ||
    path.includes('DOB')
  ) {
    return DateTimeUtils.normalizeDate(value);
  }

  // Time fields
  if (path.includes('time') || path.includes('Time')) {
    return DateTimeUtils.normalizeTime(value);
  }

  return value.trim();
}

// ============================================================================
// Validation Utilities Object
// ============================================================================

export const FormValidator = {
  validate: validateFormData,
  validateField,
  isValid: isFormValid,
  getFieldError,
  applySmartDefaults,
  autoFormat: autoFormatField,
  rules: ValidationRules,
};
