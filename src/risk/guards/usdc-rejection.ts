import type { EntryGuard, GuardContext, GuardVerdict } from "../types.js";
import { allow, block } from "../types.js";

const USDC_BRIDGED_PATTERN = /usdc\.e/i;

export class UsdcRejectionGuard implements EntryGuard {
	readonly name = "UsdcRejection";

	check(ctx: GuardContext): GuardVerdict {
		const id = ctx.conditionId as string;
		if (USDC_BRIDGED_PATTERN.test(id)) {
			return block(this.name, "USDC.e (bridged) markets rejected");
		}
		return allow();
	}
}
