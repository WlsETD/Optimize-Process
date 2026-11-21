/* 昇嶺電子 單一插單入口 Demo v2 — 自動示範
   按「自動示範」後，用畫面上真的按鈕把每個情境走一遍：游標移動、框出重點、旁白說明。
   不另外寫一套假流程；資料和手動操作完全一樣，示範完可以接著自己按。 */
(function (root) {
  'use strict';
  const A = root.App;
  const T = A.tour = { active: false };
  const reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const defaultSpeed = 2;
  const speeds = [0.6, 1, 2, 3];
  let speed = defaultSpeed, paused = false, stopped = false;
  let cur, ring, card, shield, elCh, elTx, elBar, elPause, elSpeed;

  class Stop extends Error {}

  /* ---------- 等待：會暫停、會依速度縮短、按結束就中斷 ---------- */
  // 用實際經過的時間扣（分頁切到背景時計時器會被放慢，這樣切回來不會整段卡住）
  async function wait(ms) {
    let left = ms, last = performance.now();
    while (left > 0) {
      if (stopped) throw new Stop();
      await sleep(Math.max(10, Math.min(40, left / speed)));
      const now = performance.now();
      if (!paused) left -= (now - last) * speed;
      last = now;
    }
    if (stopped) throw new Stop();
  }
  const visible = el => el && el.getClientRects().length > 0;
  function pick(sel) {
    if (typeof sel === 'function') return sel();
    const all = [...document.querySelectorAll(sel)].filter(visible);
    return all[all.length - 1] || null;   // 聊天訊息取最新一則
  }
  async function find(sel, optional) {
    for (let i = 0; i < 60; i++) {
      const el = pick(sel);
      if (el) return el;
      await wait(100);
    }
    if (optional) return null;
    throw new Error('找不到畫面上的「' + sel + '」');
  }

  /* ---------- 畫面元件 ---------- */
  function mount() {
    shield = document.createElement('div'); shield.className = 'tour-shield';
    shield.title = '自動示範中；按「結束」可以自己操作';
    ring = document.createElement('div'); ring.className = 'tour-ring';
    cur = document.createElement('div'); cur.className = 'tour-cur';
    cur.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 2l16 9.5-7.2 1.6L9 20.5z" fill="#fff" stroke="#14212E" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    card = document.createElement('section'); card.className = 'tour-card'; card.setAttribute('aria-label', '自動示範');
    card.innerHTML = '<div class="tour-bar" aria-hidden="true"><i></i></div>' +
      '<div class="tour-ch"></div><p class="tour-tx" aria-live="polite"></p>' +
      '<div class="tour-act"><button type="button" class="tour-b" data-tour="pause">暫停</button>' +
      '<button type="button" class="tour-b" data-tour="speed">速度 ' + speed + '×</button>' +
      '<button type="button" class="tour-b end" data-tour="stop">結束示範</button></div>';
    document.body.append(shield, ring, cur, card);
    elCh = card.querySelector('.tour-ch'); elTx = card.querySelector('.tour-tx'); elBar = card.querySelector('.tour-bar i');
    elPause = card.querySelector('[data-tour=pause]'); elSpeed = card.querySelector('[data-tour=speed]');
    card.addEventListener('click', e => {
      const b = e.target.closest('[data-tour]'); if (!b) return;
      const k = b.dataset.tour;
      if (k === 'pause') { paused = !paused; b.textContent = paused ? '繼續' : '暫停'; card.classList.toggle('paused', paused); }
      if (k === 'speed') { speed = speeds[(speeds.indexOf(speed) + 1) % speeds.length]; b.textContent = '速度 ' + (speed === 0.6 ? '慢' : speed + '×'); }
      if (k === 'stop' || k === 'close') { stopped = true; if (k === 'close' || !T.active) finish(); }
      if (k === 'again') { finish(); start(); }
    });
    const x = innerWidth / 2, y = innerHeight / 2;
    cur.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    document.body.classList.add('touring');
  }
  function finish() {
    [shield, ring, cur, card].forEach(el => el && el.remove());
    shield = ring = cur = card = null;
    document.body.classList.remove('touring');
    T.active = false;
  }

  /* ---------- 動作 ---------- */
  let chN = 0;
  function chapter(n, title) {
    chN = n;
    elCh.innerHTML = '<span class="n">情境 ' + n + '／' + CHAPTERS + '</span>' + title;
    elBar.style.width = ((n - 1) / CHAPTERS * 100) + '%';
    elTx.textContent = '';
  }
  async function say(text) {
    elTx.classList.remove('in'); void elTx.offsetWidth;
    elTx.textContent = text; elTx.classList.add('in');
    await wait(Math.max(1700, text.length * 75));
  }
  async function point(el) {
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    await wait(500);
    const r = el.getBoundingClientRect();
    Object.assign(ring.style, { left: (r.left - 5) + 'px', top: (r.top - 5) + 'px', width: (r.width + 10) + 'px', height: (r.height + 10) + 'px', opacity: 1 });
    const x = r.left + Math.min(r.width / 2, 60), y = r.top + Math.min(r.height / 2, 22);
    cur.style.transitionDuration = reduce ? '0s' : (650 / speed) + 'ms';
    cur.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    await wait(reduce ? 150 : 700);
  }
  const hideRing = () => { if (ring) ring.style.opacity = 0; };

  // 框出一塊畫面並說明（找不到就只說明）
  async function show(sel, text) {
    const el = await find(sel, true);
    if (el) await point(el);
    await say(text);
    hideRing();
  }
  // 移到按鈕上、按下去
  async function click(sel, text) {
    const el = await find(sel);
    await point(el);
    if (text) await say(text);
    cur.classList.add('down');
    await wait(220);
    cur.classList.remove('down');
    el.click();
    hideRing();
    await wait(900);
  }
  // 一個字一個字打進輸入框
  async function type(sel, text, say1) {
    const el = await find(sel);
    await point(el);
    if (say1) await say(say1);
    el.focus({ preventScroll: true }); el.value = '';
    for (const ch of text) {
      el.value += ch;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      await wait(reduce ? 10 : 85);
    }
    hideRing();
    await wait(500);
  }
  const role = (k, text) => click('[data-act=role][data-k=' + k + ']', text);
  // 單選鈕本身是隱藏的 1px 元素；指向並點它的標籤（點標籤一樣會觸發 change）
  const label = sel => { const f = () => { const i = pick(sel); return i && i.closest('label'); }; f.toString = () => sel; return f; };

  /* ---------- 腳本：每個情境都用真的按鈕 ---------- */
  const CHAPTERS = 8;
  async function script() {
    const st = () => A.st;
    A.reset(); A.go('boss');
    await wait(300);

    chapter(1, '老闆收到客戶訊息，轉給官方帳號');
    await say('客戶在 LINE 跟老闆說要插單。老闆不用回覆交期，只要把訊息轉傳給官方帳號「昇嶺插單」。');
    await click('[data-act=fwd][data-k=full]', '真實情境是長按訊息 →「轉傳」。這裡用按鈕代替。');
    await show('.ph-chat .msg', '官方帳號立刻回「已收單」。老闆端只收訊息，沒有欄位要填，也不再口頭答應交期。');

    chapter(2, '業務在 LINE 確認新單');
    await role('sales', '切到業務 A 的 LINE。');
    await show('.ph-chat .fx', 'AI 已把原文拆成欄位，推一則「新單待確認」給業務。');
    await click('.ph-chat [data-act=liff][data-page=confirm]', '點「開啟確認頁」，在 LINE 裡打開小網頁。');
    await show('.liff .raw', '上面是原文，不能改；底線是 AI 取值的位置。');
    await show('.liff .lf', '下面是欄位草稿。信心不夠的會標紅，一定要業務確認才能送出。');
    await click('.liff [data-act=submit]', '欄位都齊了，按「確認送出」。系統立刻試算，交給生管。');
    await click('.liff [data-act=liff-close]');

    chapter(3, '生管看試算，決定可交日');
    await role('planner', '切到生管看板（電腦網頁）。');
    await show('.concl', 'AI 先給一行結論：建議插在哪張單後面、多幾次換線、罰款增加多少。');
    await show('.pl-side .panel', '右邊是排程預覽，橘色那塊就是這張插單的位置。');
    await click('.pl-detail [data-act=adopt]', 'AI 只給建議，由生管決定。按「採用建議」，可交日會推到業務和老闆的 LINE。');

    chapter(4, '業務回覆客戶，老闆收到可交日');
    await role('sales', '回到業務的 LINE。');
    await click('.ph-chat [data-act=liff][data-page=reply]', '收到「可交日已決定」，點「開啟回覆草稿」。');
    await show('.liff .cmpdue', '客戶要求和可交日並排。日期一律來自試算，AI 只能改措辭。');
    await click('.liff [data-act=copy]', '按「複製回覆」貼給客戶。系統記下交期、時間和試算編號。');
    await click('.liff [data-act=liff-close]');
    await role('boss', '再看老闆的 LINE。');
    await show('.ph-chat .fx', '老闆收到「可交日」卡片：誰決定、依據哪一版試算、業務已經回覆客戶。');

    chapter(5, '客戶打電話來下單');
    await role('sales', '這次客戶直接打電話給業務，沒有 LINE 訊息可以轉傳。');
    await click(label('input[name=webSrc][value="電話"]'),'在「網頁備援入口」把來源選「電話」。');
    await type('#webText', '乙那邊要插一張 B2，11/20 要，零件不變', '把客戶在電話裡講的話，照原樣打一行。');
    await click('#btnWeb', '按「登錄原文」。一樣會解析、一樣要確認，原文一樣不能改。');
    await show('.liff .kv', '來源記成「電話」，誰登錄、幾點收到都留下來。');
    await show('.liff .fuq', '電話裡沒講數量。AI 不會亂猜，而是直接追問業務。');
    if (await find('#fu_qty', true)) {
      await type('#fu_qty', '500', '業務回撥問到：500 片。');
      await click('.liff [data-act=fu-set][data-f=qty]');
    }
    for (let i = 0; i < 4; i++) {            // 其他追問（若有）選第一個選項
      const chip = pick('.liff .fuq .chip-btn'); if (!chip) break;
      await click('.liff .fuq .chip-btn', '再回答一題追問。');
    }
    await click('.liff [data-act=submit]', '都補齊了，確認送出，一樣交給生管試算。');
    await click('.liff [data-act=liff-close]');

    chapter(6, 'LINE 斷線時');
    await role('admin', '假設 LINE 官方帳號故障。到後台。');
    await click('[data-act=atab][data-k=line]', '打開「LINE 紀錄」。');
    await click('[data-act=line-toggle]', '按「模擬斷線」。');
    await role('boss', '老闆照常轉傳一則訊息……');
    await click('[data-act=fwd][data-k=vague]');
    await show('.ph-chat .sysmsg', '訊息沒送到，系統不會建單。畫面提醒老闆改打電話給業務，業務就用剛才的電話登錄。');
    await role('admin', '回到後台。');
    await click('[data-act=line-toggle]', '按「恢復連線」。斷線期間沒送出的通知會自動補送。');

    chapter(7, '還沒綁定的帳號');
    await role('sales', '換一位還沒綁定 LINE 的業務 B。');
    await click(label('input[name=salesId][value="P-03"]'));
    await click('[data-act=unbound-say]', '業務 B 傳訊息給官方帳號……');
    await show('.ph-chat .fx', '沒綁定的帳號，訊息一律不處理，只回綁定說明。這樣才分得清誰說了什麼。');
    await click('.ph-chat [data-act=liff][data-page=bind]', '按「綁定帳號」。');
    const p3 = st().person('P-03');
    await type('#bindCode', (p3 && p3.code) || 'K7Q2-9F', '輸入管理者給的一次性綁定碼。');
    await click('#btnBind', '按「綁定」。之後新單通知就會傳到這個 LINE。');
    A.ui.salesId = 'P-02'; A.ui.liff = null;

    chapter(8, '沒人處理時自動提醒，每一步都留紀錄');
    await say('剛才電話那張單還在等生管決定。用上方的時鐘快轉，看看沒人處理會怎樣。');
    await click('[data-act=clock][data-min="120"]', '時間 +2 小時。');
    await click('[data-act=clock][data-min="120"]', '再 +2 小時。');
    await role('planner');
    await show('.pl-list .wait', '等太久會標「逾時」，再久就升級通知生管主管，不會推給老闆。');
    await role('admin');
    await click('[data-act=atab][data-k=audit]', '最後看稽核紀錄。');
    await show('.audit', '剛才每一步：誰、幾點、做了什麼，全都在這裡。只能追加，不能改也不能刪。');

    elBar.style.width = '100%';
    elCh.innerHTML = '<span class="n">示範結束</span>八個情境都走完了';
    elTx.textContent = '畫面停在示範後的狀態，可以接著自己點。按「重設 Demo」可以從頭開始。';
    card.querySelector('.tour-act').innerHTML = '<button type="button" class="tour-b" data-tour="again">再看一次</button><button type="button" class="tour-b end" data-tour="close">關閉</button>';
    shield.remove(); shield = null; cur.style.opacity = 0;
    T.active = false;
  }

  async function start() {
    if (T.active) return;
    stopped = false; paused = false; speed = defaultSpeed;
    T.active = true;
    mount();
    try {
      await script();
    } catch (e) {
      if (e instanceof Stop) { finish(); return; }
      console.error(e);
      if (card) {
        elTx.textContent = '示範中斷：' + e.message + '。可以按「重設 Demo」後再試一次。';
        card.querySelector('.tour-act').innerHTML = '<button type="button" class="tour-b end" data-tour="close">關閉</button>';
        if (shield) { shield.remove(); shield = null; }
      }
      T.active = false;
    }
  }

  document.addEventListener('click', e => {
    if (e.target.closest('[data-act=tour]')) start();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && card) { stopped = true; if (!T.active) finish(); }
  });
  T.start = start;
})(window);
