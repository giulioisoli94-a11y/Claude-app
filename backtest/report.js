// Summarizes backtest/out/events*.json → tables in the console and
// js/trackrecord.js (used by the app's Track record tab).
const fs = require('fs'), path = require('path');
const file = process.argv[2] || path.join(__dirname, 'out', 'events.json');
const ev = JSON.parse(fs.readFileSync(file, 'utf8'));
const traded = ev.filter(e => e.traded);

function stats(list) {
  const n = list.length;
  if (!n) return { n: 0 };
  const rs = list.map(e => e.r);
  const avg = rs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(rs.reduce((a, b) => a + (b - avg) ** 2, 0) / Math.max(1, n - 1));
  const wins = rs.filter(r => r > 0), losses = rs.filter(r => r <= 0);
  const gp = wins.reduce((a, b) => a + b, 0), gl = -losses.reduce((a, b) => a + b, 0);
  const ctrl = list.flatMap(e => e.ctrl || []);
  const cavg = ctrl.length ? ctrl.reduce((a, b) => a + b, 0) / ctrl.length : null;
  const cwin = ctrl.length ? ctrl.filter(r => r > 0).length / ctrl.length : null;
  const sorted = rs.slice().sort((a, b) => a - b);
  return {
    n, win: wins.length / n, avgR: avg, ci: 1.96 * sd / Math.sqrt(n), medR: sorted[Math.floor(n / 2)],
    pf: gl > 0 ? gp / gl : null,
    tgt: list.filter(e => e.outcome === 'target').length / n,
    stop: list.filter(e => e.outcome === 'stop').length / n,
    hit1R: list.filter(e => e.hit1R || e.outcome === 'target').length / n,
    held: list.reduce((a, e) => a + e.held, 0) / n,
    rr: list.reduce((a, e) => a + e.rr, 0) / n,
    ctrlAvgR: cavg, ctrlWin: cwin, edge: cavg == null ? null : avg - cavg,
  };
}
const group = (list, f) => list.reduce((m, e) => ((m[f(e)] = m[f(e)] || []).push(e), m), {});
const pct = x => (x == null ? '   –' : (x * 100).toFixed(0).padStart(3) + '%');
const r2 = x => (x == null ? '   –' : (x >= 0 ? '+' : '') + x.toFixed(2));

const out = { generated: new Date().toISOString().slice(0, 10), universe: {}, byKey: {}, byKind: {}, byScore: {}, byTrend: {}, byVol: {}, overall: {} };
const series = new Set(ev.map(e => e.ticker + e.set));
out.universe = { series: series.size, events: ev.length, trades: traded.length, sets: ['2000-2012 (QSTK Yahoo, ~95 S&P 500 stocks)', '2016-2020 (~93 S&P 500 stocks)'] };

for (const tf of ['D', 'W', 'M']) {
  const T = traded.filter(e => e.tf === tf);
  if (!T.length) continue;
  out.overall[tf] = stats(T);
  console.log(`\n===== ${tf} =====  trades ${T.length}  overall ${r2(out.overall[tf].avgR)}R  (control ${r2(out.overall[tf].ctrlAvgR)}R)`);
  console.log('pattern'.padEnd(22) + '    n  win  tgt  1R+   avgR  ±ci   ctrlR  edge   PF  held  plannedRR');
  for (const [k, L] of Object.entries(group(T, e => e.key)).sort((a, b) => b[1].length - a[1].length)) {
    const s = stats(L);
    (out.byKey[k] = out.byKey[k] || {})[tf] = s;
    console.log(k.padEnd(22) + String(s.n).padStart(5) + ' ' + pct(s.win) + ' ' + pct(s.tgt) + ' ' + pct(s.hit1R) + '  ' + r2(s.avgR) + ' ' + s.ci.toFixed(2) + '  ' + r2(s.ctrlAvgR) + ' ' + r2(s.edge) + ' ' + (s.pf ? s.pf.toFixed(2) : ' –') + ' ' + s.held.toFixed(1).padStart(5) + '  ' + s.rr.toFixed(1));
  }
  for (const [k, L] of Object.entries(group(T, e => e.kind))) (out.byKind[k] = out.byKind[k] || {})[tf] = stats(L);
  const bucket = e => (e.score == null ? 'na' : e.score >= 80 ? '80+' : e.score >= 60 ? '60-79' : e.score >= 40 ? '40-59' : '<40');
  console.log('-- by checklist score');
  for (const b of ['80+', '60-79', '40-59', '<40']) {
    const L = T.filter(e => bucket(e) === b); const s = stats(L);
    (out.byScore[b] = out.byScore[b] || {})[tf] = s;
    if (s.n) console.log('  score ' + b.padEnd(6) + String(s.n).padStart(6) + ' win ' + pct(s.win) + ' avgR ' + r2(s.avgR) + ' ±' + s.ci.toFixed(2) + ' edge ' + r2(s.edge));
  }
  console.log('-- with / against the trend');
  for (const [lbl, f] of [['with', e => e.trend === true], ['mixed', e => e.trend === null], ['against', e => e.trend === false]]) {
    const s = stats(T.filter(f)); (out.byTrend[lbl] = out.byTrend[lbl] || {})[tf] = s;
    if (s.n) console.log('  ' + lbl.padEnd(8) + String(s.n).padStart(6) + ' win ' + pct(s.win) + ' avgR ' + r2(s.avgR) + ' edge ' + r2(s.edge));
  }
  console.log('-- by direction');
  for (const d of [1, -1]) { const s = stats(T.filter(e => e.dir === d)); if (s.n) console.log('  ' + (d > 0 ? 'long ' : 'short') + String(s.n).padStart(7) + ' win ' + pct(s.win) + ' avgR ' + r2(s.avgR) + ' edge ' + r2(s.edge)); }
  console.log('-- by period');
  for (const set of ['a', 'b']) { const s = stats(T.filter(e => e.set === set)); if (s.n) console.log('  ' + (set === 'a' ? '2000-12' : '2016-20') + String(s.n).padStart(7) + ' win ' + pct(s.win) + ' avgR ' + r2(s.avgR) + ' edge ' + r2(s.edge)); }
}
// period split (2000-12 = where rules were tuned, 2016-20 = untouched check) and volume filter
out.byKeySet = {}; out.volume = {};
for (const tf of ['D', 'W', 'M']) {
  const T = traded.filter(e => e.tf === tf);
  for (const [k, L] of Object.entries(group(T, e => e.key))) {
    (out.byKeySet[k] = out.byKeySet[k] || {})[tf] = { a: stats(L.filter(e => e.set === 'a')), b: stats(L.filter(e => e.set === 'b')) };
  }
  for (const kind of ['chart', 'breakout']) for (const [lbl, f] of [['strong', e => e.vol === true], ['weak', e => e.vol === false]]) {
    const L = T.filter(e => e.kind === kind && f(e));
    ((out.volume[kind] = out.volume[kind] || {})[tf] = out.volume[kind][tf] || {})[lbl] = { all: stats(L), a: stats(L.filter(e => e.set === 'a')), b: stats(L.filter(e => e.set === 'b')) };
  }
}
const accFile = path.join(__dirname, 'out', 'accuracy.json');
if (fs.existsSync(accFile)) {
  const acc = JSON.parse(fs.readFileSync(accFile, 'utf8'));
  out.accuracy = { seeds: acc.seeds, noise: acc.noise, falseAlarmsPer1000: acc.falseAlarmsPer1000, res: Object.fromEntries(Object.entries(acc.res).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([nl, r]) => [nl, { recall: r.recall, timing: r.timing, mislabel: r.mislabel }]))])) };
}
// strip bulky fields not needed by the app
for (const g of [out.byKey, out.byKind, out.byScore, out.byTrend, out.overall]) for (const v of Object.values(g)) for (const s of Object.values(v.n != null ? { x: v } : v)) { if (s) { delete s.medR; } }
// compact for the app: round numbers
const round = o => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)));
fs.writeFileSync(path.join(__dirname, '..', 'js', 'trackrecord.js'),
  '/* Generated by backtest/report.js from a walk-forward backtest on real data. Do not edit by hand. */\n' +
  '(function (root) { root.SPT = ' + JSON.stringify(round(out)) + '; if (typeof module !== "undefined") module.exports = root.SPT; })(typeof window !== "undefined" ? window : globalThis);\n');
console.log('\nwrote js/trackrecord.js');
