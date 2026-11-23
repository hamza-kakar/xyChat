import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { HashRouter } from 'react-router';
import { AppRoutes } from './routes';
import { AppErrorBoundary } from './features/shell/app-error-boundary';
import { CapabilityGate } from './features/shell/capability-gate';
import { UpdatePrompt } from './features/shell/update-prompt';
import { LockGate } from './features/lock';
import { installLogPersistence } from './logging/log-persistence';
import { createAppQueryClient } from './queries/query-client';

const queryClient = createAppQueryClient();

/** Keeps warn/error log entries across reloads once the database is up. */
function LogPersistence() {
  useEffect(() => installLogPersistence(), []);
  return null;
}

/** App root: error boundary outermost, then the capability gate, then the
 * query client, the app lock, routes and the update prompt. */
export function App() {
  return (
    <AppErrorBoundary>
      <CapabilityGate>
        <LogPersistence />
        <QueryClientProvider client={queryClient}>
          <LockGate>
            <HashRouter>
              <AppRoutes />
            </HashRouter>
            <UpdatePrompt />
          </LockGate>
        </QueryClientProvider>
      </CapabilityGate>
    </AppErrorBoundary>
  );
}
