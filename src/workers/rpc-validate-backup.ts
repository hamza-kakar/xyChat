/**
 * RPC input validation for backup and restore.
 */
import * as v from 'valibot';
import { RpcValidationError } from './rpc-validate';
import type { BackupRequest, RestoreDecision } from './transfer-types';

const ID = v.pipe(v.string(), v.nonEmpty(), v.maxLength(64));
/** Upper bound on chats in one request (far above any real archive). */
const MAX_CHATS = 10_000;

const SELECTION = v.object({
  chatIds: v.nullable(v.pipe(v.array(ID), v.maxLength(MAX_CHATS))),
  includeMedia: v.boolean(),
});

const BACKUP_REQUEST = v.object({
  ...SELECTION.entries,
  appName: v.pipe(v.string(), v.nonEmpty(), v.maxLength(64)),
  appVersion: v.pipe(v.string(), v.nonEmpty(), v.maxLength(32)),
});

const DECISIONS = v.pipe(
  v.array(
    v.object({
      backupChatId: ID,
      choice: v.picklist(['skip', 'new', 'replace', 'merge']),
      targetChatId: v.nullable(ID),
    }),
  ),
  v.maxLength(MAX_CHATS),
);

const FILE_NAME = v.pipe(v.string(), v.nonEmpty(), v.maxLength(255));

function parse<TSchema extends v.GenericSchema>(
  method: string,
  schema: TSchema,
  input: unknown,
): v.InferOutput<TSchema> {
  const result = v.safeParse(schema, input);
  if (!result.success) {
    throw new RpcValidationError(`${method}: ${result.issues[0].message}`);
  }
  return result.output;
}

/** Parsers for the backup and restore RPCs of db.worker. */
export const rpcBackupInput = {
  selection(
    method: string,
    input: unknown,
  ): { readonly chatIds: readonly string[] | null; readonly includeMedia: boolean } {
    return parse(method, SELECTION, input);
  },
  backupRequest(method: string, input: unknown): BackupRequest {
    return parse(method, BACKUP_REQUEST, input);
  },
  file(method: string, input: unknown): Blob {
    if (!(input instanceof Blob)) {
      throw new RpcValidationError(`${method}: expected a file`);
    }
    return input;
  },
  fileName(method: string, input: unknown): string {
    return parse(method, FILE_NAME, input);
  },
  decisions(method: string, input: unknown): readonly RestoreDecision[] {
    return parse(method, DECISIONS, input);
  },
};
