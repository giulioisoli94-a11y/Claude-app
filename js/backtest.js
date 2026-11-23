/* Walk-forward backtest core, shared by the app ("Backtest this chart") and
   the offline study in backtest/. For each bar t the scanner sees only bars up
   to t; new events on bar t are traded from bar t+1 with the plan's stop and
   target, plus a time exit. A random control (same direction, same stop and
   target distances in ATR, random entry bar) measures what that trade shape
   earns without the pattern. */
(function (root) {
  const P = root.SPP || (typeof require !== 'undefined' ? require('./patterns.js') : null);
  const I = root.SPI || (typeof require !== 'undefined' ? require('./indicators.js') : null);
  const B = {};

  B.TF = {
    D: { win: 300, hold: 40, warm: 120, label: 'Daily' },
    W: { win: 260, hold: 26, warm: 80, label: 'Weekly' },
    M: { win: 200, hold: 12, warm: 48, label: 'Monthly' },
  };

  // Is this signal a new tradeable event on the last bar of the window?
  B.eventOf = function (s, last) {
    if (s.bias !== 'bull' && s.bias !== 'bear') return null;
    if (!s.plan || !(s.plan.rr > 0)) return null;
    if (s.kind === 'candle') return s.i === last ? 'trigger' : null;
    if (s.kind === 'breakout') {
      if (s.key.startsWith('failed')) return s.i === last ? 'market' : null;
      return s.breakI === last ? 'market' : null;
    }
    if (s.kind === 'trendline') {
      if (s.key === 'trendline_break') return s.breakI === last ? 'market' : null;
      return s.i === last ? 'trigger' : null;
    }
    if (s.kind === 'chart') {
      if (s.breakI === last && s.status !== 'failed') return 'market'; // break bar; the study applies each confirmation rule
      if (s.status === 'forming' && (s.key === 'channel_up' || s.key === 'channel_down')) return 'trigger';
    }
    return null;
  };

  // 'market' = buy/sell next bar's open; 'trigger' = stop order at plan.entry, valid 3 bars.
  // Stop is assumed hit before target when both fall in one bar (conservative).
  B.simulate = function (bars, t, mode, dir, plan, hold) {
    let entry = null, k = t + 1;
    const { stop, target } = plan;
    if (mode === 'market') {
      if (k >= bars.length) return null;
      entry = bars[k].o;
    } else {
      for (; k < bars.length && k <= t + 3; k++) {
        const b = bars[k];
        if (dir > 0 ? b.h >= plan.entry : b.l <= plan.entry) { entry = dir > 0 ? Math.max(b.o, plan.entry) : Math.min(b.o, plan.entry); break; }
      }
      if (entry == null) return null;
    }
    const risk = dir * (entry - stop);
    if (!(risk > 0) || dir * (target - entry) <= 0) return null; // gapped through stop or target
    let hit1R = false;
    // pct = % return on the position; mfe = best excursion in R before the exit
    let mfe = 0;
    const fin = (r, outcome, j) => ({ r, pct: r * risk / entry * 100, outcome, held: j - k + 1, hit1R, entryI: k, exitI: j, entry, mfe });
    for (let j = k; j < bars.length && j < k + hold; j++) {
      const b = bars[j];
      const lo = dir > 0 ? b.l : -b.h, hi = dir > 0 ? b.h : -b.l, op = dir * b.o;
      if (lo <= dir * stop) { const ex = j === k ? dir * stop : Math.min(op, dir * stop); return fin((ex - dir * entry) / risk, 'stop', j); }
      if (hi >= dir * entry + risk) hit1R = true;
      mfe = Math.max(mfe, (hi - dir * entry) / risk);
      if (hi >= dir * target) { const ex = j === k ? dir * target : Math.max(op, dir * target); return fin((ex - dir * entry) / risk, 'target', j); }
    }
    const lastJ = Math.min(bars.length - 1, k + hold - 1);
    if (lastJ < k) return null;
    return fin((dir * bars[lastJ].c - dir * entry) / risk, lastJ === bars.length - 1 && k + hold - 1 > lastJ ? 'open' : 'time', lastJ);
  };

  B.control = function (bars, atr, rng, dir, ev, hold, n) {
    const out = [];
    for (let s = 0; s < n; s++) {
      const lo = Math.min(60, Math.floor(bars.length / 3));
      if (bars.length - lo < 5) break;
      const t = lo + Math.floor(rng() * (bars.length - lo - 2));
      const a = atr[t], e = bars[t + 1].o;
      const plan = { entry: e, stop: e - dir * ev.stopAtr * a, target: e + dir * ev.tgtAtr * a };
      const r = B.simulate(bars, t, 'market', dir, plan, hold);
      if (r && r.outcome !== 'open') out.push(r.r);
    }
    return out;
  };

  function rngOf(seed) {
    let a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  /* Walks bars [from, to). Call repeatedly with consecutive ranges to keep a
     browser responsive; pass the same `state` object each time. */
  B.walk = function (bars, tf, state, from, to) {
    const cfg = B.TF[tf];
    state.events = state.events || [];
    state.seen = state.seen || new Set();
    state.atr = state.atr || I.atr(bars, 14);
    state.rng = state.rng || rngOf(state.seed || 12345);
    const start = Math.max(from == null ? cfg.warm : from, cfg.warm);
    const end = Math.min(to == null ? bars.length - 1 : to, bars.length - 1);
    for (let t = start; t < end; t++) {
      const off = Math.max(0, t - cfg.win + 1);
      const an = P.analyze(bars.slice(off, t + 1));
      const last = t - off;
      for (const s of an.signals) {
        const mode = B.eventOf(s, last);
        if (!mode) continue;
        const id = s.key + ':' + (s.start + off);
        if (state.seen.has(id) && s.kind !== 'candle') continue;
        state.seen.add(id);
        const dir = s.bias === 'bull' ? 1 : -1;
        const res = B.simulate(bars, t, mode, dir, s.plan, cfg.hold);
        const a = an.ind.atr[last];
        const ck = k => { const c = s.checklist.find(x => x.k === k); return c ? c.ok : null; };
        const ev = {
          key: s.key, kind: s.kind, dir, mode, t, date: bars[t].t, start: s.start + off, score: s.score, status: s.status,
          trend: ck('trend'), vol: ck('vol'), rr: s.plan.rr,
          stop: s.plan.stop, target: s.plan.target,
          stopAtr: Math.abs(s.plan.entry - s.plan.stop) / a, tgtAtr: Math.abs(s.plan.target - s.plan.entry) / a,
          traded: !!res && res.outcome !== 'open',
        };
        if (res) Object.assign(ev, res);
        if (ev.traded) ev.ctrl = B.control(bars, state.atr, state.rng, dir, ev, cfg.hold, state.ctrlN || 5);
        if (mode === 'market' && s.level != null && !/^failed/.test(s.key) && state.study !== false) B.breakStudy(bars, t, s, dir, cfg, state, ev, a);
        state.events.push(ev);
      }
    }
    return state;
  };

  /* Confirmation rules and take-profit targets, studied on every break event.
     Each rule delays (or cancels) the entry; the trade then uses the same stop
     and measured-move target. */
  B.RULES = ['close', 'vol', 'follow', 'volfollow', 'retest'];
  B.RULE_LABEL = { close: 'Close beyond the line', vol: '+ volume ≥ 1.5×', follow: '+ second close beyond', volfollow: '+ volume and second close', retest: 'Pullback retest holds' };
  B.confirmBar = function (bars, t, level, dir, a, rule, volOK) {
    const beyond = j => dir * (bars[j].c - level) > 0;
    if (rule === 'close') return t;
    if (rule === 'vol') return volOK ? t : -1;
    if (rule === 'follow') return t + 1 < bars.length && beyond(t + 1) ? t + 1 : -1;
    if (rule === 'volfollow') return volOK && t + 1 < bars.length && beyond(t + 1) ? t + 1 : -1;
    if (rule === 'retest') {
      for (let k = t + 1; k < bars.length && k <= t + 10; k++) {
        if (dir * (bars[k].c - level) < -0.15 * a) return -1;
        if ((dir > 0 ? bars[k].l <= level + 0.5 * a : bars[k].h >= level - 0.5 * a) && beyond(k)) return k;
      }
      return -1;
    }
    return -1;
  };
  B.breakStudy = function (bars, t, s, dir, cfg, state, ev, a) {
    let vs = 0, vc = 0;
    for (let j = Math.max(0, t - 20); j < t; j++) { vs += bars[j].v || 0; vc++; }
    const vr = vs > 0 ? (bars[t].v || 0) / (vs / vc) : null;
    const volOK = vr != null && vr >= 1.5;
    // false break: closes back inside within 5 bars of the break
    let fb = false;
    for (let j = t + 1; j < bars.length && j <= t + 5; j++) if (dir * (bars[j].c - s.level) < -0.15 * a) { fb = true; break; }
    ev.fb = fb; ev.hasVol = vr != null;
    ev.v = {};
    for (const rule of B.RULES) {
      const tv = B.confirmBar(bars, t, s.level, dir, a, rule, volOK);
      if (tv < 0) { ev.v[rule] = null; continue; }
      const res = B.simulate(bars, tv, 'market', dir, s.plan, cfg.hold);
      if (!res || res.outcome === 'open') { ev.v[rule] = null; continue; }
      const c = B.control(bars, state.atr, state.rng, dir, ev, cfg.hold, 3);
      ev.v[rule] = { r: res.r, pct: res.pct, out: res.outcome, c: c.length ? c.reduce((x, y) => x + y, 0) / c.length : null, fb: (() => { for (let j = tv + 1; j < bars.length && j <= tv + 5; j++) if (dir * (bars[j].c - s.level) < -0.15 * a) return true; return false; })() };
    }
    // targets, entered under the 'close' and 'follow' rules
    if (s.targets && s.targets.length) {
      ev.tg = {};
      for (const rule of ['close', 'follow']) {
        const tv = B.confirmBar(bars, t, s.level, dir, a, rule, volOK);
        if (tv < 0) continue;
        const o = {};
        for (const tg of s.targets) {
          const res = B.simulate(bars, tv, 'market', dir, { entry: s.plan.entry, stop: s.plan.stop, target: tg.price }, cfg.hold);
          if (res && res.outcome !== 'open') o[tg.k] = { r: res.r, hit: res.outcome === 'target', pct: res.pct };
        }
        ev.tg[rule] = o;
      }
    }
  };

  B.stats = function (list) {
    const L = list.filter(e => e.traded);
    const n = L.length;
    if (!n) return { n: 0 };
    const rs = L.map(e => e.r);
    const avg = rs.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(rs.reduce((a, b) => a + (b - avg) ** 2, 0) / Math.max(1, n - 1));
    const ctrl = L.flatMap(e => e.ctrl || []);
    const cavg = ctrl.length ? ctrl.reduce((a, b) => a + b, 0) / ctrl.length : null;
    const gp = rs.filter(r => r > 0).reduce((a, b) => a + b, 0), gl = -rs.filter(r => r <= 0).reduce((a, b) => a + b, 0);
    return {
      n, win: rs.filter(r => r > 0).length / n, avgR: avg, ci: 1.96 * sd / Math.sqrt(n), pf: gl > 0 ? gp / gl : null,
      tgt: L.filter(e => e.outcome === 'target').length / n, stop: L.filter(e => e.outcome === 'stop').length / n,
      held: L.reduce((a, e) => a + e.held, 0) / n, rr: L.reduce((a, e) => a + e.rr, 0) / n,
      pct: L.reduce((a, e) => a + (e.pct || 0), 0) / n,
      ctrlAvgR: cavg, edge: cavg == null ? null : avg - cavg,
    };
  };

  // Verdict from edge and its 95% interval (control noise is small next to the signal's).
  B.verdict = function (s) {
    if (!s || !s.n || s.edge == null) return { k: 'none', label: 'No data' };
    if (s.n < 30) return { k: 'thin', label: 'Too few trades' };
    if (s.edge - s.ci > 0) return { k: 'good', label: 'Beat random' };
    if (s.edge + s.ci < 0) return { k: 'bad', label: 'Worse than random' };
    return { k: 'flat', label: 'No measurable edge' };
  };

  root.SPB = B;
  if (typeof module !== 'undefined') module.exports = B;
})(typeof window !== 'undefined' ? window : globalThis);
