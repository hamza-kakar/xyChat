import { QueryClientProvider } from '@tanstack/react-query';
import { HashRouter } from 'react-router';
import { AppRoutes } from './routes';
import { AppErrorBoundary } from './features/shell/app-error-boundary';
import { CapabilityGate } from './features/shell/capability-gate';
import { createAppQueryClient } from './queries/query-client';

const queryClient = createAppQueryClient();

/** App root: error boundary outermost, then the capability gate, then the
 * query client and routes. */
export function App() {
  return (
    <AppErrorBoundary>
      <CapabilityGate>
        <QueryClientProvider client={queryClient}>
          <HashRouter>
            <AppRoutes />
          </HashRouter>
        </QueryClientProvider>
      </CapabilityGate>
    </AppErrorBoundary>
  );
}
