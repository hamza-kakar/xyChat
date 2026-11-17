import { HashRouter } from 'react-router';
import { AppRoutes } from './routes';
import { AppErrorBoundary } from './features/shell/app-error-boundary';
import { CapabilityGate } from './features/shell/capability-gate';

/** App root: error boundary outermost, then capability gate, then routes. */
export function App() {
  return (
    <AppErrorBoundary>
      <CapabilityGate>
        <HashRouter>
          <AppRoutes />
        </HashRouter>
      </CapabilityGate>
    </AppErrorBoundary>
  );
}
