/**
 * Validation wrapper — thin abstraction over Zod that returns Result<T, ValidationError>.
 *
 * Domain code uses this instead of importing Zod directly (Rule 14).
 * Re-exports `z` so schemas can be built without a direct zod dependency.
 */

import { z } from "zod";
import { TradingError } from "../../shared/errors.js";
import { err, ok } from "../../shared/result.js";
import type { Result } from "../../shared/result.js";

/**
 * Zod library re-export for building validation schemas.
 * Domain code uses this to create schemas without importing zod directly (Rule 14).
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
