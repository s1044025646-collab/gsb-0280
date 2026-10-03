# rdec — 有理数循环小数精确展开后端

纯本地运行的 TypeScript + Node.js + SQLite 后端，提供精确有理数十进制展开、
循环节定位、长除法步骤查看、历史报告与循环小数反算。仅 API 与 CLI，无前端。

## 精确值语义

- 输入为分子、非零分母的**十进制整数字符串**（任意大小，BigInt 处理，不经 Number）。
- 规范化：符号只保留在分子上，分母恒为正，结果约分到最简；零恒为 `0/1`，不带负号。
- 展开用 BigInt 长除法：每一步由当前余数产生一位数字并更新余数，
  记录每个余数**首次出现的小数位序号**；余数为 0 即有限终止，
  余数再次出现即精确切出最短非循环前缀与循环节。不做浮点猜测、不做模式匹配。
- 反算（循环小数 → 分数）使用整数等式
  `value = int.frac + rep / (10^len(frac) * (10^len(rep) - 1))`，结果约分。

## 展示语法

| 含义 | 语法 | 示例 |
| --- | --- | --- |
| 整数 | `[-]digits` | `3`、`-12` |
| 有限小数 | `[-]int.frac` | `0.125`（1/8） |
| 纯循环 | `[-]int.(rep)` | `0.(142857)`（1/7） |
| 混循环 | `[-]int.frac(rep)` | `0.1(6)`（1/6） |
| 未完成 | 尾部 `…` | `0.142…`（仅展示，不可反算） |

`0.(9)` 反算为 `1/1`，再展开为规范整数 `1`。

## 预算边界

- `budget` 为最多生成的小数位数（默认 1000，上限 1,000,000）。
- 达到预算仍未出现零余数或重复余数：`complete=false`，返回当前精确余数 `remainder`，
  不宣称有限尾部或完整循环节。
- 恰好在预算那一步终止或发现循环：仍返回 `complete=true`。
- 换预算重新展开会生成**新报告**，旧的未完成报告原样保留。

## 命令

```powershell
npm install
npm run build     # 编译到 dist/
npm test          # 运行全部测试（tsx + node:test）
npm start         # 启动 API（默认自动选择空闲端口，--port N 或 PORT 指定）
npm run demo      # 演示：短预算未完成 → 长预算得循环 → 历史 → 反算
npm run cli -- expand 1 7 --budget 100
npm run cli -- parse "0.1(6)"
npm run cli -- reports
npm run cli -- steps 1
```

数据保存在项目内 `data/rdec.sqlite`（可用环境变量 `RDEC_DB` 覆盖）。

## CLI

- `expand <分子> <分母> [--budget N]`：精确展开并保存报告（含每步余数）。
- `parse "<循环小数>"`：反算为约分分数。
- `reports`：历史报告列表。
- `steps <报告ID>`：查看该报告的长除法步骤（重启后仍可查看）。
- `serve [--port N]`：启动 HTTP API，`--port 0`（默认）自动选空闲端口。

## API

均返回 JSON；错误为 `{ "error": { "code", "message" } }`。

- `POST /api/fractions` `{numerator, denominator}` → 规范化分数。
- `POST /api/expand` `{numerator, denominator, budget?}` → 展开结果 + `reportId`。
- `GET /api/reports` → 历史报告。
- `GET /api/reports/:id` → 报告 + 长除法步骤。
- `POST /api/parse` `{text}` → 循环小数反算为约分分数。

### 错误码

`ZERO_DENOMINATOR`、`INVALID_INTEGER`、`INVALID_BUDGET`、`INVALID_SYNTAX`、
`INVALID_PARENTHESES`（非法/不成对括号）、`EMPTY_REPETEND`（空循环节）、
`INVALID_JSON`、`NOT_FOUND`、`ROUTE_NOT_FOUND`、`INVALID_PORT`。

重复符号（如 `--1.5`）、括号不在末尾、多对括号、空循环节、非整数字符串均明确报错。

## SQLite 存储

- `reports`：原输入、规范化分数、预算、算法版本（`bigint-long-division-v1`）、
  完整/未完成状态、展示串、未完成时的精确余数、创建时间。
- `steps`：每一步的位置、步前余数、数字、步后余数（每步余数恒满足 `0 ≤ r < 分母`）。

## 限制

- 只做精确分数与循环小数表示；不做分母受限近似、浮点位模式、通用表达式计算、单位换算。
- 巨大周期不会跳过周期直接列全部数字；预算内未完成即诚实报告 `complete=false` 与当前余数。
- 不完整的展开结果（带 `…`）不是合法反算输入。
- 使用 Node.js 内置 `node:sqlite`（需 Node ≥ 22，开发时为实验特性，会有警告，可用 `--no-warnings` 抑制）。
