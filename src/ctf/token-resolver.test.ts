import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContractReader } from "../lib/ethereum/contracts.js";
import { ErrorCategory, TradingError } from "../shared/errors.js";
import { conditionId, marketTokenId } from "../shared/identifiers.js";
import { err, isErr, isOk, ok } from "../shared/result.js";
import { CachingTokenResolver } from "./token-resolver.js";

function makeReader(impl?: Partial<ContractReader>): ContractReader {
	return {
		read: vi
			.fn()
			.mockResolvedValue(ok([marketTokenId("yes-token-1"), marketTokenId("no-token-1")])),
		...impl,
	};
}

describe("CachingTokenResolver", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns cached TokenInfo on cache hit", async () => {
		// Arrange
		const reader = makeReader();
		const resolver = new CachingTokenResolver({ reader, ttl: 5000, maxSize: 10 });
		const cid = conditionId("condition-1");

		// Act -- first call populates cache
		await resolver.resolve(cid);
		// Act -- second call should hit cache
		const result = await resolver.resolve(cid);

		// Assert
		expect(isOk(result)).toBe(true);
		if (isOk(result)) {
			expect(result.value.conditionId).toBe(cid);
			expect(result.value.yesTokenId).toBe(marketTokenId("yes-token-1"));
			expect(result.value.noTokenId).toBe(marketTokenId("no-token-1"));
		}
		expect(reader.read).toHaveBeenCalledTimes(1);
	});

	it("fetches from ContractReader on cache miss", async () => {
		// Arrange
		const reader = makeReader();
		const resolver = new CachingTokenResolver({ reader, ttl: 5000, maxSize: 10 });
		const cid = conditionId("condition-1");

		// Act
		const result = await resolver.resolve(cid);

		// Assert
		expect(isOk(result)).toBe(true);
		if (isOk(result)) {
			expect(result.value.conditionId).toBe(cid);
			expect(result.value.yesTokenId).toBe(marketTokenId("yes-token-1"));
			expect(result.value.noTokenId).toBe(marketTokenId("no-token-1"));
		}
		expect(reader.read).toHaveBeenCalledTimes(1);
	});

	it("caches the fetched result for subsequent calls", async () => {
		// Arrange
		const reader = makeReader();
		const resolver = new CachingTokenResolver({ reader, ttl: 5000, maxSize: 10 });
		const cid = conditionId("condition-1");

		// Act
		const first = await resolver.resolve(cid);
		const second = await resolver.resolve(cid);
		const third = await resolver.resolve(cid);

		// Assert -- reader called only once despite 3 resolve calls
		expect(reader.read).toHaveBeenCalledTimes(1);
		expect(isOk(first)).toBe(true);
		expect(isOk(second)).toBe(true);
		expect(isOk(third)).toBe(true);
		if (isOk(first) && isOk(second)) {
			expect(first.value).toEqual(second.value);
		}
	});

	it("re-fetches after TTL expiry", async () => {
		// Arrange
		const reader = makeReader();
		const resolver = new CachingTokenResolver({ reader, ttl: 1000, maxSize: 10 });
		const cid = conditionId("condition-1");

		// Act -- populate cache
		await resolver.resolve(cid);
		expect(reader.read).toHaveBeenCalledTimes(1);

		// Advance past TTL
		vi.advanceTimersByTime(1100);

		// Act -- should re-fetch
		await resolver.resolve(cid);

		// Assert
		expect(reader.read).toHaveBeenCalledTimes(2);
	});

	it("returns Result.err when ContractReader fails", async () => {
		// Arrange
		const tradingErr = new TradingError(
			"contract call failed",
			"CONTRACT_READ_ERROR",
			ErrorCategory.Retryable,
		);
		const reader = makeReader({
			read: vi.fn().mockResolvedValue(err(tradingErr)),
		});
		const resolver = new CachingTokenResolver({ reader, ttl: 5000, maxSize: 10 });
		const cid = conditionId("condition-1");

		// Act
		const result = await resolver.resolve(cid);

		// Assert
		expect(isErr(result)).toBe(true);
		if (isErr(result)) {
			expect(result.error).toBe(tradingErr);
		}
	});

	it("caches different conditionIds independently", async () => {
		// Arrange
		const read = vi
			.fn()
			.mockResolvedValueOnce(ok([marketTokenId("yes-A"), marketTokenId("no-A")]))
			.mockResolvedValueOnce(ok([marketTokenId("yes-B"), marketTokenId("no-B")]));
		const reader: ContractReader = { read };
		const resolver = new CachingTokenResolver({ reader, ttl: 5000, maxSize: 10 });

		// Act
		const resultA = await resolver.resolve(conditionId("cond-A"));
		const resultB = await resolver.resolve(conditionId("cond-B"));

		// Assert
		expect(read).toHaveBeenCalledTimes(2);
		expect(isOk(resultA)).toBe(true);
		expect(isOk(resultB)).toBe(true);
		if (isOk(resultA) && isOk(resultB)) {
			expect(resultA.value.yesTokenId).toBe(marketTokenId("yes-A"));
			expect(resultB.value.yesTokenId).toBe(marketTokenId("yes-B"));
		}
	});

	it("does NOT cache error results", async () => {
		// Arrange
		const tradingErr = new TradingError(
			"temporary failure",
			"CONTRACT_READ_ERROR",
			ErrorCategory.Retryable,
		);
		const read = vi
			.fn()
			.mockResolvedValueOnce(err(tradingErr))
			.mockResolvedValueOnce(ok([marketTokenId("yes-token-1"), marketTokenId("no-token-1")]));
		const reader: ContractReader = { read };
		const resolver = new CachingTokenResolver({ reader, ttl: 5000, maxSize: 10 });
		const cid = conditionId("condition-1");

		// Act -- first call fails
		const failResult = await resolver.resolve(cid);
		// Act -- second call should retry (not return cached error)
		const okResult = await resolver.resolve(cid);

		// Assert
		expect(isErr(failResult)).toBe(true);
		expect(isOk(okResult)).toBe(true);
		expect(read).toHaveBeenCalledTimes(2);
	});

	it("coalesces concurrent requests for the same conditionId (HARD-14)", async () => {
		const reader = makeReader();
		const resolver = new CachingTokenResolver({ reader, ttl: 5000, maxSize: 10 });
		const cid = conditionId("condition-1");

		const results = await Promise.all([
			resolver.resolve(cid),
			resolver.resolve(cid),
			resolver.resolve(cid),
		]);

		expect(reader.read).toHaveBeenCalledTimes(1);
		for (const result of results) {
			expect(isOk(result)).toBe(true);
			if (isOk(result)) {
				expect(result.value.yesTokenId).toBe(marketTokenId("yes-token-1"));
			}
		}
	});

	it("passes correct function name and args to ContractReader", async () => {
		// Arrange
		const reader = makeReader();
		const resolver = new CachingTokenResolver({ reader, ttl: 5000, maxSize: 10 });
		const cid = conditionId("condition-1");

		// Act
		await resolver.resolve(cid);

		// Assert
		expect(reader.read).toHaveBeenCalledWith("getTokenIds", [cid]);
	});
});
