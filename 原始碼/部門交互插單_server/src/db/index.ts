/* 資料庫介面：正式環境用 Postgres（Cloud SQL），測試與本機用 PGlite（記憶體內的 Postgres）。
   兩者同一套 SQL；日期欄位一律回傳 'YYYY-MM-DD' 字串，bigint 回傳 number。 */
import pg from 'pg';

export interface Queryable {
  query<T = any>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
export interface Db extends Queryable {
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
  kind: 'pg' | 'pglite';
}

const DATE = 1082, INT8 = 20, NUMERIC = 1700;

export async function openPg(url: string): Promise<Db> {
  pg.types.setTypeParser(DATE, (v: string) => v);
  pg.types.setTypeParser(INT8, (v: string) => Number(v));
  pg.types.setTypeParser(NUMERIC, (v: string) => Number(v));
  const pool = new pg.Pool({ connectionString: url, max: 5 });
  return {
    kind: 'pg',
    query: (sql, params) => pool.query(sql, params as any[]) as any,
    async exec(sql) { await pool.query(sql); },
    async tx(fn) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const r = await fn({ query: (s, p) => c.query(s, p as any[]) as any });
        await c.query('COMMIT');
        return r;
      } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
    },
    close: () => pool.end(),
  };
}

export async function openPglite(dataDir?: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  const parsers = { [DATE]: (v: string) => v, [INT8]: (v: string) => Number(v), [NUMERIC]: (v: string) => Number(v) };
  const db = new PGlite({ dataDir, parsers });
  await db.waitReady;
  return {
    kind: 'pglite',
    query: (sql, params) => db.query(sql, params as any[]) as any,
    async exec(sql) { await db.exec(sql); },
    tx: fn => db.transaction(t => fn({ query: (s, p) => t.query(s, p as any[]) as any })),
    close: () => db.close(),
  };
}

export async function openDb(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) return openPg(url);
  return openPglite(process.env.PGLITE_DIR || undefined);
}
