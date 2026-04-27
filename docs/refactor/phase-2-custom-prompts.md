# Phase 2 — Custom Prompts (User-Editable)

**Status**: shipped. **Goal**: let the user view, edit, save, and restore the
prompts the app uses (summarization first, then form-fill / chat prompts).

## What shipped

- **Storage**: `prompts` table in SQLite (moved straight to the DB path — Phase
  3's migration runner landed at the same time, so the JSON fallback was
  unnecessary). Columns: `name PK`, `body`, `default_body`, `description`,
  `updated_at`.
- **Defaults catalog**:
  [defaults/prompts.ts](../../services/local-ai/src/defaults/prompts.ts) ships
  `summarizer.main` and `summarizer.system`. Seeded on startup via
  `seedDefaultPrompts()` — missing rows inserted, existing rows keep their
  `body` but get `default_body` / `description` refreshed so the "Factory
  default" preview tracks code changes.
- **Runtime lookup**:
  [promptStore.ts](../../services/local-ai/src/promptStore.ts) exposes
  `getPromptBody(name)` and `render(template, vars)`. Unknown `{{placeholders}}`
  are left intact so typos surface instead of silently substituting empty
  strings.
- **API**: `GET /prompts`, `PUT /prompts/:name`, `POST /prompts/:name/reset`.
- **UI**:
  [SettingsScreen.tsx](../../apps/desktop/src/screens/SettingsScreen.tsx) —
  header button on every non-settings screen, left-rail picker, right-pane
  textarea, Save / Reset, variable chips extracted from the default body,
  collapsible factory-default preview.
- **Wiring**: `summarizer.ts` now reads `getPromptBody('summarizer.system')` and
  `render(getPromptBody('summarizer.main'), { rawText })` so edits take effect
  on the next request without a restart.

## Not-yet-done (deferred to later phases)

- Form-fill prompts (`narrativeQA` questions) aren't in the store yet —
  summarizer-only for now.
- No audit linkage from summary rows to the prompt version that produced them
  (will land when Phase 3 wires up the `summaries.prompt_name` column for real).

## Why

Meeting note: _"custom prompt built into app where user can edit what they
need."_ Prompts are the single biggest knob on LLM output quality. Making them
first-class user-editable data unlocks real customization without code changes
and sets up per-use-case templates later.

## Scope

**In:**

- A Settings / "Prompts" screen listing each prompt the app uses.
- For each prompt: textarea editor, description of where it's used, "Reset to
  default" button.
- Prompts persist across sessions.
- Defaults live in the codebase and seed the store on first run.

**Out:**

- Per-patient prompt overrides (possible later).
- Multi-template prompt libraries (possible later).
- Prompt versioning / diffing.

## Storage

Two paths depending on when Phase 3 lands:

- If **before Phase 3**: prompts in `apps/desktop/src-tauri` app-config file
  (JSON), loaded on startup.
- If **after Phase 3**: a `prompts` table in SQLite with
  `(id, name, body, updated_at, is_default)`. Easier to snapshot, migrate, and
  eventually share across patients.

Recommendation: do it as a JSON file if Phase 3 isn't ready; migrate to the
table during Phase 3. Keep the interface (get/set prompt by name) the same
either way so the UI doesn't care.

## Prompts to make editable (initial set)

| Name                     | Where used today                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `summarizer.main`        | [summarizer.ts](../../services/local-ai/src/summarizer.ts)                                                  |
| `narrativeQA.question.*` | [formQuestions.ts](../../services/local-ai/src/formQuestions.ts) (per-field — maybe group under one editor) |
| `categorizer.main`       | [llmCategorizer.ts](../../services/local-ai/src/llmCategorizer.ts) (dead code — skip until/unless revived)  |

Start with `summarizer.main`. Form-fill prompts can come later.

## API surface

New endpoints on `services/local-ai`:

| Method | Path                   | Purpose                                                        |
| ------ | ---------------------- | -------------------------------------------------------------- |
| GET    | `/prompts`             | List all prompt definitions (name, current body, default body) |
| GET    | `/prompts/:name`       | Fetch single prompt                                            |
| PUT    | `/prompts/:name`       | Update body                                                    |
| POST   | `/prompts/:name/reset` | Revert to default                                              |

Prompt lookups inside the service read from the store, not from hard-coded
strings. A thin `promptStore.ts` module abstracts this.

## UX sketch

- New route: `/settings/prompts`.
- List view: each prompt is a card with name, short description, "Edit" button.
- Edit view: textarea, live preview of the default, Save + Reset + Cancel.
- Variable placeholders (e.g. `{{rawText}}`, `{{patientName}}`) shown as chips
  below the textarea so users know what they can reference.

## Non-goals for Phase 2

- No prompt libraries / import-export (later).
- No per-patient overrides (Phase 4+).
- No fine-grained variable editor — users edit the raw template string with
  known placeholders.

## Open questions

- How do we safely allow placeholder edits without breaking runtime
  substitution? (Probably: template render errors surface back to the user
  instead of failing silently.)
- Should changing a prompt invalidate prior summaries somehow, or are old
  summaries immutable artifacts? (Probably immutable — Phase 3 concern.)
