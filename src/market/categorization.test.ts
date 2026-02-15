import { describe, expect, it } from "vitest";
import { MarketCategory, categorize } from "./categorization.js";

describe("categorize", () => {
	it.each`
		input                                              | expected
		${"Will BTC reach $100k by end of 2025?"}          | ${MarketCategory.Crypto}
		${"Will Ethereum merge happen in 2024?"}           | ${MarketCategory.Crypto}
		${"Will Bitcoin be above $50k next month?"}        | ${MarketCategory.Crypto}
		${"Will Solana surpass $200?"}                     | ${MarketCategory.Crypto}
		${"Will Donald Trump win the 2024 election?"}      | ${MarketCategory.Politics}
		${"Will Biden resign before term ends?"}           | ${MarketCategory.Politics}
		${"Will UK rejoin EU by 2030?"}                    | ${MarketCategory.Politics}
		${"Will France have a new president in 2027?"}     | ${MarketCategory.Politics}
		${"Will the Lakers win the NBA championship?"}     | ${MarketCategory.Sports}
		${"Will Man United win the Premier League?"}       | ${MarketCategory.Sports}
		${"Will Super Bowl be held in Las Vegas?"}         | ${MarketCategory.Sports}
		${"Will Brazil win the World Cup 2026?"}           | ${MarketCategory.Sports}
		${"Will the Fed cut rates in Q2?"}                 | ${MarketCategory.Economics}
		${"Will US enter recession in 2024?"}              | ${MarketCategory.Economics}
		${"Will inflation exceed 5%?"}                     | ${MarketCategory.Economics}
		${"Will unemployment drop below 4%?"}              | ${MarketCategory.Economics}
		${"Will Avatar 3 break box office records?"}       | ${MarketCategory.Entertainment}
		${"Will Taylor Swift announce world tour?"}        | ${MarketCategory.Entertainment}
		${"Will Netflix surpass 300 million subscribers?"} | ${MarketCategory.Entertainment}
		${"Will Oppenheimer win Best Picture?"}            | ${MarketCategory.Entertainment}
		${"Will AI pass Turing test by 2030?"}             | ${MarketCategory.Science}
		${"Will humans land on Mars?"}                     | ${MarketCategory.Science}
		${"Will fusion energy be commercially viable?"}    | ${MarketCategory.Science}
		${"Will quantum computing break encryption?"}      | ${MarketCategory.Science}
	`("categorizes '$input' as '$expected'", ({ input, expected }) => {
		const result = categorize(input);
		expect(result).toBe(expected);
	});

	it("returns unknown for unrecognized patterns", () => {
		const result = categorize("Will something unexpected happen?");
		expect(result).toBe(MarketCategory.Unknown);
	});

	it("handles empty string", () => {
		const result = categorize("");
		expect(result).toBe(MarketCategory.Unknown);
	});

	it("handles case insensitivity", () => {
		const result = categorize("WILL BITCOIN REACH $100K?");
		expect(result).toBe(MarketCategory.Crypto);
	});

	it("prioritizes more specific matches", () => {
		const result = categorize("Will Bitcoin affect the US economy?");
		expect(result).toBe(MarketCategory.Crypto);
	});
});
