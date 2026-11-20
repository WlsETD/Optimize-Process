/* 依檔名順序執行 migrations/*.sql；已執行過的記在 schema_migrations。 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import type { Db } from './index.ts';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

export async function migrate(db: Db): Promise<string[]> {
  await db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, at timestamptz NOT NULL DEFAULT now())');
  const done = new Set((await db.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map(r => r.name));
  const ran: string[] = [];
  for (const f of readdirSync(DIR).filter(f => f.endsWith('.sql')).sort()) {
    if (done.has(f)) continue;
    const sql = readFileSync(join(DIR, f), 'utf8');
    await db.tx(async q => {
      for (const stmt of splitSql(sql)) await q.query(stmt);
      await q.query('INSERT INTO schema_migrations(name) VALUES ($1)', [f]);
    });
    ran.push(f);
  }
  return ran;
}

/* 以「單獨一行的 -- ;;」分段，讓函式內的分號不被切開 */
function splitSql(sql: string): string[] {
  return sql.split(/^--\s*;;\s*$/m).map(s => s.trim()).filter(s => s && !/^(--[^\n]*\n?)*$/.test(s));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { openDb } = await import('./index.ts');
  const db = await openDb();
  const ran = await migrate(db);
  console.log(ran.length ? '已執行：' + ran.join('、') : '沒有新的 migration');
  await db.close();
}
