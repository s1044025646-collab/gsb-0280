import { Fraction, normalizeFraction } from "./fraction";

export const ALGORITHM_VERSION = "bigint-long-division-v1";

export interface DivisionStep {
  position: number; // 小数位序号，从 1 开始
  remainderBefore: string; // 产生该位之前的余数
  digit: number;
  remainderAfter: string;
}

export interface ExpansionResult {
  sign: -1 | 0 | 1;
  integerPart: string; // 不带符号
  nonRepeating: string; // 最短非循环前缀（可为空串）
  repeating: string; // 循环节（有限时为空串）
  terminated: boolean; // 是否有限小数
  complete: boolean; // 是否已得出终止或循环结论
  digitsGenerated: number;
  budget: number;
  remainder: string | null; // 未完成时的当前精确余数
  display: string; // 规范展示，如 0.1(6)、-0.(142857)、0.125；未完成时带 …
  steps: DivisionStep[];
}

// 用 BigInt 长除法展开分数的小数部分，记录余数首次出现的位置。
export function expandFraction(frac: Fraction, budget: number): ExpansionResult {
  if (!Number.isInteger(budget) || budget < 0) {
    throw new Error("INVALID_BUDGET");
  }
  const { numerator, denominator } = frac;
  const sign: -1 | 0 | 1 = numerator === 0n ? 0 : numerator < 0n ? -1 : 1;
  const absN = numerator < 0n ? -numerator : numerator;
  const integerPart = absN / denominator;
  let remainder = absN % denominator;

  const seen = new Map<string, number>(); // 余数 -> 首次出现时的小数位序号（0 表示小数点处）
  seen.set(remainder.toString(), 0);
  const digits: number[] = [];
  const steps: DivisionStep[] = [];
  let terminated = false;
  let cycleStart = -1; // 循环起始小数位序号
  let complete = false;

  while (digits.length < budget) {
    if (remainder === 0n) {
      terminated = true;
      complete = true;
      break;
    }
    const before = remainder;
    const scaled = remainder * 10n;
    const digit = scaled / denominator;
    remainder = scaled % denominator;
    digits.push(Number(digit));
    steps.push({
      position: digits.length,
      remainderBefore: before.toString(),
      digit: Number(digit),
      remainderAfter: remainder.toString(),
    });
    const key = remainder.toString();
    const first = seen.get(key);
    if (first !== undefined) {
      cycleStart = first;
      complete = true;
      break;
    }
    seen.set(key, digits.length);
  }

  // 余数为 0 但尚未在循环顶部被检测到（budget 恰好用尽时）也要判定终止
  if (!complete && remainder === 0n) {
    terminated = true;
    complete = true;
  }

  let nonRepeating: string;
  let repeating: string;
  if (terminated) {
    nonRepeating = digits.join("");
    repeating = "";
  } else if (complete) {
    nonRepeating = digits.slice(0, cycleStart).join("");
    repeating = digits.slice(cycleStart).join("");
  } else {
    nonRepeating = digits.join("");
    repeating = "";
  }

  const signStr = sign < 0 ? "-" : "";
  let display: string;
  if (!complete) {
    display = `${signStr}${integerPart}.${nonRepeating}…`;
  } else if (terminated) {
    display = nonRepeating.length > 0 ? `${signStr}${integerPart}.${nonRepeating}` : `${signStr}${integerPart}`;
  } else {
    display = `${signStr}${integerPart}.${nonRepeating}(${repeating})`;
  }

  return {
    sign,
    integerPart: integerPart.toString(),
    nonRepeating,
    repeating,
    terminated,
    complete,
    digitsGenerated: digits.length,
    budget,
    remainder: complete ? null : remainder.toString(),
    display,
    steps,
  };
}

export function expand(numerator: bigint, denominator: bigint, budget: number): ExpansionResult {
  return expandFraction(normalizeFraction(numerator, denominator), budget);
}
