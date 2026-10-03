import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ReportStore } from "../src/db";
import { expand, formatExpansion } from "../src/expand";
import { normalize } from "../src/fraction";

test("短预算未完成 -> 长预算完成，旧报告保留，重启后步骤可读", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "expansion-test-"));
  const dbPath = path.join(dir, "test.db");
  const frac = normalize(1n, 7n);

  const store1 = new ReportStore(dbPath);
  const r1 = expand(frac, 3);
  const id1 = store1.saveReport("1", "7", frac, 3, r1, formatExpansion(r1));
  const r2 = expand(frac, 100);
  const id2 = store1.saveReport("1", "7", frac, 100, r2, formatExpansion(r2));
  store1.close();

  // 模拟重启：重新打开数据库
  const store2 = new ReportStore(dbPath);
  const old = store2.getReport(id1);
  assert.equal(old?.status, "incomplete");
  assert.equal(old?.kind, "incomplete");
  assert.equal(old?.currentRemainder, "6");
  assert.equal(old?.maxDigits, 3);

  const full = store2.getReport(id2);
  assert.equal(full?.status, "complete");
  assert.equal(full?.display, "0.(142857)");
  assert.equal(full?.algoVersion, "bigint-long-division-v1");

  const steps = store2.getSteps(id1);
  assert.equal(steps.length, 3);
  assert.deepEqual(
    steps.map((s) => s.digit),
    [1, 4, 2],
  );
  assert.equal(steps[0].remainderIn, 1n);
  assert.equal(steps[0].remainderOut, 3n);

  const history = store2.listReports();
  assert.equal(history.length, 2);
  store2.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
