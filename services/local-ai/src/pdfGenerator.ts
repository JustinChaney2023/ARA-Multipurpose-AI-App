/**
 * Professional PDF Form Generator with Fillable Fields
 * Creates a clean, styled worksheet with editable form fields
 */

import type { MonthlyCareCoordinationForm } from '@ara/shared';
import { PDFDocument, PDFPage, rgb, StandardFonts } from 'pdf-lib';

/**
 * Generate a professional PDF form with fillable fields
 */
export async function generateProfessionalPDF(form: MonthlyCareCoordinationForm): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // Letter size

  const { width: _width, height } = page.getSize();
  const margin = 50;
  let y = height - margin;

  // Load fonts
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Title
  page.drawText('MONTHLY CARE COORDINATION', {
    x: margin,
    y,
    size: 16,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.1),
  });
  y -= 24;

  page.drawText('MONITORING CONTACT', {
    x: margin,
    y,
    size: 14,
    font: regularFont,
    color: rgb(0.3, 0.3, 0.3),
  });
  y -= 35;

  // Create the form
  const pdfForm = pdfDoc.getForm();

  // Header Section with fillable fields
  y = drawHeaderSection(page, pdfForm, form, margin, y, boldFont, regularFont);
  y -= 25;

  // Care Coordination Type
  y = drawCareTypeSection(page, pdfForm, form, margin, y, boldFont, regularFont);
  y -= 25;

  // Narrative Sections with fillable text areas
  y = drawNarrativeSection(
    page,
    pdfForm,
    'Recipient & Visit Observations',
    'observations',
    form.narrative.recipientAndVisitObservations,
    margin,
    y,
    boldFont
  );
  y -= 20;

  y = drawNarrativeSection(
    page,
    pdfForm,
    'Health/Emotional Status',
    'healthStatus',
    form.narrative.healthEmotionalStatus,
    margin,
    y,
    boldFont
  );
  y -= 20;

  y = drawNarrativeSection(
    page,
    pdfForm,
    'Review of Services',
    'servicesReview',
    form.narrative.reviewOfServices,
    margin,
    y,
    boldFont
  );
  y -= 20;

  y = drawNarrativeSection(
    page,
    pdfForm,
    'Progress Toward Goals',
    'goalsProgress',
    form.narrative.progressTowardGoals,
    margin,
    y,
    boldFont
  );
  y -= 20;

  y = drawNarrativeSection(
    page,
    pdfForm,
    'Care Coordinator Follow Up Tasks',
    'followUp',
    form.narrative.followUpTasks,
    margin,
    y,
    boldFont
  );
  y -= 20;

  y = drawNarrativeSection(
    page,
    pdfForm,
    'Additional Notes',
    'additionalNotes',
    form.narrative.additionalNotes,
    margin,
    y,
    boldFont
  );
  y -= 25;

  // Signature Section
  drawSignatureSection(page, pdfForm, form, margin, y, boldFont);

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

function drawHeaderSection(
  page: PDFPage,
  pdfForm: any,
  form: MonthlyCareCoordinationForm,
  margin: number,
  y: number,
  boldFont: any,
  _regularFont: any
): number {
  const rowHeight = 28;
  const labelWidth = 130;
  const boxHeight = 20;

  // Row 1: Recipient Name, Date, Time
  page.drawText('Recipient Name:', { x: margin, y: y - 3, size: 9, font: boldFont });
  const nameField = pdfForm.createTextField('recipientName');
  nameField.addToPage(page, {
    x: margin + labelWidth,
    y: y - 5,
    width: 130,
    height: boxHeight,
    borderColor: rgb(0.6, 0.6, 0.6),
    backgroundColor: rgb(0.97, 0.97, 0.97),
  });
  nameField.setText(form.header.recipientName || '');
  nameField.setFontSize(9);

  page.drawText('Date:', { x: margin + 280, y: y - 3, size: 9, font: boldFont });
  const dateField = pdfForm.createTextField('date');
  dateField.addToPage(page, {
    x: margin + 320,
    y: y - 5,
    width: 70,
    height: boxHeight,
    borderColor: rgb(0.6, 0.6, 0.6),
    backgroundColor: rgb(0.97, 0.97, 0.97),
  });
  dateField.setText(form.header.date || '');
  dateField.setFontSize(9);

  page.drawText('Time:', { x: margin + 410, y: y - 3, size: 9, font: boldFont });
  const timeField = pdfForm.createTextField('time');
  timeField.addToPage(page, {
    x: margin + 450,
    y: y - 5,
    width: 60,
    height: boxHeight,
    borderColor: rgb(0.6, 0.6, 0.6),
    backgroundColor: rgb(0.97, 0.97, 0.97),
  });
  timeField.setText(form.header.time || '');
  timeField.setFontSize(9);
  y -= rowHeight;

  // Row 2: ID, DOB, Location
  page.drawText('Recipient ID:', { x: margin, y: y - 3, size: 9, font: boldFont });
  const idField = pdfForm.createTextField('recipientId');
  idField.addToPage(page, {
    x: margin + labelWidth,
    y: y - 5,
    width: 100,
    height: boxHeight,
    borderColor: rgb(0.6, 0.6, 0.6),
    backgroundColor: rgb(0.97, 0.97, 0.97),
  });
  idField.setText(form.header.recipientIdentifier || '');
  idField.setFontSize(9);

  page.drawText('DOB:', { x: margin + 250, y: y - 3, size: 9, font: boldFont });
  const dobField = pdfForm.createTextField('dob');
  dobField.addToPage(page, {
    x: margin + 290,
    y: y - 5,
    width: 80,
    height: boxHeight,
    borderColor: rgb(0.6, 0.6, 0.6),
    backgroundColor: rgb(0.97, 0.97, 0.97),
  });
  dobField.setText(form.header.dob || '');
  dobField.setFontSize(9);

  page.drawText('Location:', { x: margin + 390, y: y - 3, size: 9, font: boldFont });
  const locField = pdfForm.createTextField('location');
  locField.addToPage(page, {
    x: margin + 450,
    y: y - 5,
    width: 110,
    height: boxHeight,
    borderColor: rgb(0.6, 0.6, 0.6),
    backgroundColor: rgb(0.97, 0.97, 0.97),
  });
  locField.setText(form.header.location || '');
  locField.setFontSize(9);

  return y - rowHeight;
}

function drawCareTypeSection(
  page: PDFPage,
  pdfForm: any,
  form: MonthlyCareCoordinationForm,
  margin: number,
  y: number,
  boldFont: any,
  regularFont: any
): number {
  page.drawText('Care Coordination Type:', { x: margin, y, size: 10, font: boldFont });
  y -= 22;

  // SIH Checkbox
  const sihCheck = pdfForm.createCheckBox('sih');
  sihCheck.addToPage(page, {
    x: margin,
    y: y - 2,
    width: 14,
    height: 14,
    borderColor: rgb(0.3, 0.3, 0.3),
  });
  if (form.careCoordinationType.sih) {
    sihCheck.check();
  }
  page.drawText('SIH (Senior In-Home)', { x: margin + 20, y: y - 2, size: 9, font: regularFont });

  // HCBW Checkbox
  const hcbwCheck = pdfForm.createCheckBox('hcbw');
  hcbwCheck.addToPage(page, {
    x: margin + 180,
    y: y - 2,
    width: 14,
    height: 14,
    borderColor: rgb(0.3, 0.3, 0.3),
  });
  if (form.careCoordinationType.hcbw) {
    hcbwCheck.check();
  }
  page.drawText('HCBW (Home and Community-Based Waiver)', {
    x: margin + 200,
    y: y - 2,
    size: 9,
    font: regularFont,
  });

  return y - 22;
}

function drawNarrativeSection(
  page: PDFPage,
  pdfForm: any,
  title: string,
  fieldName: string,
  content: string,
  margin: number,
  y: number,
  boldFont: any
): number {
  const boxWidth = 512;
  const boxHeight = 70;

  // Title
  page.drawText(title, { x: margin, y, size: 10, font: boldFont });
  y -= 18;

  // Create text area (multiline text field)
  const textField = pdfForm.createTextField(fieldName);
  textField.addToPage(page, {
    x: margin,
    y: y - boxHeight,
    width: boxWidth,
    height: boxHeight,
    borderColor: rgb(0.6, 0.6, 0.6),
    backgroundColor: rgb(0.97, 0.97, 0.97),
    // Note: multiline is set via the field flags, not addToPage options
  });
  textField.setText(content || 'No information found.');
  textField.setFontSize(9);
  // Enable multiline by setting the appropriate field flag
  textField.enableMultiline();

  return y - boxHeight - 5;
}

function drawSignatureSection(
  page: PDFPage,
  pdfForm: any,
  form: MonthlyCareCoordinationForm,
  margin: number,
  y: number,
  boldFont: any
): number {
  const boxHeight = 20;

  page.drawText('Care Coordinator Name:', { x: margin, y: y - 3, size: 9, font: boldFont });
  const coordField = pdfForm.createTextField('coordinatorName');
  coordField.addToPage(page, {
    x: margin + 140,
    y: y - 5,
    width: 180,
    height: boxHeight,
    borderColor: rgb(0.6, 0.6, 0.6),
    backgroundColor: rgb(0.97, 0.97, 0.97),
  });
  coordField.setText(form.signature.careCoordinatorName || '');
  coordField.setFontSize(9);

  page.drawText('Date Signed:', { x: margin + 340, y: y - 3, size: 9, font: boldFont });
  const dateField = pdfForm.createTextField('dateSigned');
  dateField.addToPage(page, {
    x: margin + 420,
    y: y - 5,
    width: 80,
    height: boxHeight,
    borderColor: rgb(0.6, 0.6, 0.6),
    backgroundColor: rgb(0.97, 0.97, 0.97),
  });
  dateField.setText(form.signature.dateSigned || '');
  dateField.setFontSize(9);
  y -= 30;

  page.drawText('Signature:', { x: margin, y: y - 3, size: 9, font: boldFont });
  const sigField = pdfForm.createTextField('signature');
  sigField.addToPage(page, {
    x: margin + 60,
    y: y - 5,
    width: 300,
    height: boxHeight,
    borderColor: rgb(0.6, 0.6, 0.6),
    backgroundColor: rgb(0.97, 0.97, 0.97),
  });
  sigField.setText(form.signature.signature || '');
  sigField.setFontSize(9);

  return y - 30;
}
