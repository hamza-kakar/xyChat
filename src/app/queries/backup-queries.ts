/**
 * Backup and restore queries and mutations (AGENTS.md §10.6, §18.4). The
 * progress and cancel hooks travel with the mutation variables and run on
 * the main thread through a Comlink proxy.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dbClient, type RestoreDecisionInput, type TransferProgress } from '../../client/db-client';
import { asChatId } from '../../core/ids';
import { readStoredFile } from '../../platform/media-url';
import { useInvalidateImportedChat } from './chat-queries';
import { queryKeys } from './keys';
import { logger } from '../logging/logger';

/** Progress and cancellation for a running backup or restore. */
export interface TransferCallbacks {
  readonly onProgress: (event: TransferProgress) => void;
  readonly isCancelled: () => boolean;
}

/** The estimated size of a backup of one chat (or all, `null`). */
export function useBackupEstimate(chatId: string | null, includeMedia: boolean) {
  return useQuery({
    queryKey: queryKeys.backupEstimate(chatId, includeMedia),
    queryFn: () =>
      dbClient.estimateBackup({ chatIds: chatId === null ? null : [chatId], includeMedia }),
  });
}

/** Makes a backup archive. */
export function useCreateBackup() {
  return useMutation({
    mutationFn: (variables: {
      readonly chatId: string | null;
      readonly includeMedia: boolean;
      readonly appName: string;
      readonly appVersion: string;
      readonly callbacks: TransferCallbacks;
    }) =>
      dbClient.createBackup(
        {
          chatIds: variables.chatId === null ? null : [variables.chatId],
          includeMedia: variables.includeMedia,
          appName: variables.appName,
          appVersion: variables.appVersion,
        },
        variables.callbacks,
      ),
    onSuccess: (outcome) => {
      if (outcome.ok) {
        logger.info('backup.created', {
          chats: outcome.value.chatCount,
          mediaFiles: outcome.value.mediaFiles,
          bytes: outcome.value.bytes,
        });
      } else {
        logger.warn('backup.failed', { reason: outcome.error.code });
      }
    },
  });
}

/** A finished backup archive, read from OPFS for sharing or saving. */
export function useBackupFile(path: string) {
  return useQuery({
    queryKey: queryKeys.backupFile(path),
    queryFn: () => readStoredFile(path),
    gcTime: 0,
  });
}

/** Checks a picked backup and previews its chats. */
export function useInspectBackup() {
  return useMutation({
    mutationFn: (file: File) => dbClient.inspectBackup(file),
    onSuccess: (outcome) => {
      if (!outcome.ok) {
        logger.warn('restore.rejected', { reason: outcome.error.code });
      }
    },
  });
}

/** Restores the chosen chats; every restored or replaced chat refreshes. */
export function useRestoreBackup() {
  const client = useQueryClient();
  const invalidateChat = useInvalidateImportedChat();
  return useMutation({
    mutationFn: (variables: {
      readonly file: File;
      readonly decisions: readonly RestoreDecisionInput[];
      readonly callbacks: TransferCallbacks;
    }) =>
      dbClient.restoreBackup(
        { file: variables.file, fileName: variables.file.name, decisions: variables.decisions },
        variables.callbacks,
      ),
    onSuccess: async (outcome) => {
      client.removeQueries({ queryKey: queryKeys.backupEstimates() });
      if (outcome.ok) {
        logger.info('restore.done', { chats: outcome.value.length });
        await Promise.all(outcome.value.map((chat) => invalidateChat(asChatId(chat.chatId))));
      } else {
        logger.warn('restore.failed', { reason: outcome.error.code });
      }
    },
  });
}
