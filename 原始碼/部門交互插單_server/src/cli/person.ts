/* 後台畫面完成前的暫用工具：新增人員、產生一次性綁定碼、解除綁定、列出人員。
   用法：
     npm run person -- add P-02 業務A sales
     npm run person -- code P-02
     npm run person -- unbind P-02
     npm run person -- list
   角色：boss 老闆、sales 業務、planner 生管、lead 生管主管、admin 管理者 */
import { openDb } from '../db/index.ts';
import { migrate } from '../db/migrate.ts';
import { loadConfig } from '../config.ts';
import { SimLine } from '../line/client.ts';
import { makeJobs } from '../jobs.ts';
import { addPerson, issueBindCode, unbind, ROLE_LABEL, type Role } from '../services/people.ts';
import { ensureSeed } from '../services/params.ts';
import type { Deps } from '../deps.ts';

const [cmd, id, name, role] = process.argv.slice(2);
const by = { id: 'cli', name: process.env.USERNAME || process.env.USER || '管理者（指令列）', role: 'admin' };
const db = await openDb();
await migrate(db);
await ensureSeed(db);
const d: Deps = { db, cfg: loadConfig(), line: new SimLine(), jobs: makeJobs(), llm: null, now: () => new Date(),
  verifyId: async () => { throw new Error('指令列不驗 LINE 身分'); } };

try {
  if (cmd === 'add' && id && name && role && role in ROLE_LABEL) {
    await addPerson(d, { id, name, role: role as Role }, by);
    console.log(`已新增 ${id} ${name}（${ROLE_LABEL[role as Role]}）`);
  } else if (cmd === 'code' && id) {
    const { code, expiresAt } = await issueBindCode(d, id, by);
    console.log(`${id} 的一次性綁定碼：${code}（到 ${expiresAt.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })} 失效；請當面或私訊給本人）`);
  } else if (cmd === 'unbind' && id) {
    await unbind(d, id, by);
    console.log(`已解除 ${id} 的 LINE 綁定`);
  } else if (cmd === 'list') {
    const { rows } = await db.query('SELECT id, name, role, line_user_id IS NOT NULL AS bound FROM people ORDER BY id');
    for (const r of rows) console.log(`${r.id}\t${r.name}\t${ROLE_LABEL[r.role as Role]}\t${r.bound ? '已綁定' : '未綁定'}`);
  } else {
    console.log('用法：add <編號> <名字> <boss|sales|planner|lead|admin>｜code <編號>｜unbind <編號>｜list');
    process.exitCode = 1;
  }
} finally { await db.close(); }
