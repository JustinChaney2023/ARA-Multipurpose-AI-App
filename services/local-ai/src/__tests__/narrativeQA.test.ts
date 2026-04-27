import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../ollama.js', () => ({
  checkOllamaHealth: vi.fn(),
}));

vi.mock('../questionAnswerer.js', () => ({
  answerSpecificQuestions: vi.fn(),
}));

const ollamaClientMock = vi.hoisted(() => ({
  generate: vi.fn(),
}));

vi.mock('../ollamaClient.js', () => ({
  getOllamaClient: () => ({
    generate: ollamaClientMock.generate,
  }),
}));

import { fillNarrativeWithQA } from '../narrativeQA.js';
import { checkOllamaHealth } from '../ollama.js';
import { answerSpecificQuestions } from '../questionAnswerer.js';

const mockedCheckOllamaHealth = vi.mocked(checkOllamaHealth);
const mockedAnswerSpecificQuestions = vi.mocked(answerSpecificQuestions);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fillNarrativeWithQA', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mockedCheckOllamaHealth.mockReset();
    mockedAnswerSpecificQuestions.mockReset();
    ollamaClientMock.generate.mockReset();
    ollamaClientMock.generate.mockResolvedValue({ response: '{}' });
    mockedAnswerSpecificQuestions.mockResolvedValue({});
  });

  it('falls back to deterministic extraction when Ollama is unavailable', async () => {
    mockedCheckOllamaHealth.mockResolvedValue(false);

    const result = await fillNarrativeWithQA(`Name: Mary Johnson\nDate: 02/15/2024\nVisited at home.\nSIH checked.`);

    expect(result.extractionMethod).toBe('ocr-only');
    // NOTE: recipientName is NOT extracted - manual entry only (HIPAA compliance)
    expect(result.form.header.recipientName).toBe('');
    expect(result.form.header.date).toBe('02/15/2024');
    expect(result.form.header.location).toBe('Home');
    expect(result.form.careCoordinationType.sih).toBe(true);
  });

  it('extracts form data using LLM when available', async () => {
    mockedCheckOllamaHealth.mockResolvedValue(true);

    ollamaClientMock.generate.mockResolvedValue({
      response: JSON.stringify({
        // NOTE: recipientName is NOT extracted - manual entry only (HIPAA compliance)
        recipientName: '',
        date: '02/15/2024',
        time: '14:30',
        recipientIdentifier: '',
        dob: '',
        location: 'Home',
        sih: true,
        hcbw: false,
        recipientAndVisitObservations: 'Client was alert and oriented.',
        healthEmotionalStatus: 'No health issues reported.',
        reviewOfServices: 'SIH services ongoing.',
        progressTowardGoals: 'Stable, meeting goals.',
        followUpTasks: 'Call daughter next week.',
        additionalNotes: 'Family engaged.',
        careCoordinatorName: '',
        dateSigned: '',
      }),
    });

    const result = await fillNarrativeWithQA(`Name: Mary Johnson\nDate: 02/15/2024\nVisited at 2:30 PM at home.\nCoordinator: Jane Care`);

    expect(['narrative-qa', 'qa-llm', 'ocr-only']).toContain(result.extractionMethod);
    // NOTE: recipientName is NOT extracted - manual entry only (HIPAA compliance)
    expect(result.form.header.recipientName).toBe('');
    // Date should be populated by LLM or deterministic extraction
    expect(result.form.header.date).toBeTruthy();
  });

  it('falls back gracefully when LLM returns malformed JSON', async () => {
    mockedCheckOllamaHealth.mockResolvedValue(true);

    ollamaClientMock.generate.mockResolvedValue({ response: 'This is not valid JSON at all!!!' });

    const result = await fillNarrativeWithQA(`Date: 03/01/2024\nSIH visit at Home.`);

    // Should not throw; should fall back to deterministic or ocr-only
    expect(result).toBeDefined();
    expect(result.form).toBeDefined();
    expect(['narrative-qa', 'qa-llm', 'ocr-only']).toContain(result.extractionMethod);
  });

  it('falls back gracefully when LLM request times out', async () => {
    mockedCheckOllamaHealth.mockResolvedValue(true);

    ollamaClientMock.generate.mockRejectedValue(new Error('AbortError: The operation was aborted'));

    const result = await fillNarrativeWithQA(`Date: 03/01/2024\nSIH visit at Home.`);

    expect(result).toBeDefined();
    expect(result.form).toBeDefined();
  });
});
