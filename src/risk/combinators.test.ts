import { describe, expect, it } from "vitest";
import { Decimal } from "../shared/decimal.js";
import { conditionId } from "../shared/identifiers.js";
import { ConditionalGuard, NotGuard, OrGuard } from "./combinators.js";
import { GuardPipeline } from "./guard-pipeline.js";
import { allow, block, isBlocked } from "./types.js";
import type { EntryGuard, GuardContext } from "./types.js";

const createMockContext = (): GuardContext => {
	return {
		conditionId: conditionId("test-condition"),
		nowMs: () => Date.now(),
		spot: () => Decimal.from("100"),
		oraclePrice: () => Decimal.from("100"),
		bestBid: () => Decimal.from("99"),
		bestAsk: () => Decimal.from("101"),
		spread: () => Decimal.from("2"),
		spreadPct: () => 2,
		timeRemainingMs: () => 0,
		openPositionCount: () => 0,
		totalExposure: () => Decimal.from("0"),
		availableBalance: () => Decimal.from("1000"),
		dailyPnl: () => Decimal.from("0"),
		consecutiveLosses: () => 0,
		hasPendingOrderFor: () => false,
		lastTradeTimeMs: () => null,
		oracleAgeMs: () => null,
		bookAgeMs: () => null,
	};
};

const alwaysAllowGuard: EntryGuard = {
	name: "AlwaysAllow",
	check: () => allow(),
};

const alwaysBlockGuard: EntryGuard = {
	name: "AlwaysBlock",
	check: () => block("AlwaysBlock", "always blocks"),
};

describe("OrGuard", () => {
	it("all block → block", () => {
		const guard = OrGuard.create("OrAllBlock", [alwaysBlockGuard, alwaysBlockGuard]);
		const verdict = guard.check(createMockContext());
		expect(verdict.type).toBe("block");
	});

	it("first allows → allow (short-circuits)", () => {
		let secondCalled = false;
		const callCounter: EntryGuard = {
			name: "CallCounter",
			check: () => {
				secondCalled = true;
				return block("CallCounter", "should not reach");
			},
		};
		const guard = OrGuard.create("OrFirstAllow", [alwaysAllowGuard, callCounter]);
		const verdict = guard.check(createMockContext());
		expect(verdict.type).toBe("allow");
		expect(secondCalled).toBe(false);
	});

	it("second allows → allow", () => {
		const guard = OrGuard.create("OrSecondAllow", [alwaysBlockGuard, alwaysAllowGuard]);
		const verdict = guard.check(createMockContext());
		expect(verdict.type).toBe("allow");
	});

	it("empty guards → block", () => {
		const guard = OrGuard.create("OrEmpty", []);
		const verdict = guard.check(createMockContext());
		expect(verdict.type).toBe("block");
	});
});

describe("NotGuard", () => {
	it("block → allow (inverted)", () => {
		const guard = NotGuard.create("NotBlock", alwaysBlockGuard);
		const verdict = guard.check(createMockContext());
		expect(verdict.type).toBe("allow");
	});

	it("allow → block", () => {
		const guard = NotGuard.create("NotAllow", alwaysAllowGuard);
		const verdict = guard.check(createMockContext());
		expect(verdict.type).toBe("block");
		if (isBlocked(verdict)) {
			expect(verdict.guard).toBe("NotAllow");
		}
	});
});

describe("ConditionalGuard", () => {
	it("predicate true → delegates", () => {
		const guard = ConditionalGuard.create("CondTrue", () => true, alwaysBlockGuard);
		const verdict = guard.check(createMockContext());
		expect(verdict.type).toBe("block");
	});

	it("predicate false → allow", () => {
		const guard = ConditionalGuard.create("CondFalse", () => false, alwaysBlockGuard);
		const verdict = guard.check(createMockContext());
		expect(verdict.type).toBe("allow");
	});
});

describe("Nested combinators", () => {
	it("OrGuard containing NotGuard", () => {
		const notBlockIsAllow = NotGuard.create("NotBlock", alwaysBlockGuard);
		const guard = OrGuard.create("NestedOr", [alwaysBlockGuard, notBlockIsAllow]);
		const verdict = guard.check(createMockContext());
		expect(verdict.type).toBe("allow");
	});
});

describe("Integrated with GuardPipeline", () => {
	it("OrGuard in pipeline", () => {
		const orGuard = OrGuard.create("OrInPipeline", [alwaysBlockGuard, alwaysAllowGuard]);
		const pipeline = GuardPipeline.create().with(orGuard);
		const verdict = pipeline.evaluate(createMockContext());
		expect(verdict.type).toBe("allow");
	});

	it("NotGuard in pipeline", () => {
		const notGuard = NotGuard.create("NotInPipeline", alwaysAllowGuard);
		const pipeline = GuardPipeline.create().with(notGuard);
		const verdict = pipeline.evaluate(createMockContext());
		expect(verdict.type).toBe("block");
	});

	it("ConditionalGuard in pipeline", () => {
		const condGuard = ConditionalGuard.create("CondInPipeline", () => true, alwaysBlockGuard);
		const pipeline = GuardPipeline.create().with(condGuard);
		const verdict = pipeline.evaluate(createMockContext());
		expect(verdict.type).toBe("block");
	});

	it("ConditionalGuard false allows through", () => {
		const condGuard = ConditionalGuard.create("CondFalseInPipeline", () => false, alwaysBlockGuard);
		const pipeline = GuardPipeline.create().with(condGuard);
		const verdict = pipeline.evaluate(createMockContext());
		expect(verdict.type).toBe("allow");
	});
});
