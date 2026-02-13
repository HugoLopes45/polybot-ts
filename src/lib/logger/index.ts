/**
 * Logger wrapper — domain-agnostic structured logging backed by pino.
 *
 * Auto-redacts opaque credential objects (anything with `__opaque: true`)
 * and supports configurable path-based redaction for sensitive fields.
 */

import pino from "pino";

// ── Types ───────────────────────────────────────────────────────────

/** Log severity levels from least to most severe. */
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

/** Configuration for creating a Logger instance. */
export interface LoggerConfig {
	readonly level: LogLevel;
	readonly redactPaths?: readonly string[];
	readonly destination?: { write(msg: string): void };
}

/** Structured logger interface with auto-redaction of opaque credentials. */
export interface Logger {
	info(msg: string): void;
	info(obj: Record<string, unknown>, msg: string): void;
	warn(msg: string): void;
	warn(obj: Record<string, unknown>, msg: string): void;
	error(msg: string): void;
	error(obj: Record<string, unknown>, msg: string): void;
	debug(msg: string): void;
	debug(obj: Record<string, unknown>, msg: string): void;
	child(bindings: Record<string, unknown>): Logger;
}

// ── Credential serializer ───────────────────────────────────────────

interface OpaqueMarker {
	__opaque: boolean;
}

function isOpaqueCredential(value: unknown): boolean {
	return (
		typeof value === "object" &&
		value !== null &&
		"__opaque" in value &&
		(value as OpaqueMarker).__opaque === true
	);
}

function redactCredentials(obj: unknown): unknown {
	if (obj === null || obj === undefined) return obj;
	if (typeof obj !== "object") return obj;
	if (isOpaqueCredential(obj)) return "[REDACTED]";

	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
		result[key] = isOpaqueCredential(value) ? "[REDACTED]" : value;
	}
	return result;
}

// ── Factory ─────────────────────────────────────────────────────────

function wrapPino(pinoLogger: pino.Logger): Logger {
	return {
		info(msgOrObj: unknown, msg?: string): void {
			if (typeof msgOrObj === "string" || msgOrObj === undefined || msgOrObj === null) {
				pinoLogger.info(String(msgOrObj ?? ""));
			} else {
				pinoLogger.info(redactCredentials(msgOrObj) as object, msg ?? "");
			}
		},
		warn(msgOrObj: unknown, msg?: string): void {
			if (typeof msgOrObj === "string" || msgOrObj === undefined || msgOrObj === null) {
				pinoLogger.warn(String(msgOrObj ?? ""));
			} else {
				pinoLogger.warn(redactCredentials(msgOrObj) as object, msg ?? "");
			}
		},
		error(msgOrObj: unknown, msg?: string): void {
			if (typeof msgOrObj === "string" || msgOrObj === undefined || msgOrObj === null) {
				pinoLogger.error(String(msgOrObj ?? ""));
			} else {
				pinoLogger.error(redactCredentials(msgOrObj) as object, msg ?? "");
			}
		},
		debug(msgOrObj: unknown, msg?: string): void {
			if (typeof msgOrObj === "string" || msgOrObj === undefined || msgOrObj === null) {
				pinoLogger.debug(String(msgOrObj ?? ""));
			} else {
				pinoLogger.debug(redactCredentials(msgOrObj) as object, msg ?? "");
			}
		},
		child(bindings: Record<string, unknown>): Logger {
			return wrapPino(pinoLogger.child(bindings));
		},
	};
}

/**
 * Creates a Logger backed by pino with auto-redaction and optional custom destination.
 *
 * @param config - Logger configuration (level, redact paths, destination)
 * @returns A Logger instance with automatic credential redaction
 *
 * @example
 * ```ts
 * const logger = createLogger({ level: "info" });
 * logger.info({ orderId: "abc" }, "Order submitted");
 * ```
 */
export function createLogger(config: LoggerConfig): Logger {
	const pinoOptions: pino.LoggerOptions = {
		level: config.level,
	};

	if (config.redactPaths && config.redactPaths.length > 0) {
		pinoOptions.redact = {
			paths: [...config.redactPaths],
			censor: "[REDACTED]",
		};
	}

	let pinoLogger: pino.Logger;

	if (config.destination) {
		// Create a writable-like stream from the destination config
		const stream = {
			write(chunk: string): boolean {
				config.destination?.write(chunk);
				return true;
			},
		};
		pinoLogger = pino(pinoOptions, stream as unknown as pino.DestinationStream);
	} else {
		pinoLogger = pino(pinoOptions);
	}

	return wrapPino(pinoLogger);
}
