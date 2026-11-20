import { useCallback, useReducer } from 'react';
import { useNavigate } from 'react-router';
import { en } from '../../i18n/en';
import { InstallGate } from './install-gate';
import { installGateDone } from './install-gate-state';
import { ImportPickStep } from './import-pick-step';
import { ImportConfirmStep } from './import-confirm-step';
import { ImportProgressStep } from './import-progress-step';
import { ImportReportStep } from './import-report-step';
import { ImportErrorStep } from './import-error-step';
import type { ConfirmChoices } from './import-confirm-step';
import { cancelImport, importClient, onImportProgress } from '../../../client/import-client';
import { dbClient } from '../../../client/db-client';
import type { DetectReport, ImportError } from '../../../workers/import-detect';
import type { BeginOutcome } from '../../../client/import-client';
import type { ChatId } from '../../../core/ids';

/** The §12.8 flow states. */
type ImportStep =
  | { readonly name: 'gate' }
  | { readonly name: 'pick' }
  | { readonly name: 'detecting' }
  | {
      readonly name: 'confirm';
      readonly report: DetectReport;
      readonly file: File;
      readonly suggestedTargetChatId: ChatId | null;
    }
  | {
      readonly name: 'progress';
      readonly report: DetectReport;
      readonly file: File;
      readonly confirmedTitle: string;
      readonly targetChatId: ChatId | null;
      readonly selfName: string | null;
    }
  | { readonly name: 'report'; readonly outcome: BeginOutcome }
  | { readonly name: 'error'; readonly error: ImportError };

/** Detection state for the §12.8.4 order-toggle re-run. */
type DetectState =
  | { readonly status: 'idle' }
  | { readonly status: 'running' }
  | { readonly status: 'failed'; readonly error: ImportError };

interface ImportState {
  readonly step: ImportStep;
  readonly detectState: DetectState;
}

type ImportAction =
  | { readonly type: 'gate-passed' }
  | { readonly type: 'file-picked' }
  | { readonly type: 'detect-failed'; readonly error: ImportError }
  | {
      readonly type: 'detect-done';
      readonly report: DetectReport;
      readonly file: File;
      readonly suggestedTargetChatId: ChatId | null;
    }
  | { readonly type: 'reorder-running' }
  | { readonly type: 'reorder-done'; readonly report: DetectReport }
  | {
      readonly type: 'confirm-started';
      readonly confirmedTitle: string;
      readonly targetChatId: ChatId | null;
      readonly selfName: string | null;
    }
  | { readonly type: 'begin-done'; readonly outcome: BeginOutcome }
  | { readonly type: 'begin-failed'; readonly error: ImportError }
  | { readonly type: 'back-to-pick' };

function reducer(state: ImportState, action: ImportAction): ImportState {
  switch (action.type) {
    case 'gate-passed':
      return { ...state, step: { name: 'pick' } };
    case 'file-picked':
      return { ...state, step: { name: 'detecting' } };
    case 'detect-failed':
      return { ...state, step: { name: 'error', error: action.error } };
    case 'detect-done':
      // Both the initial detection and the §12.8.4 toggle re-run end here:
      // the reorder flag clears with the new report.
      return {
        ...state,
        detectState: { status: 'idle' },
        step: {
          name: 'confirm',
          report: action.report,
          file: action.file,
          suggestedTargetChatId: action.suggestedTargetChatId,
        },
      };
    case 'reorder-running':
      return { ...state, detectState: { status: 'running' } };
    case 'reorder-done':
      return {
        ...state,
        detectState: { status: 'idle' },
        step: state.step.name === 'confirm' ? { ...state.step, report: action.report } : state.step,
      };
    case 'confirm-started':
      return {
        ...state,
        step:
          state.step.name === 'confirm'
            ? {
                name: 'progress',
                report: state.step.report,
                file: state.step.file,
                confirmedTitle: action.confirmedTitle,
                targetChatId: action.targetChatId,
                selfName: action.selfName,
              }
            : state.step,
      };
    case 'begin-done':
      return { ...state, step: { name: 'report', outcome: action.outcome } };
    case 'begin-failed':
      return { ...state, step: { name: 'error', error: action.error } };
    case 'back-to-pick':
      return { ...state, step: { name: 'pick' }, detectState: { status: 'idle' } };
  }
}

interface RenderDeps {
  readonly state: ImportState;
  readonly dispatch: (action: ImportAction) => void;
  readonly navigate: (path: string) => void;
  readonly runDetect: (file: File, dateOrderOverride?: 'DMY' | 'MDY') => void;
  readonly startImport: (report: DetectReport, file: File, choices: ConfirmChoices) => void;
}

/** Renders the current §12.8 step (pure: deps injected, §18.4). */
function renderStep(deps: RenderDeps) {
  const { state, dispatch, navigate, runDetect, startImport } = deps;

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

/** The #/import screen (§12.8): install gate → pick → detect → confirm →
 * progress → report. Each step is its own component; this container owns
 * the state machine and the client calls. */
export function ImportScreen() {
  const [state, dispatch] = useReducer(reducer, {
    step: installGateDone() ? { name: 'pick' } : { name: 'gate' },
    detectState: { status: 'idle' },
  });
  const navigate = useNavigate();

  const runDetect = useCallback((file: File, dateOrderOverride?: 'DMY' | 'MDY'): void => {
    dispatch({ type: 'reorder-running' });
    void importClient
      .detect(file, file.name, navigator.language, dateOrderOverride)
      .then((outcome) => {
        if ('code' in outcome) {
          dispatch({ type: 'detect-failed', error: outcome });
        } else {
          dispatch({
            type: 'detect-done',
            report: outcome.report,
            file,
            suggestedTargetChatId: outcome.suggestedTargetChatId,
          });
        }
      })
      .catch((error: unknown) => {
        dispatch({ type: 'detect-failed', error: { code: 'INTERNAL', detail: String(error) } });
      });
  }, []);

  const startImport = useCallback(
    (report: DetectReport, file: File, choices: ConfirmChoices): void => {
      dispatch({
        type: 'confirm-started',
        confirmedTitle: choices.confirmedTitle,
        targetChatId: choices.targetChatId,
        selfName: choices.selfName,
      });
      const unsubscribe = onImportProgress(() => undefined);
      void importClient
        .begin({
          file,
          fileName: file.name,
          format: report.format,
          title: choices.confirmedTitle,
          isGroup: report.isGroup,
          targetChatId: choices.targetChatId,
        })
        .then(async (outcome) => {
          unsubscribe();
          if ('code' in outcome) {
            dispatch({ type: 'begin-failed', error: outcome });
            return;
          }
          if (choices.selfName !== null) {
            const participants = await dbClient.getParticipants(outcome.chatId);
            const self = participants.find(
              (participant) => participant.displayName === choices.selfName,
            );
            if (self !== undefined) {
              await dbClient.setSelf(outcome.chatId, self.id);
            }
          }
          dispatch({ type: 'begin-done', outcome });
        })
        .catch((error: unknown) => {
          unsubscribe();
          dispatch({ type: 'begin-failed', error: { code: 'INTERNAL', detail: String(error) } });
        });
    },
    [],
  );

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
