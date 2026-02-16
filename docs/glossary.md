# Glossary

Key terms and concepts used throughout the Polybot SDK.

## A

**ADV** — Average Daily Volume. Used by the impact model to estimate market impact relative to typical trading activity.

## B

**Branded Type** — A TypeScript pattern that creates nominal types from primitives. `ConditionId`, `MarketTokenId`, and `ClientOrderId` are branded strings that prevent accidental mixing. Created via factory functions like `conditionId("0x...")`.

## C

**CLOB** — Central Limit Order Book. Polymarket's order matching system where bids and asks are matched by price-time priority.

**Condition ID** — Unique identifier for a prediction market (e.g., "Will X happen by Y date?"). Branded as `ConditionId`.

**Cost Basis** — The weighted average entry price across all fills for a position. Tracked by the immutable `CostBasis` class using FIFO accounting.

**CTF** — Conditional Token Framework. The on-chain smart contract system that creates YES/NO token pairs for prediction markets. Supports split (collateral → tokens), merge (tokens → collateral), and redeem (winning tokens → payout).

## D

**Decimal** — The SDK's fixed-point arithmetic type wrapping `decimal.js-light`. All financial calculations use `Decimal` instead of JavaScript `number` to prevent floating-point precision errors.

**Detector** — See Signal Detector.

**DetectorContext** — The read-only context passed to `SignalDetector.detectEntry()`. Provides access to orderbook data, oracle prices, balances, and market metadata.

**Dutch Book** — An arbitrage condition where YES + NO prices don't sum to $1. The `calculateEscapeRoute()` function exploits this invariant for position recovery.

## E

**Edge** — The difference between fair value and market price. Positive edge means the market is underpriced relative to the model.

**EntryGuard** — Interface for pre-trade risk checks. Returns `GuardVerdict` with allow/block decision and diagnostic data.

**ExitPipeline** — Composable chain of exit policies (OR semantics). First exit that triggers wins. Built with `.with()` chaining.

**Executor** — Interface for order submission. `PaperExecutor` simulates fills; production executors connect to the Polymarket CLOB.

## F

**FIFO** — First In, First Out. Cost basis accounting method where the earliest fills are matched first when calculating P&L.

## G

**GuardPipeline** — Composable chain of entry guards (AND semantics). Short-circuits on first block. Presets: `conservative()`, `standard()`, `aggressive()`, `minimal()`.

**GuardVerdict** — Return type from guards: `{ allowed: boolean, guardName, reason?, diagnostic? }`.

## H

**HWM** — High-Water Mark. The peak unrealized value of a position, used for trailing stop and drawdown calculations.

## I

**Idempotency Guard** — Dedup mechanism that prevents duplicate order submissions within a configurable TTL window.

## K

**Kelly Criterion** — Optimal position sizing formula: `f* = (bp - q) / b` where b=odds, p=win probability, q=loss probability. Implemented by `KellySizer`.

**KLine** — Candlestick (OHLCV) data aggregated from price ticks. The `KLineAggregator` builds candles in real-time from streaming data.

## M

**Market Token ID** — Identifier for a specific outcome token (YES or NO) within a market. Branded as `MarketTokenId`.

**MarketSide** — Enum: `Yes` or `No`. Represents which side of a binary prediction market.

## O

**OFI** — Order Flow Imbalance. Signed metric tracking bid/ask queue changes. Positive = buying pressure.

**Oracle** — External price feed used as fair value reference. `WeightedOracle` aggregates multiple sources.

**Order Differ** — `diffOrders()` computes the minimal action set (keep/amend/place/cancel) to transition from live orders to desired orders.

## P

**PaperExecutor** — Simulated order executor for testing. Configurable fill probability and slippage without real funds.

**Position Manager** — Immutable collection of open positions. All mutations (`open`, `close`, `reduce`) return new instances.

## R

**Reconciler** — `PositionReconciler` detects drift between local position state and exchange state. Flags orphans, unknowns, and size mismatches.

**Result\<T, E\>** — Discriminated union for error handling: `Ok<T> | Err<E>`. Used instead of thrown exceptions in domain code. Pattern-match with `isOk()` / `isErr()`, unwrap with `unwrap()`.

**Replay Tick** — A historical data point used in backtesting: `{ bid, ask, timestampMs, ... }`.

## S

**Signal Detector** — The core strategy interface. Implements `detectEntry()` (market → signal | null) and `toOrder()` (signal → order intent). The only interface you *must* implement.

**Slippage Model** — Backtest component that simulates execution slippage. Implementations: `FixedBpsSlippage`, `SizeProportionalSlippage`.

## T

**Tick** — One iteration of the strategy loop. The SDK calls your detector, evaluates guards, checks exits, and manages orders each tick.

**TradingError** — Base error class with category (retryable/non-retryable/fatal), code, context, and optional hint. All SDK errors extend this.

## V

**VPIN** — Volume-synchronized Probability of Informed Trading. Measures buy/sell volume imbalance in fixed-size buckets. High VPIN (>0.5) suggests informed trading.

## W

**Watchdog** — Timer-based safety mechanism that blocks new entries if the strategy hasn't been "touched" (heartbeat) within a configured interval.
