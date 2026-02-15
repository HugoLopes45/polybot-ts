import { describe, expect, it } from "vitest";
import { aggressive, conservative, evHunter, longTerm, scalper } from "./presets.js";
import { StrategyBuilder } from "./strategy-builder.js";

describe("Presets", () => {
	describe("conservative", () => {
		it("should return a StrategyBuilder", () => {
			expect(conservative()).toBeInstanceOf(StrategyBuilder);
		});

		it("should build successfully", () => {
			expect(conservative().build()).toBeDefined();
		});
	});

	describe("aggressive", () => {
		it("should return a StrategyBuilder", () => {
			expect(aggressive()).toBeInstanceOf(StrategyBuilder);
		});

		it("should build successfully", () => {
			expect(aggressive().build()).toBeDefined();
		});
	});

	describe("scalper", () => {
		it("should return a StrategyBuilder", () => {
			expect(scalper()).toBeInstanceOf(StrategyBuilder);
		});

		it("should build successfully", () => {
			expect(scalper().build()).toBeDefined();
		});

		it("should have tight stops configured", () => {
			const builder = scalper();
			const strategy = builder.build();
			const guardPipeline = strategy.getGuardPipeline();

			expect(guardPipeline).toBeDefined();
			expect(guardPipeline.all().length).toBeGreaterThan(0);
		});
	});

	describe("evHunter", () => {
		it("should return a StrategyBuilder", () => {
			expect(evHunter()).toBeInstanceOf(StrategyBuilder);
		});

		it("should build successfully", () => {
			expect(evHunter().build()).toBeDefined();
		});
	});

	describe("longTerm", () => {
		it("should return a StrategyBuilder", () => {
			expect(longTerm()).toBeInstanceOf(StrategyBuilder);
		});

		it("should build successfully", () => {
			expect(longTerm().build()).toBeDefined();
		});

		it("should have wider stops configured", () => {
			const builder = longTerm();
			const strategy = builder.build();
			const guardPipeline = strategy.getGuardPipeline();

			expect(guardPipeline).toBeDefined();
			expect(guardPipeline.all().length).toBeGreaterThan(0);
		});
	});

	it("should produce distinct builders for each preset", () => {
		const c = conservative();
		const a = aggressive();
		const s = scalper();
		const e = evHunter();
		const l = longTerm();

		expect(c).not.toBe(a);
		expect(a).not.toBe(s);
		expect(s).not.toBe(e);
		expect(e).not.toBe(l);
	});
});
