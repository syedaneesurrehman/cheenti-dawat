// Cheenti Dawat — puzzle engine.
// Pure logic, no DOM: shared by the game, the level generator and tools/verify.mjs.
//
// Rules
// - The board is a grid of food pixels (colour index) or EMPTY.
// - Ants climb up from the nest under the board, so they can only reach the
//   lowest piece left in each column. Closed tiffin lids stop a column.
// - Tapping a lane front sends that colony. Its ants bite reachable pieces of
//   their colour one at a time (nearest to the nest first); each bite can uncover
//   the piece above. Ice pieces take two bites.
// - A colony that runs out of reachable pieces with ants left waits in the
//   thaal (tray) until you tap it again.
// - More colonies in the thaal than it has slots: level lost. All pieces eaten: won.

export const EMPTY = -1;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ---------- reach ----------

// blocked(i): the cell stops the climb.  edible(i): the cell can be bitten.
export function climbMask(w, h, blocked, edible) {
  const exp = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    for (let y = h - 1; y >= 0; y--) {
      const i = y * w + x;
      if (blocked(i)) { if (edible(i)) exp[i] = 1; break; }
    }
  }
  return exp;
}

export function isLocked(st, i) {
  const k = st.lockOf[i];
  return k >= 0 && st.locks[k] > 0;
}

export function computeExposed(st) {
  return climbMask(st.w, st.h,
    (i) => st.col[i] !== EMPTY || isLocked(st, i),
    (i) => st.col[i] !== EMPTY && !isLocked(st, i));
}

// ---------- state ----------

export function createState(level) {
  let remaining = 0;
  for (let i = 0; i < level.col.length; i++) if (level.col[i] !== EMPTY) remaining++;
  return {
    w: level.w,
    h: level.h,
    col: Int8Array.from(level.col),
    hp: Uint8Array.from(level.hp),
    lockOf: level.lockOf, // never changes
    locks: level.locks.slice(), // dispatches left until each lid opens
    remaining,
    dispatched: 0,
    trayCap: level.trayCap,
    tray: [],
    lanes: level.lanes.map((l) => l.map((c) => ({ ...c }))),
    over: false,
  };
}

export function cloneState(st) {
  return {
    ...st,
    col: st.col.slice(),
    hp: st.hp.slice(),
    locks: st.locks.slice(),
    tray: st.tray.map((c) => ({ ...c })),
    lanes: st.lanes.map((l) => l.map((c) => ({ ...c }))),
  };
}

// ---------- eating ----------

function nestDist(st, i) {
  const x = (i % st.w) + 0.5 - st.w / 2;
  const y = st.h + 3 - ((i / st.w) | 0) - 0.5;
  return x * x + y * y;
}

export function resolveColony(st, c, bites, origin) {
  let exp = computeExposed(st);
  const n = st.w * st.h;
  while (c.left > 0) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < n; i++) {
      if (exp[i] && st.col[i] === c.color) {
        const d = nestDist(st, i);
        if (d < bd) { bd = d; best = i; }
      }
    }
    if (best < 0) break;
    c.left--;
    if (st.hp[best] > 1) {
      st.hp[best]--;
      bites.push({ i: best, crack: true, cid: c.id, color: c.color, origin });
    } else {
      st.col[best] = EMPTY;
      st.hp[best] = 0;
      st.remaining--;
      bites.push({ i: best, crack: false, cid: c.id, color: c.color, origin });
      exp = computeExposed(st);
    }
  }
}

function dispatchOne(st, c, bites) {
  st.dispatched++;
  for (let k = 0; k < st.locks.length; k++) if (st.locks[k] > 0) st.locks[k]--;
  resolveColony(st, c, bites, { lane: c.lane });
  if (c.left > 0) st.tray.push(c);
}

// Re-sends a colony waiting in the thaal. It keeps its slot if it still has ants left.
// Lids only count colonies sent from the lanes.
export function playTray(st, cid, bites) {
  if (st.over || st.remaining === 0) return false;
  const c = st.tray.find((t) => t.id === cid);
  if (!c) return false;
  resolveColony(st, c, bites, { tray: c.id });
  st.tray = st.tray.filter((t) => t.left > 0);
  return true;
}

// Every legal tap: {lane} or {tray}.
export function legalMoves(st) {
  const moves = [];
  for (let li = 0; li < st.lanes.length; li++) { const fg = frontGroup(st, li); if (fg && !fg.blocked) moves.push({ lane: li }); }
  for (const c of st.tray) moves.push({ tray: c.id });
  return moves;
}

export function playMove(st, m, bites) {
  return m.lane !== undefined ? playLane(st, m.lane, bites) : playTray(st, m.tray, bites);
}

// The colonies a tap on lane `li` would send: the front, plus its baraat partner.
// Returns null (empty lane), {blocked, group} (partner not at a front) or {group}.
export function frontGroup(st, li) {
  const c = st.lanes[li][0];
  if (!c) return null;
  if (c.link < 0) return { group: [c] };
  for (let j = 0; j < st.lanes.length; j++) {
    const p = st.lanes[j][0];
    if (j !== li && p && p.id === c.link) {
      return { group: c.seq < p.seq ? [c, p] : [p, c] };
    }
  }
  return { blocked: true, group: [c] };
}

// Plays lane `li`. Pushes visual bites onto `bites`. Returns false if the tap is not allowed.
export function playLane(st, li, bites) {
  if (st.over || st.remaining === 0) return false;
  const fg = frontGroup(st, li);
  if (!fg || fg.blocked) return false;
  for (const c of fg.group) st.lanes[c.lane].shift();
  for (const c of fg.group) dispatchOne(st, c, bites);
  if (st.tray.length > st.trayCap) st.over = true;
  return true;
}

// The move to suggest: one that empties the thaal or adds nothing to it, eating the most.
export function hintMove(st) {
  let best = null, bestScore = -Infinity;
  for (const m of legalMoves(st)) {
    const s = cloneState(st);
    const bites = [];
    playMove(s, m, bites);
    if (!bites.length && m.tray !== undefined) continue;
    const eaten = bites.length;
    const score = (s.over ? -100000 : 0) - (s.tray.length - st.tray.length) * 1000 + eaten;
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best;
}

// ---------- generator ----------

// board: {w,h,col,hp,lockOf,lockAfter:[n]}  opts: {lanes,trayCap,min,max,links,mystery,seed}
// Builds colonies by playing a hidden solution; distributing them into lanes in
// order keeps that solution playable, so every level is solvable.
export function generateLevel(board, opts) {
  const rng = mulberry32(opts.seed);
  const lockAfter = board.lockAfter.slice();
  const sim = {
    w: board.w, h: board.h,
    col: Int8Array.from(board.col), hp: Uint8Array.from(board.hp),
    lockOf: board.lockOf, locks: lockAfter.slice(),
    remaining: 0, dispatched: 0, tray: [],
  };
  for (const c of sim.col) if (c !== EMPTY) sim.remaining++;
  const initialExposed = computeExposed(sim);

  const seq = [];
  let guard = 0;
  while (sim.remaining > 0) {
    if (++guard > 10000) throw new Error('generator stuck');
    const exp = computeExposed(sim);
    const counts = new Map();
    for (let i = 0; i < exp.length; i++) if (exp[i]) counts.set(sim.col[i], (counts.get(sim.col[i]) || 0) + 1);
    if (counts.size === 0) {
      // Nothing reachable until a lid opens: open the nearest one at this point instead.
      let k = -1;
      for (let j = 0; j < sim.locks.length; j++) if (sim.locks[j] > 0 && (k < 0 || sim.locks[j] < sim.locks[k])) k = j;
      if (k < 0) throw new Error('unreachable pixels');
      lockAfter[k] -= sim.locks[k];
      sim.locks[k] = 0;
      continue;
    }
    let total = 0;
    for (const v of counts.values()) total += v;
    let r = rng() * total, color = -1;
    for (const [c, v] of counts) { r -= v; if (r <= 0) { color = c; break; } }
    if (color < 0) color = [...counts.keys()].pop();
    const size = opts.min + Math.floor(rng() * (opts.max - opts.min + 1));
    const colony = { color, left: size };
    const locksClosed = sim.locks.some((v) => v > 0);
    sim.dispatched++;
    for (let k = 0; k < sim.locks.length; k++) if (sim.locks[k] > 0) sim.locks[k]--;
    resolveColony(sim, colony, [], null);
    const count = size - colony.left;
    const prev = seq[seq.length - 1];
    // Merging back-to-back colonies of one colour is exact while no lid is counting down.
    if (prev && prev.color === color && !locksClosed && !prev.locksClosed && prev.count + count <= opts.max + 6) {
      prev.count += count;
    } else {
      seq.push({ color, count, locksClosed });
    }
  }

  // Deal the hidden solution into lanes, keeping its order inside each lane.
  // Runs of back-to-back colonies land in one lane, so the other lanes' fronts
  // drift ahead of the solution: tempting colonies that are not ready yet.
  const L = opts.lanes;
  const lanes = Array.from({ length: L }, () => []);
  const [runMin, runMax] = opts.run || [1, 1];
  let lane = 0, runLeft = 0;
  seq.forEach((it, idx) => {
    if (runLeft <= 0) {
      const minLen = Math.min(...lanes.map((l) => l.length));
      const ok = [];
      for (let l = 0; l < L; l++) if (l !== lane && lanes[l].length <= minLen + runMax) ok.push(l);
      lane = ok.length ? ok[Math.floor(rng() * ok.length)] : lane;
      runLeft = runMin + Math.floor(rng() * (runMax - runMin + 1));
    }
    runLeft--;
    lanes[lane].push({ id: idx, seq: idx, color: it.color, count: it.count, left: it.count, lane, link: -1 });
  });

  // Baraat: tie neighbours in the solution that sit in different lanes.
  const byId = lanes.flat().sort((a, b) => a.id - b.id);
  let links = opts.links || 0, tries = 0;
  while (links > 0 && tries++ < 400) {
    const i = Math.floor(rng() * (byId.length - 1));
    const a = byId[i], b = byId[i + 1];
    if (a.link >= 0 || b.link >= 0 || a.lane === b.lane || a.color === b.color) continue;
    a.link = b.id; b.link = a.id; links--;
  }

  // Dhakkan: covered pixels, never on the starting edge.
  const hidden = new Uint8Array(board.w * board.h);
  if (opts.mystery) {
    for (let i = 0; i < hidden.length; i++) {
      if (board.col[i] !== EMPTY && !initialExposed[i] && board.lockOf[i] < 0 && rng() < opts.mystery) hidden[i] = 1;
    }
  }

  return {
    w: board.w, h: board.h,
    col: board.col, hp: board.hp, lockOf: board.lockOf,
    locks: lockAfter.map((v) => Math.max(v, 0)),
    trayCap: opts.trayCap,
    lanes, hidden,
    solution: seq.length,
  };
}
