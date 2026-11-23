/* The library: what each pattern is, why it works, how to confirm it, how a
   swing trader plans the trade, and the mistakes people make with it. */
(function (root) {
  // Candle diagrams: [open, high, low, close]; ctx = trend drawn before them.
  const L = {};

  /* ---------------- concepts ---------------- */
  L.swing_structure = {
    title: 'Market structure: swings', cat: 'Foundations', bias: 'neutral',
    short: 'Every chart is a sequence of swing highs and swing lows. Their order tells you the trend before any indicator does.',
    why: 'An uptrend exists when buyers keep stepping in at higher prices (higher lows) and keep pushing to new highs (higher highs). When a rally fails below the last high and the next dip breaks the last low, control has changed hands.',
    spot: ['Higher highs + higher lows = uptrend; lower highs + lower lows = downtrend.', 'A lower high inside an uptrend is the first warning; a lower low confirms it.', 'This app finds swings with a zig-zag filter: a swing only counts once price reverses by 1.5 ATR from it.'],
    confirm: ['Use closes, not intraday wicks, to judge whether a swing level broke.', 'Check one timeframe higher (weekly for a daily swing trade).'],
    trade: ['Buy pullbacks to a higher low in an uptrend; short rallies to a lower high in a downtrend.', 'Put the stop beyond the swing point that would break the structure.'],
    mistakes: ['Calling a trend change on the first lower high.', 'Ignoring that small swings inside a big trend are noise.'],
    diagram: { tpl: null, path: [[0, 80], [8, 92], [5, 86], [8, 98], [5, 92], [8, 106], [5, 99], [7, 103], [6, 94], [5, 99], [6, 88]] },
  };
  L.support_resistance = {
    title: 'Support & resistance', cat: 'Foundations', bias: 'neutral',
    short: 'Prices where buying (support) or selling (resistance) has repeatedly appeared. The more touches, the more traders are watching.',
    why: 'People remember prices. Buyers who missed a bounce at 50 place orders there next time; sellers who bought at 60 and suffered want out at break-even. Those orders cluster, so price reacts there again.',
    spot: ['Cluster swing highs and lows that sit within about half an ATR of each other.', 'Two touches make a level; three or more make an important one.', 'Old resistance often becomes support after a breakout (role reversal).'],
    confirm: ['Watch for rejection candles (hammers, shooting stars, engulfings) at the level.', 'Volume drying up as price approaches, then rising as it bounces.'],
    trade: ['Buy near support with a stop just below it; target the next resistance.', 'If the level breaks on a close, stop thinking of it as support.'],
    mistakes: ['Drawing a line through every wick. Levels are zones, not exact prices.', 'Buying support in a strong downtrend: levels break more often when the trend is against you.'],
    diagram: { path: [[0, 90], [6, 100], [6, 92], [6, 100.5], [6, 91.5], [6, 99.8], [5, 92.2], [6, 100.2], [5, 96]] , lines: [{ y: 100, label: 'Resistance' }, { y: 92, label: 'Support' }] },
  };
  L.trend = {
    title: 'Trend & moving averages', cat: 'Foundations', bias: 'neutral',
    short: 'The 20-, 50- and 200-day averages summarize short, medium and long trend. Swing trades work best in the direction they point.',
    why: 'Institutions size positions over weeks and months, which creates persistent trends. Averages smooth the noise so you can see which way that flow runs.',
    spot: ['Bullish stack: price > 20 > 50 > 200, all rising.', 'Bearish stack: price < 20 < 50 < 200, all falling.', 'Tangled averages = range; pattern trades get less follow-through.'],
    confirm: ['Rising 50-day with price above the 200-day is the classic swing-long filter.'],
    trade: ['In uptrends, pullbacks to the 20- or 50-day are common entry zones.', 'Use the trend as a filter: take bullish patterns in uptrends and bearish ones in downtrends.'],
    mistakes: ['Trading every crossover. Averages lag; they confirm, they do not predict.'],
    diagram: { path: [[0, 70], [10, 80], [5, 77], [10, 88], [5, 85], [10, 96], [5, 92], [10, 104]] },
  };
  L.volume = {
    title: 'Volume confirmation', cat: 'Foundations', bias: 'neutral',
    short: 'Volume shows conviction. Breaks on heavy volume tend to do better than breaks on light volume. In our backtest the difference was real but modest.',
    why: 'A move through a level needs new money. When volume is 1.5–2× its 20-day average, large participants are acting. On light volume, a few orders can push price through and then it falls back.',
    spot: ['Compare the break-bar volume with the 20-day average line in the volume pane.', 'Volume should shrink during consolidations (flags, triangles) and expand on the break.'],
    confirm: ['This app counts 1.5× average or more as confirmation and 1.1–1.5× as partial.'],
    trade: ['Prefer breakouts with volume; size down or wait for a retest when volume is light.'],
    mistakes: ['Reading volume on thin, illiquid stocks where one trade distorts everything.'],
    diagram: { tpl: 'asc_triangle' },
  };
  L.rsi = {
    title: 'RSI & momentum', cat: 'Foundations', bias: 'neutral',
    short: 'RSI(14) measures how hard price has pushed recently on a 0–100 scale. Above 70 is stretched up; below 30 is stretched down.',
    why: 'After a burst, many short-term traders take profits, so moves often pause. A breakout entry with RSI at 80 is buying after most of the move has happened.',
    spot: ['In strong uptrends RSI tends to stay in a 40–80 band; in downtrends, 20–60.', 'Divergence: price makes a new high while RSI makes a lower high, so momentum is fading.'],
    confirm: ['Use RSI as a filter for timing, not as a standalone signal.'],
    trade: ['When RSI is stretched, wait for a pullback or a flag instead of chasing.'],
    mistakes: ['Shorting just because RSI is above 70. Strong stocks stay overbought for weeks.'],
    diagram: { path: [[0, 80], [12, 100], [4, 97], [6, 104], [4, 101], [5, 105], [6, 98]] },
  };
  L.risk_reward = {
    title: 'Risk, reward & position size', cat: 'Foundations', bias: 'neutral',
    short: 'Decide where you are wrong (stop) and where you take profit (target) before you enter. Size the position so the stop costs a fixed slice of your account.',
    why: 'Patterns fail often. With a 2:1 reward-to-risk ratio you can be right 40% of the time and still make money. Fixed-fraction sizing (for example 1% of the account per trade) keeps a losing streak survivable.',
    spot: ['Risk per share = entry − stop. Shares = (account × risk %) ÷ risk per share.', 'Reward/risk = (target − entry) ÷ (entry − stop).'],
    confirm: ['Skip trades below about 1.5:1 unless the setup quality is exceptional.'],
    trade: ['Put stops where the pattern is proven wrong, not at a round dollar amount.', 'Consider taking part of the position off at 1R or 2R and trailing the rest.'],
    mistakes: ['Widening the stop after entry.', 'Sizing by conviction instead of by distance to the stop.'],
    diagram: { tpl: 'bull_flag' },
  };

  L.evidence = {
    title: 'Patterns are plans, not predictions', cat: 'Foundations', bias: 'neutral',
    short: 'We tested every setup in this app on real stocks. As a group they did about as well as random entries with the same stop and target. What they give you is structure: a clear trigger, a place to be wrong and a target.',
    why: 'Markets are mostly noise over days and weeks. Random price paths form double tops, triangles and flags all the time, so a shape on its own carries little information. What helped in our test was modest: breaks on strong volume did better than breaks on weak volume. Beyond that, the value of a pattern is the discipline it brings: a defined trigger, stop and target, and position sizes that survive a losing streak.',
    spot: ['Check the Track record box on every setup: trades, win rate, average R and how random entries did.', 'A setup that "beat random" in both test periods deserves more trust than one that did well in only one.', 'Small samples (under ~100 trades) swing a lot; read them as hints.'],
    confirm: ['Prefer breaks on 1.5× average volume or more. It was the one checklist item that made a repeatable difference, though a modest one.', 'Prefer the setups the backtest marks as beating random on your timeframe.'],
    trade: ['Use the pattern to define the trade: entry trigger, stop where the idea is wrong, target from the measured move.', 'Risk a fixed small fraction per trade (for example 1%), because many setups lose.', 'Run "Backtest this chart" on a stock before trading its patterns, to see how they behaved on it.'],
    mistakes: ['Believing a pattern "means" price will go somewhere.', 'Trusting a win rate without comparing it with what random entries would have done in the same market.'],
    diagram: { tpl: 'double_top' },
  };

  L.targets = {
    title: 'Measured moves & Fibonacci targets', cat: 'Foundations', bias: 'neutral',
    short: 'Two ways to set a take-profit before you enter: project the pattern\'s own height (the measured move), or extend the breakout swing by Fibonacci ratios (1.272, 1.618, 2.0, 2.618).',
    why: 'A breakout releases the energy stored in the range or pattern, so moves often travel a distance related to the size of what was broken. Fibonacci extensions are widely watched, so many traders take profits there, which makes them self-fulfilling to a degree. Neither is a law; both give you a target fixed in advance, which is what matters for reward-to-risk.',
    spot: ['Measured move: pattern height (e.g. head to neckline, flag pole, triangle width) added to the breakout point.', 'Fibonacci extension: take the swing from the base\'s low to the breakout level; 1.272 adds 27% of it beyond the level, 1.618 adds 62%, 2.0 a full equal move, 2.618 a 162% move.', 'Fibonacci retracement (38.2%, 50%, 61.8%) of the breakout leg marks where pullbacks often find buyers: a zone for adding or re-entering.'],
    confirm: ['Targets that line up with an old support or resistance level are more likely to stall price.', 'Check the hit rate the app shows next to each target: in the backtest the nearest (Fib 1.272) was reached about two times in three, the 2.618 about one in five.'],
    trade: ['Scale out: take part at the nearest target and move the stop to break-even, let the rest run to the measured move.', 'Only take trades where the first realistic target pays at least as much as you risk.', 'Re-measure if the pattern changes: targets come from the pattern, not from hope.'],
    mistakes: ['Holding for the 2.618 extension on every trade. It is rarely reached.', 'Using a far target to make a poor reward-to-risk look good.'],
    diagram: { tpl: 'bull_flag' },
  };

  /* ---------------- breakouts ---------------- */
  L.breakout = {
    title: 'Breakout', cat: 'Breakouts', bias: 'bull',
    short: 'A close above a resistance level that has capped price several times.',
    why: 'Sellers at that level have been absorbed. Short sellers with stops above it are forced to buy, and breakout traders join in, so the move can accelerate.',
    spot: ['Resistance tested at least twice.', 'A decisive close above it (not just a wick), ideally in the top third of the bar.'],
    confirm: ['A second close above the level. In our backtest almost half of all breaks closed back inside within five bars; waiting for the second close filtered out a good share of them, which is why the app calls a break "potential" until then.', 'Volume at least 1.5× average on the break: the strongest confirmation.', 'A pullback to the old resistance that holds as support (the retest) is the textbook second entry.'],
    trade: ['Entry: after the second close above the level, or on the retest.', 'Stop: about 1 ATR below the broken level.', 'Target: the next resistance, or the height of the prior range added to the breakout.'],
    mistakes: ['Buying an intraday poke that closes back inside.', 'Chasing a breakout that is already 3+ ATR above the level.'],
    diagram: { tpl: 'asc_triangle' },
  };
  L.breakdown = {
    title: 'Breakdown', cat: 'Breakouts', bias: 'bear',
    short: 'A close below a support level that has held several times.',
    why: 'Buyers who defended the level are now underwater; their stop-losses and exits add supply and push price lower.',
    spot: ['Support tested at least twice.', 'A decisive close below it, ideally near the bar\'s low.'],
    confirm: ['A second close below the level; until then it is only a potential breakdown.', 'Heavy volume on the break.', 'A failed bounce back up to the level (old support acting as resistance).'],
    trade: ['Long traders: exit or avoid. Short traders: enter on the close or on the retest.', 'Stop: about 1 ATR above the broken level.', 'Target: the next support below.'],
    mistakes: ['Buying the dip into a broken level because it "used to be support".'],
    diagram: { tpl: 'desc_triangle' },
  };
  L.failed_breakout = {
    title: 'Failed breakout (bull trap)', cat: 'Breakouts', bias: 'bear',
    short: 'Price closes above resistance, then quickly closes back below it. Buyers who chased are trapped.',
    why: 'Trapped buyers sell to cut losses as price falls back into the range, which adds fuel to the move down. A failed move in one direction often leads to a fast move in the other.',
    spot: ['A breakout bar, then within a few bars a close back under the level.', 'Often on light breakout volume or with a long upper wick.'],
    confirm: ['A strong bearish candle on the return inside the range.', 'Momentum (RSI) rolling over from above 60.'],
    trade: ['Shorts: enter on the close back inside, stop above the failed-breakout high, target the range low.', 'Longs: this is your signal to exit, not to average down.'],
    mistakes: ['Hoping the breakout will "come back". The fast reversal is the information.'],
    diagram: { path: [[0, 92], [6, 100], [6, 93], [6, 100], [4, 94], [5, 100.3], [2, 103.5], [2, 99], [5, 92]], lines: [{ y: 100, label: 'Resistance' }] },
  };
  L.failed_breakdown = {
    title: 'Failed breakdown (bear trap)', cat: 'Breakouts', bias: 'bull',
    short: 'Price closes below support, then reclaims it. Sellers are trapped and often have to buy back.',
    why: 'Short sellers who pressed the break must cover as price climbs back above the level, and buyers who were stopped out often re-enter. Some of the sharpest swing rallies start this way.',
    spot: ['A close below support, then within a few bars a close back above it.'],
    confirm: ['A bullish engulfing or hammer on the reclaim.', 'Rising volume on the reclaim bar.'],
    trade: ['Entry on the reclaim close; stop below the low of the failed break; target the top of the range.'],
    mistakes: ['Assuming every dip below support is a trap. Wait for the reclaim close.'],
    diagram: { path: [[0, 108], [6, 100], [6, 107], [6, 100], [4, 106], [5, 99.7], [2, 96.5], [2, 101], [5, 108]], lines: [{ y: 100, label: 'Support' }] },
  };

  /* ---------------- trend lines ---------------- */
  L.trendline_support = {
    title: 'Trend line support', cat: 'Trend lines', bias: 'bull',
    short: 'A rising line through at least two (better three) higher lows. Price coming back to it is a classic pullback entry.',
    why: 'In an orderly uptrend, buyers step in at progressively higher prices. The line traces that rhythm; each successful test reinforces it.',
    spot: ['Connect swing lows, not random wicks.', 'Three touches make the line meaningful; the third touch is the tradeable one.', 'Steep lines break sooner than shallow ones.'],
    confirm: ['A bullish reversal candle on the touch (hammer, engulfing).', 'Volume falling into the touch, rising off it.'],
    trade: ['Entry: as price turns up from the line.', 'Stop: below the line by about 0.5–1 ATR.', 'Target: the prior swing high.'],
    mistakes: ['Redrawing the line after it breaks so it "still holds".'],
    diagram: { path: [[0, 80], [8, 92], [5, 85], [8, 98], [5, 91], [8, 104], [5, 97], [5, 101]], diag: [[0, 80, 23, 97.5]] },
  };
  L.trendline_resistance = {
    title: 'Trend line resistance', cat: 'Trend lines', bias: 'bear',
    short: 'A falling line through lower highs. Rallies into it are where sellers have been showing up.',
    why: 'In a downtrend each rally stalls at a lower price as holders use strength to sell. The line maps where that supply has appeared.',
    spot: ['Connect at least two lower swing highs.', 'Look for the third test.'],
    confirm: ['A bearish candle (shooting star, bearish engulfing) at the line.'],
    trade: ['Longs: avoid buying under a falling line; wait for a break.', 'Shorts: enter on the rejection, stop above the line, target the prior low.'],
    mistakes: ['Buying "because it\'s cheap" right under a falling trend line.'],
    diagram: { path: [[0, 120], [8, 108], [5, 115], [8, 102], [5, 109], [8, 96], [5, 103], [5, 98]], diag: [[0, 120, 23, 103.5]] },
  };
  L.trendline_break = {
    title: 'Trend line break', cat: 'Trend lines', bias: 'neutral',
    short: 'A close through a well-tested trend line. It is an early warning that the trend is changing, not proof that it has reversed.',
    why: 'The line represented the pace of the trend. Breaking it means that pace has stalled. Often the next step is sideways, and a full reversal needs a broken swing level too.',
    spot: ['Close (not wick) beyond the line by a meaningful margin (this app uses 0.35 ATR).'],
    confirm: ['A lower high (after an uptrend line break) or higher low (after a downtrend line break).', 'The broken line acting as resistance/support on a retest.'],
    trade: ['Take profits on trades that relied on the line.', 'New trades in the other direction work best after the swing structure also flips.'],
    mistakes: ['Treating every trend line break as a reversal signal.'],
    diagram: { path: [[0, 80], [8, 92], [5, 85], [8, 98], [5, 91], [8, 102], [6, 90], [4, 93], [4, 86]], diag: [[0, 80, 21, 94]] },
  };

  /* ---------------- chart patterns ---------------- */
  L.double_top = {
    title: 'Double top', cat: 'Reversal patterns', bias: 'bear',
    short: 'Two peaks at roughly the same price with a dip (the neckline) between them. Confirmed when price closes below the neckline.',
    why: 'Buyers had two chances to push past the same price and failed both times. When the neckline (the low between the peaks) breaks, everyone who bought the second peak is losing money.',
    spot: ['A prior uptrend into the first top.', 'Second top within about 1 ATR of the first.', 'Dip between them of at least 2.5 ATR and at least 4% of price.'],
    confirm: ['A close below the neckline. Before that it is only a pullback.', 'Higher volume on the breakdown; second peak often has lower volume than the first.'],
    trade: ['Entry: close below the neckline or a failed retest of it.', 'Stop: midway back into the pattern, or above the second peak for the conservative version.', 'Target: neckline minus the pattern height.'],
    mistakes: ['Shorting the second peak before the neckline breaks. Many "double tops" become breakouts.'],
    diagram: { tpl: 'double_top' },
  };
  L.double_bottom = {
    title: 'Double bottom', cat: 'Reversal patterns', bias: 'bull',
    short: 'Two troughs at about the same price with a rally between them. Confirmed by a close above that rally high (the neckline).',
    why: 'Sellers pushed to the same low twice and could not break it. A close above the neckline shows buyers are now in control.',
    spot: ['A prior downtrend into the first low.', 'Second low within about 1 ATR of the first (a slight undercut that reverses is fine).', 'Rally between them of at least 2.5 ATR and at least 4% of price.'],
    confirm: ['A close above the neckline on strong volume.'],
    trade: ['Entry: on the neckline break or the retest.', 'Stop: midway into the pattern (about 2:1 reward/risk) or below the lows (closer to 1:1).', 'Target: neckline plus the pattern height.'],
    mistakes: ['Buying the second low with no confirmation in a strong downtrend.'],
    diagram: { tpl: 'double_bottom' },
  };
  L.head_shoulders = {
    title: 'Head & shoulders top', cat: 'Reversal patterns', bias: 'bear',
    short: 'Three peaks, the middle one (head) highest, the outer two (shoulders) lower and similar. A close below the neckline completes it.',
    why: 'The head is the last new high. The right shoulder is a rally that fails below it: the first lower high. Breaking the neckline adds a lower low. Structure has flipped from up to down.',
    spot: ['Head clearly above both shoulders (1+ ATR).', 'Shoulders roughly symmetrical in price.', 'Neckline through the two lows; it can slope.'],
    confirm: ['A close below the neckline; volume often rises on the break.', 'A pullback to the neckline that fails is a second entry.'],
    trade: ['Entry: neckline break or failed retest.', 'Stop: above the right shoulder.', 'Target: neckline minus the head-to-neckline height.'],
    mistakes: ['Anticipating the pattern before the right shoulder forms.', 'Ignoring a sharply upward-sloping neckline, which weakens the pattern.'],
    diagram: { tpl: 'head_shoulders' },
  };
  L.inv_head_shoulders = {
    title: 'Inverse head & shoulders', cat: 'Reversal patterns', bias: 'bull',
    short: 'The bullish mirror image: three troughs, the middle one lowest. A close above the neckline completes it.',
    why: 'The right shoulder is the first higher low after a downtrend. The neckline break adds a higher high, so the trend structure turns up.',
    spot: ['Head clearly below both shoulders.', 'Similar shoulder lows.', 'Prior downtrend.'],
    confirm: ['Close above the neckline on rising volume.'],
    trade: ['Entry: neckline break or retest.', 'Stop: below the right shoulder.', 'Target: neckline plus the head-to-neckline height.'],
    mistakes: ['Buying the head itself, which is just a new low in a downtrend.'],
    diagram: { tpl: 'inv_head_shoulders' },
  };
  L.asc_triangle = {
    title: 'Ascending triangle', cat: 'Continuation patterns', bias: 'bull',
    short: 'A flat ceiling with rising lows. Buyers are getting more aggressive while sellers defend a fixed price.',
    why: 'Each dip is bought at a higher price, squeezing the sellers at resistance. When their supply runs out, price breaks through, often fast.',
    spot: ['At least two highs at the same level.', 'At least two rising lows.', 'Volume contracting as the triangle narrows.'],
    confirm: ['A close above the flat top with volume expansion.'],
    trade: ['Entry: on the breakout close.', 'Stop: below the last higher low.', 'Target: the triangle\'s height at its widest, added to the breakout.'],
    mistakes: ['Buying near the ceiling before it breaks.', 'Ignoring a break to the downside. A good share of ascending triangles break down, and then the break is the signal.'],
    diagram: { tpl: 'asc_triangle' },
  };
  L.desc_triangle = {
    title: 'Descending triangle', cat: 'Continuation patterns', bias: 'bear',
    short: 'A flat floor with falling highs. Sellers are getting more aggressive while buyers defend a fixed price.',
    why: 'Each rally is sold at a lower price. Eventually the buyers at support are exhausted and the floor gives way.',
    spot: ['At least two lows at the same level.', 'At least two lower highs.'],
    confirm: ['A close below the floor with volume.'],
    trade: ['Entry: on the breakdown close.', 'Stop: above the last lower high.', 'Target: triangle height subtracted from the breakdown.'],
    mistakes: ['Buying the floor a fourth or fifth time as the highs keep dropping.'],
    diagram: { tpl: 'desc_triangle' },
  };
  L.sym_triangle = {
    title: 'Symmetrical triangle', cat: 'Continuation patterns', bias: 'neutral',
    short: 'Lower highs and higher lows converging. A pause where both sides are waiting; the break decides the direction.',
    why: 'Volatility contracts as neither buyers nor sellers commit. Contraction tends to be followed by expansion. It usually resolves in the direction of the prior trend, but not reliably enough to guess.',
    spot: ['Falling upper line and rising lower line, at least two touches each.', 'Volume drying up.'],
    confirm: ['A close outside either line, ideally well before the apex.'],
    trade: ['Trade the break, not the prediction.', 'Stop: back inside the triangle beyond the last swing.', 'Target: height at the widest part, projected from the break.'],
    mistakes: ['Trading breaks very close to the apex; those often fizzle.'],
    diagram: { tpl: 'sym_triangle' },
  };
  L.rising_wedge = {
    title: 'Rising wedge', cat: 'Reversal patterns', bias: 'bear',
    short: 'Both lines slope up, but the lower one rises faster: higher highs are getting smaller. Usually breaks down.',
    why: 'Price is still climbing but each push gains less ground. Momentum is fading, and when the rising support breaks, the drop is often quick.',
    spot: ['Both trend lines rising and converging.', 'RSI often making lower highs (divergence).'],
    confirm: ['A close below the lower line.'],
    trade: ['Entry: on the close below the lower line.', 'Stop: above the last swing high inside the wedge.', 'Target: the start of the wedge.'],
    mistakes: ['Shorting while the lower line is still intact.'],
    diagram: { tpl: 'rising_wedge' },
  };
  L.falling_wedge = {
    title: 'Falling wedge', cat: 'Reversal patterns', bias: 'bull',
    short: 'Both lines slope down, but the upper one falls faster: new lows are getting smaller. Usually breaks up.',
    why: 'Sellers keep pushing to new lows but each push gains less ground. When the falling resistance breaks, short covering can drive a sharp rally.',
    spot: ['Both trend lines falling and converging.', 'Bullish RSI divergence is common.'],
    confirm: ['A close above the upper line with volume.'],
    trade: ['Entry: on the breakout close.', 'Stop: below the last swing low.', 'Target: the top of the wedge.'],
    mistakes: ['Buying inside the wedge because "it must break up".'],
    diagram: { tpl: 'falling_wedge' },
  };
  L.channel_up = {
    title: 'Rising channel', cat: 'Continuation patterns', bias: 'bull',
    short: 'Price moving up between two roughly parallel rising lines.',
    why: 'An orderly trend: buyers enter near the lower line, profit-takers sell near the upper one.',
    spot: ['Parallel rising lines with at least two touches each.'],
    confirm: ['Bounces from the lower line with bullish candles.'],
    trade: ['Classic approach: buy near the lower line, stop below it, target the upper line.', 'Our backtest does not support buying the lower line blindly: it did worse than random entries on daily, weekly and monthly charts. Wait for a bullish reversal candle on strong volume at the line, or treat the channel only as a map of where the trend is.', 'A close below the lower line ends the setup.'],
    mistakes: ['Buying the lower line just because it was touched.', 'Buying at the upper line in the middle of the channel\'s range.'],
    diagram: { path: [[0, 80], [6, 90], [5, 85], [6, 95], [5, 90], [6, 100], [5, 95], [6, 105]] },
  };
  L.channel_down = {
    title: 'Falling channel', cat: 'Continuation patterns', bias: 'bear',
    short: 'Price moving down between two roughly parallel falling lines.',
    why: 'An orderly decline: sellers use rallies to the upper line to exit.',
    spot: ['Parallel falling lines with at least two touches each.'],
    confirm: ['Rejections at the upper line.'],
    trade: ['Avoid longs until it breaks out; shorts sell near the upper line.'],
    mistakes: ['Bottom-picking at the lower line in a downtrend.'],
    diagram: { path: [[0, 120], [6, 110], [5, 115], [6, 105], [5, 110], [6, 100], [5, 105], [6, 95]] },
  };
  L.rectangle = {
    title: 'Rectangle (range)', cat: 'Continuation patterns', bias: 'neutral',
    short: 'Flat support and flat resistance with price bouncing between them.',
    why: 'Buyers and sellers are in balance. The longer the range, the bigger the eventual move when one side wins.',
    spot: ['At least two touches on each side.'],
    confirm: ['A decisive close outside the range with volume.'],
    trade: ['Range traders buy the floor and sell the ceiling with tight stops.', 'Breakout traders target the range height projected from the break.'],
    mistakes: ['Trading the middle of the range, where reward/risk is worst.'],
    diagram: { path: [[0, 92], [6, 100], [6, 92], [6, 100], [6, 92], [6, 100], [6, 92], [5, 98]] , lines: [{ y: 100, label: '' }, { y: 92, label: '' }] },
  };
  L.bull_flag = {
    title: 'Bull flag', cat: 'Continuation patterns', bias: 'bull',
    short: 'A sharp rally (the pole) followed by a short, tight pullback (the flag). A break above the flag often resumes the rally.',
    why: 'The pole shows urgent buying. The flag is profit-taking that cannot push price far back, because buyers are waiting below. Light volume in the flag shows sellers are not committed.',
    spot: ['Pole: a fast move of 4+ ATR in under ~15 bars.', 'Flag: 4–16 bars, retracing less than half the pole, drifting sideways or slightly down.', 'Volume shrinking in the flag.'],
    confirm: ['A close above the flag high with volume expansion.'],
    trade: ['Entry: above the flag high.', 'Stop: below the flag low.', 'Target: pole height added to the breakout.'],
    mistakes: ['Calling a deep, slow pullback a flag. If it gives back more than half the pole, it is something else.'],
    diagram: { tpl: 'bull_flag' },
  };
  L.bear_flag = {
    title: 'Bear flag', cat: 'Continuation patterns', bias: 'bear',
    short: 'A sharp drop followed by a weak, tight bounce. A break below the flag often resumes the decline.',
    why: 'The drop shows urgent selling. The bounce is short covering without real buying interest, so it stalls quickly.',
    spot: ['Pole: fast decline of 4+ ATR.', 'Flag: short, shallow bounce on light volume.'],
    confirm: ['A close below the flag low.'],
    trade: ['Entry: below the flag low.', 'Stop: above the flag high.', 'Target: pole height subtracted from the break.'],
    mistakes: ['Buying the bounce as a "bottom".'],
    diagram: { tpl: 'bear_flag' },
  };

  /* ---------------- candlesticks ---------------- */
  const dn = 'down', up = 'up';
  L.hammer = {
    title: 'Hammer', cat: 'Candlesticks', bias: 'bull',
    short: 'After a decline: a small body near the top of the bar with a long lower wick (at least 2× the body).',
    why: 'Sellers pushed price well down during the session, but buyers drove it back up to close near the high. The selling was rejected.',
    spot: ['Lower wick ≥ 2× the body, little or no upper wick.', 'Must come after a decline; the same shape after a rally is a hanging man.'],
    confirm: ['Next bar trades above the hammer\'s high.', 'Forms at support, a trend line or a key average.'],
    trade: ['Entry: above the hammer high. Stop: below the hammer low. Target: the next resistance.'],
    mistakes: ['Trading hammers in the middle of nowhere. Without a level, it is just a bar.'],
    diagram: { ctx: dn, c: [[100, 100.5, 95, 99.6]] },
  };
  L.hanging_man = {
    title: 'Hanging man', cat: 'Candlesticks', bias: 'bear',
    short: 'Same shape as a hammer but after a rally. It warns that sellers showed up intraday.',
    why: 'The long lower wick shows a sharp sell-off during the session. Buyers recovered it, but the fact that it happened at a high is a warning.',
    spot: ['Hammer shape after an advance.'],
    confirm: ['Needs a lower close next bar; on its own it is a weak signal.'],
    trade: ['Tighten stops on longs; shorts only after confirmation below the low.'],
    mistakes: ['Shorting a strong uptrend on a single hanging man.'],
    diagram: { ctx: up, c: [[100, 100.6, 95.2, 99.8]] },
  };
  L.inverted_hammer = {
    title: 'Inverted hammer', cat: 'Candlesticks', bias: 'bull',
    short: 'After a decline: small body at the bottom with a long upper wick. Buyers tested higher.',
    why: 'Buyers pushed price up for the first time in a while. They did not hold it, but the attempt matters if the next bar follows through.',
    spot: ['Upper wick ≥ 2× body, small lower wick, after a decline.'],
    confirm: ['A strong bullish next bar closing above the body.'],
    trade: ['Entry above the high; stop below the low.'],
    mistakes: ['Treating it as strong on its own. It needs confirmation more than a hammer does.'],
    diagram: { ctx: dn, c: [[99.5, 104, 99.2, 100]] },
  };
  L.shooting_star = {
    title: 'Shooting star', cat: 'Candlesticks', bias: 'bear',
    short: 'After a rally: small body near the low with a long upper wick. Buyers were rejected.',
    why: 'Price surged intraday but sellers slammed it back down to near the open. At resistance this is one of the clearest rejection signals.',
    spot: ['Upper wick ≥ 2× body, little lower wick, after an advance.'],
    confirm: ['Next bar closes below the star\'s body.', 'Forms at resistance.'],
    trade: ['Longs: take profits or tighten stops. Shorts: below the low, stop above the high.'],
    mistakes: ['Ignoring it right at a well-tested resistance.'],
    diagram: { ctx: up, c: [[100, 105, 99.6, 100.4]] },
  };
  L.doji = {
    title: 'Doji', cat: 'Candlesticks', bias: 'neutral',
    short: 'Open and close almost equal. Indecision: neither side won the session.',
    why: 'After a strong move, a doji shows the push has paused. It is a warning, not a direction.',
    spot: ['Body ≤ 10% of the bar\'s range.'],
    confirm: ['The next bar\'s break above or below the doji shows which side won.'],
    trade: ['Use it to tighten stops or prepare an entry in the direction of the following break.'],
    mistakes: ['Treating every doji as a reversal.'],
    diagram: { ctx: up, c: [[100, 102.5, 97.5, 100.1]] },
  };
  L.bull_engulfing = {
    title: 'Bullish engulfing', cat: 'Candlesticks', bias: 'bull',
    short: 'After a decline: a bullish bar whose body completely covers the prior bearish body.',
    why: 'Sellers controlled yesterday; today buyers erased all of it and more. The shift in control is visible in one bar.',
    spot: ['Prior bar bearish, current bar bullish.', 'Current body opens at or below the prior close and closes at or above the prior open.'],
    confirm: ['At support, with above-average volume.', 'Follow-through above the high.'],
    trade: ['Entry above the high; stop below the pattern low; target the next resistance.'],
    mistakes: ['Taking it mid-range, in a strong downtrend, on low volume.'],
    diagram: { ctx: dn, c: [[101, 101.4, 98.6, 99], [98.6, 102.6, 98.3, 102.3]] },
  };
  L.bear_engulfing = {
    title: 'Bearish engulfing', cat: 'Candlesticks', bias: 'bear',
    short: 'After a rally: a bearish bar whose body completely covers the prior bullish body.',
    why: 'Buyers controlled yesterday; today sellers overwhelmed them. At resistance this often marks a swing high.',
    spot: ['Prior bar bullish, current bar bearish and larger.'],
    confirm: ['At resistance, with volume. Follow-through below the low.'],
    trade: ['Shorts below the low with a stop above the high. Longs: take profits.'],
    mistakes: ['Ignoring the context. In a strong uptrend many engulfings just start a small pullback.'],
    diagram: { ctx: up, c: [[99, 101.3, 98.7, 101], [101.4, 101.7, 97.6, 97.8]] },
  };
  L.piercing = {
    title: 'Piercing line', cat: 'Candlesticks', bias: 'bull',
    short: 'After a big bearish bar, the next bar opens lower but closes above the middle of that bar.',
    why: 'The lower open lures in more sellers, then buyers reclaim more than half the prior loss.',
    spot: ['Prior bar: long bearish body.', 'Current: opens below the prior close, closes above its midpoint (but below its open).'],
    confirm: ['Next bar trades higher; at support.'],
    trade: ['Entry above the high; stop below the low.'],
    mistakes: ['Confusing it with a weak bounce that closes below the midpoint.'],
    diagram: { ctx: dn, c: [[102, 102.3, 97.8, 98], [97.4, 100.8, 97.1, 100.6]] },
  };
  L.dark_cloud = {
    title: 'Dark cloud cover', cat: 'Candlesticks', bias: 'bear',
    short: 'After a big bullish bar, the next bar opens higher but closes below the middle of that bar.',
    why: 'Buyers gap it up, then sellers take back more than half of the prior gain.',
    spot: ['Long bullish bar, then a bar opening above its close and closing below its midpoint.'],
    confirm: ['Next bar lower; at resistance.'],
    trade: ['Shorts below the low; longs tighten stops.'],
    mistakes: ['Overreacting in a strong trend without a resistance level nearby.'],
    diagram: { ctx: up, c: [[98, 102.2, 97.8, 102], [102.6, 102.9, 99.2, 99.4]] },
  };
  L.morning_star = {
    title: 'Morning star', cat: 'Candlesticks', bias: 'bull',
    short: 'Three bars: a big bearish bar, a small "star" bar, then a big bullish bar closing well into the first.',
    why: 'Selling, then hesitation, then buyers take over. The pattern shows the shift over three sessions.',
    spot: ['Bar 1 long bearish; bar 2 small body below bar 1\'s close; bar 3 bullish closing above bar 1\'s midpoint.'],
    confirm: ['At support with rising volume on bar 3.'],
    trade: ['Entry above bar 3; stop below the star\'s low.'],
    mistakes: ['Accepting a weak bar 3 that barely closes into bar 1.'],
    diagram: { ctx: dn, c: [[103, 103.3, 98.8, 99], [98.6, 99.2, 97.6, 98.4], [98.8, 102.6, 98.6, 102.4]] },
  };
  L.evening_star = {
    title: 'Evening star', cat: 'Candlesticks', bias: 'bear',
    short: 'Three bars: a big bullish bar, a small star, then a big bearish bar closing well into the first.',
    why: 'Buying, then hesitation, then sellers take over.',
    spot: ['Bar 1 long bullish; bar 2 small body above bar 1\'s close; bar 3 bearish closing below bar 1\'s midpoint.'],
    confirm: ['At resistance; volume on bar 3.'],
    trade: ['Shorts below bar 3; stop above the star\'s high. Longs: take profits.'],
    mistakes: ['Ignoring a strong underlying uptrend.'],
    diagram: { ctx: up, c: [[97, 101.2, 96.8, 101], [101.3, 102.3, 100.9, 101.6], [101.2, 101.4, 97.4, 97.6]] },
  };
  L.three_soldiers = {
    title: 'Three white soldiers', cat: 'Candlesticks', bias: 'bull',
    short: 'Three strong bullish bars in a row, each closing higher near its high.',
    why: 'Sustained buying pressure over several sessions, not a one-day spike.',
    spot: ['Three bullish bars with solid bodies and small upper wicks, each opening inside the prior body.'],
    confirm: ['Most useful coming off a base or support.'],
    trade: ['Often better to wait for a pullback: the third soldier can leave price stretched.'],
    mistakes: ['Buying the close of the third bar with RSI above 75.'],
    diagram: { ctx: dn, c: [[96, 98.2, 95.8, 98], [97.6, 100.2, 97.4, 100], [99.6, 102.3, 99.4, 102.1]] },
  };
  L.three_crows = {
    title: 'Three black crows', cat: 'Candlesticks', bias: 'bear',
    short: 'Three strong bearish bars in a row, each closing lower near its low.',
    why: 'Sustained selling over several sessions, often marking the start of a down-leg.',
    spot: ['Three bearish bars with solid bodies and small lower wicks.'],
    confirm: ['Most meaningful after a rally or at resistance.'],
    trade: ['Longs exit; shorts often wait for a weak bounce to sell.'],
    mistakes: ['Shorting the third bar when price is already at support.'],
    diagram: { ctx: up, c: [[104, 104.2, 101.8, 102], [102.4, 102.6, 99.8, 100], [100.4, 100.6, 97.7, 97.9]] },
  };
  L.bull_harami = {
    title: 'Bullish harami', cat: 'Candlesticks', bias: 'bull',
    short: 'A small bullish bar contained inside the prior large bearish body.',
    why: 'Selling momentum stalls: the new bar cannot even reach the prior range. It is a pause that can become a reversal.',
    spot: ['Large bearish bar, then a small body inside its body.'],
    confirm: ['Next bar closes above the harami high.'],
    trade: ['Entry above the high of the pair; stop below the low.'],
    mistakes: ['Treating it as strong as an engulfing; it is a weaker signal.'],
    diagram: { ctx: dn, c: [[103, 103.2, 98.8, 99], [99.6, 101.2, 99.3, 100.8]] },
  };
  L.bear_harami = {
    title: 'Bearish harami', cat: 'Candlesticks', bias: 'bear',
    short: 'A small bearish bar contained inside the prior large bullish body.',
    why: 'Buying momentum stalls after a strong bar.',
    spot: ['Large bullish bar, then a small body inside its body.'],
    confirm: ['Next bar closes below the harami low.'],
    trade: ['Longs tighten stops; shorts wait for the break.'],
    mistakes: ['Shorting on the harami alone.'],
    diagram: { ctx: up, c: [[97, 101.2, 96.8, 101], [100.4, 100.7, 98.8, 99.2]] },
  };
  L.bull_marubozu = {
    title: 'Bullish marubozu', cat: 'Candlesticks', bias: 'bull',
    short: 'A long bullish bar with almost no wicks: it opened at the low and closed at the high.',
    why: 'Buyers controlled the session from start to finish. Breakouts on bars like this tend to hold.',
    spot: ['Body ≥ 90% of the range and much larger than average.'],
    confirm: ['Best as a breakout bar through resistance.'],
    trade: ['A shallow pullback into the bar\'s upper half is often a good entry.'],
    mistakes: ['Chasing a marubozu far above any level.'],
    diagram: { ctx: dn, c: [[97, 103.1, 96.9, 103]] },
  };
  L.bear_marubozu = {
    title: 'Bearish marubozu', cat: 'Candlesticks', bias: 'bear',
    short: 'A long bearish bar with almost no wicks: sellers controlled the whole session.',
    why: 'No intraday bounce at all, so there was no buying interest.',
    spot: ['Body ≥ 90% of the range and much larger than average.'],
    confirm: ['Most significant when it breaks support.'],
    trade: ['Longs exit; shorts sell a weak bounce into the bar.'],
    mistakes: ['Buying it as "oversold".'],
    diagram: { ctx: up, c: [[103, 103.1, 96.9, 97]] },
  };
  L.inside_bar = {
    title: 'Inside bar', cat: 'Candlesticks', bias: 'neutral',
    short: 'A bar whose high and low are inside the prior bar\'s range. Volatility contraction.',
    why: 'The market is pausing. A break of the inside bar\'s range often starts the next move, and it gives a tight, defined stop.',
    spot: ['High below the prior high and low above the prior low.'],
    confirm: ['Trade the break in the direction of the trend.'],
    trade: ['Buy above the high (uptrend) with a stop below the low, or the reverse in a downtrend.'],
    mistakes: ['Trading inside bars against the trend.'],
    diagram: { ctx: up, c: [[98, 102.5, 97.5, 102], [101.5, 102, 99.5, 100.6]] },
  };

  // display order
  const ORDER = ['Foundations', 'Breakouts', 'Trend lines', 'Reversal patterns', 'Continuation patterns', 'Candlesticks'];
  root.SPL = { entries: L, ORDER };
  if (typeof module !== 'undefined') module.exports = root.SPL;
})(typeof window !== 'undefined' ? window : globalThis);
