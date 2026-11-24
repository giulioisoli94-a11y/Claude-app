/* Trade journal storage. Inside claude.ai: the artifact's private per-person
   store (data/users/<id>/…; nobody else, the owner included, can read it).
   Installed on its own: this device's local storage. */
(function (root) {
  const J = {};
  const LS = 'spl.journal';
  let backend = null; // {kind, list(), put(t), del(id)}

  async function useDb() {
    try {
      if (!root.claude || !root.claude.use) return null;
      const [db, user] = await Promise.all([root.claude.use('db'), root.claude.use('user')]);
      if (!db || !user) return null;
      const id = await user.id();
      if (!id) return null;
      const col = db.collection('data/users/' + id);
      return {
        kind: 'account',
        async list() { const snap = await col.get(); return snap.docs.map(d => Object.assign({ id: d.id }, d.data())).filter(t => t && t.sym); },
        async put(t) { const { id: tid, ...rest } = t; await col.doc(tid).set(rest); },
        async del(tid) { await col.doc(tid).delete(); },
      };
    } catch (e) { return null; }
  }
  const local = {
    kind: 'device',
    async list() { try { return JSON.parse(localStorage.getItem(LS) || '[]'); } catch (e) { return []; } },
    async put(t) { const all = await local.list(); const i = all.findIndex(x => x.id === t.id); if (i >= 0) all[i] = t; else all.push(t); localStorage.setItem(LS, JSON.stringify(all)); },
    async del(id) { const all = (await local.list()).filter(x => x.id !== id); localStorage.setItem(LS, JSON.stringify(all)); },
  };
  J.backend = async function () {
    if (!backend) backend = (await Promise.race([useDb(), new Promise(r => setTimeout(() => r(null), 4000))])) || local;
    return backend;
  };
  J.list = async () => (await (await J.backend()).list()).sort((a, b) => String(b.entryDate).localeCompare(String(a.entryDate)) || (b.createdAt || 0) - (a.createdAt || 0));
  J.save = async t => { if (!t.id) t.id = 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); t.createdAt = t.createdAt || Date.now(); await (await J.backend()).put(t); return t; };
  J.remove = async id => (await J.backend()).del(id);

  // R multiple, P&L and % return of a closed trade.
  J.result = function (t) {
    if (t.exit == null || t.exit === '' || !isFinite(+t.exit)) return null;
    const risk = Math.abs(+t.entry - +t.stop);
    const move = t.dir * (+t.exit - +t.entry);
    return { r: risk > 0 ? move / risk : null, pnl: move * (+t.shares || 0), pct: move / +t.entry * 100 };
  };
  J.stats = function (trades) {
    const closed = trades.map(t => ({ t, x: J.result(t) })).filter(o => o.x);
    const rs = closed.map(o => o.x.r).filter(r => r != null);
    return {
      total: trades.length, open: trades.length - closed.length, closed: closed.length,
      win: closed.length ? closed.filter(o => o.x.pnl > 0 || (o.x.r || 0) > 0).length / closed.length : null,
      avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
      pnl: closed.reduce((a, o) => a + o.x.pnl, 0),
    };
  };
  J.csv = function (trades) {
    const cols = ['sym', 'dir', 'setup', 'tf', 'entryDate', 'entry', 'stop', 'target', 'shares', 'exitDate', 'exit', 'notes'];
    const q = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return cols.join(',') + ',R,PnL\n' + trades.map(t => { const x = J.result(t); return cols.map(c => q(c === 'dir' ? (t.dir > 0 ? 'long' : 'short') : t[c])).join(',') + ',' + (x && x.r != null ? x.r.toFixed(2) : '') + ',' + (x ? x.pnl.toFixed(2) : ''); }).join('\n');
  };
  root.SPJ = J;
})(window);
