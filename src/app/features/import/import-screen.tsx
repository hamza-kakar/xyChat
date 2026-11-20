/**
 * The #/import screen (AGENTS.md §12.8): install gate → pick → detect →
 * confirm → progress → report. The state machine and client calls live in
 * use-import-flow.ts (§18.4); this component renders only.
 */
import { useNavigate } from 'react-router';
import { en } from '../../i18n/en';
import { InstallGate } from './install-gate';
import { ImportPickStep } from './import-pick-step';
import { ImportConfirmStep } from './import-confirm-step';
import { ImportProgressStep } from './import-progress-step';
import { ImportReportStep } from './import-report-step';
import { ImportErrorStep } from './import-error-step';
import { cancelImport } from '../../../client/import-client';
import { requestPersistentStorage } from '../../../platform/persistence';
import { installGateDone } from './install-gate-state';
import { useImportFlow } from './use-import-flow';

/** Props for the pure step renderer. */
interface RenderDeps {
  readonly state: ReturnType<typeof useImportFlow>['state'];
  readonly dispatch: (action: Parameters<ReturnType<typeof useImportFlow>['dispatch']>[0]) => void;
  readonly runDetect: ReturnType<typeof useImportFlow>['runDetect'];
  readonly startImport: ReturnType<typeof useImportFlow>['startImport'];
  readonly navigate: (path: string) => void;
}

/** Renders the current §12.8 step (pure: deps injected, §18.4). */
function renderStep(deps: RenderDeps) {
  const { state, dispatch, runDetect, startImport, navigate } = deps;
  switch (state.step.name) {
    case 'gate':
      return (
        <InstallGate
          onProceed={() => {
            installGateDone(true);
            dispatch({ type: 'gate-passed' });
          }}
        />
      );
    case 'pick':
      return (
        <ImportPickStep
          onPicked={(file) => {
            runDetect(file);
          }}
        />
      );
    case 'detecting':
      return <p className="text-text-muted safe-area p-6 text-center">{en.import.detecting}</p>;
    case 'confirm': {
      const { report, file, suggestedTargetChatId } = state.step;
      return (
        <ImportConfirmStep
          report={report}
          file={file}
          suggestedTargetChatId={suggestedTargetChatId}
          reorderRunning={state.detectState.status === 'running'}
          onDateOrder={(order) => {
            runDetect(file, order);
          }}
          onStart={(r, f, choices) => {
            startImport(r, f, choices);
          }}
          onBack={() => {
            dispatch({ type: 'back-to-pick' });
          }}
        />
      );
    }
    case 'progress':
      return (
        <ImportProgressStep
          onCancel={() => {
            cancelImport();
            dispatch({ type: 'back-to-pick' });
          }}
        />
      );
    case 'report': {
      const { outcome } = state.step;
      // §22 M3: request persistent storage after a successful import
      // (repeated calls are no-ops once granted).
      void requestPersistentStorage();
      return (
        <ImportReportStep
          outcome={outcome}
          onOpenChat={() => {
            navigate(`/chat/${outcome.chatId}`);
          }}
        />
      );
    }
    case 'error': {
      const { error } = state.step;
      return (
        <ImportErrorStep
          error={error}
          onRetry={() => {
            dispatch({ type: 'back-to-pick' });
          }}
        />
      );
    }
  }
}

export function ImportScreen() {
  const { state, dispatch, runDetect, startImport } = useImportFlow();
  const navigate = useNavigate();
  return renderStep({
    state,
    dispatch,
    navigate: (path) => {
      void navigate(path);
    },
    runDetect,
    startImport,
  });
}
