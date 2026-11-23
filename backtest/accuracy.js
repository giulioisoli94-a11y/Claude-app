// Identification accuracy on labelled synthetic charts.
// For each pattern template × noise level × seed we know the truth (type,
// pattern window, breakout bar) and check what the scanner reports at the end.
//   recall     = correct pattern reported, overlapping the true window
//   timing     = detected break bar falls on the true breakout leg (−4 bars: noise can cross the line early)
//   mislabel   = a different chart pattern with the opposite bias reported in the window
// Noise is relative to pattern height: daily charts ≈ low/medium noise,
// weekly/monthly ≈ medium/high (bigger bars relative to the pattern).
// Also: false alarms per 1,000 bars of pure random walk.
global.SPI = require('../js/indicators.js');
const D = require('../js/data.js');
const P = require('../js/patterns.js');
const fs = require('fs'), path = require('path');

const NOISE = { low: 0.003, medium: 0.006, high: 0.010, extreme: 0.015 };
const SEEDS = +process.argv[2] || 60;
const keys = Object.keys(D.templates);
const BIAS = D.templateBias;
const res = {};
for (const k of keys) {
  res[k] = {};
  for (const [nl, nz] of Object.entries(NOISE)) {
    let rec = 0, timing = 0, mis = 0, tot = 0;
    const confused = {};
    for (let s = 1; s <= SEEDS; s++) {
      const inst = D.templateInstance(k, s * 7919 + k.length * 13, { noise: nz });
      const an = P.analyze(inst.bars);
      const w0 = inst.patternStart, w1 = inst.bars.length - 1;
      const chart = an.signals.filter(x => x.kind === 'chart' && x.i >= w0 && x.start <= w1);
      const hit = chart.find(x => x.key === k);
      tot++;
      if (hit) {
        rec++;
        const leg = inst.wps[D.templates[k].breakAt + 1][0]; // the breakout leg: the true break happens somewhere on it
        if (hit.breakI != null && hit.breakI !== -1 && hit.breakI >= inst.breakIndex - 4 && hit.breakI <= inst.breakIndex + leg + 1) timing++;
      } else {
        const other = chart[0];
        const lbl = other ? other.key : '(nothing)';
        confused[lbl] = (confused[lbl] || 0) + 1;
      }
      if (chart.some(x => x.key !== k && x.bias !== 'neutral' && x.bias !== BIAS[k] && x.status !== 'failed' && x.breakI !== -1 && Math.abs(x.breakI - inst.breakIndex) <= 4)) mis++;
    }
    res[k][nl] = { recall: rec / tot, timing: rec ? timing / rec : 0, mislabel: mis / tot, confused };
  }
}
// false alarms on random walks
let bars = 0; const fa = {};
for (let s = 1; s <= 200; s++) {
  const rng = D.rng(s * 31);
  const wps = [[0, 100]]; let lvl = 100;
  for (let i = 0; i < 300; i++) { lvl *= 1 + D.gauss(rng) * 0.012; wps.push([1, lvl]); }
  const b = D.fromWaypoints(wps, { seed: s, noise: 0.002, wick: 0.006 });
  // count events over the walk, as the app would see them bar by bar
  for (let t = 150; t < b.length; t += 1) {
    const an = P.analyze(b.slice(0, t + 1));
    for (const x of an.signals) if (x.kind === 'chart' && x.breakI === t) fa[x.key] = (fa[x.key] || 0) + 1;
  }
  bars += b.length - 150;
}
const faRate = Object.fromEntries(Object.entries(fa).map(([k, v]) => [k, v / bars * 1000]));

const pc = x => (x * 100).toFixed(0).padStart(4) + '%';
console.log('pattern'.padEnd(20) + Object.keys(NOISE).map(n => n.padStart(9)).join('') + '   timing  mislabel(high)  most common miss (high noise)');
for (const k of keys) {
  const r = res[k];
  const miss = Object.entries(r.high.confused).sort((a, b) => b[1] - a[1])[0];
  console.log(k.padEnd(20) + Object.keys(NOISE).map(n => pc(r[n].recall).padStart(9)).join('') + '   ' + pc(r.medium.timing) + '   ' + pc(r.high.mislabel) + '          ' + (miss ? miss[0] + ' ×' + miss[1] : ''));
}
const avg = n => keys.reduce((a, k) => a + res[k][n].recall, 0) / keys.length;
console.log('AVERAGE'.padEnd(20) + Object.keys(NOISE).map(n => pc(avg(n)).padStart(9)).join(''));
console.log('\nFalse alarms per 1,000 bars of random walk (confirmed chart-pattern breaks):', Object.values(faRate).reduce((a, b) => a + b, 0).toFixed(1));
console.log(Object.entries(faRate).sort((a, b) => b[1] - a[1]).map(([k, v]) => '  ' + k + ' ' + v.toFixed(2)).join('\n'));
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'out', 'accuracy.json'), JSON.stringify({ seeds: SEEDS, noise: NOISE, res, falseAlarmsPer1000: faRate }, null, 1));
