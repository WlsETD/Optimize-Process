(function(){
  const g=(sc,k)=>sc.rows.find(r=>r.k===k);
  const KS=['ship','otd','co','coH','waitH','faultH','run','util','retest','cLate','cQual','cAll','penalty','claimC','otCost','gm','value'];
  const rowsOf=sc=>{const o={};KS.forEach(k=>{const r=g(sc,k);o[k]=r?r.after:null});return o;};
  const sc0=scenario([],0.7), base={};
  KS.forEach(k=>{base[k]=g(sc0,k).before}); base.ot=g(sc0,'ot').before; base.orders=g(sc0,'orders').before; base.rush=g(sc0,'rush').before;
  const grid=[];for(let v=50;v<=100;v+=5)grid.push(v/100);
  function sweep(extra){let mS=-1,mSok=-1,mO=-1;presetCombos().forEach(c=>grid.forEach(s=>{const r=presetEval(c,s,extra);if(r.ship>mS)mS=r.ship;if(r.otd>=PRESET_OTD&&r.ship>mSok)mSok=r.ship;if(r.otd>mO)mO=r.otd;}));return {maxShip:mS,maxShipOtdOk:mSok,maxOtd:mO};}
  function full(r,extra){ if(!r) return null; const x0=LABOR.stationExtraH; LABOR.stationExtraH=extra;
    try{ const sc=scenario(r.ids,r.s,SEP.s[1]); return Object.assign({ids:r.ids.join('+'),n:r.n,s:r.s,extra,bu:r.bu},{rows:rowsOf(sc)}); } finally { LABOR.stationExtraH=x0; } }
  const out={ym:CM.ym,name:CM.name,tag:CM.tag,workdays:WORKDAYS,target:{ship:TARGET.ship,otd:TARGET.otd},otCap:OT_CAP,base,
    sys0:sweep(0), sweepExtra:sweep(EXTRA_PRESET)};
  out.std0=full(presetSearch('std',0),0);
  out.std210=full(presetSearch('std',EXTRA_PRESET),EXTRA_PRESET);
  out.best210=full(presetSearch('best',EXTRA_PRESET),EXTRA_PRESET);
  const okAt=e=>{const r=presetSearch('std',e);return !!r&&r.bu<=WORKER.max+1e-9;};
  let me=null;
  if(okAt(0)) me=0; else if(okAt(2000)){let lo=0,hi=2000;while(hi-lo>10){const mid=Math.round((lo+hi)/2/10)*10;if(mid<=lo||mid>=hi)break;if(okAt(mid))hi=mid;else lo=mid;}me=hi;}
  out.minExtraH=me;
  return JSON.stringify(out);
})()
