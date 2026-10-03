import { DatabaseSync } from "node:sqlite";
import * as fs from "node:fs";
import * as path from "node:path";
import { ExpansionResult } from "./core/expand";

export interface ReportRow {
  id: number;
  input_numerator: string;
  input_denominator: string;
  norm_numerator: string;
  norm_denominator: string;
  budget: number;
  algorithm_version: string;
  complete: number;
  terminated: number;
  display: string;
  non_repeating: string;
  repeating: string;
  remainder: string | null;
  created_at: string;
}

export class ReportStore {
  private db: DatabaseSync;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        input_numerator TEXT NOT NULL,
        input_denominator TEXT NOT NULL,
        norm_numerator TEXT NOT NULL,
        norm_denominator TEXT NOT NULL,
        budget INTEGER NOT NULL,
        algorithm_version TEXT NOT NULL,
        complete INTEGER NOT NULL,
        terminated INTEGER NOT NULL,
        display TEXT NOT NULL,
        non_repeating TEXT NOT NULL,
        repeating TEXT NOT NULL,
        remainder TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS steps (
        report_id INTEGER NOT NULL REFERENCES reports(id),
        position INTEGER NOT NULL,
        remainder_before TEXT NOT NULL,
        digit INTEGER NOT NULL,
        remainder_after TEXT NOT NULL,
        PRIMARY KEY (report_id, position)
      );
    `);
  }

  saveReport(
    inputNum: string,
    inputDen: string,
    normNum: bigint,
    normDen: bigint,
    result: ExpansionResult,
    algorithmVersion: string
  ): number {
    const insert = this.db.prepare(`
      INSERT INTO reports (input_numerator, input_denominator, norm_numerator, norm_denominator,
        budget, algorithm_version, complete, terminated, display, non_repeating, repeating, remainder)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = insert.run(
      inputNum, inputDen, normNum.toString(), normDen.toString(),
      result.budget, algorithmVersion,
      result.complete ? 1 : 0, result.terminated ? 1 : 0,
      result.display, result.nonRepeating, result.repeating, result.remainder
    );
    const id = Number(info.lastInsertRowid);
    const stepStmt = this.db.prepare(
      "INSERT INTO steps (report_id, position, remainder_before, digit, remainder_after) VALUES (?, ?, ?, ?, ?)"
    );
    for (const s of result.steps) {
      stepStmt.run(id, s.position, s.remainderBefore, s.digit, s.remainderAfter);
    }
    return id;
  }

  listReports(limit = 50): ReportRow[] {
    return this.db
      .prepare("SELECT * FROM reports ORDER BY id DESC LIMIT ?")
      .all(limit) as unknown as ReportRow[];
  }

  getReport(id: number): ReportRow | null {
    const row = this.db.prepare("SELECT * FROM reports WHERE id = ?").get(id);
    return (row as unknown as ReportRow) ?? null;
  }

  getSteps(id: number) {
    return this.db
      .prepare("SELECT position, remainder_before, digit, remainder_after FROM steps WHERE report_id = ? ORDER BY position")
      .all(id);
  }

  close(): void {
    this.db.close();
  }
}
