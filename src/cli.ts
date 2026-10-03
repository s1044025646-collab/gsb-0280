import { ReportStore, defaultDbPath } from "./db";
import { expand, formatExpansion } from "./expand";
import { normalize, parseInteger, rationalToString } from "./fraction";
import { repeatingDecimalToRational } from "./parse";
import { startServer, DEFAULT_MAX_DIGITS } from "./server";
import { ApiError } from "./errors";

function argValue(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : undefined;
}

function printReport(store: ReportStore, id: number): void {
  const report = store.getReport(id);
  if (!report) throw new ApiError("NOT_FOUND", `报告 ${id} 不存在`, 404);
  console.log(`报告 #${report.id}  输入 ${report.inputNumerator}/${report.inputDenominator}`);
  console.log(`  规范分数: ${report.sign < 0 ? "-" : ""}${report.normNumerator}/${report.normDenominator}`);
  console.log(`  预算: ${report.maxDigits} 位  状态: ${report.status}  类型: ${report.kind}`);
  console.log(`  展开: ${report.display}`);
  if (report.currentRemainder !== null) {
    console.log(`  当前精确余数: ${report.currentRemainder}`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  const store = new ReportStore(defaultDbPath());

  switch (command) {
    case "serve": {
      const portText = argValue(args, "--port");
      const port = portText === undefined ? 0 : Number(portText);
      if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw new ApiError("BAD_REQUEST", "--port 必须是 0-65535 的整数（0 表示自动选择空闲端口）");
      }
      await startServer(store, port);
      return; // 服务常驻
    }
    case "expand": {
      const num = parseInteger(args[1], "numerator");
      const den = parseInteger(args[2], "denominator");
      const budgetText = argValue(args, "--max-digits");
      const maxDigits = budgetText === undefined ? DEFAULT_MAX_DIGITS : Number(budgetText);
      if (!Number.isInteger(maxDigits) || maxDigits < 0) {
        throw new ApiError("INVALID_BUDGET", "--max-digits 必须是非负整数");
      }
      const frac = normalize(num, den);
      const result = expand(frac, maxDigits);
      const display = formatExpansion(result);
      const id = store.saveReport(num.toString(), den.toString(), frac, maxDigits, result, display);
      console.log(`规范分数: ${rationalToString(frac)}`);
      console.log(`展开: ${display}`);
      console.log(`状态: ${result.complete ? "complete" : "incomplete"} (${result.kind})，已生成 ${result.digitsGenerated} 位，报告 #${id}`);
      if (result.currentRemainder !== null) {
        console.log(`当前精确余数: ${result.currentRemainder}`);
      }
      break;
    }
    case "parse": {
      const frac = repeatingDecimalToRational(args[1]);
      console.log(`反算结果: ${rationalToString(frac)}`);
      break;
    }
    case "history": {
      for (const r of store.listReports()) {
        console.log(`#${r.id}  ${r.inputNumerator}/${r.inputDenominator}  预算 ${r.maxDigits}  ${r.status}  ${r.display}`);
      }
      break;
    }
    case "steps": {
      const id = Number(args[1]);
      if (!Number.isInteger(id)) throw new ApiError("BAD_REQUEST", "用法: steps <报告ID>");
      const report = store.getReport(id);
      if (!report) throw new ApiError("NOT_FOUND", `报告 ${id} 不存在`, 404);
      printReport(store, id);
      for (const s of store.getSteps(id)) {
        console.log(`  位 ${s.position}: 余数 ${s.remainderIn} -> 数字 ${s.digit} -> 余数 ${s.remainderOut}`);
      }
      break;
    }
    case "demo": {
      console.log("== 短预算：1/7 只生成 3 位 ==");
      const frac = normalize(1n, 7n);
      const r1 = expand(frac, 3);
      const id1 = store.saveReport("1", "7", frac, 3, r1, formatExpansion(r1));
      printReport(store, id1);
      console.log("\n== 加大预算重新计算：1/7 生成 100 位 ==");
      const r2 = expand(frac, 100);
      const id2 = store.saveReport("1", "7", frac, 100, r2, formatExpansion(r2));
      printReport(store, id2);
      console.log("\n== 历史记录（旧报告保留未完成状态）==");
      for (const r of store.listReports()) {
        console.log(`#${r.id}  ${r.inputNumerator}/${r.inputDenominator}  预算 ${r.maxDigits}  ${r.status}  ${r.display}`);
      }
      console.log("\n== 反算演示：0.(9) ==");
      console.log(`0.(9) => ${rationalToString(repeatingDecimalToRational("0.(9)"))}`);
      break;
    }
    default:
      console.log(`用法:
  serve [--port N]           启动 API 服务（默认自动选择空闲端口）
  expand <分子> <分母> [--max-digits N]   精确展开并保存报告
  parse "<循环小数>"          将完整循环小数表示反算为约分分数，如 "0.1(6)"
  history                    查看历史报告
  steps <报告ID>              查看长除法步骤
  demo                       演示短预算未完成 + 长预算完成`);
  }
  store.close();
}

main().catch((err) => {
  if (err instanceof ApiError) {
    console.error(`错误 [${err.code}]: ${err.message}`);
  } else {
    console.error(err);
  }
  process.exitCode = 1;
});
