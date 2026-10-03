import { test } from "node:test";
import assert from "node:assert/strict";
import { expand, formatExpansion } from "../src/expand";
import { normalize, rationalToString } from "../src/fraction";

function run(num: bigint, den: bigint, maxDigits = 1000) {
  const frac = normalize(num, den);
  const result = expand(frac, maxDigits);
  return { frac, result, display: formatExpansion(result) };
}

test("1/3 = 0.(3)，循环从第一位开始", () => {
  const { result, display } = run(1n, 3n);
  assert.equal(display, "0.(3)");
  assert.equal(result.kind, "repeating");
  assert.equal(result.prefix, "");
  assert.equal(result.repetend, "3");
  assert.ok(result.complete);
});

test("1/6 = 0.1(6)", () => {
  const { display, result } = run(1n, 6n);
  assert.equal(display, "0.1(6)");
  assert.equal(result.prefix, "1");
  assert.equal(result.repetend, "6");
});

test("1/7 = 0.(142857)", () => {
  const { display } = run(1n, 7n);
  assert.equal(display, "0.(142857)");
});

test("1/8 = 0.125 有限，不带括号", () => {
  const { display, result } = run(1n, 8n);
  assert.equal(display, "0.125");
  assert.equal(result.kind, "finite");
  assert.equal(result.repetend, "");
});

test("22/7 = 3.(142857)", () => {
  const { display, result } = run(22n, 7n);
  assert.equal(display, "3.(142857)");
  assert.equal(result.integerPart, 3n);
});

test("负分数符号独立：-1/6 = -0.1(6)", () => {
  const { display, frac } = run(-1n, 6n);
  assert.equal(display, "-0.1(6)");
  assert.equal(frac.sign, -1);
  assert.equal(frac.den, 6n);
});

test("分母为负统一转正：1/-6 = -0.1(6)", () => {
  const { display, frac } = run(1n, -6n);
  assert.equal(display, "-0.1(6)");
  assert.equal(frac.den, 6n);
});

test("零不带负号：0/-5 = 0", () => {
  const { display, frac } = run(0n, -5n);
  assert.equal(display, "0");
  assert.equal(frac.sign, 0);
  assert.equal(rationalToString(frac), "0");
});

test("整数：6/3 = 2", () => {
  const { display, result } = run(6n, 3n);
  assert.equal(display, "2");
  assert.equal(result.kind, "finite");
  assert.equal(result.prefix, "");
});

test("可约分输入：2/12 与 1/6 一致", () => {
  const a = run(2n, 12n);
  const b = run(1n, 6n);
  assert.equal(a.display, "0.1(6)");
  assert.equal(rationalToString(a.frac), rationalToString(b.frac));
});

test("倍乘分子分母结果相同：3/21 = 1/7", () => {
  assert.equal(run(3n, 21n).display, "0.(142857)");
  assert.equal(run(50n, 350n).display, "0.(142857)");
});

test("前缀包含零：1/12 = 0.08(3)", () => {
  const { display, result } = run(1n, 12n);
  assert.equal(display, "0.08(3)");
  assert.equal(result.prefix, "08");
  assert.equal(result.repetend, "3");
});

test("每一步余数非负且小于分母", () => {
  const { frac, result } = run(22n, 7n);
  for (const step of result.steps) {
    assert.ok(step.remainderIn >= 0n && step.remainderIn < frac.den, `余数越界: ${step.remainderIn}`);
    assert.ok(step.remainderOut >= 0n && step.remainderOut < frac.den);
    assert.equal(step.remainderIn * 10n, BigInt(step.digit) * frac.den + step.remainderOut);
  }
});

test("大整数：10^30+1 / 3 精确展开", () => {
  const big = 10n ** 30n + 1n;
  const { display } = run(big, 3n);
  assert.equal(display, "333333333333333333333333333333.(6)");
});

test("预算耗尽返回未完成与当前精确余数", () => {
  const { result, display } = run(1n, 7n, 3);
  assert.equal(result.kind, "incomplete");
  assert.equal(result.complete, false);
  assert.equal(result.digitsGenerated, 3);
  assert.equal(result.prefix, "142");
  assert.equal(result.currentRemainder, 6n); // 1->10->3->30->2->20->6->60->4->40->5
  assert.ok(display.includes("未完成"));
});

test("预算恰好在终止步触及也算完成", () => {
  const { result } = run(1n, 8n, 3);
  assert.equal(result.kind, "finite");
  assert.ok(result.complete);
});

test("预算恰好在循环确认步触及也算完成", () => {
  // 1/3 第 2 步前余数 1 重复，预算 1 位即可确认循环
  const { result } = run(1n, 3n, 1);
  assert.equal(result.kind, "repeating");
  assert.ok(result.complete);
});
