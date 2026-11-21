/* 單日重播的基礎數據圖，直接使用單日模型的即時值與全天對照。 */
const dayKpiCharts = (() => {
  const charts = new Map();
  const comparisons = [
    { id:'k-h', unit:'h', current:m => m.extra, full:p => p.extraH, format:f => f.toFixed(1) },
    { id:'k-p', unit:'片', current:m => m.extra * RATE, full:p => p.extraH * RATE },
    { id:'k-o', unit:'片', current:m => m.prod, full:p => p.ship },
    { id:'k-l', unit:'條', current:(m,p,t) => t < p.insertAt ? 0 : changedLines(p), full:changedLines, max:LINES },
  ];
  const events = [
    { id:'k-r', time:p => p.isBefore || p.verbal ? null : p.replyAt },
    { id:'k-f', time:p => DAY.RUSH.late && p.isBefore ? null : p.floorKnows },
  ];
  let last = -Infinity;
  let lastDraw = -Infinity;
  let theme;

  function canvasFor(id) {
    const container = document.getElementById(id).parentElement;
    const plot = document.createElement('div');
    plot.className = 'day-kpi-plot';
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true'); // 讀屏使用同卡片的完整數值和事件狀態。
    plot.append(canvas);
    if (container.classList.contains('day-kpi-ring')) container.prepend(plot);
    else container.insertBefore(plot, container.lastElementChild);
    return canvas;
  }

  function commonOptions() {
    return { animation:false, responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}, tooltip:{}}, layout:{padding:{right:5}} };
  }

  function compare(metric, current, other, otherLabel, colors, plan) {
    const {id, unit, full, max} = metric;
    const format = value => (metric.format || f0)(value) + (unit === '%' ? '' : ' ') + unit;
    const data = [current, full(other)];
    if (charts.has(id)) {
      const chart = charts.get(id);
      chart.data.datasets[0].data = data;
      chart.update('none');
      return;
    }
    // 以全天的兩種情境設定刻度，拖動播放時間不會重新縮放每張圖。
    const ceiling = max ?? Math.max(1, full(plan), full(other));
    const options = commonOptions();
    options.indexAxis = 'y';
    options.plugins.tooltip.callbacks = {label: context => format(context.parsed.x)};
    options.scales = {
      x:{beginAtZero:true, max, suggestedMax:ceiling, grid:{color:colors.grid},
        ticks:{color:colors.text, maxTicksLimit:4, precision:unit === 'h' ? 1 : 0, callback:format}},
      y:{grid:{display:false}, ticks:{autoSkip:false, color:colors.text, font:{size:10}}},
    };
    charts.set(id, new Chart(canvasFor(id), {type:'bar', options, data:{
      labels:['回放', otherLabel + '全天'], datasets:[{data, backgroundColor:[colors.live, colors.other], borderRadius:3, maxBarThickness:10}],
    }}));
  }

  function timeline(event, time, plan, other, otherLabel, colors) {
    const point = value => Number.isFinite(value) && value >= DAY.H0 && value <= DAY.H1 ? [{x:value, y:1}] : [];
    const current = event.time(plan);
    const marks = [point(time), point(current != null && current <= time ? current : null), point(event.time(other))];
    if (charts.has(event.id)) {
      const chart = charts.get(event.id);
      chart.data.datasets.forEach((dataset, index) => { dataset.data = marks[index]; });
      chart.update('none');
      return;
    }
    const options = commonOptions();
    options.layout.padding.left = 4;
    options.plugins.tooltip.callbacks = {label: context => context.dataset.label + ' ' + hhmm(context.parsed.x)};
    options.scales = {
      x:{min:DAY.H0, max:DAY.H1, grid:{color:colors.grid}, ticks:{color:colors.text, maxTicksLimit:4, callback:hhmm}},
      y:{display:false, min:0.75, max:1.25},
    };
    charts.set(event.id, new Chart(canvasFor(event.id), {type:'scatter', options, data:{datasets:[
      {label:'目前時間', data:marks[0], pointStyle:'line', pointRadius:8, pointRotation:90, borderColor:colors.text, borderWidth:2},
      {label:'目前情境', data:marks[1], pointStyle:'circle', pointRadius:5, backgroundColor:colors.live},
      {label:otherLabel, data:marks[2], pointStyle:'rectRot', pointRadius:5, backgroundColor:colors.other},
    ]}}));
  }

  function ring(id, amount, maximum, labels, unit, filled, track) {
    const active = Math.min(maximum, Math.max(0, amount ?? 0));
    const parts = [active, maximum - active];
    if (charts.has(id)) {
      const chart = charts.get(id);
      chart.data.datasets[0].data = parts;
      chart.options.plugins.tooltip.enabled = amount != null;
      chart.update('none');
      return;
    }
    const options = commonOptions();
    options.cutout = '73%';
    options.layout.padding = 1;
    options.plugins.tooltip.enabled = amount != null;
    options.plugins.tooltip.callbacks = {label: context => context.label + ' ' + f0(context.parsed) + unit};
    charts.set(id, new Chart(canvasFor(id), {type:'doughnut', options, data:{labels, datasets:[{
      data:parts, backgroundColor:[filled, track], borderWidth:0, hoverOffset:0,
    }]}}));
  }

  function reset() {
    charts.forEach(chart => { const plot = chart.canvas.parentElement; chart.destroy(); plot.remove(); });
    charts.clear();
    last = -Infinity;
    lastDraw = -Infinity;
  }

  function update(t, metrics, plan, other, otherLabel) {
    if (document.body.dataset.page !== 'day' || document.body.dataset.dv !== 'kpi') return;
    const nextTheme = document.documentElement.dataset.theme;
    if (theme !== nextTheme) { reset(); theme = nextTheme; }
    // 播放中按分鐘更新，暫停或拖曳時顯示選定的精確時間。
    const now = performance.now();
    const frame = S.playing ? Math.floor(t * 60) / 60 : t;
    if (frame === last) return;
    if (S.playing && now - lastDraw < 125) return;
    last = frame;
    lastDraw = now;
    const colors = {live:ink('--series-1'), other:ink('--series-2'), text:ink('--text-secondary'), grid:ink('--grid')};
    comparisons.forEach(metric => compare(metric, metric.current(metrics, plan, t), other, otherLabel, colors, plan));
    events.forEach(event => timeline(event, t, plan, other, otherLabel, colors));
    ring('k-u', metrics.util == null ? null : metrics.util * 100, 100, ['運轉', '停機'], '%', colors.live, colors.grid);
    if (DAY.RUSH.qty) ring('k-a', metrics.a1, DAY.RUSH.qty, ['已完成', '剩餘'], ' 片', ink('--series-3'), colors.grid);
  }

  return {reset, update};
})();
