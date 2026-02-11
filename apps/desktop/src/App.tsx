import { useState } from 'react';
import type { ExtractionResult } from '@ara/shared';
import { ImportScreen } from './screens/ImportScreen';
import { ReviewScreen } from './screens/ReviewScreen';

type Screen = 'import' | 'review';

function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('import');
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null);

  const handleExtracted = (result: ExtractionResult) => {
    setExtractionResult(result);
    setCurrentScreen('review');
  };

  const handleBackToImport = () => {
    setCurrentScreen('import');
    setExtractionResult(null);
  };

  return (
    <div className="app">
      <header className="header">
        <h1>ARA Caregiver Assistant</h1>
      </header>
      
      <main className="main">
        <nav className="nav-steps">
          <span className={`nav-step ${currentScreen === 'import' ? 'active' : ''}`}>
            1. Import
          </span>
          <span>-&gt;</span>
          <span className={`nav-step ${currentScreen === 'review' ? 'active' : ''}`}>
            2. Review & Export
          </span>
        </nav>

        {currentScreen === 'import' && (
          <ImportScreen onExtracted={handleExtracted} />
        )}
        
        {currentScreen === 'review' && extractionResult && (
          <ReviewScreen 
            result={extractionResult} 
            onBack={handleBackToImport}
          />
        )}
      </main>
    </div>
  );
}

export default App;
