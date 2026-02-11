import { describe, it, expect, beforeAll } from 'vitest';
import { parseFormFromText } from '../parser.js';
import { checkOllamaHealth } from '../ollama.js';
import { validateForm, type MonthlyCareCoordinationForm } from '@ara/shared';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, '..', '..', 'test-fixtures');

describe('Integration: Full OCR -> Parse Pipeline', () => {
  let ollamaAvailable = false;
  
  beforeAll(async () => {
    ollamaAvailable = await checkOllamaHealth();
    console.log(`Ollama available: ${ollamaAvailable}`);
  });

  describe('Clean Text Input (High OCR Confidence)', () => {
    it('should extract all header fields from typed text', async () => {
      const text = await fs.readFile(path.join(fixturesDir, 'sample-text.txt'), 'utf-8');
      
      const result = await parseFormFromText(text, 95);
      
      // Validate form structure
      expect(() => validateForm(result.form)).not.toThrow();
      
      // Check header extraction
      expect(result.form.header.recipientName).toContain('Johnson');
      expect(result.form.header.date).toMatch(/02\/[0-9]{2}\/2024/);
      expect(result.form.header.location.toLowerCase()).toContain('home');
      
      console.log('Header extraction:', {
        name: result.form.header.recipientName,
        date: result.form.header.date,
        location: result.form.header.location
      });
    });

    it('should extract checkboxes correctly', async () => {
      const text = await fs.readFile(path.join(fixturesDir, 'sample-text.txt'), 'utf-8');
      
      const result = await parseFormFromText(text, 95);
      
      // Check checkboxes - SIH should be checked, HCBW not
      expect(result.form.careCoordinationType.sih).toBe(true);
      expect(result.form.careCoordinationType.hcbw).toBe(false);
    });

    it('should extract narrative sections', async () => {
      const text = await fs.readFile(path.join(fixturesDir, 'sample-text.txt'), 'utf-8');
      
      const result = await parseFormFromText(text, 95);
      
      // Check narratives have content
      expect(result.form.narrative.recipientAndVisitObservations.length).toBeGreaterThan(10);
      expect(result.form.narrative.healthEmotionalStatus.length).toBeGreaterThan(10);
      expect(result.form.narrative.reviewOfServices.length).toBeGreaterThan(10);
      expect(result.form.narrative.progressTowardGoals.length).toBeGreaterThan(10);
      
      // Health section should mention BP/blood pressure
      expect(result.form.narrative.healthEmotionalStatus.toLowerCase()).toMatch(/bp|blood pressure/);
    });

    it('should have validation notes for low confidence', async () => {
      const text = await fs.readFile(path.join(fixturesDir, 'sample-handwritten.txt'), 'utf-8');
      
      // Low confidence like bad OCR
      const result = await parseFormFromText(text, 35);
      
      // Should still produce valid form
      expect(() => validateForm(result.form)).not.toThrow();
      
      // Should have notes in additionalNotes about OCR mode
      expect(result.form.narrative.additionalNotes.length).toBeGreaterThan(0);
      
      // If OCR is poor, should mark low confidence fields
      const lowConfidenceFields = result.confidence.filter(c => c.confidence === 'low');
      expect(lowConfidenceFields.length).toBeGreaterThan(0);
    });
  });

  describe('LLM Enhancement (if available)', () => {
    it.skipIf(!ollamaAvailable)('should use LLM to categorize messy text', async () => {
      const messyText = `
        Client Name: Sarah Wilson DOB 5/20/1948
        Saw her today at her house around 3pm
        She's on SIH program
        
        Notes:
        She seemed tired today. Mentioned her blood pressure has been high.
        Her daughter visited over the weekend. She's been taking her meds.
        No falls. No ER visits. Doctor appointment next week.
        
        Services going well. Aide is helping a lot. Wants to keep same schedule.
        
        Goals:
        1. Stay independent - doing well
        2. Keep taking meds - doing well  
        3. Walk every day - needs improvement
      `;
      
      const result = await parseFormFromText(messyText, 45);
      
      // LLM should have categorized the messy text
      expect(result.extractionMethod).toBe('llm-structured');
      
      // Should extract structured data from messy text
      expect(result.form.header.recipientName).toContain('Wilson');
      expect(result.form.careCoordinationType.sih).toBe(true);
      
      // Health section should capture BP mention
      expect(result.form.narrative.healthEmotionalStatus.toLowerCase()).toContain('blood pressure');
    });

    it.skipIf(!ollamaAvailable)('should validate and correct dates', async () => {
      const textWithBadDate = `
        Name: Test Patient
        Date: 13/45/2024 (invalid)
        DOB: 99/99/1950 (invalid)
      `;
      
      const result = await parseFormFromText(textWithBadDate, 60);
      
      // Should flag invalid dates in additionalNotes
      if (result.extractionMethod === 'llm-structured' || result.extractionMethod === 'llm-categorized') {
        expect(result.form.narrative.additionalNotes.toLowerCase()).toMatch(/date|invalid|validation/);
      }
    });
  });

  describe('End-to-End Validation', () => {
    it('should produce valid form that can be exported', async () => {
      const text = await fs.readFile(path.join(fixturesDir, 'sample-text.txt'), 'utf-8');
      
      const result = await parseFormFromText(text, 95);
      
      // Full validation
      const validated = validateForm(result.form);
      
      // Required fields should exist
      expect(validated.header).toBeDefined();
      expect(validated.careCoordinationType).toBeDefined();
      expect(validated.narrative).toBeDefined();
      expect(validated.signature).toBeDefined();
      
      // All confidence entries should be valid
      result.confidence.forEach(c => {
        expect(['high', 'medium', 'low']).toContain(c.confidence);
        expect(c.field).toBeDefined();
      });
      
      console.log('Full extraction result:', {
        method: result.extractionMethod,
        header: validated.header,
        checkboxes: {
          sih: validated.careCoordinationType.sih,
          hcbw: validated.careCoordinationType.hcbw,
        }
      });
    });
  });
});

describe('Workflow Scenarios', () => {
  it('should handle empty/minimal input gracefully', async () => {
    const minimalText = 'Name: Unknown Date: today';
    
    const result = await parseFormFromText(minimalText, 20);
    
    // Should still produce valid form with defaults
    expect(() => validateForm(result.form)).not.toThrow();
    
    // Most fields should be empty but present
    expect(result.form.header.recipientName).toBe('');
    expect(result.form.narrative.recipientAndVisitObservations).toBe('');
  });

  it('should handle very long narrative text', async () => {
    const longText = `
      Name: Long Test
      
      Observations:
      ${'This is a very long observation. '.repeat(100)}
      
      Health:
      ${'Health status details. '.repeat(100)}
    `;
    
      const result = await parseFormFromText(longText, 80);
    
    expect(() => validateForm(result.form)).not.toThrow();
    expect(result.form.narrative.recipientAndVisitObservations.length).toBeGreaterThan(100);
  });
});
