import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, rejects } from './helpers.ts';
import { migrate } from '../src/db/migrate.ts';
import { audit, SYSTEM } from '../src/services/audit.ts';

test('migration 可重複執行（第二次不做事）', async () => {
  const db = await freshDb();
  assert.deepEqual(await migrate(db), []);
  await db.close();
});

test('稽核只能新增：UPDATE、DELETE、TRUNCATE 都被擋', async () => {
  const db = await freshDb();
  await audit(db, SYSTEM, '測試', 'X', '第一筆');
  await rejects(db.query("UPDATE audit SET detail='改'"), /只能新增/);
  await rejects(db.query('DELETE FROM audit'), /只能新增/);
  await rejects(db.query('TRUNCATE audit'), /只能新增/);
  const r = await db.query('SELECT detail FROM audit');
  assert.deepEqual(r.rows.map(x => x.detail), ['第一筆']);
  await db.close();
});

test('原始訊息不可改、不可刪；訂單狀態可以改', async () => {
  const db = await freshDb();
  await db.query("INSERT INTO people(id,name,role) VALUES ('P-02','業務 A','sales')");
  const { rows: [m] } = await db.query("INSERT INTO raw_messages(source,text,sender_id) VALUES ('WEB','原文','P-02') RETURNING id");
  await rejects(db.query("UPDATE raw_messages SET text='改過' WHERE id=$1", [m.id]), /只能新增/);
  await rejects(db.query('DELETE FROM raw_messages WHERE id=$1', [m.id]), /只能新增/);
  await db.query("INSERT INTO orders(id,raw_message_id,status,created_by) VALUES ('A-0001',$1,'received','P-02')", [m.id]);
  await db.query("UPDATE orders SET status='queued' WHERE id='A-0001'");
  assert.equal((await db.query("SELECT status FROM orders")).rows[0].status, 'queued');
  assert.equal((await db.query('SELECT text FROM raw_messages')).rows[0].text, '原文');
  await db.close();
});

test('決定表本身也擋：客戶期限早於完成日、改期限沒寫原因', async () => {
  const db = await freshDb();
  await db.query("INSERT INTO people(id,name,role) VALUES ('P-02','業務 A','sales'),('P-04','生管 A','planner')");
  const { rows: [m] } = await db.query("INSERT INTO raw_messages(source,text) VALUES ('WEB','x') RETURNING id");
  await db.query("INSERT INTO orders(id,raw_message_id,status) VALUES ('A-0001',$1,'queued')", [m.id]);
  await db.query("INSERT INTO param_versions(ver,params,created_by) VALUES (1,'{}','系統')");
  await db.query("INSERT INTO queue_versions(ver,items,source,created_by) VALUES (1,'[]','seed','系統')");
  await db.query("INSERT INTO calcs(id,order_id,rev,param_ver,queue_ver,as_of,fingerprint,input,result) VALUES ('A-0001 r1','A-0001',1,1,1,'{}','f','{}','{}')");
  const ins = (type: string, c: string, p: string, reason: string | null) => db.query(
    "INSERT INTO decisions(order_id,calc_id,type,cand_k,completion_date,promise_date,reason,by_person) VALUES ('A-0001','A-0001 r1',$1,0,$2,$3,$4,'P-04')", [type, c, p, reason]);
  await rejects(ins('adopt', '2026-11-20', '2026-11-19', null), /check/i);
  await rejects(ins('adopt', '2026-11-20', '2026-11-23', null), /check/i);
  await rejects(ins('adjust', '2026-11-20', '2026-11-20', '短'), /check/i);
  await ins('adopt', '2026-11-20', '2026-11-20', null);
  await ins('adopt', '2026-11-20', '2026-11-23', '客戶要留緩衝');
  const { rows } = await db.query('SELECT promise_date FROM decisions ORDER BY id');
  assert.deepEqual(rows.map(r => r.promise_date), ['2026-11-20', '2026-11-23']);
  await db.close();
});
