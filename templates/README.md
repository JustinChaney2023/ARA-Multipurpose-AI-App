# PDF Templates

This directory contains PDF templates and field mappings for form generation.

## Structure

```
templates/
├── mccmc_v1/                    # Monthly Care Coordination Monitoring Contact v1
│   ├── template.pdf             # Base fillable PDF template
│   └── mapping.json             # Field mapping configuration
└── README.md
```

## Field Mapping Format

```json
{
  "version": "mccmc_v1",
  "description": "Monthly Care Coordination Monitoring Contact",
  "fields": {
    "header.recipientName": { "pdfField": "RecipientName", "type": "text" },
    "header.date": { "pdfField": "Date", "type": "text" },
    "careCoordinationType.sih": { "pdfField": "SIH", "type": "checkbox" }
    // ... etc
  }
}
```

## Adding New Templates

1. Create a new subdirectory with version name (e.g., `mccmc_v2/`)
2. Add the base PDF template
3. Create a `mapping.json` file defining the field mappings
4. Update the app to support the new template version
