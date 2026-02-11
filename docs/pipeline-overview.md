# OCR-to-Form Pipeline Overview

## New Pipeline Architecture

```
Input (PDF/Image)
    ↓
OCR (tesseract.js / pdf-parse)
    ↓
Confidence Check
    |
    |- High Confidence (>80%) -> Standard LLM Structuring
    |- Medium Confidence (50-80%) -> LLM Categorizer (NEW)
    |- Low Confidence (<50%) + Image -> Vision LLM
    |- Fallback -> Rule-based Pattern Matching
    |
Form Output
```

## Extraction Methods

### 1. `llm-categorized` (NEW) ⭐ Recommended
Two-step intelligent processing:
1. **Categorization**: LLM analyzes raw OCR and extracts structured fields
2. **Validation**: Checks for invalid dates, missing fields, inconsistencies

**Best for**: Medium-quality OCR, messy handwriting, unstructured notes

### 2. `vision-llm` 
Multimodal model sees the image directly:
- Bypasses OCR entirely
- Reads handwriting visually

**Best for**: Very poor OCR confidence (< 50%), handwritten forms

### 3. `llm-structured`
Standard text-to-form conversion:
- Direct prompt to extract from OCR text
- No validation step

**Best for**: Clean typed text, good OCR confidence

### 4. `ocr-only`
Rule-based pattern matching:
- Regex patterns for headers
- Keyword matching for checkboxes
- Section headers for narratives

**Best for**: Fallback, no Ollama available

## Priority Order

1. **Vision LLM** - If image + low OCR confidence
2. **LLM Categorizer** - If OCR confidence < 80% and Ollama available
3. **Standard LLM** - If Ollama available
4. **Rule-based** - Fallback

## Testing

Run the new integration tests:

```powershell
# Test the full pipeline
npm run -w services/local-ai test

# Run all tests
npm run verify
```

### Test Coverage

- ✅ Clean text input (high OCR confidence)
- ✅ Handwriting/messy input (low OCR confidence)
- ✅ Checkbox extraction
- ✅ Header field extraction
- ✅ Narrative section categorization
- ✅ LLM enhancement (if Ollama available)
- ✅ Date validation
- ✅ Empty/minimal input handling
- ✅ End-to-end validation

## Validation Features

The new `llm-categorizer` validates:

- **Date formats**: Checks MM/DD/YYYY format
- **Logical consistency**: Warns if conflicting checkboxes
- **Required fields**: Notes if recipient name missing
- **Narrative quality**: Checks if content extracted

Issues are added to `notesForReviewer` and shown in UI.

## Example Flow

```
1. Upload messy handwritten note
2. OCR confidence: 35% (poor)
3. -> LLM Categorizer activated
4. LLM extracts and categorizes
5. Validation finds invalid date format
6. Output:
   - extractionMethod: "llm-categorized"
   - form: { ...structured data... }
   - validationIssues: ["header.date: Invalid format"]
   - notesForReviewer: "VALIDATION ISSUES..."
```
