/* Market context around a chart: the higher-timeframe trend, the market regime
   (S&P 500 vs its 200-day average) and relative strength against the S&P 500.
   Our backtest found none of these improved trade results over random entries
   (see the Track record); they are shown to read the chart, not as filters. */
(function (root) {
  const I = root.SPI || (typeof require !== 'undefined' ? require('./indicators.js') : null);
  const C = {};
  const weekKey = t => { const d = new Date(String(t).slice(0, 10) + 'T00:00:00Z'); if (!isFinite(d)) return null; d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };

  // Higher-timeframe trend. Daily → weekly 30-week average; weekly → 10-month (≈43-week) average; monthly → 12-month average.
  C.higherTrend = function (bars, tf) {
    let closes, n, label;
    if (tf === 'D') {
      const wk = []; let key = null;
      for (const b of bars) { const k = weekKey(b.t); if (k !== key) { wk.push(b.c); key = k; } else wk[wk.length - 1] = b.c; }
      closes = wk; n = 30; label = 'Weekly trend (30-week average)';
    } else if (tf === 'W') { closes = bars.map(b => b.c); n = 43; label = 'Long-term trend (10-month average)'; }
    else { closes = bars.map(b => b.c); n = 12; label = 'Long-term trend (12-month average)'; }
    if (closes.length < n + 5) return { label, state: null };
    const sma = I.sma(closes, n), i = closes.length - 1;
    const rising = sma[i] > sma[i - 4];
    const state = closes[i] > sma[i] && rising ? 'up' : closes[i] < sma[i] && !rising ? 'down' : 'mixed';
    return { label, state, price: closes[i], avg: sma[i], rising };
  };

  // Market regime from S&P 500 daily bars.
  // n = 200 daily bars ≈ 40 weekly ≈ 10 monthly
  C.REGIME_N = { D: 200, W: 40, M: 10 };
  C.RS_N = { D: 126, W: 26, M: 6 };
  C.regime = function (spx, tf) {
    const n = C.REGIME_N[tf || 'D'];
    if (!spx || spx.length < n + 5) return { state: null };
    const c = spx.map(b => b.c), sma = I.sma(c, n), i = c.length - 1;
    return { state: c[i] > sma[i] ? 'healthy' : 'weak', price: c[i], sma: sma[i], dist: (c[i] / sma[i] - 1) * 100, date: spx[i].t };
  };

  // Relative strength: the stock's return minus the S&P 500's over the same dates, plus the ratio line.
  C.relStrength = function (bars, bench, lookback) {
    if (!bench || bench.length < 20) return null;
    const pos = {}; bench.forEach((b, i) => { pos[String(b.t).slice(0, 10)] = i; });
    const ratio = bars.map(b => { const j = pos[String(b.t).slice(0, 10)]; return j == null ? null : b.c / bench[j].c; });
    const i = bars.length - 1;
    let k = i - lookback;
    while (k > 0 && ratio[k] == null) k--;
    if (k < 0 || ratio[i] == null || ratio[k] == null) return { ratio };
    const ret = bars[i].c / bars[k].c - 1;
    const jb = pos[String(bars[i].t).slice(0, 10)], jk = pos[String(bars[k].t).slice(0, 10)];
    const bret = bench[jb].c / bench[jk].c - 1;
    return { ratio, ret: ret * 100, benchRet: bret * 100, diff: (ret - bret) * 100, lookback };
  };

  root.SPC = C;
  if (typeof module !== 'undefined') module.exports = C;
})(typeof window !== 'undefined' ? window : globalThis);
