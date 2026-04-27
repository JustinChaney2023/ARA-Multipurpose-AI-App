/**
 * Form field definitions as natural language questions
 * This enables a question-answering approach to form filling
 */

export interface FormQuestion {
  fieldPath: string; // Path in the form object (e.g., "header.recipientName")
  pdfField: string; // PDF field name for filling
  question: string; // Natural language question to ask the LLM
  context: string; // Additional context about what to look for
  required: boolean;
  type: 'text' | 'date' | 'time' | 'checkbox' | 'textarea';
}

/**
 * All form questions for the Monthly Care Coordination form
 * Ordered logically for the LLM to process
 */
// NOTE: recipientName, recipientIdentifier, dob, and signature fields are excluded
// from auto-extraction for HIPAA compliance — manual entry only.
export const FORM_QUESTIONS: FormQuestion[] = [
  // Header
  {
    fieldPath: 'header.date',
    pdfField: 'date',
    question: 'What is the date of this visit or contact?',
    context:
      "Look for the visit date. It may be labeled as 'Date:', 'Visit Date:', or mentioned in the opening. Format as MM/DD/YYYY if possible.",
    required: true,
    type: 'date',
  },
  {
    fieldPath: 'header.time',
    pdfField: 'time',
    question: 'What time did the visit or contact occur?',
    context:
      "Look for the time of visit. May be labeled 'Time:', 'At:', or mentioned in context like 'visited at 2pm'. Extract the time as written.",
    required: false,
    type: 'time',
  },
  {
    fieldPath: 'header.location',
    pdfField: 'location',
    question: 'Where did this visit or contact take place?',
    context:
      "Look for the location of the visit. May be labeled 'Location:', 'Where:', or mentioned as 'visited at home', 'office visit', 'phone call', etc.",
    required: false,
    type: 'text',
  },

  // Care Coordination Type (Checkboxes)
  {
    fieldPath: 'careCoordinationType.sih',
    pdfField: 'sih',
    question: 'Is this recipient on SIH (Senior In-Home) services?',
    context:
      'Look for any mention of SIH, Senior In-Home, or in-home services for seniors. Check if [X] is marked next to SIH or if explicitly mentioned.',
    required: false,
    type: 'checkbox',
  },
  {
    fieldPath: 'careCoordinationType.hcbw',
    pdfField: 'hcbw',
    question: 'Is this recipient on HCBW (Home and Community-Based Waiver) services?',
    context:
      'Look for any mention of HCBW, Home and Community-Based Waiver, waiver services. Check if [X] is marked next to HCBW or if explicitly mentioned.',
    required: false,
    type: 'checkbox',
  },

  // Narrative Sections - Simple prompts to avoid LLM confusion
  {
    fieldPath: 'narrative.recipientAndVisitObservations',
    pdfField: 'observations',
    question:
      'Describe the recipient and visit observations in detail based on the transcript. What was the client doing, how did they appear physically and mentally, what was the home environment like, who was present, and were there any concerns?',
    context:
      'Write a detailed paragraph describing what was observed during the visit. Include physical appearance, mental state, activities, home environment, people present, and any concerns. Use information from the transcript.',
    required: false,
    type: 'textarea',
  },
  {
    fieldPath: 'narrative.healthEmotionalStatus',
    pdfField: 'healthStatus',
    question:
      'What is the current health and emotional status based on the transcript? Include any medications, doctor visits, hospitalizations, falls, pain levels, vital signs, behavior changes, and mental health concerns.',
    context:
      'Write a detailed paragraph about health status. Include medical conditions, medications, doctor visits, hospitalizations, falls, vital signs, pain, behavior changes, and emotional state mentioned in the transcript.',
    required: false,
    type: 'textarea',
  },
  {
    fieldPath: 'narrative.reviewOfServices',
    pdfField: 'servicesReview',
    question:
      'What services is the recipient currently receiving based on the transcript? Include personal care, nursing, therapy, equipment, transportation, and how well each service is working.',
    context:
      'Write a detailed paragraph about services being provided. Include personal care, nursing, therapy, equipment, transportation, service effectiveness, and any problems or changes mentioned in the transcript.',
    required: false,
    type: 'textarea',
  },
  {
    fieldPath: 'narrative.progressTowardGoals',
    pdfField: 'goalsProgress',
    question:
      'How is the recipient progressing toward their goals based on the transcript? What are the specific goals, progress level, barriers, and any changes needed?',
    context:
      'Write a detailed paragraph about goals and progress. Include specific goals mentioned, progress made, barriers faced, and any changes needed based on information in the transcript.',
    required: false,
    type: 'textarea',
  },
  {
    fieldPath: 'narrative.additionalNotes',
    pdfField: 'additionalNotes',
    question:
      'Are there any additional notes or important information not covered above based on the transcript? Include family dynamics, social concerns, financial issues, equipment needs, or other relevant details.',
    context:
      'Write a detailed paragraph with any other important information from the transcript. Include family dynamics, social factors, financial concerns, housing issues, equipment needs, or anything else relevant.',
    required: false,
    type: 'textarea',
  },
  {
    fieldPath: 'narrative.followUpTasks',
    pdfField: 'followUp',
    question:
      'What follow-up tasks does the care coordinator need to complete based on the transcript? List specific actions, who to contact, and any deadlines.',
    context:
      'Write a detailed paragraph listing follow-up tasks. Include phone calls to make, appointments to schedule, services to arrange, paperwork to complete, and any deadlines mentioned in the transcript.',
    required: false,
    type: 'textarea',
  },
];

/**
 * Group questions by section for better organization
 */
export const QUESTION_SECTIONS = {
  header: FORM_QUESTIONS.filter(q => q.fieldPath.startsWith('header.')),
  careType: FORM_QUESTIONS.filter(q => q.fieldPath.startsWith('careCoordinationType.')),
  narrative: FORM_QUESTIONS.filter(q => q.fieldPath.startsWith('narrative.')),
  signature: FORM_QUESTIONS.filter(q => q.fieldPath.startsWith('signature.')),
};

/**
 * Get a specific question by field path
 */
export function getQuestionByFieldPath(fieldPath: string): FormQuestion | undefined {
  return FORM_QUESTIONS.find(q => q.fieldPath === fieldPath);
}

/**
 * Get PDF field mapping for form filling
 */
export function getPDFFieldMapping(): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const q of FORM_QUESTIONS) {
    mapping[q.fieldPath] = q.pdfField;
  }
  return mapping;
}
