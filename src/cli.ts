import * as path from "node:path";
import { ReportStore } from "./db";
import { expand, ALGORITHM_VERSION } from "./core/expand";
import { normalizeFraction, parseIntegerString } from "./core/fraction";
import { expansionToFraction } from "./core/parse";
import { startServer } from "./server";

const DB_PATH = process.env.RDEC_DB ?? path.join(__dirname, "..", "data", "rdec.sqlite");

function out(x: unknown): void {
  console.log(JSON.stringify(x, null, 2));
}

function fail(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  const [code, ...rest] = msg.split(":");
  console.error(JSON.stringify({ error: { code, message: rest.join(":").trim() || code } }));
  process.exit(1);
}

function getFlag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function main(): void {
  const [, , command, ...args] = process.argv;
  const store = new ReportStore(DB_PATH);

  switch (command) {
    case "expand": {
      const [numRaw, denRaw] = args;
      const budgetRaw = getFlag(args, "--budget");
      const budget = budgetRaw === undefined ? 1000 : Number(budgetRaw);
      const n = parseIntegerString(numRaw, "numerator");
      const d = parseIntegerString(denRaw, "denominator");
      const f = normalizeFraction(n, d);
      const result = expand(f.numerator, f.denominator, budget);
      const id = store.saveReport(numRaw, denRaw, f.numerator, f.denominator, result, ALGORITHM_VERSION);
      out({ reportId: id, fraction: { numerator: f.numerator.toString(), denominator: f.denominator.toString() }, ...result, steps: undefined });
      break;
    }
    case "parse": {
      const f = expansionToFraction(args[0]);
      out({ numerator: f.numerator.toString(), denominator: f.denominator.toString() });
      break;
    }
    case "reports": {
      out(store.listReports());
      break;
    }
    case "steps": {
      const id = Number(args[0]);
      const report = store.getReport(id);
      if (!report) throw new Error("NOT_FOUND:报告不存在");
      out({ report, steps: store.getSteps(id) });
      break;
    }
    case "serve": {
      const portRaw = getFlag(args, "--port") ?? process.env.PORT ?? "0";
      const port = Number(portRaw);
      if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw new Error("INVALID_PORT:端口必须是 0-65535 的整数（0 表示自动选择空闲端口）");
      }
      startServer(store, port).then(({ port: actual }) => {
        console.log(`API 服务已启动: http://127.0.0.1:${actual}`);
      });
      return; // 保持进程运行
    }
    default:
      console.error(`用法:
  rdec expand <分子> <分母> [--budget N]   精确展开并保存报告
  rdec parse "<循环小数>"                   反算为约分分数，如 "0.1(6)"
  rdec reports                             查看历史报告
  rdec steps <报告ID>                       查看长除法步骤
  rdec serve [--port N]                    启动 API（默认自动选空闲端口）`);
      process.exitCode = 1;
  }
  store.close();
}

try {
  main();
} catch (err) {
  fail(err);
}
