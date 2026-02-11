import { describe, it, expect } from 'vitest';
import {
  createEmptyForm,
  validateForm,
  safeValidateForm,
  FORM_FIELDS,
  MonthlyCareCoordinationFormSchema,
  type MonthlyCareCoordinationForm,
} from '../schema/mccmc_v1.js';

describe('MCCMC Form Schema', () => {
  describe('createEmptyForm', () => {
    it('should create a form with all fields as empty/false defaults', () => {
      const form = createEmptyForm();
      
      // Header should be empty strings
      expect(form.header.recipientName).toBe('');
      expect(form.header.date).toBe('');
      expect(form.header.time).toBe('');
      expect(form.header.recipientIdentifier).toBe('');
      expect(form.header.dob).toBe('');
      expect(form.header.location).toBe('');
      
      // Checkboxes should be false
      expect(form.careCoordinationType.sih).toBe(false);
      expect(form.careCoordinationType.hcbw).toBe(false);
      expect(form.contactType.faceToFaceVisit).toBe(false);
      expect(form.contactType.otherMonitoringContact).toBe(false);
      expect(form.contactType.homeVisit).toBe(false);
      expect(form.contactType.serviceSiteVisit).toBe(false);
      
      // Narrative should be empty strings
      expect(form.narrative.recipientAndVisitObservations).toBe('');
      expect(form.narrative.healthEmotionalStatus).toBe('');
      expect(form.narrative.reviewOfServices).toBe('');
      expect(form.narrative.progressTowardGoals).toBe('');
      expect(form.narrative.additionalNotes).toBe('');
      
      // Notes for reviewer should be empty
      expect(form.notesForReviewer).toBe('');
    });

    it('should produce a valid form that passes validation', () => {
      const form = createEmptyForm();
      expect(() => validateForm(form)).not.toThrow();
    });
  });

  describe('validateForm', () => {
    it('should accept a complete valid form', () => {
      const validForm: MonthlyCareCoordinationForm = {
        header: {
          recipientName: 'John Doe',
          date: '02/10/2026',
          time: '10:30 AM',
          recipientIdentifier: 'ARA-12345',
          dob: '01/15/1950',
          location: 'Client Home',
        },
        careCoordinationType: {
          sih: false,
          hcbw: true,
        },
        contactType: {
          faceToFaceVisit: true,
          otherMonitoringContact: false,
          homeVisit: true,
          serviceSiteVisit: false,
          whatService: 'Personal Care',
        },
        narrative: {
          recipientAndVisitObservations: 'Client appeared well',
          healthEmotionalStatus: 'No changes',
          reviewOfServices: 'Services ongoing',
          progressTowardGoals: 'Making progress',
          additionalNotes: 'None',
        },
        notesForReviewer: 'Please verify date',
      };

      const result = validateForm(validForm);
      expect(result).toEqual(validForm);
    });

    it('should reject invalid types', () => {
      const invalidForm = {
        header: {
          recipientName: 123, // Should be string
          date: '02/10/2026',
          time: '10:30 AM',
          recipientIdentifier: '',
          dob: '',
          location: '',
        },
        careCoordinationType: {
          sih: 'yes', // Should be boolean
          hcbw: false,
        },
        contactType: {
          faceToFaceVisit: true,
          otherMonitoringContact: false,
          homeVisit: true,
          serviceSiteVisit: false,
          whatService: '',
        },
        narrative: {
          recipientAndVisitObservations: '',
          healthEmotionalStatus: '',
          reviewOfServices: '',
          progressTowardGoals: '',
          additionalNotes: '',
        },
        notesForReviewer: '',
      };

      expect(() => validateForm(invalidForm)).toThrow();
    });

    it('should require all required sections', () => {
      const incompleteForm = {
        header: {
          recipientName: 'Test',
          date: '02/10/2026',
        },
        // Missing careCoordinationType, contactType, narrative
      };

      // Should throw because nested objects are required
      expect(() => validateForm(incompleteForm)).toThrow();
    });
  });

  describe('safeValidateForm', () => {
    it('should return success for valid form', () => {
      const form = createEmptyForm();
      const result = safeValidateForm(form);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(form);
      }
    });

    it('should return error for invalid form', () => {
      const invalidForm = { invalid: 'data' };
      const result = safeValidateForm(invalidForm);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });
  });

  describe('JSON round-trip', () => {
    it('should survive JSON serialization and deserialization', () => {
      const form = createEmptyForm();
      form.header.recipientName = 'Test Name';
      form.careCoordinationType.sih = true;
      form.narrative.recipientAndVisitObservations = 'Test observations';

      const json = JSON.stringify(form);
      const parsed = JSON.parse(json);
      
      const validated = validateForm(parsed);
      expect(validated.header.recipientName).toBe('Test Name');
      expect(validated.careCoordinationType.sih).toBe(true);
      expect(validated.narrative.recipientAndVisitObservations).toBe('Test observations');
    });

    it('should handle special characters in text fields', () => {
      const form = createEmptyForm();
      form.narrative.recipientAndVisitObservations = 'Special chars: "quotes", \n newlines, emojis 🎉';

      const json = JSON.stringify(form);
      const parsed = JSON.parse(json);
      
      const validated = validateForm(parsed);
      expect(validated.narrative.recipientAndVisitObservations).toBe('Special chars: "quotes", \n newlines, emojis 🎉');
    });
  });

  describe('FORM_FIELDS metadata', () => {
    it('should have metadata for all form fields', () => {
      // Should have fields from all sections
      const headerFields = FORM_FIELDS.filter(f => f.section === 'Header');
      const narrativeFields = FORM_FIELDS.filter(f => f.section === 'Narrative');
      
      expect(headerFields.length).toBeGreaterThan(0);
      expect(narrativeFields.length).toBeGreaterThan(0);
      
      // All fields should have required properties
      for (const field of FORM_FIELDS) {
        expect(field.path).toBeDefined();
        expect(field.label).toBeDefined();
        expect(field.type).toBeDefined();
        expect(field.section).toBeDefined();
      }
    });

    it('should have the correct number of fields', () => {
      expect(FORM_FIELDS.length).toBe(19); // 6 header + 2 care coord + 5 contact + 5 narrative + 1 reviewer
    });
  });
});
