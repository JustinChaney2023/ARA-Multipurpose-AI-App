import type { ExtractionResult } from '@ara/shared';
import { useState, useEffect } from 'react';

import { ErrorBoundary } from './components/ErrorBoundary';
import { PatientSidebar } from './components/PatientSidebar';
import { ImportScreen } from './screens/ImportScreen';
import { ReviewScreen } from './screens/ReviewScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { SummaryScreen, type SummaryPayload } from './screens/SummaryScreen';
import { runMigrationIfNeeded } from './utils/migration';

type Screen = 'import' | 'summary' | 'review' | 'settings';

function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('import');
  const [summaryPayload, setSummaryPayload] = useState<SummaryPayload | null>(null);
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null);
  const [importKey, setImportKey] = useState(0);
  const [selectedPatientId, setSelectedPatientId] = useState<number | undefined>(undefined);
  const [screenBeforeSettings, setScreenBeforeSettings] =
    useState<Exclude<Screen, 'settings'>>('import');

  useEffect(() => {
    runMigrationIfNeeded().catch(() => {});
  }, []);

  const handleSummarized = (payload: SummaryPayload) => {
    setSummaryPayload(payload);
    setCurrentScreen('summary');
  };

  const handleFormRequested = (result: ExtractionResult) => {
    setExtractionResult(result);
    setCurrentScreen('review');
  };

  const handleBackToImport = () => {
    setCurrentScreen('import');
    setSummaryPayload(null);
    setExtractionResult(null);
  };

  const handleNew = () => {
    setCurrentScreen('import');
    setSummaryPayload(null);
    setExtractionResult(null);
    setImportKey(prev => prev + 1);
  };

  const handleOpenSettings = () => {
    if (currentScreen !== 'settings') setScreenBeforeSettings(currentScreen);
    setCurrentScreen('settings');
  };

  const handleBackFromSettings = () => {
    setCurrentScreen(screenBeforeSettings);
  };

  const steps: [string, boolean][] =
    currentScreen === 'review'
      ? [['1. Input', false], ['2. Fill Form', true]]
      : [['1. Input', currentScreen === 'import'], ['2. Summary', currentScreen === 'summary']];

  return (
    <ErrorBoundary>
      <div className="app">
        {/* — Header — */}
        <header className="header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 26, height: 26, borderRadius: 7, background: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>A</span>
            </div>
            <span style={{ fontWeight: 600, fontSize: 14, letterSpacing: '-0.01em' }}>ARA</span>
            <span style={{ color: 'var(--border2)', fontSize: 14 }}>|</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Caregiver Assistant</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {currentScreen !== 'settings' && (
              <nav style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                {steps.map(([label, active], i) => (
                  <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {i > 0 && <span style={{ color: 'var(--text-sub)' }}>›</span>}
                    <span style={{
                      color: active ? 'var(--accent)' : 'var(--text-sub)',
                      fontWeight: active ? 600 : 400,
                    }}>{label}</span>
                  </span>
                ))}
              </nav>
            )}
            {currentScreen !== 'settings' && (
              <button
                onClick={handleOpenSettings}
                title="Settings"
                style={{
                  width: 30, height: 30, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', background: 'transparent',
                  border: '1px solid var(--border)', borderRadius: 6,
                  cursor: 'pointer', color: 'var(--text-muted)', transition: 'all 0.15s',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface2)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
                }}
              >
                ⚙
              </button>
            )}
          </div>
        </header>

        {/* — Body — */}
        <div className="app-body">
          {currentScreen !== 'settings' && (
            <PatientSidebar
              selectedPatientId={selectedPatientId}
              onSelectPatient={setSelectedPatientId}
            />
          )}

          <main className={`main${currentScreen !== 'settings' ? ' with-sidebar' : ''}`}>
            {currentScreen === 'import' && (
              <ImportScreen
                key={importKey}
                selectedPatientId={selectedPatientId}
                onSummarized={handleSummarized}
                onFormRequested={handleFormRequested}
              />
            )}
            {currentScreen === 'summary' && summaryPayload && (
              <SummaryScreen
                payload={summaryPayload}
                onBack={handleBackToImport}
                onNew={handleNew}
              />
            )}
            {currentScreen === 'review' && extractionResult && (
              <ReviewScreen
                result={extractionResult}
                selectedPatientId={selectedPatientId}
                onBack={handleBackToImport}
                onNewForm={handleNew}
                onSummarized={handleSummarized}
              />
            )}
            {currentScreen === 'settings' && (
              <SettingsScreen onBack={handleBackFromSettings} />
            )}
          </main>
        </div>
      </div>
    </ErrorBoundary>
  );
}

export default App;
