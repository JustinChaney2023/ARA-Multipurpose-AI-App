# Phase 1 — Summary-Primary Review Surface

**Status**: shipped.
**Goal**: make the summary the default output. Keep the structured form reachable via an explicit button.

## What shipped

- `ImportScreen` drops input into `/summarize` by default and routes to a new `SummaryScreen`.
- "Fill form manually" button on the import screen routes to the existing `ReviewScreen` with an empty form.
- Summarizer prompt restructured to segregate non-clinical chatter into an "Other Conversation" section instead of dropping it.
- Model swapped to `qwen3:4b-q4_K_M` with `think: false` (qwen3 reasoning mode disabled — it burned 30–90s on reasoning tokens that never reach the response field).
- Streaming enabled so the progress bar tracks real tokens (30 → 89% during generation) instead of sitting at 30% for the whole inference.
- Timeout bumped to 300s, `num_predict` to 900 to cover all 8 sections on CPU-only qwen3:4b.

## Known follow-ups

- Automated test for the "non-health content kept in Other Conversation" behavior is still TODO.
- Auto-summarize on paste (vs. explicit submit) deferred — current explicit-submit flow is fine.

## What changes

### Input surface (existing `ImportScreen`)

Stays mostly as-is. Three entry points, all producing plain text:
- Large textarea (paste / type). *Already exists.*
- File upload → OCR. *Already exists.*
- Audio recording → transcript. *Phase 5, stub the UI now if convenient.*

Add one new button: **"Fill form manually"**. Routes to the existing structured Review screen instead of the summary flow. This is for users who prefer to fill the MCCMC form directly inside the app rather than drafting text elsewhere and pasting.

### Output surface (new summary view, or restructured `ReviewScreen`)

The default destination after submitting input. Shows:
- The raw input (collapsible) — so nothing is lost, and sidetracks stay visible.
- The **summary** — primary content, neatly organized. Format TBD (see Open Qs).
- Export/copy actions (plain text / markdown, not PDF).

The current multi-section `ReviewScreen` is retained and reachable only through the "Fill form manually" button.

## What stays alive

| Thing | Kept because |
|-------|--------------|
| `narrativeQA.ts`, `questionAnswerer.ts`, `formQuestions.ts` | Powers the opt-in form-fill path. |
| `/extract/fill`, `/extract/pdf` | Still used by the form-fill path. |
| Form schema (`mccmc_v2`) | The form path still validates against it. |
| PDF export (`pdfGenerator.ts`) | Available when the form path is used. |
| Existing localStorage history | Phase 3 will migrate it to SQLite; don't delete yet. |

## What changes in the backend

- **`/summarize` prompt** (in [summarizer.ts](../../services/local-ai/src/summarizer.ts)) gets two new constraints:
  1. Exclude non-health-related talk from the summary body.
  2. Organize the summary cleanly (format locked once we pick one — see Open Q).
- No endpoint shape changes yet. Prompt-editing UI arrives in Phase 2.

## What's already in place (so we don't rebuild)

| Piece | Location |
|-------|----------|
| Textarea + paste flow | [apps/desktop/src/screens/ImportScreen.tsx:290](../../apps/desktop/src/screens/ImportScreen.tsx#L290) |
| `/summarize` endpoint | [services/local-ai/src/index.ts](../../services/local-ai/src/index.ts) |
| Summarizer logic | [services/local-ai/src/summarizer.ts](../../services/local-ai/src/summarizer.ts) |
| File-upload → OCR → fill pipeline | `/extract/pdf` route |

So Phase 1 is largely **re-wiring existing parts** and adding a new summary view. No heavy new machinery.

## Proposed implementation steps

1. Add a new `SummaryScreen.tsx` (or repurpose the top of `ReviewScreen`) that renders `{rawInput, summary}` side-by-side / stacked.
2. Change the default post-submit destination in `ImportScreen` from `ReviewScreen` to `SummaryScreen`.
3. Add a "Fill form manually" button on `ImportScreen` that routes to `ReviewScreen` with an empty form.
4. Update the `/summarize` prompt for health-only filtering + organized output.
5. Wire auto-summarize on submit (currently user clicks a separate button).
6. Smoke test with realistic caregiver notes (health content + sidetracks).

## Non-goals for Phase 1

- No prompt-editor UI (Phase 2).
- No DB migration (Phase 3).
- No audio input (Phase 5) — but leave room in the input component for it.
- Do **not** delete the form screen, form schema, or narrative Q&A code.

## Open questions (non-blocking, can be answered during implementation)

- **Summary format**: plain prose paragraphs? Markdown bullets under a few fixed headings (e.g. "Observations", "Health", "Follow-ups")? Mirror the old MCCMC section headings? *Leaning toward markdown under fixed headings so it scans fast.*
- **Auto-summarize timing**: run on every input change with debounce, or only on explicit submit? *Leaning toward explicit submit to avoid burning local LLM cycles.*
- **Raw text visibility**: collapsed by default or shown alongside summary? *Leaning collapsed — summary is the headline.*

## Test plan

- Manual: paste caregiver notes with embedded sidetrack talk; verify summary excludes sidetracks and raw text retains them.
- Existing `narrativeQA.test.ts` must still pass (form path is untouched).
- Add a `summarizer.test.ts` case asserting non-health content is dropped from the summary but retrievable from raw input.

## Files likely touched

- `apps/desktop/src/screens/ImportScreen.tsx` — add form-fill button, change default route
- `apps/desktop/src/screens/SummaryScreen.tsx` — **new**
- `apps/desktop/src/App.tsx` — route wiring
- `services/local-ai/src/summarizer.ts` — prompt update
- `services/local-ai/src/__tests__/summarizer.test.ts` — **new**
