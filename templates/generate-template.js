/**
 * Generate a fillable PDF template for MCCMC form
 * Uses pdf-lib to create the PDF with form fields
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function createTemplate() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // Letter size
  const form = pdfDoc.getForm();
  
  const { width, height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  let y = height - 50;
  const margin = 50;
  const fieldHeight = 20;
  const checkboxSize = 12;
  
  // Helper to draw label
  function drawLabel(text, x, yPos, isBold = false) {
    page.drawText(text, {
      x,
      y: yPos,
      size: 10,
      font: isBold ? boldFont : font,
      color: rgb(0, 0, 0),
    });
  }
  
  // Helper to create text field
  function createTextField(name, x, yPos, w, multiline = false) {
    const field = form.createTextField(name);
    field.setText('');
    if (multiline) {
      field.enableMultiline();
    }
    // Don't set font size for multiline fields to avoid DA errors
    field.addToPage(page, { x, y: yPos - fieldHeight, width: w, height: multiline ? 60 : fieldHeight });
    return field;
  }
  
  // Helper to create checkbox
  function createCheckbox(name, x, yPos) {
    const checkbox = form.createCheckBox(name);
    checkbox.addToPage(page, { x, y: yPos - checkboxSize, width: checkboxSize, height: checkboxSize });
    return checkbox;
  }
  
  // Title
  drawLabel('MONTHLY CARE COORDINATION MONITORING CONTACT', margin, y, true);
  y -= 30;
  
  // Header Section
  drawLabel('Header Information', margin, y, true);
  y -= 25;
  
  // Row 1: Recipient Name, Date, Time
  drawLabel('Recipient Name:', margin, y);
  createTextField('RecipientName', margin + 100, y, 150);
  
  drawLabel('Date:', margin + 260, y);
  createTextField('Date', margin + 290, y, 80);
  
  drawLabel('Time:', margin + 380, y);
  createTextField('Time', margin + 410, y, 60);
  y -= 35;
  
  // Row 2: Recipient Identifier, DOB, Location
  drawLabel('Recipient ID:', margin, y);
  createTextField('RecipientIdentifier', margin + 100, y, 100);
  
  drawLabel('DOB:', margin + 210, y);
  createTextField('DOB', margin + 240, y, 80);
  
  drawLabel('Location:', margin + 330, y);
  createTextField('Location', margin + 380, y, 120);
  y -= 40;
  
  // Care Coordination Type
  drawLabel('Care Coordination Type:', margin, y, true);
  y -= 20;
  createCheckbox('SIH', margin, y);
  drawLabel('SIH', margin + 20, y);
  createCheckbox('HCBW', margin + 80, y);
  drawLabel('HCBW', margin + 100, y);
  y -= 35;
  
  // Contact Type
  drawLabel('Contact Type:', margin, y, true);
  y -= 20;
  
  createCheckbox('FaceToFaceVisit', margin, y);
  drawLabel('Face to Face Visit with Client', margin + 20, y);
  y -= 20;
  
  createCheckbox('OtherMonitoringContact', margin, y);
  drawLabel('Other Monitoring Contact with Client or Legal Rep', margin + 20, y);
  y -= 20;
  
  createCheckbox('HomeVisit', margin, y);
  drawLabel('Home Visit', margin + 20, y);
  y -= 20;
  
  createCheckbox('ServiceSiteVisit', margin, y);
  drawLabel('Service Site Visit', margin + 20, y);
  y -= 25;
  
  drawLabel('What Service:', margin, y);
  createTextField('WhatService', margin + 90, y, 200);
  y -= 40;
  
  // Narrative Sections
  const sections = [
    { label: 'Recipient & Visit Observations', field: 'RecipientAndVisitObservations' },
    { label: 'Health/Emotional Status, Med Changes, Doctor Visits, etc.', field: 'HealthEmotionalStatus' },
    { label: 'Review of Services', field: 'ReviewOfServices' },
    { label: 'Progress toward Goals', field: 'ProgressTowardGoals' },
    { label: 'Additional Notes', field: 'AdditionalNotes' },
    { label: 'Notes for Reviewer', field: 'NotesForReviewer' },
  ];
  
  for (const section of sections) {
    if (y < 100) {
      // Add new page if running out of space
      const newPage = pdfDoc.addPage([612, 792]);
      y = newPage.getSize().height - 50;
    }
    
    drawLabel(section.label + ':', margin, y, true);
    y -= 20;
    createTextField(section.field, margin, y, width - margin * 2, true);
    y -= 75;
  }
  
  // Save PDF
  const pdfBytes = await pdfDoc.save();
  const outputPath = path.join(__dirname, 'mccmc_v1', 'template.pdf');
  await fs.writeFile(outputPath, pdfBytes);
  
  console.log(`OK Template generated: ${outputPath}`);
}

createTemplate().catch(console.error);
