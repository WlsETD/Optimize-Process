const {spawn}=require('child_process');const http=require('http');const fs=require('fs');
const port=9990;
const ch=spawn('google-chrome',['--headless=new','--no-sandbox','--remote-debugging-port='+port,'--user-data-dir=/tmp/b50profSept','about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const EXPR=fs.readFileSync('/home/claude/sim2/eval50.js','utf8');
(async()=>{
  await sleep(1500);
  const list=await new Promise(r=>http.get('http://127.0.0.1:'+port+'/json',res=>{let b='';res.on('data',c=>b+=c);res.on('end',()=>r(JSON.parse(b)))}));
  const ws=new (require('ws'))(list.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise(r=>ws.on('open',r));
  let id=0;const pend={};
  ws.on('message',m=>{m=JSON.parse(m);if(m.id&&pend[m.id]){pend[m.id](m.result||m.error);delete pend[m.id]}});
  const send=(method,params={})=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method,params}))});
  const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.result&&r.result.value!==undefined?r.result.value:JSON.stringify(r.exceptionDetails||r)};
  await send('Runtime.enable');
  await send('Page.navigate',{url:'file:///home/claude/sim2/dist/sim.html#impact'});
  for(let k=0;k<40;k++){ await sleep(400); if(await ev("typeof monthUI==='function' && !!document.getElementById('monthBtn')")===true) break; }
  const cur=await ev("String(typeof CUR!=='undefined'&&CUR?CUR.ym:'none')");
  const res=await ev(EXPR);
  fs.writeFileSync('/tmp/res50/sept.json', JSON.stringify({cur,res:JSON.parse(res)}));
  console.log('cur',cur,String(res).slice(0,150));
  ws.close();ch.kill();process.exit(0);
})();
