/* Canvas candlestick chart with volume and RSI panes, overlays, zoom and pan. */
(function (root) {
  const css = (el, name) => getComputedStyle(el).getPropertyValue(name).trim();

  class ChartView {
    constructor(canvas, opts) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.o = Object.assign({ interactive: true, volume: true, rsi: true, axes: true, sma: [20, 50, 200], levels: true, trendlines: true, candleMarks: true, patterns: true, rightPad: 12 }, opts || {});
      this.bars = []; this.an = null; this.sel = null; this.hover = -1; this.extra = [];
      this.from = 0; this.to = 0;
      this.onPick = null;
      if (this.o.interactive) this._wire();
      this._ro = new ResizeObserver(() => this.render());
      this._ro.observe(canvas);
    }

    setData(bars, analysis, keepView) {
      this.bars = bars; this.an = analysis;
      if (!keepView || this.to === 0) this.resetView();
      this.render();
    }
    resetView() {
      const n = this.bars.length;
      const show = Math.min(n, this.o.initialBars || 140);
      this.to = n - 1 + this.o.rightPad;
      this.from = Math.max(0, n - show);
    }
    setSelected(sig) { this.sel = sig; if (sig && sig.start != null && sig.start < this.from) { this.from = Math.max(0, sig.start - 10); } this.render(); }
    setOverlays(list) { this.extra = list || []; this.render(); }

    _wire() {
      const cv = this.cv;
      let drag = null;
      cv.addEventListener('wheel', e => {
        e.preventDefault();
        const r = cv.getBoundingClientRect();
        const fx = (e.clientX - r.left - this.L.left) / this.L.w;
        const span = this.to - this.from;
        const ns = Math.max(25, Math.min(this.bars.length + this.o.rightPad, span * (e.deltaY > 0 ? 1.15 : 0.87)));
        const anchor = this.from + span * Math.min(1, Math.max(0, fx));
        this.from = anchor - ns * fx; this.to = this.from + ns;
        this._clamp(); this.render();
      }, { passive: false });
      cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, from: this.from, to: this.to, moved: false }; cv.setPointerCapture(e.pointerId); });
      cv.addEventListener('pointermove', e => {
        const r = cv.getBoundingClientRect();
        if (drag) {
          const dx = e.clientX - drag.x;
          if (Math.abs(dx) > 3) drag.moved = true;
          const per = (drag.to - drag.from) / this.L.w;
          this.from = drag.from - dx * per; this.to = drag.to - dx * per;
          this._clamp();
        }
        this.hover = this._idxAt(e.clientX - r.left);
        this.render();
      });
      cv.addEventListener('pointerup', e => {
        const r = cv.getBoundingClientRect();
        if (drag && !drag.moved && this.onPick) {
          const i = this._idxAt(e.clientX - r.left);
          this.onPick(i);
        }
        drag = null;
      });
      cv.addEventListener('pointerleave', () => { this.hover = -1; this.render(); });
      cv.addEventListener('dblclick', () => { this.resetView(); this.render(); });
    }
    zoom(f) {
      const span = this.to - this.from;
      const ns = Math.max(25, Math.min(this.bars.length + this.o.rightPad, span * f));
      this.from = this.to - ns; this._clamp(); this.render();
    }
    pan(bars) { this.from += bars; this.to += bars; this._clamp(); this.render(); }
    _clamp() {
      const n = this.bars.length, span = this.to - this.from;
      if (this.to > n - 1 + this.o.rightPad) { this.to = n - 1 + this.o.rightPad; this.from = this.to - span; }
      if (this.from < -2) { this.from = -2; this.to = this.from + span; }
    }
    _idxAt(px) {
      if (!this.L) return -1;
      const i = Math.floor(this.from + (px - this.L.left) / this.L.bw);
      return i >= 0 && i < this.bars.length ? i : -1;
    }

    colors() {
      const el = this.cv;
      return {
        bg: css(el, '--chart-bg') || '#fff', grid: css(el, '--chart-grid') || '#eee', text: css(el, '--fg-muted') || '#666',
        fg: css(el, '--fg') || '#111', up: css(el, '--up') || '#16a34a', down: css(el, '--down') || '#dc2626',
        accent: css(el, '--accent') || '#2563eb', accent2: css(el, '--accent-2') || '#a16207',
        s20: css(el, '--ma20') || '#888', s50: css(el, '--ma50') || '#555', s200: css(el, '--ma200') || '#222',
        sup: css(el, '--support') || '#0e7490', res: css(el, '--resistance') || '#b45309', panel: css(el, '--surface') || '#fff',
      };
    }

    render() {
      const cv = this.cv, ctx = this.ctx;
      const dpr = window.devicePixelRatio || 1;
      const W = cv.clientWidth, H = cv.clientHeight;
      if (!W || !H) return;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const C = this.colors();
      ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
      const bars = this.bars;
      if (!bars.length) return;
      const o = this.o;
      const axisW = o.axes ? 58 : 4, bottomH = o.axes ? 20 : 4;
      const left = 4, w = W - left - axisW;
      const volH = o.volume ? Math.round((H - bottomH) * 0.14) : 0;
      const rsiH = o.rsi ? Math.round((H - bottomH) * 0.16) : 0;
      const top = o.axes ? 22 : 6;
      const priceH = H - bottomH - volH - rsiH - top - (volH ? 6 : 0) - (rsiH ? 8 : 0);
      const span = this.to - this.from;
      const bw = w / (span + 1);
      const X = i => left + (i - this.from + 0.5) * bw;
      this.L = { left, w, bw };
      const i0 = Math.max(0, Math.floor(this.from)), i1 = Math.min(bars.length - 1, Math.ceil(this.to));

      // y-range
      let lo = Infinity, hi = -Infinity;
      for (let i = i0; i <= i1; i++) { lo = Math.min(lo, bars[i].l); hi = Math.max(hi, bars[i].h); }
      if (this.sel && this.sel.plan) {
        for (const v of [this.sel.plan.stop, this.sel.plan.target, this.sel.plan.entry]) {
          if (v > 0 && v < hi * 1.35 && v > lo * 0.65) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
        }
      }
      const padY = (hi - lo) * 0.07 || 1;
      lo -= padY; hi += padY;
      const Y = p => top + (hi - p) / (hi - lo) * priceH;
      this.Y = Y; this.X = X;

      // grid + price axis
      ctx.font = '11px ' + (css(cv, '--font-mono') || 'monospace');
      ctx.textBaseline = 'middle';
      const step = niceStep((hi - lo) / Math.max(3, Math.floor(priceH / 48)));
      ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
      for (let p = Math.ceil(lo / step) * step; p <= hi; p += step) {
        const y = Math.round(Y(p)) + 0.5;
        ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(left + w, y); ctx.stroke();
        if (o.axes) { ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.fillText(fmtP(p, step), left + w + 6, y); }
      }
      // date axis
      if (o.axes) {
        ctx.textAlign = 'center'; ctx.fillStyle = C.text;
        const every = Math.max(1, Math.round(80 / bw));
        for (let i = Math.ceil(i0 / every) * every; i <= i1; i += every) {
          const x = X(i);
          ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, top); ctx.lineTo(Math.round(x) + 0.5, H - bottomH); ctx.stroke();
          ctx.fillText(shortDate(bars[i].t), x, H - bottomH / 2);
        }
      }

      ctx.save();
      ctx.beginPath(); ctx.rect(left, top, w, priceH); ctx.clip();

      const sel = this.sel;
      // trade plan zones
      if (sel && sel.plan) {
        const pl = sel.plan;
        const xs = X(Math.max(sel.i, i0)) , xe = left + w;
        const long = pl.target > pl.entry;
        ctx.globalAlpha = 0.13;
        ctx.fillStyle = C.up; ctx.fillRect(xs, Math.min(Y(pl.entry), Y(pl.target)), xe - xs, Math.abs(Y(pl.target) - Y(pl.entry)));
        ctx.fillStyle = C.down; ctx.fillRect(xs, Math.min(Y(pl.entry), Y(pl.stop)), xe - xs, Math.abs(Y(pl.stop) - Y(pl.entry)));
        ctx.globalAlpha = 1;
        hl(ctx, xs, xe, Y(pl.target), C.up, [5, 4], 'Target ' + fmtP(pl.target), long ? 'above' : 'below');
        hl(ctx, xs, xe, Y(pl.entry), C.fg, [2, 3], 'Entry ' + fmtP(pl.entry), long ? 'above' : 'below');
        hl(ctx, xs, xe, Y(pl.stop), C.down, [5, 4], 'Stop ' + fmtP(pl.stop), long ? 'below' : 'above');
      }

      // S/R levels
      if (o.levels && this.an) {
        for (const L of this.an.keyLevels) {
          const y = Y(L.price);
          ctx.strokeStyle = L.role === 'support' ? C.sup : C.res;
          ctx.globalAlpha = Math.min(0.85, 0.3 + L.touches * 0.12);
          ctx.lineWidth = L.touches >= 3 ? 1.6 : 1;
          ctx.setLineDash([6, 4]);
          ctx.beginPath(); ctx.moveTo(Math.max(left, X(L.first) - bw), y); ctx.lineTo(left + w, y); ctx.stroke();
          ctx.setLineDash([]); ctx.globalAlpha = 1;
        }
      }

      // moving averages
      if (this.an && o.sma) {
        const map = { 20: ['sma20', C.s20], 50: ['sma50', C.s50], 200: ['sma200', C.s200] };
        for (const p of o.sma) {
          const [k, col] = map[p]; const arr = this.an.ind[k];
          ctx.strokeStyle = col; ctx.lineWidth = p === 200 ? 1.8 : 1.3; ctx.beginPath();
          let st = false;
          for (let i = i0; i <= i1; i++) { if (arr[i] == null) continue; const x = X(i), y = Y(arr[i]); if (!st) { ctx.moveTo(x, y); st = true; } else ctx.lineTo(x, y); }
          ctx.stroke();
        }
      }

      // candles
      const cw = Math.max(1, Math.min(14, bw * 0.68));
      const hlSet = sel ? [sel.start, sel.i] : null;
      for (let i = i0; i <= i1; i++) {
        const b = bars[i], x = X(i), upB = b.c >= b.o;
        let col = upB ? C.up : C.down;
        const dim = hlSet && sel.kind === 'candle' && (i < hlSet[0] || i > hlSet[1]);
        ctx.globalAlpha = dim ? 0.45 : 1;
        ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, Y(b.h)); ctx.lineTo(Math.round(x) + 0.5, Y(b.l)); ctx.stroke();
        const yO = Y(b.o), yC = Y(b.c);
        const bh = Math.max(1, Math.abs(yC - yO));
        if (upB && cw > 3) { ctx.fillStyle = C.bg; ctx.fillRect(x - cw / 2, Math.min(yO, yC), cw, bh); ctx.strokeRect(x - cw / 2 + 0.5, Math.min(yO, yC) + 0.5, cw - 1, Math.max(0, bh - 1)); }
        else ctx.fillRect(x - cw / 2, Math.min(yO, yC), cw, bh);
      }
      ctx.globalAlpha = 1;

      // trend lines
      if (o.trendlines && this.an && !sel) {
        for (const side of ['support', 'resistance']) {
          const tl = this.an.trendlines[side]; if (!tl) continue;
          const endI = tl.brk === -1 ? bars.length - 1 + 6 : tl.brk + 4;
          ctx.strokeStyle = side === 'support' ? C.sup : C.res; ctx.lineWidth = 1.6; ctx.globalAlpha = 0.9;
          ctx.beginPath(); ctx.moveTo(X(tl.A.i), Y(tl.A.price)); ctx.lineTo(X(endI), Y(tl.at(endI))); ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }

      // overlays: selected signal, or the top chart patterns
      const ovs = [];
      if (sel) ovs.push({ list: sel.overlay, strong: true, col: biasColor(sel.bias, C) });
      else if (o.patterns && this.an) this.an.signals.filter(s => s.kind === 'chart' && s.status !== 'failed').slice(0, 2).forEach(s => ovs.push({ list: s.overlay, strong: false, col: biasColor(s.bias, C) }));
      for (const e of this.extra) ovs.push(e);
      for (const g of ovs) drawOverlay(ctx, g.list || [], X, Y, bw, g.col, g.strong, C, left + w);

      // candle markers
      if (o.candleMarks && this.an) {
        const P = root.SPP;
        for (const cd of this.an.candles) {
          if (cd.i < i0 || cd.i > i1) continue;
          const bias = P.CANDLE_BIAS[cd.key];
          if (bias === 'neutral') continue;
          const b = bars[cd.i], x = X(cd.i);
          const isSel = sel && sel.kind === 'candle' && sel.i === cd.i;
          ctx.fillStyle = bias === 'bull' ? C.up : C.down;
          ctx.globalAlpha = isSel ? 1 : 0.75;
          const s = Math.max(3, Math.min(5, bw * 0.4));
          if (bias === 'bull') tri(ctx, x, Y(b.l) + 6 + s, s, 1); else tri(ctx, x, Y(b.h) - 6 - s, s, -1);
          ctx.globalAlpha = 1;
        }
      }
      ctx.restore();

      // volume pane
      if (volH) {
        const vt = top + priceH + 6;
        let vmax = 0; for (let i = i0; i <= i1; i++) vmax = Math.max(vmax, bars[i].v || 0);
        ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(left, vt - 3 + 0.5); ctx.lineTo(left + w, vt - 3 + 0.5); ctx.stroke();
        if (vmax > 0) {
          for (let i = i0; i <= i1; i++) {
            const b = bars[i], h = (b.v || 0) / vmax * (volH - 4);
            ctx.fillStyle = b.c >= b.o ? C.up : C.down; ctx.globalAlpha = 0.45;
            ctx.fillRect(X(i) - cw / 2, vt + volH - h, cw, h);
          }
          ctx.globalAlpha = 1;
          if (this.an) {
            const vs = this.an.ind.volSma; ctx.strokeStyle = C.text; ctx.lineWidth = 1; ctx.beginPath(); let st = false;
            for (let i = i0; i <= i1; i++) { if (vs[i] == null) continue; const y = vt + volH - vs[i] / vmax * (volH - 4); if (!st) { ctx.moveTo(X(i), y); st = true; } else ctx.lineTo(X(i), y); }
            ctx.stroke();
          }
          if (o.axes) { ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.fillText('Vol', left + w + 6, vt + 8); }
        }
      }
      // RSI pane
      if (rsiH && this.an) {
        const rt = top + priceH + (volH ? 6 + volH : 0) + 8;
        const RY = v => rt + (100 - v) / 100 * rsiH;
        ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(left, rt - 4 + 0.5); ctx.lineTo(left + w, rt - 4 + 0.5); ctx.stroke();
        ctx.fillStyle = C.accent; ctx.globalAlpha = 0.07; ctx.fillRect(left, RY(70), w, RY(30) - RY(70)); ctx.globalAlpha = 1;
        ctx.setLineDash([3, 3]); ctx.strokeStyle = C.text; ctx.globalAlpha = 0.5;
        for (const v of [30, 70]) { ctx.beginPath(); ctx.moveTo(left, RY(v)); ctx.lineTo(left + w, RY(v)); ctx.stroke(); }
        ctx.setLineDash([]); ctx.globalAlpha = 1;
        const r = this.an.ind.rsi; ctx.strokeStyle = C.accent; ctx.lineWidth = 1.3; ctx.beginPath(); let st = false;
        for (let i = i0; i <= i1; i++) { if (r[i] == null) continue; if (!st) { ctx.moveTo(X(i), RY(r[i])); st = true; } else ctx.lineTo(X(i), RY(r[i])); }
        ctx.stroke();
        if (o.axes) { ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.fillText('RSI', left + w + 6, rt + 6); ctx.fillText('70', left + w + 6, RY(70)); ctx.fillText('30', left + w + 6, RY(30)); }
      }

      // crosshair + legend
      if (o.axes) {
        const i = this.hover >= 0 ? this.hover : bars.length - 1;
        const b = bars[i];
        if (this.hover >= 0) {
          const x = Math.round(X(i)) + 0.5;
          ctx.strokeStyle = C.text; ctx.globalAlpha = 0.5; ctx.setLineDash([3, 3]);
          ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, H - bottomH); ctx.stroke();
          ctx.setLineDash([]); ctx.globalAlpha = 1;
        }
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        const chg = i > 0 ? (b.c / bars[i - 1].c - 1) * 100 : 0;
        const parts = [[b.t, C.text], ['O ' + fmtP(b.o), C.fg], ['H ' + fmtP(b.h), C.fg], ['L ' + fmtP(b.l), C.fg], ['C ' + fmtP(b.c), C.fg], [(chg >= 0 ? '+' : '') + chg.toFixed(2) + '%', chg >= 0 ? C.up : C.down]];
        if (b.v) parts.push(['V ' + fmtV(b.v), C.text]);
        let x = left + 4;
        for (const [t, col] of parts) {
          if (x + ctx.measureText(t).width > left + w) break;
          ctx.fillStyle = col; ctx.fillText(t, x, 11); x += ctx.measureText(t).width + 10;
        }
        // last price tag
        const lc = bars[bars.length - 1].c, ly = Y(lc);
        if (ly > top && ly < top + priceH) {
          const lastUp = lc >= bars[bars.length - 1].o;
          ctx.fillStyle = lastUp ? C.up : C.down; ctx.fillRect(left + w + 1, ly - 8, axisW - 2, 16);
          ctx.fillStyle = C.bg; ctx.fillText(fmtP(lc), left + w + 6, ly);
        }
      }
    }
  }

  function biasColor(b, C) { return b === 'bull' ? C.up : b === 'bear' ? C.down : C.accent; }
  function hl(ctx, x0, x1, y, col, dash, label, side) {
    ctx.strokeStyle = col; ctx.setLineDash(dash); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = col; ctx.textAlign = 'right';
    ctx.fillText(label, x1 - 4, side === 'above' ? y - 8 : y + 9);
  }
  function tri(ctx, x, y, s, dir) {
    ctx.beginPath();
    if (dir > 0) { ctx.moveTo(x, y - s); ctx.lineTo(x - s, y + s * 0.8); ctx.lineTo(x + s, y + s * 0.8); }
    else { ctx.moveTo(x, y + s); ctx.lineTo(x - s, y - s * 0.8); ctx.lineTo(x + s, y - s * 0.8); }
    ctx.closePath(); ctx.fill();
  }
  function label(ctx, text, x, y, col, C, below) {
    if (!text) return;
    ctx.font = '600 11px ' + (css(ctx.canvas, '--font-ui') || 'sans-serif');
    const w = ctx.measureText(text).width + 8;
    const yy = below ? y + 12 : y - 12;
    ctx.fillStyle = C.panel; ctx.globalAlpha = 0.88; ctx.fillRect(x - w / 2, yy - 8, w, 16); ctx.globalAlpha = 1;
    ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.strokeRect(x - w / 2 + 0.5, yy - 7.5, w - 1, 15);
    ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, yy + 0.5);
    ctx.font = '11px ' + (css(ctx.canvas, '--font-mono') || 'monospace');
  }
  function drawOverlay(ctx, list, X, Y, bw, col, strong, C, xMax) {
    ctx.globalAlpha = strong ? 1 : 0.6;
    for (const s of list) {
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = strong ? 2 : 1.4;
      if (s.t === 'poly') {
        ctx.beginPath();
        s.pts.forEach((p, j) => (j ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))));
        ctx.stroke();
        s.pts.forEach((p, j) => {
          ctx.beginPath(); ctx.arc(X(p[0]), Y(p[1]), 3, 0, 7); ctx.fill();
          if (s.labels && s.labels[j] && strong) {
            const isHigh = (j > 0 && p[1] > s.pts[j - 1][1]) || (j === 0 && s.pts[1] && p[1] > s.pts[1][1]);
            label(ctx, s.labels[j], X(p[0]), Y(p[1]), col, C, !isHigh);
          }
        });
      } else if (s.t === 'line') {
        ctx.beginPath(); ctx.moveTo(X(s.x1), Y(s.y1)); ctx.lineTo(X(s.x2), Y(s.y2)); ctx.stroke();
        if (s.label && strong) label(ctx, s.label, Math.min(X(s.x2) - 30, xMax - 60), Y(s.y2), col, C, s.label === 'Lower' || /support|Neck/i.test(s.label));
      } else if (s.t === 'hline') {
        ctx.setLineDash([7, 4]);
        ctx.beginPath(); ctx.moveTo(X(s.from), Y(s.y)); ctx.lineTo(Math.min(xMax, X(s.to) + bw * 6), Y(s.y)); ctx.stroke();
        ctx.setLineDash([]);
        if (s.label && strong) label(ctx, s.label, X(s.from) + 50, Y(s.y), col, C, false);
      } else if (s.t === 'box') {
        ctx.globalAlpha = strong ? 0.14 : 0.08;
        ctx.fillRect(X(s.from) - bw / 2, Y(s.hi), (s.to - s.from + 1) * bw, Y(s.lo) - Y(s.hi));
        ctx.globalAlpha = strong ? 1 : 0.6;
        ctx.strokeRect(X(s.from) - bw / 2, Y(s.hi), (s.to - s.from + 1) * bw, Y(s.lo) - Y(s.hi));
        if (s.label && strong) label(ctx, s.label, X((s.from + s.to) / 2), Y(s.hi), col, C, false);
      } else if (s.t === 'dots') {
        for (const p of s.pts) { ctx.beginPath(); ctx.arc(X(p[0]), Y(p[1]), 3.2, 0, 7); ctx.fill(); }
      } else if (s.t === 'marker') {
        const y = s.dir > 0 ? Y(s.p) - 10 : Y(s.p) + 10;
        tri(ctx, X(s.i), y, 5, s.dir > 0 ? -1 : 1);
        if (s.label && strong) label(ctx, s.label, X(s.i), y, col, C, s.dir < 0);
      }
    }
    ctx.globalAlpha = 1;
  }
  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p;
    return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
  }
  function fmtP(x, step) {
    if (step) { const d = Math.max(0, -Math.floor(Math.log10(step))); return x.toFixed(Math.min(4, d)); }
    return root.SPP ? root.SPP.fmt(x) : x.toFixed(2);
  }
  function fmtV(v) { return v >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : String(v); }
  function shortDate(t) {
    const d = new Date(t);
    if (!isFinite(d)) return String(t).slice(0, 10);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  root.ChartView = ChartView;
})(window);
