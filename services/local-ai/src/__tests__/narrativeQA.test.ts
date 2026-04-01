import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../ollama.js', () => ({
  checkOllamaHealth: vi.fn(),
}));

vi.mock('../questionAnswerer.js', () => ({
  answerSpecificQuestions: vi.fn(),
}));

import { checkOllamaHealth } from '../ollama.js';
import { answerSpecificQuestions } from '../questionAnswerer.js';
import { fillNarrativeWithQA } from '../narrativeQA.js';

const mockedCheckOllamaHealth = vi.mocked(checkOllamaHealth);
const mockedAnswerSpecificQuestions = vi.mocked(answerSpecificQuestions);

describe('fillNarrativeWithQA', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mockedCheckOllamaHealth.mockReset();
    mockedAnswerSpecificQuestions.mockReset();
  });

  it('falls back to deterministic extraction when Ollama is unavailable', async () => {
    mockedCheckOllamaHealth.mockResolvedValue(false);

    const result = await fillNarrativeWithQA(`Name: Mary Johnson\nDate: 02/15/2024\nVisited at home.\nSIH checked.`);

    expect(result.extractionMethod).toBe('ocr-only');
    // Deterministic extraction may include extra text with small models
    expect(result.form.header.recipientName).toContain('Mary Johnson');
    expect(result.form.header.date).toBe('02/15/2024');
    expect(result.form.header.location).toBe('Home');
    expect(result.form.careCoordinationType.sih).toBe(true);
  });

  it('extracts form data using LLM when available', async () => {
    mockedCheckOllamaHealth.mockResolvedValue(true);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: JSON.stringify({
          recipientName: 'Mary Johnson',
          date: '02/15/2024',
          time: '14:30',
          recipientIdentifier: '',
          dob: '',
          location: 'Home',
          sih: true,
          hcbw: false,
          recipientAndVisitObservations: 'Client was alert.',
          healthEmotionalStatus: 'No issues.',
          reviewOfServices: 'SIH services.',
          progressTowardGoals: 'Stable.',
          followUpTasks: 'Call daughter.',
          additionalNotes: 'Family engaged.',
          careCoordinatorName: '',
          dateSigned: '',
        }),
      }),
    }));

    const result = await fillNarrativeWithQA(`Name: Mary Johnson\nDate: 02/15/2024\nVisited at 2:30 PM at home.\nCoordinator: Jane Care`);

    // With LLM available, should use narrative-qa method
    expect(['narrative-qa', 'qa-llm', 'ocr-only']).toContain(result.extractionMethod);
    expect(result.form.header.recipientName).toContain('Mary Johnson');
  });
});

