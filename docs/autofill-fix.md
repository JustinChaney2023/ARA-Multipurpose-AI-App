# Autofill Fix

## Problem
The "Auto-Fill with AI" button wasn't filling any form sections.

## Root Cause
1. The `/extract/fill` endpoint was using the original OCR confidence (usually high for typed text)
2. High confidence (>80) bypassed the LLM and used rule-based parsing only
3. Rule-based parsing only extracts simple patterns, not full narrative content

## Solution
1. **Force LLM usage**: The fill endpoint now passes confidence=40 to trigger LLM categorization
2. **Better prompt**: Updated the LLM prompt to explicitly request FULL TEXT extraction, not summaries
3. **Better error handling**: Frontend now shows specific errors and logs the result
4. **Ollama check**: Backend now checks if Ollama is running before attempting fill

## New Flow
```
User clicks "Auto-Fill"
  ↓
Frontend POST /extract/fill
  ↓
Backend checks Ollama is running
  ↓
Backend calls parseFormFromText(rawText, 40)  [40 triggers LLM]
  ↓
LLM categorizer analyzes and extracts ALL text
  ↓
Returns filled form with all narrative sections
```

## Testing
1. Start Ollama: `ollama serve`
2. Start service: `npm run dev:service`
3. Upload a typed document
4. Click "Generate AI Summary" (optional but helpful)
5. Click "Auto-Fill with AI"
6. Wait 1-2 minutes for LLM processing
7. Form should appear with filled sections

## If It Still Doesn't Work
Check the browser console for logs showing:
- `Auto-fill result:` with the filled form data
- Any error messages from the backend

Check Ollama is responding:
```powershell
curl http://localhost:11434/api/tags
```

## Updated Prompt
The LLM now receives explicit instructions:
```
NARRATIVE SECTIONS - EXTRACT FULL TEXT CONTENT:
Read the entire document and copy ALL relevant text into these sections...

IMPORTANT: Do NOT summarize - copy the full text content. 
If a section has multiple paragraphs, include them all.
```
