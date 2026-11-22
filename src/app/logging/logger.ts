/**
 * Local-only structured logger (AGENTS.md §18.7). Entries carry a stable code
 * and a small structured payload of primitives — never message content, names
 * or file names. A fixed-size ring buffer keeps the last entries in memory
 * for the Diagnostics screen; `log-persistence.ts` keeps the last warn/error
 * entries in the database.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  readonly timestamp: number;
  readonly level: LogLevel;
  readonly code: string;
  readonly data: Readonly<Record<string, number | string | boolean | null>>;
}

const RING_BUFFER_LIMIT = 1000;

let entries: readonly LogEntry[] = [];
/** Listeners get each new entry, or null when the buffer was cleared. */
type LogListener = (entry: LogEntry | null) => void;
const listeners = new Set<LogListener>();

function push(level: LogLevel, code: string, data: LogEntry['data']): void {
  const entry: LogEntry = { timestamp: Date.now(), level, code, data };
  // A fresh array per write keeps snapshots stable for useSyncExternalStore.
  entries = [...entries.slice(entries.length >= RING_BUFFER_LIMIT ? 1 : 0), entry];
  if (import.meta.env.DEV) {
    // Console output is allowed only in dev builds, through this sink.
    const sink = level === 'debug' ? console.debug.bind(console) : console[level].bind(console);
    sink(`[${level}] ${code}`, data);
  }
  for (const listener of listeners) {
    listener(entry);
  }
}

function subscribe(listener: LogListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Snapshot of the current ring buffer, oldest first (the same array
 * until the next write). */
function recent(): readonly LogEntry[] {
  return entries;
}

/** Empties the ring buffer (Diagnostics → Clear). */
function clear(): void {
  entries = [];
  for (const listener of listeners) {
    listener(null);
  }
}

export const logger = {
  debug: (code: string, data: LogEntry['data'] = {}): void => {
    push('debug', code, data);
  },
  info: (code: string, data: LogEntry['data'] = {}): void => {
    push('info', code, data);
  },
  warn: (code: string, data: LogEntry['data'] = {}): void => {
    push('warn', code, data);
  },
  error: (code: string, data: LogEntry['data'] = {}): void => {
    push('error', code, data);
  },
  recent,
  subscribe,
  clear,
} as const;
