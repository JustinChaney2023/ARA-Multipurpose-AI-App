# Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Desktop App (Tauri + React)               │
|  +-------------+  +-------------+  +---------------------+  |
|  | Import PDF  |-> | Review Form |-> | Export Fillable PDF |  |
|  |  Screen     |  |   Screen    |  |                     |  |
|  +-------------+  +-------------+  +---------------------+  |
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP API
┌──────────────────────────▼──────────────────────────────────┐
│                  Local AI Service (Node.js)                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │    OCR      │→ │   Parser    │→ │   Ollama LLM        │  │
│  │(tesseract,  │  │(rule-based  │  │   (optional)        │  │
│  │ pdf-parse)  │  │  + LLM)     │  │                     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

1. **Import**: User drops/selects PDF/image
2. **OCR**: Extract raw text using tesseract.js or pdf-parse
3. **Parsing**: Convert text to structured form data
4. **Review**: User reviews/edits extracted fields
5. **Export**: Generate fillable PDF with values

## HIPAA Compliance

- All processing happens locally by default
- No PHI leaves the device unless cloud is explicitly enabled
- No raw OCR text logged to console/analytics
- Per-patient folder structure for file storage
