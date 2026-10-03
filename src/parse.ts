import { ApiError } from "./errors";
import { normalize, Rational } from "./fraction";

export interface ParsedDecimal {
  negative: boolean;
  integerPart: string;
  /** 非循环小数部分（可为空串）。 */
  prefix: string;
  /** 循环节（无括号时为空串）。 */
  repetend: string;
}

const PATTERN = /^([+-]?)(\d+)(?:\.(?:(\d+)\((\d+)\)|\((\d+)\)|(\d+)))?$/;

/**
 * 解析完整循环小数表示：[-]整数[.非循环部分[(循环节)]]
 * 例如 0.1(6)、0.(142857)、0.125、-2、3.(0)。
 * 不允许：重复符号、空循环节、括号不成对、省略整数部分、省略号等未完成标记。
 */
export function parseRepeatingDecimal(text: unknown): ParsedDecimal {
  if (typeof text !== "string") {
    throw new ApiError("INVALID_SYNTAX", "输入必须是字符串");
  }
  const trimmed = text.trim();
  if (trimmed.includes("…") || trimmed.includes("...")) {
    throw new ApiError("INCOMPLETE_INPUT", "不完整的展开不能作为反算输入");
  }
  const signs = [...trimmed.matchAll(/[+-]/g)];
  if (signs.length > 1 || (signs.length === 1 && signs[0].index !== 0)) {
    throw new ApiError("INVALID_SYNTAX", `存在重复符号: ${JSON.stringify(trimmed)}`);
  }
  if ((trimmed.includes("(") || trimmed.includes(")")) && !/\(\d+\)/.test(trimmed)) {
    throw new ApiError("INVALID_SYNTAX", `循环节括号非法: ${JSON.stringify(trimmed)}`);
  }
  const match = PATTERN.exec(trimmed);
  if (!match) {
    throw new ApiError(
      "INVALID_SYNTAX",
      `非法的循环小数表示: ${JSON.stringify(trimmed)}，语法为 [-]整数[.非循环部分[(循环节)]]`,
    );
  }
  const [, signText, integerPart, fracA, repA, repB, fracB] = match;
  return {
    negative: signText === "-",
    integerPart,
    prefix: fracA ?? fracB ?? "",
    repetend: repA ?? repB ?? "",
  };
}

/**
 * 将完整循环小数表示反算为约分分数。
 * 值 = I + A/10^a + C / ((10^c - 1) * 10^a)
 * 其中 A 为非循环部分整数，a 为其长度，C 为循环节整数，c 为其长度。
 */
export function repeatingDecimalToRational(text: unknown): Rational {
  const parsed = parseRepeatingDecimal(text);
  const a = BigInt(parsed.prefix.length);
  const c = parsed.repetend.length;
  const scale = 10n ** a;
  const intValue = BigInt(parsed.integerPart);
  const prefixValue = parsed.prefix.length > 0 ? BigInt(parsed.prefix) : 0n;

  let num = intValue * scale + prefixValue;
  let den = scale;
  if (c > 0) {
    const cycleValue = BigInt(parsed.repetend);
    const nines = 10n ** BigInt(c) - 1n;
    num = num * nines + cycleValue;
    den = den * nines;
  }
  const signed = parsed.negative ? -num : num;
  return normalize(signed, den);
}
