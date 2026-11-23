# Swing Pattern Lab

A browser app that reads daily (or weekly) stock charts, finds the setups swing traders use, and teaches you each one.

Open `index.html` in a browser. Nothing to install, no build step, no API keys; your data never leaves the browser.

## What it does

**Analyze**: load a CSV export (Yahoo Finance → Historical Data, stooq.com, or your broker) or use the synthetic sample markets. The scanner finds:

| Group | Detected |
|---|---|
| Structure | Swing highs/lows (ATR zig-zag), trend state from the 20/50/200-day averages, higher-high/higher-low structure |
| Levels | Support & resistance clusters with touch counts |
| Trend lines | Rising support and falling resistance lines (≥2–3 touches), tests and breaks |
| Breakouts | Breakouts, breakdowns, and failed breakouts/breakdowns (bull and bear traps) with volume and close-strength checks |
| Chart patterns | Double top/bottom, head & shoulders (and inverse), ascending/descending/symmetrical triangles, rising/falling wedges, channels, rectangles, bull/bear flags |
| Candlesticks | Hammer, hanging man, inverted hammer, shooting star, doji, engulfing, piercing line, dark cloud cover, morning/evening star, three white soldiers / black crows, harami, marubozu, inside bar |

Each setup comes with:
- the drawing on the chart (pattern outline, necklines, trend lines, flags)
- an implied **trade plan** (entry, stop, target from the measured move or next level, reward:risk)
- a **position-size calculator** (account size × risk %)
- a **confirmation checklist** (trend alignment, volume, location at a level, RSI, reward:risk, close confirmation) rolled into a 0–100 quality score
- a short lesson and a link to the full one

**Learn**: 45 lessons (foundations, breakouts, trend lines, reversal and continuation patterns, candlesticks), each covering why it works, how to spot it, what confirms it, how to trade it and the usual mistakes.

**Trainer**: randomized pattern charts to identify. Hard mode hides the breakout so you also have to predict the direction.

**Track record**: how well the scanner recognizes patterns, and how every setup actually performed in a walk-forward backtest on ~190 real S&P 500 price histories (daily, weekly, monthly), compared with random entries. See [BACKTEST.md](BACKTEST.md).

**Live data**: opened in claude.ai with the Firecrawl connector, the app loads live Yahoo Finance prices for any Nasdaq/NYSE stock and the major indexes (S&P 500, Nasdaq-100, Nasdaq Composite, Dow, Russell 2000, plus SPY/QQQ/DIA/IWM), and **Market scan** checks the whole watchlist at once. Elsewhere, load a CSV.

**Breakout confirmation and targets**: a break is *Potential* until a second close confirms it; every setup gets a target ladder (Fibonacci 1.272/1.618/2.0/2.618 and the measured move) with backtested hit rates.

**Timeframes**: Daily, Weekly and Monthly. **Backtest this chart** replays the scanner bar by bar over any loaded stock.

## How detection works

Everything is measured in ATR (14-day average true range), so the same rules work for any price or volatility. `js/patterns.js` is commented rule by rule.

## Files

```
index.html          app shell
css/app.css         styles (light + dark)
js/indicators.js    SMA, EMA, RSI, ATR
js/data.js          CSV parser, weekly resampling, synthetic markets, pattern templates
js/patterns.js      detection engine → signals with plan + checklist
js/backtest.js      walk-forward backtest core (app + offline study)
js/live.js          live prices via the Firecrawl connector
icons/              app icon (SVG source + PNG sizes), manifest.webmanifest
js/trackrecord.js   generated backtest results shown in the app
js/chart.js         canvas candlestick chart (zoom, pan, overlays)
js/learn.js         lesson content
js/app.js           UI
test/run.js         engine smoke test: node test/run.js
backtest/           data fetch, recognition test, walk-forward study, visual audit (see BACKTEST.md)
```

## Disclaimer

Educational tool, not financial advice. Patterns describe tendencies, not certainties.
