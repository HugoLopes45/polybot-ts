# Decimal Precision

The SDK uses 18-digit fixed-point `Decimal` for all financial calculations.

## Why Decimal?

JavaScript's `number` type causes precision issues:

```javascript
// ❌ Broken - floating point errors
0.1 + 0.2 === 0.3  // false

// ✅ Fixed - using Decimal
import { Decimal } from "@polybot/sdk";
Decimal.from("0.1").add(Decimal.from("0.2")).eq(Decimal.from("0.3")); // true
```

## Creating Decimals

```typescript
import { Decimal } from "@polybot/sdk";

// From string (recommended)
const price = Decimal.from("0.6534");

// From number
const size = Decimal.from(100);

// Static constructors
const zero = Decimal.zero();  // 0
const one = Decimal.one();    // 1
```

## Common Operations

```typescript
const a = Decimal.from("0.65");
const b = Decimal.from("0.15");

// Arithmetic
a.add(b);           // 0.80
a.sub(b);           // 0.50
a.mul(b);           // 0.0975
a.div(b);           // 4.333...
a.neg();            // -0.65
a.abs();            // 0.65

// Comparison
a.gt(b);            // true
a.lt(b);            // false
a.gte(b);           // true
a.lte(b);           // false
a.eq(b);            // false
a.isZero();         // false
a.isPositive();     // true
a.isNegative();     // false

// Static min/max
Decimal.min(a, b);  // 0.15
Decimal.max(a, b);  // 0.65
```

## Extended Math

```typescript
const d = Decimal.from("4");

d.sqrt();           // 2
d.ln();             // 1.386...
d.exp();            // 54.598...
d.pow(2);           // 16
```

## Formatting

```typescript
const d = Decimal.from("0.6534");

d.toString();       // "0.6534"
d.toFixed(2);       // "0.65"
d.toNumber();       // 0.6534
```

## Gotchas

1. **Always use strings** for construction from user input
2. **Never mix** Decimal with JavaScript numbers
3. **Use `.div()`** for division (not `/` operator)
4. **Check `.isZero()`** before division to avoid errors

## What's Next?

- [Branded Types](/concepts/branded-types) — Type-safe identifiers
- [Result Pattern](/concepts/result-pattern) — Error handling
