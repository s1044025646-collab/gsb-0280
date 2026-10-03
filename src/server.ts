import * as http from "node:http";
import { AddressInfo } from "node:net";
import { ReportStore } from "./db";
import { ApiError, toErrorBody } from "./errors";
import { expand, formatExpansion } from "./expand";
import { normalize, parseInteger, rationalToString } from "./fraction";
import { repeatingDecimalToRational } from "./parse";

export const DEFAULT_MAX_DIGITS = 1000;
export const MAX_ALLOWED_DIGITS = 1_000_000;

function parseBudget(value: unknown): number {
  if (value === undefined || value === null) return DEFAULT_MAX_DIGITS;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > MAX_ALLOWED_DIGITS) {
    throw new ApiError("INVALID_BUDGET", `maxDigits 必须是 0 到 ${MAX_ALLOWED_DIGITS} 之间的整数`);
  }
  return n;
}

async function readJson(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  if (text.trim() === "") return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError("BAD_REQUEST", "请求体不是合法 JSON");
  }
}

export function createServer(store: ReportStore): http.Server {
  const server = http.createServer(async (req, res) => {
    const send = (status: number, body: unknown) => {
      const payload = JSON.stringify(body);
      res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
      res.end(payload);
    };
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const path = url.pathname;
      const method = req.method ?? "GET";

      if (method === "POST" && path === "/fractions") {
        const body = (await readJson(req)) as Record<string, unknown>;
        const num = parseInteger(body.numerator, "numerator");
        const den = parseInteger(body.denominator, "denominator");
        const frac = normalize(num, den);
        send(200, {
          input: { numerator: num.toString(), denominator: den.toString() },
          normalized: rationalToString(frac),
          sign: frac.sign,
          numerator: frac.num.toString(),
          denominator: frac.den.toString(),
        });
        return;
      }

      if (method === "POST" && path === "/expansions") {
        const body = (await readJson(req)) as Record<string, unknown>;
        const num = parseInteger(body.numerator, "numerator");
        const den = parseInteger(body.denominator, "denominator");
        const maxDigits = parseBudget(body.maxDigits);
        const frac = normalize(num, den);
        const result = expand(frac, maxDigits);
        const display = formatExpansion(result);
        const id = store.saveReport(num.toString(), den.toString(), frac, maxDigits, result, display);
        send(200, {
          id,
          input: { numerator: num.toString(), denominator: den.toString() },
          normalized: rationalToString(frac),
          maxDigits,
          status: result.complete ? "complete" : "incomplete",
          kind: result.kind,
          display,
          integerPart: result.integerPart.toString(),
          prefix: result.prefix,
          repetend: result.repetend,
          digitsGenerated: result.digitsGenerated,
          currentRemainder: result.currentRemainder === null ? null : result.currentRemainder.toString(),
        });
        return;
      }

      if (method === "GET" && path === "/expansions") {
        send(200, { reports: store.listReports() });
        return;
      }

      const expansionMatch = /^\/expansions\/(\d+)$/.exec(path);
      if (method === "GET" && expansionMatch) {
        const report = store.getReport(Number(expansionMatch[1]));
        if (!report) throw new ApiError("NOT_FOUND", `报告 ${expansionMatch[1]} 不存在`, 404);
        send(200, report);
        return;
      }

      const stepsMatch = /^\/expansions\/(\d+)\/steps$/.exec(path);
      if (method === "GET" && stepsMatch) {
        const id = Number(stepsMatch[1]);
        const report = store.getReport(id);
        if (!report) throw new ApiError("NOT_FOUND", `报告 ${id} 不存在`, 404);
        const steps = store.getSteps(id);
        send(200, {
          id,
          steps: steps.map((s) => ({
            position: s.position,
            remainderIn: s.remainderIn.toString(),
            digit: s.digit,
            remainderOut: s.remainderOut.toString(),
          })),
        });
        return;
      }

      if (method === "POST" && path === "/parse") {
        const body = (await readJson(req)) as Record<string, unknown>;
        const frac = repeatingDecimalToRational(body.text);
        send(200, {
          input: body.text,
          normalized: rationalToString(frac),
          sign: frac.sign,
          numerator: frac.num.toString(),
          denominator: frac.den.toString(),
        });
        return;
      }

      throw new ApiError("NOT_FOUND", `未知路由: ${method} ${path}`, 404);
    } catch (err) {
      const { status, body } = toErrorBody(err);
      send(status, body);
    }
  });
  return server;
}

export function startServer(store: ReportStore, port: number): Promise<number> {
  const server = createServer(store);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      const actual = (server.address() as AddressInfo).port;
      console.log(`API 服务已启动: http://127.0.0.1:${actual}`);
      resolve(actual);
    });
  });
}
