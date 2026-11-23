// Loads backtest/data/{a,b}/*.csv → split/dividend-adjusted ascending OHLCV bars.
const fs = require('fs'), path = require('path');
global.SPI = require('../js/indicators.js');
const D = require('../js/data.js');

function loadFile(file) {
  const txt = fs.readFileSync(file, 'utf8').replace(/\r/g, '');
  const lines = txt.split('\n').filter(Boolean);
  const head = lines[0].split(',').map(h => h.trim().toLowerCase());
  const ix = n => head.indexOf(n);
  const [iD, iO, iH, iL, iC, iV, iA] = ['date', 'open', 'high', 'low', 'close', 'volume', 'adj close'].map(ix);
  let bars = [];
  for (const ln of lines.slice(1)) {
    const c = ln.split(',');
    const o = +c[iO], h = +c[iH], l = +c[iL], cl = +c[iC], v = +c[iV], a = iA >= 0 ? +c[iA] : cl;
    if (![o, h, l, cl, a].every(x => isFinite(x) && x > 0)) continue;
    const f = a / cl; // adjustment factor (splits + dividends)
    bars.push({ t: c[iD].slice(0, 10), o: o * f, h: Math.max(h, o, cl) * f, l: Math.min(l, o, cl) * f, c: a, v: isFinite(v) ? v / f : 0 });
  }
  bars.sort((x, y) => (x.t < y.t ? -1 : 1));
  bars = bars.filter((b, i) => i === 0 || b.t !== bars[i - 1].t);
  // drop corrupt bars: >45% one-day jumps that fully reverse (bad ticks)
  return bars.filter((b, i) => !(i > 0 && i < bars.length - 1 && Math.abs(b.c / bars[i - 1].c - 1) > 0.45 && Math.abs(bars[i + 1].c / bars[i - 1].c - 1) < 0.1));
}

D.toMonthly = D.toMonthly || function (bars) {
  const out = []; let cur = null;
  for (const b of bars) {
    const k = b.t.slice(0, 7);
    if (!cur || cur.k !== k) { if (cur) out.push(cur); cur = { k, t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }; }
    else { cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; cur.v += b.v; }
  }
  if (cur) out.push(cur);
  return out.map(({ k, ...r }) => r);
};

function loadAll() {
  const root = path.join(__dirname, 'data'), out = [];
  for (const set of ['a', 'b']) {
    const dir = path.join(root, set);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).sort()) {
      const bars = loadFile(path.join(dir, f));
      if (bars.length > 400) out.push({ ticker: f.replace('.csv', ''), set, daily: bars });
    }
  }
  return out;
}
module.exports = { loadAll, loadFile, D };
