# How the scanner was tested

Two questions, tested separately:

1. **Recognition.** Does the scanner name a pattern correctly when one is there?
2. **Outcome.** When it fires on real stocks, does the setup do better than chance?

Reproduce everything with:

```
./backtest/fetch.sh          # ~190 real price histories from public GitHub datasets
node backtest/accuracy.js    # recognition test on planted patterns
node backtest/run.js         # walk-forward backtest, daily + weekly + monthly (~2 min, all cores)
node backtest/report.js      # tables + js/trackrecord.js used by the app
node backtest/filters.js     # in-sample vs out-of-sample filter check
node backtest/gallery.js D kind:chart 12 out.png   # contact sheet of real detections for visual review
```

## 1. Recognition

Each pattern template is planted into a synthetic chart with a lead-in trend, random proportions and four noise levels (60 examples per cell). "Named correctly" = the right pattern reported over the planted window.

| Pattern | Low | Medium | High | Extreme | Break bar right |
|---|---|---|---|---|---|
| Head & shoulders / inverse | 100% | 100% | 100% | 95–97% | 100% |
| Bull / bear flag | 85–87% | 83–85% | 88–90% | 78–88% | 94–98% |
| Double top / bottom | 95–97% | 77–88% | 67–82% | 62–72% | 98–100% |
| Ascending / descending triangle | 82–92% | 70–72% | 48–53% | 37–38% | 95–98% |
| Symmetrical triangle | 73% | 63% | 42% | 35% | 97% |
| Rising / falling wedge | 75–82% | 67–68% | 50–67% | 40–57% | 90–98% |
| **Average** | **88%** | **79%** | **72%** | **64%** | |

Triangles and wedges are the hardest because, in noise, they really do resemble other shapes (a symmetrical triangle's last two lows often form a valid double bottom).

**False alarms.** On pure random-walk prices the scanner still reports about 48 confirmed pattern breaks per 1,000 bars. Random prices form these shapes, and a human eye sees them too. This is the main reason a shape alone is weak evidence.

### Visual audit

Random samples of real detections were rendered as contact sheets (daily, weekly, monthly) and reviewed by eye. Issues found and fixed:

- triangles/wedges anchored on one distant swing → lines must be drawn through swings spread over ≥45% of the pattern, ≥5 swings total
- breaks counted at or past the apex → must break before 80% of the way to the apex
- patterns "breaking" years after they formed (e.g. a 2003 head & shoulders "breaking" in 2009) → break must come within about one pattern-length
- channels/rectangles from two touches per side (too easy by chance) → three per side
- the newest unconfirmed swing (often the breakout bar) bending the lines → converging shapes use confirmed swings only
- "flat" lines that sloped 10%+ on monthly charts → flat also means < 3% of price
- lopsided head & shoulders → shoulders balanced in time (≤ 2.5× ratio), neckline slope limited
- stops tighter than daily noise → minimum stop distance 0.75 ATR
- channel lines cut off at an "apex" in the past; monthly date labels; duplicated labels

## 2. Outcome (walk-forward)

- **Data:** ~95 S&P 500 stocks 2000–2012 (QSTK Yahoo dataset) and ~93 stocks 2016–2020, split/dividend adjusted. Weekly/monthly bars built from daily.
- **No look-ahead:** at every bar the scanner sees only a trailing window (300 daily / 260 weekly / 200 monthly bars). A setup is traded only on the bar where it first appears.
- **Execution:** breaks and confirmed patterns enter at the next open; candle and trend-line setups need price to reach the trigger within 3 bars. Exit at stop, target, or after 40 / 26 / 12 bars. Stop assumed first if both hit in one bar. No costs.
- **Random control:** for every trade, 5 random entries in the same stock and direction with the same stop/target distances (in ATR). **Edge = setup average − random average.** Without this, long setups look good simply because stocks rose.
- **Out-of-sample:** rules were tuned while looking at 2000–2012; 2016–2020 is the check.

### Results (final engine; 148,146 trades)

| Timeframe | Trades | Avg result | Random entries |
|---|---|---|---|
| Daily | 122,532 | −0.01R | +0.00R |
| Weekly | 22,280 | +0.01R | +0.03R |
| Monthly | 3,334 | +0.04R | +0.04R |

- **As a group, the patterns did not beat random entries** on any timeframe. This is consistent with academic studies of classical chart patterns on large US stocks.
- **Beat random (95% interval above zero):** daily double top (+0.12R, n = 1,571, positive in both periods); weekly failed breakdown (+0.06R); monthly breakdown and bullish engulfing (small samples).
- **Worse than random:** rising-channel bounces on every timeframe; daily bull flag, hanging man, shooting star, three white soldiers, bullish marubozu, plain breakouts; weekly hammer, inverted hammer, bear flag.
- **Volume:** breaks on ≥ 1.5× average volume beat weak-volume breaks in 7 of 8 comparisons (patterns and level breaks × daily and weekly × two periods), by up to 0.16R per trade. Modest but consistent, the only checklist item that was.
- **Checklist score / trend alignment:** neither separated winners from losers once compared with random entries in the same direction.

Full per-setup tables are in the app's **Track record** tab and in each lesson.

## Limits

Large US stocks only, two periods, simple fixed exits, no costs. "No measurable edge" means the setup did not predict direction better than chance here. It can still be a sound way to place a stop and a target.
