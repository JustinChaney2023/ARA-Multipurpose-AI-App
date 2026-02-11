# New Form Structure Changes (v2)

## Updated Workflow

### Before:
1. Upload file -> AI extracts and fills form immediately

### After:
1. Upload file -> OCR extracts text
2. **Show OCR preview** to user
3. User clicks **"Auto-Fill with AI"** or **"Manual Fill"**
4. Form opens with data (or empty for manual)

## Form Structure Changes

### Removed Fields:
- `contactType` (faceToFaceVisit, homeVisit, serviceSiteVisit, etc.)
- `notesForReviewer` (moved into additionalNotes)

### New Fields:
- `narrative.followUpTasks` - Care coordinator follow up tasks
- `signature.careCoordinatorName` - Coordinator name
- `signature.signature` - Signature text
- `signature.dateSigned` - Date signed

### Updated Sections:

#### Header (unchanged)
- Recipient Name
- Date
- Time
- Recipient Identifier
- DOB
- Location

#### Care Coordination Type (unchanged)
- SIH (checkbox)
- HCBW (checkbox)

#### Main: Recipient & Visit Observations
What are they doing, communicating, any concerns regarding home/site status, misc. information, etc.

#### Health/Emotional Status
Med Changes, Doctor Visits, Behavior Changes, Critical Incidents, Falls, Hospital/Urgent Care Visits, etc.

#### Review of Services
Current services review

#### Progress Toward Goals
How is the recipient doing on their goals, are current goals supporting the recipient, any changes needed?

#### Additional Notes
Any other information + validation notes from AI

#### Care Coordinator Follow Up Tasks
NEW - Tasks for coordinator to follow up on

#### Signature Section
NEW - Care coordinator name, signature, date

## Pipeline Changes

### Extraction Methods:
1. **vision-llm** - For poor handwriting (sees image directly)
2. **llm-categorized** - Two-step: categorize + validate (NEW)
3. **llm-structured** - Standard LLM text extraction
4. **ocr-only** - Rule-based pattern matching
5. **manual** - User fills form themselves

### Improved Pipeline:
```
Input -> OCR -> Show Preview -> User Chooses -> Fill Form
```

## Files Updated:
- `packages/shared/src/schema/mccmc_v2.ts` - New schema
- `apps/desktop/src/screens/ImportScreen.tsx` - OCR preview + buttons
- `apps/desktop/src/screens/ReviewScreen.tsx` - New form layout
- `services/local-ai/src/parser.ts` - Updated parsing logic
- `services/local-ai/src/llmCategorizer.ts` - Two-step categorization
- `templates/mccmc_v2/mapping.json` - New PDF mapping
- `services/local-ai/src/__tests__/integration.test.ts` - Updated tests
