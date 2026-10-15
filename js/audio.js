// Tiny Web Audio synth: every sound is generated, nothing to download.
let ac = null, master = null, noiseBuf = null, muted = false;
let lastCrunch = 0;

export function initAudio() {
  if (!ac) {
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain();
      master.gain.value = 0.55;
      master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch { ac = null; }
  }
  if (ac && ac.state === 'suspended') ac.resume();
}

export function setMuted(m) { muted = m; }

function tone(freq, dur, { type = 'sine', vol = 0.2, at = 0, to = null } = {}) {
  if (!ac || muted) return;
  const t = ac.currentTime + at;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur, { vol = 0.15, freq = 2000, q = 1.5, at = 0 } = {}) {
  if (!ac || muted) return;
  const t = ac.currentTime + at;
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf;
  s.playbackRate.value = 0.8 + Math.random() * 0.4;
  f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t, Math.random() * 0.3); s.stop(t + dur);
}

export const sfx = {
  crunch() {
    if (!ac) return;
    const now = ac.currentTime;
    if (now - lastCrunch < 0.035) return;
    lastCrunch = now;
    noise(0.05, { vol: 0.12, freq: 1600 + Math.random() * 1800, q: 2 });
  },
  crack() { noise(0.09, { vol: 0.16, freq: 5200, q: 4 }); tone(2400, 0.06, { type: 'triangle', vol: 0.05 }); },
  send() { tone(420, 0.12, { type: 'triangle', vol: 0.16, to: 820 }); noise(0.12, { vol: 0.05, freq: 900, q: 0.8 }); },
  blocked() { tone(180, 0.18, { type: 'square', vol: 0.06, to: 130 }); },
  reveal() { tone(880, 0.08, { type: 'sine', vol: 0.08 }); tone(1320, 0.1, { type: 'sine', vol: 0.06, at: 0.05 }); },
  thaal() { tone(300, 0.15, { type: 'triangle', vol: 0.1, to: 240 }); },
  coin() { tone(1180, 0.07, { type: 'square', vol: 0.05 }); tone(1580, 0.12, { type: 'square', vol: 0.05, at: 0.06 }); },
  powerOff() { tone(520, 0.6, { type: 'sawtooth', vol: 0.07, to: 60 }); noise(0.05, { vol: 0.2, freq: 3000, at: 0.58 }); },
  powerOn() { noise(0.04, { vol: 0.2, freq: 3000 }); tone(70, 0.4, { type: 'sawtooth', vol: 0.05, to: 400, at: 0.04 }); },
  win() { [523, 659, 784, 1047, 1319].forEach((f, k) => tone(f, 0.22, { type: 'triangle', vol: 0.14, at: k * 0.09 })); },
  lose() { [392, 330, 262, 196].forEach((f, k) => tone(f, 0.28, { type: 'triangle', vol: 0.12, at: k * 0.14 })); },
};
