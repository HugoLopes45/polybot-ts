/**
 * Log-scale latency histogram for microsecond to millisecond tracking.
 *
 * 16 buckets on log2 scale: [0-1μs, 1-2μs, 2-4μs, ..., 16384-32768μs, 32768+μs]
 * Provides p50, p95, p99 percentile estimates.
 */

const NUM_BUCKETS = 16;
const BUCKET_BOUNDARIES_US: readonly number[] = Array.from(
	{ length: NUM_BUCKETS },
	(_, i) => 2 ** i,
);

export class LatencyHistogram {
	private readonly buckets: number[];
	private _count = 0;

	private constructor() {
		this.buckets = new Array<number>(NUM_BUCKETS + 1).fill(0);
	}

	static create(): LatencyHistogram {
		return new LatencyHistogram();
	}

	/** Record a latency sample in microseconds. */
	recordUs(latencyUs: number): void {
		const idx = this.bucketIndex(latencyUs);
		this.buckets[idx] = (this.buckets[idx] ?? 0) + 1;
		this._count++;
	}

	/** Record a latency sample in milliseconds. */
	recordMs(latencyMs: number): void {
		this.recordUs(latencyMs * 1000);
	}

	/** Total number of recorded samples. */
	get count(): number {
		return this._count;
	}

	/** Estimate the p-th percentile in milliseconds. Returns 0 if no data. */
	percentileMs(p: number): number {
		if (this._count === 0) return 0;
		const target = Math.ceil(this._count * (p / 100));
		let cumulative = 0;

		for (let i = 0; i <= NUM_BUCKETS; i++) {
			cumulative += this.buckets[i] ?? 0;
			if (cumulative >= target) {
				if (i === 0) return (BUCKET_BOUNDARIES_US[0] ?? 1) / 1000;
				if (i >= NUM_BUCKETS) {
					return ((BUCKET_BOUNDARIES_US[NUM_BUCKETS - 1] ?? 32768) * 2) / 1000;
				}
				return (BUCKET_BOUNDARIES_US[i] ?? 1) / 1000;
			}
		}
		return 0;
	}

	/** p50 in milliseconds. */
	p50(): number {
		return this.percentileMs(50);
	}

	/** p95 in milliseconds. */
	p95(): number {
		return this.percentileMs(95);
	}

	/** p99 in milliseconds. */
	p99(): number {
		return this.percentileMs(99);
	}

	/** Reset all buckets. */
	reset(): void {
		this.buckets.fill(0);
		this._count = 0;
	}

	private bucketIndex(latencyUs: number): number {
		if (latencyUs <= 0) return 0;
		for (let i = 0; i < NUM_BUCKETS; i++) {
			const boundary = BUCKET_BOUNDARIES_US[i];
			if (boundary !== undefined && latencyUs < boundary) return i;
		}
		return NUM_BUCKETS;
	}
}
