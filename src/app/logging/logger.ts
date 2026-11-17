/**
 * Local-only structured logger (AGENTS.md §18.7). Entries carry a stable code
 * and a small structured payload of primitives — never message content, names
 * or file names. A fixed-size ring buffer keeps the last entries in memory
 * for the Diagnostics screen; persistence of warn/error entries to the
 * database arrives with milestone M2.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  readonly timestamp: number;
  readonly level: LogLevel;
  readonly code: string;
  readonly data: Readonly<Record<string, number | string | boolean | null>>;
}

const RING_BUFFER_LIMIT = 1000;

const entries: LogEntry[] = [];
const listeners = new Set<() => void>();

function push(level: LogLevel, code: string, data: LogEntry['data']): void {
  const entry: LogEntry = { timestamp: Date.now(), level, code, data };
  entries.push(entry);
  if (entries.length > RING_BUFFER_LIMIT) {
    entries.shift();
  }
  if (import.meta.env.DEV) {
    // Console output is allowed only in dev builds, through this sink.
    const sink = level === 'debug' ? console.debug.bind(console) : console[level].bind(console);
    sink(`[${level}] ${code}`, data);
  }
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Snapshot of the current ring buffer, oldest first. */
function recent(): readonly LogEntry[] {
  return [...entries];
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
} as const;
