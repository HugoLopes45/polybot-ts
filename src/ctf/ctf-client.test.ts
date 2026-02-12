/**
 * CtfClient — tests for CTF contract operations (split, merge, redeem).
 *
 * Uses a mocked ContractWriter to verify correct delegation of
 * function names, arguments, and result propagation.
 */

import { describe, expect, it, vi } from "vitest";
import type { ContractWriter } from "../lib/ethereum/contracts.js";
import type { EthAddress } from "../lib/ethereum/types.js";
import { Decimal } from "../shared/decimal.js";
import { NetworkError, TradingError } from "../shared/errors.js";
import { conditionId } from "../shared/identifiers.js";
import { err, isErr, isOk, ok } from "../shared/result.js";
import { CtfClient } from "./ctf-client.js";
import type { CtfConfig } from "./types.js";

// ── Test fixtures ───────────────────────────────────────────────────

const TEST_CTF_ADDRESS = "0xCtfContract" as EthAddress;
const TEST_COLLATERAL_ADDRESS = "0xCollateral" as EthAddress;
const TEST_TX_HASH = "0xabc123";

const TEST_CONFIG: CtfConfig = {
	ctfAddress: TEST_CTF_ADDRESS,
	collateralAddress: TEST_COLLATERAL_ADDRESS,
};

function makeWriter(impl?: Partial<ContractWriter>): ContractWriter {
	return {
		write: vi.fn().mockResolvedValue(ok(TEST_TX_HASH)),
		...impl,
	};
}

// ── split() ─────────────────────────────────────────────────────────

describe("CtfClient", () => {
	describe("split()", () => {
		it("calls ContractWriter.write with 'splitPosition' and correct args", async () => {
			const writer = makeWriter();
			const client = new CtfClient(TEST_CONFIG, writer);
			const cid = conditionId("cond-1");
			const amount = Decimal.from("100.5");

			await client.split(cid, amount);

			expect(writer.write).toHaveBeenCalledWith("splitPosition", [
				cid,
				TEST_COLLATERAL_ADDRESS,
				"100.5",
			]);
		});

		it("returns ok(txHash) on success", async () => {
			const writer = makeWriter();
			const client = new CtfClient(TEST_CONFIG, writer);

			const result = await client.split(conditionId("cond-1"), Decimal.from("50"));

			expect(isOk(result)).toBe(true);
			if (isOk(result)) {
				expect(result.value).toBe(TEST_TX_HASH);
			}
		});

		it("returns err(TradingError) on ContractWriter failure", async () => {
			const error = new NetworkError("tx reverted");
			const writer = makeWriter({
				write: vi.fn().mockResolvedValue(err(error)),
			});
			const client = new CtfClient(TEST_CONFIG, writer);

			const result = await client.split(conditionId("cond-1"), Decimal.from("10"));

			expect(isErr(result)).toBe(true);
			if (isErr(result)) {
				expect(result.error).toBe(error);
			}
		});
	});

	// ── merge() ───────────────────────────────────────────────────────

	describe("merge()", () => {
		it("calls ContractWriter.write with 'mergePositions' and correct args", async () => {
			const writer = makeWriter();
			const client = new CtfClient(TEST_CONFIG, writer);
			const cid = conditionId("cond-2");
			const amount = Decimal.from("200");

			await client.merge(cid, amount);

			expect(writer.write).toHaveBeenCalledWith("mergePositions", [
				cid,
				TEST_COLLATERAL_ADDRESS,
				"200",
			]);
		});

		it("returns ok(txHash) on success", async () => {
			const writer = makeWriter();
			const client = new CtfClient(TEST_CONFIG, writer);

			const result = await client.merge(conditionId("cond-2"), Decimal.from("75"));

			expect(isOk(result)).toBe(true);
			if (isOk(result)) {
				expect(result.value).toBe(TEST_TX_HASH);
			}
		});

		it("returns err on failure", async () => {
			const error = new TradingError("gas too low", "TX_FAILED", "retryable");
			const writer = makeWriter({
				write: vi.fn().mockResolvedValue(err(error)),
			});
			const client = new CtfClient(TEST_CONFIG, writer);

			const result = await client.merge(conditionId("cond-2"), Decimal.from("75"));

			expect(isErr(result)).toBe(true);
			if (isErr(result)) {
				expect(result.error).toBe(error);
			}
		});
	});

	// ── redeem() ──────────────────────────────────────────────────────

	describe("redeem()", () => {
		it("calls ContractWriter.write with 'redeemPositions' and correct args", async () => {
			const writer = makeWriter();
			const client = new CtfClient(TEST_CONFIG, writer);
			const cid = conditionId("cond-3");

			await client.redeem(cid);

			expect(writer.write).toHaveBeenCalledWith("redeemPositions", [cid]);
		});

		it("returns ok(txHash) on success", async () => {
			const writer = makeWriter();
			const client = new CtfClient(TEST_CONFIG, writer);

			const result = await client.redeem(conditionId("cond-3"));

			expect(isOk(result)).toBe(true);
			if (isOk(result)) {
				expect(result.value).toBe(TEST_TX_HASH);
			}
		});

		it("returns err on failure", async () => {
			const error = new TradingError("revert", "TX_FAILED", "retryable");
			const writer = makeWriter({
				write: vi.fn().mockResolvedValue(err(error)),
			});
			const client = new CtfClient(TEST_CONFIG, writer);

			const result = await client.redeem(conditionId("cond-3"));

			expect(isErr(result)).toBe(true);
			if (isErr(result)) {
				expect(result.error).toBe(error);
			}
		});
	});
});
