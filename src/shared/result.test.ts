import { describe, expect, it } from "vitest";
import {
	err,
	flatMap,
	isErr,
	isOk,
	map,
	mapErr,
	ok,
	tryCatch,
	tryCatchAsync,
	unwrap,
	unwrapOr,
} from "./result.js";

describe("Result", () => {
	describe("ok / err factories", () => {
		it("ok wraps a value", () => {
			const r = ok(42);
			expect(r.ok).toBe(true);
			if (r.ok) expect(r.value).toBe(42);
		});

		it("err wraps an error", () => {
			const r = err("something failed");
			expect(r.ok).toBe(false);
			if (!r.ok) expect(r.error).toBe("something failed");
		});
	});

	describe("isOk / isErr type guards", () => {
		it("correctly narrows ok result", () => {
			const r = ok(10);
			expect(isOk(r)).toBe(true);
			expect(isErr(r)).toBe(false);
		});

		it("correctly narrows err result", () => {
			const r = err("fail");
			expect(isOk(r)).toBe(false);
			expect(isErr(r)).toBe(true);
		});
	});

	describe("map", () => {
		it("transforms ok value", () => {
			const r = map(ok(5), (x) => x * 2);
			expect(r).toEqual(ok(10));
		});

		it("passes through err unchanged", () => {
			const r = map(err("nope"), (x: number) => x * 2);
			expect(r).toEqual(err("nope"));
		});
	});

	describe("mapErr", () => {
		it("transforms err value", () => {
			const r = mapErr(err("nope"), (e) => `wrapped: ${e}`);
			expect(r).toEqual(err("wrapped: nope"));
		});

		it("passes through ok unchanged", () => {
			const r = mapErr(ok(5), (e: string) => `wrapped: ${e}`);
			expect(r).toEqual(ok(5));
		});
	});

	describe("flatMap", () => {
		it("chains ok results", () => {
			const r = flatMap(ok(5), (x) => ok(x + 1));
			expect(r).toEqual(ok(6));
		});

		it("short-circuits on err", () => {
			const r = flatMap(err("fail"), (_x: number) => ok(99));
			expect(r).toEqual(err("fail"));
		});

		it("propagates err from chained function", () => {
			const r = flatMap(ok(5), (_x) => err("chained fail"));
			expect(r).toEqual(err("chained fail"));
		});
	});

	describe("unwrap / unwrapOr", () => {
		it("unwrap returns ok value", () => {
			expect(unwrap(ok(42))).toBe(42);
		});

		it("unwrap throws on err", () => {
			expect(() => unwrap(err(new Error("boom")))).toThrow("boom");
		});

		it("unwrap wraps non-Error in Error", () => {
			expect(() => unwrap(err("string error"))).toThrow("string error");
		});

		it("unwrapOr returns ok value", () => {
			expect(unwrapOr(ok(42), 0)).toBe(42);
		});

		it("unwrapOr returns fallback on err", () => {
			expect(unwrapOr(err("fail"), 0)).toBe(0);
		});
	});

	describe("tryCatch", () => {
		it("wraps successful function in ok", () => {
			const r = tryCatch(() => 42);
			expect(r).toEqual(ok(42));
		});

		it("wraps thrown Error in err", () => {
			const r = tryCatch(() => {
				throw new Error("boom");
			});
			expect(r.ok).toBe(false);
			if (!r.ok) expect(r.error.message).toBe("boom");
		});

		it("wraps thrown non-Error in err", () => {
			const r = tryCatch(() => {
				throw "string throw";
			});
			expect(r.ok).toBe(false);
			if (!r.ok) expect(r.error.message).toBe("string throw");
		});
	});

	describe("tryCatchAsync", () => {
		it("wraps resolved promise in ok", async () => {
			const r = await tryCatchAsync(async () => 42);
			expect(r).toEqual(ok(42));
		});

		it("wraps rejected promise in err", async () => {
			const r = await tryCatchAsync(async () => {
				throw new Error("async boom");
			});
			expect(r.ok).toBe(false);
			if (!r.ok) expect(r.error.message).toBe("async boom");
		});
	});
});
