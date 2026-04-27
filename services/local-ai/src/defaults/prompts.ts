/**
 * Default prompt bodies.
 *
 * These seed the `prompts` table on first run and are the target of the
 * "Reset to default" button. When we update a default in code, a future
 * migration may refresh `default_body` in-place — but we never silently
 * overwrite a user's customized `body`.
 *
 * Template variables (substituted at render time by promptStore):
 * - {{rawText}}  — the cleaned caregiver note input
 */

export interface PromptDefault {
  name: string;
  description: string;
  body: string;
}

/**
 * System instructions for the summarizer.
 *
 * Single narrative paragraph output. Non-clinical chatter is preserved only in
 * raw text and should be excluded from the summary body unless it directly
 * affects care, safety, mood, or care coordination.
 */
const SUMMARIZER_SYSTEM_DEFAULT = [
  "You summarize caregiver visit notes for Alzheimer's Resource Alaska care coordinators.",
  '',
  '{{context}}',
  'Your output is a single professional narrative paragraph (or a few short paragraphs) written in flowing prose — the way a care coordinator documents a visit.',
  '',
  'Rules:',
  '- State only facts present in the notes. Do not infer, add outside context, or invent details.',
  '- Do not add evaluative filler (no "the visit went well", no "overall positive", no summarizing opinions).',
  '- Preserve the original tense and intent. A task to "schedule X by Friday" is a pending action, not a completed one.',
  '- Exclude non-clinical conversation (weather, family stories, hobbies, pets, social small talk) unless it directly affects care, safety, mood, or care coordination.',
  '- Output plain paragraphs only. No bold headings, no numbered lists, no bullet points, no section titles.',
  '- No preamble, no closing remarks, no meta commentary.',
].join('\n');

/**
 * User prompt template. {{rawText}} is replaced with the cleaned input.
 *
 * The section structure is locked here rather than in the system prompt so
 * users can reorganize sections (e.g. move Concerns to the top) without
 * touching the system rules.
 */
const SUMMARIZER_MAIN_DEFAULT = [
  '{{context}}Summarize the caregiver notes below into a clean, professional narrative paragraph (or a few short paragraphs). Do NOT use section headings or bullet lists.',
  '',
  'Write it as a care coordinator would document a visit: flowing prose that naturally touches on the relevant topics from the notes. When applicable, include:',
  '- Service type (e.g., face-to-face, phone) and duration',
  '- Setting and who was present (client, staff, family)',
  '- Client presentation (mood, grooming, dress, behavior)',
  '- Activities, plans, or schedule discussed',
  '- Health status, sleep, medications, or recent adjustments',
  '- Services received (residential, day hab, supported employment, etc.)',
  '- Progress at home, work, or in the community',
  '- Interpersonal dynamics or challenges',
  '- Staff or provider input / corroboration',
  '- Follow-up actions, coordination, or how the visit concluded',
  '',
  'Rules:',
  '- Use plain paragraphs only. No bold headings, no numbered lists, no bullet points.',
  '- Preserve specific details (medication names, dates, task assignments, names) in the prose.',
  '- If there is no relevant content for a topic, simply omit it rather than writing "None noted."',
  '- Exclude non-clinical conversation unless it directly affects care, safety, mood, or care coordination.',
  '',
  'Notes:',
  '"""',
  '{{rawText}}',
  '"""',
].join('\n');

/**
 * Initial catalog. Phase 2 ships with just the two summarizer prompts so the
 * UI has something meaningful to edit. narrativeQA / form-fill prompts will
 * be added in a later increment when the opt-in form path gets its own
 * editable surface.
 */
export const DEFAULT_PROMPTS: PromptDefault[] = [
  {
    name: 'summarizer.system',
    description:
      'Rules and persona the model is given before the user prompt. Controls tense preservation, fact-only constraint, and paragraph-only output.',
    body: SUMMARIZER_SYSTEM_DEFAULT,
  },
  {
    name: 'summarizer.main',
    description:
      'The user-facing summarizer template. Defines the narrative topics to cover and the paragraph-only format. Use {{rawText}} to mark where the caregiver notes should be inserted.',
    body: SUMMARIZER_MAIN_DEFAULT,
  },
];
