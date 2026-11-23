// Offline walk-forward: same core as the app's "Backtest this chart" (js/backtest.js).
global.SPI = require('../js/indicators.js');
global.SPP = require('../js/patterns.js');
const B = require('../js/backtest.js');
function walk(series, tf, rng) {
  const st = { rng, ctrlN: 5 };
  B.walk(series.bars, tf, st, null, null);
  return st.events.map(e => Object.assign(e, { ticker: series.ticker, set: series.set, tf }));
}
module.exports = { walk, simulate: B.simulate, TF: B.TF };
