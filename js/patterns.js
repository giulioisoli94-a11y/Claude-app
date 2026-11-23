/* Pattern engine. Everything is measured in ATR (average true range) so the
   same rules work for a $5 stock and a $500 stock.

   Pipeline: indicators → swing pivots (zig-zag) → support/resistance levels,
   trend lines, chart patterns, candlestick patterns, level breaks →
   signals with a trade plan and a confirmation checklist. */
(function (root) {
  const I = root.SPI || (typeof require !== 'undefined' ? require('./indicators.js') : null);
  const P = {};

  /* ---------------- helpers ---------------- */
  const maxOf = (bars, a, b, f) => { let m = -Infinity, at = a; for (let i = Math.max(0, a); i <= b; i++) if (bars[i][f] > m) { m = bars[i][f]; at = i; } return [m, at]; };
  const minOf = (bars, a, b, f) => { let m = Infinity, at = a; for (let i = Math.max(0, a); i <= b; i++) if (bars[i][f] < m) { m = bars[i][f]; at = i; } return [m, at]; };
  function fit(pts) { // least squares y = a + b*i
    const n = pts.length;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const p of pts) { sx += p.i; sy += p.price; sxx += p.i * p.i; sxy += p.i * p.price; }
    const den = n * sxx - sx * sx;
    const b = den === 0 ? 0 : (n * sxy - sx * sy) / den;
    const a = (sy - b * sx) / n;
    return { a, b, at: i => a + b * i };
  }
  function lineThrough(p, q) { const b = (q.price - p.price) / (q.i - p.i); return { b, at: i => p.price + b * (i - p.i) }; }
  function plan(entry, stop, target) {
    const risk = Math.abs(entry - stop), reward = Math.abs(target - entry);
    return { entry, stop, target, rr: risk > 0 ? reward / risk : null };
  }

  /* ---------------- swing pivots ----------------
     Zig-zag: a swing high is confirmed once price falls `mult` ATRs below it,
     and vice versa. The final, unconfirmed extreme is flagged tentative. */
  P.zigzag = function (bars, atr, mult) {
    const n = bars.length, piv = [];
    if (n < 3) return piv;
    let dir = 0, ext = 0, hiI = 0, loI = 0;
    for (let i = 1; i < n; i++) {
      const th = mult * atr[i];
      const b = bars[i];
      if (dir === 0) {
        if (b.h > bars[hiI].h) hiI = i;
        if (b.l < bars[loI].l) loI = i;
        if (bars[hiI].h - bars[loI].l >= th) {
          if (loI < hiI) { piv.push({ i: loI, price: bars[loI].l, type: 'L' }); dir = 1; ext = hiI; }
          else { piv.push({ i: hiI, price: bars[hiI].h, type: 'H' }); dir = -1; ext = loI; }
        }
      } else if (dir === 1) {
        if (b.h >= bars[ext].h) ext = i;
        else if (bars[ext].h - b.l >= th) { piv.push({ i: ext, price: bars[ext].h, type: 'H' }); dir = -1; ext = i; }
      } else {
        if (b.l <= bars[ext].l) ext = i;
        else if (b.h - bars[ext].l >= th) { piv.push({ i: ext, price: bars[ext].l, type: 'L' }); dir = 1; ext = i; }
      }
    }
    if (dir !== 0) piv.push({ i: ext, price: dir === 1 ? bars[ext].h : bars[ext].l, type: dir === 1 ? 'H' : 'L', tentative: true });
    return piv;
  };

  /* ---------------- support & resistance ----------------
     Cluster swing points whose prices sit within ~0.6 ATR of each other. */
  P.levels = function (bars, piv, atr) {
    const n = bars.length, last = bars[n - 1].c;
    const tol = Math.max(0.6 * atr[n - 1], last * 0.005);
    const pts = piv.filter(p => !p.tentative).slice().sort((a, b) => a.price - b.price);
    const clusters = [];
    for (const p of pts) {
      const c = clusters[clusters.length - 1];
      if (c && p.price - c.mean <= tol) { c.pts.push(p); c.mean = c.pts.reduce((s, q) => s + q.price, 0) / c.pts.length; }
      else clusters.push({ pts: [p], mean: p.price });
    }
    return clusters.filter(c => c.pts.length >= 2).map(c => {
      const idx = c.pts.map(p => p.i).sort((a, b) => a - b);
      return {
        price: c.mean,
        touches: c.pts.length,
        idx,
        highs: c.pts.filter(p => p.type === 'H').length,
        lows: c.pts.filter(p => p.type === 'L').length,
        first: idx[0], last: idx[idx.length - 1],
        role: c.mean < last ? 'support' : 'resistance',
      };
    });
  };

  /* Nearest few levels on each side of price, for the chart. */
  P.keyLevels = function (levels, price) {
    const sup = levels.filter(l => l.price < price && l.price > price * 0.7).sort((a, b) => b.price - a.price).slice(0, 3);
    const res = levels.filter(l => l.price >= price && l.price < price * 1.4).sort((a, b) => a.price - b.price).slice(0, 3);
    return sup.concat(res);
  };

  /* ---------------- trend lines ----------------
     Rising support lines through swing lows / falling resistance lines through
     swing highs. A line is valid while no close has crossed it by more than
     0.35 ATR. Scored by touches, length and freshness. */
  P.trendlines = function (bars, piv, atr) {
    const n = bars.length, look = Math.max(0, n - 180);
    const result = { support: null, resistance: null };
    for (const side of ['L', 'H']) {
      const ps = piv.filter(p => p.type === side && p.i >= look);
      const conf = ps.filter(p => !p.tentative);
      let best = null;
      for (let a = 0; a < conf.length; a++) {
        for (let b = a + 1; b < conf.length; b++) {
          const A = conf[a], B = conf[b];
          if (B.i - A.i < 5) continue;
          const ln = lineThrough(A, B);
          if (side === 'L' && ln.b <= 0) continue;
          if (side === 'H' && ln.b >= 0) continue;
          let ok = true;
          for (let k = A.i; k <= B.i && ok; k++) {
            const t = 0.35 * atr[k];
            if (side === 'L' ? bars[k].c < ln.at(k) - t : bars[k].c > ln.at(k) + t) ok = false;
          }
          if (!ok) continue;
          let brk = -1;
          for (let k = B.i + 1; k < n; k++) {
            const t = 0.35 * atr[k];
            if (side === 'L' ? bars[k].c < ln.at(k) - t : bars[k].c > ln.at(k) + t) { brk = k; break; }
          }
          if (brk !== -1 && brk < n - 10) continue;
          const endI = brk === -1 ? n - 1 : brk;
          const touchPts = ps.filter(p => p.i >= A.i && p.i <= endI && Math.abs(p.price - ln.at(p.i)) <= 0.5 * atr[p.i]);
          const touches = touchPts.length;
          if (touches < 2) continue;
          const proj = ln.at(n - 1);
          if (proj <= 0 || Math.abs(proj - bars[n - 1].c) / bars[n - 1].c > 0.25) continue;
          const lastTouch = touchPts[touchPts.length - 1].i;
          const score = touches * 10 + (B.i - A.i) / 6 - (n - 1 - lastTouch) / 15 + (brk === -1 ? 3 : 6);
          if (!best || score > best.score) best = { side, A, B, slope: ln.b, at: ln.at, brk, touches, touchPts, score };
        }
      }
      if (best) result[side === 'L' ? 'support' : 'resistance'] = best;
    }
    return result;
  };

  /* ---------------- chart patterns ---------------- */
  function priorMove(bars, i, look, dir) { // size of the move into bar i over `look` bars
    if (dir > 0) { const [lo] = minOf(bars, i - look, i, 'l'); return bars[i].h - lo; }
    const [hi] = maxOf(bars, i - look, i, 'h'); return hi - bars[i].l;
  }

  function scanDoubles(bars, piv, atr, out) {
    const n = bars.length;
    for (let j = 0; j + 2 < piv.length; j++) {
      const p0 = piv[j], p1 = piv[j + 1], p2 = piv[j + 2];
      const top = p0.type === 'H';
      if (p0.type !== p2.type || p1.type === p0.type) continue;
      const a = atr[p2.i];
      const peak = top ? Math.max(p0.price, p2.price) : Math.min(p0.price, p2.price);
      const tol = Math.max(1.0 * a, 0.012 * peak);
      if (Math.abs(p0.price - p2.price) > tol) continue;
      const depth = Math.abs(peak - p1.price);
      if (depth < Math.max(2.5 * a, 0.04 * peak)) continue;
      if (p2.i - p0.i < 8 || p2.i - p0.i > 130) continue;
      if (priorMove(bars, p0.i, 40, top ? 1 : -1) < depth * 0.8) continue;
      // the two extremes must be the extreme of the area (no higher high / lower low just before)
      const w = p2.i - p0.i;
      if (top ? maxOf(bars, p0.i - w, p0.i, 'h')[0] > peak + 0.5 * a : minOf(bars, p0.i - w, p0.i, 'l')[0] < peak - 0.5 * a) continue;
      const neck = p1.price;
      let brk = -1, invalid = false;
      const expiry = p2.i + Math.max(10, p2.i - p0.i); // a break much later than this is unrelated
      for (let k = p2.i + 1; k < n; k++) {
        const t = 0.1 * atr[k];
        if (k > expiry) { invalid = true; break; }
        if (top ? bars[k].c > peak + 0.5 * atr[k] : bars[k].c < peak - 0.5 * atr[k]) { invalid = true; break; }
        if (top ? bars[k].c < neck - t : bars[k].c > neck + t) { brk = k; break; }
      }
      if (invalid) continue;
      if (brk === -1 && (j + 2 < piv.length - 2 || p2.i < n - 40)) continue;
      if (brk !== -1 && brk < n - 60) continue;
      let failed = -1;
      if (brk !== -1) for (let k = brk + 1; k < n; k++) if (top ? bars[k].c > peak : bars[k].c < peak) { failed = k; break; }
      const key = top ? 'double_top' : 'double_bottom';
      const target = top ? neck - depth : neck + depth;
      // Stop: halfway back into the pattern (min 1.5 ATR). A stop beyond the second
      // top/bottom is safer but caps reward/risk near 1:1.
      const stopDist = Math.max(1.5 * a, depth * 0.5);
      const stop = top ? neck + stopDist : neck - stopDist;
      const entry = top ? neck - 0.1 * a : neck + 0.1 * a;
      const endI = brk === -1 ? n - 1 : Math.min(n - 1, brk + 15);
      out.push({
        key, kind: 'chart', bias: top ? 'bear' : 'bull',
        status: failed !== -1 ? 'failed' : brk !== -1 ? 'confirmed' : 'forming',
        i: failed !== -1 ? failed : brk !== -1 ? brk : p2.i, start: p0.i, breakI: brk,
        detail: (top ? 'Two peaks' : 'Two troughs') + ' at ' + fmt(p0.price) + ' and ' + fmt(p2.price) +
          ', neckline ' + fmt(neck) + '. ' + (brk !== -1 ? 'Price closed ' + (top ? 'below' : 'above') + ' the neckline on ' + bars[brk].t + '.' : 'Waiting for a close ' + (top ? 'below' : 'above') + ' the neckline.'),
        volRatio: brk !== -1 ? volRatio(bars, brk) : null,
        plan: plan(entry, stop, target),
        overlay: [
          { t: 'poly', pts: [[p0.i, p0.price], [p1.i, p1.price], [p2.i, p2.price]], labels: [top ? 'Top 1' : 'Bottom 1', '', top ? 'Top 2' : 'Bottom 2'] },
          { t: 'hline', y: neck, from: p0.i, to: endI, label: 'Neckline' },
        ],
      });
    }
  }

  function scanHS(bars, piv, atr, out) {
    const n = bars.length;
    for (let j = 0; j + 4 < piv.length; j++) {
      const s = piv.slice(j, j + 5);
      const top = s[0].type === 'H';
      if (!(s[0].type === s[2].type && s[2].type === s[4].type && s[1].type !== s[0].type)) continue;
      const a = atr[s[4].i];
      const [ls, l1, hd, l2, rs] = s;
      const sign = top ? 1 : -1;
      if ((hd.price - ls.price) * sign < 1.0 * a || (hd.price - rs.price) * sign < 1.0 * a) continue;
      if (Math.abs(ls.price - rs.price) > Math.max(1.5 * a, Math.abs(hd.price - l1.price) * 0.45)) continue;
      const neckLn = lineThrough(l1, l2);
      const height = Math.abs(hd.price - neckLn.at(hd.i));
      if (height < 3 * a) continue;
      if (Math.abs(neckLn.b) * (l2.i - l1.i) > height * 0.4) continue;
      const tl = hd.i - ls.i, tr = rs.i - hd.i; // shoulders roughly balanced in time
      if (tl / tr > 2.5 || tr / tl > 2.5) continue;
      if (rs.i - ls.i > 160) continue;
      if (priorMove(bars, ls.i, 40, sign) < height * 0.6) continue;
      let brk = -1, invalid = false;
      const expiry = rs.i + Math.max(10, Math.round((rs.i - ls.i) * 0.75));
      for (let k = rs.i + 1; k < n; k++) {
        if (k > expiry) { invalid = true; break; }
        if (top ? bars[k].c > hd.price : bars[k].c < hd.price) { invalid = true; break; }
        const t = 0.1 * atr[k];
        if (top ? bars[k].c < neckLn.at(k) - t : bars[k].c > neckLn.at(k) + t) { brk = k; break; }
      }
      if (invalid) continue;
      if (brk === -1 && (j + 4 < piv.length - 2 || rs.i < n - 40)) continue;
      if (brk !== -1 && brk < n - 60) continue;
      const key = top ? 'head_shoulders' : 'inv_head_shoulders';
      const atBreak = neckLn.at(brk === -1 ? n - 1 : brk);
      const target = atBreak - sign * height;
      const stop = rs.price + sign * 0.25 * a;
      const entry = atBreak - sign * 0.1 * a;
      const endI = brk === -1 ? n - 1 : Math.min(n - 1, brk + 15);
      out.push({
        key, kind: 'chart', bias: top ? 'bear' : 'bull',
        status: brk !== -1 ? 'confirmed' : 'forming',
        i: brk !== -1 ? brk : rs.i, start: ls.i, breakI: brk,
        detail: 'Left shoulder ' + fmt(ls.price) + ', head ' + fmt(hd.price) + ', right shoulder ' + fmt(rs.price) +
          '. Pattern height ' + fmt(height) + '. ' + (brk !== -1 ? 'Neckline broken on ' + bars[brk].t + '.' : 'Neckline now near ' + fmt(neckLn.at(n - 1)) + '.'),
        volRatio: brk !== -1 ? volRatio(bars, brk) : null,
        plan: plan(entry, stop, target),
        overlay: [
          { t: 'poly', pts: s.map(p => [p.i, p.price]), labels: ['LS', '', 'Head', '', 'RS'] },
          { t: 'line', x1: l1.i, y1: l1.price, x2: endI, y2: neckLn.at(endI), label: 'Neckline' },
        ],
      });
    }
  }

  const CONV_BIAS = { asc_triangle: 'bull', desc_triangle: 'bear', sym_triangle: 'neutral', rising_wedge: 'bear', falling_wedge: 'bull', channel_up: 'bull', channel_down: 'bear', rectangle: 'neutral' };

  function scanConverging(bars, pivAll, atr, out) {
    const n = bars.length;
    const piv = pivAll.filter(p => !p.tentative); // only confirmed swings define the lines
    const found = [];
    for (let end = piv.length - 1; end >= Math.max(3, piv.length - 5) && found.length < 2; end--) {
      for (const m of [7, 6, 5, 4]) {
        const s = end - m + 1;
        if (s < 0) continue;
        const ps = piv.slice(s, end + 1);
        const H = ps.filter(p => p.type === 'H'), L = ps.filter(p => p.type === 'L');
        if (H.length < 2 || L.length < 2 || H.length + L.length < 5) continue;
        const i0 = ps[0].i, i1 = ps[ps.length - 1].i, span = i1 - i0;
        if (span < 12 || span > 130) continue;
        // both lines must be drawn through swings spread across the pattern, not one outlier
        if (H[H.length - 1].i - H[0].i < 0.45 * span || L[L.length - 1].i - L[0].i < 0.45 * span) continue;
        if (found.some(f => !(i1 < f.i0 || i0 > f.i1))) continue;
        const lh = fit(H), ll = fit(L);
        const a = atr[i1];
        if (H.some(p => Math.abs(p.price - lh.at(p.i)) > 0.8 * a) || L.some(p => Math.abs(p.price - ll.at(p.i)) > 0.8 * a)) continue;
        const w0 = lh.at(i0) - ll.at(i0), w1 = lh.at(i1) - ll.at(i1);
        if (w0 <= 1.5 * a || w1 <= 0) continue;
        let outside = 0;
        for (let k = i0; k <= i1; k++) if (bars[k].c > lh.at(k) + 0.5 * atr[k] || bars[k].c < ll.at(k) - 0.5 * atr[k]) outside++;
        if (outside > span * 0.1) continue;
        const dH = lh.b * span / a, dL = ll.b * span / a;
        // "flat" = moves less than 1.2 ATR and less than 3% of price across the pattern
        const px = bars[i1].c;
        const flatH = Math.abs(dH) < 1.2 && Math.abs(lh.b * span) < 0.03 * px, flatL = Math.abs(dL) < 1.2 && Math.abs(ll.b * span) < 0.03 * px;
        const conv = w1 < w0 * 0.75, par = Math.abs(w1 - w0) < 0.3 * w0;
        let key = null;
        if (flatH && dL > 1.5 && conv) key = 'asc_triangle';
        else if (flatL && dH < -1.5 && conv) key = 'desc_triangle';
        else if (dH < -1 && dL > 1 && conv) key = 'sym_triangle';
        else if (dH > 1 && dL > 1 && conv && dL > dH) key = 'rising_wedge';
        else if (dH < -1 && dL < -1 && conv && dH < dL) key = 'falling_wedge';
        else if (par && dH > 2 && dL > 2) key = 'channel_up';
        else if (par && dH < -2 && dL < -2) key = 'channel_down';
        else if (flatH && flatL && par && (H.length + L.length) >= 4) key = 'rectangle';
        if (!key) continue;
        // parallel shapes form easily by chance: need three touches on each line
        if ((key === 'channel_up' || key === 'channel_down' || key === 'rectangle') && (H.length < 3 || L.length < 3)) continue;
        // apex for converging shapes
        const apex = lh.b !== ll.b ? (ll.a - lh.a) / (lh.b - ll.b) : Infinity;
        // a converging pattern must break before ~80% of the way to its apex
        const conv2 = key !== 'channel_up' && key !== 'channel_down' && key !== 'rectangle';
        const lastValid = conv2 ? i0 + 0.8 * (apex - i0) : Infinity;
        if (conv2 && !(apex > i1) ) continue;
        let brk = -1, dir = 0;
        for (let k = i1 + 1; k < n; k++) {
          if (k > lastValid) break;
          const t = 0.15 * atr[k];
          if (bars[k].c > lh.at(k) + t) { brk = k; dir = 1; break; }
          if (bars[k].c < ll.at(k) - t) { brk = k; dir = -1; break; }
        }
        if (brk === -1 && (end < piv.length - 2 || i1 < n - 40 || n - 1 > lastValid)) continue;
        const hgt = lh.at(ps[1].i) - ll.at(ps[1].i); // measured height, skipping the entry swing
        if (brk !== -1 && brk < n - 60) continue;
        // a break must still hold (or be the latest bar) to count as confirmed
        let failed = -1;
        if (brk !== -1) for (let k = brk + 1; k < n; k++) {
          if (dir > 0 ? bars[k].c < ll.at(Math.min(k, i1)) : bars[k].c > lh.at(Math.min(k, i1))) { failed = k; break; }
        }
        const expected = CONV_BIAS[key];
        const bias = brk !== -1 ? (dir > 0 ? 'bull' : 'bear') : expected;
        const endI = brk === -1 ? n - 1 : Math.min(n - 1, brk + 6);
        const lineEnd = conv2 && isFinite(apex) && apex > i1 ? Math.min(endI, Math.floor(apex)) : endI;
        let entry, stop, target;
        const lastLow = L[L.length - 1].price, lastHigh = H[H.length - 1].price;
        if (bias === 'bull' || (bias === 'neutral')) {
          const bk = brk !== -1 ? lh.at(brk) : lh.at(n - 1);
          entry = bk + 0.1 * a; stop = Math.max(lastLow, ll.at(brk !== -1 ? brk : n - 1)) - 0.25 * a; target = bk + hgt;
        } else {
          const bk = brk !== -1 ? ll.at(brk) : ll.at(n - 1);
          entry = bk - 0.1 * a; stop = Math.min(lastHigh, lh.at(brk !== -1 ? brk : n - 1)) + 0.25 * a; target = bk - hgt;
        }
        if (key === 'channel_up' && brk === -1) { entry = ll.at(n - 1) + 0.3 * a; stop = ll.at(n - 1) - 0.8 * a; target = lh.at(n - 1); }
        if (key === 'channel_down' && brk === -1) { entry = lh.at(n - 1) - 0.3 * a; stop = lh.at(n - 1) + 0.8 * a; target = ll.at(n - 1); }
        const against = brk !== -1 && expected !== 'neutral' && expected !== bias;
        found.push({ i0, i1 });
        out.push({
          key, kind: 'chart', bias,
          status: failed !== -1 ? 'failed' : brk !== -1 ? 'confirmed' : 'forming',
          breakDir: dir, against,
          i: failed !== -1 ? failed : brk !== -1 ? brk : i1, start: i0, breakI: brk,
          detail: H.length + ' swing highs and ' + L.length + ' swing lows over ' + span + ' bars. ' +
            'Upper line ' + slopeWord(dH) + ', lower line ' + slopeWord(dL) + '. ' +
            (brk !== -1 ? (dir > 0 ? 'Closed above' : 'Closed below') + ' the ' + (dir > 0 ? 'upper' : 'lower') + ' line on ' + bars[brk].t + '.' +
              (against ? ' This broke against the usual bias for the shape, so the break itself is the signal.' : '') : 'Still inside the lines.'),
          volRatio: brk !== -1 ? volRatio(bars, brk) : null,
          plan: plan(entry, stop, target),
          overlay: [
            { t: 'line', x1: i0, y1: lh.at(i0), x2: lineEnd, y2: lh.at(lineEnd), label: 'Upper' },
            { t: 'line', x1: i0, y1: ll.at(i0), x2: lineEnd, y2: ll.at(lineEnd), label: 'Lower' },
            { t: 'dots', pts: ps.map(p => [p.i, p.price]) },
          ],
        });
        break;
      }
    }
  }
  function slopeWord(d) { return Math.abs(d) < 1.2 ? 'flat' : d > 0 ? 'rising' : 'falling'; }

  function scanFlags(bars, atr, out) {
    const n = bars.length;
    let found = 0;
    for (const bull of [true, false]) {
      for (let e = n - 3; e >= Math.max(15, n - 70) && found < 2; e--) {
        const a = atr[e];
        // e must be the pole extreme
        if (bull) { if (maxOf(bars, e - 10, e, 'h')[1] !== e || bars[e + 1].h > bars[e].h) continue; }
        else if (minOf(bars, e - 10, e, 'l')[1] !== e || bars[e + 1].l < bars[e].l) continue;
        const [pStart, sI] = bull ? minOf(bars, e - 15, e - 3, 'l') : maxOf(bars, e - 15, e - 3, 'h');
        const tip = bull ? bars[e].h : bars[e].l;
        const pole = Math.abs(tip - pStart);
        if (pole < 4 * a || pole / pStart < 0.06) continue;
        // walk the flag
        let brk = -1, k = e + 1, ok = true, ext = bull ? -Infinity : Infinity;
        for (; k < n && k <= e + 16; k++) {
          const b = bars[k];
          if (bull ? b.l < tip - 0.55 * pole : b.h > tip + 0.55 * pole) { ok = false; break; }
          if (k - e >= 5) {
            const t = 0.1 * atr[k];
            if (bull ? b.c > ext + t : b.c < ext - t) { brk = k; break; }
          }
          if (bull ? b.h > tip + 0.2 * atr[k] : b.l < tip - 0.2 * atr[k]) { ok = false; break; }
          ext = bull ? Math.max(ext, b.h) : Math.min(ext, b.l);
        }
        if (!ok) continue;
        if (brk === -1 && k > e + 16) continue; // flag ran too long without breaking
        if (brk === -1 && n - 1 - e < 5) continue;
        const flagEnd = brk === -1 ? n - 1 : brk - 1;
        const [fHi] = maxOf(bars, e + 1, flagEnd, 'h');
        const [fLo] = minOf(bars, e + 1, flagEnd, 'l');
        if ((fHi - fLo) > pole * 0.6) continue;
        if (Math.abs(tip - (bull ? fLo : fHi)) < 1.0 * a) continue; // needs a real pause/pullback
        const key = bull ? 'bull_flag' : 'bear_flag';
        const entry = bull ? fHi + 0.1 * a : fLo - 0.1 * a;
        const stop = bull ? fLo - 0.25 * a : fHi + 0.25 * a;
        const target = bull ? entry + pole : entry - pole;
        out.push({
          key, kind: 'chart', bias: bull ? 'bull' : 'bear',
          status: brk !== -1 ? 'confirmed' : 'forming',
          i: brk !== -1 ? brk : n - 1, start: sI, breakI: brk,
          detail: 'Pole of ' + fmt(pole) + ' (' + (pole / pStart * 100).toFixed(1) + '%) in ' + (e - sI) + ' bars, then a ' +
            (flagEnd - e) + '-bar pause that gave back ' + (Math.abs(tip - (bull ? fLo : fHi)) / pole * 100).toFixed(0) + '% of it. ' +
            (brk !== -1 ? 'Broke out of the flag on ' + bars[brk].t + '.' : 'Trigger: a close beyond ' + fmt(bull ? fHi : fLo) + '.'),
          volRatio: brk !== -1 ? volRatio(bars, brk) : null,
          plan: plan(entry, stop, target),
          overlay: [
            { t: 'line', x1: sI, y1: pStart, x2: e, y2: tip, label: 'Pole' },
            { t: 'box', from: e + 1, to: flagEnd, lo: fLo, hi: fHi, label: 'Flag' },
          ],
        });
        found++;
        break;
      }
    }
  }

  /* ---------------- candlestick patterns ---------------- */
  P.candles = function (bars, ind) {
    const n = bars.length, res = [];
    const { atr, bodyAvg, sma20 } = ind;
    for (let i = 2; i < n; i++) {
      const b = bars[i], p = bars[i - 1], q = bars[i - 2];
      const body = Math.abs(b.c - b.o), range = b.h - b.l || 1e-9;
      const up = b.h - Math.max(b.o, b.c), lo = Math.min(b.o, b.c) - b.l;
      const avg = bodyAvg[i] || atr[i] * 0.6;
      const look = Math.max(0, i - 6);
      const downCtx = p.c < bars[look].c && (sma20[i - 1] == null || p.c < sma20[i - 1]);
      const upCtx = p.c > bars[look].c && (sma20[i - 1] == null || p.c > sma20[i - 1]);
      const bull = x => x.c > x.o, bear = x => x.c < x.o;
      const pBody = Math.abs(p.c - p.o), qBody = Math.abs(q.c - q.o);
      const hits = [];
      // three-bar
      if (bear(q) && qBody > avg && pBody < 0.35 * qBody && Math.max(p.o, p.c) < q.c + 0.15 * qBody && bull(b) && b.c > (q.o + q.c) / 2 && q.c < bars[Math.max(0, i - 8)].c) hits.push('morning_star');
      if (bull(q) && qBody > avg && pBody < 0.35 * qBody && Math.min(p.o, p.c) > q.c - 0.15 * qBody && bear(b) && b.c < (q.o + q.c) / 2 && (q.c > bars[Math.max(0, i - 8)].c)) hits.push('evening_star');
      const soldier = (x, y) => bull(x) && Math.abs(x.c - x.o) > 0.6 * avg && x.c > y.c && x.o >= Math.min(y.o, y.c) - 0.1 * avg && x.o <= Math.max(y.o, y.c) + 0.1 * avg && (x.h - x.c) < 0.35 * Math.abs(x.c - x.o);
      const crow = (x, y) => bear(x) && Math.abs(x.c - x.o) > 0.6 * avg && x.c < y.c && x.o <= Math.max(y.o, y.c) + 0.1 * avg && x.o >= Math.min(y.o, y.c) - 0.1 * avg && (x.c - x.l) < 0.35 * Math.abs(x.c - x.o);
      if (bull(q) && Math.abs(q.c - q.o) > 0.6 * avg && soldier(p, q) && soldier(b, p)) hits.push('three_soldiers');
      if (bear(q) && Math.abs(q.c - q.o) > 0.6 * avg && crow(p, q) && crow(b, p)) hits.push('three_crows');
      // two-bar
      if (bear(p) && bull(b) && b.c >= p.o && b.o <= p.c && body > pBody * 1.05 && body > 0.5 * avg && downCtx) hits.push('bull_engulfing');
      if (bull(p) && bear(b) && b.o >= p.c && b.c <= p.o && body > pBody * 1.05 && body > 0.5 * avg && upCtx) hits.push('bear_engulfing');
      if (bear(p) && pBody > avg && bull(b) && b.o < p.c && b.c > (p.o + p.c) / 2 && b.c < p.o && downCtx) hits.push('piercing');
      if (bull(p) && pBody > avg && bear(b) && b.o > p.c && b.c < (p.o + p.c) / 2 && b.c > p.o && upCtx) hits.push('dark_cloud');
      if (bear(p) && pBody > avg && bull(b) && body < 0.5 * pBody && b.o > p.c && b.c < p.o && downCtx) hits.push('bull_harami');
      if (bull(p) && pBody > avg && bear(b) && body < 0.5 * pBody && b.o < p.c && b.c > p.o && upCtx) hits.push('bear_harami');
      // one-bar
      const smallTop = up <= Math.max(0.15 * range, 0.3 * body);
      const smallBot = lo <= Math.max(0.15 * range, 0.3 * body);
      if (range > 0.6 * atr[i] && body > 0.05 * range) {
        if (lo >= 2 * body && smallTop && lo >= 0.55 * range) hits.push(downCtx ? 'hammer' : upCtx ? 'hanging_man' : null);
        if (up >= 2 * body && smallBot && up >= 0.55 * range) hits.push(downCtx ? 'inverted_hammer' : upCtx ? 'shooting_star' : null);
      }
      if (body <= 0.1 * range && range > 0.5 * atr[i] && !hits.length) hits.push('doji');
      if (body >= 0.9 * range && body > 1.4 * avg) hits.push(bull(b) ? 'bull_marubozu' : 'bear_marubozu');
      if (b.h < p.h && b.l > p.l && !hits.filter(Boolean).length) hits.push('inside_bar');
      for (const h of hits) if (h) res.push({ i, key: h });
    }
    // keep the strongest pattern per bar (order of push = priority)
    const seen = new Set();
    return res.filter(r => (seen.has(r.i) ? false : (seen.add(r.i), true)));
  };

  const CANDLE_BIAS = {
    morning_star: 'bull', evening_star: 'bear', three_soldiers: 'bull', three_crows: 'bear',
    bull_engulfing: 'bull', bear_engulfing: 'bear', piercing: 'bull', dark_cloud: 'bear',
    bull_harami: 'bull', bear_harami: 'bear', hammer: 'bull', hanging_man: 'bear',
    inverted_hammer: 'bull', shooting_star: 'bear', doji: 'neutral', bull_marubozu: 'bull',
    bear_marubozu: 'bear', inside_bar: 'neutral',
  };
  const CANDLE_BARS = { morning_star: 3, evening_star: 3, three_soldiers: 3, three_crows: 3, bull_engulfing: 2, bear_engulfing: 2, piercing: 2, dark_cloud: 2, bull_harami: 2, bear_harami: 2, inside_bar: 2 };
  P.CANDLE_BIAS = CANDLE_BIAS;

  /* ---------------- level breaks ---------------- */
  function volRatio(bars, k) {
    let s = 0, c = 0;
    for (let j = Math.max(0, k - 20); j < k; j++) { s += bars[j].v || 0; c++; }
    const avg = c ? s / c : 0;
    return avg > 0 ? (bars[k].v || 0) / avg : null;
  }

  function scanLevelBreaks(bars, levels, atr, out) {
    const n = bars.length, events = [];
    for (const L of levels) {
      for (let k = n - 1; k >= Math.max(1, n - 25); k--) {
        const prior = L.idx.filter(x => x < k - 1);
        if (prior.length < 2) continue;
        const t = 0.15 * atr[k];
        const upX = bars[k].c > L.price + t && bars[k - 1].c <= L.price + t && L.highs >= 1;
        const dnX = bars[k].c < L.price - t && bars[k - 1].c >= L.price - t && L.lows >= 1;
        if (!upX && !dnX) continue;
        // the 10 bars before mostly on the other side of the level
        let same = 0;
        for (let j = Math.max(0, k - 10); j < k; j++) if (upX ? bars[j].c <= L.price + t : bars[j].c >= L.price - t) same++;
        if (same < 7) continue;
        let failed = -1;
        for (let j = k + 1; j < n; j++) if (upX ? bars[j].c < L.price - t : bars[j].c > L.price + t) { failed = j; break; }
        events.push({ L, k, up: upX, failed, touches: prior.length });
        break;
      }
    }
    // one event per bar & direction: the most-tested level wins
    const byKey = {};
    const rank = e => e.touches * 2 - (n - 1 - e.k) / 4;
    for (const e of events) { const key = (e.up ? 'u' : 'd') + (e.failed !== -1 ? 'f' : ''); if (!byKey[key] || rank(e) > rank(byKey[key])) byKey[key] = e; }
    for (const e of Object.values(byKey)) {
      const { L, k, up, failed } = e;
      const a = atr[k], b = bars[k];
      const vr = volRatio(bars, k);
      const closePos = (b.c - b.l) / ((b.h - b.l) || 1e-9);
      const key = failed !== -1 ? (up ? 'failed_breakout' : 'failed_breakdown') : (up ? 'breakout' : 'breakdown');
      const bias = failed !== -1 ? (up ? 'bear' : 'bull') : (up ? 'bull' : 'bear');
      let p;
      const nextLv = levels.filter(x => up ? x.price > L.price + a : x.price < L.price - a).sort((x, y) => up ? x.price - y.price : y.price - x.price)[0];
      if (failed === -1) {
        const entry = up ? L.price + 0.1 * a : L.price - 0.1 * a;
        const stop = up ? L.price - 1.0 * a : L.price + 1.0 * a;
        const tgt = nextLv ? nextLv.price : (up ? entry + 3 * a : entry - 3 * a);
        p = plan(entry, stop, Math.abs(tgt - entry) < 1.5 * a ? (up ? entry + 3 * a : entry - 3 * a) : tgt);
      } else {
        const ext = up ? maxOf(bars, k, failed, 'h')[0] : minOf(bars, k, failed, 'l')[0];
        const entry = bars[n - 1].c;
        const stop = up ? ext + 0.25 * a : ext - 0.25 * a;
        const opp = levels.filter(x => up ? x.price < L.price - a : x.price > L.price + a).sort((x, y) => up ? y.price - x.price : x.price - y.price)[0];
        p = plan(entry, stop, opp ? opp.price : (up ? entry - 3 * a : entry + 3 * a));
      }
      out.push({
        key, kind: 'breakout', bias,
        status: failed !== -1 ? 'confirmed' : (n - 1 - k <= 1 ? 'fresh' : 'holding'),
        i: failed !== -1 ? failed : k, start: L.first, breakI: k, volRatio: vr, closePos: up ? closePos : 1 - closePos,
        detail: (up ? 'Closed above resistance ' : 'Closed below support ') + fmt(L.price) + ' (tested ' + e.touches + '×) on ' + b.t +
          (vr != null ? ' with volume ' + vr.toFixed(1) + '× the 20-day average' : '') + '.' +
          (failed !== -1 ? ' Then closed back ' + (up ? 'below' : 'above') + ' it on ' + bars[failed].t + ': trapped ' + (up ? 'buyers' : 'sellers') + ' may fuel a move the other way.' :
            (vr != null && vr < 1.3 ? ' Volume was light, so treat it with caution.' : '')),
        plan: p,
        overlay: [
          { t: 'hline', y: L.price, from: L.first, to: n - 1, label: (up ? 'Resistance ' : 'Support ') + fmt(L.price) },
          { t: 'marker', i: k, p: up ? b.h : b.l, dir: up ? 1 : -1, label: up ? 'Breakout' : 'Breakdown' },
        ].concat(failed !== -1 ? [{ t: 'marker', i: failed, p: up ? bars[failed].l : bars[failed].h, dir: up ? -1 : 1, label: 'Back inside' }] : []),
      });
    }
  }

  /* ---------------- formatting ---------------- */
  function fmt(x) {
    if (x == null || !isFinite(x)) return '–';
    const d = x >= 1000 ? 0 : x >= 100 ? 1 : x >= 1 ? 2 : 4;
    return x.toFixed(d);
  }
  P.fmt = fmt;

  /* ---------------- market read ---------------- */
  P.market = function (bars, ind, pivMinor, levels) {
    const n = bars.length, i = n - 1, c = bars[i].c;
    const s50 = ind.sma50[i], s200 = ind.sma200[i], s20 = ind.sma20[i];
    let trend = 'Sideways', trendBias = 'neutral';
    if (s50 != null) {
      if (s200 != null) {
        if (c > s50 && s50 > s200) { trend = 'Uptrend'; trendBias = 'bull'; }
        else if (c < s50 && s50 < s200) { trend = 'Downtrend'; trendBias = 'bear'; }
        else trend = c > s200 ? 'Pullback in uptrend' : 'Bounce in downtrend';
      } else {
        const slope = s50 - (ind.sma50[i - 10] || s50);
        if (c > s50 && slope > 0) { trend = 'Uptrend'; trendBias = 'bull'; }
        else if (c < s50 && slope < 0) { trend = 'Downtrend'; trendBias = 'bear'; }
      }
    }
    const conf = pivMinor.filter(p => !p.tentative);
    const Hs = conf.filter(p => p.type === 'H').slice(-2), Ls = conf.filter(p => p.type === 'L').slice(-2);
    let structure = 'Not enough swings';
    if (Hs.length === 2 && Ls.length === 2) {
      const hh = Hs[1].price > Hs[0].price, hl = Ls[1].price > Ls[0].price;
      structure = hh && hl ? 'Higher highs, higher lows' : !hh && !hl ? 'Lower highs, lower lows' : hh ? 'Higher high, lower low (expanding)' : 'Lower high, higher low (coiling)';
    }
    const rsi = ind.rsi[i];
    const atrPct = ind.atr[i] / c * 100;
    const vr = volRatio(bars, i);
    const sup = levels.filter(l => l.price < c).sort((a, b) => b.price - a.price)[0];
    const res = levels.filter(l => l.price >= c).sort((a, b) => a.price - b.price)[0];
    return {
      price: c, date: bars[i].t, change: (c / bars[i - 1].c - 1) * 100,
      trend, trendBias, structure, rsi, atr: ind.atr[i], atrPct, volRatio: vr,
      sma20: s20, sma50: s50, sma200: s200,
      support: sup || null, resistance: res || null,
    };
  };

  /* ---------------- checklist ---------------- */
  function checklist(sig, bars, ind, levels, tls) {
    const n = bars.length, i = n - 1, c = bars[i].c, a = ind.atr[i];
    const items = [];
    const bull = sig.bias === 'bull', bear = sig.bias === 'bear';
    if (bull || bear) {
      const s50 = ind.sma50[i], s200 = ind.sma200[i];
      if (s50 != null) {
        const ok = bull ? c > s50 && (s200 == null || s50 > s200) : c < s50 && (s200 == null || s50 < s200);
        const half = bull ? c > s50 || (s200 != null && c > s200) : c < s50 || (s200 != null && c < s200);
        items.push({ k: 'trend', ok: ok ? true : half ? null : false, label: 'Trades with the bigger trend', why: bull ? 'Price vs. 50- and 200-day averages: ' + (ok ? 'all stacked bullish.' : half ? 'mixed.' : 'price is below both.') : 'Price vs. 50- and 200-day averages: ' + (ok ? 'all stacked bearish.' : half ? 'mixed.' : 'price is above both.') });
      }
    }
    if (sig.volRatio != null) {
      const v = sig.volRatio;
      items.push({ k: 'vol', ok: v >= 1.5 ? true : v >= 1.1 ? null : false, label: 'Volume confirms', why: 'Break-bar volume ' + v.toFixed(1) + '× the 20-day average (look for 1.5× or more).' });
    } else if (sig.kind === 'candle') {
      const v = volRatio(bars, sig.i);
      if (v != null) items.push({ k: 'vol', ok: v >= 1.3 ? true : v >= 0.9 ? null : false, label: 'Volume confirms', why: 'Signal-bar volume ' + v.toFixed(1) + '× average.' });
    }
    if (sig.kind === 'candle' && (bull || bear)) {
      const px = bull ? bars[sig.i].l : bars[sig.i].h;
      const near = levels.find(l => Math.abs(l.price - px) <= 1.0 * ind.atr[sig.i] && (bull ? l.price <= bars[sig.i].c + 0.5 * a : l.price >= bars[sig.i].c - 0.5 * a));
      const tl = bull ? tls.support : tls.resistance;
      const nearTl = tl && Math.abs(tl.at(sig.i) - px) <= 1.0 * ind.atr[sig.i];
      const nearMa = [ind.sma50[sig.i], ind.sma200[sig.i]].some(m => m != null && Math.abs(m - px) <= 0.8 * ind.atr[sig.i]);
      const ok = !!(near || nearTl || nearMa);
      items.push({ k: 'loc', ok, label: 'Forms at a key level', why: ok ? 'It sits on ' + (near ? (bull ? 'support ' : 'resistance ') + fmt(near.price) : nearTl ? 'the trend line' : 'a major moving average') + '. Location gives a candle its meaning.' : 'No support, resistance or trend line nearby. Mid-range candles are mostly noise.' });
    }
    if (sig.kind === 'breakout' && sig.closePos != null && sig.key.indexOf('failed') < 0) {
      items.push({ k: 'close', ok: sig.closePos >= 0.6, label: 'Strong close on the break', why: 'Closed in the ' + (sig.closePos >= 0.6 ? 'outer' : 'inner') + ' ' + Math.round((sig.closePos >= 0.6 ? sig.closePos : 1 - sig.closePos) * 100) + '% of the bar\'s range.' });
    }
    const rsi = ind.rsi[i];
    if (rsi != null && (bull || bear)) {
      const ok = bull ? rsi < 70 : rsi > 30;
      items.push({ k: 'rsi', ok, label: 'Momentum not stretched', why: 'RSI(14) at ' + rsi.toFixed(0) + (ok ? '. Room to run.' : bull ? '. Overbought; chasing here risks buying the top of a burst.' : '. Oversold; shorting here risks selling the low.') });
    }
    if (sig.plan && sig.plan.rr != null) {
      const rr = sig.plan.rr;
      items.push({ k: 'rr', ok: rr >= 2 ? true : rr >= 1.5 ? null : false, label: 'Reward at least 2× risk', why: 'Planned reward/risk is ' + rr.toFixed(1) + ' : 1.' });
    }
    if (sig.status) {
      const ok = sig.status === 'confirmed' || sig.status === 'fresh' || sig.status === 'holding';
      items.push({ k: 'conf', ok: ok ? true : sig.status === 'failed' ? false : null, label: 'Confirmed by a close', why: ok ? 'The trigger has closed beyond the line.' : sig.status === 'failed' ? 'The move reversed after triggering.' : 'Still forming. Act on the trigger, not the guess.' });
    }
    let pts = 0, tot = 0;
    for (const it of items) { tot += 1; pts += it.ok === true ? 1 : it.ok === null ? 0.5 : 0; }
    return { items, score: tot ? Math.round(pts / tot * 100) : null };
  }

  /* ---------------- main ---------------- */
  P.analyze = function (bars) {
    const n = bars.length;
    const ind = I.compute(bars);
    const atr = ind.atr;
    const pivMinor = P.zigzag(bars, atr, 1.5);
    const pivMajor = P.zigzag(bars, atr, 2.5);
    const levels = P.levels(bars, pivMinor, atr);
    const tls = P.trendlines(bars, pivMinor, atr);
    const candles = P.candles(bars, ind);
    const sigs = [];

    // chart patterns at two swing scales, deduped
    const raw = [];
    for (const piv of [pivMajor, pivMinor]) {
      scanDoubles(bars, piv, atr, raw);
      scanHS(bars, piv, atr, raw);
      scanConverging(bars, piv, atr, raw);
    }
    scanFlags(bars, atr, raw);
    for (const s of raw) {
      const dup = sigs.find(t => t.key === s.key && !(s.i < t.start || s.start > t.i));
      if (!dup) sigs.push(s);
    }
    // H&S beats a double top drawn on the same swings
    for (const hs of sigs.filter(s => s.key === 'head_shoulders' || s.key === 'inv_head_shoulders')) {
      for (let j = sigs.length - 1; j >= 0; j--) {
        const s = sigs[j];
        if ((s.key === 'double_top' || s.key === 'double_bottom') && s.start >= hs.start && s.i <= hs.i + 5) sigs.splice(j, 1);
      }
    }

    // overlapping shapes with the same bias: keep the more specific one
    const PRI = { head_shoulders: 6, inv_head_shoulders: 6, bull_flag: 5, bear_flag: 5, double_top: 4, double_bottom: 4, asc_triangle: 3, desc_triangle: 3, sym_triangle: 3, rising_wedge: 3, falling_wedge: 3, rectangle: 2, channel_up: 1, channel_down: 1 };
    for (let x = sigs.length - 1; x >= 0; x--) {
      const s = sigs[x];
      const span = x => x.i - x.start;
      // a more specific shape wins unless it is a small detail inside a much bigger one;
      // a shape that broke against its usual direction never outranks one that didn't
      const beats = (t, u) => {
        if (t.against !== u.against) return !t.against;
        if (PRI[t.key] > PRI[u.key]) return span(t) >= 0.7 * span(u);
        if (PRI[t.key] < PRI[u.key]) return span(u) < 0.7 * span(t);
        return span(t) > span(u);
      };
      const clash = sigs.some(t => t !== s && t.bias === s.bias && beats(t, s) &&
        Math.min(s.i, t.i) - Math.max(s.start, t.start) > 0.6 * Math.min(s.i - s.start, t.i - t.start));
      if (clash) sigs.splice(x, 1);
    }

    scanLevelBreaks(bars, levels, atr, sigs);

    // trend lines
    for (const side of ['support', 'resistance']) {
      const tl = tls[side];
      if (!tl) continue;
      const isSup = side === 'support';
      const endI = tl.brk === -1 ? n - 1 : Math.min(n - 1, tl.brk + 5);
      const ov = [{ t: 'line', x1: tl.A.i, y1: tl.A.price, x2: endI, y2: tl.at(endI), label: (isSup ? 'Rising support' : 'Falling resistance') + ' (' + tl.touches + ' touches)' }, { t: 'dots', pts: tl.touchPts.map(p => [p.i, p.price]) }];
      const a = atr[n - 1], c = bars[n - 1].c, lv = tl.at(n - 1);
      if (tl.brk !== -1) {
        const entry = isSup ? c : c;
        const stop = isSup ? Math.max(maxOf(bars, tl.brk - 3, n - 1, 'h')[0], lv) + 0.25 * a : Math.min(minOf(bars, tl.brk - 3, n - 1, 'l')[0], lv) - 0.25 * a;
        const opp = levels.filter(l => isSup ? l.price < c - a : l.price > c + a).sort((x, y) => isSup ? y.price - x.price : x.price - y.price)[0];
        sigs.push({
          key: 'trendline_break', kind: 'trendline', bias: isSup ? 'bear' : 'bull', status: 'confirmed', i: tl.brk, start: tl.A.i, breakI: tl.brk,
          detail: 'A ' + (isSup ? 'rising support' : 'falling resistance') + ' line with ' + tl.touches + ' touches since ' + bars[tl.A.i].t + ' was broken by a close on ' + bars[tl.brk].t + '. The trend that line described has lost its rhythm.',
          volRatio: volRatio(bars, tl.brk),
          plan: plan(entry, stop, opp ? opp.price : (isSup ? entry - 3 * a : entry + 3 * a)),
          overlay: ov.concat([{ t: 'marker', i: tl.brk, p: isSup ? bars[tl.brk].l : bars[tl.brk].h, dir: isSup ? -1 : 1, label: 'Line broken' }]),
        });
      } else if (Math.abs(bars[n - 1].l - lv) <= 1.0 * a && isSup || Math.abs(bars[n - 1].h - lv) <= 1.0 * a && !isSup) {
        const entry = c;
        const stop = isSup ? lv - 0.8 * a : lv + 0.8 * a;
        const opp = levels.filter(l => isSup ? l.price > c + a : l.price < c - a).sort((x, y) => isSup ? x.price - y.price : y.price - x.price)[0];
        sigs.push({
          key: isSup ? 'trendline_support' : 'trendline_resistance', kind: 'trendline', bias: isSup ? 'bull' : 'bear', status: 'forming', i: n - 1, start: tl.A.i,
          detail: 'Price is testing a ' + (isSup ? 'rising support' : 'falling resistance') + ' line (' + tl.touches + ' prior touches, now near ' + fmt(lv) + '). A reversal candle here is the classic swing entry; a close through it voids the idea.',
          plan: plan(entry, stop, opp ? opp.price : (isSup ? entry + 3 * a : entry - 3 * a)),
          overlay: ov,
        });
      }
    }

    // recent candlestick patterns (last 8 bars); same pattern on neighbouring bars counts once
    const recentC = candles.filter(x => x.i >= n - 8).filter((x, j, arr) => !arr.some(y => y.key === x.key && y.i > x.i && y.i - x.i <= 2));
    for (const cd of recentC) {
      const bias = CANDLE_BIAS[cd.key];
      if (cd.key === 'inside_bar' && cd.i < n - 2) continue;
      if (cd.key === 'doji' && cd.i < n - 3) continue;
      const b = bars[cd.i], a = atr[cd.i];
      const nb = CANDLE_BARS[cd.key] || 1;
      const lo = minOf(bars, cd.i - nb + 1, cd.i, 'l')[0], hi = maxOf(bars, cd.i - nb + 1, cd.i, 'h')[0];
      let p = null;
      if (bias === 'bull') {
        const entry = hi + 0.05 * a, stop = lo - 0.25 * a;
        const r = levels.filter(l => l.price > entry + a).sort((x, y) => x.price - y.price)[0];
        p = plan(entry, stop, r ? r.price : entry + 2 * (entry - stop));
      } else if (bias === 'bear') {
        const entry = lo - 0.05 * a, stop = hi + 0.25 * a;
        const s = levels.filter(l => l.price < entry - a).sort((x, y) => y.price - x.price)[0];
        p = plan(entry, stop, s ? s.price : entry - 2 * (stop - entry));
      } else {
        p = null;
      }
      // follow-through: did a later bar trigger the entry?
      let status = 'forming';
      if (p) {
        for (let k = cd.i + 1; k < n; k++) {
          if (bias === 'bull' ? bars[k].h >= p.entry : bars[k].l <= p.entry) { status = 'confirmed'; break; }
          if (bias === 'bull' ? bars[k].c < p.stop : bars[k].c > p.stop) { status = 'failed'; break; }
        }
      }
      sigs.push({
        key: cd.key, kind: 'candle', bias, status: bias === 'neutral' ? null : status, i: cd.i, start: cd.i - nb + 1,
        detail: 'Bar ' + b.t + ': O ' + fmt(b.o) + ' H ' + fmt(b.h) + ' L ' + fmt(b.l) + ' C ' + fmt(b.c) + '. ' +
          (bias === 'neutral' ? 'An indecision bar. It says the prior push has paused; the next bar\'s break tells you which side won.' :
            'Trigger: ' + (bias === 'bull' ? 'a move above ' + fmt(hi) : 'a move below ' + fmt(lo)) + ' (' + (status === 'confirmed' ? 'already triggered' : status === 'failed' ? 'failed: closed beyond the stop' : 'not triggered yet') + ').'),
        plan: p,
        overlay: [{ t: 'box', from: cd.i - nb + 1, to: cd.i, lo, hi, label: '' }],
      });
    }

    // stops closer than 0.75 ATR sit inside normal bar-to-bar noise: widen them
    for (const s of sigs) {
      const p = s.plan; if (!p) continue;
      const a = atr[Math.min(n - 1, s.i)], dir = p.target > p.entry ? 1 : -1;
      if (dir * (p.entry - p.stop) < 0.75 * a) { const np = plan(p.entry, p.entry - dir * 0.75 * a, p.target); np.widened = true; s.plan = np; }
    }
    // score, then sort: fresh & high quality first
    for (const s of sigs) {
      const cl = checklist(s, bars, ind, levels, tls);
      s.checklist = cl.items; s.score = cl.score;
      s.age = n - 1 - s.i;
      s.date = bars[s.i] ? bars[s.i].t : '';
      s.id = s.key + '@' + s.start + '-' + s.i;
    }
    const kindW = { chart: 3, breakout: 3, trendline: 2, candle: 1 };
    sigs.sort((a, b) => {
      const r = s => (s.status === 'failed' && s.kind !== 'breakout' ? -20 : 0) + (s.status === 'forming' ? -3 : 0) + kindW[s.kind] * 6 - s.age * (s.kind === 'candle' ? 0.8 : 0.3) + (s.score || 0) / 10 + (s.plan && s.plan.rr != null && s.plan.rr < 1 ? -6 : 0);
      const ra = r(a), rb = r(b);
      return rb - ra;
    });

    const market = P.market(bars, ind, pivMinor, levels);
    return { bars, ind, pivMinor, pivMajor, levels, keyLevels: P.keyLevels(levels, bars[n - 1].c), trendlines: tls, candles, signals: sigs, market };
  };

  root.SPP = P;
  if (typeof module !== 'undefined') module.exports = P;
})(typeof window !== 'undefined' ? window : globalThis);
