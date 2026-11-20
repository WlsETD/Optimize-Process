// node catalog_extract.js → /tmp/cat/months.json  (用模擬器自己的 parseMonthBook 解析 52 份 Excel)
const {spawn}=require('child_process');const http=require('http');const fs=require('fs');const path=require('path');
const port=9991;
const ch=spawn('google-chrome',['--headless=new','--no-sandbox','--remote-debugging-port='+port,'--user-data-dir=/tmp/b50profCat','about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const man=JSON.parse(fs.readFileSync('/home/claude/monthgen/out50/manifest.json','utf8'));
const jobs=man.map(r=>({n:r.i,file:path.basename(r.file),path:'/tmp/m50/m'+String(r.i).padStart(2,'0')+'.xlsx'}));
jobs.push({n:51,file:'AI模擬月份_2026-10_種子735133.xlsx',path:'/tmp/m50/m51.xlsx'});
jobs.push({n:52,file:'我的11月.xlsx',path:'/tmp/m50/m52.xlsx'});
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
  for(let k=0;k<40;k++){ await sleep(400); if(await ev("typeof parseMonthBook==='function' && typeof XLSX!=='undefined'")===true) break; }
  const out=[];
  for(const j of jobs){
    const b64=fs.readFileSync(j.path).toString('base64');
    const r=await ev("(()=>{const wb=XLSX.read("+JSON.stringify(b64)+",{type:'base64',cellDates:true});const r=parseMonthBook(wb,"+JSON.stringify(j.file)+");return JSON.stringify(r)})()");
    let o; try{o=JSON.parse(r)}catch(e){console.log('ERR',j.n,String(r).slice(0,200));continue}
    if(o.errs&&o.errs.length){console.log('ERR',j.n,o.errs.slice(0,3));continue}
    delete o.data.at;
    out.push({n:j.n,warns:o.warns,data:o.data});
  }
  fs.writeFileSync('/tmp/cat/months.json',JSON.stringify(out));
  console.log('parsed',out.length,'months; json bytes',fs.statSync('/tmp/cat/months.json').size);
  ws.close();ch.kill();process.exit(0);
})();
