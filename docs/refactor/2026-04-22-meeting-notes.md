# Meeting Notes — 2026-04-22

Raw notes Justin took during a meeting. **Not authoritative** — captured here so
no context is lost before the follow-up mock interview.

## Justin's framing (from chat)

> We will be doing a major refactor. I want everything logged in docs folder
> with relevant naming. The first major fix I want is that the user should input
> something similar to the output we currently have then it turns into a
> summary. We don't need strict boxes for each field rather just one large input
> area like we have now just making the output go into a summary. We should
> modify Agents.md and Claude.md as needed. These are some notes I made while in
> meeting. Do not take them as word of master because they are without context.

## Raw notes (verbatim)

```
writing -> typing -> billing

audio -> transcript -> summary? -> form

database is pure text and summarized versions are inputted

option for handwritten / audio - optional

exclude non health related talk

/prompt/
/handwritten orc/
/audio transcript/

sidetrack convos have valuable information
- keep somewhere rather than delete

custom prompt built into app where user can edit what they need

anything to make it easier is helpful

they will do a mock interview to get more context

do the section form first then give a summarized block
```

## Commentary (my interpretation — verify in mock interview)

- **"writing → typing → billing"**: the real-world workflow. Caregiver
  handwrites notes → someone types them → eventually used for billing. The app
  sits somewhere in "typing" and feeds "billing."
- **"audio → transcript → summary? → form"**: a second input modality. Audio
  recording becomes a transcript, then (maybe) a summary, then form data. The
  `?` after summary suggests the summary step is itself TBD.
- **"database is pure text and summarized versions are inputted"**: data layer
  stores both raw text and summarized versions. Implies persistent storage
  (currently only localStorage in frontend).
- **"/prompt/ /handwritten orc/ /audio transcript/"**: likely folder names for
  on-disk organization of editable prompts, handwritten-OCR inputs, and audio
  transcripts. `orc` is almost certainly a typo for `ocr`.
- **"exclude non-health related talk"**: the summarizer must filter out
  off-topic chatter.
- **"sidetrack convos have valuable information — keep somewhere rather than
  delete"**: tension with the previous bullet. Off-topic talk should be excluded
  from the _summary_, but retained _somewhere_ (raw text? a separate bin?)
  because it sometimes has signal.
- **"custom prompt built into app where user can edit"**: the LLM prompt (for
  summarization / form filling) should be user-editable in the UI.
- **"do the section form first then give a summarized block"**: I'm 60% sure
  this means the _output_ should render section-form fields first, then a
  summary block below. I'm 40% sure it means "build the section-form workflow
  first as a dev phase, then add the summary block later." **Needs
  clarification.**

## Open questions for the mock interview

1. Is the MCCMC fillable PDF still the final deliverable, or does the summary
   replace it?
2. If the output has both section fields AND a summary block, which one gets
   billed on?
3. Where does "database" live — SQLite in the Tauri app? A file-based store?
   Something else?
4. Who edits the custom prompt — the caregiver, a coordinator, or an admin-only
   user?
5. Is audio transcription expected to run locally (Whisper) or is cloud OK for
   that one modality?
6. What distinguishes "health-related" from "sidetrack" programmatically? Human
   review or LLM classifier?
