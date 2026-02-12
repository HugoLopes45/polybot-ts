/**
 * Result<T, E> — Rust-style error handling for domain operations.
 *
 * No exceptions in domain code. All fallible operations return Result.
 * Use ok()/err() factories and the combinators for safe chaining.
 */

/** Discriminated union for fallible operations -- `ok: true` carries a value, `ok: false` carries an error. */
export type Result<T, E = Error> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly error: E };

// ── Factories ────────────────────────────────────────────────────────

/** Create a successful Result wrapping the given value. */
export function ok<T>(value: T): Result<T, never> {
	return { ok: true, value };
}

/** Create a failed Result wrapping the given error. */
export function err<E>(error: E): Result<never, E> {
	return { ok: false, error };
}

// ── Combinators ──────────────────────────────────────────────────────

/** Transform the success value of a Result, leaving errors untouched. */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
	return result.ok ? ok(fn(result.value)) : result;
}

/** Transform the error value of a Result, leaving successes untouched. */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
	return result.ok ? result : err(fn(result.error));
}

/** Chain a fallible operation on the success value; short-circuits on error. */
export function flatMap<T, U, E>(
	result: Result<T, E>,
	fn: (value: T) => Result<U, E>,
): Result<U, E> {
	return result.ok ? fn(result.value) : result;
}

/** Extract the success value or throw the error. Use at system boundaries only. */
export function unwrap<T, E>(result: Result<T, E>): T {
	if (result.ok) return result.value;
	throw result.error instanceof Error ? result.error : new Error(String(result.error));
}

/** Extract the success value or return the provided fallback on error. */
export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
	return result.ok ? result.value : fallback;
}

/** Type guard: narrows a Result to its success variant. */
export function isOk<T, E>(
	result: Result<T, E>,
): result is { readonly ok: true; readonly value: T } {
	return result.ok;
}

/** Type guard: narrows a Result to its error variant. */
export function isErr<T, E>(
	result: Result<T, E>,
): result is { readonly ok: false; readonly error: E } {
	return !result.ok;
}

// ── Try wrapper for boundary code ────────────────────────────────────

/** Wrap a synchronous function call in a Result, catching any thrown errors. */
export function tryCatch<T>(fn: () => T): Result<T, Error> {
	try {
		return ok(fn());
	} catch (e) {
		return err(e instanceof Error ? e : new Error(String(e)));
	}
}

/** Wrap an async function call in a Result, catching any thrown errors. */
export async function tryCatchAsync<T>(fn: () => Promise<T>): Promise<Result<T, Error>> {
	try {
		return ok(await fn());
	} catch (e) {
		return err(e instanceof Error ? e : new Error(String(e)));
	}
}
