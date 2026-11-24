// Daily market scan: fetches daily bars from Twelve Data, runs the scanner and
// prints a Markdown report (also saved to scan/out/<date>.md).
// Uses curl so the environment's HTTPS proxy (and its saved Twelve Data key) apply.
// Usage: node scan/daily.js [SYMBOL ...]
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
global.SPI = require('../js/indicators.js');
const P = require('../js/patterns.js');
const C = require('../js/context.js');
const T = require('../js/trackrecord.js');

const ETF = [['SPY', 'S&P 500'], ['QQQ', 'Nasdaq-100'], ['ONEQ', 'Nasdaq Composite'], ['DIA', 'Dow Jones'], ['IWM', 'Russell 2000']];
const STOCKS = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AVGO', 'NFLX', 'AMD', 'COST', 'JPM', 'V', 'XOM', 'UNH', 'LLY', 'WMT', 'CAT'];
const args = process.argv.slice(2).map(s => s.toUpperCase());
const list = args.length ? args.map(s => [s, s]) : ETF.concat(STOCKS.map(s => [s, s]));
const TITLE = { breakout: 'Breakout', breakdown: 'Breakdown', failed_breakout: 'Failed breakout', failed_breakdown: 'Failed breakdown', trendline_break: 'Trend line break', trendline_support: 'Trend line support test', trendline_resistance: 'Trend line resistance test', double_top: 'Double top', double_bottom: 'Double bottom', head_shoulders: 'Head & shoulders', inv_head_shoulders: 'Inverse H&S', asc_triangle: 'Ascending triangle', desc_triangle: 'Descending triangle', sym_triangle: 'Symmetrical triangle', rising_wedge: 'Rising wedge', falling_wedge: 'Falling wedge', bull_flag: 'Bull flag', bear_flag: 'Bear flag', channel_up: 'Rising channel', channel_down: 'Falling channel', rectangle: 'Rectangle' };
const STATUS = { potential: 'Potential (needs 2nd close)', confirmed: 'Confirmed', unconfirmed: 'No follow-through', forming: 'Forming', fresh: 'Just broke', holding: 'Holding', failed: 'Failed' };
const f2 = x => (x == null || !isFinite(x) ? '–' : x >= 100 ? x.toFixed(1) : x.toFixed(2));
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

let lastCall = 0;
function get(sym) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const wait = 7600 - (Date.now() - lastCall); if (wait > 0) sleep(wait); // 8 requests a minute on the free plan
    lastCall = Date.now();
    const url = 'https://api.twelvedata.com/time_series?symbol=' + encodeURIComponent(sym) + '&interval=1day&outputsize=400&order=asc';
    let j;
    try { j = JSON.parse(execFileSync('curl', ['-s', '-m', '40', url], { encoding: 'utf8' })); } catch (e) { return { err: 'request failed' }; }
    if (j.status === 'ok' && Array.isArray(j.values)) {
      return { bars: j.values.map(v => ({ t: v.datetime.slice(0, 10), o: +v.open, h: +v.high, l: +v.low, c: +v.close, v: +v.volume || 0 })).filter(b => b.c > 0) };
    }
    if (j.code === 429 && attempt === 0) { sleep(61000); continue; }
    return { err: (j.message || 'error').replace(/https?:\S+/g, '').trim().slice(0, 120), code: j.code };
  }
  return { err: 'rate limited' };
}

const rows = [], errors = [];
let bench = null;
for (const [sym, name] of list) {
  const d = get(sym);
  if (d.err) { errors.push(`${sym}: ${d.err}`); if (d.code === 401) break; continue; }
  if (sym === 'SPY') bench = d.bars;
  rows.push({ sym, name, bars: d.bars, an: P.analyze(d.bars) });
}
if (!bench) { const d = get('SPY'); if (!d.err) bench = d.bars; }

const day = rows.length ? rows[0].bars[rows[0].bars.length - 1].t : new Date().toISOString().slice(0, 10);
const lines = [];
lines.push(`# Morning scan · daily bars to ${day}`);
if (bench) {
  const rg = C.regime(bench, 'D');
  if (rg.state) lines.push(`**Market regime:** S&P 500 (SPY) ${rg.state === 'healthy' ? 'above' : 'below'} its 200-day average (${rg.dist >= 0 ? '+' : ''}${rg.dist.toFixed(1)}%).`);
}
const confirmed = [], potential = [], setting = [];
for (const r of rows) {
  const rs = bench && r.sym !== 'SPY' ? C.relStrength(r.bars, bench, 126) : null;
  r.rs = rs && rs.diff != null ? rs.diff : null;
  const n = r.bars.length;
  for (const s of r.an.signals) {
    if (s.kind === 'candle' || /^failed/.test(s.key) || s.status === 'failed' || s.status === 'unconfirmed') continue;
    const fresh = s.confirm && s.confirm.broke && s.breakI >= n - 2;     // broke on the last 2 bars
    const close = s.kind === 'chart' && s.status === 'forming' && s.level != null && Math.abs(r.bars[n - 1].c - s.level) <= 1.0 * r.an.ind.atr[n - 1]; // within 1 ATR of its line
    if (!fresh && !close) continue;
    const tg = s.targets && T.targets && T.targets.D && T.targets.D.follow ? s.targets.slice(0, 3).map(t => `${t.label.replace(' (equal move)', '')} ${f2(t.price)} (${T.targets.D.follow[t.k] ? Math.round(T.targets.D.follow[t.k].hit * 100) + '%' : '–'})`).join(', ') : (s.plan ? 'target ' + f2(s.plan.target) : '');
    const ev = T.byKey && T.byKey[s.key] && T.byKey[s.key].D;
    const item = { sym: r.sym, name: r.name, s, tg, ev };
    if (fresh) (s.status === 'confirmed' ? confirmed : potential).push(item); else setting.push(item);
  }
}
// one line per symbol and section: keep the most important setup
const dedupe = L => L.filter((x, i) => L.findIndex(y => y.sym === x.sym) === i);
const fmtItem = it => {
  const s = it.s, p = s.plan;
  const bias = s.bias === 'bull' ? '▲' : s.bias === 'bear' ? '▼' : '•';
  const vol = s.confirm && s.confirm.vol ? ', strong volume' : '';
  const bt = it.ev && it.ev.n ? ` · backtest ${Math.round(it.ev.win * 100)}% win, ${it.ev.edge >= 0 ? '+' : ''}${it.ev.edge.toFixed(2)}R vs random` : '';
  return `- ${bias} **${it.sym}** ${TITLE[s.key] || s.key}: ${STATUS[s.status] || s.status || ''}${vol}. ` + (p ? `Entry ${f2(p.entry)}, stop ${f2(p.stop)}, ${it.tg}` : '') + bt;
};
for (const [title, L, empty] of [['Confirmed breakouts (2 closes beyond the line)', confirmed, 'None today.'], ['Potential breakouts: watch today\'s close', potential, 'None today.'], ['Patterns within 1 ATR of their breakout line', setting, 'None today.']]) {
  const D2 = dedupe(L);
  lines.push('', `## ${title} · ${D2.length}`);
  lines.push(...(D2.length ? D2.slice(0, 10).map(fmtItem) : ['- ' + empty]));
}
const ranked = rows.filter(r => r.rs != null).sort((a, b) => b.rs - a.rs);
if (ranked.length) {
  lines.push('', '## Strength vs S&P 500 (6 months)');
  lines.push('Strongest: ' + ranked.slice(0, 5).map(r => `${r.sym} ${r.rs >= 0 ? '+' : ''}${r.rs.toFixed(1)}%`).join(', ') + '. Weakest: ' + ranked.slice(-3).map(r => `${r.sym} ${r.rs >= 0 ? '+' : ''}${r.rs.toFixed(1)}%`).join(', ') + '.');
}
lines.push('', `_${rows.length} symbols scanned from Twelve Data${errors.length ? '; skipped: ' + errors.join('; ') : ''}. Potential breakouts need a second close beyond the line. Context, not advice: in our backtest no setup was a reliable edge on its own._`);
const md = lines.join('\n');
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'out', day + '.md'), md);
console.log(md);
