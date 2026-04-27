/**
 * App - top-level router for the app's screen flow.
 *
 * Screens:
 *   - import   : landing. File drop, text paste, or "Fill form manually" button.
 *   - summary  : primary output after a summary request. Shows the LLM summary
 *                plus a collapsible view of the original input.
 *   - review   : opt-in MCCMC form editor. Reached only via the "Fill form
 *                manually" button on ImportScreen.
 *   - settings : Phase 2 editable prompts. Reached from the header button;
 *                returns to import on Back.
 *
 * Routing is state-based (no router library) — the app has few screens and
 * deep-linking isn't a requirement.
 *
 * Phase 3 additions:
 *   - Patient sidebar on the left (persistent across screens).
 *   - selectedPatientId lifted here so ImportScreen can attach summaries to
 *     the chosen patient via the summary-write hook.
 *   - One-time localStorage → DB migration on first mount.
 */

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
  // Bump to force ImportScreen to remount (and reset internal state) when the
  // user asks for a fresh start. Cheaper than lifting all of its state up.
  const [importKey, setImportKey] = useState(0);
  // Phase 3: which patient is currently selected in the sidebar.
  const [selectedPatientId, setSelectedPatientId] = useState<number | undefined>(undefined);
  const [screenBeforeSettings, setScreenBeforeSettings] =
    useState<Exclude<Screen, 'settings'>>('import');

  // One-time migration from localStorage history to SQLite.
  useEffect(() => {
    runMigrationIfNeeded().catch(() => {
      // Non-fatal: if the service isn't running yet, the user can still use
      // the app; history simply won't be migrated this session.
    });
  }, []);

  // Summary path — default outcome of text paste or file upload.
  const handleSummarized = (payload: SummaryPayload) => {
    setSummaryPayload(payload);
    setCurrentScreen('summary');
  };

  // Form path — triggered by the explicit "Fill form manually" button.
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
    if (currentScreen !== 'settings') {
      setScreenBeforeSettings(currentScreen);
    }
    setCurrentScreen('settings');
  };

  const handleBackFromSettings = () => {
    setCurrentScreen(screenBeforeSettings);
  };

  return (
    <ErrorBoundary>
      <div className="app">
        <header
          className="header"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <h1>ARA Caregiver Assistant</h1>
          {/* Settings link lives in the header so it's reachable from any screen
            without crowding the per-screen controls. */}
          {currentScreen !== 'settings' && (
            <button
              onClick={handleOpenSettings}
              className="btn btn-secondary"
              title="Edit prompts used by the AI"
            >
              Settings
            </button>
          )}
        </header>

        <div className="app-body">
          {currentScreen !== 'settings' && (
            <PatientSidebar
              selectedPatientId={selectedPatientId}
              onSelectPatient={setSelectedPatientId}
            />
          )}

          <main className={`main ${currentScreen !== 'settings' ? 'with-sidebar' : ''}`}>
            {/* Breadcrumb. Two rails — the summary path (default) and the form path
              (opt-in) — displayed conditionally so the user sees where they are.
              Hidden on the settings screen since it's an out-of-flow detour. */}
            {currentScreen !== 'settings' && (
              <nav className="nav-steps">
                <span className={`nav-step ${currentScreen === 'import' ? 'active' : ''}`}>
                  1. Input
                </span>
                <span>-&gt;</span>
                {currentScreen === 'review' ? (
                  <span className={`nav-step active`}>2. Fill Form</span>
                ) : (
                  <span className={`nav-step ${currentScreen === 'summary' ? 'active' : ''}`}>
                    2. Summary
                  </span>
                )}
              </nav>
            )}

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

            {currentScreen === 'settings' && <SettingsScreen onBack={handleBackFromSettings} />}
          </main>
        </div>
      </div>
    </ErrorBoundary>
  );
}

export default App;
