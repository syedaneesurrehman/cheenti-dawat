// Cheenti Dawat — game shell: screens, board rendering, ants, input, boosters.
import {
  EMPTY, createState, cloneState, playLane, playTray, frontGroup, hintMove, climbMask, isLocked,
} from './engine.js';
import { buildLevel, levelCount, levelDef, rasterize, TWISTS } from './levels.js';
import { sfx, initAudio, setMuted } from './audio.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// ---------- save ----------
const SAVE_KEY = 'cheenti-dawat-v1';
const save = (() => {
  const d = { coins: 150, unlocked: 0, stars: {}, muted: false, seen: {} };
  try { return { ...d, ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') }; } catch { return d; }
})();
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* private mode */ } }

const COST = { hint: 25, undo: 40, slot: 60 };

// ---------- colour helpers ----------
const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const inkFor = (h) => { const [r, g, b] = rgb(h); return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#2a1a10' : '#fffaf0'; };
const mix = (h, t, p) => { const a = rgb(h), b = rgb(t); return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * p)).join(',')})`; };

// ---------- drawing primitives ----------
function tile(ctx, x, y, s, color, dim) {
  const g = s > 10 ? 1 : s > 5 ? 0.5 : 0;
  const r = s * 0.22;
  ctx.fillStyle = color;
  if (s > 6 && ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x + g, y + g, s - 2 * g, s - 2 * g, r); ctx.fill(); }
  else ctx.fillRect(x + g, y + g, s - 2 * g, s - 2 * g);
  if (s > 6) {
    const b = Math.max(1, s * 0.13);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(x + g + r * 0.6, y + g + 1, s - 2 * g - r * 1.2, b);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(x + g + r * 0.6, y + s - g - b - 0.5, s - 2 * g - r * 1.2, b);
  }
  if (dim) { ctx.fillStyle = 'rgba(20,10,4,0.22)'; ctx.fillRect(x + g, y + g, s - 2 * g, s - 2 * g); }
}

function drawAnt(ctx, x, y, ang, s, color, t, carry) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.strokeStyle = '#170d07';
  ctx.lineWidth = Math.max(1, s * 0.08);
  ctx.lineCap = 'round';
  const sw = Math.sin(t * 0.035) * s * 0.14;
  ctx.beginPath();
  for (const [k, side] of [[-1, 1], [0, -1], [1, 1]]) {
    const ox = k * s * 0.13;
    ctx.moveTo(ox, 0); ctx.lineTo(ox + k * s * 0.12 + sw * side, -s * 0.42);
    ctx.moveTo(ox, 0); ctx.lineTo(ox + k * s * 0.12 - sw * side, s * 0.42);
  }
  ctx.moveTo(s * 0.3, -s * 0.05); ctx.lineTo(s * 0.52, -s * 0.2);
  ctx.moveTo(s * 0.3, s * 0.05); ctx.lineTo(s * 0.52, s * 0.2);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1, s * 0.06);
  for (const [cx, rx, ry] of [[-s * 0.3, s * 0.24, s * 0.18], [0, s * 0.13, s * 0.1], [s * 0.25, s * 0.12, s * 0.11]]) {
    ctx.beginPath(); ctx.ellipse(cx, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  if (carry) {
    ctx.fillStyle = carry;
    ctx.fillRect(s * 0.36, -s * 0.13, s * 0.26, s * 0.26);
    ctx.strokeRect(s * 0.36, -s * 0.13, s * 0.26, s * 0.26);
  }
  ctx.restore();
}

// Draws a level picture into a canvas (previews and home screen).
function drawPicture(canvas, def, px) {
  const g = rasterize(def);
  const s = px || Math.max(2, Math.floor(160 / Math.max(def.w, def.h)));
  const side = Math.max(def.w, def.h) * s;
  canvas.width = side; canvas.height = side;
  const ctx = canvas.getContext('2d');
  const ox = (side - def.w * s) / 2, oy = (side - def.h * s) / 2;
  for (let i = 0; i < g.col.length; i++) {
    if (g.col[i] === EMPTY) continue;
    tile(ctx, ox + (i % def.w) * s, oy + ((i / def.w) | 0) * s, s, def.palette[g.col[i]]);
  }
}

// ---------- screens ----------
function show(id) {
  for (const s of $$('.screen')) s.hidden = s.id !== id;
  if (id === 'home') renderHome();
  if (id === 'levels') renderLevels();
  updateCoins();
}

function updateCoins() { for (const el of $$('.coinCount')) el.textContent = save.coins; }
function updateSoundBtns() { for (const b of $$('.soundBtn')) b.textContent = save.muted ? '🔇' : '🔊'; }

function maxPlayable() { return Math.max(save.unlocked, 0); }

function renderHome() {
  const idx = Math.min(maxPlayable(), levelCount() * 50);
  const def = levelDef(idx);
  $('#playLvl').textContent = `Level ${idx + 1} · ${def.title}${def.remix ? ' (Remix)' : ''}`;
  drawPicture($('#homeArt'), def, 12);
}

function renderLevels() {
  const grid = $('#levelGrid');
  grid.innerHTML = '';
  const shown = Math.max(levelCount(), maxPlayable() + 1);
  for (let i = 0; i < shown; i++) {
    if (i === levelCount()) {
      const h = document.createElement('div');
      h.className = 'grid-head';
      h.textContent = 'Remix — same dishes, tougher deals';
      grid.append(h);
    }
    const def = levelDef(i);
    const locked = i > maxPlayable();
    const stars = save.stars[i] || 0;
    const b = document.createElement('button');
    b.className = 'tile' + (locked ? ' locked' : '') + (i === maxPlayable() ? ' next' : '');
    const c = document.createElement('canvas');
    drawPicture(c, def, 4);
    b.append(c);
    b.insertAdjacentHTML('beforeend',
      `<span class="num">${locked ? '🔒 ' : ''}${i + 1}</span><span class="nm">${def.title}</span>` +
      `<span class="stars">${'★'.repeat(stars)}${'☆'.repeat(locked ? 0 : 3 - stars)}</span>`);
    if (!locked) b.onclick = () => { initAudio(); startLevel(i); };
    grid.append(b);
  }
  $('.tile.next', grid)?.scrollIntoView({ block: 'center' });
}

// ---------- modal & toast ----------
function modal(html, buttons = []) {
  const m = $('#modal'), card = $('.card', m);
  card.innerHTML = html + '<div class="actions"></div>';
  const act = $('.actions', card);
  for (const b of buttons) {
    const el = document.createElement('button');
    el.className = 'btn ' + (b.cls || '');
    el.innerHTML = b.label;
    if (b.disabled) el.disabled = true;
    el.onclick = () => { initAudio(); if (!b.keep) closeModal(); b.onClick?.(); };
    act.append(el);
  }
  m.hidden = false;
}
function closeModal() { $('#modal').hidden = true; }

let toastTimer = 0;
function toast(msg, ms = 1800) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}
function shake(el) { if (!el) return; el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
function vibrate(p) { try { navigator.vibrate?.(p); } catch { /* unsupported */ } }

function rulesHtml() {
  return `<div class="big-icon">🐜</div><h3>How to play</h3>
  <ul class="rules">
    <li>Ants climb up from their nest <b>under</b> the dastarkhwan. They can only bite the <b>lowest piece</b> left in each column.</li>
    <li>Tap the colony at the front of a lane. Its ants eat pieces of their own colour, as many as the number says.</li>
    <li>Each bite can uncover the piece above it, so the order you send colonies matters.</li>
    <li>Ants that run out of food they can reach wait in the <b>thaal</b>. Tap them later to send them again.</li>
    <li>If the thaal overflows, the dawat is over. Eat the whole picture to win!</li>
  </ul>`;
}

// ---------- game state ----------
const G = {
  idx: 0, level: null, def: null, st: null, snaps: [],
  vis: null, reach: null, ants: [], parts: [], dying: [], floats: [], queue: [], pending: new Map(),
  colonies: new Map(), tags: new Map(), trayVis: [], lockBox: [],
  boosters: 0, peakTray: 0, ended: false, dark: false, hint: null, hintUntil: 0,
  L: null, dirty: true, uiDirty: true, spawnAcc: 0, confetti: 0,
};

const canvas = $('#board');
const ctx = canvas.getContext('2d');
const layer = document.createElement('canvas');
const lctx = layer.getContext('2d');

function isDark(dispatched) {
  const L = G.def.loadshed;
  if (!L) return false;
  const d = dispatched - L.start;
  return d >= 0 && d % L.every < L.dur;
}

function startLevel(idx) {
  G.idx = idx;
  G.level = buildLevel(idx);
  G.def = G.level.def;
  G.st = createState(G.level);
  G.snaps = [];
  G.boosters = 0; G.peakTray = 0; G.ended = false; G.hint = null; G.confetti = 0;
  // Baraat partners share a letter.
  G.tags = new Map();
  let letter = 0;
  for (const c of G.st.lanes.flat().sort((a, b) => a.id - b.id)) {
    if (c.link >= 0 && !G.tags.has(c.id)) {
      const t = String.fromCharCode(65 + letter++);
      G.tags.set(c.id, t); G.tags.set(c.link, t);
    }
  }
  // Lid outlines.
  G.lockBox = G.st.locks.map(() => ({ x0: 1e9, y0: 1e9, x1: -1, y1: -1 }));
  for (let i = 0; i < G.st.lockOf.length; i++) {
    const k = G.st.lockOf[i];
    if (k < 0) continue;
    const x = i % G.st.w, y = (i / G.st.w) | 0, b = G.lockBox[k];
    b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y); b.x1 = Math.max(b.x1, x); b.y1 = Math.max(b.y1, y);
  }
  resetVisual();
  $('#lvlName').innerHTML = `${idx + 1}. ${G.def.title}${G.def.remix ? ' · Remix' : ''}`;
  $('#lvlSub').innerHTML = `<span class="ur">${G.def.urdu}</span> · ${G.def.blurb}`;
  show('game');
  closeModal();
  requestAnimationFrame(() => { layout(); G.uiDirty = true; });
  introFor(idx);
}

function resetVisual() {
  const st = G.st;
  G.vis = { col: st.col.slice(), hp: st.hp.slice(), revealed: new Uint8Array(st.col.length) };
  G.ants = []; G.parts = []; G.dying = []; G.floats = []; G.queue = []; G.pending = new Map(); G.spawnAcc = 0;
  G.colonies = new Map();
  for (const c of st.lanes.flat()) G.colonies.set(c.id, c);
  for (const c of st.tray) G.colonies.set(c.id, c);
  G.trayVis = st.tray.map((c) => c.id);
  G.dark = isDark(st.dispatched);
  updateReach(true);
  G.dirty = true; G.uiDirty = true;
}

function updateReach(silent) {
  const st = G.st, v = G.vis;
  G.reach = climbMask(st.w, st.h,
    (i) => v.col[i] !== EMPTY || isLocked(st, i),
    (i) => v.col[i] !== EMPTY && !isLocked(st, i));
  let revealed = false;
  for (let i = 0; i < G.reach.length; i++) {
    if (G.reach[i] && G.level.hidden[i] && !v.revealed[i]) { v.revealed[i] = 1; revealed = true; }
  }
  if (revealed && !silent) sfx.reveal();
}

function introFor(idx) {
  const steps = [];
  if (idx === 0 && !save.seen.rules) steps.push(['rules', rulesHtml()]);
  const tw = G.def.intro && TWISTS[G.def.intro];
  if (tw && !save.seen[G.def.intro]) {
    steps.push([G.def.intro, `<div class="big-icon">${tw.icon}</div><h3>New: ${tw.name}</h3><p>${tw.text}</p>`]);
  }
  const next = () => {
    const s = steps.shift();
    if (!s) return;
    modal(s[1], [{ label: 'Samajh gaya! 👍', cls: 'primary', onClick: () => { save.seen[s[0]] = 1; persist(); next(); } }]);
  };
  next();
}

// ---------- layout ----------
function layout() {
  if (!G.st) return;
  const wrap = $('#boardWrap');
  const W = wrap.clientWidth, H = wrap.clientHeight;
  if (!W || !H) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const { w, h } = G.st;
  const nest = Math.max(22, Math.min(40, H * 0.08));
  const cs = Math.max(4, Math.floor(Math.min((W - 12) / w, (H - nest - 8) / h)));
  const ox = Math.round((W - w * cs) / 2);
  const oy = Math.round(Math.max(4, H - nest - h * cs - Math.max(0, (H - nest - h * cs) * 0.5)));
  G.L = { W, H, dpr, cs, ox, oy, bottom: oy + h * cs, nest };
  for (const c of [canvas, layer]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
  G.dirty = true;
}
window.addEventListener('resize', () => { layout(); });

// ---------- board layer ----------
function renderLayer() {
  const { W, H, dpr, cs, ox, oy, bottom } = G.L;
  const st = G.st, v = G.vis, pal = G.level.palette;
  const c = lctx;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, W, H);

  // dastarkhwan (cloth) behind the food
  const pad = Math.max(6, cs * 0.6);
  c.fillStyle = G.dark ? '#120c10' : '#4a2c1c';
  if (c.roundRect) { c.beginPath(); c.roundRect(ox - pad, oy - pad, st.w * cs + pad * 2, st.h * cs + pad, 14); c.fill(); }
  c.strokeStyle = G.dark ? '#2a2030' : '#c99a3c';
  c.lineWidth = 2;
  c.setLineDash([6, 4]);
  c.strokeRect(ox - pad / 2, oy - pad / 2, st.w * cs + pad, st.h * cs + pad / 2);
  c.setLineDash([]);

  // nest soil
  const g = c.createLinearGradient(0, bottom, 0, H);
  g.addColorStop(0, G.dark ? '#0d0a08' : '#3b2414');
  g.addColorStop(1, G.dark ? '#050404' : '#1f120a');
  c.fillStyle = g;
  c.fillRect(0, bottom + 2, W, H - bottom);
  c.fillStyle = G.dark ? '#ffffff08' : '#ffffff10';
  for (let k = 0; k < 40; k++) {
    const x = ((k * 97.3) % W), y = bottom + 6 + ((k * 37.7) % Math.max(4, H - bottom - 8));
    c.fillRect(x, y, 2, 2);
  }

  // food
  for (let i = 0; i < v.col.length; i++) {
    const col = v.col[i];
    if (col === EMPTY) continue;
    const x = ox + (i % st.w) * cs, y = oy + ((i / st.w) | 0) * cs;
    if (isLocked(st, i)) {
      tile(c, x, y, cs, '#8b97a3');
      if (cs > 9) { c.fillStyle = '#5d6a75'; c.fillRect(x + cs / 2 - 1, y + cs / 2 - 1, 2, 2); }
      continue;
    }
    const reach = G.reach[i];
    if (G.dark && !reach) {
      c.fillStyle = mix(pal[col], '#0b0710', 0.9);
      c.fillRect(x + 0.5, y + 0.5, cs - 1, cs - 1);
      continue;
    }
    const hidden = G.level.hidden[i] && !v.revealed[i];
    tile(c, x, y, cs, hidden ? '#5a4a6e' : pal[col], !reach);
    if (hidden && cs >= 11) {
      c.fillStyle = '#d9c8f5';
      c.font = `900 ${Math.floor(cs * 0.7)}px system-ui, sans-serif`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('?', x + cs / 2, y + cs / 2 + 1);
    }
    if (v.hp[i] > 1) {
      c.fillStyle = 'rgba(205,238,255,0.55)';
      c.fillRect(x + 1, y + 1, cs - 2, cs - 2);
      c.strokeStyle = 'rgba(255,255,255,0.9)';
      c.lineWidth = Math.max(1, cs * 0.08);
      c.beginPath(); c.moveTo(x + cs * 0.25, y + cs * 0.65); c.lineTo(x + cs * 0.6, y + cs * 0.25); c.stroke();
    }
  }

  // tiffin lids
  for (let k = 0; k < st.locks.length; k++) {
    if (st.locks[k] <= 0) continue;
    const b = G.lockBox[k];
    if (b.x1 < 0) continue;
    const x = ox + b.x0 * cs, y = oy + b.y0 * cs, w = (b.x1 - b.x0 + 1) * cs, h = (b.y1 - b.y0 + 1) * cs;
    c.strokeStyle = '#dfe6ec'; c.lineWidth = 2;
    c.strokeRect(x + 1, y + 1, w - 2, h - 2);
    const r = Math.max(12, Math.min(22, Math.min(w, h) * 0.32));
    c.fillStyle = '#26323c';
    c.beginPath(); c.arc(x + w / 2, y + h / 2, r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#ffc23d'; c.stroke();
    c.fillStyle = '#fff';
    c.font = `900 ${Math.floor(r * 1.05)}px system-ui, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(String(st.locks[k]), x + w / 2, y + h / 2 + 1);
  }
}

// ---------- ants ----------
function originX(b) {
  const cr = canvas.getBoundingClientRect();
  let el = null;
  if (b.origin?.lane !== undefined) el = $(`.lane[data-lane="${b.origin.lane}"]`);
  else if (b.origin?.tray !== undefined) el = $(`[data-tray="${b.origin.tray}"]`);
  if (!el) return G.L.W / 2;
  const r = el.getBoundingClientRect();
  return Math.max(4, Math.min(G.L.W - 4, r.left + r.width / 2 - cr.left));
}

function spawnAnt(b) {
  const { cs, ox, oy, bottom, H } = G.L;
  const cx = ox + (b.i % G.st.w) * cs + cs / 2;
  const cy = oy + ((b.i / G.st.w) | 0) * cs + cs / 2;
  const sx = originX(b) + (Math.random() - 0.5) * 16;
  const path = [[sx, H + 12], [cx, bottom + Math.min(14, G.L.nest * 0.4)], [cx, cy]];
  G.ants.push({ path, seg: 0, x: path[0][0], y: path[0][1], ang: -Math.PI / 2, bite: b, phase: 'go', t: 0, carry: null, life: 0 });
  const p = (G.pending.get(b.cid) || 1) - 1;
  if (p > 0) G.pending.set(b.cid, p); else G.pending.delete(b.cid);
  G.uiDirty = true;
}

function biteLands(a) {
  const b = a.bite, v = G.vis, { cs, ox, oy } = G.L;
  const x = ox + (b.i % G.st.w) * cs + cs / 2, y = oy + ((b.i / G.st.w) | 0) * cs + cs / 2;
  if (b.crack) {
    v.hp[b.i] = 1;
    for (let k = 0; k < 5; k++) G.parts.push(particle(x, y, '#e8f7ff'));
    sfx.crack();
  } else {
    v.col[b.i] = EMPTY;
    G.dying.push({ i: b.i, color: G.level.palette[b.color], t: 0, hidden: G.level.hidden[b.i] && !v.revealed[b.i] });
    for (let k = 0; k < 3; k++) G.parts.push(particle(x, y, G.level.palette[b.color]));
    a.carry = G.level.palette[b.color];
    sfx.crunch();
    updateReach();
  }
  G.dirty = true;
}

function particle(x, y, color) {
  const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 90;
  return { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, color, t: 0, life: 0.35 + Math.random() * 0.25 };
}

function stepAnts(dt) {
  const speed = Math.max(260, G.L.cs * 22) * (G.queue.length > 30 ? 1.6 : 1);
  for (const a of G.ants) {
    a.life += dt * 1000;
    if (a.phase === 'eat') {
      a.t += dt;
      if (a.t > 0.09) { biteLands(a); a.phase = 'back'; a.path = a.path.slice().reverse(); a.seg = 0; }
      continue;
    }
    let move = speed * dt;
    while (move > 0 && a.seg < a.path.length - 1) {
      const [tx, ty] = a.path[a.seg + 1];
      const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy);
      if (d < 0.001) { a.seg++; continue; }
      a.ang = Math.atan2(dy, dx);
      if (d <= move) { a.x = tx; a.y = ty; a.seg++; move -= d; } else { a.x += (dx / d) * move; a.y += (dy / d) * move; move = 0; }
    }
    if (a.seg >= a.path.length - 1) {
      if (a.phase === 'go') { a.phase = 'eat'; a.t = 0; } else a.done = true;
    }
  }
  G.ants = G.ants.filter((a) => !a.done);
}

// ---------- moves ----------
function onLane(li) {
  if (G.ended || G.st.over || G.st.remaining === 0) return;
  initAudio();
  const fg = frontGroup(G.st, li);
  if (!fg) return;
  if (fg.blocked) {
    shake($(`.lane[data-lane="${li}"] .chip`));
    toast(`Baraat ${G.tags.get(fg.group[0].id)}: bring its partner to the front first 💍`);
    sfx.blocked();
    return;
  }
  G.snaps.push(cloneState(G.st));
  const bites = [];
  playLane(G.st, li, bites);
  afterMove(bites);
  sfx.send();
  vibrate(12);
}

function onTray(cid) {
  if (G.ended || G.st.over || G.st.remaining === 0) return;
  initAudio();
  if (!G.st.tray.some((c) => c.id === cid)) return;
  const test = cloneState(G.st), tb = [];
  playTray(test, cid, tb);
  if (!tb.length) {
    shake($(`[data-tray="${cid}"]`));
    toast('Nothing these ants can reach yet');
    sfx.blocked();
    return;
  }
  G.snaps.push(cloneState(G.st));
  const bites = [];
  playTray(G.st, cid, bites);
  afterMove(bites);
  sfx.send();
  vibrate(12);
}

function afterMove(bites) {
  for (const b of bites) { G.queue.push(b); G.pending.set(b.cid, (G.pending.get(b.cid) || 0) + 1); }
  const newInTray = G.st.tray.filter((c) => !G.trayVis.includes(c.id));
  for (const c of newInTray) G.trayVis.push(c.id);
  if (newInTray.length) setTimeout(() => sfx.thaal(), 250);
  G.peakTray = Math.max(G.peakTray, G.st.tray.length);
  const dark = isDark(G.st.dispatched);
  if (dark !== G.dark) {
    G.dark = dark;
    if (dark) { toast('Bijli gayi! Loadshedding 🕯️', 2400); sfx.powerOff(); }
    else { toast('Bijli aa gayi! 💡'); sfx.powerOn(); }
  }
  if (bites.length >= 18) {
    G.floats.push({ text: bites.length >= 36 ? 'Zabardast!' : bites.length >= 26 ? 'Kya baat hai!' : 'Wah!', t: 0 });
  }
  G.hint = null;
  updateReach();
  G.dirty = true; G.uiDirty = true;
  if (G.st.over) vibrate([40, 40, 80]);
}

// ---------- boosters ----------
function spend(kind) {
  if (save.coins < COST[kind]) { toast(`Need 🪙 ${COST[kind]} — win levels to earn more`); sfx.blocked(); return false; }
  save.coins -= COST[kind];
  persist(); updateCoins(); sfx.coin();
  G.boosters++;
  return true;
}

function useBooster(kind) {
  initAudio();
  if (kind === 'retry') { startLevel(G.idx); return; }
  if (G.st.remaining === 0) return;
  if (kind === 'hint') {
    if (G.st.over) return;
    const m = hintMove(G.st);
    if (!m) { toast('No safe move — try Undo'); return; }
    if (!spend('hint')) return;
    G.hint = m; G.hintUntil = performance.now() + 4000; G.uiDirty = true;
  } else if (kind === 'undo') {
    if (!G.snaps.length) { toast('Nothing to undo'); return; }
    if (!spend('undo')) return;
    const cap = G.st.trayCap;
    G.st = G.snaps.pop();
    G.st.trayCap = Math.max(G.st.trayCap, cap);
    G.ended = false;
    closeModal();
    resetVisual();
  } else if (kind === 'slot') {
    if (G.st.trayCap >= 7) { toast('The thaal is as big as it gets'); return; }
    if (!spend('slot')) return;
    G.st.trayCap++;
    if (G.st.over && G.st.tray.length <= G.st.trayCap) { G.st.over = false; G.ended = false; closeModal(); }
    G.uiDirty = true;
  }
}

// ---------- end of level ----------
function checkEnd() {
  if (G.ended || G.queue.length || G.ants.length || G.dying.length) return;
  if (G.st.remaining === 0) { G.ended = true; setTimeout(win, 350); }
  else if (G.st.over) { G.ended = true; setTimeout(lose, 350); }
}

function win() {
  const stars = G.boosters === 0 && G.peakTray <= 1 ? 3 : G.boosters === 0 ? 2 : 1;
  const prev = save.stars[G.idx] || 0;
  const firstClear = G.idx >= save.unlocked;
  const reward = firstClear ? 20 + stars * 10 : Math.max(5, (stars - prev) * 10);
  save.coins += reward;
  save.stars[G.idx] = Math.max(prev, stars);
  save.unlocked = Math.max(save.unlocked, G.idx + 1);
  persist(); updateCoins();
  sfx.win(); vibrate([20, 40, 20, 40, 60]);
  G.confetti = 1;
  const starHtml = [0, 1, 2].map((k) => (k < stars ? '★' : '<span class="off">★</span>')).join('');
  const note = stars === 3 ? 'Perfect dawat: no boosters and almost no waiting.'
    : stars === 2 ? 'For ★★★ keep at most one colony waiting in the thaal.' : 'For more stars, finish without boosters.';
  modal(`<div class="stars">${starHtml}</div><h3>Shabash!</h3><p><b>${G.def.title}</b> khatam! Your colonies cleaned the plate.</p><p>🪙 +${reward} · ${note}</p>`, [
    { label: 'Agla level ›', cls: 'primary big', onClick: () => startLevel(G.idx + 1) },
    { label: 'Play again', onClick: () => startLevel(G.idx) },
    { label: 'All levels', cls: 'ghost', onClick: () => show('levels') },
  ]);
}

function lose() {
  sfx.lose();
  modal(`<div class="big-icon">🍽️</div><h3>Thaal bhar gaya!</h3><p>Too many hungry colonies are waiting. Send colonies only when their colour is at the bottom of enough columns.</p>`, [
    { label: `↩️ Undo last move · 🪙${COST.undo}`, cls: 'gold', disabled: save.coins < COST.undo, onClick: () => useBooster('undo') },
    { label: `➕ One more slot · 🪙${COST.slot}`, disabled: save.coins < COST.slot, onClick: () => useBooster('slot') },
    { label: '🔁 Try again', cls: 'primary', onClick: () => startLevel(G.idx) },
  ]);
}

// ---------- UI (lanes + thaal) ----------
function chipHtml(c, size, extra = '') {
  const color = G.level.palette[c.color];
  const n = c.left + (G.pending.get(c.id) || 0);
  const tag = G.tags.get(c.id);
  return `<div class="chip ${size}" ${extra} style="--c:${color};--ink:${inkFor(color)}">` +
    `<svg><use href="#ant"/></svg><span class="n">${n}</span>${tag ? `<span class="tie">${tag}</span>` : ''}</div>`;
}

function renderUI() {
  const st = G.st;
  const lanes = $('#lanes');
  lanes.style.gridTemplateColumns = `repeat(${st.lanes.length}, 1fr)`;
  const hintOn = G.hint && performance.now() < G.hintUntil;
  lanes.innerHTML = st.lanes.map((l, li) => {
    if (!l.length) return `<div class="lane empty" data-lane="${li}"><div class="chip" style="--c:#3a2a20;--ink:#7d6450"><span class="n">·</span></div><div class="queue"></div><div class="more"></div></div>`;
    const hinted = hintOn && G.hint.lane === li ? 'hinted' : '';
    const q = l.slice(1, 3).map((c) => chipHtml(c, 'small faded')).join('');
    const more = l.length > 3 ? `+${l.length - 3} more` : '';
    return `<div class="lane" data-lane="${li}">${chipHtml(l[0], hinted)}<div class="queue">${q}</div><div class="more">${more}</div></div>`;
  }).join('');

  // thaal: colonies stay visible until their last ant has left
  G.trayVis = G.trayVis.filter((id) => st.tray.some((c) => c.id === id) || G.pending.get(id));
  const slots = Math.max(st.trayCap, G.trayVis.length);
  let html = '';
  for (let k = 0; k < slots; k++) {
    const id = G.trayVis[k];
    const over = k >= st.trayCap ? ' over' : '';
    if (id === undefined) { html += `<div class="slot${over}"></div>`; continue; }
    const c = G.colonies.get(id);
    const hinted = hintOn && G.hint.tray === id ? 'hinted' : '';
    html += `<div class="slot${over}">${chipHtml(c, 'mini ' + hinted, `data-tray="${id}"`)}</div>`;
  }
  $('#thaal').innerHTML = html;

  for (const b of $$('.booster')) {
    const k = b.dataset.boost;
    b.disabled = k !== 'retry' && save.coins < COST[k];
  }
}

$('#lanes').addEventListener('pointerdown', (e) => {
  const lane = e.target.closest('.lane');
  if (lane) onLane(Number(lane.dataset.lane));
});
$('#thaal').addEventListener('pointerdown', (e) => {
  const t = e.target.closest('[data-tray]');
  if (t) onTray(Number(t.dataset.tray));
});
$('#boosters').addEventListener('click', (e) => {
  const b = e.target.closest('[data-boost]');
  if (b) useBooster(b.dataset.boost);
});

// ---------- frame loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!$('#game').hidden && G.st && G.L) {
    // spawn ants: faster when lots are queued
    if (G.queue.length) {
      G.spawnAcc += dt * 1000;
      const interval = Math.max(8, 38 - G.queue.length * 0.5);
      while (G.queue.length && G.spawnAcc >= interval) { G.spawnAcc -= interval; spawnAnt(G.queue.shift()); }
    } else G.spawnAcc = 0;
    stepAnts(dt);
    if (G.hint && now > G.hintUntil) { G.hint = null; G.uiDirty = true; }
    if (G.dirty) { renderLayer(); G.dirty = false; }
    draw(dt, now);
    checkEnd();
  }
  if (G.uiDirty && G.st) { G.uiDirty = false; renderUI(); }
  requestAnimationFrame(frame);
}

function draw(dt, now) {
  const { W, H, dpr, cs, ox, oy } = G.L;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(layer, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // pieces being eaten
  for (const d of G.dying) {
    d.t += dt;
    const k = Math.max(0, 1 - d.t / 0.18), s = cs * k;
    const x = ox + (d.i % G.st.w) * cs + (cs - s) / 2, y = oy + ((d.i / G.st.w) | 0) * cs + (cs - s) / 2;
    if (s > 1) tile(ctx, x, y, s, d.hidden ? '#5a4a6e' : d.color);
  }
  G.dying = G.dying.filter((d) => d.t < 0.18);

  const antSize = Math.max(9, Math.min(18, cs * 1.15));
  for (const a of G.ants) {
    const fade = a.phase === 'back' && a.seg >= 1 ? Math.max(0.15, 1 - (a.y - G.L.bottom) / (H - G.L.bottom + 12)) : 1;
    ctx.globalAlpha = fade;
    drawAnt(ctx, a.x, a.y, a.ang, antSize, G.level.palette[a.bite.color], a.life, a.carry);
  }
  ctx.globalAlpha = 1;

  for (const p of G.parts) {
    p.t += dt; p.vy += 260 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
  }
  ctx.globalAlpha = 1;
  G.parts = G.parts.filter((p) => p.t < p.life);

  for (const f of G.floats) {
    f.t += dt;
    const k = f.t / 1.1;
    ctx.globalAlpha = Math.max(0, 1 - k * k);
    ctx.font = `900 ${Math.round(28 + 10 * Math.min(1, f.t * 6))}px "Trebuchet MS", system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 6; ctx.strokeStyle = '#3a1d08';
    const y = H * 0.35 - k * 40;
    ctx.strokeText(f.text, W / 2, y);
    ctx.fillStyle = '#ffc23d';
    ctx.fillText(f.text, W / 2, y);
  }
  ctx.globalAlpha = 1;
  G.floats = G.floats.filter((f) => f.t < 1.1);

  if (G.dark) {
    const g = ctx.createRadialGradient(W / 2, H, 10, W / 2, H, Math.max(W, H));
    g.addColorStop(0, 'rgba(255,170,60,0.10)');
    g.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  if (G.confetti > 0) {
    G.confetti += dt;
    const cols = ['#12a150', '#ffffff', '#ffc23d', '#e5483b', '#1e88e5'];
    for (let k = 0; k < 70; k++) {
      const seed = k * 12.9898;
      const x = (Math.sin(seed) * 0.5 + 0.5) * W + Math.sin(now / 400 + k) * 12;
      const y = ((G.confetti * (80 + (k % 7) * 25) + (k * 53) % H) % (H + 20)) - 10;
      ctx.fillStyle = cols[k % cols.length];
      ctx.save(); ctx.translate(x, y); ctx.rotate(now / 300 + k); ctx.fillRect(-4, -2, 8, 4); ctx.restore();
    }
    if (G.confetti > 6) G.confetti = 0;
  }
}

// ---------- wiring ----------
for (const el of $$('[data-go]')) el.onclick = () => show(el.dataset.go);
$('#backBtn').onclick = () => { closeModal(); show('levels'); };
$('#playBtn').onclick = () => { initAudio(); startLevel(maxPlayable()); };
$('#levelsBtn').onclick = () => show('levels');
$('#howBtn').onclick = () => modal(rulesHtml(), [{ label: 'Theek hai!', cls: 'primary' }]);
for (const b of $$('.soundBtn')) {
  b.onclick = () => { save.muted = !save.muted; setMuted(save.muted); persist(); updateSoundBtns(); initAudio(); };
}
setMuted(save.muted);
updateSoundBtns();
show('home');
requestAnimationFrame(frame);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// Debug hooks for development: window.__cd.G
window.__cd = { G, startLevel, save };
