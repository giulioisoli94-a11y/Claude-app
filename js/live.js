/* Live market data from one of two sources:
   - Firecrawl (Yahoo Finance) through the viewer's claude.ai connector, when the
     page runs inside claude.ai. Covers cash indexes (^GSPC, ^NDX, ...). 5 Firecrawl
     credits per symbol and timeframe, cached 15 minutes.
   - Twelve Data with the user's own free API key, when the app runs on its own
     (installed on the phone). The key stays in this browser. The free plan allows
     8 requests a minute and 800 a day and has no cash indexes, so indexes are
     followed through their ETFs (SPY, QQQ, ONEQ, DIA, IWM). */
(function (root) {
  const L = {};
  const FC = { server: 'Firecrawl', tool: 'alexandria_library_read' };
  const FC_TF = { D: { interval: '1d', range: '5y' }, W: { interval: '1wk', range: '10y' }, M: { interval: '1mo', range: 'max' } };
  const TD_TF = { D: { interval: '1day', size: 1300 }, W: { interval: '1week', size: 600 }, M: { interval: '1month', size: 300 } };
  const TD_INDEX = { '^GSPC': 'SPY', '^NDX': 'QQQ', '^IXIC': 'ONEQ', '^DJI': 'DIA', '^RUT': 'IWM' };
  const FRESH = 15 * 60e3;

  L.WATCH = {
    indexes: [['^GSPC', 'S&P 500'], ['^NDX', 'Nasdaq-100'], ['^IXIC', 'Nasdaq Composite'], ['^DJI', 'Dow Jones'], ['^RUT', 'Russell 2000'],
      ['SPY', 'SPDR S&P 500 ETF'], ['QQQ', 'Invesco QQQ (Nasdaq-100)'], ['DIA', 'SPDR Dow ETF'], ['IWM', 'iShares Russell 2000']],
    stocks: [['AAPL', 'Apple'], ['MSFT', 'Microsoft'], ['NVDA', 'Nvidia'], ['AMZN', 'Amazon'], ['GOOGL', 'Alphabet'], ['META', 'Meta'],
      ['TSLA', 'Tesla'], ['AVGO', 'Broadcom'], ['NFLX', 'Netflix'], ['AMD', 'AMD'], ['COST', 'Costco'], ['JPM', 'JPMorgan'],
      ['V', 'Visa'], ['XOM', 'Exxon Mobil'], ['UNH', 'UnitedHealth'], ['LLY', 'Eli Lilly'], ['WMT', 'Walmart'], ['CAT', 'Caterpillar']],
  };
  L.BENCH = '^GSPC';

  /* ---------- which source ---------- */
  let mcpP = null;
  L.mcp = function () {
    if (!mcpP) mcpP = (root.claude && root.claude.use ? root.claude.use('mcp') : Promise.resolve(null)).catch(() => null);
    return mcpP;
  };
  L.getKey = function () { try { return localStorage.getItem('spl.tdkey') || ''; } catch (e) { return ''; } };
  L.setKey = function (k) { try { if (k) localStorage.setItem('spl.tdkey', k.trim()); else localStorage.removeItem('spl.tdkey'); } catch (e) { /* storage blocked */ } };
  L.source = async function () {
    if (await L.mcp()) return 'firecrawl';
    if (L.getKey()) return 'twelvedata';
    return 'none';
  };
  L.available = async function () { return (await L.source()) !== 'none'; };
  // symbol actually requested from the source (indexes → ETFs on Twelve Data)
  L.resolve = async function (sym) {
    const src = await L.source();
    return src === 'twelvedata' && TD_INDEX[sym] ? { sym: TD_INDEX[sym], via: TD_INDEX[sym] } : { sym, via: null };
  };

  /* ---------- per-device cache ---------- */
  const key = (src, sym, tf) => 'spl.live.' + src + '.' + sym + '.' + tf;
  L.cached = function (sym, tf, src) {
    try {
      for (const s of src ? [src] : ['firecrawl', 'twelvedata']) {
        const v = JSON.parse(localStorage.getItem(key(s, sym, tf)) || 'null');
        if (v && v.bars && v.bars.length) return v;
      }
    } catch (e) { /* storage blocked */ }
    return null;
  };
  function remember(src, sym, tf, v) {
    try { localStorage.setItem(key(src, sym, tf), JSON.stringify(v)); } catch (e) {
      try { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.startsWith('spl.live.')) localStorage.removeItem(k); } localStorage.setItem(key(src, sym, tf), JSON.stringify(v)); } catch (e2) { /* give up */ }
    }
  }

  /* ---------- Firecrawl ---------- */
  function findBars(x, depth) {
    if (!x || typeof x !== 'object' || depth > 6) return null;
    if (Array.isArray(x.bars)) return x;
    if (Array.isArray(x)) { for (const y of x) { const r = findBars(y, depth + 1); if (r) return r; } return null; }
    for (const k of Object.keys(x)) { const r = findBars(x[k], depth + 1); if (r) return r; }
    return null;
  }
  function findError(x, depth) {
    if (!x || typeof x !== 'object' || depth > 6) return null;
    if (x.error && (typeof x.error === 'string' || x.error.message || x.error.code)) return typeof x.error === 'string' ? x.error : (x.error.message || x.error.code);
    if (Array.isArray(x)) { for (const y of x) { const r = findError(y, depth + 1); if (r) return r; } return null; }
    for (const k of Object.keys(x)) { const r = findError(x[k], depth + 1); if (r) return r; }
    return null;
  }
  const num = v => { const n = typeof v === 'string' ? parseFloat(v) : v; return typeof n === 'number' && isFinite(n) ? n : null; };
  async function loadFirecrawl(sym, tf, refresh) {
    const mcp = await L.mcp();
    const cfg = FC_TF[tf] || FC_TF.D;
    const input = { calls: [{ provider: 'finance-yahoo-com', capability: 'equities/history', options: { symbol: sym, interval: cfg.interval, range: cfg.range } }], objective: 'Load price history for chart pattern analysis in a swing-trading education app.' };
    const res = await mcp.callTool(FC.server, FC.tool, input, { cache: Object.assign({ staleTime: FRESH, gcTime: 7 * 864e5 }, refresh ? { refresh: true } : {}) });
    const payload = res && (res.payload !== undefined ? res.payload : res.structuredContent);
    const d = findBars(payload, 0);
    if (!d) { const err = findError(payload, 0); throw { code: 'no_data', message: err ? String(err).slice(0, 200) : 'No price data came back for ' + sym + '. Check the ticker.' }; }
    const bars = [];
    for (const b of d.bars) {
      const o = num(b.open), h = num(b.high), l = num(b.low), c = num(b.close);
      if (o == null || h == null || l == null || c == null || c <= 0) continue;
      bars.push({ t: String(b.date || '').slice(0, 10), o, h: Math.max(h, o, c), l: Math.min(l, o, c), c, v: num(b.volume) || 0 });
    }
    return { bars, symbol: d.symbol || sym, name: d.name || sym, instrument: d.instrument_type || '', storedAt: res.cache && res.cache.storedAt ? res.cache.storedAt : (num(d.observed_at_ms) || Date.now()), cached: !!res.cache, source: 'Yahoo Finance via Firecrawl' };
  }

  /* ---------- Twelve Data (8 requests / minute on the free plan) ---------- */
  const stamps = [];
  L.onWait = null; // (ms) => void, for "waiting for the rate limit" messages
  async function slot() {
    for (;;) {
      const now = Date.now();
      while (stamps.length && now - stamps[0] > 61e3) stamps.shift();
      if (stamps.length < 8) { stamps.push(now); return; }
      const wait = 61e3 - (now - stamps[0]) + 50;
      if (L.onWait) L.onWait(wait);
      await new Promise(r => setTimeout(r, wait));
    }
  }
  async function loadTwelve(sym, tf, retried) {
    const k = L.getKey();
    if (!k) throw { code: 'no_key', message: 'Add your free Twelve Data API key in Data source.' };
    const cfg = TD_TF[tf] || TD_TF.D;
    await slot();
    let resp;
    try {
      resp = await fetch('https://api.twelvedata.com/time_series?symbol=' + encodeURIComponent(sym) + '&interval=' + cfg.interval + '&outputsize=' + cfg.size + '&order=asc', { headers: { Authorization: 'apikey ' + k } });
    } catch (e) { throw { code: 'network', message: 'Could not reach Twelve Data. Check your connection.' }; }
    let j = null;
    try { j = await resp.json(); } catch (e) { /* not JSON */ }
    if (!j || j.status === 'error' || !Array.isArray(j.values)) {
      const c = j && j.code;
      if (c === 429 && !retried) { if (L.onWait) L.onWait(61e3); await new Promise(r => setTimeout(r, 61e3)); return loadTwelve(sym, tf, true); }
      if (c === 401 || c === 403) throw { code: 'bad_key', message: 'Twelve Data rejected the API key. Check it in Data source.' };
      if (c === 429) throw { code: 'rate_limited', message: 'Twelve Data limit reached (8 a minute, 800 a day on the free plan). Try again shortly.' };
      throw { code: 'no_data', message: (j && j.message ? String(j.message).replace(/https?:\S+/g, '').slice(0, 160) : 'No data for ' + sym + '.') };
    }
    const bars = [];
    for (const b of j.values) {
      const o = num(b.open), h = num(b.high), l = num(b.low), c = num(b.close);
      if (o == null || h == null || l == null || c == null || c <= 0) continue;
      bars.push({ t: String(b.datetime).slice(0, 10), o, h: Math.max(h, o, c), l: Math.min(l, o, c), c, v: num(b.volume) || 0 });
    }
    if (bars.length > 1 && bars[0].t > bars[bars.length - 1].t) bars.reverse();
    const m = j.meta || {};
    return { bars, symbol: m.symbol || sym, name: m.symbol || sym, instrument: m.type || '', storedAt: Date.now(), cached: false, source: 'Twelve Data' };
  }

  /* Resolves {bars, name, symbol, via, instrument, storedAt, cached, source}
     or rejects {code, message}. */
  L.load = async function (symbol, tf, opts) {
    opts = opts || {};
    const want = String(symbol || '').trim().toUpperCase();
    if (!/^[A-Z0-9^][A-Z0-9.=^&\-/]{0,19}$/.test(want)) throw { code: 'bad_symbol', message: 'Use a ticker like AAPL or BRK.B, or an index like ^GSPC.' };
    const src = await L.source();
    if (src === 'none') throw { code: 'no_source', message: 'Live data needs a source.' };
    const { sym, via } = await L.resolve(want);
    const prev = L.cached(sym, tf, src);
    if (!opts.refresh && prev && src === 'twelvedata' && Date.now() - prev.storedAt < FRESH) return Object.assign({}, prev, { cached: true });
    const d = src === 'firecrawl' ? await loadFirecrawl(sym, tf, opts.refresh) : await loadTwelve(sym, tf);
    if (d.bars.length < 30) throw { code: 'no_data', message: 'Only ' + d.bars.length + ' bars for ' + sym + ' on this timeframe.' };
    d.via = via; d.requested = want;
    if (via) d.name = want + ' (via ' + via + ')';
    remember(src, sym, tf, d);
    return d;
  };

  // Human copy for each failure, with the action that fixes it.
  L.explain = function (e) {
    const c = e && e.code;
    if (c === 'no_source' || c === 'no_mcp' || c === 'not_granted' || c === 'capability_disabled' || c === 'capability_removed') return { msg: 'Live prices need a data source: open the app in claude.ai with the Firecrawl connector, or add your free Twelve Data key under Data source.', action: 'settings' };
    if (c === 'no_key' || c === 'bad_key') return { msg: e.message, action: 'settings' };
    if (c === 'server_not_connected') return { msg: 'Add the Firecrawl connector in claude.ai Settings → Connectors to load live prices.', action: null };
    if (c === 'needs_reauth') return { msg: 'Reconnect Firecrawl in claude.ai Settings → Connectors, then try again.', action: 'retry' };
    if (c === 'selection_required') return { msg: 'You have more than one Firecrawl connector. Choose one in the prompt claude.ai shows, then try again.', action: 'retry' };
    if (c === 'not_in_manifest' || c === 'approval_required' || c === 'consent_required') return { msg: 'This page needs your OK to use Firecrawl for price data (5 credits per symbol and timeframe).', action: 'allow' };
    if (c === 'blocked_by_policy') return { msg: 'Your organization blocks this connector for this page.', action: null };
    if (c === 'server_unavailable' || c === 'rate_limited' || c === 'network') return { msg: e.message && c !== 'server_unavailable' ? e.message : 'The data source did not answer just now.', action: 'retry' };
    if (c === 'tool_error' || c === 'no_data') return { msg: (e.message && !/^\s*[{[]/.test(e.message) ? e.message : 'The data provider could not return this symbol.'), action: null };
    if (c === 'bad_symbol') return { msg: e.message, action: null };
    return { msg: 'Loading live data failed (' + (c || 'unknown') + ').', action: 'retry' };
  };

  root.SPLive = L;
})(window);
