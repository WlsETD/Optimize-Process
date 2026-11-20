/* 共用小工具 */
const $ = s => document.querySelector(s);
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const ink = css;
const REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const ST = { run:{hex:'#2e9e62',label:'運轉'}, co:{hex:'#2a78d6',label:'換線'}, wait:{hex:'#eb6834',label:'等料'}, fault:{hex:'#d55181',label:'拋料／故障'} };
function fitCanvas(cv) {
  const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  if (cv.width !== Math.round(r.width*dpr) || cv.height !== Math.round(r.height*dpr)) { cv.width = Math.round(r.width*dpr); cv.height = Math.round(r.height*dpr); }
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); return { ctx, w:r.width, h:r.height };
}
function roundRect(ctx,x,y,w,h,r) { r = Math.min(r, Math.abs(w)/2, Math.abs(h)/2); ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r); ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r); ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath(); }
