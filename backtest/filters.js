// Searches simple filters for edge in-sample (2000-12) and checks them out-of-sample (2016-20).
const fs = require('fs'), path = require('path');
const ev = JSON.parse(fs.readFileSync(path.join(__dirname, 'out', 'events.json'), 'utf8')).filter(e => e.traded);
const st = L => { const n = L.length; if (n < 30) return null; const a = L.reduce((s, e) => s + e.r, 0) / n; const c = L.flatMap(e => e.ctrl || []); const ca = c.reduce((s, x) => s + x, 0) / c.length; const sd = Math.sqrt(L.reduce((s, e) => s + (e.r - a) ** 2, 0) / n); return { n, a, edge: a - ca, se: sd / Math.sqrt(n) }; };
const F = {
  all: () => true,
  volOK: e => e.vol === true,
  volWeak: e => e.vol === false,
  trendWith: e => e.trend === true,
  trendAgainst: e => e.trend === false,
  score80: e => e.score >= 80,
  volOK_trendWith: e => e.vol === true && e.trend === true,
};
const keys = [...new Set(ev.map(e => e.key))];
const rows = [];
for (const tf of ['D', 'W']) for (const k of keys) for (const [fn, f] of Object.entries(F)) {
  const A = st(ev.filter(e => e.tf === tf && e.key === k && e.set === 'a' && f(e)));
  const B = st(ev.filter(e => e.tf === tf && e.key === k && e.set === 'b' && f(e)));
  if (A && B) rows.push({ tf, k, fn, A, B });
}
rows.sort((x, y) => y.A.edge / y.A.se - x.A.edge / x.A.se);
console.log('top in-sample (t-stat of edge) and their out-of-sample result');
console.log('tf key                  filter            nA  edgeA  t     nB  edgeB  t');
for (const r of rows.slice(0, 25)) console.log(r.tf, r.k.padEnd(20), r.fn.padEnd(16), String(r.A.n).padStart(5), r.A.edge.toFixed(2).padStart(6), (r.A.edge / r.A.se).toFixed(1).padStart(5), String(r.B.n).padStart(5), r.B.edge.toFixed(2).padStart(6), (r.B.edge / r.B.se).toFixed(1).padStart(5));
// does volume confirmation matter for breakouts overall?
for (const tf of ['D', 'W']) for (const kind of ['breakout', 'chart']) for (const fn of ['volOK', 'volWeak']) {
  for (const set of ['a', 'b']) { const s = st(ev.filter(e => e.tf === tf && e.kind === kind && e.set === set && F[fn](e))); if (s) console.log(tf, kind, fn, set, s.n, 'edge', s.edge.toFixed(3), 't', (s.edge / s.se).toFixed(1)); }
}
