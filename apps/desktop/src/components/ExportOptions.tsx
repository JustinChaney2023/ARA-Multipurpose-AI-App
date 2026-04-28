import type { ExtractionResult } from '@ara/shared';
import { useState } from 'react';

import { Icon } from './Icon';
import { Tooltip } from './Tooltip';

interface ExportOptionsProps {
  form: ExtractionResult['form'];
  rawText: string;
  onExportPDF: () => void;
}

export function ExportOptions({ form, rawText, onExportPDF }: ExportOptionsProps) {
  const [showPrintView, setShowPrintView] = useState(false);

  const exportToJSON = () => {
    const data = {
      version: 'mccmc_v2',
      exportedAt: new Date().toISOString(),
      form,
      rawText,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `care-coordination-${form.header.recipientName || 'export'}-${
      new Date().toISOString().split('T')[0]
    }.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    setShowPrintView(true);
    setTimeout(() => window.print(), 100);
  };

  return (
    <>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <Tooltip content="Export as fillable PDF">
          <button className="btn btn-primary" onClick={onExportPDF}>
            <Icon name="document" size={16} /> Export PDF
          </button>
        </Tooltip>

        <Tooltip content="Print-friendly version">
          <button className="btn btn-secondary" onClick={handlePrint}>
            <Icon name="print" size={16} /> Print
          </button>
        </Tooltip>

        <Tooltip content="Backup as JSON file">
          <button className="btn btn-secondary" onClick={exportToJSON}>
            <Icon name="save" size={16} /> JSON Backup
          </button>
        </Tooltip>
      </div>

      {/* Print View - Hidden element that gets printed */}
      {showPrintView && (
        <div className="print-only" style={{ display: 'none' }}>
          <PrintableForm form={form} />
        </div>
      )}
    </>
  );
}

function PrintableForm({ form }: { form: ExtractionResult['form'] }) {
  return (
    <div
      style={{
        fontFamily: 'Arial, sans-serif',
        maxWidth: '800px',
        margin: '0 auto',
        padding: '2rem',
        background: 'white',
      }}
    >
      <h1 style={{ textAlign: 'center', borderBottom: '2px solid #333', paddingBottom: '1rem' }}>
        Monthly Care Coordination Monitoring Contact
      </h1>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.5rem' }}>
        <tbody>
          <tr>
            <td
              style={{
                padding: '0.5rem',
                border: '1px solid #ccc',
                fontWeight: 'bold',
                width: '30%',
              }}
            >
              Recipient Name
            </td>
            <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}>
              {form.header.recipientName}
            </td>
          </tr>
          <tr>
            <td style={{ padding: '0.5rem', border: '1px solid #ccc', fontWeight: 'bold' }}>
              Date
            </td>
            <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}>{form.header.date}</td>
          </tr>
          <tr>
            <td style={{ padding: '0.5rem', border: '1px solid #ccc', fontWeight: 'bold' }}>
              Time
            </td>
            <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}>{form.header.time}</td>
          </tr>
          <tr>
            <td style={{ padding: '0.5rem', border: '1px solid #ccc', fontWeight: 'bold' }}>ID</td>
            <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}>
              {form.header.recipientIdentifier}
            </td>
          </tr>
          <tr>
            <td style={{ padding: '0.5rem', border: '1px solid #ccc', fontWeight: 'bold' }}>DOB</td>
            <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}>{form.header.dob}</td>
          </tr>
          <tr>
            <td style={{ padding: '0.5rem', border: '1px solid #ccc', fontWeight: 'bold' }}>
              Location
            </td>
            <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}>{form.header.location}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginBottom: '1rem' }}>
        <strong>Care Coordination Type:</strong>{' '}
        {form.careCoordinationType.sih && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
            <Icon name="check" size={14} /> Senior In-Home{' '}
          </span>
        )}
        {form.careCoordinationType.hcbw && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
            <Icon name="check" size={14} /> Home & Community-Based Waiver
          </span>
        )}
      </div>

      {Object.entries(form.narrative).map(([key, value]) => (
        <div key={key} style={{ marginBottom: '1rem', pageBreakInside: 'avoid' }}>
          <h3
            style={{
              background: '#f0f0f0',
              padding: '0.5rem',
              margin: '0 0 0.5rem',
              fontSize: '0.9rem',
              textTransform: 'capitalize',
            }}
          >
            {key.replace(/([A-Z])/g, ' $1').trim()}
          </h3>
          <div
            style={{
              padding: '0.5rem',
              border: '1px solid #ccc',
              minHeight: '60px',
              whiteSpace: 'pre-wrap',
            }}
          >
            {value || '(No content)'}
          </div>
        </div>
      ))}

      <div style={{ marginTop: '2rem', borderTop: '2px solid #333', paddingTop: '1rem' }}>
        <p>
          <strong>Care Coordinator:</strong> {form.signature.careCoordinatorName}
        </p>
        <p>
          <strong>Date Signed:</strong> {form.signature.dateSigned}
        </p>
      </div>
    </div>
  );
}
