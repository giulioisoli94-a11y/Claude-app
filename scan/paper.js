// Paper-trading ledger: trades every CONFIRMED breakout/breakdown the daily scan
// reports, with fixed rules, and tracks the result for up to 15 trading days.
//
// Rules (fixed in advance):
//  - Signal: a break whose second close beyond the line happened on day t
//    (the scan's "Confirmed breakout"). Bullish → long, bearish → short.
//  - Entry: next trading day's open (the scan runs before the US open), unless
//    that open is more than 1 ATR past the planned entry: then the move has
//    already happened and the trade is not chased (recorded as skipped).
//  - Exit: the plan's stop, the measured-move target, or the close of the 15th
//    trading day, whichever comes first. Stop is assumed first if both are hit
//    in one bar. No commissions or slippage.
//  - Size: risk 1% of a 10,000 virtual account (100) per trade.
//  - One open position per symbol. Closed trades are frozen once written.
//  - Benchmark: SPY's return over the same days.
const fs = require('fs'), path = require('path');
global.SPI = global.SPI || require('../js/indicators.js');
global.SPP = global.SPP || require('../js/patterns.js');
const P = global.SPP;
const B = require('../js/backtest.js');

const FILE = path.join(__dirname, '..', 'paper', 'ledger.json');
const RULES = { hold: 15, riskUsd: 100, account: 10000, start: '2026-08-03', window: 300, maxChaseAtr: 1 };

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { return null; }
}

// Breaks newly confirmed on day t (second close at t), using only bars up to t.
function confirmedAt(bars, t) {
  const off = Math.max(0, t - RULES.window + 1);
  const an = P.analyze(bars.slice(off, t + 1));
  const last = t - off;
  return an.signals.filter(s => s.level != null && !/^failed/.test(s.key) && (s.bias === 'bull' || s.bias === 'bear') &&
    s.status === 'confirmed' && s.confirm && s.confirm.broke && s.breakI === last - 1);
}

function benchPct(bench, entryDate, exitDate) {
  if (!bench) return null;
  const a = bench.find(b => b.t >= entryDate), z = [...bench].reverse().find(b => b.t <= exitDate);
  return a && z ? (z.c / a.o - 1) * 100 : null;
}

// Simulates one trade from signal day t with the bars available now.
function play(bars, t, s, bench) {
  const dir = s.bias === 'bull' ? 1 : -1;
  const plan = { entry: s.plan.entry, stop: s.plan.stop, target: s.plan.target };
  const base = {
    sym: null, key: s.key, dir, signalDate: bars[t].t, level: +s.level.toFixed(4),
    stop: +plan.stop.toFixed(4), target: +plan.target.toFixed(4),
    fib1272: s.targets && s.targets.find(x => x.k === 'fib1272') ? +s.targets.find(x => x.k === 'fib1272').price.toFixed(4) : null,
    volConfirmed: !!(s.confirm && s.confirm.vol),
  };
  if (t + 1 >= bars.length) return Object.assign(base, { status: 'pending', note: 'enters at the next open if it is within 1 ATR of ' + (+plan.entry.toFixed(2)) });
  const atr = global.SPI.atr(bars.slice(Math.max(0, t - 60), t + 1), 14).pop();
  if (dir * (bars[t + 1].o - plan.entry) > 1.0 * atr) return Object.assign(base, { status: 'skipped', entryDate: bars[t + 1].t, entry: +bars[t + 1].o.toFixed(4), note: 'opened more than 1 ATR past the planned entry: not chased' });
  const res = B.simulate(bars, t, 'market', dir, plan, RULES.hold);
  if (!res) return Object.assign(base, { status: 'skipped', entryDate: bars[t + 1].t, entry: +bars[t + 1].o.toFixed(4), note: 'opened beyond the stop or target: not taken' });
  const risk = dir * (res.entry - plan.stop);
  const shares = Math.max(1, Math.floor(RULES.riskUsd / risk));
  const exitPrice = res.entry + dir * res.r * risk;
  const closed = res.outcome !== 'open';
  const exitDate = bars[res.exitI].t;
  // did price reach the Fib 1.272 level along the way?
  let hit1272 = null;
  if (base.fib1272 != null) { hit1272 = false; for (let j = res.entryI; j <= res.exitI; j++) if (dir > 0 ? bars[j].h >= base.fib1272 : bars[j].l <= base.fib1272) { hit1272 = true; break; } }
  return Object.assign(base, {
    status: closed ? 'closed' : 'open', outcome: closed ? res.outcome : null,
    entryDate: bars[res.entryI].t, entry: +res.entry.toFixed(4), shares,
    exitDate: closed ? exitDate : null, exit: closed ? +exitPrice.toFixed(4) : null,
    mark: closed ? null : +bars[bars.length - 1].c.toFixed(4), markDate: closed ? null : bars[bars.length - 1].t,
    r: +res.r.toFixed(3), pct: +res.pct.toFixed(2), pnl: +(dir * (exitPrice - res.entry) * shares).toFixed(2),
    days: res.held, mfeR: +res.mfe.toFixed(2), hit1272,
    spyPct: benchPct(bench, bars[res.entryI].t, exitDate) == null ? null : +benchPct(bench, bars[res.entryI].t, exitDate).toFixed(2),
  });
}

/* rows: [{sym, bars}] from the daily scan; bench: SPY daily bars.
   Returns {ledger, opened, closedToday, lines} and writes paper/ledger.json. */
function update(rows, bench, opts) {
  opts = opts || {};
  const prev = load();
  const ledger = prev || { rules: RULES, createdAt: new Date().toISOString().slice(0, 10), lastSignalDate: null, trades: [] };
  const firstRun = !prev;
  const today = rows.length ? rows[0].bars[rows[0].bars.length - 1].t : null;
  const opened = [], closedToday = [];
  const bySym = Object.fromEntries(rows.map(r => [r.sym, r.bars]));

  // 1. refresh trades that are not closed yet (open / pending); closed ones stay frozen
  for (let i = 0; i < ledger.trades.length; i++) {
    const tr = ledger.trades[i];
    if (tr.status === 'closed' || tr.status === 'skipped') continue;
    const bars = bySym[tr.sym]; if (!bars) continue;
    const t = bars.findIndex(b => b.t === tr.signalDate); if (t < 0) continue;
    const s = confirmedAt(bars, t).find(x => x.key === tr.key) || confirmedAt(bars, t)[0];
    if (!s) continue;
    const upd = Object.assign(play(bars, t, s, bench), { sym: tr.sym, id: tr.id, source: tr.source });
    if (upd.status === 'closed') closedToday.push(upd);
    ledger.trades[i] = upd;
  }

  // 2. new signals after the last processed day (first run: from the start date)
  const from = ledger.lastSignalDate || RULES.start;
  for (const { sym } of rows) {
    const bars = bySym[sym];
    for (let t = 60; t < bars.length; t++) {
      if (!(bars[t].t > from) && !(firstRun && bars[t].t >= RULES.start)) continue;
      const busy = ledger.trades.some(x => x.sym === sym && (x.status === 'open' || x.status === 'pending') && x.signalDate < bars[t].t) ||
        ledger.trades.some(x => x.sym === sym && x.status === 'closed' && x.entryDate <= bars[t].t && x.exitDate >= bars[t].t);
      if (busy) continue;
      const sig = confirmedAt(bars, t)[0];
      if (!sig || !sig.plan) continue;
      const tr = Object.assign(play(bars, t, sig, bench), { sym, id: sym + '-' + bars[t].t, source: firstRun || opts.backfill ? 'history' : 'live' });
      if (ledger.trades.some(x => x.id === tr.id)) continue;
      ledger.trades.push(tr);
      if (t >= bars.length - 1) opened.push(tr);
    }
  }
  if (today) ledger.lastSignalDate = today;
  if (bench) ledger.bench = bench.filter(b => b.t >= RULES.start).map(b => ({ t: b.t, c: +b.c.toFixed(2) }));
  ledger.updatedAt = new Date().toISOString();
  ledger.trades.sort((a, b) => (a.signalDate < b.signalDate ? 1 : a.signalDate > b.signalDate ? -1 : a.sym.localeCompare(b.sym)));
  ledger.summary = summarize(ledger.trades);
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(ledger, null, 1));
  return { ledger, opened, closedToday, lines: report(ledger, opened, closedToday) };
}

function summarize(trades) {
  const c = trades.filter(t => t.status === 'closed');
  const o = trades.filter(t => t.status === 'open');
  const sum = (L, f) => L.reduce((a, t) => a + (f(t) || 0), 0);
  const spy = c.filter(t => t.spyPct != null);
  return {
    closed: c.length, open: o.length, pending: trades.filter(t => t.status === 'pending').length,
    wins: c.filter(t => t.pnl > 0).length, winRate: c.length ? c.filter(t => t.pnl > 0).length / c.length : null,
    avgR: c.length ? sum(c, t => t.r) / c.length : null, avgPct: c.length ? sum(c, t => t.pct) / c.length : null,
    pnl: sum(c, t => t.pnl), openPnl: sum(o, t => t.dir * (t.mark - t.entry) * t.shares),
    avgSpyPct: spy.length ? sum(spy, t => t.spyPct) / spy.length : null,
    byOutcome: { target: c.filter(t => t.outcome === 'target').length, stop: c.filter(t => t.outcome === 'stop').length, time: c.filter(t => t.outcome === 'time').length },
    hit1272: c.filter(t => t.hit1272 != null).length ? c.filter(t => t.hit1272).length / c.filter(t => t.hit1272 != null).length : null,
  };
}

function report(ledger, opened, closedToday) {
  const s = ledger.summary, f = x => (x == null ? '–' : (x >= 0 ? '+' : '') + x.toFixed(2));
  const L = ['', '## Paper portfolio (simulated trades on confirmed breaks)'];
  L.push(`Closed ${s.closed} · win rate ${s.winRate == null ? '–' : Math.round(s.winRate * 100) + '%'} · avg ${f(s.avgR)}R (${f(s.avgPct)}% per trade vs SPY ${f(s.avgSpyPct)}% over the same days) · realised ${f(s.pnl)} $ on a 10,000 $ account · open ${s.open} (${f(s.openPnl)} $ unrealised).`);
  if (opened.length) L.push('New signals (enter at today\'s open if it is within 1 ATR of the planned entry): ' + opened.map(t => `${t.dir > 0 ? 'long' : 'short'} ${t.sym} (stop ${t.stop}, target ${t.target})`).join('; ') + '.');
  if (closedToday.length) L.push('Closed: ' + closedToday.map(t => `${t.sym} ${t.outcome} ${f(t.r)}R (${f(t.pct)}%)`).join('; ') + '.');
  return L;
}

module.exports = { update, RULES, FILE };

// Rebuild the ledger from the bars the last scan saved: node scan/paper.js --rebuild
if (require.main === module && process.argv.includes('--rebuild')) {
  const cache = JSON.parse(fs.readFileSync(path.join(__dirname, 'out', 'bars.json'), 'utf8'));
  try { fs.unlinkSync(FILE); } catch (e) { /* none yet */ }
  const r = update(cache.rows, cache.bench, { backfill: true });
  console.log(r.lines.join('\n'));
}
