/**
 * The #/import screen (AGENTS.md §12.8): install gate → pick → detect →
 * confirm → progress → report. The state machine and client calls live in
 * hooks/use-import-flow.ts (§18.4); this component renders only.
 */
import { useNavigate } from 'react-router';
import { en } from '../../i18n/en';
import { InstallGate } from './install-gate';
import { ImportPickStep } from './import-pick-step';
import { ImportConfirmStep } from './import-confirm-step';
import { ImportProgressStep } from './import-progress-step';
import { ImportReportStep } from './import-report-step';
import { ImportErrorStep } from './import-error-step';
import { installGateDone } from './install-gate-state';
import { useImportFlow } from './hooks/use-import-flow';

/** Props for the pure step renderer. */
interface RenderDeps {
  readonly state: ReturnType<typeof useImportFlow>['state'];
  readonly dispatch: (action: Parameters<ReturnType<typeof useImportFlow>['dispatch']>[0]) => void;
  readonly runDetect: ReturnType<typeof useImportFlow>['runDetect'];
  readonly startImport: ReturnType<typeof useImportFlow>['startImport'];
  readonly cancel: ReturnType<typeof useImportFlow>['cancel'];
  readonly navigate: (path: string) => void;
}

/** Renders the current §12.8 step (pure: deps injected, §18.4). */
function renderStep(deps: RenderDeps) {
  const { state, dispatch, runDetect, startImport, cancel, navigate } = deps;
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
      return <ImportProgressStep onCancel={cancel} isCancelling={state.step.isCancelling} />;
    case 'report': {
      const { outcome, finishedBeforeCancel } = state.step;
      return (
        <ImportReportStep
          outcome={outcome}
          finishedBeforeCancel={finishedBeforeCancel}
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
  const { state, dispatch, runDetect, startImport, cancel } = useImportFlow();
  const navigate = useNavigate();
  return renderStep({
    state,
    dispatch,
    navigate: (path) => {
      void navigate(path);
    },
    runDetect,
    startImport,
    cancel,
  });
}
