/**
 * PDF Export functionality - fill fillable PDF forms
 */

import { PDFDocument } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';
import type { MonthlyCareCoordinationForm } from '@ara/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface FieldMapping {
  pdfField: string;
  type: 'text' | 'checkbox' | 'textarea';
  required: boolean;
  label: string;
}

interface TemplateMapping {
  version: string;
  fields: Record<string, FieldMapping>;
}

/**
 * Fill a PDF form with form data
 */
export async function fillPDFForm(
  form: MonthlyCareCoordinationForm,
  templateVersion: string
): Promise<Buffer> {
  logger.info('Starting PDF export', { templateVersion, recipient: form.header.recipientName });
  
  // Load template
  const templatePath = path.join(__dirname, '..', '..', '..', 'templates', templateVersion, 'template.pdf');
  const mappingPath = path.join(__dirname, '..', '..', '..', 'templates', templateVersion, 'mapping.json');
  
  let templateBytes: Buffer;
  let mapping: TemplateMapping;
  
  try {
    templateBytes = await fs.readFile(templatePath);
    logger.debug('Template PDF loaded', { size: templateBytes.length });
  } catch {
    throw new Error(`Template PDF not found: ${templatePath}`);
  }
  
  try {
    const mappingContent = await fs.readFile(mappingPath, 'utf-8');
    mapping = JSON.parse(mappingContent);
    logger.debug('Template mapping loaded', { fields: Object.keys(mapping.fields).length });
  } catch {
    throw new Error(`Template mapping not found: ${mappingPath}`);
  }

  // Load PDF
  const pdfDoc = await PDFDocument.load(templateBytes);
  const pdfForm = pdfDoc.getForm();

  // Fill fields based on mapping
  let filledCount = 0;
  let errorCount = 0;
  
  for (const [formPath, fieldMapping] of Object.entries(mapping.fields)) {
    const value = getValueAtPath(form, formPath);
    
    try {
      if (fieldMapping.type === 'checkbox') {
        const checkbox = pdfForm.getCheckBox(fieldMapping.pdfField);
        if (value === true) {
          checkbox.check();
        } else {
          checkbox.uncheck();
        }
        filledCount++;
      } else {
        const textField = pdfForm.getTextField(fieldMapping.pdfField);
        const textValue = value === undefined || value === null ? '' : String(value);
        textField.setText(textValue);
        if (textValue) filledCount++;
      }
    } catch (error) {
      // Field might not exist in PDF, log and continue
      errorCount++;
      logger.warn(`Could not fill field ${fieldMapping.pdfField}`, { error });
    }
  }

  logger.info('PDF fields filled', { filled: filledCount, errors: errorCount });

  // NOTE: Intentionally NOT flattening the form to keep it editable
  // Caregivers need to be able to modify fields after export
  // pdfForm.flatten();

  // Save PDF
  const pdfBytes = await pdfDoc.save();
  logger.info('PDF export complete', { size: pdfBytes.length });
  
  return Buffer.from(pdfBytes);
}

/**
 * Get value at path from object
 * e.g., "header.recipientName" -> form.header.recipientName
 */
function getValueAtPath(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  
  return current;
}
