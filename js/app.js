/* UI wiring: data source → analysis → chart, setup list, detail, library, trainer. */
(function () {
  const D = window.SPD, P = window.SPP, LIB = window.SPL;
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = P.fmt;
  const store = {
    get(k, d) { try { const v = localStorage.getItem('spl.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('spl.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };
  const BIAS_WORD = { bull: 'Bullish', bear: 'Bearish', neutral: 'Neutral' };
  const STATUS_WORD = { forming: 'Forming', confirmed: 'Confirmed', failed: 'Failed', fresh: 'Just broke', holding: 'Holding' };
  const title = key => (LIB.entries[key] ? LIB.entries[key].title : key);

  /* ================= ANALYZE ================= */
  const state = { bars: [], daily: [], an: null, sel: null, filter: 'all', srcKind: 'sample', name: '', ticker: '', randSeed: 7 };
  const chart = new ChartView($('#chart'), { initialBars: 150 });

  const src = $('#src');
  src.innerHTML = '<optgroup label="Sample markets (synthetic)">' + D.samples.map(s => `<option value="s:${s.id}">${esc(s.ticker)}: ${esc(s.name)}</option>`).join('') +
    '</optgroup><option value="random">Random market (synthetic)</option><option value="csv" disabled>Your CSV (load a file)</option>';

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
    state.bars = $('#weekly').checked ? D.toWeekly(state.daily) : state.daily;
    if (state.bars.length < 30) { $('#csvErr').hidden = false; $('#csvErr').textContent = 'Not enough weekly bars; switch back to daily.'; return; }
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
    if (v.startsWith('s:')) loadSample(v.slice(2));
    else if (v === 'random') loadRandom();
  });
  $('#randomBtn').addEventListener('click', () => { state.randSeed = Math.floor(Math.random() * 1e6); src.value = 'random'; loadRandom(); });
  $('#weekly').addEventListener('change', run);
  $('#csv').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const bars = D.parseCSV(String(r.result));
        state.daily = bars; state.srcKind = 'csv';
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
    $('#srcTag').textContent = state.srcKind === 'csv' ? 'Your data' : 'Synthetic sample';
    $('#asof').textContent = (($('#weekly').checked) ? 'Weekly · ' : 'Daily · ') + state.bars.length + ' bars · last ' + m.date;
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
      ${s.checklist && s.checklist.length ? `<div class="sec">
        <div class="row" style="justify-content:space-between"><div class="eyebrow">Confirmation checklist</div><span class="num muted">${s.score}/100</span></div>
        <ul class="checks">${s.checklist.map(c => `<li>${icon(c.ok)}<div><b>${esc(c.label)}</b><span>${esc(c.why)}</span></div></li>`).join('')}</ul>
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

  function showCandleLesson(cd) {
    const e = LIB.entries[cd.key];
    state.sel = null; chart.setSelected(null);
    $('#detail').innerHTML = `<div class="detail"><div class="row"><span class="pill ${P.CANDLE_BIAS[cd.key]}">${BIAS_WORD[P.CANDLE_BIAS[cd.key]]}</span><span class="muted">Candlestick · ${esc(state.bars[cd.i].t)}</span></div>
      <h3>${esc(e.title)}</h3><p>${esc(e.short)}</p><p class="muted">This one is older than the recent window, so it has no live trade plan. ${esc(e.why)}</p>
      <div><button class="link" type="button" id="openLib">Open the full lesson</button></div></div>`;
    $('#openLib').addEventListener('click', () => { openLesson(cd.key); location.hash = 'learn'; });
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

  function findInSamples(key) {
    for (const s of D.samples) {
      const an = P.analyze(D.sampleBars(s));
      const hit = an.signals.find(x => x.key === key);
      if (hit) {
        location.hash = 'analyze';
        $('#weekly').checked = false; src.value = 's:' + s.id; loadSample(s.id);
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

  /* ================= ROUTING & THEME ================= */
  const VIEWS = ['analyze', 'learn', 'trainer'];
  function route() {
    const v = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'analyze';
    VIEWS.forEach(n => { $('#view-' + n).hidden = n !== v; });
    document.querySelectorAll('.tabs a').forEach(a => a.setAttribute('aria-current', a.dataset.view === v ? 'page' : 'false'));
    if (v === 'learn') { if (!$('#article').innerHTML) openLesson(libKey); else libChart.render(); }
    if (v === 'trainer' && !trainer.cur) trainer.next();
    if (v === 'analyze') chart.render();
    if (v === 'trainer') trChart.render();
  }
  window.addEventListener('hashchange', route);
  const rerender = () => { chart.render(); trChart.render(); if (libChart.bars.length) openLesson(libKey); };
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', rerender); } catch (e) { /* old browsers */ }
  new MutationObserver(rerender).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => chart.render());

  // boot
  src.value = 's:' + D.samples[0].id;
  loadSample(D.samples[0].id);
  route();
})();
