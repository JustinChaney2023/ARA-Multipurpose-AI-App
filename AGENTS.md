# AGENTS.md — Alzheimer’s Resource Alaska Caregiver Assistant (Local-first)

## Mission
Build a desktop app to reduce caregiver workload at Alzheimer’s Resource Alaska by converting caregiver notes
(handwritten PDFs/images, audio, typed text) into:
1) a concise summary, and
2) a structured, auto-filled “Monthly Care Coordination Monitoring Contact” form.

Default must be local-first and HIPAA-aware.

---

## MVP priority (must work first)
### MVP-0 (ASAP / “tomorrow”)
Input: PDF (scanned form with handwriting)
Output: a clean, **fillable PDF** version of the same form.

MVP-0 acceptance criteria:
- User selects an input PDF.
- App extracts OCR text from the PDF.
- App proposes values for:
  - narrative sections (Observations / Health / Review of Services / Progress toward Goals / Additional Notes) as text blocks, and
  - header + checkbox fields when possible.
- Caregiver **always** reviews/edits fields before export (no “auto-submit” mode).
- Export produces a **fillable PDF** with typed values in fields.
- Local-only by default; no cloud calls unless explicitly enabled.

---

## Primary users
Caregivers on Windows + macOS laptops (small user base).

---

## Core workflow (happy path)
1) Import: PDF/image/audio/text.
2) Extract text:
   - PDF/image → OCR (handwriting-aware when possible)
   - audio → speech-to-text (future)
3) Normalize into structured fields (form schema).
4) Produce:
   - summary
   - form filled (fillable PDF)
5) Caregiver reviews/edits and exports/saves.

---

## UX requirements (MVP)
- Two screens are sufficient:
  1) Import PDF
  2) Review Fields + Export
- **Confidence highlighting** is required:
  - low-confidence fields must be visually flagged for review.

Optional (post-MVP):
- Field-level provenance: show OCR source snippet/region per field.

---

## Form (current target template)
“Monthly Care Coordination Monitoring Contact” form.

Header fields:
- Recipient Name
- Date
- Time
- Recipient Identifier
- DOB
- Location

Care Coordination Type:
- SIH (checkbox)
- HCBW (checkbox)

Contact Type:
- Face to Face Visit with Client (checkbox)
- Other Monitoring Contact with Client or Legal Rep (checkbox)
- Home Visit (checkbox)
- Service Site Visit (checkbox)
- What Service (text)

Narrative sections:
- Recipient & Visit Observations
- Health/Emotional Status, Med Changes, Doctor Visits, Behavior Changes, Critical Incidents, Falls, Hospital/Urgent Care Visits, etc.
- Review of Services
- Progress toward Goals
- Additional Notes

---

## Template strategy (high priority after core works)
- Support **versioned templates**:
  - template PDF
  - field mapping (PDF field names <-> schema keys)
  - extraction hints (anchors/labels)
- Template versions must be selectable and stored as `mccmc_v1`, `mccmc_v2`, etc.

---

## Local-first + HIPAA constraints (non-negotiable)
- Assume all inputs/outputs contain PHI.
- Default to offline/local processing.
- Never transmit PHI off-device by default.
- Never log PHI (no raw OCR text, no transcripts) to console/analytics.
- Never commit PHI, real forms, or identifying examples to the repo.

### Optional cloud / private LLM policy
- Cloud/private LLM usage is allowed ONLY if the user explicitly enters an API key in settings.
- Must be off by default.
- Must clearly warn that data may leave the device.

---

## Local LLM (Track B) runtime (locked)
- Use **Ollama** as the local model runtime.
- Default model target: **Qwen 3B/4B-class** (runs on most laptops).
- App/service must detect whether Ollama is running; if not, show a clear error and allow continuing with OCR-only mapping.

## LLM contract (strict)
- LLM must output ONLY valid JSON matching the schema.
- No prose, no markdown, no extra keys.
- Never hallucinate missing values. Use empty strings/false when unknown.
- If uncertain, add reviewer notes to `notes_for_reviewer`.

---

## Storage (future-facing)
- No encryption-at-rest requirement assumed.
- Recommended: per-patient folder + SQLite metadata DB + retrieval index (later).

---

## Engineering principles (strict)
- Small, incremental changes. Prefer minimal correct implementation.
- No messy code: modular structure, clear naming, typed interfaces.
- Do not break features. Preserve prior behavior unless explicitly approved.
- Agents must not invent commands or workflows not documented here.
- OCR/LLM output is assistive; caregiver must always review/edit.

---

## Repo architecture (recommended)
- apps/desktop/          # Tauri + React UI
- services/local-ai/     # Local processing service (OCR + parsing + Ollama calls)
- packages/shared/       # Shared types: schema, validation, DTOs
- templates/             # PDF templates + mapping JSON
- docs/                  # product, architecture, security notes
- scripts/               # verification commands

---

## Commands (source of truth — update if tooling differs)
- Install JS deps: `npm install`
- Verify: `npm run verify`
- Dev:
  - Local service: `npm run dev:service`
  - Desktop app: `npm run dev:desktop`

Agents must not invent commands; if a command is missing, add it here.
