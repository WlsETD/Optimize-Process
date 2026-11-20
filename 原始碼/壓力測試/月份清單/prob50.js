/* 50 個種子月份（2026/12～2031/01）重跑：在固定效果強度下，同時達成「出貨 ≥ 該月 ×1.1」與「準時率 ≥ 90%」的月數。
   條件：效果強度 0.50／0.65／0.82／1.00、人工站額外 0／210 人時、接單協商 不算／接受率 25%／50%。
   每個月可以選功能組合（presetCombos，協商只加在含閘門的組合），強度不能選。另記「強度 0.50～1.00 任選」（與資料月份清單同口徑）。 */
const {spawn}=require('child_process');const http=require('http');const fs=require('fs');
const port=9986;
const ch=spawn('google-chrome',['--headless=new','--no-sandbox','--remote-debugging-port='+port,'--user-data-dir=/tmp/b50profPR','about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  await sleep(1500);
  const list=await new Promise(r=>http.get('http://127.0.0.1:'+port+'/json',res=>{let b='';res.on('data',c=>b+=c);res.on('end',()=>r(JSON.parse(b)))}));
  const ws=new (require('ws'))(list.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise(r=>ws.on('open',r));
  let id=0;const pend={};const errs=[];
  ws.on('message',m=>{m=JSON.parse(m);if(m.id&&pend[m.id]){pend[m.id](m.result||m.error);delete pend[m.id]} if(m.method==='Runtime.exceptionThrown')errs.push((m.params.exceptionDetails.exception||{}).description||m.params.exceptionDetails.text)});
  const send=(method,params={})=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method,params}))});
  const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.result&&r.result.value!==undefined?r.result.value:JSON.stringify(r.exceptionDetails||r)};
  await send('Runtime.enable');await send('Page.enable');
  await send('Page.navigate',{url:'file:///home/claude/sim2/dist/sim.html'});
  const ready=async()=>{for(let k=0;k<60;k++){await sleep(300); if(await ev("typeof presetEval==='function'&&!!S.sc")===true) return;}};
  await ready();
  const yms=JSON.parse(await ev("JSON.stringify(MONTH_CATALOG.map(e=>e.ym))"));
  const out=[];
  for(const ym of yms){
    await ev(ym==='2026/09'?"monthClear()":`monthSave(MONTH_CATALOG.find(e=>e.ym==='${ym}').d)`);
    await send('Page.reload'); await ready();
    const r=await ev(`(()=>{
      const base=presetCombos(), withN=base.filter(c=>c.indexOf('gate')>=0).map(c=>c.concat(['nego']));
      const L0=NEGO.lo,H0=NEGO.hi, S5=[0.5,0.55,0.6,0.65,0.7,0.75,0.8,0.82,0.85,0.9,0.95,1.0];
      const res={ym:CM.ym,tgt:TARGET.ship,base:{ship:SEP.s[2],otd:SEP.s[3],ot:SEP.s[4],orders:SEP.s[0],ev:SEP.s[1]},wd:WORKDAYS,ok:{},best:{}};
      const run=(nego,acc,extra,s)=>{ if(nego){NEGO.lo=acc;NEGO.hi=acc;} const cs=nego?base.concat(withN):base; let ok=null,bs=-1,bo=-1;
        cs.forEach(c=>{const r=presetEval(c,s,extra); if(r.ship>bs)bs=r.ship; if(r.otd>bo)bo=r.otd; if(r.ship>=TARGET.ship-1e-9&&r.otd>=0.9-1e-9&&(!ok||r.bu<ok.bu))ok={ids:c.join('+'),ship:+r.ship.toFixed(1),otd:+r.otd.toFixed(3),bu:+r.bu.toFixed(3)};});
        NEGO.lo=L0;NEGO.hi=H0; return {ok,bs:+bs.toFixed(1),bo:+bo.toFixed(3)}; };
      [['off',0],['n25',0.25],['n50',0.5]].forEach(([k,acc])=>[0,210].forEach(ex=>S5.forEach(s=>{res.ok[k+'_'+ex+'_'+s]=run(k!=='off',acc,ex,s)})));
      return JSON.stringify(res)})()`);
    const o=JSON.parse(r); out.push(o);
    process.stdout.write(ym+' ');
  }
  fs.writeFileSync('/tmp/cat/prob50.json',JSON.stringify(out));
  console.log('\nerrors',JSON.stringify(errs.slice(0,5)));
  ws.close();ch.kill();process.exit(0);
})();
