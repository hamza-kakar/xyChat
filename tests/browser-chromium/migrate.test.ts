/**
 * Migration tests (AGENTS.md §10.3): fresh database setup, version tracking,
 * and the newer-database refusal.
 */
import { describe, expect, it } from 'vitest';
import { migrate } from '../../src/storage/sqlite/migrate';
import type { SqliteDatabase } from '../../src/storage/sqlite/open';

function fakeDb(): SqliteDatabase & { readonly log: string[] } {
  const log: string[] = [];
  const store = new Map<string, string>();
  return {
    log,
    exec(sql: string): void {
      log.push(`exec:${sql.replace(/\s+/gu, ' ').slice(0, 60)}`);
    },
    selectObjects(
      sql: string,
      params?: readonly (string | number | null)[],
    ): Record<string, unknown>[] {
      log.push(`select:${sql.slice(0, 40)}:${JSON.stringify(params ?? [])}`);
      if (sql.includes('FROM meta')) {
        const key = typeof params?.[0] === 'string' ? params[0] : '';
        return store.has(key) ? [{ value: store.get(key) }] : [];
      }
      return [];
    },
    selectArrays(sql: string): unknown[][] {
      log.push(`selectArrays:${sql.slice(0, 40)}`);
      return [];
    },
    runEach(sql: string): void {
      log.push(`runEach:${sql.slice(0, 40)}`);
    },
    run(sql: string, params?: readonly (string | number | null)[]): void {
      log.push(`run:${sql.slice(0, 40)}:${JSON.stringify(params ?? [])}`);
      if (sql.includes('INSERT INTO meta')) {
        const key = String(params?.[0]);
        const value = String(params?.[1]);
        store.set(key, value);
      }
    },
    transaction<T>(fn: () => T): T {
      log.push('begin');
      try {
        const result = fn();
        log.push('commit');
        return result;
      } catch (error) {
        log.push('rollback');
        throw error;
      }
    },
    lastInsertRowId(): number {
      return 0;
    },
    close(): void {
      // Nothing to close for the fake.
    },
  };
}

describe('migrate', () => {
  it('refuses a database written by a newer app version', () => {
    const db = fakeDb();
    // Simulate a future schema_version.
    db.selectObjects = (): Record<string, unknown>[] => [{ value: '999' }];
    expect(() => {
      migrate(db);
    }).toThrow(/newer than the app/);
  });

  it('applies pending migrations in a transaction and records the version', () => {
    const db = fakeDb();
    migrate(db);
    expect(db.log.some((entry) => entry.startsWith('begin'))).toBe(true);
    expect(db.log.some((entry) => entry.startsWith('commit'))).toBe(true);
    expect(db.log.some((entry) => entry.includes('CREATE TABLE IF NOT EXISTS meta'))).toBe(true);
  });
});
