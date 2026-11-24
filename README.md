# Swing Pattern Lab

A browser app that reads daily (or weekly) stock charts, finds the setups swing traders use, and teaches you each one.

Open `index.html` in a browser. Nothing to install, no build step, no API keys; your data never leaves the browser.

## Install it on your phone (App Library)

The app is an installable web app (PWA): its own icon, full screen, works offline.

1. One-time GitHub setup: make the repository public (GitHub Pages on a private repository needs a paid plan), then **Settings → Pages → Source: GitHub Actions**, and merge this branch into `main`. The workflow in `.github/workflows/pages.yml` publishes the app to `https://<your-user>.github.io/<repo>/`.
2. On iPhone, open that address in **Safari** → **Share** → **Add to Home Screen**. It appears on the Home Screen and in the App Library with the Swing Pattern Lab icon.
3. In the app, open **Data source** and paste your free Twelve Data key (twelvedata.com). It is stored only on that device.

Inside claude.ai the same app uses your Firecrawl connector instead, with real index data (^GSPC, ^NDX, ^IXIC, ^DJI, ^RUT). On Twelve Data's free plan indexes are followed through SPY, QQQ, ONEQ, DIA and IWM, at 8 requests a minute and 800 a day.

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

**Context**: higher-timeframe trend, market regime (S&P 500 vs its 200-day average) and strength against the S&P 500, shown under the chart and in the scan. The backtest found none of them improved results, so they are context, not filters.

**Journal**: log the trades you take (one tap from any setup), close them, and compare your average R per setup with the backtest. Saved privately to your claude.ai account inside claude.ai, on the device in the installed app; exports to CSV.

**Morning scan**: `node scan/daily.js` scans the indexes (via ETFs) and 18 leaders on Twelve Data and prints confirmed breakouts, potential breakouts awaiting their second close, and patterns near their line. A scheduled task runs it each weekday before the US open.

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
js/live.js          live prices: Firecrawl connector (claude.ai) or Twelve Data key (installed app)
js/context.js       higher-timeframe trend, market regime, relative strength
js/journal.js       trade journal storage (claude.ai account or device)
sw.js               offline cache for the installed app
scan/daily.js       daily market scan (Twelve Data)
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
