/* Data: seeded synthetic markets built from waypoints, pattern templates for the
   library and trainer, and a CSV parser for real exports (Yahoo, Stooq, brokers). */
(function (root) {
  const D = {};

  D.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  D.gauss = function (rng) {
    let u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  function businessDays(start, count) {
    const out = [];
    const d = new Date(start + 'T00:00:00Z');
    while (out.length < count) {
      const wd = d.getUTCDay();
      if (wd !== 0 && wd !== 6) out.push(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return out;
  }

  /* wps: [[barsFromPrevious, level, volumeMultiplier?], ...]; first entry has 0 bars.
     Levels are relative (100 = base price). */
  D.fromWaypoints = function (wps, opts) {
    opts = opts || {};
    const rng = D.rng(opts.seed || 1);
    const base = opts.base || 100;
    const noise = opts.noise == null ? 0.006 : opts.noise;
    const wick = opts.wick == null ? 0.006 : opts.wick;
    const closes = [], volm = [];
    closes.push(wps[0][1]); volm.push(wps[0][2] || 1);
    for (let s = 1; s < wps.length; s++) {
      const [nb, lvl, vm] = wps[s];
      const from = wps[s - 1][1];
      for (let t = 1; t <= nb; t++) {
        closes.push(from + (lvl - from) * (t / nb));
        volm.push(vm || 1);
      }
    }
    const dates = businessDays(opts.start || '2025-01-02', closes.length);
    const bars = [];
    let dev = 0, prevC = closes[0] * base / 100;
    for (let i = 0; i < closes.length; i++) {
      dev = dev * 0.55 + D.gauss(rng) * noise;
      const c = closes[i] * base / 100 * (1 + dev);
      const o = i === 0 ? c * (1 - noise * 0.5) : prevC * (1 + D.gauss(rng) * noise * 0.35);
      const h = Math.max(o, c) * (1 + Math.abs(D.gauss(rng)) * wick);
      const l = Math.min(o, c) * (1 - Math.abs(D.gauss(rng)) * wick);
      const move = Math.abs(c - prevC) / prevC;
      const v = Math.round(1e6 * (0.75 + 0.5 * rng()) * volm[i] * (1 + Math.min(move / Math.max(noise, 0.002), 4) * 0.12));
      bars.push({ t: dates[i], o, h, l, c, v });
      prevC = c;
    }
    return bars;
  };

  /* ---------- Pattern templates (used by the library diagrams and the trainer) ----------
     lead: the trend that normally precedes the pattern. breakAt: index of the waypoint
     where the breakout leg starts (the trainer can hide everything from there on). */
  D.templates = {
    double_top:        { lead: 'up',   breakAt: 5, wps: [[0, 90], [10, 100], [9, 91], [9, 99.6], [8, 92], [4, 85, 1.7], [6, 83]] },
    double_bottom:     { lead: 'down', breakAt: 5, wps: [[0, 110], [10, 100], [9, 109], [9, 100.4], [8, 108], [4, 115, 1.8], [6, 117]] },
    head_shoulders:    { lead: 'up',   breakAt: 6, wps: [[0, 88], [8, 100], [7, 93], [9, 108], [9, 93.5], [7, 100.5], [7, 93, 1.2], [4, 87, 1.8], [5, 85]] },
    inv_head_shoulders:{ lead: 'down', breakAt: 6, wps: [[0, 112], [8, 100], [7, 107], [9, 92], [9, 106.5], [7, 99.5], [7, 107, 1.2], [4, 113, 1.8], [5, 115]] },
    asc_triangle:      { lead: 'up',   breakAt: 8, wps: [[0, 85], [8, 100], [7, 90], [6, 100], [6, 93.5], [6, 100, 0.8], [5, 96.5, 0.7], [4, 100.2, 0.7], [3, 106, 2.2], [5, 108]] },
    desc_triangle:     { lead: 'down', breakAt: 8, wps: [[0, 115], [8, 100], [7, 110], [6, 100], [6, 106.5], [6, 100, 0.8], [5, 103.5, 0.7], [4, 99.8, 0.7], [3, 94, 2.2], [5, 92]] },
    sym_triangle:      { lead: 'up',   breakAt: 8, wps: [[0, 88], [8, 110], [7, 92], [6, 107], [6, 95], [6, 104.5, 0.8], [5, 97.5, 0.7], [4, 102.5, 0.7], [3, 108, 2.0], [5, 111]] },
    rising_wedge:      { lead: 'up',   breakAt: 8, wps: [[0, 90], [8, 100], [6, 94], [7, 104.5], [5, 100], [6, 108, 0.8], [4, 104.5, 0.7], [4, 110.5, 0.7], [4, 102, 1.8], [5, 98]] },
    falling_wedge:     { lead: 'down', breakAt: 8, wps: [[0, 110], [8, 100], [6, 106], [7, 95.5], [5, 100], [6, 92, 0.8], [4, 95.5, 0.7], [4, 89.5, 0.7], [4, 98, 1.8], [5, 102]] },
    bull_flag:         { lead: 'up',   breakAt: 6, wps: [[0, 85], [8, 100, 1.8], [3, 97, 0.6], [3, 98.5, 0.6], [3, 95.8, 0.6], [3, 97.2, 0.6], [3, 101.5, 2.0], [6, 106]] },
    bear_flag:         { lead: 'down', breakAt: 6, wps: [[0, 115], [8, 100, 1.8], [3, 103, 0.6], [3, 101.5, 0.6], [3, 104.2, 0.6], [3, 102.8, 0.6], [3, 98.5, 2.0], [6, 94]] },
  };

  /* Expected direction once the pattern resolves (what the textbook says). */
  D.templateBias = {
    double_top: 'bear', double_bottom: 'bull', head_shoulders: 'bear', inv_head_shoulders: 'bull',
    asc_triangle: 'bull', desc_triangle: 'bear', sym_triangle: 'bull', rising_wedge: 'bear',
    falling_wedge: 'bull', bull_flag: 'bull', bear_flag: 'bear',
  };

  /* Builds a randomized instance of a template with a lead-in trend.
     Returns { bars, patternStart, breakIndex }. */
  D.templateInstance = function (key, seed, opts) {
    opts = opts || {};
    const rng = D.rng(seed);
    const tpl = D.templates[key];
    const jitterBars = n => (n === 0 ? 0 : Math.max(2, Math.round(n * (0.8 + rng() * 0.45))));
    const scale = 0.85 + rng() * 0.3; // pattern height multiplier around 100
    const lvl = l => 100 + (l - 100) * scale;
    const wps = tpl.wps.map(w => [jitterBars(w[0]), lvl(w[1]) * (1 + (rng() - 0.5) * 0.006), w[2]]);
    const start = wps[0][1];
    const leadLen = opts.leadLen || Math.round(45 + rng() * 30);
    const dir = tpl.lead === 'up' ? 1 : -1;
    const leadFrom = start * (1 - dir * (0.18 + rng() * 0.12));
    const mid = leadFrom + (start - leadFrom) * (0.55 + rng() * 0.15);
    const pull = mid - dir * Math.abs(start - leadFrom) * 0.12;
    const a = Math.round(leadLen * 0.45), b = Math.round(leadLen * 0.2), c = leadLen - a - b;
    const lead = [[0, leadFrom], [a, mid], [b, pull], [c, start]];
    let all = lead.concat(wps.slice(1));
    const patternStart = leadLen;
    let breakIndex = leadLen;
    for (let s = 1; s <= tpl.breakAt; s++) breakIndex += wps[s][0];
    if (opts.cutAtBreak) {
      all = lead.concat(wps.slice(1, tpl.breakAt + 1));
    }
    const bars = D.fromWaypoints(all, {
      seed: seed * 7 + 3,
      base: opts.base || Math.round(20 + rng() * 280),
      noise: opts.noise == null ? 0.004 + rng() * 0.003 : opts.noise,
      wick: opts.wick == null ? 0.005 : opts.wick,
      start: '2025-03-03',
    });
    return { bars, patternStart, breakIndex, wps };
  };

  /* ---------- Demo markets (synthetic, 250+ bars so the 200-day average exists) ---------- */
  const lead = (from, to) => [[0, from], [45, from + (to - from) * 0.35], [25, from + (to - from) * 0.25], [40, from + (to - from) * 0.7], [20, from + (to - from) * 0.6], [30, to]];
  D.samples = [
    {
      id: 'asc', ticker: 'DEMO-ASC', name: 'Ascending triangle → breakout',
      wps: lead(55, 85).concat([[12, 100], [10, 91], [10, 100, 0.9], [9, 94, 0.8], [8, 100, 0.8], [7, 96.5, 0.7], [6, 100.3, 0.7], [3, 107, 2.4], [8, 111, 1.3]]),
      seed: 11, base: 48,
    },
    {
      id: 'dbl', ticker: 'DEMO-DBL', name: 'Double bottom after a downtrend',
      wps: lead(150, 128).concat([[30, 100], [12, 112], [13, 100.6], [10, 111.5], [4, 117.5, 2.2], [6, 119.5, 1.1]]),
      seed: 23, base: 72,
    },
    {
      id: 'hs', ticker: 'DEMO-HS', name: 'Head & shoulders → breakdown',
      wps: lead(58, 88).concat([[15, 105], [10, 98], [12, 115], [12, 98.8], [10, 106], [9, 98.5, 1.3], [5, 91, 2.1], [5, 94.5, 1.0], [4, 92, 1.1]]),
      seed: 37, base: 140,
    },
    {
      id: 'flag', ticker: 'DEMO-FLAG', name: 'Bull flag in an uptrend',
      wps: lead(50, 78).concat([[12, 100, 1.9], [4, 96.8, 0.7], [4, 98.4, 0.6], [4, 95.6, 0.6], [3, 97, 0.6], [3, 102, 2.3], [8, 109, 1.3]]),
      seed: 41, base: 26,
    },
    {
      id: 'desc', ticker: 'DEMO-DESC', name: 'Descending triangle → breakdown',
      wps: lead(88, 110).concat([[15, 120], [10, 100], [10, 113], [9, 100.2, 0.9], [8, 108, 0.8], [7, 100, 0.8], [5, 104, 0.7], [4, 93, 2.2], [8, 89, 1.3]]),
      seed: 53, base: 63,
    },
    {
      id: 'trap', ticker: 'DEMO-TRAP', name: 'Failed breakout (bull trap)',
      wps: lead(66, 86).concat([[12, 100], [10, 91], [10, 100], [10, 90.8], [10, 100.2], [3, 103.8, 1.9], [3, 99.2, 1.4], [5, 93, 1.5], [6, 90, 1.2]]),
      seed: 67, base: 210,
    },
  ];

  D.sampleBars = function (sample) {
    return D.fromWaypoints(sample.wps, { seed: sample.seed, base: sample.base, noise: 0.005, wick: 0.006, start: '2025-01-02' });
  };

  /* A random market: regime-switching legs. */
  D.randomBars = function (seed) {
    const rng = D.rng(seed);
    const wps = [[0, 100]];
    let lvl = 100, total = 0;
    while (total < 280) {
      const len = Math.round(6 + rng() * 26);
      const move = (rng() - 0.47) * 0.22;
      lvl = Math.max(20, lvl * (1 + move));
      wps.push([len, lvl, 0.8 + rng() * 0.6]);
      total += len;
    }
    return D.fromWaypoints(wps, { seed: seed + 1, base: Math.round(15 + rng() * 200), noise: 0.007, wick: 0.007 });
  };

  /* ---------- CSV ---------- */
  D.parseCSV = function (text) {
    const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
    if (lines.length < 2) throw new Error('The file has no data rows.');
    const delim = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : (lines[0].includes('\t') ? '\t' : ',');
    const head = lines[0].split(delim).map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
    const find = names => head.findIndex(h => names.some(n => h === n || h.startsWith(n)));
    const iD = find(['date', 'time', 'timestamp', 'datetime', 'data']);
    const iO = find(['open', 'o', 'apertura']);
    const iH = find(['high', 'h', 'max']);
    const iL = find(['low', 'l', 'min']);
    let iC = head.findIndex(h => h === 'close' || h === 'c' || h === 'close/last' || h === 'chiusura' || h === 'last' || h === 'price');
    if (iC < 0) iC = find(['close', 'adj close', 'adj_close']);
    const iV = find(['volume', 'vol', 'v']);
    if ([iO, iH, iL, iC].some(x => x < 0)) {
      throw new Error('Could not find Open, High, Low and Close columns. Expected a header like: Date,Open,High,Low,Close,Volume');
    }
    const num = s => {
      if (s == null) return NaN;
      s = String(s).trim().replace(/^"|"$/g, '').replace(/[$€£\s]/g, '');
      if (delim === ';' && /,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
      return parseFloat(s);
    };
    const bars = [];
    for (let r = 1; r < lines.length; r++) {
      const cells = lines[r].split(delim);
      const b = {
        t: iD >= 0 ? cells[iD].trim().replace(/^"|"$/g, '') : String(r),
        o: num(cells[iO]), h: num(cells[iH]), l: num(cells[iL]), c: num(cells[iC]),
        v: iV >= 0 ? num(cells[iV]) || 0 : 0,
      };
      if ([b.o, b.h, b.l, b.c].some(x => !isFinite(x) || x <= 0)) continue;
      b.h = Math.max(b.h, b.o, b.c); b.l = Math.min(b.l, b.o, b.c);
      bars.push(b);
    }
    if (bars.length < 30) throw new Error('Need at least 30 valid rows; found ' + bars.length + '.');
    const t0 = Date.parse(bars[0].t), t1 = Date.parse(bars[bars.length - 1].t);
    if (isFinite(t0) && isFinite(t1) && t0 > t1) bars.reverse();
    return bars;
  };

  /* Daily → weekly bars (week = Monday-anchored). */
  D.toWeekly = function (bars) {
    const out = [];
    let cur = null, key = null;
    for (const b of bars) {
      const d = new Date(b.t);
      let k;
      if (isFinite(d)) {
        const m = new Date(d); m.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
        k = m.toISOString().slice(0, 10);
      } else k = Math.floor(out.length / 5);
      if (k !== key) {
        if (cur) out.push(cur);
        cur = { t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v };
        key = k;
      } else {
        cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; cur.v += b.v;
      }
    }
    if (cur) out.push(cur);
    return out;
  };

  /* Daily → monthly bars (calendar month). */
  D.toMonthly = function (bars) {
    const out = [];
    let cur = null, key = null;
    for (const b of bars) {
      const k = String(b.t).slice(0, 7);
      if (k !== key) {
        if (cur) out.push(cur);
        cur = { t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v };
        key = k;
      } else { cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; cur.v += b.v; }
    }
    if (cur) out.push(cur);
    return out;
  };

  root.SPD = D;
  if (typeof module !== 'undefined') module.exports = D;
})(typeof window !== 'undefined' ? window : globalThis);
