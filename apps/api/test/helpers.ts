import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import type { Env } from "../src/env";

type Val = string | number | null;

/** Minimal D1 look-alike over node:sqlite (prepare/bind/run/first/all/batch) so tests run the real SQL without a Workers runtime. */
class Stmt {
  constructor(private db: DatabaseSync, private sql: string, private args: Val[] = []) {}
  bind(...args: Val[]) { return new Stmt(this.db, this.sql, args); }
  async run() { const r = this.db.prepare(this.sql).run(...this.args); return { success: true, results: [], meta: { changes: Number(r.changes) } }; }
  async first<T>() { return (this.db.prepare(this.sql).get(...this.args) as T | undefined) ?? null; }
  async all<T>() { const results = this.db.prepare(this.sql).all(...this.args) as T[]; return { success: true, results, meta: { changes: 0 } }; }
}
class FakeD1 {
  private db = new DatabaseSync(":memory:");
  prepare(sql: string) { return new Stmt(this.db, sql); }
  async batch(stmts: Stmt[]) { const out = []; for (const s of stmts) out.push(await s.run()); return out; }
  exec(sql: string) { this.db.exec(sql); }
}

export async function testEnv(): Promise<{ env: Env; dispose: () => Promise<void> }> {
  const DB = new FakeD1();
  const dir = join(__dirname, "..", "migrations");
  for (const f of readdirSync(dir).sort()) DB.exec(readFileSync(join(dir, f), "utf8"));
  const env = { DB, NEBIUS_API_KEY: "test", MCP_TOKEN: "t", INGEST_SECRET: "i" } as unknown as Env;
  return { env, dispose: async () => {} };
}
