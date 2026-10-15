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
// Food pieces are glossy, candy-like tiles. Each colour/size is drawn once into a
// sprite and stamped from then on.
const sprites = new Map();
function tileSprite(color, s, dpr) {
  const key = `${color}|${s}|${dpr}`;
  let c = sprites.get(key);
  if (c) return c;
  const px = Math.ceil(s * dpr);
  c = document.createElement('canvas');
  c.width = px; c.height = px;
  const x = c.getContext('2d');
  x.scale(dpr, dpr);
  const g = Math.max(0.5, s * 0.06), r = s * 0.26, w = s - 2 * g;
  const grad = x.createLinearGradient(0, g, 0, s - g);
  grad.addColorStop(0, mix(color, '#ffffff', 0.28));
  grad.addColorStop(0.55, color);
  grad.addColorStop(1, mix(color, '#000000', 0.28));
  x.fillStyle = grad;
  x.beginPath(); x.roundRect(g, g, w, w, r); x.fill();
  x.lineWidth = Math.max(0.6, s * 0.05);
  x.strokeStyle = mix(color, '#000000', 0.45);
  x.stroke();
  // soft top gloss + a sparkle
  x.fillStyle = 'rgba(255,255,255,0.32)';
  x.beginPath(); x.ellipse(s * 0.5, s * 0.3, w * 0.36, s * 0.13, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = 'rgba(255,255,255,0.85)';
  x.beginPath(); x.arc(s * 0.3, s * 0.27, Math.max(0.6, s * 0.07), 0, Math.PI * 2); x.fill();
  sprites.set(key, c);
  return c;
}

function tile(ctx, x, y, s, color, dim, dpr = 1) {
  if (s <= 6 || !ctx.roundRect) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, s - (s > 3 ? 0.5 : 0), s - (s > 3 ? 0.5 : 0));
    if (s > 3) { ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(x, y, s - 0.5, Math.max(1, s * 0.25)); }
  } else {
    ctx.drawImage(tileSprite(color, s, dpr), x, y, s, s);
  }
  if (dim) { ctx.fillStyle = 'rgba(14,8,30,0.30)'; ctx.fillRect(x + 0.5, y + 0.5, s - 1, s - 1); }
}

function drawAnt(ctx, x, y, ang, s, color, t, carry) {
  ctx.save();
  ctx.translate(x, y);
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(s * 0.06, s * 0.12, s * 0.5, s * 0.2, ang, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(ang);
  ctx.strokeStyle = '#140a06';
  ctx.lineWidth = Math.max(1.1, s * 0.085);
  ctx.lineCap = 'round';
  const sw = Math.sin(t * 0.035) * s * 0.14;
  ctx.beginPath();
  for (const [k, side] of [[-1, 1], [0, -1], [1, 1]]) {
    const ox = k * s * 0.13;
    ctx.moveTo(ox, 0); ctx.lineTo(ox + k * s * 0.14 + sw * side, -s * 0.44);
    ctx.moveTo(ox, 0); ctx.lineTo(ox + k * s * 0.14 - sw * side, s * 0.44);
  }
  // antennae
  const an = Math.sin(t * 0.02) * s * 0.05;
  ctx.moveTo(s * 0.33, -s * 0.05); ctx.quadraticCurveTo(s * 0.5, -s * 0.12, s * 0.58, -s * 0.24 + an);
  ctx.moveTo(s * 0.33, s * 0.05); ctx.quadraticCurveTo(s * 0.5, s * 0.12, s * 0.58, s * 0.24 - an);
  ctx.stroke();
  ctx.lineWidth = Math.max(1, s * 0.06);
  for (const [cx, rx, ry] of [[-s * 0.3, s * 0.25, s * 0.19], [0, s * 0.13, s * 0.1], [s * 0.26, s * 0.13, s * 0.12]]) {
    const gr = ctx.createRadialGradient(cx - rx * 0.3, -ry * 0.4, 0, cx, 0, rx);
    gr.addColorStop(0, mix(color, '#ffffff', 0.5));
    gr.addColorStop(0.6, color);
    gr.addColorStop(1, mix(color, '#000000', 0.35));
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.ellipse(cx, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  // eyes
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(s * 0.31, -s * 0.05, s * 0.035, 0, Math.PI * 2); ctx.arc(s * 0.31, s * 0.05, s * 0.035, 0, Math.PI * 2); ctx.fill();
  if (carry) {
    ctx.fillStyle = carry;
    ctx.beginPath(); ctx.roundRect(s * 0.4, -s * 0.15, s * 0.3, s * 0.3, s * 0.06); ctx.fill(); ctx.stroke();
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

const home = { def: null, grid: null };

function renderHome() {
  const idx = Math.min(maxPlayable(), levelCount() * 50);
  const def = levelDef(idx);
  $('#playLvl').textContent = `Level ${idx + 1} · ${def.title}${def.remix ? ' (Remix)' : ''}`;
  $('#starCount').textContent = Object.values(save.stars).reduce((a, b) => a + b, 0);
  home.def = def;
  home.grid = rasterize(def);
}

// Home screen: the next dish, with a ring of ants marching around it.
function drawHome(now) {
  const cv = $('#homeArt');
  const r = cv.getBoundingClientRect();
  if (!r.width || !home.def) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const W = Math.round(r.width * dpr);
  if (cv.width !== W) { cv.width = W; cv.height = W; }
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const S = r.width;
  c.clearRect(0, 0, S, S);
  const { w, h, palette } = home.def;
  const cs = Math.floor((S * 0.66) / Math.max(w, h));
  const bob = Math.sin(now / 700) * 3;
  const ox = (S - w * cs) / 2, oy = (S - h * cs) / 2 + bob;
  c.fillStyle = 'rgba(0,0,0,0.25)';
  c.beginPath(); c.ellipse(S / 2, S / 2 + (h * cs) / 2 + 10, w * cs * 0.42, 8, 0, 0, Math.PI * 2); c.fill();
  const g = home.grid;
  for (let i = 0; i < g.col.length; i++) {
    if (g.col[i] === EMPTY) continue;
    tile(c, ox + (i % w) * cs, oy + ((i / w) | 0) * cs, cs, palette[g.col[i]], false, dpr);
  }
  const R = S * 0.43, n = 9, t = now / 1000;
  const ant = Math.max(16, S * 0.075);
  for (let k = 0; k < n; k++) {
    const a = t * 0.45 + (k * Math.PI * 2) / n;
    const x = S / 2 + Math.cos(a) * R, y = S / 2 + Math.sin(a) * R;
    const col = palette[k % palette.length];
    drawAnt(c, x, y, a + Math.PI / 2, ant, col, now + k * 90, k % 2 ? col : null);
  }
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
      `<span class="stars">${locked ? '' : '★'.repeat(stars) + `<span class="off">${'★'.repeat(3 - stars)}</span>`}</span>`);
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
    <li><i>⬆️</i><span>Ants climb up from their nest <b>under</b> the dastarkhwan. They can only bite the <b>lowest piece</b> left in each column.</span></li>
    <li><i>👆</i><span>Tap the colony at the front of a lane. Its ants eat pieces of their own colour, as many as the number says.</span></li>
    <li><i>🧠</i><span>Each bite uncovers the piece above it, so the <b>order</b> you send colonies matters.</span></li>
    <li><i>🍽️</i><span>Hungry ants with nothing to reach wait in the <b>thaal</b>. Tap them later to send them again.</span></li>
    <li><i>🏆</i><span>If the thaal overflows, the dawat is over. Clear the whole plate to win!</span></li>
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
  $('#lvlName').innerHTML = `<span class="lv">${idx + 1}</span>${G.def.title}${G.def.remix ? ' · Remix' : ''}`;
  G.total = G.st.remaining;
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
  G.visLeft = st.remaining;
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
  // The nest sits at the bottom of the play area, the cloth right on top of it;
  // any spare height goes above the cloth.
  const nest = Math.max(34, Math.min(48, H * 0.09));
  const rim = 13; // ajrak border around the food
  const cs = Math.max(4, Math.floor(Math.min((W - rim * 2 - 6) / w, (H - nest - rim * 2 - 10) / h)));
  const ox = Math.round((W - w * cs) / 2);
  const nestTop = H - nest;
  const bottom = Math.round(nestTop - rim * 0.5 - 6);
  const oy = bottom - h * cs;
  G.L = { W, H, dpr, cs, ox, oy, bottom, nest, rim, nestTop, holeY: nestTop + nest * 0.58 };
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

  drawCloth(c, G.L, st.w, st.h, G.dark);
  drawNest(c, G.L, G.dark);

  // food
  for (let i = 0; i < v.col.length; i++) {
    const col = v.col[i];
    if (col === EMPTY) continue;
    const x = ox + (i % st.w) * cs, y = oy + ((i / st.w) | 0) * cs;
    if (isLocked(st, i)) {
      tile(c, x, y, cs, '#9aa8b5', false, dpr);
      continue;
    }
    const reach = G.reach[i];
    if (G.dark && !reach) {
      c.fillStyle = mix(pal[col], '#07051a', 0.88);
      c.fillRect(x + 0.5, y + 0.5, cs - 1, cs - 1);
      continue;
    }
    const hidden = G.level.hidden[i] && !v.revealed[i];
    tile(c, x, y, cs, hidden ? '#6b4f8f' : pal[col], !reach, dpr);
    if (hidden && cs >= 11) {
      c.fillStyle = '#f3e8ff';
      c.font = `800 ${Math.floor(cs * 0.72)}px "Baloo 2", system-ui, sans-serif`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('?', x + cs / 2, y + cs / 2 + cs * 0.08);
    }
    if (v.hp[i] > 1) {
      c.fillStyle = 'rgba(200,240,255,0.5)';
      c.beginPath(); c.roundRect(x + 1, y + 1, cs - 2, cs - 2, cs * 0.22); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.95)';
      c.lineWidth = Math.max(1, cs * 0.09);
      c.beginPath();
      c.moveTo(x + cs * 0.22, y + cs * 0.7); c.lineTo(x + cs * 0.55, y + cs * 0.28);
      c.moveTo(x + cs * 0.5, y + cs * 0.75); c.lineTo(x + cs * 0.75, y + cs * 0.45);
      c.stroke();
    }
  }

  // tiffin lids: a steel lid with a latch and the countdown
  for (let k = 0; k < st.locks.length; k++) {
    if (st.locks[k] <= 0) continue;
    const b = G.lockBox[k];
    if (b.x1 < 0) continue;
    const x = ox + b.x0 * cs, y = oy + b.y0 * cs, w = (b.x1 - b.x0 + 1) * cs, h = (b.y1 - b.y0 + 1) * cs;
    const lg = c.createLinearGradient(x, y, x + w, y + h);
    lg.addColorStop(0, 'rgba(255,255,255,0.25)'); lg.addColorStop(0.5, 'rgba(255,255,255,0)'); lg.addColorStop(1, 'rgba(255,255,255,0.18)');
    c.fillStyle = lg;
    c.beginPath(); c.roundRect(x, y, w, h, 6); c.fill();
    c.strokeStyle = '#e8eef3'; c.lineWidth = 2.5; c.stroke();
    const r = Math.max(13, Math.min(24, Math.min(w, h) * 0.34));
    const cx = x + w / 2, cy = y + h / 2;
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath(); c.arc(cx, cy + 3, r, 0, Math.PI * 2); c.fill();
    const bg = c.createRadialGradient(cx - r * 0.3, cy - r * 0.4, 1, cx, cy, r);
    bg.addColorStop(0, '#5b6e80'); bg.addColorStop(1, '#1f2a36');
    c.fillStyle = bg;
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#ffcc29'; c.lineWidth = 3; c.stroke();
    c.fillStyle = '#fff';
    c.font = `800 ${Math.floor(r * 1.15)}px "Baloo 2", system-ui, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(String(st.locks[k]), cx, cy + r * 0.1);
  }
}

// Ajrak-style block-print dastarkhwan: crimson border of stars and diamonds, indigo field.
function drawCloth(c, L, w, h, dark) {
  const { cs, ox, oy, rim } = L;
  const x0 = ox - rim, y0 = oy - rim, bw = w * cs + rim * 2, bh = h * cs + rim + 4;
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = 18; c.shadowOffsetY = 8;
  c.fillStyle = dark ? '#1a0812' : '#9b1b30';
  c.beginPath(); c.roundRect(x0, y0, bw, bh, 16); c.fill();
  c.restore();
  // indigo field with a faint star grid
  c.fillStyle = dark ? '#06061a' : '#1b1d55';
  c.beginPath(); c.roundRect(ox - 3, oy - 3, w * cs + 6, h * cs + 6, 8); c.fill();
  if (!dark) {
    c.fillStyle = 'rgba(255,255,255,0.06)';
    const step = Math.max(10, cs * 2);
    for (let yy = oy + step / 2; yy < oy + h * cs; yy += step) {
      for (let xx = ox + step / 2; xx < ox + w * cs; xx += step) {
        c.beginPath(); c.arc(xx, yy, 1.4, 0, Math.PI * 2); c.fill();
      }
    }
  }
  // border motifs
  c.strokeStyle = dark ? '#3a1a28' : 'rgba(255,240,220,0.85)';
  c.lineWidth = 1.2;
  c.beginPath(); c.roundRect(x0 + 3, y0 + 3, bw - 6, bh - 6, 13); c.stroke();
  c.beginPath(); c.roundRect(ox - 4.5, oy - 4.5, w * cs + 9, h * cs + 9, 9); c.stroke();
  const mid = rim / 2 + 1.5;
  const motif = (x, y, k) => {
    if (k % 2) {
      c.fillStyle = dark ? '#2a1020' : '#fff3df';
      c.beginPath(); c.moveTo(x, y - 3.2); c.lineTo(x + 3.2, y); c.lineTo(x, y + 3.2); c.lineTo(x - 3.2, y); c.closePath(); c.fill();
    } else {
      c.fillStyle = dark ? '#140818' : '#1b1d55';
      c.beginPath(); c.arc(x, y, 2.4, 0, Math.PI * 2); c.fill();
    }
  };
  const gap = 9;
  let k = 0;
  for (let x = x0 + 14; x < x0 + bw - 12; x += gap) { motif(x, y0 + mid, k); motif(x, y0 + bh - mid, k + 1); k++; }
  k = 0;
  for (let y = y0 + 14; y < y0 + bh - 12; y += gap) { motif(x0 + mid, y, k); motif(x0 + bw - mid, y, k + 1); k++; }
}

// The ants' home: a soil bank with grass on top and one hole under each lane.
function drawNest(c, L, dark) {
  const { W, H } = L;
  const top = L.nestTop - 4;
  const g = c.createLinearGradient(0, top, 0, H);
  g.addColorStop(0, dark ? '#140c08' : '#7a4a26');
  g.addColorStop(1, dark ? '#050302' : '#3d2210');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(0, H);
  c.lineTo(0, top + 8);
  for (let x = 0; x <= W; x += 12) c.lineTo(x, top + 4 + Math.sin(x * 0.09) * 3);
  c.lineTo(W, H);
  c.closePath();
  c.fill();
  // pebbles
  for (let k = 0; k < 34; k++) {
    const x = (k * 97.3) % W, y = top + 10 + ((k * 37.7) % Math.max(6, H - top - 14));
    c.fillStyle = dark ? 'rgba(255,255,255,0.04)' : k % 3 ? 'rgba(255,220,180,0.16)' : 'rgba(0,0,0,0.2)';
    c.beginPath(); c.ellipse(x, y, 2.2, 1.5, 0, 0, Math.PI * 2); c.fill();
  }
  // grass tufts
  if (!dark) {
    c.strokeStyle = '#3fbf5a'; c.lineWidth = 1.6; c.lineCap = 'round';
    c.beginPath();
    for (let x = 6; x < W; x += 17) {
      const y = top + 4 + Math.sin(x * 0.09) * 3;
      c.moveTo(x, y); c.lineTo(x - 3, y - 6);
      c.moveTo(x + 2, y); c.lineTo(x + 3, y - 8);
      c.moveTo(x + 4, y); c.lineTo(x + 8, y - 5);
    }
    c.stroke();
  }
  // a hole under each lane
  for (const el of $$('.lane')) {
    const x = originX({ origin: { lane: Number(el.dataset.lane) } });
    const y = L.holeY;
    c.fillStyle = dark ? '#1c120c' : '#a8703f';
    c.beginPath(); c.ellipse(x, y + 2, 17, 8, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#120a05';
    c.beginPath(); c.ellipse(x, y + 1, 11, 5, 0, 0, Math.PI * 2); c.fill();
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
  const { cs, ox, oy, bottom, holeY } = G.L;
  const cx = ox + (b.i % G.st.w) * cs + cs / 2;
  const cy = oy + ((b.i / G.st.w) | 0) * cs + cs / 2;
  const sx = originX(b) + (Math.random() - 0.5) * 10;
  const path = [[sx, holeY + 2], [cx, bottom + 8], [cx, cy]];
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
    G.visLeft--;
    G.uiDirty = true;
    if (Math.random() < 0.5) G.parts.push({ ...particle(x, y, '#ffffff'), star: true, life: 0.5 });
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
  const starHtml = [0, 1, 2].map((k) => `<span class="${k < stars ? '' : 'off'}">★</span>`).join('');
  const note = stars === 3 ? 'Perfect dawat: no boosters and almost no waiting.'
    : stars === 2 ? 'For ★★★ keep at most one colony waiting in the thaal.' : 'For more stars, finish without boosters.';
  const title = stars === 3 ? 'Zabardast!' : stars === 2 ? 'Shabash!' : 'Wah bhai!';
  modal(`<div class="stars">${starHtml}</div><h3>${title}</h3><canvas class="winpic"></canvas>` +
    `<p><b>${G.def.title}</b> <span class="ur">${G.def.urdu}</span> khatam! Your colonies cleaned the plate.</p>` +
    `<div class="reward">🪙 +${reward}</div><p style="font-size:13.5px;opacity:.85">${note}</p>`, [
    { label: 'Agla level ›', cls: 'primary big', onClick: () => startLevel(G.idx + 1) },
    { label: 'Play again', onClick: () => startLevel(G.idx) },
    { label: 'All levels', cls: 'ghost', onClick: () => show('levels') },
  ]);
  drawPicture($('#modal .winpic'), G.def, Math.max(4, Math.floor(300 / Math.max(G.def.w, G.def.h))));
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

  const pct = G.total ? Math.round(((G.total - G.visLeft) / G.total) * 100) : 0;
  const bar = $('#progress');
  $('i', bar).style.width = `${pct}%`;
  $('.pant', bar).style.left = `max(-4px, calc(${pct}% - 16px))`;
  $('b', bar).textContent = `${pct}%`;

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
    if (G.uiDirty) { G.uiDirty = false; renderUI(); }
    if (G.dirty) { renderLayer(); G.dirty = false; }
    draw(dt, now);
    checkEnd();
  } else if (!$('#home').hidden) drawHome(now);
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
    if (s > 1) tile(ctx, x, y, s, d.hidden ? '#6b4f8f' : d.color, false, dpr);
  }
  G.dying = G.dying.filter((d) => d.t < 0.18);

  const antSize = Math.max(11, Math.min(22, cs * 1.4));
  for (const a of G.ants) {
    // ants pop out of the hole and sink back into it
    let fade = 1;
    const dHole = Math.hypot(a.x - a.path[a.phase === 'back' ? a.path.length - 1 : 0][0], a.y - G.L.holeY);
    if (dHole < 14) fade = Math.max(0.1, dHole / 14);
    ctx.globalAlpha = fade;
    drawAnt(ctx, a.x, a.y, a.ang, antSize, G.level.palette[a.bite.color], a.life, a.carry);
  }
  ctx.globalAlpha = 1;

  for (const p of G.parts) {
    p.t += dt; p.vy += (p.star ? 60 : 260) * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    const k = Math.max(0, 1 - p.t / p.life);
    ctx.globalAlpha = k;
    ctx.fillStyle = p.color;
    if (p.star) {
      const r = 2 + 3 * k;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x + r * 0.3, p.y - r * 0.3); ctx.lineTo(p.x + r, p.y); ctx.lineTo(p.x + r * 0.3, p.y + r * 0.3);
      ctx.lineTo(p.x, p.y + r); ctx.lineTo(p.x - r * 0.3, p.y + r * 0.3); ctx.lineTo(p.x - r, p.y); ctx.lineTo(p.x - r * 0.3, p.y - r * 0.3);
      ctx.closePath(); ctx.fill();
    } else ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;
  G.parts = G.parts.filter((p) => p.t < p.life);

  for (const f of G.floats) {
    f.t += dt;
    const k = f.t / 1.2;
    const pop = Math.min(1, f.t * 7);
    ctx.globalAlpha = Math.max(0, 1 - k * k * k);
    ctx.save();
    ctx.translate(W / 2, H * 0.32 - k * 36);
    ctx.rotate(-0.06);
    ctx.scale(0.6 + 0.4 * pop + (pop < 1 ? 0 : Math.sin(f.t * 12) * 0.02), 0.6 + 0.4 * pop);
    ctx.font = `800 40px "Baloo 2", system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 10; ctx.strokeStyle = '#5a0f2e'; ctx.strokeText(f.text, 0, 4);
    ctx.lineWidth = 7; ctx.strokeStyle = '#e8332a'; ctx.strokeText(f.text, 0, 0);
    const tg = ctx.createLinearGradient(0, -18, 0, 18);
    tg.addColorStop(0, '#fff6b0'); tg.addColorStop(1, '#ffb800');
    ctx.fillStyle = tg;
    ctx.fillText(f.text, 0, 0);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  G.floats = G.floats.filter((f) => f.t < 1.2);

  if (G.dark) {
    const g = ctx.createRadialGradient(W / 2, H, 10, W / 2, H, Math.max(W, H));
    g.addColorStop(0, 'rgba(255,170,60,0.10)');
    g.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  if (G.confetti > 0) {
    G.confetti += dt;
    const cols = ['#19b36b', '#ffffff', '#ffcc29', '#e8332a', '#2bb3ff', '#ff3d7f'];
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
