/**
 * RPC input validation for app settings:
 * PINs, the auto-lock delay and persisted log entries.
 */
import * as v from 'valibot';
import { AUTO_LOCK_MINUTES, isValidPin, type AutoLockMinutes } from '../core/app-lock';
import { PersistedLogsSchema, type PersistedLogEntry } from '../storage/sqlite/persisted-logs';
import { RpcValidationError } from './rpc-validate';

const PIN = v.pipe(v.string(), v.check(isValidPin, 'PIN must be 4–8 digits'));
/** A PIN being checked may have any short shape: a wrong one just fails. */
const PIN_ATTEMPT = v.pipe(v.string(), v.maxLength(64));
const CHANGE_PIN = v.object({ current: v.nullable(PIN_ATTEMPT), next: v.nullable(PIN) });

function parse<TSchema extends v.GenericSchema>(
  method: string,
  schema: TSchema,
  input: unknown,
): v.InferOutput<TSchema> {
  const result = v.safeParse(schema, input);
  if (!result.success) {
    // Messages name the rule only: PIN digits never reach logs.
    throw new RpcValidationError(`${method}: ${result.issues[0].message}`);
  }
  return result.output;
}

/** Parsers for the settings RPCs of db.worker. */
export const rpcSettingsInput = {
  pinAttempt(method: string, input: unknown): string {
    return parse(method, PIN_ATTEMPT, input);
  },
  changePin(
    method: string,
    input: unknown,
  ): { readonly current: string | null; readonly next: string | null } {
    return parse(method, CHANGE_PIN, input);
  },
  autoLockMinutes(method: string, input: unknown): AutoLockMinutes {
    return parse(method, v.picklist(AUTO_LOCK_MINUTES), input);
  },
  logs(method: string, input: unknown): readonly PersistedLogEntry[] {
    return parse(method, PersistedLogsSchema, input);
  },
};
