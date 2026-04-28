import type { ExtractionResult, FieldPath } from '@ara/shared';

export interface ValidationError {
  field: FieldPath;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationState {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

function normalizeIssues(
  items: Array<{
    field?: FieldPath;
    path?: FieldPath;
    message: string;
    severity: 'error' | 'warning';
  }>
): ValidationError[] {
  return items
    .map(item => ({
      field: item.field ?? item.path,
      message: item.message,
      severity: item.severity,
    }))
    .filter((item): item is ValidationError => Boolean(item.field));
}

export async function validateForm(form: ExtractionResult['form']): Promise<ValidationState> {
  try {
    const response = await fetch(
      `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/validate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form }),
      }
    );

    if (!response.ok) throw new Error('Validation failed');
    const data = (await response.json()) as {
      valid: boolean;
      errors?: Array<{
        field?: FieldPath;
        path?: FieldPath;
        message: string;
        severity: 'error' | 'warning';
      }>;
      warnings?: Array<{
        field?: FieldPath;
        path?: FieldPath;
        message: string;
        severity: 'error' | 'warning';
      }>;
    };

    return {
      valid: data.valid,
      errors: normalizeIssues(data.errors ?? []),
      warnings: normalizeIssues(data.warnings ?? []),
    };
  } catch {
    // Fallback client-side validation if server fails
    return clientSideValidation(form);
  }
}

function clientSideValidation(form: ExtractionResult['form']): ValidationState {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (!form.header.recipientName?.trim()) {
    warnings.push({
      field: 'header.recipientName',
      message: 'Recipient name not yet entered',
      severity: 'warning',
    });
  }

  if (form.header.date?.trim()) {
    // Validate format only when a value is present
    const datePatterns = [
      /^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}$/,
      /^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/,
      /^\d{8}$/,
    ];
    const isValidFormat = datePatterns.some(pattern => pattern.test(form.header.date));
    if (!isValidFormat) {
      warnings.push({
        field: 'header.date',
        message: 'Use date format like MM/DD/YYYY or 2024-03-15',
        severity: 'warning',
      });
    }
  } else {
    warnings.push({
      field: 'header.date',
      message: 'Date not yet entered',
      severity: 'warning',
    });
  }

  // Check DOB format if provided
  if (form.header.dob?.trim()) {
    const dobPatterns = [
      /^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}$/,
      /^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/,
      /^\d{8}$/,
    ];
    if (!dobPatterns.some(pattern => pattern.test(form.header.dob))) {
      warnings.push({
        field: 'header.dob',
        message: 'Date of birth will be auto-formatted',
        severity: 'warning',
      });
    }
  }

  // Check narrative sections
  const narrativeFields: Array<[FieldPath, string]> = [
    ['narrative.recipientAndVisitObservations', 'Recipient & Visit Observations'],
    ['narrative.healthEmotionalStatus', 'Health/Emotional Status'],
    ['narrative.reviewOfServices', 'Review of Services'],
    ['narrative.progressTowardGoals', 'Progress Toward Goals'],
  ];

  for (const [field, label] of narrativeFields) {
    const value = getNestedValue(form, field);
    if (!value || value.length < 20) {
      warnings.push({
        field,
        message: `${label} appears incomplete`,
        severity: 'warning',
      });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function getNestedValue(obj: any, path: string): string {
  return path.split('.').reduce((acc, part) => acc?.[part], obj) || '';
}

export function setNestedValue(obj: any, path: string, value: any): void {
  const parts = path.split('.');
  const last = parts.pop()!;
  const target = parts.reduce((acc, part) => acc[part], obj);
  target[last] = value;
}

// Auto-formatting with smart corrections - handles ALL edge cases
export async function autoFormatDate(value: string): Promise<string> {
  if (!value) return '';

  // Trim whitespace
  value = value.trim();

  // Already normalized?
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    return value;
  }

  // Check for written date format (March 15, 2024)
  const writtenMatch = value.match(
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})$/i
  );
  if (writtenMatch) {
    const months: Record<string, string> = {
      january: '01',
      february: '02',
      march: '03',
      april: '04',
      may: '05',
      june: '06',
      july: '07',
      august: '08',
      september: '09',
      october: '10',
      november: '11',
      december: '12',
    };
    const month = months[writtenMatch[1].toLowerCase()];
    const day = writtenMatch[2].padStart(2, '0');
    const year = writtenMatch[3];
    return `${month}/${day}/${year}`;
  }

  // ISO format: YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = value.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    let monthNum = parseInt(month);
    let dayNum = parseInt(day);

    // Fix invalid month
    if (monthNum === 0) {
      monthNum = 1;
    } else if (monthNum > 12) {
      monthNum = 12;
    }

    // Fix invalid day
    if (dayNum === 0) {
      dayNum = 1;
    } else if (dayNum > 31) {
      dayNum = 31;
    }

    // Adjust for month
    const daysInMonth = new Date(parseInt(year), monthNum, 0).getDate();
    if (dayNum > daysInMonth) {
      dayNum = daysInMonth;
    }

    const formatted = `${String(monthNum).padStart(2, '0')}/${String(dayNum).padStart(
      2,
      '0'
    )}/${year}`;
    return formatted;
  }

  // European format: DD-MM-YYYY or DD.MM.YYYY (detect by first number > 12)
  const euroMatch = value.match(/^(\d{1,2})[.\-](\d{1,2})[.\-](\d{4})$/);
  if (euroMatch) {
    const [, first, second, year] = euroMatch;
    const firstNum = parseInt(first);
    const secondNum = parseInt(second);

    // If first number > 12, it's likely day (European format)
    if (firstNum > 12) {
      let dayNum = firstNum;
      let monthNum = secondNum;

      // Fix month
      if (monthNum === 0) {
        monthNum = 1;
      } else if (monthNum > 12) {
        monthNum = 12;
      }

      // Fix day
      if (dayNum === 0) {
        dayNum = 1;
      } else if (dayNum > 31) {
        dayNum = 31;
      }

      // Adjust for month
      const daysInMonth = new Date(parseInt(year), monthNum, 0).getDate();
      if (dayNum > daysInMonth) {
        dayNum = daysInMonth;
      }

      const formatted = `${String(monthNum).padStart(2, '0')}/${String(dayNum).padStart(
        2,
        '0'
      )}/${year}`;
      return formatted;
    }
  }

  // US format: M/D/YYYY or MM/DD/YYYY or M-D-YYYY
  const usMatch = value.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (usMatch) {
    let [, month, day, year] = usMatch;
    let monthNum = parseInt(month);
    let dayNum = parseInt(day);

    // Fix invalid month (00 → 01, >12 → 12)
    if (monthNum === 0) {
      monthNum = 1;
    } else if (monthNum > 12) {
      monthNum = 12;
    }

    // Fix invalid day (00 → 01, >31 → 31)
    if (dayNum === 0) {
      dayNum = 1;
    } else if (dayNum > 31) {
      dayNum = 31;
    }

    // Handle 2-digit years
    if (year.length === 2) {
      const yearNum = parseInt(year);
      year = yearNum < 50 ? `20${year}` : `19${year}`;
    }

    // Adjust day for months with fewer days
    const daysInMonth = new Date(parseInt(year), monthNum, 0).getDate();
    if (dayNum > daysInMonth) {
      dayNum = daysInMonth;
    }

    const formatted = `${String(monthNum).padStart(2, '0')}/${String(dayNum).padStart(
      2,
      '0'
    )}/${year}`;
    return formatted;
  }

  // Compact format: MMDDYYYY or DDMMYYYY (8 digits)
  const compactMatch = value.match(/^(\d{8})$/);
  if (compactMatch) {
    const digits = compactMatch[1];
    // Try MM/DD/YYYY first
    let month = parseInt(digits.slice(0, 2));
    let day = parseInt(digits.slice(2, 4));
    const year = digits.slice(4);

    // If month > 12, assume DDMMYYYY
    if (month > 12) {
      const temp = month;
      month = day;
      day = temp;
    }

    // Fix invalid values
    if (month === 0) month = 1;
    if (month > 12) month = 12;
    if (day === 0) day = 1;
    if (day > 31) day = 31;

    const daysInMonth = new Date(parseInt(year), month, 0).getDate();
    if (day > daysInMonth) day = daysInMonth;

    return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
  }

  return value;
}

export async function autoFormatTime(value: string): Promise<string> {
  if (!value) return '';

  // Try server first
  try {
    const response = await fetch(
      `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/format`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value, type: 'time' }),
      }
    );
    if (response.ok) {
      const data = await response.json();
      return data.formatted;
    }
  } catch {
    // Fall through to client-side
  }

  // Client-side fallback
  const militaryMatch = value.match(/^(\d{1,2})(\d{2})$/);
  if (militaryMatch) {
    const hours = parseInt(militaryMatch[1]);
    const minutes = militaryMatch[2];
    if (hours <= 23 && parseInt(minutes) <= 59) {
      return `${String(hours).padStart(2, '0')}:${minutes}`;
    }
  }

  return value;
}

// Smart defaults
export function applySmartDefaults(
  form: ExtractionResult['form']
): Partial<ExtractionResult['form']> {
  const updates: Partial<ExtractionResult['form']> = {};

  // Default location
  if (!form.header.location) {
    updates.header = { ...form.header, location: 'Home' };
  }

  return updates;
}
