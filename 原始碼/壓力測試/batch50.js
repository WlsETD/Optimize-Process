// node batch50.js 1 20  → 逐月匯入 /tmp/m50/mNN.xlsx，跑評估，結果寫 /tmp/res50/NN.json
const {spawn}=require('child_process');const http=require('http');const fs=require('fs');
const A=+process.argv[2],B=+process.argv[3],port=9895+A;
const ch=spawn('google-chrome',['--headless=new','--no-sandbox','--remote-debugging-port='+port,'--user-data-dir=/tmp/b50prof'+A,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const EXPR=fs.readFileSync('/home/claude/sim2/eval50.js','utf8');
(async()=>{
  await sleep(1500);
  const list=await new Promise(r=>http.get('http://127.0.0.1:'+port+'/json',res=>{let b='';res.on('data',c=>b+=c);res.on('end',()=>r(JSON.parse(b)))}));
  const ws=new (require('ws'))(list.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise(r=>ws.on('open',r));
  let id=0;const pend={};const errs=[];
  ws.on('message',m=>{m=JSON.parse(m);if(m.id&&pend[m.id]){pend[m.id](m.result||m.error);delete pend[m.id]} if(m.method==='Runtime.exceptionThrown')errs.push((m.params.exceptionDetails.exception||{}).description||m.params.exceptionDetails.text)});
  const send=(method,params={})=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method,params}))});
  const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.result&&r.result.value!==undefined?r.result.value:JSON.stringify(r.exceptionDetails||r)};
  await send('Runtime.enable');await send('DOM.enable');
  for(let n=A;n<=B;n++){
    const nn=String(n).padStart(2,'0'), file='/tmp/m50/m'+nn+'.xlsx', out='/tmp/res50/'+nn+'.json';
    if(fs.existsSync(out)) continue;
    const t0=Date.now();
    await send('Page.navigate',{url:'file:///home/claude/sim2/dist/sim.html#impact'});
    for(let k=0;k<40;k++){ await sleep(400); if(await ev("typeof monthUI==='function' && !!document.getElementById('monthBtn')")===true) break; }
    await ev("document.getElementById('monthBtn').click()");
    const doc=await send('DOM.getDocument',{depth:-1});
    const q=await send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#monthFile'});
    await send('DOM.setFileInputFiles',{nodeId:q.nodeId,files:[file]}); await sleep(1500);
    const msg=await ev("document.getElementById('monthMsg').innerText");
    await ev("document.getElementById('monthGo').click()"); await sleep(1500);
    for(let k=0;k<40;k++){ if(await ev("typeof monthUI==='function' && typeof CM!=='undefined' && !!CM && !!document.getElementById('monthBtn')")===true) break; await sleep(500); }
    const res=await ev(EXPR);
    fs.writeFileSync(out, JSON.stringify({n, msg, res: (()=>{try{return JSON.parse(res)}catch(e){return res}})(), errs: errs.splice(0)}));
    await ev("try{localStorage.removeItem('sl_month_v1')}catch(e){};window.name=''");
    console.log(nn, ((Date.now()-t0)/1000).toFixed(1)+'s', String(res).slice(0,90));
  }
  ws.close();ch.kill();process.exit(0);
})();
