import { Rational } from "./fraction";

export const ALGO_VERSION = "bigint-long-division-v1";

export interface DivisionStep {
  /** 小数位序号（从 1 开始）。 */
  position: number;
  /** 进入该步的余数（上一步产生）。 */
  remainderIn: bigint;
  digit: number;
  remainderOut: bigint;
}

export interface ExpansionResult {
  sign: -1 | 0 | 1;
  integerPart: bigint;
  /** 非循环前缀（小数字符串，可为空）。 */
  prefix: string;
  /** 最短循环节；有限或未完成时为空串。 */
  repetend: string;
  /** finite=有限终止；repeating=找到完整循环；incomplete=预算耗尽。 */
  kind: "finite" | "repeating" | "incomplete";
  /** 是否已得出最终结论（有限或循环）。 */
  complete: boolean;
  digitsGenerated: number;
  /** 未完成时的当前精确余数；完成时为 null。 */
  currentRemainder: bigint | null;
  steps: DivisionStep[];
}

/**
 * 用 BigInt 长除法展开 |num|/|den| 的小数部分。
 * 记录每个余数第一次出现的小数位；余数为 0 即有限终止，
 * 余数再次出现即按首次出现位置切出非循环前缀与最短循环节。
 * 达到 maxDigits 仍未终止则返回 incomplete 与当前精确余数。
 */
export function expand(frac: Rational, maxDigits: number): ExpansionResult {
  const { sign, num, den } = frac;
  const integerPart = num / den;
  let remainder = num % den;
  const firstSeen = new Map<string, number>();
  const digits: number[] = [];
  const steps: DivisionStep[] = [];

  let kind: ExpansionResult["kind"] = "incomplete";
  let prefix = "";
  let repetend = "";

  for (;;) {
    if (remainder === 0n) {
      kind = "finite";
      prefix = digits.join("");
      break;
    }
    const key = remainder.toString();
    const seenAt = firstSeen.get(key);
    if (seenAt !== undefined) {
      kind = "repeating";
      prefix = digits.slice(0, seenAt).join("");
      repetend = digits.slice(seenAt).join("");
      break;
    }
    if (digits.length >= maxDigits) {
      kind = "incomplete";
      prefix = digits.join("");
      break;
    }
    firstSeen.set(key, digits.length);
    const scaled = remainder * 10n;
    const digit = Number(scaled / den);
    const next = scaled % den;
    steps.push({ position: digits.length + 1, remainderIn: remainder, digit, remainderOut: next });
    digits.push(digit);
    remainder = next;
  }

  const complete = kind !== "incomplete";
  return {
    sign,
    integerPart,
    prefix,
    repetend,
    kind,
    complete,
    digitsGenerated: digits.length,
    currentRemainder: complete ? null : remainder,
    steps,
  };
}

/** 规范展示：有限不带括号，循环用括号标记循环节。 */
export function formatExpansion(result: ExpansionResult): string {
  const signPrefix = result.sign < 0 ? "-" : "";
  const intPart = result.integerPart.toString();
  if (result.kind === "finite") {
    return result.prefix.length === 0
      ? `${signPrefix}${intPart}`
      : `${signPrefix}${intPart}.${result.prefix}`;
  }
  if (result.kind === "repeating") {
    return `${signPrefix}${intPart}.${result.prefix}(${result.repetend})`;
  }
  // 未完成：如实标注，不宣称有限或循环。
  return `${signPrefix}${intPart}.${result.prefix}…(未完成，已生成 ${result.digitsGenerated} 位)`;
}
