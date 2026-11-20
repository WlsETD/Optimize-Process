import { openPglite, type Db } from '../src/db/index.ts';
import { migrate } from '../src/db/migrate.ts';

export async function freshDb(): Promise<Db> {
  const db = await openPglite();
  await migrate(db);
  return db;
}

export async function rejects(p: Promise<unknown>, re: RegExp) {
  try { await p; } catch (e: any) { if (re.test(String(e?.message))) return; throw new Error('錯誤訊息不符：' + e?.message); }
  throw new Error('應該失敗卻成功');
}
