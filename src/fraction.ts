import { ApiError } from "./errors";

export interface Rational {
  /** 符号：-1、0、1。零的符号恒为 0（不带负号）。 */
  sign: -1 | 0 | 1;
  /** 绝对值分子（非负）。 */
  num: bigint;
  /** 分母，恒为正。 */
  den: bigint;
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

/** 解析十进制整数字符串（可带前导 +/- 与空白），返回 BigInt。 */
export function parseInteger(input: unknown, field: string): bigint {
  if (typeof input !== "string" && typeof input !== "number" && typeof input !== "bigint") {
    throw new ApiError("INVALID_INTEGER", `${field} 必须是十进制整数字符串`);
  }
  const text = String(input).trim();
  if (!/^[+-]?\d+$/.test(text)) {
    throw new ApiError("INVALID_INTEGER", `${field} 不是合法的十进制整数: ${JSON.stringify(text)}`);
  }
  return BigInt(text);
}

/** 规范化：约分、分母为正、符号独立、零不带负号。 */
export function normalize(num: bigint, den: bigint): Rational {
  if (den === 0n) {
    throw new ApiError("ZERO_DENOMINATOR", "分母不能为零");
  }
  if (num === 0n) {
    return { sign: 0, num: 0n, den: 1n };
  }
  let sign: -1 | 1 = 1;
  let n = num;
  let d = den;
  if (n < 0n) {
    sign = (-sign) as -1 | 1;
    n = -n;
  }
  if (d < 0n) {
    sign = (-sign) as -1 | 1;
    d = -d;
  }
  const g = gcd(n, d);
  return { sign, num: n / g, den: d / g };
}

export function rationalToString(r: Rational): string {
  if (r.sign === 0) return "0";
  const body = r.den === 1n ? `${r.num}` : `${r.num}/${r.den}`;
  return r.sign < 0 ? `-${body}` : body;
}
