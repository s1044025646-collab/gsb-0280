import * as http from "node:http";
import { AddressInfo } from "node:net";
import { ReportStore } from "./db";
import { expand, ALGORITHM_VERSION } from "./core/expand";
import { normalizeFraction, parseIntegerString } from "./core/fraction";
import { expansionToFraction } from "./core/parse";

const DEFAULT_BUDGET = 1000;
const MAX_BUDGET = 1_000_000;

function json(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(payload);
}

function errorResponse(err: unknown): { status: number; body: unknown } {
  const msg = err instanceof Error ? err.message : String(err);
  const [code, ...rest] = msg.split(":");
  const detail = rest.join(":").trim();
  const known = [
    "ZERO_DENOMINATOR",
    "INVALID_INTEGER",
    "INVALID_BUDGET",
    "INVALID_SYNTAX",
    "INVALID_PARENTHESES",
    "EMPTY_REPETEND",
    "NOT_FOUND",
    "INVALID_JSON",
    "ROUTE_NOT_FOUND",
  ];
  const finalCode = known.includes(code) ? code : "INTERNAL_ERROR";
  const status =
    finalCode === "NOT_FOUND" || finalCode === "ROUTE_NOT_FOUND" ? 404
    : finalCode === "INTERNAL_ERROR" ? 500
    : 400;
  return { status, body: { error: { code: finalCode, message: detail || finalCode } } };
}

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("INVALID_JSON:请求体不是合法 JSON"));
      }
    });
    req.on("error", reject);
  });
}

function parseBudget(raw: unknown): number {
  if (raw === undefined || raw === null) return DEFAULT_BUDGET;
  const b = Number(raw);
  if (!Number.isInteger(b) || b < 0 || b > MAX_BUDGET) {
    throw new Error(`INVALID_BUDGET:预算必须是 0 到 ${MAX_BUDGET} 的整数`);
  }
  return b;
}

export function createServer(store: ReportStore): http.Server {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const path = url.pathname;
      const method = req.method ?? "GET";

      if (method === "POST" && path === "/api/fractions") {
        const body = (await readBody(req)) as Record<string, unknown>;
        const n = parseIntegerString(body.numerator, "numerator");
        const d = parseIntegerString(body.denominator, "denominator");
        const f = normalizeFraction(n, d);
        return json(res, 200, {
          numerator: f.numerator.toString(),
          denominator: f.denominator.toString(),
        });
      }

      if (method === "POST" && path === "/api/expand") {
        const body = (await readBody(req)) as Record<string, unknown>;
        const n = parseIntegerString(body.numerator, "numerator");
        const d = parseIntegerString(body.denominator, "denominator");
        const budget = parseBudget(body.budget);
        const f = normalizeFraction(n, d);
        const result = expand(f.numerator, f.denominator, budget);
        const id = store.saveReport(
          String(body.numerator), String(body.denominator),
          f.numerator, f.denominator, result, ALGORITHM_VERSION
        );
        return json(res, 200, { reportId: id, fraction: { numerator: f.numerator.toString(), denominator: f.denominator.toString() }, ...result, steps: undefined });
      }

      if (method === "GET" && path === "/api/reports") {
        return json(res, 200, { reports: store.listReports() });
      }

      const reportMatch = /^\/api\/reports\/(\d+)$/.exec(path);
      if (method === "GET" && reportMatch) {
        const id = Number(reportMatch[1]);
        const report = store.getReport(id);
        if (!report) throw new Error("NOT_FOUND:报告不存在");
        return json(res, 200, { report, steps: store.getSteps(id) });
      }

      if (method === "POST" && path === "/api/parse") {
        const body = (await readBody(req)) as Record<string, unknown>;
        const f = expansionToFraction(body.text);
        return json(res, 200, {
          numerator: f.numerator.toString(),
          denominator: f.denominator.toString(),
        });
      }

      throw new Error("ROUTE_NOT_FOUND:路由不存在");
    } catch (err) {
      const { status, body } = errorResponse(err);
      json(res, status, body);
    }
  });
}

export function startServer(store: ReportStore, port: number): Promise<{ server: http.Server; port: number }> {
  const server = createServer(store);
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const actual = (server.address() as AddressInfo).port;
      resolve({ server, port: actual });
    });
  });
}

