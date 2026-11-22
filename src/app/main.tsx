import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app';
import { installRpcErrorSink } from './logging/rpc-sink';
import { applyThemePreference, readThemePreference } from './hooks/use-theme-preference';
import './styles/tailwind.css';
import './styles/tokens.css';

// The theme applies before the first paint (§12.1, §15.4).
applyThemePreference(readThemePreference());

// Failed worker RPCs log through the app logger with diagnostic ids (§18.7).
installRpcErrorSink();

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
