/**
 * CachingTokenResolver — resolves condition IDs to token pairs via
 * ContractReader, with LRU caching to avoid redundant contract calls.
 */

import { Cache } from "../lib/cache/index.js";
import type { ContractReader } from "../lib/ethereum/contracts.js";
import type { TradingError } from "../shared/errors.js";
import type { ConditionId, MarketTokenId } from "../shared/identifiers.js";
import { idToString } from "../shared/identifiers.js";
import type { Result } from "../shared/result.js";
import { isOk, ok } from "../shared/result.js";
import type { TokenInfo } from "./types.js";

export interface TokenResolverConfig {
	readonly reader: ContractReader;
	readonly ttl?: number;
	readonly maxSize?: number;
}

const DEFAULT_TTL = 60_000;
const DEFAULT_MAX_SIZE = 256;

export class CachingTokenResolver {
	private readonly reader: ContractReader;
	private readonly cache: Cache<TokenInfo>;

	constructor(config: TokenResolverConfig) {
		this.reader = config.reader;
		this.cache = new Cache<TokenInfo>({
			ttl: config.ttl ?? DEFAULT_TTL,
			maxSize: config.maxSize ?? DEFAULT_MAX_SIZE,
		});
	}

	async resolve(conditionId: ConditionId): Promise<Result<TokenInfo, TradingError>> {
		const key = idToString(conditionId);

		const cached = this.cache.get(key);
		if (cached !== undefined) {
			return ok(cached);
		}

		const result = await this.reader.read<readonly [MarketTokenId, MarketTokenId]>("getTokenIds", [
			conditionId,
		]);

		if (!isOk(result)) {
			return result;
		}

		const [yesTokenId, noTokenId] = result.value;
		const tokenInfo: TokenInfo = {
			conditionId,
			yesTokenId,
			noTokenId,
		};

		this.cache.set(key, tokenInfo);
		return ok(tokenInfo);
	}
}
