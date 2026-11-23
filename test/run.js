// Smoke test: run the engine over every sample market and many randomized
// template instances; report what was found and the trainer hit rate.
global.SPI = require('../js/indicators.js');
const D = require('../js/data.js');
const P = require('../js/patterns.js');

let fail = 0;
for (const s of D.samples) {
  const bars = D.sampleBars(s);
  const r = P.analyze(bars);
  console.log(`\n${s.ticker} (${bars.length} bars) — ${s.name}`);
  console.log(`  market: ${r.market.trend} | ${r.market.structure} | RSI ${r.market.rsi.toFixed(0)}`);
  for (const g of r.signals.slice(0, 7)) console.log(`  ${g.kind.padEnd(9)} ${g.key.padEnd(20)} ${String(g.bias).padEnd(7)} ${String(g.status).padEnd(9)} age ${String(g.age).padStart(3)} score ${g.score} rr ${g.plan && g.plan.rr ? g.plan.rr.toFixed(1) : '-'}`);
}

const keys = Object.keys(D.templates);
let total = 0, hit = 0;
const per = {};
for (const k of keys) {
  per[k] = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const inst = D.templateInstance(k, seed * 97 + k.length);
    const r = P.analyze(inst.bars);
    for (const g of r.signals) if (!isFinite(g.plan ? g.plan.entry : 0)) { fail++; console.log('bad plan', k, seed, g.key); }
    total++;
    if (r.signals.some(g => g.key === k)) { hit++; per[k]++; }
  }
}
console.log('\nTemplate detection rate:', (hit / total * 100).toFixed(0) + '%');
for (const k of keys) console.log('  ' + k.padEnd(20) + per[k] + '/30');

// random markets shouldn't crash
for (let s = 1; s < 60; s++) { const r = P.analyze(D.randomBars(s)); if (!r.market) fail++; }
// CSV
const csv = 'Date,Open,High,Low,Close,Adj Close,Volume\n' + D.sampleBars(D.samples[0]).map(b => [b.t, b.o, b.h, b.l, b.c, b.c, b.v].join(',')).join('\n');
const parsed = D.parseCSV(csv);
if (parsed.length !== D.sampleBars(D.samples[0]).length) { fail++; console.log('csv mismatch'); }
console.log('\nweekly bars:', D.toWeekly(parsed).length, 'from', parsed.length, 'daily');
console.log(fail ? `FAILURES: ${fail}` : 'OK');
process.exit(fail ? 1 : 0);
