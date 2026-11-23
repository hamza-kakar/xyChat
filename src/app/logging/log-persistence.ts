/**
 * Keeps the last warn/error log entries across reloads:
 * entries from earlier sessions are loaded at boot for the Diagnostics
 * viewer, and new warn/error entries are written back, debounced, through
 * db.worker. Entries are codes plus small payloads only.
 */
import { dbClient, type PersistedLogEntryView } from '../../client/db-client';
import { logger, type LogEntry } from './logger';

/** Entries kept in the database. */
const PERSISTED_LIMIT = 200;
/** Quiet time before a batch of new entries is written. */
const SAVE_DEBOUNCE_MS = 2000;
const MAX_CODE_LENGTH = 64;
const MAX_TEXT_LENGTH = 400;
const MAX_FIELD_NAME_LENGTH = 32;
const MAX_FIELDS = 16;
/** Calls that persistence makes itself: logging their failures again would
 * schedule another save, forever. */
const OWN_METHODS: ReadonlySet<unknown> = new Set(['listPersistedLogs', 'savePersistedLogs']);

/** The database side, injectable for tests. */
export interface LogStore {
  readonly load: () => Promise<readonly PersistedLogEntryView[]>;
  readonly save: (entries: readonly PersistedLogEntryView[]) => Promise<void>;
}

const defaultStore: LogStore = {
  load: () => dbClient.listPersistedLogs(),
  save: (entries) => dbClient.savePersistedLogs(entries),
};

let earlier: readonly PersistedLogEntryView[] = [];
let session: PersistedLogEntryView[] = [];
const listeners = new Set<() => void>();
let activeStore: LogStore = defaultStore;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
/** Bumped by a clear, so a load still in flight can't bring entries back. */
let generation = 0;

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** Fits an entry to the stored shape (bounded code, fields and text). */
function toPersisted(entry: LogEntry, level: 'warn' | 'error'): PersistedLogEntryView {
  const data: Record<string, number | string | boolean | null> = {};
  for (const [key, value] of Object.entries(entry.data).slice(0, MAX_FIELDS)) {
    data[key.slice(0, MAX_FIELD_NAME_LENGTH)] =
      typeof value === 'string' ? value.slice(0, MAX_TEXT_LENGTH) : value;
  }
  return {
    timestamp: Math.max(0, Math.trunc(entry.timestamp)),
    level,
    code: entry.code.slice(0, MAX_CODE_LENGTH),
    data,
  };
}

function scheduleSave(): void {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
  }
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const toSave = [...earlier, ...session].slice(-PERSISTED_LIMIT);
    // A failed save is logged by the RPC sink; that entry is not saved again.
    activeStore.save(toSave).catch(() => undefined);
  }, SAVE_DEBOUNCE_MS);
}

function onEntry(entry: LogEntry | null): void {
  if (entry === null || (entry.level !== 'warn' && entry.level !== 'error')) {
    return;
  }
  if (entry.code === 'rpc.failed' && OWN_METHODS.has(entry.data['method'])) {
    return;
  }
  session = [...session.slice(-(PERSISTED_LIMIT - 1)), toPersisted(entry, entry.level)];
  scheduleSave();
}

/**
 * Starts persistence: loads earlier entries and saves new warn/error ones.
 *
 * @param store The database side (defaults to db.worker).
 * @returns A function that stops listening (tests).
 */
export function installLogPersistence(store: LogStore = defaultStore): () => void {
  activeStore = store;
  const unsubscribe = logger.subscribe(onEntry);
  const loadGeneration = generation;
  store
    .load()
    .then((loaded) => {
      if (loadGeneration === generation) {
        earlier = loaded;
        notify();
      }
    })
    .catch(() => undefined);
  return () => {
    unsubscribe();
    if (saveTimer !== null) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    earlier = [];
    session = [];
  };
}

/** Warn/error entries from earlier sessions, oldest first. */
export function earlierLogEntries(): readonly PersistedLogEntryView[] {
  return earlier;
}

/** Subscribes to changes of {@link earlierLogEntries}. */
export function subscribeEarlierLogs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Clears every log: this session's buffer and the stored entries. */
export async function clearAllLogs(): Promise<void> {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  generation += 1;
  earlier = [];
  session = [];
  logger.clear();
  notify();
  await activeStore.save([]);
}
