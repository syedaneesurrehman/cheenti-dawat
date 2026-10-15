// Cheenti Dawat — levels. Each picture is drawn with a few shape primitives
// onto a pixel grid, then the engine generates the colonies for it.
import { EMPTY, generateLevel, hash2 } from './engine.js';

export const ICE = { ice: true };
export const ERASE = { erase: true };
export const LID = (k) => ({ lock: k });

function makeGrid(w, h) {
  const n = w * h;
  const col = new Int8Array(n).fill(EMPTY);
  const hp = new Uint8Array(n);
  const lockOf = new Int8Array(n).fill(-1);
  const paint = (i, c) => {
    if (typeof c === 'number') { col[i] = c; hp[i] = 1; return; }
    if (c.erase) { col[i] = EMPTY; hp[i] = 0; lockOf[i] = -1; return; }
    if (col[i] === EMPTY) return;
    if (c.ice) hp[i] = 2;
    if (c.lock !== undefined) lockOf[i] = c.lock;
  };
  const g = {
    w, h, col, hp, lockOf,
    // test(px, py, x, y) on pixel centres; `only` limits painting to cells of that colour.
    fill(test, c, only) {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (only !== undefined && col[i] !== only) continue;
        if (test(x + 0.5, y + 0.5, x, y)) paint(i, c);
      }
    },
    rect(x0, y0, x1, y1, c, only) { g.fill((px, py) => px >= x0 && px <= x1 && py >= y0 && py <= y1, c, only); },
    circle(cx, cy, r, c, only) { g.fill((px, py) => (px - cx) ** 2 + (py - cy) ** 2 <= r * r, c, only); },
    ring(cx, cy, r0, r1, c, only) {
      g.fill((px, py) => { const d = Math.hypot(px - cx, py - cy); return d >= r0 && d <= r1; }, c, only);
    },
    ellipse(cx, cy, rx, ry, c, rot = 0, only) {
      const cs = Math.cos(rot), sn = Math.sin(rot);
      g.fill((px, py) => {
        const dx = px - cx, dy = py - cy;
        const u = dx * cs + dy * sn, v = -dx * sn + dy * cs;
        return (u / rx) ** 2 + (v / ry) ** 2 <= 1;
      }, c, only);
    },
    poly(pts, c, only) {
      g.fill((px, py) => {
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i], [xj, yj] = pts[j];
          if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
        }
        return inside;
      }, c, only);
    },
    line(x0, y0, x1, y1, t, c, only) {
      const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1;
      g.fill((px, py) => {
        const k = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / L2));
        return Math.hypot(px - (x0 + k * dx), py - (y0 + k * dy)) <= t / 2;
      }, c, only);
    },
    dot(x, y, c) { if (x >= 0 && y >= 0 && x < w && y < h) paint(y * w + x, c); },
    dots(list, c) { for (const [x, y] of list) g.dot(x, y, c); },
    speckle(chance, c, only, salt = 1) { g.fill((px, py, x, y) => hash2(x, y, salt) < chance, c, only); },
  };
  return g;
}

const starPts = (cx, cy, R, r, rot = -Math.PI / 2) =>
  Array.from({ length: 10 }, (_, k) => {
    const a = rot + (k * Math.PI) / 5, rr = k % 2 ? r : R;
    return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
  });

const heart = (cx, cy, s) => (px, py) => {
  const x = (px - cx) / s, y = -(py - cy) / s + 0.2;
  const a = x * x + y * y - 1;
  return a * a * a - x * x * y * y * y <= 0;
};

export const TWISTS = {
  ice: {
    icon: '🧊', name: 'Barf (Ice)',
    text: 'Frozen pieces need two bites. The first bite only cracks the ice, but it still uses up one ant.',
  },
  mystery: {
    icon: '🍲', name: 'Dhakkan (Covered dish)',
    text: 'Covered pieces hide their colour until your ants climb up to them. Plan with what you can see.',
  },
  lock: {
    icon: '🍱', name: 'Tiffin lid',
    text: 'A tiffin lid blocks its columns. The number shows how many more colonies you must send from the lanes before it opens.',
  },
  link: {
    icon: '💍', name: 'Baraat',
    text: 'Colonies tied with a rope march together. Both must be at the front of their lanes before you can send them.',
  },
  loadshed: {
    icon: '🕯️', name: 'Loadshedding',
    text: 'Bijli gayi! During loadshedding you only see the pieces your ants can reach. Remember the picture.',
  },
};

// palette order matters only for the art; every colour gets its own ants.
export const LEVELS = [
  {
    key: 'aam', urdu: 'آم', title: 'Sindhri Aam', blurb: 'Summer starts with a mango.',
    w: 16, h: 16, palette: ['#FFC21A', '#FF7A1A', '#4CB04A', '#7A4A22'],
    lanes: 2, trayCap: 5, min: 6, max: 14, run: [1, 1], seed: 11,
    draw(g) {
      g.ellipse(8, 9.6, 6.1, 5.6, 0, -0.5);
      g.ellipse(10.6, 7.8, 3.4, 2.6, 1, -0.5, 0);
      g.line(7.6, 4.4, 8.4, 1.4, 1.3, 3);
      g.ellipse(11.2, 2.6, 3.1, 1.4, 2, -0.35);
    },
  },
  {
    key: 'samosa', urdu: 'سموسہ', title: 'Samosa & Chutney', blurb: 'Crispy corners first, the middle later.',
    w: 18, h: 18, palette: ['#E8A33A', '#A85A1E', '#3FAE49', '#EDEDED'],
    lanes: 2, trayCap: 3, min: 10, max: 24, run: [1, 3], seed: 23,
    draw(g) {
      const A = [9, 1.2], B = [16.8, 14.4], C = [1.2, 14.4];
      g.poly([A, B, C], 0);
      g.line(...A, ...B, 1.3, 1, 0); g.line(...B, ...C, 1.3, 1, 0); g.line(...C, ...A, 1.3, 1, 0);
      g.line(9, 2.5, 7.4, 13.5, 1, 1, 0);
      g.circle(14.6, 15, 2.9, 3);
      g.circle(14.6, 15, 1.9, 2);
    },
  },
  {
    key: 'chai', urdu: 'دودھ پتی', title: 'Doodh Patti Chai', blurb: 'Steam rises, ants follow.',
    w: 18, h: 18, palette: ['#F3E9D6', '#B87333', '#AEB8C4', '#2F80C2'],
    lanes: 3, trayCap: 4, min: 8, max: 18, run: [1, 3], seed: 37,
    draw(g) {
      g.ellipse(9, 15.8, 8.3, 1.9, 3);
      g.ring(14.4, 10.4, 1.3, 2.5, 0);
      g.poly([[2.8, 7], [14.2, 7], [13, 14], [4, 14]], 0);
      g.ellipse(8.5, 14, 4.5, 1.2, 0);
      g.rect(3, 10.2, 14, 11.3, 3, 0);
      g.ellipse(8.5, 7, 5.6, 1.3, 1);
      for (const x0 of [5.8, 8.6, 11.4]) g.fill((px, py) => py > 0.8 && py < 5.4 && Math.abs(px - (x0 + 0.8 * Math.sin(py * 1.4 + x0))) < 0.6, 2);
    },
  },
  {
    key: 'jamun', urdu: 'گلاب جامن', title: 'Gulab Jamun', blurb: 'Sticky, sweet, and stacked.',
    w: 18, h: 18, palette: ['#9EA7B1', '#E8A030', '#6A2C17', '#8BC34A'],
    lanes: 3, trayCap: 4, min: 8, max: 18, run: [1, 3], seed: 41,
    draw(g) {
      g.fill((px, py) => py >= 9 && ((px - 9) / 8.4) ** 2 + ((py - 9) / 7) ** 2 <= 1, 0);
      g.ellipse(9, 9, 8.4, 1.9, 0);
      g.ellipse(9, 9, 7, 1.3, 1);
      g.circle(4.6, 7.4, 2.1, 2);
      g.circle(13.4, 7.4, 2.1, 2);
      g.circle(9, 5.8, 2.3, 2);
      g.dots([[4, 6], [9, 4], [10, 6], [13, 6], [14, 8], [5, 8], [8, 6]], 3);
    },
  },
  {
    key: 'parcham', urdu: 'سبز ہلالی پرچم', title: 'Sabz Hilali Parcham', blurb: 'Jashn-e-Azadi mubarak!',
    w: 22, h: 15, palette: ['#0E8A43', '#F5F5F5', '#8A6A4A'],
    lanes: 3, trayCap: 3, min: 16, max: 36, run: [1, 2], seed: 14,
    draw(g) {
      g.rect(0, 0, 1.2, 15, 2);
      g.rect(1.4, 1, 6.6, 14, 1);
      g.rect(6.6, 1, 21.8, 14, 0);
      g.circle(14.2, 7.5, 4.4, 1, 0);
      g.circle(15.6, 6.5, 3.7, 0, 1);
      g.poly(starPts(17, 5.2, 2.1, 0.9, -Math.PI / 2 + 0.35), 1);
    },
  },
  {
    key: 'gola', urdu: 'گولا گنڈا', title: 'Gola Ganda', blurb: 'The ice ball melts slower than you think.',
    w: 18, h: 20, palette: ['#E53935', '#FDD835', '#43A047', '#C9A06A'],
    lanes: 3, trayCap: 4, min: 8, max: 18, run: [1, 3], seed: 52, intro: 'ice',
    draw(g) {
      g.rect(8.2, 13, 9.8, 19.6, 3);
      g.fill((px, py) => {
        const dx = px - 9, dy = py - 7.6;
        return dx * dx + dy * dy <= 6.6 * 6.6;
      }, 0);
      g.fill((px, py) => { const a = Math.atan2(py - 7.6, px - 9); return a > -Math.PI / 2 && a < Math.PI / 6; }, 1, 0);
      g.fill((px, py) => { const a = Math.atan2(py - 7.6, px - 9); return a >= Math.PI / 6 && a < (5 * Math.PI) / 6; }, 2, 0);
      g.ring(9, 7.6, 4.4, 6.7, ICE);
    },
  },
  {
    key: 'jalebi', urdu: 'جلیبی', title: 'Garma Garam Jalebi', blurb: 'Round and round — what is under the lid?',
    w: 20, h: 20, palette: ['#FF8F00', '#C24E00', '#E7D7C9', '#FFD54F'],
    lanes: 3, trayCap: 5, min: 8, max: 18, run: [1, 3], seed: 63, intro: 'mystery', mystery: 0.45,
    draw(g) {
      g.circle(10, 10, 9.7, 2);
      const b = 2.7 / (2 * Math.PI);
      g.fill((px, py) => {
        const dx = px - 10, dy = py - 10, r = Math.hypot(dx, dy);
        if (r > 8.4 || r < 0.6) return false;
        let th = Math.atan2(dy, dx); if (th < 0) th += 2 * Math.PI;
        const u = (((r - b * th) / (2 * Math.PI * b)) % 1 + 1) % 1;
        return u < 0.62;
      }, 0, 2);
      g.fill((px, py) => {
        const dx = px - 10, dy = py - 10, r = Math.hypot(dx, dy);
        let th = Math.atan2(dy, dx); if (th < 0) th += 2 * Math.PI;
        const u = (((r - b * th) / (2 * Math.PI * b)) % 1 + 1) % 1;
        return u > 0.36;
      }, 1, 0);
      g.dots([[3, 4], [16, 3], [17, 15], [4, 16], [10, 18]], 3);
    },
  },
  {
    key: 'seekh', urdu: 'سیخ کباب', title: 'Seekh Kebab', blurb: 'Smoky skewers off the coals.',
    w: 20, h: 20, palette: ['#9A5129', '#4E2612', '#C2185B', '#FFEB3B', '#B0BEC5', '#2E7D32'],
    lanes: 3, trayCap: 4, min: 8, max: 18, run: [1, 3], seed: 71, mystery: 0.3,
    draw(g) {
      g.line(0.8, 14.4, 19.2, 3, 0.9, 4);
      g.line(0.8, 19.6, 19.2, 8.2, 0.9, 4);
      g.line(3.5, 12.7, 16.4, 4.7, 2.6, 0);
      g.line(3.5, 17.9, 16.4, 9.9, 2.6, 0);
      g.fill((px, py, x, y) => (x + 2 * y) % 4 === 0, 1, 0);
      g.ring(4.8, 5, 1.6, 2.7, 2);
      g.ring(15.2, 16, 1.4, 2.5, 2);
      g.fill((px, py) => py <= 3 && (px - 15.5) ** 2 + (py - 3) ** 2 <= 2.4 * 2.4, 3);
      g.ellipse(10.2, 2.6, 2.4, 1.1, 5, 0.4);
    },
  },
  {
    key: 'biryani', urdu: 'بریانی', title: 'Karachi Biryani', blurb: 'The best piece is locked in the tiffin.',
    w: 22, h: 22, palette: ['#F6E7B0', '#F2A33A', '#9A4A1F', '#3D8FC8', '#CDDC39', '#2E7D32'],
    lanes: 3, trayCap: 5, min: 8, max: 18, run: [1, 3], seed: 89, intro: 'lock', lockAfter: [8],
    draw(g) {
      g.circle(11, 11, 10.7, 3);
      g.circle(11, 11, 8.5, 0);
      g.fill((px, py) => Math.sin(px * 1.3 + py * 0.8) > 0.45, 1, 0);
      g.ellipse(8, 9, 2.9, 2.2, 2, 0.4);
      g.ellipse(14.2, 13.4, 2.7, 2, 2, -0.5);
      g.circle(15, 6.8, 1.9, 4);
      g.line(5.5, 14.8, 10, 16.6, 1.2, 5);
      g.rect(4.6, 6, 11.4, 12, LID(0));
    },
  },
  {
    key: 'kulfi', urdu: 'کلفی', title: 'Matka Kulfi', blurb: 'Frozen solid in a clay pot.',
    w: 18, h: 22, palette: ['#F8E1B0', '#9CCC65', '#B07A4A', '#D7B98E', '#C0612B', '#E57399'],
    lanes: 3, trayCap: 4, min: 8, max: 18, run: [1, 3], seed: 97, lockAfter: [6],
    draw(g) {
      g.ellipse(9, 18.4, 7.4, 3.4, 4);
      g.rect(8.3, 13, 9.7, 17, 3);
      g.circle(9, 4.4, 4, 0);
      g.poly([[5, 4.4], [13, 4.4], [11.2, 14], [6.8, 14]], 0);
      g.rect(0, 0, 18, 4.6, 1, 0);
      g.speckle(0.3, 2, 1, 5);
      g.rect(0, 8, 18, 9, 5, 0);
      g.rect(0, 9.5, 18, 14, ICE, 0);
      g.rect(0, 17.2, 18, 22, LID(0), 4);
    },
  },
  {
    key: 'chapli', urdu: 'چپلی کباب', title: 'Peshawari Chapli Kebab', blurb: 'Some colonies march in pairs.',
    w: 22, h: 22, palette: ['#E9C27A', '#A86B2D', '#5D3218', '#E53935', '#43A047', '#F3E5F5'],
    lanes: 3, trayCap: 3, min: 10, max: 24, run: [1, 3], seed: 103, intro: 'link', links: 3,
    draw(g) {
      g.ellipse(11, 12, 10.4, 8.6, 0);
      g.speckle(0.13, 1, 0, 3);
      g.circle(11, 11.6, 6.3, 2);
      g.circle(11, 11.6, 2.7, 3);
      g.dots([[10, 11], [12, 12]], 2);
      g.line(2, 2.6, 7.4, 4.4, 1.2, 4);
      g.ring(17.4, 3.6, 1.5, 2.6, 5);
    },
  },
  {
    key: 'truckart', urdu: 'ٹرک آرٹ', title: 'Truck Art Dil', blurb: 'Bijli is about to go. Look closely.',
    w: 22, h: 20, palette: ['#E53935', '#FFD600', '#00A651', '#1E88E5', '#FF4FA3', '#FFFFFF'],
    lanes: 3, trayCap: 4, min: 8, max: 18, run: [1, 3], seed: 113, intro: 'loadshed', loadshed: { start: 2, every: 6, dur: 3 },
    draw(g) {
      g.fill(heart(11, 9.4, 9.6), 1);
      g.fill(heart(11, 9.4, 8.2), 0, 1);
      const flower = (cx, cy, pc) => {
        for (let k = 0; k < 5; k++) { const a = (k * 2 * Math.PI) / 5; g.circle(cx + 1.3 * Math.cos(a), cy + 1.3 * Math.sin(a), 0.9, pc, 0); }
        g.circle(cx, cy, 0.8, 5);
      };
      flower(7.4, 6.4, 4); flower(14.6, 6.4, 3); flower(11, 11.6, 4);
      g.dots([[9, 8], [13, 8], [6, 10], [16, 10], [9, 14], [13, 14], [11, 4]], 2);
    },
  },
  {
    key: 'golgappay', urdu: 'گول گپے', title: 'Gol Gappay', blurb: 'Teekha pani in the dark.',
    w: 22, h: 20, palette: ['#E7A93B', '#8C5420', '#5D2E0E', '#B0BEC5', '#66BB6A'],
    lanes: 3, trayCap: 3, min: 10, max: 24, run: [1, 3], seed: 127, mystery: 0.25, loadshed: { start: 3, every: 7, dur: 3 },
    draw(g) {
      g.ellipse(11, 14.4, 10.5, 5, 3);
      for (const [x, y] of [[5, 11.4], [11, 10.6], [17, 11.4], [8, 15.4], [14, 15.4]]) {
        g.circle(x, y, 2.7, 0);
        g.circle(x, y - 0.7, 1.1, 1);
      }
      g.circle(5, 3.6, 3, 2);
      g.circle(17, 3.6, 3, 4);
    },
  },
  {
    key: 'tarbooz', urdu: 'تربوز', title: 'Thanda Tarbooz', blurb: 'Chilled slices, tied together.',
    w: 24, h: 18, palette: ['#EF3B4C', '#2E7D32', '#C5E1A5', '#2A1E1E'],
    lanes: 3, trayCap: 3, min: 16, max: 36, run: [1, 2], seed: 131, links: 3,
    draw(g) {
      g.fill((px, py) => py >= 2 && Math.hypot(px - 12, py - 2) <= 11.6, 1);
      g.fill((px, py) => Math.hypot(px - 12, py - 2) <= 10.4, 2, 1);
      g.fill((px, py) => Math.hypot(px - 12, py - 2) <= 9.4, 0, 2);
      g.dots([[7, 5], [11, 6], [16, 5], [9, 9], [14, 9], [12, 12], [6, 8], [18, 8]], 3);
      g.rect(0, 2, 24, 5, ICE, 0);
    },
  },
  {
    key: 'nihari', urdu: 'نہاری', title: 'Lahori Nihari', blurb: 'Naan is locked till the gravy is ready.',
    w: 24, h: 22, palette: ['#B5652B', '#8E2B12', '#E2571E', '#FFD54F', '#43A047', '#E8C17C'],
    lanes: 3, trayCap: 3, min: 10, max: 24, run: [1, 3], seed: 149, lockAfter: [8], links: 2, loadshed: { start: 5, every: 8, dur: 3 },
    draw(g) {
      g.ellipse(17.5, 5, 6.2, 4.2, 5, 0.3);
      g.speckle(0.12, 1, 5, 9);
      g.fill((px, py) => py >= 10 && ((px - 11) / 10.2) ** 2 + ((py - 10) / 8.6) ** 2 <= 1, 0);
      g.ellipse(11, 10, 10.2, 3.3, 0);
      g.ellipse(11, 10, 8.8, 2.4, 1);
      g.speckle(0.25, 2, 1, 4);
      g.line(7, 9.4, 9.4, 10.2, 0.8, 3); g.line(12, 9, 14.4, 9.6, 0.8, 3);
      g.line(9, 11, 12, 11.3, 0.9, 4);
      g.fill(() => true, LID(0), 5);
    },
  },
  {
    key: 'iftar', urdu: 'افطاری', title: 'Iftar Thaal', blurb: 'Khajoor, pakoray and Rooh Afza.',
    w: 24, h: 24, palette: ['#C9A227', '#6D2E12', '#D9822B', '#D81B60', '#B3E5FC', '#8BC34A'],
    lanes: 4, trayCap: 3, min: 10, max: 24, run: [1, 3], seed: 157, lockAfter: [7], links: 2, mystery: 0.2,
    draw(g) {
      g.circle(12, 12, 11.7, 0);
      g.ellipse(6, 6.6, 2.2, 1.2, 1, 0.6); g.ellipse(9, 5.2, 2.2, 1.2, 1, -0.3); g.ellipse(7.6, 9, 2.2, 1.2, 1, 0.1);
      for (const [x, y, r] of [[5.6, 15, 2.3], [8.8, 17.4, 2.2], [5.4, 18.8, 1.9], [9, 14, 1.6]]) g.circle(x, y, r, 2);
      g.poly([[14, 3.4], [20.4, 3.4], [19.6, 13.6], [14.8, 13.6]], 4);
      g.poly([[14.7, 6.4], [19.7, 6.4], [19.1, 12.8], [15.3, 12.8]], 3);
      g.rect(14.7, 6.4, 19.7, 8.4, ICE, 3);
      g.circle(16.4, 18, 3.5, 5);
      g.speckle(0.3, 2, 5, 7);
      g.fill(() => true, LID(0), 1);
    },
  },
  {
    key: 'karahi', urdu: 'کڑاہی', title: 'Chicken Karahi', blurb: 'Straight from the dhaba.',
    w: 24, h: 22, palette: ['#5A6B75', '#C62828', '#8D5524', '#FF6E6E', '#43A047', '#FFCA28'],
    lanes: 4, trayCap: 4, min: 8, max: 18, run: [1, 3], seed: 163, lockAfter: [8], links: 3, mystery: 0.2, loadshed: { start: 4, every: 7, dur: 3 },
    draw(g) {
      g.ring(2.4, 11.5, 1.1, 2.3, 0); g.ring(21.6, 11.5, 1.1, 2.3, 0);
      g.ellipse(12, 12, 9.8, 8.2, 0);
      g.ellipse(12, 11.6, 8.4, 6.8, 1);
      for (const [x, y] of [[8.6, 9.6], [14, 8.6], [11.4, 13.6], [16, 13.2], [7.6, 14.2]]) g.circle(x, y, 1.6, 2);
      g.circle(11.6, 9.4, 1.2, 3); g.circle(15.6, 16, 1, 3);
      g.line(5.6, 11, 7.6, 7.6, 0.9, 4); g.line(16.6, 10.4, 18.6, 8.6, 0.9, 4);
      g.dots([[10, 6], [13, 11], [9, 12], [17, 12], [12, 16], [14, 15]], 5);
      g.rect(10, 12, 18, 18, LID(0), 2);
    },
  },
  {
    key: 'minar', urdu: 'مینارِ پاکستان', title: 'Minar-e-Pakistan Cake', blurb: 'The grand 14 August feast.',
    w: 28, h: 28, palette: ['#D99A4E', '#0E8A43', '#F7F7F7', '#FFC107', '#E53935', '#5D3A1A'],
    lanes: 4, trayCap: 3, min: 10, max: 24, run: [1, 3], seed: 181, lockAfter: [10, 18], links: 3, mystery: 0.2, loadshed: { start: 6, every: 8, dur: 3 },
    draw(g) {
      g.rect(2.5, 19, 25.5, 26.2, 0);
      g.rect(2.5, 21.2, 25.5, 22.3, 5);
      g.rect(1, 26.2, 27, 27.6, 2);
      g.rect(6, 12, 22, 19, 1);
      g.circle(10.5, 15.5, 2.6, 2, 1); g.circle(11.4, 15, 2.1, 1, 2);
      g.poly(starPts(13.6, 14.4, 1.2, 0.5), 2);
      g.poly([[13.2, 1.4], [14.8, 1.4], [16.6, 12], [11.4, 12]], 2);
      g.rect(12, 4.2, 16, 5, 5, 2); g.rect(11.6, 8, 16.4, 8.8, 5, 2);
      g.circle(14, 1.2, 1.2, 3);
      for (const x of [5, 9, 19, 23]) g.circle(x, 18.6, 1.1, 4);
      g.rect(2.5, 22.3, 25.5, 26.2, ICE, 0);
      g.fill(() => true, LID(0), 1);
      g.rect(0, 0, 28, 8.9, LID(1), 2);
    },
  },
];

const cache = new Map();

export function levelCount() { return LEVELS.length; }

export function levelDef(index) {
  const N = LEVELS.length;
  if (index < N) return LEVELS[index];
  // Remix: replay a picture with a harder deal and extra twists.
  const base = LEVELS[index % N];
  const round = Math.floor(index / N);
  return {
    ...base,
    remix: round,
    intro: undefined,
    seed: base.seed * 7919 + index * 104729,
    trayCap: Math.max(3, base.trayCap - 1),
    max: base.max + 2 * round,
    run: [1, 3],
    mystery: Math.max(base.mystery || 0, 0.25),
    links: (base.links || 0) + round,
    loadshed: base.loadshed || { start: 3, every: 7, dur: 2 },
  };
}

export function rasterize(def) {
  const g = makeGrid(def.w, def.h);
  def.draw(g);
  return g;
}

export function buildLevel(index) {
  if (cache.has(index)) return cache.get(index);
  const def = levelDef(index);
  const g = rasterize(def);
  const gen = generateLevel(
    { w: def.w, h: def.h, col: g.col, hp: g.hp, lockOf: g.lockOf, lockAfter: def.lockAfter || [] },
    { seed: def.seed, lanes: def.lanes, trayCap: def.trayCap, min: def.min, max: def.max, run: def.run, links: def.links || 0, mystery: def.mystery || 0 },
  );
  const level = { ...gen, index, def, palette: def.palette };
  cache.set(index, level);
  return level;
}

export function twistsOf(def) {
  const t = [];
  if (def.draw && rasterize(def).hp.some((v) => v > 1)) t.push('ice');
  if (def.mystery) t.push('mystery');
  if (def.lockAfter?.length) t.push('lock');
  if (def.links) t.push('link');
  if (def.loadshed) t.push('loadshed');
  return t;
}
