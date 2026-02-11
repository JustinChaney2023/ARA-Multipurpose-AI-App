import { useState } from 'react';
import { type ExtractionResult, type FieldPath, type ConfidenceLevel, FORM_FIELDS } from '@ara/shared';

interface ReviewScreenProps {
  result: ExtractionResult;
  onBack: () => void;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function ReviewScreen({ result: initialResult, onBack }: ReviewScreenProps) {
  const [result, setResult] = useState<ExtractionResult>(initialResult);
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<'pdf' | 'json'>('pdf');
  const [showConfidenceInfo, setShowConfidenceInfo] = useState(true);
  const [showOcrPreview, setShowOcrPreview] = useState(false);

  const form = result.form;
  const confidenceMap = new Map(result.confidence.map(c => [c.field, c]));

  const getConfidence = (field: FieldPath): ConfidenceLevel => {
    return confidenceMap.get(field)?.confidence || 'low';
  };

  const updateHeader = (field: keyof typeof form.header, value: string) => {
    setResult(prev => ({
      ...prev,
      form: {
        ...prev.form,
        header: { ...prev.form.header, [field]: value }
      }
    }));
  };

  const updateCareCoordinationType = (field: keyof typeof form.careCoordinationType, value: boolean) => {
    setResult(prev => ({
      ...prev,
      form: {
        ...prev.form,
        careCoordinationType: { ...prev.form.careCoordinationType, [field]: value }
      }
    }));
  };

  const updateNarrative = (field: keyof typeof form.narrative, value: string) => {
    setResult(prev => ({
      ...prev,
      form: {
        ...prev.form,
        narrative: { ...prev.form.narrative, [field]: value }
      }
    }));
  };

  const updateSignature = (field: keyof typeof form.signature, value: string) => {
    setResult(prev => ({
      ...prev,
      form: {
        ...prev.form,
        signature: { ...prev.form.signature, [field]: value }
      }
    }));
  };

  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(result.form, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `care-coordination-form-${form.header.date || 'draft'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    setIsExporting(true);
    
    try {
      const response = await fetch(`${API_BASE_URL}/export/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form, templateVersion: 'mccmc_v2' }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Export failed');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `care-coordination-form-${form.header.date || 'draft'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExport = () => {
    if (exportFormat === 'pdf') {
      handleExportPDF();
    } else {
      handleExportJSON();
    }
  };

  const ConfidenceBadge = ({ level }: { level: ConfidenceLevel }) => (
    <span className={`confidence-badge ${level}`}>
      {level === 'high' ? 'OK High' : level === 'medium' ? '~ Medium' : '! Low'}
    </span>
  );

  const FieldWrapper = ({ field, children, showConfidence = true }: { field: FieldPath; children: React.ReactNode; showConfidence?: boolean }) => {
    const confidence = getConfidence(field);
    return (
      <div className={`form-group confidence-${confidence}`}>
        {showConfidence && showConfidenceInfo && (
          <div style={{ marginBottom: '0.375rem' }}>
            <ConfidenceBadge level={confidence} />
          </div>
        )}
        {children}
      </div>
    );
  };

  const getFieldMetadata = (path: FieldPath) => FORM_FIELDS.find(f => f.path === path);

  return (
    <div className="screen">
      {/* Extraction Info */}
      <div className="card" style={{ 
        background: result.extractionMethod === 'vision-llm' ? '#f0fdf4' : 
                   result.extractionMethod === 'llm-categorized' ? '#eff6ff' :
                   result.extractionMethod === 'manual' ? '#f3f4f6' : '#fefce8' 
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>
              {result.extractionMethod === 'manual' ? 'Manual Entry' :
               result.extractionMethod === 'vision-llm' ? 'Vision AI' :
               result.extractionMethod === 'llm-categorized' ? 'AI Categorized' :
               result.extractionMethod === 'llm-structured' ? 'AI Enhanced' :
               'OCR Only'}
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
              {result.extractionMethod === 'manual' 
                ? 'Form started empty. Fill in the fields manually.'
                : 'Review and edit the AI-extracted fields below.'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={showConfidenceInfo}
                onChange={e => setShowConfidenceInfo(e.target.checked)}
              />
              Show confidence
            </label>
            <button 
              className="btn btn-secondary" 
              onClick={() => setShowOcrPreview(!showOcrPreview)}
              style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
            >
              {showOcrPreview ? 'Hide' : 'Show'} OCR Text
            </button>
          </div>
        </div>
      </div>

      {/* OCR Preview (collapsible) */}
      {showOcrPreview && result.rawText && (
        <div className="card" style={{ background: '#f8fafc' }}>
          <h2 className="card-title">Original OCR Text</h2>
          <div 
            style={{ 
              background: 'white', 
              padding: '1rem', 
              borderRadius: '8px',
              fontFamily: 'monospace',
              fontSize: '0.8rem',
              whiteSpace: 'pre-wrap',
              maxHeight: '300px',
              overflow: 'auto',
              border: '1px solid var(--color-border)'
            }}
          >
            {result.rawText}
          </div>
        </div>
      )}

      {/* Header Fields */}
      <div className="card">
        <h2 className="card-title">Header Information</h2>
        <div className="form-grid">
          <FieldWrapper field="header.recipientName">
            <label className="form-label">{getFieldMetadata('header.recipientName')?.label}</label>
            <input
              type="text"
              className="form-input"
              value={form.header.recipientName}
              onChange={e => updateHeader('recipientName', e.target.value)}
              placeholder={getFieldMetadata('header.recipientName')?.placeholder}
            />
          </FieldWrapper>
          <FieldWrapper field="header.date">
            <label className="form-label">{getFieldMetadata('header.date')?.label}</label>
            <input
              type="text"
              className="form-input"
              value={form.header.date}
              onChange={e => updateHeader('date', e.target.value)}
              placeholder={getFieldMetadata('header.date')?.placeholder}
            />
          </FieldWrapper>
          <FieldWrapper field="header.time">
            <label className="form-label">{getFieldMetadata('header.time')?.label}</label>
            <input
              type="text"
              className="form-input"
              value={form.header.time}
              onChange={e => updateHeader('time', e.target.value)}
              placeholder={getFieldMetadata('header.time')?.placeholder}
            />
          </FieldWrapper>
          <FieldWrapper field="header.recipientIdentifier">
            <label className="form-label">{getFieldMetadata('header.recipientIdentifier')?.label}</label>
            <input
              type="text"
              className="form-input"
              value={form.header.recipientIdentifier}
              onChange={e => updateHeader('recipientIdentifier', e.target.value)}
              placeholder={getFieldMetadata('header.recipientIdentifier')?.placeholder}
            />
          </FieldWrapper>
          <FieldWrapper field="header.dob">
            <label className="form-label">{getFieldMetadata('header.dob')?.label}</label>
            <input
              type="text"
              className="form-input"
              value={form.header.dob}
              onChange={e => updateHeader('dob', e.target.value)}
              placeholder={getFieldMetadata('header.dob')?.placeholder}
            />
          </FieldWrapper>
          <FieldWrapper field="header.location">
            <label className="form-label">{getFieldMetadata('header.location')?.label}</label>
            <input
              type="text"
              className="form-input"
              value={form.header.location}
              onChange={e => updateHeader('location', e.target.value)}
              placeholder={getFieldMetadata('header.location')?.placeholder}
            />
          </FieldWrapper>
        </div>
      </div>

      {/* Care Coordination Type */}
      <div className="card">
        <h2 className="card-title">Care Coordination Type</h2>
        <div className="checkbox-group">
          <FieldWrapper field="careCoordinationType.sih" showConfidence={false}>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={form.careCoordinationType.sih}
                onChange={e => updateCareCoordinationType('sih', e.target.checked)}
              />
              SIH
            </label>
          </FieldWrapper>
          <FieldWrapper field="careCoordinationType.hcbw" showConfidence={false}>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={form.careCoordinationType.hcbw}
                onChange={e => updateCareCoordinationType('hcbw', e.target.checked)}
              />
              HCBW
            </label>
          </FieldWrapper>
        </div>
      </div>

      {/* Narrative Sections */}
      <FieldWrapper field="narrative.recipientAndVisitObservations">
        <div className="card">
          <h2 className="card-title">{getFieldMetadata('narrative.recipientAndVisitObservations')?.label}</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
            What are they doing, communicating, any concerns regarding home/site status, misc. information, etc.
          </p>
          <textarea
            className="form-textarea"
            value={form.narrative.recipientAndVisitObservations}
            onChange={e => updateNarrative('recipientAndVisitObservations', e.target.value)}
            placeholder={getFieldMetadata('narrative.recipientAndVisitObservations')?.placeholder}
          />
        </div>
      </FieldWrapper>

      <FieldWrapper field="narrative.healthEmotionalStatus">
        <div className="card">
          <h2 className="card-title">Health/Emotional Status</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
            Med Changes, Doctor Visits, Behavior Changes, Critical Incidents, Falls, Hospital/Urgent Care Visits, etc.
          </p>
          <textarea
            className="form-textarea"
            value={form.narrative.healthEmotionalStatus}
            onChange={e => updateNarrative('healthEmotionalStatus', e.target.value)}
            placeholder={getFieldMetadata('narrative.healthEmotionalStatus')?.placeholder}
          />
        </div>
      </FieldWrapper>

      <FieldWrapper field="narrative.reviewOfServices">
        <div className="card">
          <h2 className="card-title">{getFieldMetadata('narrative.reviewOfServices')?.label}</h2>
          <textarea
            className="form-textarea"
            value={form.narrative.reviewOfServices}
            onChange={e => updateNarrative('reviewOfServices', e.target.value)}
            placeholder={getFieldMetadata('narrative.reviewOfServices')?.placeholder}
          />
        </div>
      </FieldWrapper>

      <FieldWrapper field="narrative.progressTowardGoals">
        <div className="card">
          <h2 className="card-title">{getFieldMetadata('narrative.progressTowardGoals')?.label}</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
            How is the recipient doing on their goals? Are current goals supporting the recipient? Any changes needed?
          </p>
          <textarea
            className="form-textarea"
            value={form.narrative.progressTowardGoals}
            onChange={e => updateNarrative('progressTowardGoals', e.target.value)}
            placeholder={getFieldMetadata('narrative.progressTowardGoals')?.placeholder}
          />
        </div>
      </FieldWrapper>

      <FieldWrapper field="narrative.additionalNotes">
        <div className="card">
          <h2 className="card-title">{getFieldMetadata('narrative.additionalNotes')?.label}</h2>
          <textarea
            className="form-textarea"
            value={form.narrative.additionalNotes}
            onChange={e => updateNarrative('additionalNotes', e.target.value)}
            placeholder={getFieldMetadata('narrative.additionalNotes')?.placeholder}
          />
        </div>
      </FieldWrapper>

      <FieldWrapper field="narrative.followUpTasks">
        <div className="card">
          <h2 className="card-title">{getFieldMetadata('narrative.followUpTasks')?.label}</h2>
          <textarea
            className="form-textarea"
            value={form.narrative.followUpTasks}
            onChange={e => updateNarrative('followUpTasks', e.target.value)}
            placeholder={getFieldMetadata('narrative.followUpTasks')?.placeholder}
          />
        </div>
      </FieldWrapper>

      {/* Signature Section */}
      <div className="card" style={{ background: '#fafaf9' }}>
        <h2 className="card-title">Signature</h2>
        <div className="form-grid">
          <FieldWrapper field="signature.careCoordinatorName">
            <label className="form-label">{getFieldMetadata('signature.careCoordinatorName')?.label}</label>
            <input
              type="text"
              className="form-input"
              value={form.signature.careCoordinatorName}
              onChange={e => updateSignature('careCoordinatorName', e.target.value)}
              placeholder={getFieldMetadata('signature.careCoordinatorName')?.placeholder}
            />
          </FieldWrapper>
          <FieldWrapper field="signature.signature">
            <label className="form-label">{getFieldMetadata('signature.signature')?.label}</label>
            <input
              type="text"
              className="form-input"
              value={form.signature.signature}
              onChange={e => updateSignature('signature', e.target.value)}
              placeholder={getFieldMetadata('signature.signature')?.placeholder}
            />
          </FieldWrapper>
          <FieldWrapper field="signature.dateSigned">
            <label className="form-label">{getFieldMetadata('signature.dateSigned')?.label}</label>
            <input
              type="text"
              className="form-input"
              value={form.signature.dateSigned}
              onChange={e => updateSignature('dateSigned', e.target.value)}
              placeholder={getFieldMetadata('signature.dateSigned')?.placeholder}
            />
          </FieldWrapper>
        </div>
      </div>

      {/* Actions */}
      <div className="card" style={{ background: '#f0f9ff' }}>
        <h2 className="card-title">Export Form</h2>
        
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input
              type="radio"
              name="exportFormat"
              value="pdf"
              checked={exportFormat === 'pdf'}
              onChange={() => setExportFormat('pdf')}
            />
            Fillable PDF
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input
              type="radio"
              name="exportFormat"
              value="json"
              checked={exportFormat === 'json'}
              onChange={() => setExportFormat('json')}
            />
            JSON Data
          </label>
        </div>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={onBack}>
            &lt;- Back to Import
          </button>
          <button 
            className="btn btn-primary" 
            onClick={handleExport}
            disabled={isExporting}
          >
            {isExporting ? (
              <>
                <span className="spinner" />
                Exporting...
              </>
            ) : (
              `Export as ${exportFormat.toUpperCase()}`
            )}
          </button>
        </div>
      </div>

      <div className="status info" style={{ marginTop: '1rem' }}>
        <strong>Review all fields before exporting.</strong> Fields with yellow/red borders may need extra attention.
        {result.extractionMethod === 'ocr-only' && ' OCR-only mode: Please verify all extracted values carefully.'}
      </div>
    </div>
  );
}
