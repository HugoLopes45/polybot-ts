/**
 * Validation wrapper — thin abstraction over Zod that returns Result<T, ValidationError>.
 *
 * Domain code uses this instead of importing Zod directly .
 * Re-exports `z` so schemas can be built without a direct zod dependency.
 */

import { z } from "zod";
import { TradingError } from "../../shared/errors.js";
import { err, ok } from "../../shared/result.js";
import type { Result } from "../../shared/result.js";

/**
 * Zod schema builder re-export — intentional abstraction leak.
 *
 * Wrapping `safeParse` into `Result<T, ValidationError>` is straightforward,
 * but wrapping schema *definition* (z.object, z.string, z.array, etc.) would
 * require building a custom schema DSL with no practical benefit. Domain code
 * imports `{ z }` from here rather than from "zod" directly, so the dependency
 * is still centralized — if Zod is ever replaced, schema definitions must be
 * rewritten but the migration surface is a single import path.
 */
export { z };

/** A single validation failure with the path to the invalid field and a message. */
export interface ValidationIssue {
	readonly path: readonly (string | number)[];
	readonly message: string;
}

/** Non-retryable error containing one or more validation issues. */
export class ValidationError extends TradingError {
	readonly issues: readonly ValidationIssue[];

	constructor(message: string, issues: readonly ValidationIssue[]) {
		super(message, "VALIDATION_FAILED", "non_retryable");
		this.name = "ValidationError";
		this.issues = issues;
	}
}

/** Validate data against a Zod schema, returning a Result instead of throwing. */
export function validate<T>(schema: z.ZodType<T>, data: unknown): Result<T, ValidationError> {
	const result = schema.safeParse(data);
	if (result.success) {
		return ok(result.data);
	}
	const issues: ValidationIssue[] = result.error.issues.map((i) => ({
		path: i.path.filter((p): p is string | number => typeof p !== "symbol"),
		message: i.message,
	}));
	return err(new ValidationError("Validation failed", issues));
}
