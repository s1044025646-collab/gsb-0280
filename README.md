# 有理数循环小数展开服务

精确有理数十进制展开后端：TypeScript + Node.js + SQLite（`node:sqlite`，无原生依赖、无 Docker、无外部服务）。只做 API 与 CLI。

## 功能

- 输入分子/分母的十进制整数字符串（支持负值与任意大整数），输出规范化分数（约分、分母为正、符号独立、零不带负号）与精确十进制展开。
- 核心为 BigInt 长除法：逐位产生数字并记录每个余数首次出现的小数位；余数为 0 即有限终止，余数重复即切出最短非循环前缀与循环节。不经过 `Number`，不做字符串猜测。
- 展示语法：有限不带括号（`0.125`），循环用括号标记循环节（`0.1(6)`、`0.(142857)`、`-3.(142857)`）。
- 预算（`maxDigits`）：达到位数上限仍未终止时返回 `incomplete` 与当前精确余数，不宣称有限或循环；若终止/确认循环恰好发生在预算边界，仍返回 `complete`。
- 反算：将完整循环小数表示（语法 `[-]整数[.非循环部分[(循环节)]]`）还原为约分分数，例如 `0.(9)` → `1`。带省略号的未完成展开、非法括号、重复符号、零分母都会明确报错。
- SQLite 持久化：保存原输入、规范分数、预算、算法版本、完成状态与全部长除法步骤；换预算会生成新报告，旧报告保留；重启后仍可查看历史与步骤。

## 环境要求

- Windows 本地，Node.js ≥ 22.5（使用内置 `node:sqlite`，会打印一条 ExperimentalWarning，属正常）。

## 命令

```powershell
npm install        # 安装开发依赖（typescript / tsx）
npm run build      # 编译到 dist/
npm test           # 运行全部测试（35 个）
npm start          # 启动 API 服务（默认自动选择空闲端口）
npm run demo       # 演示：短预算未完成 -> 长预算完成 -> 历史与反算
```

CLI（`node dist/cli.js <命令>`，也可用 `npm run cli -- <命令>`）：

```
serve [--port N]                        启动 API（--port 0 或省略时自动选空闲端口）
expand <分子> <分母> [--max-digits N]    精确展开并保存报告（默认预算 1000 位）
parse "<循环小数>"                       反算为约分分数，如 parse "0.1(6)"
history                                 查看历史报告
steps <报告ID>                           查看长除法步骤
demo                                    内置演示
```

## API

默认监听 `http://127.0.0.1:<端口>`（启动日志打印实际端口）。所有错误返回 `{"error":{"code","message"}}`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/fractions` | `{numerator, denominator}` → 规范化分数 |
| POST | `/expansions` | `{numerator, denominator, maxDigits?}` → 展开并保存报告 |
| GET | `/expansions` | 历史报告列表 |
| GET | `/expansions/:id` | 单个报告 |
| GET | `/expansions/:id/steps` | 长除法步骤 |
| POST | `/parse` | `{text}` → 循环小数反算为约分分数 |

错误码：`INVALID_INTEGER`（非法整数字符串）、`ZERO_DENOMINATOR`（零分母）、`INVALID_BUDGET`（非法预算，允许 0–1000000）、`INVALID_SYNTAX`（非法循环小数语法）、`INCOMPLETE_INPUT`（未完成展开参与反算）、`NOT_FOUND`、`BAD_REQUEST`。

示例：

```powershell
# 启动（自动选空闲端口）
node dist/cli.js serve

# 展开 1/7，预算 50 位
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:<端口>/expansions `
  -ContentType 'application/json' -Body '{"numerator":"1","denominator":"7","maxDigits":50}'
# => display: "0.(142857)", status: "complete"
```

## 数据目录

数据库位于项目内 `data/expansions.db`，包含 `reports`（报告）与 `steps`（长除法步骤）两张表。

## 精确性与边界说明

- 所有计算基于 BigInt 整数运算，任何中间结果都是精确的；每一步满足 `余数 × 10 = 数字 × 分母 + 新余数`，且 `0 ≤ 余数 < 分母`（有测试断言）。
- 循环节一定最短：按余数首次出现位置切分，而非在数字串里找重复片段。
- 巨大周期不会跳过：预算耗尽即如实返回 `incomplete`、已生成位数与当前精确余数；加大预算重新计算会产生新报告，旧报告保留原状态。
- 不做分母受限近似、浮点位模式、通用表达式计算或单位换算。
