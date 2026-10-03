export interface Fraction {
  numerator: bigint; // 符号只在分子上；零恒为 0/1
  denominator: bigint; // 恒为正
}

export function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

export function normalizeFraction(numerator: bigint, denominator: bigint): Fraction {
  if (denominator === 0n) {
    throw new Error("ZERO_DENOMINATOR");
  }
  if (numerator === 0n) {
    return { numerator: 0n, denominator: 1n };
  }
  let n = numerator;
  let d = denominator;
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  return { numerator: n / g, denominator: d / g };
}

const INT_RE = /^[+-]?\d+$/;

export function parseIntegerString(raw: unknown, field: string): bigint {
  if (typeof raw !== "string" || !INT_RE.test(raw.trim())) {
    throw new Error(`INVALID_INTEGER:${field}`);
  }
  return BigInt(raw.trim());
}
