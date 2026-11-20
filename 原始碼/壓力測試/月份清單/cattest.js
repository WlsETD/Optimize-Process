const {spawn}=require('child_process');const http=require('http');const fs=require('fs');
const port=9992;
const ch=spawn('google-chrome',['--headless=new','--no-sandbox','--remote-debugging-port='+port,'--user-data-dir=/tmp/b50profCT','--window-size=1280,1000','about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  await sleep(1500);
  const list=await new Promise(r=>http.get('http://127.0.0.1:'+port+'/json',res=>{let b='';res.on('data',c=>b+=c);res.on('end',()=>r(JSON.parse(b)))}));
  const ws=new (require('ws'))(list.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise(r=>ws.on('open',r));
  let id=0;const pend={};const errs=[];
  ws.on('message',m=>{m=JSON.parse(m);if(m.id&&pend[m.id]){pend[m.id](m.result||m.error);delete pend[m.id]} if(m.method==='Runtime.exceptionThrown')errs.push((m.params.exceptionDetails.exception||{}).description||m.params.exceptionDetails.text); if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errs.push('console.error: '+m.params.args.map(a=>a.value||a.description).join(' '))});
  const send=(method,params={})=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method,params}))});
  const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.result&&r.result.value!==undefined?r.result.value:JSON.stringify(r.exceptionDetails||r)};
  const ready=async()=>{for(let k=0;k<60;k++){await sleep(400); if(await ev("typeof monthUI==='function' && !!document.getElementById('monthBtn') && !!document.getElementById('monthList')")===true) return true;} return false};
  const shot=async f=>{const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(f,Buffer.from(r.data,'base64'))};
  await send('Runtime.enable');await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'file:///home/claude/sim2/dist/sim.html#impact'});
  console.log('ready',await ready());
  await ev("try{localStorage.removeItem('sl_month_v1')}catch(e){}");
  console.log('btn text',await ev("document.getElementById('monthBtn').textContent"));
  await ev("document.getElementById('monthBtn').click()"); await sleep(600);
  console.log('rows',await ev("document.querySelectorAll('#monthList .mit').length"),
    'g/y/r',await ev("['g','y','r'].map(k=>document.querySelectorAll('#monthList .mit.'+k).length).join('/')"),
    'cur',await ev("[...document.querySelectorAll('#monthList .mit.cur')].map(x=>x.dataset.ym).join()"));
  console.log('first rows:\n'+await ev("[...document.querySelectorAll('#monthList .mit')].slice(0,4).map(x=>x.innerText.replace(/\\n+/g,' | ')).join('\\n')"));
  await shot('/tmp/cat/dlg_all.png');
  // filter red
  await ev("document.querySelector('.mchip.r').click()"); await sleep(200);
  console.log('after red filter visible',await ev("[...document.querySelectorAll('#monthList .mit')].filter(x=>!x.hidden).length"));
  await shot('/tmp/cat/dlg_red.png');
  console.log('red rows ym:',await ev("[...document.querySelectorAll('#monthList .mit')].filter(x=>!x.hidden).map(x=>x.dataset.ym+(/出貨與準時率都到不了/.test(x.innerText)?'(兩者)':/出貨到不了/.test(x.innerText)?'(出貨)':/準時率到不了/.test(x.innerText)?'(準時)':'(?)')).join(' ')"));
  // click a red month: 2027/02
  await ev("document.querySelector('.mchip[data-f=all]').click()");
  await ev("document.querySelector('#monthList .mit[data-ym=\"2027/02\"]').click()");
  await sleep(500);
  console.log('ready after click',await ready());
  console.log('CUR.ym',await ev("CUR&&CUR.ym"),'src',await ev("CUR&&CUR.src"),'workdays',await ev("WORKDAYS"),'target',await ev("TARGET.ship"),'btn',await ev("document.getElementById('monthBtn').textContent"));
  await ev("document.getElementById('monthBtn').click()"); await sleep(500);
  console.log('cur marker',await ev("[...document.querySelectorAll('#monthList .mit.cur')].map(x=>x.dataset.ym).join()"));
  await shot('/tmp/cat/dlg_after.png');
  // preset button on the loaded month still works (red month => no combo)
  await ev("document.getElementById('monthX').click()");
  // click a green month 2026/11
  await ev("document.getElementById('monthBtn').click()");
  await ev("document.querySelector('#monthList .mit[data-ym=\"2026/11\"]').click()"); await sleep(500);
  console.log('ready',await ready(),'CUR.ym',await ev("CUR&&CUR.ym"),'target',await ev("TARGET.ship"));
  // back to September via list
  await ev("document.getElementById('monthBtn').click()");
  await ev("document.querySelector('#monthList .mit[data-ym=\"2026/09\"]').click()"); await sleep(500);
  console.log('ready',await ready(),'CUR',await ev("String(CUR)"),'target',await ev("TARGET.ship"),'btn',await ev("document.getElementById('monthBtn').textContent"));
  console.log('errors',JSON.stringify(errs.slice(0,5)));
  ws.close();ch.kill();process.exit(0);
})();
