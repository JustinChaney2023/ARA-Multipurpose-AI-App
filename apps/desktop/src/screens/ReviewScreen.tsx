import { useState, useEffect, useCallback, useRef } from 'react';
import { type ExtractionResult, type FieldPath, type ConfidenceLevel } from '@ara/shared';
import { useUndoRedo } from '../hooks/useUndoRedo';
import { validateForm, autoFormatDate, autoFormatTime, applySmartDefaults, type ValidationState } from '../utils/formValidation';
import { saveToQuickHistory } from '../utils/quickHistory';
import { PDFPreview } from '../components/PDFPreview';
import { QuickHistory } from '../components/QuickHistory';
import { useKeyboardShortcuts, SHORTCUTS } from '../hooks/useKeyboardShortcuts';

interface ReviewScreenProps {
  result: ExtractionResult;
  onBack: () => void;
  onNewForm: () => void;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function ReviewScreen({ result: initialResult, onBack, onNewForm }: ReviewScreenProps) {
  // Undo/Redo state management
  const { state: result, set: setResult, undo, redo, canUndo, canRedo, reset } = useUndoRedo(initialResult);
  const [showUndoIndicator, setShowUndoIndicator] = useState(false);
  
  // UI State
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [validation, setValidation] = useState<ValidationState>({ valid: true, errors: [], warnings: [] });
  const [isValidating, setIsValidating] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const [autoFixMessage, setAutoFixMessage] = useState<string | null>(null);
  
  // Apply smart defaults and normalize dates on first load
  useEffect(() => {
    const normalizeDates = async () => {
      const updates: Partial<typeof form> = {};
      let fixedCount = 0;
      
      // Normalize header dates
      if (form.header.date) {
        const normalizedDate = await autoFormatDate(form.header.date);
        if (normalizedDate !== form.header.date) {
          updates.header = { ...form.header, date: normalizedDate };
          fixedCount++;
        }
      }
      if (form.header.dob) {
        const normalizedDob = await autoFormatDate(form.header.dob);
        if (normalizedDob !== form.header.dob) {
          updates.header = { ...(updates.header || form.header), dob: normalizedDob };
          fixedCount++;
        }
      }
      if (form.header.time) {
        const normalizedTime = await autoFormatTime(form.header.time);
        if (normalizedTime !== form.header.time) {
          updates.header = { ...(updates.header || form.header), time: normalizedTime };
          fixedCount++;
        }
      }
      
      // Show auto-fix message if dates were corrected
      if (fixedCount > 0) {
        setAutoFixMessage(`Auto-corrected ${fixedCount} date${fixedCount > 1 ? 's' : ''}`);
        setTimeout(() => setAutoFixMessage(null), 3000);
      }
      
      // Apply defaults
      const defaults = applySmartDefaults({ ...form, ...updates } as typeof form);
      
      // Merge all updates
      const finalUpdates = { ...updates, ...defaults };
      if (Object.keys(finalUpdates).length > 0) {
        updateFormWithDefaults(finalUpdates);
      }
      
      // Initial validation
      validateCurrentForm();
    };
    
    normalizeDates();
  }, []);
  
  // Validate on form changes (debounced)
  const validationTimeout = useRef<NodeJS.Timeout>();
  useEffect(() => {
    validationTimeout.current = setTimeout(() => {
      validateCurrentForm();
    }, 500);
    return () => clearTimeout(validationTimeout.current);
  }, [result.form]);

  const form = result.form;
  const confidenceMap = new Map(result.confidence.map(c => [c.field, c]));

  const getConfidence = (field: FieldPath): ConfidenceLevel => {
    return confidenceMap.get(field)?.confidence || 'low';
  };

  const validateCurrentForm = async () => {
    setIsValidating(true);
    const validationResult = await validateForm(form);
    setValidation(validationResult);
    setIsValidating(false);
  };

  const updateField = (section: string, field: string, value: string | boolean) => {
    setResult(prev => {
      const newResult = { ...prev, form: { ...prev.form } };
      (newResult.form as any)[section][field] = value;
      return newResult;
    });
  };

  const updateFormWithDefaults = (defaults: Partial<ExtractionResult['form']>) => {
    setResult(prev => ({
      ...prev,
      form: { ...prev.form, ...defaults } as typeof prev.form,
    }));
  };

  // Auto-format date/time on blur with immediate validation
  const handleDateBlur = async (value: string, field: string) => {
    const formatted = await autoFormatDate(value);
    if (formatted !== value && formatted) {
      updateField('header', field, formatted);
      // Show auto-fix message
      setAutoFixMessage(`Date corrected to ${formatted}`);
      setTimeout(() => setAutoFixMessage(null), 3000);
      // Re-validate after format
      setTimeout(() => validateCurrentForm(), 0);
    }
  };

  const handleTimeBlur = async (value: string) => {
    const formatted = await autoFormatTime(value);
    if (formatted !== value && formatted) {
      updateField('header', 'time', formatted);
    }
  };

  // Smart date input handler - formats common patterns as user types
  const handleDateChange = (value: string, field: string) => {
    // Auto-format if it looks like a complete date
    const looksLikeDate = /^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}$/.test(value);
    if (looksLikeDate) {
      autoFormatDate(value).then(formatted => {
        if (formatted !== value && formatted) {
          updateField('header', field, formatted);
          return;
        }
      });
    }
    updateField('header', field, value);
  };

  // Undo/Redo with visual feedback
  const handleUndo = useCallback(() => {
    undo();
    setShowUndoIndicator(true);
    setTimeout(() => setShowUndoIndicator(false), 1000);
  }, [undo]);

  const handleRedo = useCallback(() => {
    redo();
  }, [redo]);

  // Reset to original AI extraction
  const handleReset = () => {
    reset(initialResult);
    setShowResetConfirm(false);
  };

  const handleExportPDF = useCallback(async () => {
    // Validate before export
    const validationResult = await validateForm(form);
    setValidation(validationResult);
    
    if (!validationResult.valid) {
      // Scroll to first error
      const firstError = validationResult.errors[0];
      if (firstError) {
        const element = document.querySelector(`[data-field="${firstError.field}"]`);
        element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    setIsExporting(true);
    setExportSuccess(false);
    
    try {
      const response = await fetch(`${API_BASE_URL}/export/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form }),
      });
      
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `care-form-${form.header.recipientName || 'draft'}-${form.header.date || new Date().toISOString().split('T')[0]}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
      
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 3000);
      
      // Save to history on successful export
      saveToQuickHistory(result);
      setHistoryKey(prev => prev + 1);
    } catch (error) {
      alert('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }, [form, validation.valid]);

  // Keyboard shortcuts (must be after function definitions)
  useKeyboardShortcuts([
    { ...SHORTCUTS.undo, handler: handleUndo, preventDefault: true },
    { ...SHORTCUTS.redo, handler: handleRedo, preventDefault: true },
    { ...SHORTCUTS.new, handler: onNewForm },
    { ...SHORTCUTS.export, handler: handleExportPDF },
    { ...SHORTCUTS.preview, handler: () => setShowPreview(true) },
    { ...SHORTCUTS.back, handler: onBack },
  ]);

  // Calculate completion stats
  const headerFields = Object.values(form.header).filter(Boolean).length;
  const narrativeFields = Object.values(form.narrative).filter(v => v && v.length > 20).length;
  const totalFields = 6 + 6;
  const completionPercent = Math.round(((headerFields + narrativeFields) / totalFields) * 100);

  const ConfidenceDot = ({ field }: { field: FieldPath }) => {
    const level = getConfidence(field);
    const colors = { high: '#22c55e', medium: '#f59e0b', low: '#ef4444' };
    return (
      <span 
        title={`${level} confidence`}
        style={{ 
          display: 'inline-block',
          width: 6, 
          height: 6, 
          borderRadius: '50%', 
          background: colors[level],
          marginLeft: '0.5rem',
        }} 
      />
    );
  };

  const ValidationIndicator = ({ field }: { field: FieldPath }) => {
    const error = validation.errors.find(e => e.field === field);
    if (error) {
      return <span style={{ color: '#dc2626', fontSize: '0.75rem', marginLeft: '0.5rem' }}>✗ {error.message}</span>;
    }
    const warning = validation.warnings.find(w => w.field === field);
    if (warning) {
      return <span style={{ color: '#f59e0b', fontSize: '0.75rem', marginLeft: '0.5rem' }}>⚠ {warning.message}</span>;
    }
    return null;
  };

  return (
    <div className="screen">
      {/* PDF Preview Modal */}
      <PDFPreview form={form} isOpen={showPreview} onClose={() => setShowPreview(false)} />
      
      {/* Reset Confirmation */}
      {showResetConfirm && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowResetConfirm(false)}
        >
          <div 
            className="card"
            style={{ maxWidth: '400px', margin: '1rem' }}
            onClick={e => e.stopPropagation()}
          >
            <h3>Reset to AI Extraction?</h3>
            <p style={{ color: 'var(--color-text-muted)' }}>
              This will discard all your edits and restore the original AI-extracted values.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
              <button className="btn btn-secondary" onClick={() => setShowResetConfirm(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleReset} style={{ background: '#dc2626' }}>
                Reset Form
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick History */}
      <QuickHistory 
        key={historyKey}
        onSelect={(item) => {
          // Could load historical data here
          console.log('Selected history item:', item);
        }}
      />

      {/* Header with actions */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '1.5rem',
        flexWrap: 'wrap',
        gap: '1rem',
      }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Review Form</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', margin: 0 }}>
            {completionPercent}% complete • {isValidating ? 'Validating...' : validation.valid ? 'Ready to export' : 'Fix errors to export'}
          </p>
        </div>
        
        {/* Toolbar */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {/* Undo/Redo */}
          <button 
            className="btn btn-secondary" 
            onClick={handleUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            style={{ padding: '0.5rem 0.75rem' }}
          >
            ↩ Undo
          </button>
          <button 
            className="btn btn-secondary" 
            onClick={handleRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            style={{ padding: '0.5rem 0.75rem' }}
          >
            ↪ Redo
          </button>
          
          {/* Reset */}
          <button 
            className="btn btn-secondary" 
            onClick={() => setShowResetConfirm(true)}
            title="Reset to AI extraction"
            style={{ padding: '0.5rem 0.75rem' }}
          >
            ↺ Reset
          </button>
          
          <div style={{ width: 1, background: 'var(--color-border)', margin: '0 0.25rem' }} />
          
          <button className="btn btn-secondary" onClick={onBack}>
            ← Back
          </button>
          <button 
            className="btn btn-secondary" 
            onClick={() => setShowPreview(true)}
          >
            👁 Preview
          </button>
        </div>
      </div>

      {/* Validation Summary */}
      {!validation.valid && (
        <div className="card" style={{ background: '#fef2f2', borderColor: '#fecaca' }}>
          <h4 style={{ color: '#dc2626', margin: '0 0 0.5rem' }}>⚠️ Required Fields Missing</h4>
          <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#991b1b' }}>
            {validation.errors.map(e => (
              <li key={e.field}>{e.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Success message */}
      {exportSuccess && (
        <div className="card" style={{ background: '#dcfce7', borderColor: '#86efac' }}>
          <p style={{ color: '#166534', margin: 0 }}>✓ PDF exported successfully!</p>
        </div>
      )}

      {/* Auto-fix indicator */}
      {autoFixMessage && (
        <div className="card" style={{ background: '#eff6ff', borderColor: '#bfdbfe' }}>
          <p style={{ color: '#1e40af', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>✨</span> {autoFixMessage}
          </p>
        </div>
      )}

      {/* Undo indicator */}
      {showUndoIndicator && (
        <div style={{
          position: 'fixed',
          bottom: '1rem',
          right: '1rem',
          background: '#1e293b',
          color: 'white',
          padding: '0.5rem 1rem',
          borderRadius: '6px',
          fontSize: '0.875rem',
          zIndex: 100,
          animation: 'fadeIn 0.2s',
        }}>
          Undone
        </div>
      )}

      {/* Header Section */}
      <section className="card">
        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center' }}>
          Client Information
          <ConfidenceDot field="header.recipientName" />
        </h3>
        <div className="form-grid">
          <div className="form-group" data-field="header.recipientName">
            <label className="form-label">
              Recipient Name *
              <ValidationIndicator field="header.recipientName" />
            </label>
            <input
              type="text"
              className="form-input"
              value={form.header.recipientName}
              onChange={e => updateField('header', 'recipientName', e.target.value)}
              placeholder="Client name"
              style={{ borderColor: validation.errors.find(e => e.field === 'header.recipientName') ? '#dc2626' : undefined }}
            />
          </div>
          
          <div className="form-group" data-field="header.date">
            <label className="form-label">
              Date *
              <ValidationIndicator field="header.date" />
            </label>
            <input
              type="text"
              className="form-input"
              value={form.header.date}
              onChange={e => handleDateChange(e.target.value, 'date')}
              onBlur={e => handleDateBlur(e.target.value, 'date')}
              placeholder="MM/DD/YYYY or 2024-03-15"
              style={{ borderColor: validation.errors.find(e => e.field === 'header.date') ? '#dc2626' : undefined }}
            />
            <small style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
              Auto-corrects any format → MM/DD/YYYY
            </small>
          </div>
          
          <div className="form-group">
            <label className="form-label">Time</label>
            <input
              type="text"
              className="form-input"
              value={form.header.time}
              onChange={e => updateField('header', 'time', e.target.value)}
              onBlur={e => handleTimeBlur(e.target.value)}
              placeholder="HH:MM"
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">ID Number</label>
            <input
              type="text"
              className="form-input"
              value={form.header.recipientIdentifier}
              onChange={e => updateField('header', 'recipientIdentifier', e.target.value)}
              placeholder="Client ID"
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">Date of Birth</label>
            <input
              type="text"
              className="form-input"
              value={form.header.dob}
              onChange={e => handleDateChange(e.target.value, 'dob')}
              onBlur={e => handleDateBlur(e.target.value, 'dob')}
              placeholder="MM/DD/YYYY or 1950-01-15"
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">Location</label>
            <input
              type="text"
              className="form-input"
              value={form.header.location}
              onChange={e => updateField('header', 'location', e.target.value)}
              placeholder="Home, Office, etc."
            />
          </div>
        </div>
      </section>

      {/* Care Type */}
      <section className="card">
        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Care Coordination Type</h3>
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={form.careCoordinationType.sih}
              onChange={e => updateField('careCoordinationType', 'sih', e.target.checked)}
            />
            SIH (Senior In-Home)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={form.careCoordinationType.hcbw}
              onChange={e => updateField('careCoordinationType', 'hcbw', e.target.checked)}
            />
            HCBW (Home and Community-Based Waiver)
          </label>
        </div>
      </section>

      {/* Narrative Sections */}
      {[
        { key: 'recipientAndVisitObservations', title: 'Recipient & Visit Observations', field: 'narrative.recipientAndVisitObservations' as FieldPath },
        { key: 'healthEmotionalStatus', title: 'Health/Emotional Status', field: 'narrative.healthEmotionalStatus' as FieldPath },
        { key: 'reviewOfServices', title: 'Review of Services', field: 'narrative.reviewOfServices' as FieldPath },
        { key: 'progressTowardGoals', title: 'Progress Toward Goals', field: 'narrative.progressTowardGoals' as FieldPath },
        { key: 'followUpTasks', title: 'Follow Up Tasks', field: 'narrative.followUpTasks' as FieldPath },
        { key: 'additionalNotes', title: 'Additional Notes', field: 'narrative.additionalNotes' as FieldPath },
      ].map(({ key, title, field }) => (
        <section key={key} className="card" data-field={field}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center' }}>
            {title}
            <ConfidenceDot field={field} />
            <ValidationIndicator field={field} />
          </h3>
          <textarea
            className="form-textarea"
            value={(form.narrative as any)[key]}
            onChange={e => updateField('narrative', key, e.target.value)}
            rows={4}
            placeholder={`Enter ${title.toLowerCase()}...`}
            style={{ borderColor: validation.warnings.find(w => w.field === field) ? '#f59e0b' : undefined }}
          />
        </section>
      ))}

      {/* Signature */}
      <section className="card" style={{ background: '#fafaf9' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Signature</h3>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Care Coordinator Name</label>
            <input
              type="text"
              className="form-input"
              value={form.signature.careCoordinatorName}
              onChange={e => updateField('signature', 'careCoordinatorName', e.target.value)}
              placeholder="Your name"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Date Signed</label>
            <input
              type="text"
              className="form-input"
              value={form.signature.dateSigned}
              onChange={e => updateField('signature', 'dateSigned', e.target.value)}
              onBlur={e => handleDateBlur(e.target.value, 'dateSigned')}
              placeholder="MM/DD/YYYY"
            />
          </div>
        </div>
      </section>

      {/* Bottom Actions */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '1rem 0',
        borderTop: '1px solid var(--color-border)',
        marginTop: '1rem',
      }}>
        <button className="btn btn-secondary" onClick={onNewForm}>
          ➕ New Form
        </button>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button 
            className="btn btn-secondary" 
            onClick={() => setShowPreview(true)}
          >
            👁 Preview
          </button>
          <button 
            className="btn btn-primary" 
            onClick={handleExportPDF}
            disabled={isExporting || !validation.valid}
            style={{ minWidth: '150px' }}
          >
            {isExporting ? 'Exporting...' : !validation.valid ? 'Fix Errors to Export' : '📄 Export PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
