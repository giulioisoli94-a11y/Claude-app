/* Technical indicators. Plain functions over arrays; output arrays are aligned
   with the input and hold null until enough data exists. */
(function (root) {
  const I = {};

  I.sma = function (arr, n) {
    const out = new Array(arr.length).fill(null);
    let s = 0;
    for (let i = 0; i < arr.length; i++) {
      s += arr[i];
      if (i >= n) s -= arr[i - n];
      if (i >= n - 1) out[i] = s / n;
    }
    return out;
  };

  I.ema = function (arr, n) {
    const out = new Array(arr.length).fill(null);
    const k = 2 / (n + 1);
    let prev = null;
    for (let i = 0; i < arr.length; i++) {
      if (i === n - 1) {
        let s = 0;
        for (let j = 0; j < n; j++) s += arr[j];
        prev = s / n;
        out[i] = prev;
      } else if (i >= n) {
        prev = arr[i] * k + prev * (1 - k);
        out[i] = prev;
      }
    }
    return out;
  };

  /* Wilder's RSI */
  I.rsi = function (closes, n) {
    n = n || 14;
    const out = new Array(closes.length).fill(null);
    if (closes.length <= n) return out;
    let gain = 0, loss = 0;
    for (let i = 1; i <= n; i++) {
      const d = closes[i] - closes[i - 1];
      if (d > 0) gain += d; else loss -= d;
    }
    gain /= n; loss /= n;
    out[n] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    for (let i = n + 1; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      gain = (gain * (n - 1) + Math.max(d, 0)) / n;
      loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
      out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    }
    return out;
  };

  /* Wilder's ATR. Filled from bar 0 with a running mean of true range so that
     pattern code always has a volatility yardstick. */
  I.atr = function (bars, n) {
    n = n || 14;
    const out = new Array(bars.length).fill(null);
    let prev = null, sum = 0;
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      const tr = i === 0 ? b.h - b.l
        : Math.max(b.h - b.l, Math.abs(b.h - bars[i - 1].c), Math.abs(b.l - bars[i - 1].c));
      if (i < n) {
        sum += tr;
        prev = sum / (i + 1);
      } else {
        prev = (prev * (n - 1) + tr) / n;
      }
      out[i] = prev;
    }
    return out;
  };

  I.compute = function (bars) {
    const c = bars.map(b => b.c);
    const v = bars.map(b => b.v || 0);
    const body = bars.map(b => Math.abs(b.c - b.o));
    return {
      sma20: I.sma(c, 20),
      sma50: I.sma(c, 50),
      sma200: I.sma(c, 200),
      rsi: I.rsi(c, 14),
      atr: I.atr(bars, 14),
      volSma: I.sma(v, 20),
      bodyAvg: I.sma(body, 14),
    };
  };

  root.SPI = I;
  if (typeof module !== 'undefined') module.exports = I;
})(typeof window !== 'undefined' ? window : globalThis);
