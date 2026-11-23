// Renders a contact sheet of real detections for visual review.
// usage: node backtest/gallery.js <tf> <key|kind:chart|all> <count> <out.png> [seed]
const fs = require('fs'), path = require('path');
const { loadAll, D } = require('./load.js');
const P = require('../js/patterns.js');
const { TF } = require('./walk.js');
const [tf = 'D', which = 'kind:chart', count = 12, outPng = '/tmp/gallery.png', seedArg = 1] = process.argv.slice(2);
const ev = JSON.parse(fs.readFileSync(path.join(__dirname, 'out', 'events.json'), 'utf8'))
  .filter(e => e.tf === tf && (which === 'all' || (which.startsWith('kind:') ? e.kind === which.slice(5) : e.key === which)));
const rng = D.rng(+seedArg);
const pick = [];
const pool = ev.slice();
while (pick.length < +count && pool.length) pick.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
const series = Object.fromEntries(loadAll().map(s => [s.ticker + s.set, s]));
const cards = [];
for (const e of pick) {
  const s = series[e.ticker + e.set];
  const bars = tf === 'D' ? s.daily : tf === 'W' ? D.toWeekly(s.daily) : D.toMonthly(s.daily);
  const cfg = TF[tf];
  const off = Math.max(0, e.t - cfg.win + 1);
  const an = P.analyze(bars.slice(off, e.t + 1));
  const sig = an.signals.find(x => x.key === e.key && x.start + off === e.start) || an.signals.find(x => x.key === e.key);
  const after = Math.min(bars.length - 1, e.t + Math.round(cfg.hold * 0.8));
  const shown = bars.slice(off, after + 1);
  const from = Math.max(0, (sig ? sig.start : e.t - off) - 25);
  cards.push({ title: `${e.ticker} ${tf} ${e.date} · ${e.key}${e.traded ? ` · ${e.outcome} ${e.r >= 0 ? '+' : ''}${e.r.toFixed(1)}R` : ' · not filled'}`, bars: shown, sig, last: e.t - off, from });
}
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
:root{--chart-bg:#fff;--chart-grid:#eef1ef;--fg:#14201b;--fg-muted:#5a6963;--up:#11805b;--down:#c0412c;--accent:#2f55d4;--accent-2:#a8661a;--ma20:#9aa3cf;--ma50:#2f55d4;--ma200:#a8661a;--support:#0f7c8a;--resistance:#b0601b;--surface:#fff;--font-mono:monospace;--font-ui:sans-serif}
body{margin:0;font:12px sans-serif;background:#f3f5f3;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:8px;width:1500px}
.c{background:#fff;border:1px solid #ddd}.t{padding:4px 6px;font-weight:600}.w{height:300px}canvas{width:100%;height:100%;display:block}</style></head><body>
${cards.map((c, i) => `<div class="c"><div class="t">${c.title}</div><div class="w"><canvas id="c${i}"></canvas></div></div>`).join('')}
<script>window.SPP=undefined</script>
<script src="file://${path.resolve(__dirname, '../js/indicators.js')}"></script>
<script src="file://${path.resolve(__dirname, '../js/patterns.js')}"></script>
<script src="file://${path.resolve(__dirname, '../js/chart.js')}"></script>
<script>const CARDS=${JSON.stringify(cards)};
CARDS.forEach((c,i)=>{const v=new ChartView(document.getElementById('c'+i),{interactive:false,rsi:false,sma:[50],levels:false,trendlines:false,candleMarks:false,patterns:false,rightPad:2,axes:true});
 v.setData(c.bars,null); v.from=c.from; v.to=c.bars.length+1; v.sel=c.sig||null;
 const C=v.colors(); v.extra=[{list:[{t:'vline',i:c.last,label:'signal'}],col:C.fg,strong:true}]; v.render();});
window.done=true;</script></body></html>`;
const tmp = path.join(path.dirname(outPng), 'gallery.html');
fs.writeFileSync(tmp, html);
(async () => {
  const { chromium } = require('playwright');
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1516, height: 900 } });
  p.on('pageerror', e => console.error(e.message));
  await p.goto('file://' + tmp); await p.waitForFunction('window.done');
  await p.screenshot({ path: outPng, fullPage: true }); await b.close();
  console.log('wrote', outPng, cards.length, 'cards from', ev.length, 'events');
})();
