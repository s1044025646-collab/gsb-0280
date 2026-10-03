import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ReportStore } from "../src/db";
import { expand, ALGORITHM_VERSION } from "../src/core/expand";
import { normalizeFraction } from "../src/core/fraction";
import { startServer } from "../src/server";

test("短预算未完成后换长预算得出循环，旧报告保留未完成状态，重启后可见步骤", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rdec-"));
  const dbPath = path.join(dir, "test.sqlite");

  const store1 = new ReportStore(dbPath);
  const f = normalizeFraction(1n, 7n);
  const short = expand(1n, 7n, 3);
  assert.equal(short.complete, false);
  const id1 = store1.saveReport("1", "7", f.numerator, f.denominator, short, ALGORITHM_VERSION);
  const long = expand(1n, 7n, 100);
  assert.equal(long.complete, true);
  const id2 = store1.saveReport("1", "7", f.numerator, f.denominator, long, ALGORITHM_VERSION);
  store1.close();

  // 模拟重启：重新打开数据库
  const store2 = new ReportStore(dbPath);
  const r1 = store2.getReport(id1);
  assert.equal(r1?.complete, 0);
  assert.equal(r1?.remainder, "6");
  const r2 = store2.getReport(id2);
  assert.equal(r2?.complete, 1);
  assert.equal(r2?.display, "0.(142857)");
  const steps = store2.getSteps(id2);
  assert.equal(steps.length, 6);
  store2.close();
});

test("HTTP API 端到端", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rdec-"));
  const store = new ReportStore(path.join(dir, "api.sqlite"));
  const { server, port } = await startServer(store, 0);
  const base = `http://127.0.0.1:${port}`;

  const post = async (p: string, body: unknown) => {
    const res = await fetch(base + p, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };

  const imp = await post("/api/fractions", { numerator: "2", denominator: "-6" });
  assert.deepEqual(imp.body, { numerator: "-1", denominator: "3" });

  const exp = await post("/api/expand", { numerator: "1", denominator: "6", budget: 50 });
  assert.equal(exp.body.display, "0.1(6)");
  assert.ok(exp.body.reportId > 0);

  const bad = await post("/api/expand", { numerator: "1", denominator: "0" });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, "ZERO_DENOMINATOR");

  const badInt = await post("/api/expand", { numerator: "1.5", denominator: "2" });
  assert.equal(badInt.body.error.code, "INVALID_INTEGER");

  const parsed = await post("/api/parse", { text: "0.(9)" });
  assert.deepEqual(parsed.body, { numerator: "1", denominator: "1" });

  const badParse = await post("/api/parse", { text: "0.(1" });
  assert.equal(badParse.body.error.code, "INVALID_PARENTHESES");

  const list = await (await fetch(base + "/api/reports")).json();
  assert.ok(list.reports.length >= 1);

  const detail = await (await fetch(base + `/api/reports/${exp.body.reportId}`)).json();
  assert.equal(detail.steps.length, 2); // 1/6: 两步后余数重复
  store.close();
  server.close();
});
