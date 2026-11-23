// Runs the walk-forward backtest over all series and timeframes in parallel.
// Output: backtest/out/events.json (every event) — summarized by report.js.
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const fs = require('fs'), path = require('path'), os = require('os');

if (isMainThread) {
  const { loadAll, D } = require('./load.js');
  const all = loadAll();
  const jobs = [];
  for (const s of all) {
    jobs.push({ ticker: s.ticker, set: s.set, tf: 'D', bars: s.daily });
    jobs.push({ ticker: s.ticker, set: s.set, tf: 'W', bars: D.toWeekly(s.daily) });
    jobs.push({ ticker: s.ticker, set: s.set, tf: 'M', bars: D.toMonthly(s.daily) });
  }
  const only = process.argv[2]; // optional tf filter
  const q = jobs.filter(j => !only || j.tf === only);
  const total = q.length; let done = 0; const events = [];
  const N = Math.max(1, os.cpus().length);
  const t0 = Date.now();
  let active = 0;
  const startOne = () => {
    if (!q.length) { if (!active) finish(); return; }
    const job = q.shift(); active++;
    const w = new Worker(__filename, { workerData: job });
    w.on('message', ev => { events.push(...ev); });
    w.on('error', e => { console.error(job.ticker, job.tf, e); });
    w.on('exit', () => { active--; done++; if (done % 40 === 0) console.log(`${done}/${total} ${((Date.now() - t0) / 1000).toFixed(0)}s`); startOne(); });
  };
  const finish = () => {
    fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
    fs.writeFileSync(path.join(__dirname, 'out', 'events' + (only ? '-' + only : '') + '.json'), JSON.stringify(events));
    console.log('events', events.length, 'in', ((Date.now() - t0) / 1000).toFixed(0) + 's');
  };
  for (let i = 0; i < N; i++) startOne();
} else {
  const { walk } = require('./walk.js');
  const D = require('../js/data.js');
  let seed = 0; for (const ch of workerData.ticker + workerData.tf) seed = seed * 31 + ch.charCodeAt(0);
  parentPort.postMessage(walk(workerData, workerData.tf, D.rng(seed >>> 0)));
}
