import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as http from "node:http";
import { AddressInfo } from "node:net";
import { ReportStore } from "../src/db";
import { createServer } from "../src/server";

let server: http.Server;
let base: string;
let store: ReportStore;

before(async () => {
  store = new ReportStore(":memory:");
  server = createServer(store);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
  store.close();
});

async function post(pathname: string, body: unknown) {
  const res = await fetch(`${base}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

test("POST /fractions 规范化", async () => {
  const { json } = await post("/fractions", { numerator: "2", denominator: "-12" });
  assert.equal(json.normalized, "-1/6");
});

test("POST /expansions 展开并持久化，可读取历史与步骤", async () => {
  const { json } = await post("/expansions", { numerator: "1", denominator: "7", maxDigits: 50 });
  assert.equal(json.display, "0.(142857)");
  assert.equal(json.status, "complete");
  const id = json.id as number;

  const report = await (await fetch(`${base}/expansions/${id}`)).json();
  assert.equal(report.kind, "repeating");

  const steps = await (await fetch(`${base}/expansions/${id}/steps`)).json();
  assert.equal(steps.steps.length, 6);
  assert.equal(steps.steps[0].digit, 1);

  const history = await (await fetch(`${base}/expansions`)).json();
  assert.ok(history.reports.some((r: { id: number }) => r.id === id));
});

test("POST /expansions 短预算未完成，换预算产生新报告", async () => {
  const a = await post("/expansions", { numerator: "1", denominator: "7", maxDigits: 2 });
  assert.equal(a.json.status, "incomplete");
  assert.equal(a.json.currentRemainder, "2");
  const b = await post("/expansions", { numerator: "1", denominator: "7", maxDigits: 10 });
  assert.equal(b.json.status, "complete");
  assert.notEqual(a.json.id, b.json.id);
});

test("POST /parse 反算 0.(9) 为 1", async () => {
  const { json } = await post("/parse", { text: "0.(9)" });
  assert.equal(json.normalized, "1");
});

test("错误码：零分母 / 非法整数 / 非法预算 / 404", async () => {
  const zero = await post("/expansions", { numerator: "1", denominator: "0" });
  assert.equal(zero.status, 400);
  assert.equal((zero.json.error as { code: string }).code, "ZERO_DENOMINATOR");

  const badInt = await post("/expansions", { numerator: "1.5", denominator: "2" });
  assert.equal((badInt.json.error as { code: string }).code, "INVALID_INTEGER");

  const badBudget = await post("/expansions", { numerator: "1", denominator: "2", maxDigits: -1 });
  assert.equal((badBudget.json.error as { code: string }).code, "INVALID_BUDGET");

  const missing = await fetch(`${base}/expansions/9999`);
  assert.equal(missing.status, 404);
});
