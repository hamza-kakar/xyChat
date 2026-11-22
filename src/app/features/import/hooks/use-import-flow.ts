/**
 * Import flow hook (AGENTS.md §18.4): owns the §12.8 state
 * machine and the client calls — components render state, they never call
 * RPC clients directly. setSelf failures are tolerated: the commit already
 * succeeded, so the flow still reaches the report (§12.8.6) and the failure
 * is only logged.
 */
import { useCallback, useReducer } from 'react';
import { installGateDone } from '../install-gate-state';
import { isStoragePersisted, requestPersistentStorage } from '../../../../platform/persistence';
import { cancelImport, importClient, onImportProgress } from '../../../../client/import-client';
import { dbClient } from '../../../../client/db-client';
import type { DetectReport, ImportError } from '../../../../workers/import-detect';
import type { BeginOutcome } from '../../../../client/import-client';
import type { ChatId } from '../../../../core/ids';
import type { ConfirmChoices } from '../import-confirm-step';

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

/** Owns the import state machine; ImportScreen renders only. */
export function useImportFlow() {
  const [state, dispatch] = useReducer(reducer, {
    step: installGateDone() ? { name: 'pick' } : { name: 'gate' },
    detectState: { status: 'idle' },
  });

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
        dispatch({
          type: 'detect-failed',
          error: { code: 'INTERNAL', detail: errorNameOf(error) },
        });
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
          // §12.9: ask for persistent storage after a successful import,
          // once, and only while the origin doesn't already have it.
          void requestPersistenceIfNeeded();

          // §12.8.4: persist the self choice; a failure here must not fail
          // the import — the commit already succeeded.
          if (choices.selfName !== null) {
            try {
              const participants = await dbClient.getParticipants(outcome.chatId);
              const self = participants.find(
                (participant) => participant.displayName === choices.selfName,
              );
              if (self !== undefined) {
                await dbClient.setSelf(outcome.chatId, self.id);
              }
            } catch {
              // Logged through the rpc sink; the import stays successful.
            }
          }
          dispatch({ type: 'begin-done', outcome });
        })
        .catch((error: unknown) => {
          unsubscribe();
          dispatch({
            type: 'begin-failed',
            error: { code: 'INTERNAL', detail: errorNameOf(error) },
          });
        });
    },
    [],
  );

  // Cancel only signals the worker. The screen moves when begin() answers
  // CANCELLED (after the §9.3 rollback), so it never flashes the picker
  // and then jumps to the cancelled message.
  const cancel = useCallback((): void => {
    cancelImport();
  }, []);

  return { state, dispatch, runDetect, startImport, cancel };
}

/** Requests persistent storage unless the origin already holds it. */
async function requestPersistenceIfNeeded(): Promise<void> {
  if (!(await isStoragePersisted())) {
    await requestPersistentStorage();
  }
}

/** Diagnostics keep only the error class name, never its text (§15.4). */
function errorNameOf(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown error';
}
