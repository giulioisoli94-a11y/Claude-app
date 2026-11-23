/* UI wiring: data source → analysis → chart, setup list, detail, library, trainer. */
(function () {
  const D = window.SPD, P = window.SPP, LIB = window.SPL, B = window.SPB, T = window.SPT;
  const TFW = { D: 'Daily', W: 'Weekly', M: 'Monthly' };
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = P.fmt;
  const store = {
    get(k, d) { try { const v = localStorage.getItem('spl.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('spl.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };
  const BIAS_WORD = { bull: 'Bullish', bear: 'Bearish', neutral: 'Neutral' };
  const STATUS_WORD = { forming: 'Forming', confirmed: 'Confirmed', failed: 'Failed', fresh: 'Just broke', holding: 'Holding', potential: 'Potential breakout · awaiting confirmation', unconfirmed: 'No follow-through' };
  const Live = window.SPLive;
  const title = key => (LIB.entries[key] ? LIB.entries[key].title : key);

  /* ================= ANALYZE ================= */
  const state = { bars: [], daily: [], an: null, sel: null, filter: 'all', srcKind: 'sample', name: '', ticker: '', randSeed: 7, tf: 'D', bt: null, live: null, liveSym: null, liveReq: 0 };
  const chart = new ChartView($('#chart'), { initialBars: 150 });

  const src = $('#src');
  src.innerHTML = '<optgroup label="Live · major indexes">' + Live.WATCH.indexes.map(([t, n]) => `<option value="L:${esc(t)}">${esc(t)} · ${esc(n)}</option>`).join('') + '</optgroup>' +
    '<optgroup label="Live · Nasdaq &amp; S&amp;P leaders">' + Live.WATCH.stocks.map(([t, n]) => `<option value="L:${esc(t)}">${esc(t)} · ${esc(n)}</option>`).join('') + '</optgroup>' +
    '<option value="L:other" disabled>Live · your ticker (type it in the box)</option>' +
    '<optgroup label="Sample markets (synthetic)">' + D.samples.map(s => `<option value="s:${s.id}">${esc(s.ticker)}: ${esc(s.name)}</option>`).join('') +
    '</optgroup><option value="random">Random market (synthetic)</option><option value="csv" disabled>Your CSV (load a file)</option>';

  /* ---------- live data ---------- */
  function liveMsg(html, kind) {
    const el = $('#liveStatus');
    el.hidden = !html; el.className = 'live-status' + (kind ? ' ' + kind : ''); el.innerHTML = html || '';
  }
  async function loadLive(sym, opts) {
    opts = opts || {};
    sym = String(sym).trim().toUpperCase();
    const req = ++state.liveReq;
    const label = (Live.WATCH.indexes.concat(Live.WATCH.stocks).find(x => x[0] === sym) || [sym, ''])[1];
    liveMsg(`<span class="spin" aria-hidden="true"></span> Loading ${esc(sym)} · ${TFW[state.tf].toLowerCase()} bars from Yahoo Finance via Firecrawl…`);
    const cached = Live.cached(sym, state.tf);
    if (cached && !opts.refresh) showLive(sym, cached, true); // show the last copy at once
    try {
      const d = await Live.load(sym, state.tf, { refresh: opts.refresh });
      if (req !== state.liveReq) return;
      showLive(sym, d, false);
    } catch (e) {
      if (req !== state.liveReq) return;
      const x = Live.explain(e);
      liveMsg(`<b>${esc(sym)}:</b> ${esc(x.msg)}${cached ? ' Showing the copy saved ' + esc(new Date(cached.storedAt).toLocaleString()) + '.' : ''} ${x.action ? `<button class="btn ghost" type="button" id="liveRetry">${x.action === 'allow' ? 'Allow and load' : 'Try again'}</button>` : ''}`, 'warn');
      const b = $('#liveRetry'); if (b) b.addEventListener('click', () => loadLive(sym));
      if (!cached && !state.an) loadSample(D.samples[0].id);
    }
    void label;
  }
  function showLive(sym, d, fromStore) {
    state.srcKind = 'live'; state.liveSym = sym; state.live = d;
    state.ticker = sym; state.name = d.name;
    run();
    const when = new Date(d.storedAt);
    liveMsg(`<span class="dot-live${fromStore ? ' old' : ''}" aria-hidden="true"></span> ${fromStore ? 'Saved copy' : 'Live'} · ${esc(d.name)} · Yahoo Finance via Firecrawl · data as of ${esc(when.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }))}${d.cached ? ' (cached)' : ''} <button class="btn ghost" type="button" id="liveRefresh">Refresh</button>`);
    const b = $('#liveRefresh'); if (b) b.addEventListener('click', () => loadLive(sym, { refresh: true }));
  }
  $('#tickerForm').addEventListener('submit', e => {
    e.preventDefault();
    const v = $('#tickerIn').value.trim();
    if (!v) return;
    const opt = src.querySelector('option[value="L:other"]'); opt.textContent = 'Live · ' + v.toUpperCase(); opt.disabled = false; src.value = 'L:other';
    loadLive(v);
  });

  function loadSample(id) {
    const s = D.samples.find(x => x.id === id);
    state.daily = D.sampleBars(s); state.srcKind = 'sample'; state.ticker = s.ticker; state.name = s.name;
    run();
  }
  function loadRandom() {
    state.daily = D.randomBars(state.randSeed); state.srcKind = 'random'; state.ticker = 'RANDOM-' + state.randSeed; state.name = 'Random market';
    run();
  }
  function run() {
    state.bars = state.srcKind === 'live' ? state.live.bars : state.tf === 'W' ? D.toWeekly(state.daily) : state.tf === 'M' ? D.toMonthly(state.daily) : state.daily;
    if (state.bars.length < 30) {
      $('#csvErr').hidden = false;
      $('#csvErr').textContent = 'Only ' + state.bars.length + ' ' + TFW[state.tf].toLowerCase() + ' bars. Load a longer history (about 3+ years for weekly, 5+ for monthly) or switch back to Daily.';
      if (state.srcKind === 'live') return;
      state.tf = 'D'; paintTf(); state.bars = state.daily;
    }
    state.bt = null; if (typeof applyLayers === 'function') applyLayers(); chart.setOverlays([]); $('#btBtn').disabled = false; $('#btBtn').textContent = 'Backtest this chart';
    state.an = P.analyze(state.bars);
    state.sel = null;
    chart.setData(state.bars, state.an);
    chart.setSelected(null);
    renderHead(); renderRead(); renderSigs();
    const first = state.an.signals.find(s => s.kind !== 'candle') || state.an.signals[0];
    select(first || null);
  }

  src.addEventListener('change', () => {
    const v = src.value;
    $('#csvErr').hidden = true;
    if (v.startsWith('L:') && v !== 'L:other') { loadLive(v.slice(2)); return; }
    if (v === 'L:other') { loadLive(state.liveSym); return; }
    liveMsg('');
    if (v.startsWith('s:')) loadSample(v.slice(2));
    else if (v === 'random') loadRandom();
  });
  $('#randomBtn').addEventListener('click', () => { liveMsg(''); state.randSeed = Math.floor(Math.random() * 1e6); src.value = 'random'; loadRandom(); });
  function paintTf() { document.querySelectorAll('#tfSeg button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.tf === state.tf))); }
  $('#tfSeg').addEventListener('click', e => {
    const b = e.target.closest('button[data-tf]'); if (!b || b.dataset.tf === state.tf) return;
    state.tf = b.dataset.tf; paintTf(); $('#csvErr').hidden = true;
    if (state.srcKind === 'live') loadLive(state.liveSym); else run();
  });
  $('#csv').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const bars = D.parseCSV(String(r.result));
        state.daily = bars; state.srcKind = 'csv'; liveMsg('');
        state.ticker = f.name.replace(/\.(csv|txt)$/i, '').toUpperCase().slice(0, 18); state.name = 'Your data';
        const opt = src.querySelector('option[value="csv"]'); opt.disabled = false; opt.textContent = 'Your CSV: ' + state.ticker; src.value = 'csv';
        $('#csvErr').hidden = true;
        run();
      } catch (err) {
        $('#csvErr').hidden = false; $('#csvErr').textContent = err.message;
      }
      e.target.value = '';
    };
    r.readAsText(f);
  });

  function renderHead() {
    const m = state.an.market;
    $('#tkr').textContent = state.ticker;
    $('#px').textContent = fmt(m.price);
    const c = $('#chg'); c.textContent = (m.change >= 0 ? '+' : '') + m.change.toFixed(2) + '%'; c.className = 'chg num ' + (m.change >= 0 ? 'up' : 'down');
    $('#srcTag').textContent = state.srcKind === 'csv' ? 'Your data' : state.srcKind === 'live' ? (state.live.instrument === 'INDEX' ? 'Index · live' : 'Live') : 'Synthetic sample';
    $('#tkr').title = state.name || '';
    $('#asof').textContent = TFW[state.tf] + ' · ' + state.bars.length + ' bars · last ' + m.date;
  }

  function renderRead() {
    const m = state.an.market;
    const pct = (a, b) => ((a / b - 1) * 100);
    const cells = [
      ['Trend', m.trend, m.sma50 ? 'vs 50d ' + (pct(m.price, m.sma50) >= 0 ? '+' : '') + pct(m.price, m.sma50).toFixed(1) + '%' : 'needs 50 bars'],
      ['Structure', m.structure, 'last two swing highs & lows'],
      ['RSI 14', m.rsi != null ? m.rsi.toFixed(0) : '–', m.rsi == null ? '' : m.rsi >= 70 ? 'overbought' : m.rsi <= 30 ? 'oversold' : m.rsi >= 50 ? 'bullish momentum' : 'bearish momentum'],
      ['Volatility (ATR)', fmt(m.atr), m.atrPct.toFixed(1) + '% of price per bar'],
      ['Support', m.support ? fmt(m.support.price) : 'none nearby', m.support ? pct(m.support.price, m.price).toFixed(1) + '% · ' + m.support.touches + ' touches' : ''],
      ['Resistance', m.resistance ? fmt(m.resistance.price) : 'none nearby', m.resistance ? '+' + pct(m.resistance.price, m.price).toFixed(1) + '% · ' + m.resistance.touches + ' touches' : 'price at highs'],
    ];
    $('#read').innerHTML = cells.map(([k, v, s]) => `<div><div class="eyebrow">${esc(k)}</div><div class="v">${esc(v)}</div><div class="s">${esc(s)}</div></div>`).join('');
  }

  function renderSigs() {
    const list = state.an.signals.filter(s => state.filter === 'all' || s.bias === state.filter);
    const ul = $('#sigs');
    if (!list.length) { ul.innerHTML = '<li class="empty">No ' + (state.filter === 'all' ? '' : BIAS_WORD[state.filter].toLowerCase() + ' ') + 'setups in the recent bars. That is information too: no edge, no trade.</li>'; return; }
    ul.innerHTML = list.map(s => {
      const ago = s.age === 0 ? 'last bar' : s.age + ' bar' + (s.age > 1 ? 's' : '') + ' ago';
      return `<li><button class="sig" role="option" type="button" data-id="${esc(s.id)}" aria-selected="${state.sel && state.sel.id === s.id}">
        <span class="stripe ${s.bias}-c"></span>
        <span><span class="nm">${esc(title(s.key))}</span><br><span class="meta">${esc(kindWord(s.kind))} · ${ago}${s.status ? ' · ' + STATUS_WORD[s.status] : ''}</span></span>
        <span>${s.score != null ? `<div class="score">${s.score}</div><div class="meter"><i style="width:${s.score}%"></i></div>` : ''}</span>
      </button></li>`;
    }).join('');
  }
  function kindWord(k) { return { chart: 'Chart pattern', breakout: 'Level break', trendline: 'Trend line', candle: 'Candlestick' }[k]; }

  $('#sigs').addEventListener('click', e => {
    const b = e.target.closest('.sig'); if (!b) return;
    const s = state.an.signals.find(x => x.id === b.dataset.id);
    select(state.sel && s && state.sel.id === s.id ? null : s);
  });
  $('#sigFilter').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    state.filter = b.dataset.f;
    document.querySelectorAll('#sigFilter .chip').forEach(c => c.setAttribute('aria-pressed', String(c === b)));
    renderSigs();
  });

  chart.onPick = i => {
    if (i < 0) return;
    const s = state.an.signals.find(x => x.kind === 'candle' && x.i === i) || state.an.signals.find(x => x.kind !== 'candle' && x.breakI === i);
    if (s) select(s);
    else {
      const cd = state.an.candles.find(c => c.i === i);
      if (cd) showCandleLesson(cd);
    }
  };

  function select(s) {
    state.sel = s;
    if (s && s.targets && T && T.targets && T.targets[state.tf]) {
      const tg = T.targets[state.tf].follow || {};
      s.targets.forEach(t => { t.hit = tg[t.k] ? tg[t.k].hit : null; });
    }
    chart.setSelected(s);
    document.querySelectorAll('#sigs .sig').forEach(b => b.setAttribute('aria-selected', String(!!s && b.dataset.id === s.id)));
    renderDetail();
  }

  function renderDetail() {
    const s = state.sel, box = $('#detail');
    if (!s) {
      box.innerHTML = `<div class="detail"><div class="eyebrow">How to read this</div><p>Pick a setup to draw it on the chart with its entry, stop and target. Without a selection the chart shows key support (teal) and resistance (orange) levels, the strongest trend lines, the 20/50/200-day averages and candlestick markers (▲ bullish, ▼ bearish).</p></div>`;
      return;
    }
    const e = LIB.entries[s.key] || {};
    const p = s.plan;
    const icon = ok => ok === true ? '<span class="ic ok" aria-label="yes">✓</span>' : ok === false ? '<span class="ic no" aria-label="no">✕</span>' : '<span class="ic mid" aria-label="partly">~</span>';
    const acct = store.get('acct', 25000), risk = store.get('risk', 1);
    box.innerHTML = `<div class="detail">
      <div class="sec">
        <div class="row"><span class="pill ${s.bias}">${BIAS_WORD[s.bias]}</span>${s.status ? `<span class="pill st ${s.status}">${STATUS_WORD[s.status]}</span>` : ''}<span class="muted">${esc(kindWord(s.kind))} · ${esc(s.date)}</span></div>
        <h3>${esc(title(s.key))}</h3>
        <p>${esc(s.detail)}</p>
      </div>
      ${p ? `<div class="sec">
        <div class="eyebrow">Trade plan the pattern implies</div>
        <div class="plan">
          <div><div class="eyebrow">Entry</div><div class="v">${fmt(p.entry)}</div></div>
          <div class="stop"><div class="eyebrow">Stop</div><div class="v">${fmt(p.stop)}</div></div>
          <div class="tgt"><div class="eyebrow">Target</div><div class="v">${fmt(p.target)}</div></div>
          <div><div class="eyebrow">Reward : risk</div><div class="v">${p.rr != null ? p.rr.toFixed(1) + ' : 1' : '–'}</div></div>
        </div>
        <div class="sizer">
          <label>Account size<input id="acct" type="number" min="0" step="100" value="${acct}"></label>
          <label>Risk per trade (%)<input id="risk" type="number" min="0.1" max="10" step="0.1" value="${risk}"></label>
        </div>
        <div class="sizer-out" id="sizeOut"></div>
      </div>` : ''}
      ${confirmHTML(s)}
      ${targetsHTML(s)}
      ${evidenceHTML(s)}
      ${s.checklist && s.checklist.length ? `<div class="sec">
        <div class="row" style="justify-content:space-between"><div class="eyebrow">Confirmation checklist</div><span class="num muted" title="A teaching aid: in the backtest the overall score did not separate winners from losers. Volume was the item that mattered.">${s.score}/100</span></div>
        <ul class="checks">${s.checklist.map(c => `<li>${icon(c.ok)}<div><b>${esc(c.label)}${c.k === 'vol' ? ' <span class="vd good" title="In the backtest, strong-volume breaks did better than weak-volume breaks in most comparisons">Backed by the backtest</span>' : ''}</b><span>${esc(c.why)}</span></div></li>`).join('')}</ul>
      </div>` : ''}
      ${e.title ? `<div class="lesson">
        <h4>Quick lesson</h4>
        <p>${esc(e.short)}</p>
        <p class="muted">${esc(e.why)}</p>
        ${e.mistakes ? `<h4>Common mistake</h4><p>${esc(e.mistakes[0])}</p>` : ''}
        <div><button class="link" type="button" id="openLib">Open the full lesson</button></div>
      </div>` : ''}
    </div>`;
    if (p) {
      const upd = () => {
        const a = parseFloat($('#acct').value) || 0, r = parseFloat($('#risk').value) || 0;
        store.set('acct', a); store.set('risk', r);
        const per = Math.abs(p.entry - p.stop);
        const dollars = a * r / 100;
        const sh = per > 0 ? Math.floor(dollars / per) : 0;
        $('#sizeOut').innerHTML = per > 0
          ? `Risking <b class="num">${dollars.toFixed(0)}</b> at <b class="num">${fmt(per)}</b>/share → <b class="num">${sh}</b> shares (position <b class="num">${(sh * p.entry).toFixed(0)}</b>, ${a ? (sh * p.entry / a * 100).toFixed(0) : 0}% of account). If the target hits: <b class="num">+${(sh * Math.abs(p.target - p.entry)).toFixed(0)}</b>.`
          : '';
      };
      $('#acct').addEventListener('input', upd); $('#risk').addEventListener('input', upd); upd();
    }
    const ol = $('#openLib'); if (ol) ol.addEventListener('click', () => { openLesson(s.key); location.hash = 'learn'; });
  }

  /* Breakout confirmation: what has happened since the break, under the
     two-close rule chosen from the backtest. */
  function confirmHTML(s) {
    if (s.level == null || /^failed/.test(s.key) || (s.bias !== 'bull' && s.bias !== 'bear')) return '';
    const c = s.confirm || {}, up = s.bias === 'bull', side = up ? 'above' : 'below';
    const st = T && T.confirm && T.confirm[state.tf];
    const ev = st ? `<div class="muted" style="font-size:12px">Backtest, ${TFW[state.tf].toLowerCase()}: ${(st.falseBreak * 100).toFixed(0)}% of breaks closed back inside within 5 bars. Waiting for the second close cut that to ${(st.follow.all.fb * 100).toFixed(0)}%; with strong volume too, to ${(st.volfollow.all.fb * 100).toFixed(0)}%.</div>` : '';
    const ic = ok => ok === true ? '<span class="ic ok">✓</span>' : ok === false ? '<span class="ic no">✕</span>' : '<span class="ic mid">…</span>';
    if (!c.broke) {
      return `<div class="sec"><div class="row" style="justify-content:space-between"><div class="eyebrow">Breakout confirmation</div><span class="pill st">Not broken yet</span></div>
        <ul class="checks">
          <li>${ic(null)}<div><b>Step 1: a close ${side} ${fmt(s.level)}</b><span>Until then this is only a potential breakout. Intraday pokes through the line do not count.</span></div></li>
          <li>${ic(null)}<div><b>Step 2: a second close ${side} the line</b><span>That turns a potential breakout into a confirmed one.</span></div></li>
          <li>${ic(null)}<div><b>Best: volume ≥ 1.5× average on the break</b><span>The strongest confirmation in the backtest.</span></div></li>
        </ul>${ev}</div>`;
    }
    const strong = s.status === 'confirmed' && c.vol === true;
    const pill = s.status === 'failed' ? '<span class="pill bear">False break</span>' : s.status === 'unconfirmed' ? '<span class="pill bear">No follow-through</span>'
      : s.status === 'potential' ? '<span class="pill neutral">Potential · awaiting 2nd close</span>' : strong ? '<span class="pill bull">Confirmed + volume</span>' : '<span class="pill bull">Confirmed</span>';
    const bd = state.bars[s.breakI] ? state.bars[s.breakI].t : '';
    return `<div class="sec"><div class="row" style="justify-content:space-between"><div class="eyebrow">Breakout confirmation</div>${pill}</div>
      <ul class="checks">
        <li>${ic(true)}<div><b>Closed ${side} ${fmt(s.level)}</b><span>${esc(bd)}. On its own this is a potential breakout.</span></div></li>
        <li>${ic(c.follow)}<div><b>Second close ${side} the line</b><span>${c.follow === null ? 'Watch the next close: ' + side + ' ' + fmt(s.level) + ' confirms the breakout.' : c.follow ? 'Follow-through: the breakout is confirmed.' : 'The next bar closed back at or inside the line. Treat the break as unconfirmed.'}</span></div></li>
        <li>${ic(c.vol)}<div><b>Volume on the break${c.volRatio != null ? ': ' + c.volRatio.toFixed(1) + '× average' : ''}</b><span>${c.vol == null ? 'No volume data for this symbol (common for indexes).' : c.vol ? 'Strong: big money took part.' : 'Below 1.5×: a weaker break.'}</span></div></li>
        <li>${ic(c.retest ? true : null)}<div><b>Retest of the line</b><span>${c.retest ? 'Price came back to the line and held: the classic lower-risk entry.' : 'No retest yet. A pullback that holds the line offers a tighter stop.'}</span></div></li>
        ${c.backInside !== -1 ? `<li>${ic(false)}<div><b>Closed back inside</b><span>${esc(state.bars[c.backInside].t)}: the break failed.</span></div></li>` : ''}
      </ul>${ev}</div>`;
  }

  /* Take-profit ladder: Fibonacci extensions of the breakout swing and the
     pattern's measured move, each with its backtested hit rate. */
  function targetsHTML(s) {
    if (!s.targets || !s.targets.length || !s.plan) return '';
    const p = s.plan, risk = Math.abs(p.entry - p.stop);
    const tg = T && T.targets && T.targets[state.tf] && T.targets[state.tf].follow;
    const rows = s.targets.map(t => {
      const h = tg && tg[t.k];
      const g = (t.price / p.entry - 1) * 100;
      return `<tr><td>${esc(t.label.replace(' (equal move)', ''))}</td><td>${fmt(t.price)}</td><td>${g >= 0 ? '+' : ''}${g.toFixed(1)}% · ${risk ? (Math.abs(t.price - p.entry) / risk).toFixed(1) + 'R' : '–'}</td><td><b>${h ? (h.hit * 100).toFixed(0) + '%' : '–'}</b></td></tr>`;
    }).join('');
    const rz = s.retrace ? `<p class="muted" style="margin:0;font-size:12.5px">Pullback zone (Fibonacci retracement of the breakout leg): 38.2% ${fmt(s.retrace[0].price)} · 50% ${fmt(s.retrace[1].price)} · 61.8% ${fmt(s.retrace[2].price)}.</p>` : '';
    return `<div class="sec"><div class="eyebrow">Take-profit targets</div>
      <div class="tbl-wrap"><table class="data"><thead><tr><th>Target</th><th>Price</th><th>Gain · reward</th><th>Hit*</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="muted" style="margin:0;font-size:12px">Fibonacci levels extend the breakout swing (${fmt(s.swing)} to ${fmt(s.level)}, size ${fmt(s.height)}). *Share of confirmed ${TFW[state.tf].toLowerCase()} breakouts in the backtest that reached the level before the stop. Nearer targets hit more often but pay less; many traders take part at Fib 1.272 and let the rest run to the measured move.</p>
      ${rz}</div>`;
  }

  /* What the backtest says about this kind of setup on this timeframe. */
  function evidenceHTML(s) {
    const st = T && T.byKey[s.key] && T.byKey[s.key][state.tf];
    if (!st || !st.n) return '';
    const v = B.verdict(st);
    const per = T.byKeySet[s.key] && T.byKeySet[s.key][state.tf];
    const held = per && per.a.n >= 30 && per.b.n >= 30 ? (per.a.edge > 0 && per.b.edge > 0 ? 'Positive in both test periods.' : per.a.edge <= 0 && per.b.edge <= 0 ? 'Negative in both test periods.' : 'Mixed between the two test periods.') : '';
    let volLine = '';
    const vk = s.kind === 'chart' || s.kind === 'breakout' ? s.kind : null;
    const vc = s.checklist && s.checklist.find(c => c.k === 'vol');
    if (vk && vc && T.volume[vk] && T.volume[vk][state.tf]) {
      const vv = T.volume[vk][state.tf];
      const what = vk === 'chart' ? 'pattern' : 'level';
      if (vc.ok === false && vv.weak.all.n) volLine = `<div class="warnline">Weak volume on this break. ${TFW[state.tf]} ${what} breaks on weak volume: ${sgn(vv.weak.all.edge)}R vs random, against ${sgn(vv.strong.all.edge)}R when volume was strong.</div>`;
      else if (vc.ok === true && vv.strong.all.n) volLine = `<div class="okline">Volume confirmed. ${TFW[state.tf]} ${what} breaks with strong volume: ${sgn(vv.strong.all.edge)}R vs random, against ${sgn(vv.weak.all.edge)}R on weak volume.</div>`;
    }
    return `<div class="sec"><div class="row" style="justify-content:space-between"><div class="eyebrow">Track record · ${TFW[state.tf]} · ${fmtN(st.n)} past trades</div><span class="vd ${v.k}">${v.label}</span></div>
      <div class="evidence">
        <div class="ev-grid">
          <div>Win rate<b>${(st.win * 100).toFixed(0)}%</b></div>
          <div>Avg result<b>${sgn(st.avgR)}R</b></div>
          <div>Random entry<b>${sgn(st.ctrlAvgR)}R</b></div>
          <div>Edge<b>${sgn(st.edge)}R</b></div>
        </div>
        ${edgeBar(st)}
        <div class="muted" style="font-size:12px">Real S&amp;P 500 stocks, 2000–12 and 2016–20, scanned bar by bar with no look-ahead. "Random entry" uses the same direction and stop/target distances on random days. ${held}</div>
        ${volLine}
      </div></div>`;
  }
  const sgn = x => (x == null ? '–' : (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(2));
  const fmtN = x => x.toLocaleString('en-US');
  function edgeBar(st) {
    // a single horizontal scale: random-entry ring, signal dot with 95% interval
    const vals = [st.avgR - st.ci, st.avgR + st.ci, st.ctrlAvgR, 0];
    const lo = Math.min(-0.5, ...vals), hi = Math.max(0.5, ...vals);
    const W = 300, X = x => 8 + (x - lo) / (hi - lo) * (W - 16);
    const v = B.verdict(st);
    const col = v.k === 'good' ? 'var(--good)' : v.k === 'bad' ? 'var(--bad)' : 'var(--fg)';
    return `<svg viewBox="0 0 ${W} 34" width="100%" height="34" role="img" aria-label="Average ${sgn(st.avgR)}R versus random ${sgn(st.ctrlAvgR)}R">
      <line x1="${X(0)}" x2="${X(0)}" y1="4" y2="26" stroke="var(--fg-muted)" stroke-width="1"/>
      <text x="${X(0)}" y="33" text-anchor="middle" font-size="9" fill="var(--fg-muted)">0R</text>
      <line x1="${X(st.avgR - st.ci)}" x2="${X(st.avgR + st.ci)}" y1="15" y2="15" stroke="${col}" stroke-width="2" stroke-linecap="round"/>
      <circle cx="${X(st.ctrlAvgR)}" cy="15" r="5" fill="var(--surface)" stroke="var(--ctrl)" stroke-width="2"/>
      <circle cx="${X(st.avgR)}" cy="15" r="5" fill="${col}" stroke="var(--surface)" stroke-width="2"/>
    </svg>`;
  }

  function showCandleLesson(cd) {
    const e = LIB.entries[cd.key];
    state.sel = null; chart.setSelected(null);
    $('#detail').innerHTML = `<div class="detail"><div class="row"><span class="pill ${P.CANDLE_BIAS[cd.key]}">${BIAS_WORD[P.CANDLE_BIAS[cd.key]]}</span><span class="muted">Candlestick · ${esc(state.bars[cd.i].t)}</span></div>
      <h3>${esc(e.title)}</h3><p>${esc(e.short)}</p><p class="muted">This one is older than the recent window, so it has no live trade plan. ${esc(e.why)}</p>
      <div><button class="link" type="button" id="openLib">Open the full lesson</button></div></div>`;
    $('#openLib').addEventListener('click', () => { openLesson(cd.key); location.hash = 'learn'; });
  }

  /* ---------- Market scan ---------- */
  let scanning = false;
  $('#scanCard').addEventListener('click', async e => {
    const b = e.target.closest('button[data-scan]'); if (!b || scanning) return;
    const list = Live.WATCH[b.dataset.scan];
    const out = $('#scanOut');
    if (!(await Live.available())) { out.innerHTML = `<p class="muted" style="margin:0">${esc(Live.explain({ code: 'no_mcp' }).msg)}</p>`; return; }
    scanning = true; document.querySelectorAll('#scanCard [data-scan]').forEach(x => { x.disabled = true; });
    const tf = state.tf, rows = [];
    const paint = (done) => {
      out.innerHTML = `<div class="tbl-wrap"><table class="data scan-t"><thead><tr><th>Symbol</th><th>Last</th><th>Change</th><th>Trend</th><th>Top setup</th><th>Status</th><th>Next target</th></tr></thead><tbody>
        ${rows.map(r => r.err ? `<tr><td>${esc(r.sym)}</td><td colspan="6" class="muted" style="font-family:var(--font-ui)">${esc(r.err)}</td></tr>` :
          `<tr data-sym="${esc(r.sym)}" class="clickable"><td><b>${esc(r.sym)}</b> <span class="muted" style="font-family:var(--font-ui)">${esc(r.name)}</span></td><td>${fmt(r.m.price)}</td><td class="${r.m.change >= 0 ? 'upc' : 'dnc'}">${r.m.change >= 0 ? '+' : ''}${r.m.change.toFixed(2)}%</td><td style="font-family:var(--font-ui)">${esc(r.m.trend)}</td>
          <td style="font-family:var(--font-ui)">${r.s ? `<span class="stripe-i ${r.s.bias}-c"></span>${esc(title(r.s.key))}` : '<span class="muted">none</span>'}</td>
          <td style="font-family:var(--font-ui)">${r.s && r.s.status ? `<span class="pill st ${r.s.status}">${esc(STATUS_WORD[r.s.status] || r.s.status)}</span>` : ''}</td>
          <td>${r.s && r.s.targets && r.s.targets[0] ? fmt(r.s.targets[0].price) + ' <span class="muted">(' + esc(r.s.targets[0].label.replace(' (equal move)', '')) + ')</span>' : r.s && r.s.plan ? fmt(r.s.plan.target) : '–'}</td></tr>`).join('')}
        </tbody></table></div>${done ? '<p class="muted" style="margin:6px 0 0;font-size:12px">Click a row to open its chart. Setups: chart patterns, level and trend-line breaks from the last few bars; "Potential" breaks still need a second close.</p>' : `<p class="muted" style="margin:6px 0 0"><span class="spin" style="display:inline-block;vertical-align:-2px"></span> Scanning ${rows.length + 1} of ${list.length}…</p>`}`;
      out.querySelectorAll('tr[data-sym]').forEach(tr => tr.addEventListener('click', () => {
        const sym = tr.dataset.sym; const o = src.querySelector(`option[value="L:${CSS.escape(sym)}"]`);
        if (o) src.value = o.value; loadLive(sym); window.scrollTo({ top: 0, behavior: 'smooth' });
      }));
    };
    for (const [sym, name] of list) {
      paint(false);
      try {
        const d = await Live.load(sym, tf);
        const an = P.analyze(d.bars);
        const s = an.signals.find(x => x.kind !== 'candle' && x.status !== 'failed' && x.age <= 10) || null;
        rows.push({ sym, name, m: an.market, s });
      } catch (err) {
        const x = Live.explain(err);
        rows.push({ sym, err: x.msg });
        if (['no_mcp', 'server_not_connected', 'needs_reauth', 'not_in_manifest', 'approval_required', 'blocked_by_policy', 'consent_required'].includes(err.code)) break; // same answer for every symbol
      }
    }
    paint(true);
    scanning = false; document.querySelectorAll('#scanCard [data-scan]').forEach(x => { x.disabled = false; });
  });

  /* ---------- Backtest this chart ---------- */
  $('#btBtn').addEventListener('click', () => {
    if (state.bt && state.bt.running) return;
    const bars = state.bars, tf = state.tf, cfg = B.TF[tf];
    if (bars.length < cfg.warm + 20) { $('#detail').innerHTML = `<div class="bt-panel"><b>Not enough history.</b><p class="muted" style="margin:0">A ${TFW[tf].toLowerCase()} backtest needs more than ${cfg.warm + 20} bars; this chart has ${bars.length}.</p></div>`; return; }
    const bt = state.bt = { running: true, st: { seed: 99 }, filter: null };
    select(null);
    const btn = $('#btBtn'); btn.disabled = true;
    $('#detail').innerHTML = `<div class="bt-panel"><div class="eyebrow">Backtesting ${esc(state.ticker)} · ${TFW[tf]}</div><p style="margin:0">Replaying the scanner bar by bar. Each bar only sees the past.</p><div class="progress"><i id="btProg"></i></div></div>`;
    let t = cfg.warm;
    const step = () => {
      if (state.bt !== bt) return;
      const to = Math.min(bars.length - 1, t + 40);
      B.walk(bars, tf, bt.st, t, to);
      t = to;
      const pr = $('#btProg'); if (pr) pr.style.width = ((t - cfg.warm) / (bars.length - 1 - cfg.warm) * 100).toFixed(0) + '%';
      if (t < bars.length - 1) setTimeout(step, 0);
      else { bt.running = false; btn.disabled = false; btn.textContent = 'Backtest again'; renderBt(); }
    };
    setTimeout(step, 30);
  });

  function renderBt() {
    const bt = state.bt; if (!bt) return;
    const ev = bt.st.events.filter(e => e.traded);
    const all = B.stats(ev);
    const groups = {};
    for (const e of ev) (groups[e.key] = groups[e.key] || []).push(e);
    const rows = Object.entries(groups).map(([k, L]) => [k, B.stats(L)]).sort((a, b) => b[1].n - a[1].n);
    const v = B.verdict(all);
    $('#detail').innerHTML = `<div class="bt-panel">
      <div class="row" style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><div class="eyebrow">Backtest · ${esc(state.ticker)} · ${TFW[state.tf]}</div><span class="vd ${v.k}">${v.label}</span></div>
      <div class="ev-grid">
        <div>Trades<b>${all.n || 0}</b></div><div>Win rate<b>${all.n ? (all.win * 100).toFixed(0) + '%' : '–'}</b></div>
        <div>Avg result<b>${sgn(all.avgR)}R</b></div><div>Random entry<b>${sgn(all.ctrlAvgR)}R</b></div>
      </div>
      ${all.n ? edgeBar(all) : ''}
      <p class="muted" style="margin:0;font-size:12.5px">Markers on the chart: one triangle per past trade, pointing in the trade's direction, green if it made money and red if it lost (candle markers are hidden meanwhile). Click a row to show only that setup. A single stock gives small samples: read the Track record tab for results across 187 stocks.</p>
      <div class="tbl-wrap"><table class="data"><thead><tr><th>Setup</th><th>Trades</th><th>Win</th><th>Avg R</th><th>Edge</th></tr></thead><tbody>
      ${rows.map(([k, st]) => `<tr data-k="${k}" style="cursor:pointer${bt.filter === k ? ';background:var(--accent-soft)' : ''}"><td>${esc(title(k))}</td><td>${st.n}</td><td>${(st.win * 100).toFixed(0)}%</td><td>${sgn(st.avgR)}</td><td>${sgn(st.edge)}</td></tr>`).join('') || '<tr><td colspan="5">No trades triggered.</td></tr>'}
      </tbody></table></div>
      <div><button class="link" type="button" id="btClose">Back to the current setups</button></div>
    </div>`;
    $('#detail').querySelectorAll('tr[data-k]').forEach(tr => tr.addEventListener('click', () => { bt.filter = bt.filter === tr.dataset.k ? null : tr.dataset.k; renderBt(); }));
    $('#btClose').addEventListener('click', () => { state.bt = null; applyLayers(); chart.setOverlays([]); renderDetail(); });
    const C = chart.colors();
    chart.o.candleMarks = false; // result markers replace candle markers while shown
    const shown = ev.filter(e => !bt.filter || e.key === bt.filter);
    chart.setOverlays([
      { list: shown.filter(e => e.r > 0).map(e => ({ t: 'marker', i: e.t, p: e.dir > 0 ? state.bars[e.t].l : state.bars[e.t].h, dir: -e.dir, label: '' })), col: C.up, strong: false },
      { list: shown.filter(e => e.r <= 0).map(e => ({ t: 'marker', i: e.t, p: e.dir > 0 ? state.bars[e.t].l : state.bars[e.t].h, dir: -e.dir, label: '' })), col: C.down, strong: false },
    ]);
  }

  // layer toggles
  const LAYERS = [
    ['levels', 'S/R levels', 'var(--support)'], ['trendlines', 'Trend lines', 'var(--resistance)'], ['patterns', 'Patterns', 'var(--accent)'],
    ['candleMarks', 'Candles', 'var(--up)'], ['sma20', 'MA 20', 'var(--ma20)'], ['sma50', 'MA 50', 'var(--ma50)'], ['sma200', 'MA 200', 'var(--ma200)'],
    ['volume', 'Volume', 'var(--fg-muted)'], ['rsi', 'RSI', 'var(--accent)'],
  ];
  const lay = store.get('layers', {});
  $('#layers').innerHTML = LAYERS.map(([k, n, c]) => `<button class="chip" type="button" data-k="${k}" aria-pressed="${lay[k] !== false}"><span class="sw" style="background:${c}"></span>${n}</button>`).join('');
  function applyLayers() {
    const on = k => lay[k] !== false;
    Object.assign(chart.o, { levels: on('levels'), trendlines: on('trendlines'), patterns: on('patterns'), candleMarks: on('candleMarks'), volume: on('volume'), rsi: on('rsi') });
    chart.o.sma = [20, 50, 200].filter(p => on('sma' + p));
    chart.render();
  }
  $('#layers').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    lay[b.dataset.k] = lay[b.dataset.k] === false;
    b.setAttribute('aria-pressed', String(lay[b.dataset.k] !== false));
    store.set('layers', lay); applyLayers();
  });
  applyLayers();
  $('#zIn').addEventListener('click', () => chart.zoom(0.75));
  $('#zOut').addEventListener('click', () => chart.zoom(1.33));
  $('#zReset').addEventListener('click', () => { chart.resetView(); chart.render(); });

  /* ================= LEARN ================= */
  const libChart = new ChartView(document.createElement('canvas'), { interactive: false, volume: false, rsi: false, axes: false, sma: [], levels: false, trendlines: false, candleMarks: false, patterns: false, rightPad: 2 });
  let libKey = store.get('lesson', 'swing_structure');
  if (!LIB.entries[libKey]) libKey = 'swing_structure';

  function libItems(q) {
    q = (q || '').toLowerCase();
    return LIB.ORDER.map(cat => [cat, Object.entries(LIB.entries).filter(([k, e]) => e.cat === cat && (!q || (e.title + ' ' + e.short).toLowerCase().includes(q)))]).filter(([, l]) => l.length);
  }
  function renderLibNav() {
    const q = $('#libSearch').value;
    $('#libList').innerHTML = libItems(q).map(([cat, l]) => `<div class="eyebrow grp">${esc(cat)}</div>` +
      l.map(([k, e]) => `<button type="button" data-k="${k}" aria-current="${k === libKey}"><span class="dot ${e.bias}-c"></span>${esc(e.title)}</button>`).join('')).join('') || '<div class="empty">Nothing matches.</div>';
    $('#libSelect').innerHTML = libItems('').map(([cat, l]) => `<optgroup label="${esc(cat)}">${l.map(([k, e]) => `<option value="${k}" ${k === libKey ? 'selected' : ''}>${esc(e.title)}</option>`).join('')}</optgroup>`).join('');
  }
  $('#libSearch').addEventListener('input', renderLibNav);
  $('#libList').addEventListener('click', e => { const b = e.target.closest('button[data-k]'); if (b) openLesson(b.dataset.k); });
  $('#libSelect').addEventListener('change', e => openLesson(e.target.value));

  function diagramFor(e, key) {
    const dg = e.diagram || {};
    if (dg.tpl) {
      const inst = D.templateInstance(dg.tpl, 5, { noise: 0.0015, wick: 0.003, leadLen: 22, base: 100 });
      // pattern outline through the template's waypoints
      let i = inst.patternStart; const pts = [[i, inst.bars[i].c]];
      for (let s = 1; s < inst.wps.length; s++) { i += inst.wps[s][0]; if (i < inst.bars.length) pts.push([i, inst.bars[i].c]); }
      const bias = D.templateBias[dg.tpl];
      return { bars: inst.bars, overlay: [{ list: [{ t: 'poly', pts }], col: null, bias }] };
    }
    if (dg.path) {
      const bars = D.fromWaypoints(dg.path, { seed: 9, base: 100, noise: 0.002, wick: 0.004 });
      const list = [];
      let wi = 0; const sw = dg.path.map(w => { wi += w[0]; return [wi, bars[Math.min(wi, bars.length - 1)].c]; });
      list.push({ t: 'poly', pts: sw });
      (dg.lines || []).forEach(l => list.push({ t: 'hline', y: l.y, from: 0, to: bars.length, label: l.label }));
      (dg.diag || []).forEach(d => list.push({ t: 'line', x1: d[0], y1: d[1], x2: d[2], y2: d[3], label: '' }));
      return { bars, overlay: [{ list, bias: e.bias }] };
    }
    if (dg.c) {
      const bars = [];
      const n = 7, dir = dg.ctx === 'down' ? -1 : 1;
      const first = dg.c[0][0];
      for (let k = 0; k < n; k++) {
        const c0 = first - dir * (n - k) * 1.6, c1 = first - dir * (n - k - 1) * 1.6 - dir * 0.2;
        const o = c0, c = c1;
        bars.push({ t: 'ctx' + k, o, c, h: Math.max(o, c) + 0.5, l: Math.min(o, c) - 0.5, v: 1 });
      }
      dg.c.forEach((b, k) => bars.push({ t: 'p' + k, o: b[0], h: b[1], l: b[2], c: b[3], v: 1 }));
      const lo = Math.min(...dg.c.map(b => b[2])), hi = Math.max(...dg.c.map(b => b[1]));
      return { bars, overlay: [{ list: [{ t: 'box', from: n, to: n + dg.c.length - 1, lo: lo - 0.3, hi: hi + 0.3, label: '' }], bias: e.bias }] };
    }
    return null;
  }

  function openLesson(key) {
    libKey = key; store.set('lesson', key);
    const e = LIB.entries[key];
    const ul = arr => arr && arr.length ? '<ul>' + arr.map(x => `<li>${esc(x)}</li>`).join('') + '</ul>' : '';
    $('#article').innerHTML = `
      <div class="row" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span class="eyebrow">${esc(e.cat)}</span><span class="pill ${e.bias}">${BIAS_WORD[e.bias]}</span></div>
      <h2>${esc(e.title)}</h2>
      <p class="lede">${esc(e.short)}</p>
      <div class="mini" id="miniWrap"></div>
      <p class="why"><b>Why it works.</b> ${esc(e.why)}</p>
      <div class="cols">
        <section><h4>How to spot it</h4>${ul(e.spot)}</section>
        <section><h4>What confirms it</h4>${ul(e.confirm)}</section>
        <section><h4>How a swing trader plays it</h4>${ul(e.trade)}</section>
        <section><h4>Mistakes to avoid</h4>${ul(e.mistakes)}</section>
      </div>
      ${lessonEvidence(key)}
      <div class="row" style="display:flex;gap:8px;flex-wrap:wrap">
        ${D.templates[key] ? `<button class="btn" type="button" id="practice">Practice spotting it</button>` : ''}
        <button class="btn ghost" type="button" id="findIt">Find it in the sample markets</button>
      </div>`;
    const wrap = $('#miniWrap');
    const dgm = diagramFor(e, key);
    if (dgm) {
      wrap.appendChild(libChart.cv);
      const C = libChart.colors();
      const col = b => (b === 'bull' ? C.up : b === 'bear' ? C.down : C.accent);
      libChart.setData(dgm.bars, null);
      libChart.from = -1; libChart.to = dgm.bars.length + 1;
      libChart.extra = dgm.overlay.map(o => ({ list: o.list, col: col(o.bias), strong: false }));
      libChart.render();
    } else wrap.hidden = true;
    const pr = $('#practice'); if (pr) pr.addEventListener('click', () => { trainer.force = key; location.hash = 'trainer'; trainer.next(); });
    $('#findIt').addEventListener('click', () => findInSamples(key));
    renderLibNav();
  }

  function lessonEvidence(key) {
    const bk = T && T.byKey[key];
    if (!bk) return '';
    const acc = T.accuracy && T.accuracy.res[key];
    const rows = ['D', 'W', 'M'].filter(tf => bk[tf] && bk[tf].n).map(tf => {
      const st = bk[tf], v = B.verdict(st);
      return `<tr><td>${TFW[tf]}</td><td>${fmtN(st.n)}</td><td>${(st.win * 100).toFixed(0)}%</td><td>${(st.tgt * 100).toFixed(0)}%</td><td>${sgn(st.avgR)}</td><td>${sgn(st.ctrlAvgR)}</td><td><span class="vd ${v.k}">${v.label}</span></td></tr>`;
    }).join('');
    return `<section class="sec"><h4 class="eyebrow" style="margin:0">What our backtest found</h4>
      <div class="tbl-wrap"><table class="data"><thead><tr><th>Timeframe</th><th>Trades</th><th>Win</th><th>Hit target</th><th>Avg R</th><th>Random</th><th>Verdict</th></tr></thead><tbody>${rows}</tbody></table></div>
      ${acc ? `<p class="muted" style="margin:0;font-size:12.5px">Recognition test: the scanner named a known ${esc(LIB.entries[key].title.toLowerCase())} correctly ${(acc.low.recall * 100).toFixed(0)}% of the time on clean charts and ${(acc.high.recall * 100).toFixed(0)}% on noisy ones.</p>` : ''}
      <p class="muted" style="margin:0;font-size:12.5px">R = result in units of the planned risk (−1R = stopped out). Details in the <a href="#track" class="link">Track record</a> tab.</p></section>`;
  }

  function findInSamples(key) {
    for (const s of D.samples) {
      const an = P.analyze(D.sampleBars(s));
      const hit = an.signals.find(x => x.key === key);
      if (hit) {
        location.hash = 'analyze';
        state.tf = 'D'; paintTf(); src.value = 's:' + s.id; loadSample(s.id);
        const again = state.an.signals.find(x => x.key === key);
        if (again) select(again);
        return;
      }
    }
    const btn = $('#findIt'); btn.textContent = 'Not in the samples. Try the trainer or a random market.'; btn.disabled = true;
  }

  /* ================= TRAINER ================= */
  const trChart = new ChartView($('#trChart'), { interactive: false, volume: true, rsi: false, axes: true, sma: [50], levels: false, trendlines: false, candleMarks: false, patterns: false, rightPad: 4 });
  const KEYS = Object.keys(D.templates);
  const trainer = {
    force: null, cur: null, answered: false, score: 0, total: 0, streak: 0, best: store.get('best', 0),
    next() {
      const key = this.force || KEYS[Math.floor(Math.random() * KEYS.length)];
      this.force = null;
      const predict = $('#trPredict').checked;
      const seed = Math.floor(Math.random() * 1e6);
      const full = D.templateInstance(key, seed, {});
      const bars = predict ? full.bars.slice(0, full.breakIndex + 1) : full.bars;
      this.cur = { key, seed, full, predict, bars };
      this.answered = false; this.pick = null; this.dirPick = null;
      const others = KEYS.filter(k => k !== key).sort(() => Math.random() - 0.5).slice(0, 3);
      const opts = others.concat(key).sort(() => Math.random() - 0.5);
      $('#trQ').textContent = predict ? 'Which pattern is forming, and where does it break?' : 'Which pattern is this?';
      $('#trOpts').innerHTML = opts.map(k => `<button class="opt" type="button" data-k="${k}">${esc(title(k))}</button>`).join('');
      $('#trFb').hidden = true;
      trChart.extra = [];
      trChart.setData(bars, P.analyze(bars));
      trChart.from = Math.max(0, bars.length - 110); trChart.to = bars.length - 1 + 4; trChart.render();
      this.paint();
    },
    paint() {
      $('#trScore').textContent = this.score + '/' + this.total; $('#trStreak').textContent = this.streak; $('#trBest').textContent = this.best;
    },
    answer(k) {
      if (this.answered) return;
      const c = this.cur;
      if (c.predict && !this.pick) {
        this.pick = k;
        document.querySelectorAll('#trOpts .opt').forEach(b => { b.disabled = true; if (b.dataset.k === k) b.style.borderColor = 'var(--accent)'; });
        $('#trFb').hidden = false;
        $('#trFb').innerHTML = '<b>Now predict: which way does it break?</b><div class="opts"><button class="opt" type="button" data-d="bull">Up (bullish)</button><button class="opt" type="button" data-d="bear">Down (bearish)</button></div>';
        return;
      }
      this.finish(c.predict ? this.pick : k, c.predict ? k : null);
    },
    finish(pk, dir) {
      const c = this.cur; this.answered = true;
      const right = pk === c.key;
      const realDir = D.templateBias[c.key];
      const dirRight = dir == null ? true : dir === realDir;
      const ok = right && dirRight;
      this.total++; if (ok) { this.score++; this.streak++; } else this.streak = 0;
      if (this.streak > this.best) { this.best = this.streak; store.set('best', this.best); }
      this.paint();
      document.querySelectorAll('#trOpts .opt').forEach(b => { b.disabled = true; b.style.borderColor = ''; if (b.dataset.k === c.key) b.classList.add('right'); else if (b.dataset.k === pk) b.classList.add('wrong'); });
      // reveal full chart + what the scanner sees
      const an = P.analyze(c.full.bars);
      const found = an.signals.find(s => s.key === c.key);
      trChart.setData(c.full.bars, an);
      trChart.from = Math.max(0, c.full.bars.length - 115); trChart.to = c.full.bars.length - 1 + 4;
      const C = trChart.colors();
      const col = realDir === 'bull' ? C.up : C.down;
      trChart.extra = [];
      if (found) trChart.setSelected(found); else {
        let i = c.full.patternStart; const pts = [[i, c.full.bars[i].c]];
        for (let s = 1; s < c.full.wps.length; s++) { i += c.full.wps[s][0]; if (i < c.full.bars.length) pts.push([i, c.full.bars[i].c]); }
        trChart.setSelected(null); trChart.extra = [{ list: [{ t: 'poly', pts }], col, strong: true }]; trChart.render();
      }
      const e = LIB.entries[c.key];
      $('#trFb').hidden = false;
      $('#trFb').innerHTML = `<div class="row" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="pill ${ok ? 'bull' : 'bear'}">${ok ? 'Correct' : 'Not quite'}</span>
        <b>${esc(e.title)}</b>${dir != null ? `<span class="muted">· it broke ${realDir === 'bull' ? 'up' : 'down'}${dirRight ? ', as you called' : ''}</span>` : ''}</div>
        <p style="margin:0">${esc(e.short)}</p>
        <p class="muted" style="margin:0"><b>Tell-tale:</b> ${esc(e.spot[0])}</p>
        <p class="muted" style="margin:0">${found ? 'The scanner also found it; its lines and trade plan are drawn on the chart.' : 'The scanner missed this one (noise bent the swings past its rules). The outline shows the shape.'}</p>
        <div><button class="link" type="button" id="trLesson">Read the lesson</button></div>`;
      $('#trLesson').addEventListener('click', () => { openLesson(c.key); location.hash = 'learn'; });
    },
  };
  $('#trOpts').addEventListener('click', e => { const b = e.target.closest('.opt'); if (b && !b.disabled) trainer.answer(b.dataset.k); });
  $('#trFb').addEventListener('click', e => { const b = e.target.closest('.opt[data-d]'); if (b && !trainer.answered) trainer.finish(trainer.pick, b.dataset.d); });
  $('#trNext').addEventListener('click', () => trainer.next());
  $('#trPredict').addEventListener('change', () => trainer.next());

  /* ================= TRACK RECORD ================= */
  const track = { tf: 'D', view: 'chart' };
  function renderTrack() {
    const box = $('#view-track');
    if (!T) { box.innerHTML = '<div class="card tr-hero"><h2>No backtest data</h2><p>Run backtest/run.js and backtest/report.js to generate it.</p></div>'; return; }
    const U = T.universe, O = T.overall;
    const trades = ['D', 'W', 'M'].reduce((a, tf) => a + (O[tf] ? O[tf].n : 0), 0);
    const acc = T.accuracy;
    const accAvg = nl => { const ks = Object.keys(acc.res); return ks.reduce((a, k) => a + acc.res[k][nl].recall, 0) / ks.length; };
    const fa = acc ? Object.values(acc.falseAlarmsPer1000).reduce((a, b) => a + b, 0) : null;
    const vD = T.volume.chart.D, bD = T.volume.breakout.D;
    let vWins = 0, vTot = 0; const vDiffs = [];
    for (const kind of ['chart', 'breakout']) for (const tf of ['D', 'W']) for (const per of ['a', 'b']) {
      const x = T.volume[kind][tf]; if (!x || !x.strong[per].n || !x.weak[per].n) continue;
      vTot++; const d = x.strong[per].edge - x.weak[per].edge; vDiffs.push(d); if (d > 0) vWins++;
    }
    const vAll = ['chart', 'breakout'].flatMap(k => ['D', 'W'].map(tf => T.volume[k][tf]));
    // setups that beat random overall AND in both periods on daily
    const robust = Object.keys(T.byKey).filter(k => {
      const st = T.byKey[k].D, ps = T.byKeySet[k] && T.byKeySet[k].D;
      return st && B.verdict(st).k === 'good' && ps && ps.a.n >= 30 && ps.b.n >= 30 && ps.a.edge > 0 && ps.b.edge > 0;
    });
    const worst = Object.keys(T.byKey).filter(k => T.byKey[k].D && B.verdict(T.byKey[k].D).k === 'bad');
    box.innerHTML = `
      <div class="card tr-hero">
        <div class="eyebrow">Track record · generated ${esc(T.generated)}</div>
        <h2>Does the scanner see patterns, and do the patterns pay?</h2>
        <p>Two separate tests. <b>Recognition</b>: on charts where we planted a known pattern, does the scanner name it? <b>Outcome</b>: on ${U.series} real price histories of S&amp;P 500 stocks (2000–2012 and 2016–2020), we replayed the scanner one bar at a time, so it never saw the future, traded every setup by its own plan and compared each result with random entries that used the same direction, stop and target distances.</p>
        <div class="tiles">
          <div class="tile"><b>${acc ? (accAvg('low') * 100).toFixed(0) + '%' : '–'}</b><span>patterns named correctly on clean charts (${acc ? (accAvg('high') * 100).toFixed(0) + '%' : '–'} on noisy ones)</span></div>
          <div class="tile"><b>${fmtN(trades)}</b><span>simulated trades on real stocks, daily + weekly + monthly</span></div>
          <div class="tile"><b>${sgn(O.D.avgR)}R</b><span>average daily trade, vs ${sgn(O.D.ctrlAvgR)}R for random entries</span></div>
          <div class="tile"><b>${vWins} of ${vTot}</b><span>comparisons where strong-volume breaks beat weak-volume breaks</span></div>
        </div>
      </div>
      <div class="finds">
        <div class="find card"><h4>1. A pattern alone is not an edge</h4><p>Across all setups the average trade landed within a few hundredths of an R of random entries on every timeframe. Shapes form by chance too: on purely random prices the scanner still finds about ${fa ? fa.toFixed(0) : '–'} confirmed pattern breaks per 1,000 bars, just as a human eye would. Treat a pattern as a plan (where you are wrong, where you take profit), not a prediction.</p></div>
        <div class="find card"><h4>2. Volume helps, modestly</h4><p>Of the checklist items, only volume made a repeatable difference. Breaks on at least 1.5× average volume beat weak-volume breaks in ${vWins} of ${vTot} comparisons (patterns and level breaks, daily and weekly, both periods), by up to ${Math.max(...vDiffs).toFixed(2)}R per trade. Daily pattern breaks: ${sgn(vD.strong.all.edge)}R vs random with strong volume, ${sgn(vD.weak.all.edge)}R with weak. Trend alignment and the overall checklist score did not beat random entries made in the same direction.</p></div>
        <div class="find card"><h4>3. Few setups beat random in both periods</h4><p>${robust.length ? 'On daily charts: <b>' + robust.map(k => esc(title(k))).join(', ') + '</b> beat random overall and stayed positive in both 2000–12 and 2016–20.' : 'On daily charts no single setup beat random clearly in both periods.'} ${worst.length ? 'Clearly worse than random: ' + worst.map(k => esc(title(k))).join(', ') + '.' : ''} Several setups that looked good in one period faded in the other, which is why the app shows every number with its sample size.</p></div>
      </div>
      <div class="card plot-card">
        <div class="plot-head">
          <h3>Average result per trade vs random entry</h3>
          <div class="toolbar">
            <div class="seg" role="radiogroup" aria-label="Timeframe" id="trkTf">${['D', 'W', 'M'].map(tf => `<button type="button" role="radio" data-tf="${tf}" aria-checked="${track.tf === tf}">${TFW[tf]}</button>`).join('')}</div>
            <div class="seg" role="radiogroup" aria-label="View" id="trkView"><button type="button" role="radio" data-v="chart" aria-checked="${track.view === 'chart'}">Chart</button><button type="button" role="radio" data-v="table" aria-checked="${track.view === 'table'}">Table</button></div>
          </div>
        </div>
        <div style="padding:10px 16px 0" class="legend">
          <span><i class="sig"></i>Setup's average (line = 95% range)</span><span><i class="ctrl"></i>Random entry, same trade shape</span>
          <span class="vd good">Beat random</span><span class="vd flat">No measurable edge</span><span class="vd bad">Worse than random</span>
        </div>
        <div class="plot-wrap" id="trkPlot"></div>
      </div>
      ${confirmSection()}
      <div class="card plot-card">
        <div class="plot-head"><h3>Recognition test</h3><span class="muted" style="font-size:12px">${acc ? acc.seeds : ''} planted examples per pattern and noise level</span></div>
        <div class="tbl-wrap" style="padding:4px 6px 10px">${accTable()}</div>
      </div>
      <div class="card method">
        <h3>How the test works</h3>
        <ul>
          <li><b>Data:</b> about 95 S&amp;P 500 stocks for 2000–2012 and 93 for 2016–2020 (split and dividend adjusted), from public GitHub datasets. Weekly and monthly bars are built from the daily data.</li>
          <li><b>No look-ahead:</b> at every bar the scanner sees only the past (a trailing window of ${B.TF.D.win} daily / ${B.TF.W.win} weekly / ${B.TF.M.win} monthly bars). A setup is traded only on the bar it first appears.</li>
          <li><b>Trades:</b> breakouts and confirmed patterns enter at the next bar's open; candle and trend-line setups need price to reach the trigger within 3 bars. Exit at the plan's stop or target, or after ${B.TF.D.hold} / ${B.TF.W.hold} / ${B.TF.M.hold} bars. If stop and target fall in the same bar we assume the stop. No commissions or slippage.</li>
          <li><b>Random control:</b> for every trade, 5 random entries in the same stock, same direction, with the same stop and target distances measured in ATR. "Edge" is the setup's average minus the random average. This separates the pattern's contribution from the market's drift (stocks mostly rose, so longs look good everywhere).</li>
          <li><b>Two periods:</b> the detection rules were tuned while looking at 2000–2012; 2016–2020 is a check on rules that were not fitted to it.</li>
          <li><b>R:</b> results are in multiples of the planned risk. +1R = gained what you risked; −1R = stopped out.</li>
          <li><b>Checklist score:</b> the 0–100 score did not separate winners from losers (every score band was within ±0.02R of random on daily charts). It stays in the app as a teaching aid; the volume item is the one that showed a repeatable effect.</li>
          <li><b>Limits:</b> large US stocks only, two periods, simple exits. A pattern that shows "no measurable edge" can still be a useful way to place a stop and target; it just did not predict direction better than chance here.</li>
        </ul>
      </div>`;
    $('#trkTf').addEventListener('click', e => { const b = e.target.closest('button[data-tf]'); if (!b) return; track.tf = b.dataset.tf; $('#trkTf').querySelectorAll('button').forEach(x => x.setAttribute('aria-checked', String(x === b))); drawTrk(); });
    $('#trkView').addEventListener('click', e => { const b = e.target.closest('button[data-v]'); if (!b) return; track.view = b.dataset.v; $('#trkView').querySelectorAll('button').forEach(x => x.setAttribute('aria-checked', String(x === b))); drawTrk(); });
    drawTrk();
  }
  function confirmSection() {
    if (!T.confirm || !T.confirm.D) return '';
    const R = ['close', 'follow', 'vol', 'volfollow', 'retest'];
    const lbl = B.RULE_LABEL;
    const tfRows = tf => { const c = T.confirm[tf]; if (!c) return ''; return R.map(r => { const x = c[r]; if (!x || !x.all.n) return ''; return `<tr${r === P.CONFIRM_RULE ? ' style="background:var(--accent-soft)"' : ''}><td>${TFW[tf]}</td><td style="font-family:var(--font-ui)">${esc(lbl[r])}${r === P.CONFIRM_RULE ? ' <span class="vd good">App default</span>' : ''}</td><td>${(x.kept * 100).toFixed(0)}%</td><td>${(x.all.fb * 100).toFixed(0)}%</td><td>${(x.all.win * 100).toFixed(0)}%</td><td>${sgn(x.all.avgR)}</td><td>${x.all.pct >= 0 ? '+' : ''}${x.all.pct.toFixed(2)}%</td><td>${sgn(x.all.edge)}</td><td>${sgn(x.a.edge)}</td><td>${sgn(x.b.edge)}</td></tr>`; }).join(''); };
    const TG = ['fib1272', 'fib1618', 'mm', 'fib2', 'fib2618'], TL = { fib1272: 'Fib 1.272', fib1618: 'Fib 1.618', mm: 'Measured move', fib2: 'Fib 2.0', fib2618: 'Fib 2.618' };
    const tgRows = ['D', 'W', 'M'].filter(tf => T.targets[tf] && T.targets[tf].follow).map(tf => `<tr><td>${TFW[tf]}</td>${TG.map(k => { const x = T.targets[tf].follow[k]; return `<td>${x ? (x.hit * 100).toFixed(0) + '% <span class="muted">' + sgn(x.avgR) + 'R</span>' : '–'}</td>`; }).join('')}</tr>`).join('');
    const d = T.confirm.D;
    return `<div class="card plot-card">
      <div class="plot-head"><h3>Breakout confirmation</h3><span class="muted" style="font-size:12px">${fmtN(d.breaks)} daily breaks · ${(d.falseBreak * 100).toFixed(0)}% closed back inside within 5 bars</span></div>
      <div class="method" style="padding-top:12px;padding-bottom:4px"><p style="margin:0;max-width:85ch">Every break the scanner found was re-tested under five confirmation rules. Each rule waits for its signal before entering (or skips the trade), then uses the same stop and measured-move target. <b>Kept</b> = share of breaks that met the rule; <b>False</b> = share that closed back inside the line within 5 bars of entry. The app labels a break <b>Potential</b> until a second close beyond the line confirms it, the rule that cut false breaks while keeping three quarters of the signals; strong volume on top cut them most. No rule turned breakouts into an edge over random entries on its own.</p></div>
      <div class="tbl-wrap" style="padding:0 6px 10px"><table class="data rules"><thead><tr><th>Timeframe</th><th>Rule</th><th>Kept</th><th>False</th><th>Win</th><th>Avg R</th><th>Avg return</th><th>Edge</th><th>2000–12</th><th>2016–20</th></tr></thead><tbody>${tfRows('D')}${tfRows('W')}${tfRows('M')}</tbody></table></div>
    </div>
    <div class="card plot-card">
      <div class="plot-head"><h3>Take-profit targets: how often each was reached</h3><span class="muted" style="font-size:12px">confirmed breaks, before the stop, within the holding window</span></div>
      <div class="tbl-wrap" style="padding:4px 6px 4px"><table class="data"><thead><tr><th>Timeframe</th>${TG.map(k => `<th>${TL[k]}</th>`).join('')}</tr></thead><tbody>${tgRows}</tbody></table></div>
      <p class="muted" style="margin:0;padding:0 16px 14px;font-size:12.5px;max-width:90ch">Fibonacci targets extend the breakout swing (from the base's low to the breakout level): 1.272 adds 27% of that swing, 1.618 adds 62%, 2.0 a full equal move. The measured move is each pattern's own textbook projection. Percent = hit rate; R = average result if you always exit at that target. Closer targets hit more often and pay less, so the averages end up similar: pick by how you manage the trade, for example take part at 1.272 and trail the rest.</p>
    </div>`;
  }
  function accTable() {
    const acc = T.accuracy; if (!acc) return '';
    const cols = Object.keys(acc.noise);
    const cell = x => `<td><span style="display:inline-block;width:${Math.round(x * 46)}px;height:6px;border-radius:3px;background:var(--accent);opacity:.55;margin-right:6px;vertical-align:1px"></span>${(x * 100).toFixed(0)}%</td>`;
    return `<table class="data"><thead><tr><th>Pattern</th>${cols.map(c => `<th>${c} noise</th>`).join('')}<th>Break bar right</th><th>Opposite-bias mix-up</th></tr></thead><tbody>
      ${Object.entries(acc.res).map(([k, r]) => `<tr><td>${esc(title(k))}</td>${cols.map(c => cell(r[c].recall)).join('')}<td>${(r.medium.timing * 100).toFixed(0)}%</td><td>${(r.high.mislabel * 100).toFixed(0)}%</td></tr>`).join('')}
      </tbody></table>`;
  }
  function drawTrk() {
    const tf = track.tf, wrap = $('#trkPlot');
    const rows = Object.entries(T.byKey).filter(([, v]) => v[tf] && v[tf].n >= 30).map(([k, v]) => [k, v[tf]]).sort((a, b) => b[1].edge - a[1].edge);
    if (track.view === 'table') {
      wrap.innerHTML = `<div class="tbl-wrap" style="padding:0 6px"><table class="data"><thead><tr><th>Setup</th><th>Trades</th><th>Win</th><th>Hit target</th><th>Avg R</th><th>±95%</th><th>Random R</th><th>Edge</th><th>2000–12</th><th>2016–20</th><th>Verdict</th></tr></thead><tbody>
        ${rows.map(([k, st]) => { const ps = T.byKeySet[k][tf]; const v = B.verdict(st); return `<tr><td>${esc(title(k))}</td><td>${fmtN(st.n)}</td><td>${(st.win * 100).toFixed(0)}%</td><td>${(st.tgt * 100).toFixed(0)}%</td><td>${sgn(st.avgR)}</td><td>${st.ci.toFixed(2)}</td><td>${sgn(st.ctrlAvgR)}</td><td>${sgn(st.edge)}</td><td>${ps.a.n ? sgn(ps.a.edge) : '–'}</td><td>${ps.b.n ? sgn(ps.b.edge) : '–'}</td><td><span class="vd ${v.k}">${v.label}</span></td></tr>`; }).join('')}
        </tbody></table></div>`;
      return;
    }
    const W = 960, RH = 28, top = 26, labW = 200, plotL = labW + 10, plotR = 650, H = top + rows.length * RH + 30;
    const vals = rows.flatMap(([, st]) => [st.avgR - st.ci, st.avgR + st.ci, st.ctrlAvgR]);
    let lo = Math.min(-0.25, ...vals), hi = Math.max(0.25, ...vals);
    const step = (hi - lo) > 1.2 ? 0.5 : 0.25;
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const X = v => plotL + (v - lo) / (hi - lo) * (plotR - plotL);
    const ticks = []; for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(+v.toFixed(2));
    const colOf = k => (k === 'good' ? 'var(--good)' : k === 'bad' ? 'var(--bad)' : 'var(--flat)');
    let svg = `<svg class="dotplot" viewBox="0 0 ${W} ${H}" role="img" aria-label="Average R per setup versus random entry, ${TFW[tf]}">`;
    svg += ticks.map(v => `<line x1="${X(v)}" x2="${X(v)}" y1="${top - 6}" y2="${H - 24}" stroke="${v === 0 ? 'var(--fg-muted)' : 'var(--line)'}" stroke-width="${v === 0 ? 1.2 : 1}"/><text class="muted-t" x="${X(v)}" y="${H - 8}" text-anchor="middle">${v > 0 ? '+' : ''}${v}R</text>`).join('');
    svg += `<text class="muted-t" x="${plotR + 16}" y="${top - 10}">Trades</text><text class="muted-t" x="${plotR + 76}" y="${top - 10}">Win</text><text class="muted-t" x="${plotR + 124}" y="${top - 10}">Edge</text><text class="muted-t" x="${plotR + 184}" y="${top - 10}">Verdict</text>`;
    rows.forEach(([k, st], j) => {
      const y = top + j * RH + RH / 2, v = B.verdict(st), c = colOf(v.k);
      svg += `<g class="row" data-k="${k}"><rect class="hit" x="0" y="${y - RH / 2}" width="${W}" height="${RH}" fill="transparent" rx="4"/>
        <text x="${labW}" y="${y + 4}" text-anchor="end">${esc(title(k))}</text>
        <line x1="${X(st.avgR - st.ci)}" x2="${X(st.avgR + st.ci)}" y1="${y}" y2="${y}" stroke="${c}" stroke-width="2" stroke-linecap="round"/>
        <circle cx="${X(st.ctrlAvgR)}" cy="${y}" r="5" fill="var(--surface)" stroke="var(--ctrl)" stroke-width="2"/>
        <circle cx="${X(st.avgR)}" cy="${y}" r="5.5" fill="${c}" stroke="var(--surface)" stroke-width="2"/>
        <text class="num-t" x="${plotR + 16}" y="${y + 4}">${fmtN(st.n)}</text>
        <text class="num-t" x="${plotR + 76}" y="${y + 4}">${(st.win * 100).toFixed(0)}%</text>
        <text class="num-t" x="${plotR + 124}" y="${y + 4}">${sgn(st.edge)}</text>
        <text x="${plotR + 184}" y="${y + 4}" style="fill:${c};font-weight:700;font-size:11.5px">${v.k === 'good' ? '▲ ' : v.k === 'bad' ? '▼ ' : ''}${v.label}</text></g>`;
    });
    svg += '</svg>';
    wrap.innerHTML = svg;
    const tip = document.querySelector('.tip') || document.body.appendChild(Object.assign(document.createElement('div'), { className: 'tip', hidden: true }));
    wrap.querySelectorAll('.row').forEach(g => {
      g.addEventListener('mousemove', e => {
        const k = g.dataset.k, st = T.byKey[k][tf], ps = T.byKeySet[k][tf];
        tip.innerHTML = `<b>${esc(title(k))}</b> · ${TFW[tf]}<br><span class="num">${fmtN(st.n)} trades · win ${(st.win * 100).toFixed(0)}% · hit target ${(st.tgt * 100).toFixed(0)}%</span><br><span class="num">avg ${sgn(st.avgR)}R (±${st.ci.toFixed(2)}) · random ${sgn(st.ctrlAvgR)}R</span><br><span class="num">edge 2000–12 ${ps.a.n ? sgn(ps.a.edge) : '–'} · 2016–20 ${ps.b.n ? sgn(ps.b.edge) : '–'}</span><br><span class="muted">Click to open the lesson</span>`;
        tip.hidden = false;
        const x = Math.min(window.innerWidth - 300, e.clientX + 14); tip.style.left = x + 'px'; tip.style.top = (e.clientY + 14) + 'px';
      });
      g.addEventListener('mouseleave', () => { tip.hidden = true; });
      g.addEventListener('click', () => { tip.hidden = true; openLesson(g.dataset.k); location.hash = 'learn'; });
      g.style.cursor = 'pointer';
    });
  }

  /* ================= ROUTING & THEME ================= */
  const VIEWS = ['analyze', 'learn', 'trainer', 'track'];
  function route() {
    const v = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'analyze';
    VIEWS.forEach(n => { $('#view-' + n).hidden = n !== v; });
    document.querySelectorAll('.tabs a').forEach(a => a.setAttribute('aria-current', a.dataset.view === v ? 'page' : 'false'));
    if (v === 'learn') { if (!$('#article').innerHTML) openLesson(libKey); else libChart.render(); }
    if (v === 'trainer' && !trainer.cur) trainer.next();
    if (v === 'track' && !$('#view-track').innerHTML) renderTrack();
    if (v === 'analyze') chart.render();
    if (v === 'trainer') trChart.render();
  }
  window.addEventListener('hashchange', route);
  const rerender = () => { chart.render(); trChart.render(); if (libChart.bars.length) openLesson(libKey); if (state.bt && !state.bt.running) renderBt(); };
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', rerender); } catch (e) { /* old browsers */ }
  new MutationObserver(rerender).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => chart.render());

  // boot
  src.value = 's:' + D.samples[0].id;
  loadSample(D.samples[0].id);
  route();
})();
