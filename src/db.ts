import { DatabaseSync } from "node:sqlite";
import * as fs from "node:fs";
import * as path from "node:path";
import { ALGO_VERSION, DivisionStep, ExpansionResult } from "./expand";
import { Rational } from "./fraction";

export interface ReportRow {
  id: number;
  inputNumerator: string;
  inputDenominator: string;
  sign: number;
  normNumerator: string;
  normDenominator: string;
  maxDigits: number;
  algoVersion: string;
  status: "complete" | "incomplete";
  kind: string;
  integerPart: string;
  prefix: string;
  repetend: string;
  digitsGenerated: number;
  currentRemainder: string | null;
  display: string;
  createdAt: string;
}

export class ReportStore {
  private db: DatabaseSync;

  constructor(dbPath: string) {
    if (dbPath !== ":memory:") {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        input_numerator TEXT NOT NULL,
        input_denominator TEXT NOT NULL,
        sign INTEGER NOT NULL,
        norm_numerator TEXT NOT NULL,
        norm_denominator TEXT NOT NULL,
        max_digits INTEGER NOT NULL,
        algo_version TEXT NOT NULL,
        status TEXT NOT NULL,
        kind TEXT NOT NULL,
        integer_part TEXT NOT NULL,
        prefix TEXT NOT NULL,
        repetend TEXT NOT NULL,
        digits_generated INTEGER NOT NULL,
        current_remainder TEXT,
        display TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE TABLE IF NOT EXISTS steps (
        report_id INTEGER NOT NULL REFERENCES reports(id),
        position INTEGER NOT NULL,
        remainder_in TEXT NOT NULL,
        digit INTEGER NOT NULL,
        remainder_out TEXT NOT NULL,
        PRIMARY KEY (report_id, position)
      );
    `);
  }

  saveReport(
    inputNumerator: string,
    inputDenominator: string,
    frac: Rational,
    maxDigits: number,
    result: ExpansionResult,
    display: string,
  ): number {
    const insert = this.db.prepare(`
      INSERT INTO reports (
        input_numerator, input_denominator, sign, norm_numerator, norm_denominator,
        max_digits, algo_version, status, kind, integer_part, prefix, repetend,
        digits_generated, current_remainder, display
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = insert.run(
      inputNumerator,
      inputDenominator,
      frac.sign,
      frac.num.toString(),
      frac.den.toString(),
      maxDigits,
      ALGO_VERSION,
      result.complete ? "complete" : "incomplete",
      result.kind,
      result.integerPart.toString(),
      result.prefix,
      result.repetend,
      result.digitsGenerated,
      result.currentRemainder === null ? null : result.currentRemainder.toString(),
      display,
    );
    const id = Number(info.lastInsertRowid);
    const insertStep = this.db.prepare(
      "INSERT INTO steps (report_id, position, remainder_in, digit, remainder_out) VALUES (?, ?, ?, ?, ?)",
    );
    for (const step of result.steps) {
      insertStep.run(id, step.position, step.remainderIn.toString(), step.digit, step.remainderOut.toString());
    }
    return id;
  }

  private mapRow(row: Record<string, unknown>): ReportRow {
    return {
      id: Number(row.id),
      inputNumerator: String(row.input_numerator),
      inputDenominator: String(row.input_denominator),
      sign: Number(row.sign),
      normNumerator: String(row.norm_numerator),
      normDenominator: String(row.norm_denominator),
      maxDigits: Number(row.max_digits),
      algoVersion: String(row.algo_version),
      status: row.status as "complete" | "incomplete",
      kind: String(row.kind),
      integerPart: String(row.integer_part),
      prefix: String(row.prefix),
      repetend: String(row.repetend),
      digitsGenerated: Number(row.digits_generated),
      currentRemainder: row.current_remainder === null ? null : String(row.current_remainder),
      display: String(row.display),
      createdAt: String(row.created_at),
    };
  }

  getReport(id: number): ReportRow | null {
    const row = this.db.prepare("SELECT * FROM reports WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.mapRow(row) : null;
  }

  listReports(limit = 50): ReportRow[] {
    const rows = this.db
      .prepare("SELECT * FROM reports ORDER BY id DESC LIMIT ?")
      .all(limit) as unknown as Record<string, unknown>[];
    return rows.map((r) => this.mapRow(r));
  }

  getSteps(reportId: number): DivisionStep[] {
    const rows = this.db
      .prepare("SELECT position, remainder_in, digit, remainder_out FROM steps WHERE report_id = ? ORDER BY position")
      .all(reportId) as unknown as Record<string, unknown>[];
    return rows.map((r) => ({
      position: Number(r.position),
      remainderIn: BigInt(String(r.remainder_in)),
      digit: Number(r.digit),
      remainderOut: BigInt(String(r.remainder_out)),
    }));
  }

  close(): void {
    this.db.close();
  }
}

export function defaultDbPath(): string {
  return path.join(process.cwd(), "data", "expansions.db");
}
