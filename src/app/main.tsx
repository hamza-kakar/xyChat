import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app';
import './styles/tailwind.css';
import './styles/tokens.css';

// Register the service worker for offline use. registerType is 'prompt', so a
// waiting worker is never activated automatically (AGENTS.md §12.12); the
// update prompt UI arrives with milestone M9.
void registerSW({ immediate: true });

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('Root element missing from document');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
