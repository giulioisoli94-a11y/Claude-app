/* Live market data: Yahoo Finance daily/weekly/monthly bars through the
   viewer's Firecrawl connector (claude.ai). Works when the page is open in
   claude.ai and the viewer has Firecrawl connected; everywhere else the app
   falls back to samples and CSV files. Each uncached load costs the viewer
   5 Firecrawl credits; results are cached for 15 minutes in the connector
   cache and kept per day in this browser. */
(function (root) {
  const SERVER = 'Firecrawl', TOOL = 'alexandria_library_read';
  const TF = { D: { interval: '1d', range: '5y' }, W: { interval: '1wk', range: '10y' }, M: { interval: '1mo', range: 'max' } };
  const L = {};
  L.WATCH = {
    indexes: [
      ['^GSPC', 'S&P 500'], ['^NDX', 'Nasdaq-100'], ['^IXIC', 'Nasdaq Composite'], ['^DJI', 'Dow Jones'], ['^RUT', 'Russell 2000'],
      ['SPY', 'SPDR S&P 500 ETF'], ['QQQ', 'Invesco QQQ (Nasdaq-100)'], ['DIA', 'SPDR Dow ETF'], ['IWM', 'iShares Russell 2000'],
    ],
    stocks: [
      ['AAPL', 'Apple'], ['MSFT', 'Microsoft'], ['NVDA', 'Nvidia'], ['AMZN', 'Amazon'], ['GOOGL', 'Alphabet'], ['META', 'Meta'],
      ['TSLA', 'Tesla'], ['AVGO', 'Broadcom'], ['NFLX', 'Netflix'], ['AMD', 'AMD'], ['COST', 'Costco'], ['JPM', 'JPMorgan'],
      ['V', 'Visa'], ['XOM', 'Exxon Mobil'], ['UNH', 'UnitedHealth'], ['LLY', 'Eli Lilly'], ['WMT', 'Walmart'], ['CAT', 'Caterpillar'],
    ],
  };
  let mcpP = null;
  L.mcp = function () {
    if (!mcpP) mcpP = (root.claude && root.claude.use ? root.claude.use('mcp') : Promise.resolve(null)).catch(() => null);
    return mcpP;
  };
  L.available = async function () { return !!(await L.mcp()); };

  // The connector returns {data:{alexandria:[{data:{bars:[...]}}]}}; find bars wherever they sit.
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
  const num = v => (typeof v === 'number' && isFinite(v) ? v : null);

  function storeKey(sym, tf) { return 'spl.live.' + sym + '.' + tf; }
  L.cached = function (sym, tf) {
    try { const v = JSON.parse(localStorage.getItem(storeKey(sym, tf)) || 'null'); return v && v.bars && v.bars.length ? v : null; } catch (e) { return null; }
  };
  function remember(sym, tf, v) {
    try { localStorage.setItem(storeKey(sym, tf), JSON.stringify(v)); } catch (e) { /* storage full or blocked */ }
  }

  /* Resolves {bars, name, symbol, instrument, currency, storedAt, cached}
     or rejects {code, message, server} (connector codes, plus 'no_mcp',
     'no_data', 'bad_symbol'). */
  L.load = async function (symbol, tf, opts) {
    opts = opts || {};
    const sym = String(symbol || '').trim().toUpperCase();
    if (!/^[A-Z0-9^][A-Z0-9.=^&\-]{0,19}$/.test(sym)) throw { code: 'bad_symbol', message: 'Use a ticker like AAPL, BRK-B or an index like ^GSPC.' };
    const mcp = await L.mcp();
    if (!mcp) throw { code: 'no_mcp', message: 'Live data needs this page open in claude.ai with the Firecrawl connector.' };
    const cfg = TF[tf] || TF.D;
    const input = {
      calls: [{ provider: 'finance-yahoo-com', capability: 'equities/history', options: { symbol: sym, interval: cfg.interval, range: cfg.range } }],
      objective: 'Load price history for chart pattern analysis in a swing-trading education app.',
    };
    const res = await mcp.callTool(SERVER, TOOL, input, { cache: opts.refresh ? { staleTime: 15 * 60e3, gcTime: 7 * 864e5, refresh: true } : { staleTime: 15 * 60e3, gcTime: 7 * 864e5 } });
    const payload = res && (res.payload !== undefined ? res.payload : res.structuredContent);
    const d = findBars(payload, 0);
    if (!d) {
      const err = findError(payload, 0);
      throw { code: 'no_data', message: err ? String(err).slice(0, 200) : 'No price data came back for ' + sym + '. Check the ticker.' };
    }
    const bars = [];
    for (const b of d.bars) {
      const o = num(b.open), h = num(b.high), l = num(b.low), c = num(b.close);
      if (o == null || h == null || l == null || c == null || c <= 0) continue;
      bars.push({ t: String(b.date || '').slice(0, 10), o, h: Math.max(h, o, c), l: Math.min(l, o, c), c, v: num(b.volume) || 0 });
    }
    if (bars.length < 30) throw { code: 'no_data', message: 'Only ' + bars.length + ' bars for ' + sym + ' on this timeframe.' };
    const out = {
      bars, symbol: d.symbol || sym, name: d.name || sym, instrument: d.instrument_type || '', currency: d.currency || '',
      storedAt: res.cache && res.cache.storedAt ? res.cache.storedAt : (num(d.observed_at_ms) || Date.now()), cached: !!res.cache,
    };
    remember(sym, tf, out);
    return out;
  };

  // Human copy for each failure, with the action that fixes it.
  L.explain = function (e) {
    const c = e && e.code;
    if (c === 'no_mcp' || c === 'not_granted' || c === 'capability_disabled' || c === 'capability_removed') return { msg: 'Live data works when this page is open in claude.ai with the Firecrawl connector. Here you can use the samples or load a CSV.', action: null };
    if (c === 'server_not_connected') return { msg: 'Add the Firecrawl connector in claude.ai Settings → Connectors to load live prices.', action: null };
    if (c === 'needs_reauth') return { msg: 'Reconnect Firecrawl in claude.ai Settings → Connectors, then try again.', action: 'retry' };
    if (c === 'selection_required') return { msg: 'You have more than one Firecrawl connector. Choose one in the prompt claude.ai shows, then try again.', action: 'retry' };
    if (c === 'not_in_manifest' || c === 'approval_required' || c === 'consent_required') return { msg: 'This page needs your OK to use Firecrawl for price data (5 credits per symbol and timeframe).', action: 'allow' };
    if (c === 'blocked_by_policy') return { msg: 'Your organization blocks this connector for this page.', action: null };
    if (c === 'server_unavailable' || c === 'rate_limited') return { msg: 'Firecrawl did not answer just now.', action: 'retry' };
    if (c === 'tool_error' || c === 'no_data') return { msg: (e.message && !/^\s*[{[]/.test(e.message) ? e.message : 'The data provider could not return this symbol.'), action: null };
    if (c === 'bad_symbol') return { msg: e.message, action: null };
    return { msg: 'Loading live data failed (' + (c || 'unknown') + ').', action: 'retry' };
  };

  root.SPLive = L;
})(window);
