import { test } from "node:test";
import assert from "node:assert/strict";
import { expand } from "../src/core/expand";
import { normalizeFraction } from "../src/core/fraction";
import { expansionToFraction, parseExpansionSyntax } from "../src/core/parse";

function e(n: string, d: string, budget = 1000) {
  return expand(BigInt(n), BigInt(d), budget);
}

test("1/3 = 0.(3)", () => {
  const r = e("1", "3");
  assert.equal(r.display, "0.(3)");
  assert.equal(r.complete, true);
  assert.equal(r.terminated, false);
  assert.equal(r.nonRepeating, "");
  assert.equal(r.repeating, "3");
});

test("1/6 = 0.1(6)", () => {
  const r = e("1", "6");
  assert.equal(r.display, "0.1(6)");
  assert.equal(r.nonRepeating, "1");
  assert.equal(r.repeating, "6");
});

test("1/7 = 0.(142857)", () => {
  const r = e("1", "7");
  assert.equal(r.display, "0.(142857)");
  assert.equal(r.repeating, "142857");
});

test("1/8 = 0.125 有限", () => {
  const r = e("1", "8");
  assert.equal(r.display, "0.125");
  assert.equal(r.terminated, true);
  assert.equal(r.repeating, "");
});

test("22/7 = 3.(142857)", () => {
  const r = e("22", "7");
  assert.equal(r.display, "3.(142857)");
  assert.equal(r.integerPart, "3");
});

test("负分数: -1/6 = -0.1(6)，分母为负等价", () => {
  assert.equal(e("-1", "6").display, "-0.1(6)");
  assert.equal(e("1", "-6").display, "-0.1(6)");
  assert.equal(e("-1", "-6").display, "0.1(6)");
});

test("零不带负号", () => {
  const r = e("0", "-7");
  assert.equal(r.display, "0");
  assert.equal(r.sign, 0);
  assert.equal(r.terminated, true);
});

test("可约分输入: 2/6 = 1/3", () => {
  const f = normalizeFraction(2n, 6n);
  assert.equal(f.numerator, 1n);
  assert.equal(f.denominator, 3n);
  assert.equal(e("2", "6").display, "0.(3)");
});

test("倍乘分子分母得到相同规范化结果", () => {
  assert.equal(e("3", "21").display, e("1", "7").display);
  assert.equal(e("-40", "-160").display, e("1", "4").display);
});

test("前缀中包含零: 1/2025 类", () => {
  // 1/200 = 0.005 有限且前缀含零
  const r = e("1", "200");
  assert.equal(r.display, "0.005");
  // 1/110 = 0.0(09)
  const r2 = e("1", "110");
  assert.equal(r2.display, "0.0(09)");
});

test("循环开始就在第一位: 5/11 = 0.(45)", () => {
  const r = e("5", "11");
  assert.equal(r.display, "0.(45)");
  assert.equal(r.nonRepeating, "");
});

test("大整数", () => {
  const r = e("123456789123456789123456789", "999999999999999999");
  assert.equal(r.complete, true);
  // 独立校验: 展开结果乘回分母应等于分子（用反算验证）
  const back = expansionToFraction(r.display);
  const f = normalizeFraction(123456789123456789123456789n, 999999999999999999n);
  assert.deepEqual(back, f);
});

test("预算不足: 未完成并报告精确余数", () => {
  const r = e("1", "7", 3);
  assert.equal(r.complete, false);
  assert.equal(r.digitsGenerated, 3);
  assert.equal(r.remainder, "6");
  assert.ok(r.display.endsWith("…"));
});

test("预算恰好触及终止仍算完成", () => {
  const r = e("1", "8", 3);
  assert.equal(r.complete, true);
  assert.equal(r.terminated, true);
  assert.equal(r.display, "0.125");
});

test("预算恰好触及循环仍算完成", () => {
  const r = e("1", "3", 1);
  assert.equal(r.complete, true);
  assert.equal(r.display, "0.(3)");
});

test("每一步余数非负且小于分母", () => {
  const cases: Array<[string, string]> = [["1", "7"], ["22", "7"], ["1", "6"], ["5", "110"], ["123456789", "987654321"]];
  for (const [n, d] of cases) {
    const den = normalizeFraction(BigInt(n), BigInt(d)).denominator;
    const r = e(n, d);
    for (const s of r.steps) {
      const before = BigInt(s.remainderBefore);
      const after = BigInt(s.remainderAfter);
      assert.ok(before >= 0n && before < den, `${n}/${d} 步骤 ${s.position} 余数越界`);
      assert.ok(after >= 0n && after < den, `${n}/${d} 步骤 ${s.position} 余数越界`);
      assert.equal(after, (before * 10n) % den);
      assert.equal(s.digit, Number((before * 10n) / den));
    }
  }
});

test("反算: 0.(9) = 1", () => {
  const f = expansionToFraction("0.(9)");
  assert.equal(f.numerator, 1n);
  assert.equal(f.denominator, 1n);
  // 再展开为规范整数表示
  const r = expand(f.numerator, f.denominator, 100);
  assert.equal(r.display, "1");
});

test("反算: 整数等式独立校验 value = (int*10^k + frac) + rep/(10^k*(10^m-1))", () => {
  // 0.1(6): 期望 1/6。验证 6 * value == 1 用整数等式
  const f = expansionToFraction("0.1(6)");
  assert.equal(f.numerator * 6n, f.denominator * 1n);
  // 0.(142857) * 7 == 1
  const f2 = expansionToFraction("0.(142857)");
  assert.equal(f2.numerator * 7n, f2.denominator);
  // -3.25(18): 独立构造期望分数
  // -3.25(18) = -(3 + 25/100 + 18/(100*99)) = -(3*9900+25*99+18)/9900 = -(29700+2475+18)/9900 = -32193/9900
  const f3 = expansionToFraction("-3.25(18)");
  const expect = normalizeFraction(-32193n, 9900n);
  assert.deepEqual(f3, expect);
  // 0.125 有限
  const f4 = expansionToFraction("0.125");
  assert.equal(f4.numerator * 8n, f4.denominator);
});

test("反算: 语法错误明确报错", () => {
  assert.throws(() => expansionToFraction("0.1(6"), /INVALID_PARENTHESES/);
  assert.throws(() => expansionToFraction("0.(1)(2)"), /INVALID_PARENTHESES/);
  assert.throws(() => expansionToFraction("0.1(6)2"), /INVALID_PARENTHESES|INVALID_SYNTAX/);
  assert.throws(() => expansionToFraction("--1.5"), /INVALID_SYNTAX/);
  assert.throws(() => expansionToFraction("1.5.2"), /INVALID_SYNTAX/);
  assert.throws(() => expansionToFraction("abc"), /INVALID_SYNTAX/);
  assert.throws(() => expansionToFraction("0.()"), /INVALID_SYNTAX|EMPTY_REPETEND/);
});

test("parseExpansionSyntax: 可空非循环部分", () => {
  const p = parseExpansionSyntax("0.(142857)");
  assert.equal(p.nonRepeating, "");
  assert.equal(p.repeating, "142857");
  const p2 = parseExpansionSyntax("3");
  assert.equal(p2.repeating, null);
});

test("零分母报错", () => {
  assert.throws(() => normalizeFraction(1n, 0n), /ZERO_DENOMINATOR/);
  assert.throws(() => e("1", "0"), /ZERO_DENOMINATOR/);
});
