import { useEffect, useState, type ReactNode } from 'react';
import { checkCapabilities, type CapabilityReport } from '../../../platform/capabilities';
import { en } from '../../i18n/en';
import { UnsupportedScreen } from './unsupported-screen';

interface CapabilityGateProps {
  readonly children: ReactNode;
}

type GateState =
  | { readonly phase: 'checking' }
  | { readonly phase: 'ready' }
  | { readonly phase: 'unsupported'; readonly report: CapabilityReport };

/**
 * Runs the boot capability check (AGENTS.md §12.11) and renders children only
 * when every required browser feature is available.
 */
export function CapabilityGate({ children }: CapabilityGateProps) {
  const [state, setState] = useState<GateState>({ phase: 'checking' });

  useEffect(() => {
    let cancelled = false;
    void checkCapabilities().then((report) => {
      if (cancelled) {
        return;
      }
      setState(report.ok ? { phase: 'ready' } : { phase: 'unsupported', report });
    });
    return () => {
      cancelled = true;
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
    return <UnsupportedScreen failures={state.report.failures} />;
  }
  return children;
}
