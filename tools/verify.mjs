// Replays every level's hidden solution through the game engine and checks it clears
// the board with an empty thaal. Then plays bots to show how hard each level is:
//   random  — taps anything legal
//   careful — re-sends a thaal colony when it can eat, otherwise taps a random lane
//   hint    — always follows the in-game hint
// Usage: node tools/verify.mjs [remixCount]
import { createState, playLane, playMove, legalMoves, hintMove, mulberry32 } from '../js/engine.js';
import { buildLevel, levelCount, twistsOf, levelDef } from '../js/levels.js';

const remixes = Number(process.argv[2] ?? 6);
const total = levelCount() + remixes;
let failed = 0;

function botPlay(level, seed, bot) {
  const rng = mulberry32(seed);
  const st = createState(level);
  for (let steps = 0; !st.over && st.remaining > 0 && steps < 2000; steps++) {
    let m = null;
    if (bot === 'hint') m = hintMove(st);
    else {
      if (bot === 'careful' && st.tray.length) { const h = hintMove(st); if (h && h.tray !== undefined) m = h; }
      if (!m) {
        const moves = legalMoves(st);
        const lanes = moves.filter((mv) => mv.lane !== undefined);
        const pool = bot === 'random' || !lanes.length ? moves : lanes;
        m = pool[Math.floor(rng() * pool.length)];
      }
    }
    if (!m) break;
    playMove(st, m, []);
  }
  return !st.over && st.remaining === 0;
}

for (let idx = 0; idx < total; idx++) {
  const level = buildLevel(idx);
  const st = createState(level);
  const colonies = st.lanes.flat().sort((a, b) => a.seq - b.seq);
  let peak = 0, ok = true, msg = '';
  for (const c of colonies) {
    const li = st.lanes.findIndex((l) => l[0] && l[0].id === c.id);
    if (li < 0) {
      if (c.link >= 0) continue; // already sent with its partner
      ok = false; msg = `colony ${c.id} not at a front`; break;
    }
    if (!playLane(st, li, [])) { ok = false; msg = `tap on lane ${li} refused`; break; }
    peak = Math.max(peak, st.tray.length);
  }
  if (ok && (st.remaining !== 0 || peak !== 0)) { ok = false; msg = `remaining ${st.remaining}, thaal peak ${peak}`; }
  const N = 40;
  let r = 0, c = 0;
  for (let s = 0; s < N; s++) { r += botPlay(level, 1000 + s, 'random'); c += botPlay(level, 2000 + s, 'careful'); }
  const h = botPlay(level, 0, 'hint') ? 'win ' : 'lose';
  const def = levelDef(idx);
  const name = `${String(idx + 1).padStart(2)} ${def.title}${def.remix ? ' (remix)' : ''}`.padEnd(36);
  const pct = (v) => `${String(Math.round((100 * v) / N)).padStart(3)}%`;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name} colonies=${String(colonies.length).padEnd(3)} thaal=${level.trayCap} random=${pct(r)} careful=${pct(c)} hint=${h} ${twistsOf(def).join(',') || '-'} ${msg}`);
  if (!ok) failed++;
}
process.exit(failed ? 1 : 0);
