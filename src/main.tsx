import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/base.css';
import { App } from './app/App';
import { listenForInstall } from './app/install';
import { ErrorBoundary } from './app/ErrorBoundary';

// Chrome offers installing soon after load, so listen before anything renders.
listenForInstall();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
