import { useEffect, useState, type ReactNode } from 'react';
import { checkCapabilities, type CapabilityId } from '../../../platform/capabilities';
import { ensureDbReady } from '../../../client/db-client';
import { en } from '../../i18n/en';
import { UnsupportedScreen } from './unsupported-screen';

interface CapabilityGateProps {
  readonly children: ReactNode;
}

interface GateFailure {
  readonly id: CapabilityId;
  readonly reason: string;
}

type GateState =
  | { readonly phase: 'checking' }
  | { readonly phase: 'ready' }
  | { readonly phase: 'unsupported'; readonly failures: readonly GateFailure[] };

/**
 * Boot gate (§12.11): first the browser capability probes, then the
 * db.worker boot (migrations + the ratified FTS5-trigram probe, ADR 0008).
 * Any failure renders the unsupported screen; never a blank page.
 */
export function CapabilityGate({ children }: CapabilityGateProps) {
  const [state, setState] = useState<GateState>({ phase: 'checking' });

  useEffect(() => {
    const state = { cancelled: false };
    // Read through a function: TS property narrowing would otherwise see
    // `cancelled` as always-false inside this closure (the cleanup assigns
    // from a different closure).
    const isCancelled = (): boolean => state.cancelled;
    const run = async (): Promise<void> => {
      const report = await checkCapabilities();
      if (isCancelled()) {
        return;
      }
      if (!report.ok) {
        setState({ phase: 'unsupported', failures: [...report.failures] });
        return;
      }
      const dbReady = await ensureDbReady();
      if (isCancelled()) {
        return;
      }
      if (!dbReady) {
        setState({
          phase: 'unsupported',
          failures: [
            {
              id: 'fts5',
              reason: 'database boot failed (unsupported engine or open error)',
            },
          ],
        });
        return;
      }
      setState({ phase: 'ready' });
    };
    void run();
    return () => {
      state.cancelled = true;
    };
  }, []);

  if (state.phase === 'checking') {
    return (
      <main className="safe-area bg-surface flex min-h-dvh items-center justify-center">
        <p aria-live="polite" className="text-text-muted">
          {en.boot.checkingCapabilities}
        </p>
      </main>
    );
  }
  if (state.phase === 'unsupported') {
    return <UnsupportedScreen failures={state.failures} />;
  }
  return children;
}
