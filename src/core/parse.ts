import { Fraction, normalizeFraction } from "./fraction";

export interface ParsedExpansion {
  negative: boolean;
  integerPart: string;
  nonRepeating: string; // 可为空串
  repeating: string | null; // null 表示有限小数
}

const FULL_RE = /^([+-]?)(\d+)(?:\.(\d+)?(?:\((\d+)\))?)?$/;

// 语法: [-]整数[.非循环小数[(循环节)]]
// 例: "3"  "-0.125"  "0.1(6)"  "0.(142857)"  "1.(9)"
export function parseExpansionSyntax(text: unknown): ParsedExpansion {
  if (typeof text !== "string") {
    throw new Error("INVALID_SYNTAX:输入必须是字符串");
  }
  const s = text.trim();
  if (s.length === 0) {
    throw new Error("INVALID_SYNTAX:输入为空");
  }
  if ((s.match(/[+-]/g) ?? []).length > 0 && !/^[+-]/.test(s)) {
    throw new Error("INVALID_SYNTAX:符号只能出现在开头");
  }
  if (/^[+-][+-]/.test(s)) {
    throw new Error("INVALID_SYNTAX:重复符号");
  }
  const open = (s.match(/\(/g) ?? []).length;
  const close = (s.match(/\)/g) ?? []).length;
  if (open !== close || open > 1) {
    throw new Error("INVALID_PARENTHESES:括号必须成对且至多一对");
  }
  if (open === 1 && !s.endsWith(")")) {
    throw new Error("INVALID_PARENTHESES:循环括号必须位于末尾");
  }
  const m = FULL_RE.exec(s);
  if (!m) {
    throw new Error("INVALID_SYNTAX:不符合 整数[.小数[(循环节)]] 语法");
  }
  const [, sign, intPart, frac, rep] = m;
  if (rep !== undefined && rep.length === 0) {
    throw new Error("EMPTY_REPETEND:循环节不能为空");
  }
  if (rep !== undefined && frac === undefined && s.includes(".")) {
    // "0.(142857)" 允许：frac 为空串由正则 (\d+)? 捕获为 undefined，但有点号，属合法
  }
  return {
    negative: sign === "-",
    integerPart: intPart,
    nonRepeating: frac ?? "",
    repeating: rep ?? null,
  };
}

// 将完整循环小数表示反算为约分分数。
// value = int.frac + rep / (10^len(frac) * (10^len(rep) - 1))
export function expansionToFraction(text: unknown): Fraction {
  const p = parseExpansionSyntax(text);
  const intPart = BigInt(p.integerPart);
  const fracDigits = p.nonRepeating;
  const k = fracDigits.length;
  const scale = 10n ** BigInt(k);
  const fracValue = fracDigits.length > 0 ? BigInt(fracDigits) : 0n;

  let n = intPart * scale + fracValue;
  let d = scale;
  if (p.repeating !== null) {
    const rep = BigInt(p.repeating);
    const repLen = BigInt(p.repeating.length);
    const repDenom = scale * (10n ** repLen - 1n);
    // n/d + rep/repDenom
    n = n * (10n ** repLen - 1n) + rep;
    d = repDenom;
  }
  if (p.negative) {
    n = -n;
  }
  return normalizeFraction(n, d);
}
