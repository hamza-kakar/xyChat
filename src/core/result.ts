/**
 * A discriminated result type for expected failures.
 * Expected failures — bad input, unsupported format, quota exceeded, user
 * cancel — are returned as `Err` with a typed error code; exceptions are
 * reserved for bugs and unexpected states.
 *
 * @example
 * function parse(input: string): Result<number, 'NOT_A_NUMBER'> {
 *   const value = Number(input);
 *   return Number.isNaN(value) ? err('NOT_A_NUMBER') : ok(value);
 * }
 */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}
export type Result<T, E> = Ok<T> | Err<E>;

/** Wraps a success value. */
export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });

/** Wraps an expected failure with a typed error code. */
export const err = <E>(error: E): Err<E> => ({ ok: false, error });
