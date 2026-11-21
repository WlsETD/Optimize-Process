/* =====================================================================
   排程試算：排程用實際換線時間（原「排程用實際換線時間 Demo」接入）
   資料：資料3 九月逐日紀錄（SMT開機與停機＋每日紀錄）。只讓交期更準，不增加出貨。
   ===================================================================== */
const RS = (function(){
  const D = [["09-01", 0, 0, 5, 4, 5], ["09-02", 0, 1, 7, 6, 7], ["09-03", 0, 0, 7, 6, 7], ["09-04", 0, 1, 7, 6, 7], ["09-05", 1, 0, 2, 2, 2], ["09-07", 0, 0, 5, 4.5, 5], ["09-08", 0, 1, 7, 6, 7], ["09-09", 0, 0, 5, 4.5, 5], ["09-10", 0, 1, 6, 5.5, 6], ["09-11", 0, 0, 5, 4.5, 5], ["09-12", 1, 0, 2, 2, 2], ["09-14", 0, 1, 8, 7, 8], ["09-15", 0, 0, 5, 4.5, 5], ["09-16", 0, 1, 7, 6, 7], ["09-17", 0, 1, 9, 8.5, 9], ["09-18", 0, 0, 6, 5.5, 6], ["09-19", 1, 0, 3, 2.5, 3], ["09-21", 0, 1, 8, 7, 8], ["09-22", 0, 1, 5, 4, 5], ["09-23", 0, 0, 5, 4.5, 5], ["09-24", 0, 1, 8, 7, 8], ["09-25", 0, 0, 5, 4.5, 5], ["09-26", 1, 0, 2, 2, 2], ["09-28", 0, 1, 7, 6.5, 7], ["09-29", 0, 0, 5, 4.5, 5], ["09-30", 0, 1, 7, 8, 7]];   // [日期, 是否週六, 有追加單或換零件, SMT機台換線次, 換線停機小時, 課長日報換線次]
  const HOURS=(760+133)/26, CO_PER_DAY=148/26, OLD_CO=0.5*4, PCS=150;
  let N_AVG=0,H_ALL=0,sn=0,nn=0,si=0,ni=0;
  D.forEach(r=>{N_AVG+=r[3];H_ALL+=r[4];if(r[2]){si+=r[3];ni++}else{sn+=r[3];nn++}});
  const N_NORM=sn/nn, N_INS=si/ni, AVG_T=H_ALL/N_AVG, CO_AVG=N_AVG/D.length;
  const G=id=>document.getElementById('rs_'+id);
  const st={meth:'ewma',view:'calc',lastEst:0.9,A:{}};
  const fmt=n=>Math.round(n).toLocaleString('en-US');
  const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
  function sz(svg){const r=svg.getBoundingClientRect();if(r.width<20||r.height<20)return null;svg.setAttribute('viewBox','0 0 '+r.width+' '+r.height);return {W:r.width,H:r.height}}
  function tx(x,y,t,o){o=o||{};return '<text x="'+x+'" y="'+y+'" font-size="'+(o.fs||11)+'" style="fill:'+(o.c||'var(--ink-3)')+'" text-anchor="'+(o.a||'middle')+'"'+(o.b?' font-weight="700"':'')+'>'+t+'</text>'}
  const ln=(x1,y1,x2,y2,c,w,da)=>'<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" style="stroke:'+c+'" stroke-width="'+(w||1)+'"'+(da?' stroke-dasharray="'+da+'"':'')+'/>';

  function calc(){
    const qty=+G('qty').value, due=+G('due').value, ahead=+G('ahead').value, hco=+G('hco').value;
    G('qtyV').textContent=fmt(qty)+' 片'; G('dueV').textContent='第 '+due+' 天'; G('aheadV').textContent=fmt(ahead)+' 片'; G('hcoV').textContent=hco.toFixed(2)+' h';
    let coDay=CO_PER_DAY; const typ=G('cmode').value==='type'; G('pbox').hidden=!typ;
    if(typ){const pp=+G('pday').value/100;coDay=N_NORM*(1-pp)+N_INS*pp;G('pdayV').textContent=Math.round(pp*100)+'%'}
    G('cnote').textContent='每天預估 '+coDay.toFixed(2)+' 次（一般日 '+N_NORM.toFixed(2)+'、追加單或換零件日 '+N_INS.toFixed(2)+'、九月平均 '+CO_PER_DAY.toFixed(2)+'）';
    const total=ahead+qty, newCo=coDay*hco, oldOut=(HOURS-OLD_CO)*PCS, newOut=(HOURS-newCo)*PCS;
    const oldD=total/oldOut, newD=total/newOut, oldDay=Math.ceil(oldD), newDay=Math.ceil(newD);
    G('oldCo').textContent=OLD_CO.toFixed(2)+' 小時'; G('newCo').textContent=newCo.toFixed(2)+' 小時'; G('newN').textContent=coDay.toFixed(2)+' 次 × '+hco.toFixed(2)+' h';
    G('oldOut').textContent=fmt(oldOut)+' 片'; G('newOut').textContent=fmt(newOut)+' 片';
    G('oldFin').textContent='第 '+oldD.toFixed(1)+' 個工作日'; G('newFin').textContent='第 '+newD.toFixed(1)+' 個工作日';
    G('oldDay').textContent='第 '+oldDay+' 天完成'; G('newDay').textContent='第 '+newDay+' 天完成';
    drawC(due,oldD,newD);
  }
  function drawC(due,oldD,newD){
    const svg=G('chC'),s=sz(svg);if(!s)return;
    const W=s.W,H=s.H,L=64,R=24,T=30,B=30,max=Math.max(10,Math.ceil(Math.max(oldD,newD))+1),sx=(W-L-R)/max;
    const bh=Math.min(34,(H-T-B)*0.24), y1=T+(H-T-B)*0.3-bh/2, y2=T+(H-T-B)*0.7-bh/2; let o='';
    for(let i=0;i<=max;i++){const x=L+i*sx;o+=ln(x,T,x,H-B,'var(--line)')+tx(x,H-10,i)}
    o+=tx(L-10,y1+bh/2+4,'現行',{a:'end',fs:13})+tx(L-10,y2+bh/2+4,'實際',{a:'end',fs:13,c:'var(--accent)',b:1});
    o+='<rect x="'+L+'" y="'+y1+'" width="'+(oldD*sx)+'" height="'+bh+'" rx="4" style="fill:var(--idle)"/>';
    o+='<rect x="'+L+'" y="'+y2+'" width="'+(newD*sx)+'" height="'+bh+'" rx="4" style="fill:var(--accent)"/>';
    o+=tx(L+oldD*sx+6,y1+bh/2+4,oldD.toFixed(1),{a:'start',fs:13,c:'var(--ink)'})+tx(L+newD*sx+6,y2+bh/2+4,newD.toFixed(1),{a:'start',fs:13,c:'var(--ink)'});
    const dx=L+due*sx; o+=ln(dx,T-8,dx,H-B,'var(--warn)',2,'5 3')+tx(dx,T-12,'要求交期 第 '+due+' 天',{fs:12,c:'var(--warn)',b:1});
    svg.innerHTML=o;
  }

  function auto(){
    const a=+G('alpha').value, win=+G('win').value, start=+G('start').value, known=G('known').checked, k=+G('kmul').value, excl=G('excl').checked;
    G('alphaV').textContent=a.toFixed(2); G('winV').textContent=win+' 天'; G('startV').textContent=start.toFixed(2)+' h'; G('kmulV').textContent=k.toFixed(2)+' 倍';
    const wk=mean(D.filter(r=>!r[1]).map(r=>r[3])), sat=mean(D.filter(r=>r[1]).map(r=>r[3]));
    const flag=[],cr=[],tr=[];
    D.forEach((r,i)=>{cr[i]=r[3]/(r[1]?sat:wk);tr[i]=(r[4]/r[3])/AVG_T;flag[i]=(cr[i]>k||tr[i]>k)});
    let est=start; const predT=[],hist={S:[0,0],N:[0,0],I:[0,0],W:[0,0]},predN=[],predH=[],err=[],errOld=[];
    const pooled=i=>{let sh=0,s2=0;for(let j=Math.max(0,i-win);j<i;j++){if(excl&&flag[j])continue;sh+=D[j][4];s2+=D[j][3]}return s2?sh/s2:start};
    D.forEach((r,i)=>{
      predT[i]=st.meth==='ewma'?est:(i===0?start:pooled(i));
      const c=r[1]?'S':(known?(r[2]?'I':'N'):'W'),hh=hist[c];
      predN[i]=hh[1]?hh[0]/hh[1]:(c==='S'?2:5); predH[i]=predT[i]*predN[i];
      err[i]=(predH[i]-r[4])/r[4]; errOld[i]=(2.0-r[4])/r[4];
      if(!(excl&&flag[i])){if(st.meth==='ewma')est=(1-a)*est+a*(r[4]/r[3]);hh[0]+=r[3];hh[1]+=1}
    });
    st.lastEst=st.meth==='ewma'?est:pooled(D.length);
    const idx=[];for(let i=7;i<D.length;i++)idx.push(i);
    G('sOld').textContent=Math.round(mean(idx.map(i=>Math.abs(errOld[i])))*100)+'%';
    G('sNew').textContent=Math.round(mean(idx.map(i=>Math.abs(err[i])))*100)+'%';
    G('sAlert').textContent=idx.filter(i=>Math.abs(err[i])>0.2).length+' ／ '+idx.length+' 天（現行 '+idx.filter(i=>Math.abs(errOld[i])>0.2).length+'）';
    G('sEst').textContent=st.lastEst.toFixed(2);
    st.A={predT,predH,err,flag}; drawA(); drawB();
    const order=D.map((r,i)=>i).sort((x,y)=>Math.max(cr[y],tr[y])-Math.max(cr[x],tr[x])).slice(0,5);
    const nf=flag.filter(Boolean).length, i17=D.findIndex(r=>r[0]==='09-17');
    let t='<p class="note" style="margin:0 0 8px">門檻 '+k.toFixed(2)+' 倍【我猜的】（在「每天自動調整」調整）：九月 '+(nf?'有 <b>'+nf+'</b> 天被標記':'<b>沒有任何一天</b>超過')+'。倍數＝當天換線次數 ÷ 同類日平均（平日／週六分開），或當天每次換線時間 ÷ 九月平均 0.90。最接近門檻的五天：</p>'+
      '<table class="rstbl"><thead><tr><th>日期</th><th>換線次數</th><th>次數倍數</th><th>每次時間</th><th>時間倍數</th><th>狀態</th></tr></thead><tbody>';
    order.forEach(i=>{const r=D[i];t+='<tr><td>'+r[0].replace('09-','9/')+(r[2]?'（追加單／換零件）':'')+'</td><td class="num">'+r[3]+' 次</td><td class="num">'+cr[i].toFixed(2)+'</td><td class="num">'+(r[4]/r[3]).toFixed(2)+' h</td><td class="num">'+tr[i].toFixed(2)+'</td><td>'+(flag[i]?'<span class="rspill">已標記，待人工看</span>':'<span class="rspill ok">正常</span>')+'</td></tr>'});
    t+='</tbody></table><div class="rswarn"><p>9/17 換線 9 次，次數倍數 '+cr[i17].toFixed(2)+'，但每次時間沒有拉長；單日每次時間最高是 9/30 的 1.14 小時。</p><p>用「超過平均 2 倍」當門檻【我猜的】，九月一天都不會觸發，要先看資料再定門檻，不能照搬。被標記的日子不自動刪除，人工看過再決定算不算。</p></div>';
    G('anom').innerHTML=t;
  }
  function xAxis(L,W,H,sx){let o='';D.forEach((r,i)=>{if(i%5===0||i===D.length-1)o+=tx(L+(i+0.5)*sx,H-6,r[0].replace('09-','9/'))});return o}
  function drawA(){
    const svg=G('chA'),s=sz(svg),A=st.A;if(!s||!A.predT)return;
    const W=s.W,H=s.H,L=40,R=12,T=10,B=24,sx=(W-L-R)/D.length,y0=0.5,y1=1.3;
    const Y=v=>T+(H-T-B)*(1-(Math.min(y1,Math.max(y0,v))-y0)/(y1-y0)); let o='';
    [0.6,0.8,1.0,1.2].forEach(v=>{o+=ln(L,Y(v),W-R,Y(v),'var(--line)')+tx(L-6,Y(v)+4,v.toFixed(1),{a:'end'})});
    o+=ln(L,Y(AVG_T),W-R,Y(AVG_T),'var(--warn)',1,'4 3')+tx(L+4,Y(AVG_T)-5,'九月平均 0.90',{a:'start',c:'var(--warn)'});
    o+='<polyline points="'+D.map((r,i)=>(L+(i+0.5)*sx)+','+Y(A.predT[i])).join(' ')+'" fill="none" style="stroke:var(--accent)" stroke-width="2.5"/>';
    D.forEach((r,i)=>{const f=A.flag[i];o+='<circle cx="'+(L+(i+0.5)*sx)+'" cy="'+Y(r[4]/r[3])+'" r="'+(f?6:3.5)+'" style="fill:'+(f?'var(--panel)':'var(--ink-3)')+';stroke:'+(f?'var(--warn)':'var(--ink-3)')+'" stroke-width="'+(f?2.5:1)+'"><title>'+r[0]+' 實際 '+(r[4]/r[3]).toFixed(2)+' h／次，預估 '+A.predT[i].toFixed(2)+'</title></circle>'});
    svg.innerHTML=o+xAxis(L,W,H,sx);
  }
  function drawB(){
    const svg=G('chB'),s=sz(svg),A=st.A;if(!s||!A.predH)return;
    const W=s.W,H=s.H,L=40,R=12,T=10,B=24,sx=(W-L-R)/D.length,ymax=10;
    const Y=v=>T+(H-T-B)*(1-Math.min(ymax,v)/ymax); let o='';
    [0,2,4,6,8,10].forEach(v=>{o+=ln(L,Y(v),W-R,Y(v),'var(--line)')+tx(L-6,Y(v)+4,v,{a:'end'})});
    D.forEach((r,i)=>{const x=L+(i+0.5)*sx,warm=i<7,bad=Math.abs(A.err[i])>0.2;
      o+='<rect x="'+(x-sx*0.32)+'" y="'+Y(r[4])+'" width="'+(sx*0.64)+'" height="'+(Y(0)-Y(r[4]))+'" style="fill:var(--idle)"><title>'+r[0]+' 實際 '+r[4]+' 小時</title></rect>';
      o+='<circle cx="'+x+'" cy="'+Y(A.predH[i])+'" r="4.5" style="fill:'+(warm?'var(--s4)':(bad?'var(--bad)':'var(--accent)'))+';stroke:var(--panel)" stroke-width="1.5"><title>'+r[0]+' 預估 '+A.predH[i].toFixed(1)+' 小時，誤差 '+Math.round(A.err[i]*100)+'%</title></circle>';
      if(A.flag[i])o+='<circle cx="'+x+'" cy="'+(Y(r[4])-10)+'" r="5" style="fill:var(--panel);stroke:var(--warn)" stroke-width="2"/>'});
    o+=ln(L,Y(2),W-R,Y(2),'var(--warn)',2,'6 4')+tx(W-R,Y(2)-5,'現行排程：每天抓 2.0 小時（0.5×4 線）',{a:'end',c:'var(--warn)'});
    svg.innerHTML=o+xAxis(L,W,H,sx);
  }
  function quality(){
    const okC=D.filter(r=>r[3]===r[5]).length, av=D.map(r=>r[4]/r[3]), mn=Math.min(...av), mx=Math.max(...av), out=D.filter(r=>{const v=r[4]/r[3];return v<0.5||v>1.5}).length;
    G('qual').innerHTML='<table class="rstbl"><thead><tr><th>檢查</th><th>九月結果</th></tr></thead><tbody>'+
      '<tr><td>機台紀錄的換線次數 與 課長日報的換線次數 是否一致</td><td>'+okC+'／'+D.length+' 天一致 '+(okC===D.length?'<span class="rspill ok">通過</span>':'<span class="rspill">要查</span>')+'</td></tr>'+
      '<tr><td>每天平均每次換線時間的範圍</td><td class="num">'+mn.toFixed(2)+'–'+mx.toFixed(2)+' 小時；超出 0.5–1.5 的 '+out+' 天</td></tr>'+
      '<tr><td>有換線小時卻記 0 次（除不出來）</td><td class="num">'+D.filter(r=>r[3]===0&&r[4]>0).length+' 天</td></tr></tbody></table>'+
      '<div class="rswarn"><p>這是「兩份紀錄互相對照」的抽查例子。九月兩份次數完全一致，但兩份都來自現場記錄，不能證明沒漏記，所以上線前仍要抽查 2 週。</p></div>';
    const m=+G('miss').value, avg=AVG_T*(N_AVG-m)/N_AVG, over=CO_AVG*(AVG_T-avg)*PCS;
    G('missV').textContent=m+' 次';
    G('missN').textContent=m?'平均變成 '+avg.toFixed(2)+' 小時（實際 '+AVG_T.toFixed(2)+'），每天預估產出高估約 '+Math.round(over)+' 片：漏記越多，預估越樂觀。':'沒有漏記時，平均就是九月的 0.90 小時。';
  }
  const tabs = Array.from(G('sub').querySelectorAll('button'));
  const views = tabs.map(tab => tab.dataset.v);
  function setView(v){
    if (!views.includes(v)) return;
    st.view=v;
    tabs.forEach(tab => {
      const active = tab.dataset.v === v;
      tab.classList.toggle('on', active);
      G('v_' + tab.dataset.v).classList.toggle('on', active);
    });
    requestAnimationFrame(render);
  }
  function render(){calc();auto();quality()}
  function segOn(box,b){box.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b))}
  // 事件
  tabs.forEach(b=>b.addEventListener('click',()=>setView(b.dataset.v)));
  ['qty','due','ahead','hco','cmode','pday'].forEach(id=>G(id).addEventListener('input',calc));
  document.querySelectorAll('#rs_cust button').forEach(b=>b.addEventListener('click',()=>{segOn(G('cust'),b)}));
  document.querySelectorAll('#rs_meth button').forEach(b=>b.addEventListener('click',()=>{st.meth=b.dataset.m;segOn(G('meth'),b);G('alphaBox').hidden=st.meth!=='ewma';G('winBox').hidden=st.meth!=='win';auto()}));
  ['alpha','win','start','known','kmul','excl'].forEach(id=>G(id).addEventListener('input',auto));
  G('miss').addEventListener('input',quality);
  G('apply').addEventListener('click',()=>{G('hco').value=Math.min(1.4,Math.max(0.5,st.lastEst)).toFixed(2);setView('calc')});
  window.addEventListener('resize',()=>{if(document.body.dataset.page==='sched')render()});
  function step(direction) {
    const next = (views.indexOf(st.view) + direction + views.length) % views.length;
    setView(views[next]);
  }
  return {render,setView,step};
})();
