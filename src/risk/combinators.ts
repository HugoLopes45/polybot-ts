import type { EntryGuard, GuardContext, GuardVerdict } from "./types.js";
import { allow, block, isAllowed } from "./types.js";

export class OrGuard implements EntryGuard {
	readonly name: string;
	private readonly guards: readonly EntryGuard[];

	private constructor(name: string, guards: readonly EntryGuard[]) {
		this.name = name;
		this.guards = guards;
	}

	static create(name: string, guards: readonly EntryGuard[]): EntryGuard {
		return new OrGuard(name, [...guards]);
	}

	check(ctx: GuardContext): GuardVerdict {
		if (this.guards.length === 0) {
			return block(this.name, "OrGuard has no guards to evaluate");
		}

		let lastBlock: GuardVerdict | null = null;

		for (const guard of this.guards) {
			const verdict = guard.check(ctx);
			if (isAllowed(verdict)) {
				return verdict;
			}
			lastBlock = verdict;
		}

		if (lastBlock === null) {
			return allow();
		}
		return lastBlock;
	}
}

export class NotGuard implements EntryGuard {
	readonly name: string;
	private readonly inner: EntryGuard;

	private constructor(name: string, inner: EntryGuard) {
		this.name = name;
		this.inner = inner;
	}

	static create(name: string, guard: EntryGuard): EntryGuard {
		return new NotGuard(name, guard);
	}

	check(ctx: GuardContext): GuardVerdict {
		const verdict = this.inner.check(ctx);
		if (isAllowed(verdict)) {
			return block(this.name, `NotGuard: inner guard '${this.inner.name}' allowed, blocking`);
		}
		return allow();
	}
}

export class ConditionalGuard implements EntryGuard {
	readonly name: string;
	private readonly predicate: (ctx: GuardContext) => boolean;
	private readonly inner: EntryGuard;

	private constructor(name: string, predicate: (ctx: GuardContext) => boolean, inner: EntryGuard) {
		this.name = name;
		this.predicate = predicate;
		this.inner = inner;
	}

	static create(
		name: string,
		predicate: (ctx: GuardContext) => boolean,
		guard: EntryGuard,
	): EntryGuard {
		return new ConditionalGuard(name, predicate, guard);
	}

	check(ctx: GuardContext): GuardVerdict {
		if (!this.predicate(ctx)) {
			return allow();
		}
		return this.inner.check(ctx);
	}
}
