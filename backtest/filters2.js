// Tests three context filters on every traded event, in both periods, vs the
// random control: market regime, weekly (higher-timeframe) trend, relative strength.
// All features use only data up to the event's date.
const fs = require('fs'), path = require('path');
const { loadAll } = require('./load.js');
const SPI = global.SPI;
const series = loadAll();

// ---- equal-weight market index per period (average daily return of all stocks) ----
const byDate = {};
for (const s of series) {
  const d = s.daily;
  for (let i = 1; i < d.length; i++) {
    const k = s.set + d[i].t;
    (byDate[k] = byDate[k] || { set: s.set, t: d[i].t, rets: [] }).rets.push(d[i].c / d[i - 1].c - 1);
  }
}
const index = {};
for (const set of ['a', 'b']) {
  const days = Object.values(byDate).filter(x => x.set === set && x.rets.length >= 20).sort((x, y) => (x.t < y.t ? -1 : 1));
  let lvl = 100; const closes = [], dates = [];
  for (const d of days) { lvl *= 1 + d.rets.reduce((a, b) => a + b, 0) / d.rets.length; closes.push(lvl); dates.push(d.t); }
  const sma = SPI.sma(closes, 200);
  index[set] = { dates, closes, sma, pos: Object.fromEntries(dates.map((t, i) => [t, i])) };
}
const regimeUp = (set, t) => { const I = index[set]; const i = I.pos[t]; return i == null || I.sma[i] == null ? null : I.closes[i] > I.sma[i]; };

// ---- per-stock: weekly trend + 126-day return ----
const feat = {};
for (const s of series) {
  const d = s.daily, c = d.map(b => b.c);
  // weekly closes from the daily series: a week's close is known on its last day
  const wk = []; let key = null;
  for (let i = 0; i < d.length; i++) {
    const dt = new Date(d[i].t + 'T00:00:00Z'); const m = new Date(dt); m.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
    const k = m.toISOString().slice(0, 10);
    if (k !== key) { wk.push({ c: c[i], i }); key = k; } else { wk[wk.length - 1].c = c[i]; wk[wk.length - 1].i = i; }
  }
  const wsma = SPI.sma(wk.map(w => w.c), 30);
  // for each day: last COMPLETED week before this day's week, plus today's close
  const trend = new Array(d.length).fill(null);
  let wj = 0;
  for (let i = 0; i < d.length; i++) {
    while (wj + 1 < wk.length && wk[wj + 1].i < i) wj++;
    const j = wk[wj].i < i ? wj : wj - 1; // completed week index
    if (j >= 5 && wsma[j] != null && wsma[j - 4] != null) {
      const up = c[i] > wsma[j] && wsma[j] > wsma[j - 4], dn = c[i] < wsma[j] && wsma[j] < wsma[j - 4];
      trend[i] = up ? 1 : dn ? -1 : 0;
    }
  }
  const ret126 = c.map((x, i) => (i >= 126 ? x / c[i - 126] - 1 : null));
  feat[s.ticker + s.set] = { pos: Object.fromEntries(d.map((b, i) => [b.t, i])), trend, ret126 };
}
// relative strength percentile across the universe on each date
const rsRank = {};
for (const set of ['a', 'b']) {
  const dates = index[set].dates;
  const members = series.filter(s => s.set === set);
  for (const t of dates) {
    const vals = [];
    for (const s of members) { const f = feat[s.ticker + set]; const i = f.pos[t]; if (i != null && f.ret126[i] != null) vals.push([s.ticker, f.ret126[i]]); }
    if (vals.length < 20) continue;
    vals.sort((x, y) => x[1] - y[1]);
    vals.forEach(([tk], j) => { rsRank[set + tk + t] = j / (vals.length - 1); });
  }
}

// ---- evaluate ----
const ev = JSON.parse(fs.readFileSync(path.join(__dirname, 'out', 'events.json'), 'utf8')).filter(e => e.traded && (e.tf === 'D' || e.tf === 'W'));
const daily = Object.fromEntries(series.map(s => [s.ticker + s.set, s.daily]));
for (const e of ev) {
  const f = feat[e.ticker + e.set];
  // weekly events are dated by the week's first day: use the last trading day on or before it
  const i = f.pos[e.date];
  e.reg = regimeUp(e.set, e.date);
  e.wt = i != null ? f.trend[i] : null;
  const rk = rsRank[e.set + e.ticker + e.date];
  e.rs = rk == null ? null : rk;
}
const st = L => { const n = L.length; if (n < 30) return null; const a = L.reduce((s, e) => s + e.r, 0) / n; const c = L.flatMap(e => e.ctrl || []); const ca = c.reduce((s, x) => s + x, 0) / c.length; const sd = Math.sqrt(L.reduce((s, e) => s + (e.r - a) ** 2, 0) / n); return { n, avgR: a, edge: a - ca, se: sd / Math.sqrt(n), win: L.filter(e => e.r > 0).length / n, pct: L.reduce((s, e) => s + (e.pct || 0), 0) / n }; };
const F = {
  'regime aligned': e => e.reg != null && (e.dir > 0 ? e.reg : !e.reg),
  'regime against': e => e.reg != null && (e.dir > 0 ? !e.reg : e.reg),
  'weekly aligned': e => e.wt != null && e.wt === e.dir,
  'weekly against': e => e.wt != null && e.wt === -e.dir,
  'weekly neutral': e => e.wt === 0,
  'RS aligned (top/bottom 30%)': e => e.rs != null && (e.dir > 0 ? e.rs >= 0.7 : e.rs <= 0.3),
  'RS against': e => e.rs != null && (e.dir > 0 ? e.rs <= 0.3 : e.rs >= 0.7),
  'all three aligned': e => e.reg != null && e.wt != null && e.rs != null && (e.dir > 0 ? e.reg && e.wt === 1 && e.rs >= 0.7 : !e.reg && e.wt === -1 && e.rs <= 0.3),
  'baseline (all)': () => true,
};
const out = {};
for (const tf of ['D', 'W']) {
  out[tf] = {};
  console.log(`\n==== ${tf} ====`);
  console.log('filter'.padEnd(30) + 'dir  ' + '   n    win   avgR   edge    t   | 2000-12 edge (t)   2016-20 edge (t)');
  for (const [name, f] of Object.entries(F)) for (const dir of [1, -1]) {
    const L = ev.filter(e => e.tf === tf && e.dir === dir && f(e));
    const all = st(L), A = st(L.filter(e => e.set === 'a')), B = st(L.filter(e => e.set === 'b'));
    ((out[tf][name] = out[tf][name] || {})[dir > 0 ? 'long' : 'short'] = { all, a: A, b: B });
    if (all) console.log(name.padEnd(30) + (dir > 0 ? 'long ' : 'short') + String(all.n).padStart(7) + (all.win * 100).toFixed(0).padStart(5) + '% ' + all.avgR.toFixed(3).padStart(6) + ' ' + all.edge.toFixed(3).padStart(6) + ' ' + (all.edge / all.se).toFixed(1).padStart(5) + '  | ' + (A ? A.edge.toFixed(3) + ' (' + (A.edge / A.se).toFixed(1) + ')' : '–').padEnd(17) + '  ' + (B ? B.edge.toFixed(3) + ' (' + (B.edge / B.se).toFixed(1) + ')' : '–'));
  }
}
fs.writeFileSync(path.join(__dirname, 'out', 'context.json'), JSON.stringify(out));
