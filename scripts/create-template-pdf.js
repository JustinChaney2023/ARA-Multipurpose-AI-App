/**
 * Create a simple PDF template for testing
 * This generates a basic fillable PDF form
 */

import { PDFDocument, PDFName, PDFString, StandardFonts } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function createTemplate() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // Letter size
  const { width, height } = page.getSize();
  
  const form = pdfDoc.getForm();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  let y = height - 50;
  
  // Title
  page.drawText('MONTHLY CARE COORDINATION MONITORING CONTACT', {
    x: 50,
    y,
    size: 14,
    font: boldFont
  });
  y -= 30;
  
  // Header section
  page.drawText('Header Information', { x: 50, y, size: 12, font: boldFont });
  y -= 25;
  
  const headerFields = [
    { name: 'Recipient Name', field: 'recipientName', x: 50, width: 200 },
    { name: 'Date', field: 'date', x: 270, width: 100 },
    { name: 'Time', field: 'time', x: 390, width: 80 },
  ];
  
  for (const h of headerFields) {
    page.drawText(h.name + ':', { x: h.x, y, size: 10, font });
    const field = form.createTextField(h.field);
    field.addToPage(page, { x: h.x, y: y - 20, width: h.width, height: 18 });
  }
  y -= 45;
  
  const headerFields2 = [
    { name: 'Recipient ID', field: 'recipientId', x: 50, width: 150 },
    { name: 'DOB', field: 'dob', x: 220, width: 100 },
    { name: 'Location', field: 'location', x: 340, width: 150 },
  ];
  
  for (const h of headerFields2) {
    page.drawText(h.name + ':', { x: h.x, y, size: 10, font });
    const field = form.createTextField(h.field);
    field.addToPage(page, { x: h.x, y: y - 20, width: h.width, height: 18 });
  }
  y -= 50;
  
  // Care Coordination Type
  page.drawText('Care Coordination Type:', { x: 50, y, size: 12, font: boldFont });
  y -= 25;
  
  const sihBox = form.createCheckBox('sih');
  sihBox.addToPage(page, { x: 50, y: y - 5, width: 15, height: 15 });
  page.drawText('SIH', { x: 70, y, size: 10, font });
  
  const hcbwBox = form.createCheckBox('hcbw');
  hcbwBox.addToPage(page, { x: 120, y: y - 5, width: 15, height: 15 });
  page.drawText('HCBW', { x: 140, y, size: 10, font });
  y -= 40;
  
  // Narrative sections
  const sections = [
    { title: 'Recipient & Visit Observations', field: 'observations' },
    { title: 'Health/Emotional Status', field: 'healthStatus' },
    { title: 'Review of Services', field: 'servicesReview' },
    { title: 'Progress Toward Goals', field: 'goalsProgress' },
    { title: 'Additional Notes', field: 'additionalNotes' },
    { title: 'Follow-Up Tasks', field: 'followUp' },
  ];
  
  for (const section of sections) {
    if (y < 100) {
      // Add new page if running out of space
      const newPage = pdfDoc.addPage([612, 792]);
      y = newPage.getSize().height - 50;
    }
    
    page.drawText(section.title, { x: 50, y, size: 11, font: boldFont });
    y -= 20;
    
    const textField = form.createTextField(section.field);
    textField.addToPage(page, { x: 50, y: y - 60, width: 512, height: 60 });
    y -= 80;
  }
  
  // Signature section
  if (y < 80) {
    const newPage = pdfDoc.addPage([612, 792]);
    y = newPage.getSize().height - 50;
  }
  
  page.drawText('Signature', { x: 50, y, size: 12, font: boldFont });
  y -= 25;
  
  const sigFields = [
    { name: 'Care Coordinator Name', field: 'coordinatorName', x: 50, width: 200 },
    { name: 'Signature', field: 'signature', x: 270, width: 150 },
    { name: 'Date Signed', field: 'dateSigned', x: 440, width: 100 },
  ];
  
  for (const s of sigFields) {
    page.drawText(s.name + ':', { x: s.x, y, size: 10, font });
    const field = form.createTextField(s.field);
    field.addToPage(page, { x: s.x, y: y - 20, width: s.width, height: 18 });
  }
  
  const pdfBytes = await pdfDoc.save();
  
  const outputPath = path.join(__dirname, '..', 'templates', 'mccmc_v2', 'template.pdf');
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, pdfBytes);
  
  console.log(`Template PDF created: ${outputPath}`);
  console.log(`Size: ${(pdfBytes.length / 1024).toFixed(2)} KB`);
}

createTemplate().catch(console.error);
