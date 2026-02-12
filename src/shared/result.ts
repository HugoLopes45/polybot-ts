/**
 * Result<T, E> — Rust-style error handling for domain operations.
 *
 * No exceptions in domain code. All fallible operations return Result.
 * Use ok()/err() factories and the combinators for safe chaining.
 */

export type Result<T, E = Error> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly error: E };

// ── Factories ────────────────────────────────────────────────────────

export function ok<T>(value: T): Result<T, never> {
	return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
	return { ok: false, error };
}

// ── Combinators ──────────────────────────────────────────────────────

export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
	return result.ok ? ok(fn(result.value)) : result;
}

export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
	return result.ok ? result : err(fn(result.error));
}

export function flatMap<T, U, E>(
	result: Result<T, E>,
	fn: (value: T) => Result<U, E>,
): Result<U, E> {
	return result.ok ? fn(result.value) : result;
}

export function unwrap<T, E>(result: Result<T, E>): T {
	if (result.ok) return result.value;
	throw result.error instanceof Error ? result.error : new Error(String(result.error));
}

export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
	return result.ok ? result.value : fallback;
}

export function isOk<T, E>(
	result: Result<T, E>,
): result is { readonly ok: true; readonly value: T } {
	return result.ok;
}

export function isErr<T, E>(
	result: Result<T, E>,
): result is { readonly ok: false; readonly error: E } {
	return !result.ok;
}

// ── Try wrapper for boundary code ────────────────────────────────────

export function tryCatch<T>(fn: () => T): Result<T, Error> {
	try {
		return ok(fn());
	} catch (e) {
		return err(e instanceof Error ? e : new Error(String(e)));
	}
}

export async function tryCatchAsync<T>(fn: () => Promise<T>): Promise<Result<T, Error>> {
	try {
		return ok(await fn());
	} catch (e) {
		return err(e instanceof Error ? e : new Error(String(e)));
	}
}
