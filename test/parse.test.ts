import { test } from "node:test";
import assert from "node:assert/strict";
import { repeatingDecimalToRational } from "../src/parse";
import { normalize, rationalToString } from "../src/fraction";
import { ApiError } from "../src/errors";

/** 独立整数等式检查：解析结果 n/d 应满足 n * expectedDen === d * expectedNum。 */
function assertEqualsFraction(text: string, expectedNum: bigint, expectedDen: bigint) {
  const r = repeatingDecimalToRational(text);
  const expected = normalize(expectedNum, expectedDen);
  assert.equal(r.num * expected.den, r.den * expected.num, `${text} 应等于 ${expectedNum}/${expectedDen}`);
  assert.equal(r.sign, expected.sign);
  assert.equal(r.den > 0n, true);
}

test("0.(9) 还原为 1", () => {
  const r = repeatingDecimalToRational("0.(9)");
  assert.equal(rationalToString(r), "1");
  assertEqualsFraction("0.(9)", 1n, 1n);
});

test("0.(142857) = 1/7（整数等式独立验证）", () => {
  assertEqualsFraction("0.(142857)", 1n, 7n);
  const r = repeatingDecimalToRational("0.(142857)");
  assert.equal(r.num * 7n, r.den * 1n);
});

test("0.1(6) = 1/6", () => assertEqualsFraction("0.1(6)", 1n, 6n));
test("0.125 = 1/8", () => assertEqualsFraction("0.125", 1n, 8n));
test("3.(142857) = 22/7", () => assertEqualsFraction("3.(142857)", 22n, 7n));
test("-0.1(6) = -1/6", () => assertEqualsFraction("-0.1(6)", -1n, 6n));
test("0.08(3) = 1/12", () => assertEqualsFraction("0.08(3)", 1n, 12n));
test("纯整数 -2 = -2/1", () => assertEqualsFraction("-2", -2n, 1n));
test("1.(3) = 4/3", () => assertEqualsFraction("1.(3)", 4n, 3n));

test("非法输入明确报错", () => {
  const bad = ["0.1(", "0.(6", "0.()", "0.1(6))", "--1.5", "+-1", "1..2", ".5", "1.", "abc", "0.1(6", "1/6"];
  for (const text of bad) {
    assert.throws(() => repeatingDecimalToRational(text), ApiError, `应拒绝: ${text}`);
  }
});

test("不完整展开不能参与反算", () => {
  assert.throws(
    () => repeatingDecimalToRational("0.142…(未完成，已生成 3 位)"),
    (err: unknown) => err instanceof ApiError && err.code === "INCOMPLETE_INPUT",
  );
});

test("重复符号报 INVALID_SYNTAX", () => {
  assert.throws(
    () => repeatingDecimalToRational("--1.5"),
    (err: unknown) => err instanceof ApiError && err.code === "INVALID_SYNTAX",
  );
});
