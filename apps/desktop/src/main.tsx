import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

// Add platform detection for web-only mode
const isWebMode = import.meta.env.MODE === 'web';
if (isWebMode) {
  console.log('Running in web-only mode (Tauri APIs disabled)');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
