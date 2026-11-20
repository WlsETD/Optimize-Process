const {spawn}=require('child_process');const http=require('http');const fs=require('fs');
const port=9998;
const ch=spawn('google-chrome',['--headless=new','--no-sandbox','--remote-debugging-port='+port,'--user-data-dir=/tmp/b50profN53','about:blank'],{stdio:'ignore'});
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
  const ready=async()=>{for(let k=0;k<60;k++){await sleep(300); if(await ev("typeof presetSearch==='function'&&!!S.sc")===true) return;}};
  await ready();
  const yms=JSON.parse(await ev("JSON.stringify(MONTH_CATALOG.map(e=>[e.ym,e.lvl,e.why]))"));
  const out=[];
  for(const [ym,lvl,why] of yms){
    await ev(ym==='2026/09'?"monthClear()":`monthSave(MONTH_CATALOG.find(e=>e.ym==='${ym}').d)`);
    await send('Page.reload'); await ready();
    const r=await ev(`(()=>{
      const pc=presetCombos; presetCombos=()=>{const o=pc();return o.concat(o.filter(c=>c.indexOf('gate')>=0).map(c=>c.concat(['nego'])))};
      const L0=NEGO.lo,H0=NEGO.hi, res={};
      const lvlAt=acc=>{NEGO.lo=acc;NEGO.hi=acc;const a=presetSearch('std',0),b=presetSearch('std',210);return a?'g':(b?'y':'r')};
      res.req=(()=>{presetCombos=pc;const a=presetSearch('std',0),b=presetSearch('std',210);presetCombos=()=>{const o=pc();return o.concat(o.filter(c=>c.indexOf('gate')>=0).map(c=>c.concat(['nego'])))};return a?'g':(b?'y':'r')})();
      res.lo=lvlAt(L0); res.hi=lvlAt(H0);
      // max otd (req / lo / hi), all features + nego, extra 210
      let mx={req:0,lo:0,hi:0,ship:0}; const x0=LABOR.stationExtraH; LABOR.stationExtraH=210;
      for(let v=50;v<=100;v+=5){NEGO.lo=L0;NEGO.hi=H0;const sc=scenario(['intake','gate','realsched','kit','eta','nego'],v/100,SEP.s[1]);mx.req=Math.max(mx.req,sc.nego.otdReq);mx.lo=Math.max(mx.lo,sc.nego.lo);mx.hi=Math.max(mx.hi,sc.nego.hi);mx.ship=Math.max(mx.ship,sc.rows[0].after)}
      LABOR.stationExtraH=x0; NEGO.lo=L0;NEGO.hi=H0; presetCombos=pc;
      res.mx=mx; res.tgt=TARGET.ship; res.wd=WORKDAYS; res.orders=SEP.s[0]; return JSON.stringify(res)})()`);
    const o=JSON.parse(r); o.ym=ym; o.cat=lvl; o.why=why; out.push(o);
    process.stdout.write(ym+' '+lvl+'→req '+o.req+' lo '+o.lo+' hi '+o.hi+' otd '+(o.mx.req*100).toFixed(1)+'/'+(o.mx.lo*100).toFixed(1)+'/'+(o.mx.hi*100).toFixed(1)+'\n');
  }
  fs.writeFileSync('/tmp/cat/nego53.json',JSON.stringify(out));
  console.log('errors',JSON.stringify(errs.slice(0,5)));
  ws.close();ch.kill();process.exit(0);
})();
