import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';

// Global error handler
window.onerror = (message, source, lineno, colno, error) => {
  console.error('LinxCoreSight: Global error:', { message, source, lineno, colno, error });
};

window.onunhandledrejection = (event) => {
  console.error('LinxCoreSight: Unhandled promise rejection:', event.reason);
};

console.log('LinxCoreSight: Starting React app...');

try {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  console.log('LinxCoreSight: React app rendered');
} catch (e) {
  console.error('LinxCoreSight: Error rendering app:', e);
}
