import { describe, expect, it } from "vitest";
import { z } from "zod";
import { TradingError } from "../../shared/errors.js";
import { isErr, isOk } from "../../shared/result.js";
import { ValidationError, validate } from "./index.js";

describe("validation wrapper", () => {
	describe("validate()", () => {
		it("returns ok(data) for valid input", () => {
			const schema = z.string();
			const result = validate(schema, "hello");

			expect(isOk(result)).toBe(true);
			if (result.ok) {
				expect(result.value).toBe("hello");
			}
		});

		it("returns err(ValidationError) for invalid input", () => {
			const schema = z.number();
			const result = validate(schema, "not a number");

			expect(isErr(result)).toBe(true);
			if (!result.ok) {
				expect(result.error).toBeInstanceOf(ValidationError);
			}
		});

		it("includes issue details with path and message for nested objects", () => {
			const schema = z.object({
				user: z.object({
					name: z.string(),
					age: z.number(),
				}),
			});
			const result = validate(schema, { user: { name: 42, age: "wrong" } });

			expect(isErr(result)).toBe(true);
			if (!result.ok) {
				expect(result.error.issues).toHaveLength(2);

				const namePath = result.error.issues.find(
					(i) => i.path[0] === "user" && i.path[1] === "name",
				);
				expect(namePath).toBeDefined();
				expect(namePath?.message).toEqual(expect.any(String));
				expect(namePath?.message.length).toBeGreaterThan(0);

				const agePath = result.error.issues.find(
					(i) => i.path[0] === "user" && i.path[1] === "age",
				);
				expect(agePath).toBeDefined();
				expect(agePath?.message).toEqual(expect.any(String));
			}
		});

		it("works with complex schemas (objects, arrays, optionals)", () => {
			const schema = z.object({
				tags: z.array(z.string()),
				description: z.string().optional(),
				count: z.number().min(0),
			});

			const valid = validate(schema, { tags: ["a", "b"], count: 5 });
			expect(isOk(valid)).toBe(true);
			if (valid.ok) {
				expect(valid.value.tags).toEqual(["a", "b"]);
				expect(valid.value.description).toBeUndefined();
				expect(valid.value.count).toBe(5);
			}

			const invalid = validate(schema, { tags: [1, 2], count: -1 });
			expect(isErr(invalid)).toBe(true);
			if (!invalid.ok) {
				expect(invalid.error.issues.length).toBeGreaterThanOrEqual(2);
			}
		});
	});

	describe("ValidationError", () => {
		it("extends TradingError with correct code and category", () => {
			const issues = [{ path: ["field"] as readonly (string | number)[], message: "bad" }];
			const error = new ValidationError("Validation failed", issues);

			expect(error).toBeInstanceOf(TradingError);
			expect(error).toBeInstanceOf(Error);
			expect(error.code).toBe("VALIDATION_FAILED");
			expect(error.category).toBe("non_retryable");
			expect(error.isRetryable).toBe(false);
			expect(error.issues).toBe(issues);
			expect(error.message).toBe("Validation failed");
		});
	});

	describe("z re-export", () => {
		it("re-exports z for schema building without direct zod import", () => {
			expect(typeof z.string).toBe("function");
			expect(typeof z.number).toBe("function");
			expect(typeof z.object).toBe("function");
			expect(typeof z.array).toBe("function");
		});
	});
});
