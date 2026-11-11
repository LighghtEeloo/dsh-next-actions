#!/usr/bin/env node
// soundtrack.mjs — 合成宣传短片的配乐与界面音效，输出 48 kHz 立体声 16-bit WAV。
//
// 用法: node soundtrack.mjs <promo.html> <out.wav>
//
// 所有时间点读自 promo.html 里的 <script id="timeline">，与画面共用一份 cue sheet；
// 改动画时间后重新运行即可保持同步。合成过程不依赖外部素材，同一输入输出按字节一致。
//
// 风格：lo-fi。温暖的电钢琴和弦 + 摇摆鼓组 + 圆润低音；界面音效全部是无音高的轻敲、点击和风声，
// 不用铃音。96 BPM，一小节 2.5 s，F 大调 I–iii–vi–IV–ii–V–I。时间为成片绝对时间：
//   0.0–2.5   开头：只有铺底缓慢升起，打出又删掉「继续」的按键声，输入框归位时一阵风声
//   2.5–5.0   Fmaj7  电钢琴进入，窗口出现
//   5.0–7.5   Am7    卡片出现：踩镲进入，三个按钮各一下轻敲
//   7.5–10.0  Dm9    点击落在下拍前：底鼓、军鼓与低音进入
//   10.0–12.5 Bbmaj7 打字声
//   12.5–14.4 Gm7 → C9sus4，鼓组收住，反向和弦吸入
//   14.375    Fmaj9 落点 = 片尾图标出现，随后淡出

import { readFileSync, writeFileSync } from 'node:fs';

const [page, outPath] = process.argv.slice(2);
if (!page || !outPath) {
  console.error('usage: node soundtrack.mjs <promo.html> <out.wav>');
  process.exit(64);
}
const block = readFileSync(page, 'utf8').match(/<script id="timeline" type="application\/json">([\s\S]*?)<\/script>/);
if (!block) {
  console.error(`soundtrack: no <script id="timeline"> block in ${page}`);
  process.exit(1);
}
const TIMELINE = JSON.parse(block[1]);
const I = TIMELINE.intro;

// Scene cues are relative to the end of the intro; shift them onto the film's clock.
const O = I.length;
const S = TIMELINE.scene;
const sh = (x) => O + x;
const T = {
  duration: TIMELINE.duration,
  rowIn: S.rowIn.map(sh),
  reveal: S.reveal.map(sh),
  chipsIn: [sh(S.chipsIn[0]), S.chipsIn[1]],
  click: sh(S.click),
  fly: S.fly.map(sh),
  fill: sh(S.fill),
  typedAt: S.typedAt.map(sh),
  sendClick: sh(S.sendClick),
  send: sh(S.send),
  used: sh(S.used),
  endHit: sh(S.endHit),
};

const SR = 48000;
const N = Math.round(T.duration * SR);
const BEAT = 60 / TIMELINE.bpm;
const BAR = 4 * BEAT;
const SIX = BEAT / 4;
const SWING = SIX * 0.18;
/** Bar 0 is the first bar of the chat scene, i.e. it starts when the intro ends. */
const at = (bar, sixteenth) => O + bar * BAR + sixteenth * SIX;

// ------------------------------------------------------------------ primitives

// Two buses: `keys` is ducked under the kick, `main` is not; both feed the reverb send.
const bus = {
  main: [new Float32Array(N), new Float32Array(N)],
  keys: [new Float32Array(N), new Float32Array(N)],
  mainSend: [new Float32Array(N), new Float32Array(N)],
  keysSend: [new Float32Array(N), new Float32Array(N)],
};

let seed = 0x2f6b1d3c;
function rand() {
  seed = (seed + 0x6d2b79f5) | 0;
  let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
}
const noise = () => rand() * 2 - 1;
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const TAU = 2 * Math.PI;

function render(seconds, fn) {
  const buf = new Float32Array(Math.max(1, Math.round(seconds * SR)));
  for (let i = 0; i < buf.length; i++) buf[i] = fn(i / SR, i);
  return buf;
}

/** Mix a mono buffer in at `t0` with equal-power pan and an optional reverb send. */
function place(buf, t0, { gain = 1, pan = 0, verb = 0, keys = false } = {}) {
  const [dry, send] = keys ? [bus.keys, bus.keysSend] : [bus.main, bus.mainSend];
  const i0 = Math.round(t0 * SR);
  const a = ((clamp(pan, -1, 1) + 1) * Math.PI) / 4;
  const gl = Math.cos(a) * gain, gr = Math.sin(a) * gain;
  for (let i = 0; i < buf.length; i++) {
    const j = i0 + i;
    if (j < 0) continue;
    if (j >= N) break;
    const s = buf[i];
    dry[0][j] += s * gl;
    dry[1][j] += s * gr;
    if (verb) {
      send[0][j] += s * gl * verb;
      send[1][j] += s * gr * verb;
    }
  }
}

/** RBJ biquad; `tune` keeps state so filters can sweep. */
function biquad(type, f, q = Math.SQRT1_2) {
  const fl = { x1: 0, x2: 0, y1: 0, y2: 0 };
  tune(fl, type, f, q);
  return fl;
}
function tune(fl, type, f, q) {
  const w = (TAU * clamp(f, 10, SR * 0.45)) / SR, c = Math.cos(w), s = Math.sin(w), al = s / (2 * q), a0 = 1 + al;
  let b0, b1, b2;
  if (type === 'lp') [b0, b1, b2] = [(1 - c) / 2, 1 - c, (1 - c) / 2];
  else if (type === 'hp') [b0, b1, b2] = [(1 + c) / 2, -(1 + c), (1 + c) / 2];
  else [b0, b1, b2] = [al, 0, -al];
  Object.assign(fl, { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: (-2 * c) / a0, a2: (1 - al) / a0 });
}
function run(fl, x) {
  const y = fl.b0 * x + fl.b1 * fl.x1 + fl.b2 * fl.x2 - fl.a1 * fl.y1 - fl.a2 * fl.y2;
  fl.x2 = fl.x1; fl.x1 = x; fl.y2 = fl.y1; fl.y1 = y;
  return y;
}

function polyBlep(p, dt) {
  if (p < dt) { p /= dt; return p + p - p * p - 1; }
  if (p > 1 - dt) { p = (p - 1) / dt; return p * p + p + p + 1; }
  return 0;
}

// ------------------------------------------------------------------ instruments

/**
 * Mellow electric-piano note: FM at ratio 1 with a low, fast-decaying index (warmth, no bell partials),
 * a little second harmonic, slow tremolo and a velocity-dependent low-pass.
 */
function epNote(m, dur, vel) {
  const f = mtof(m), lp = biquad('lp', 1100 + 900 * vel, 0.7), rel = 0.12;
  return render(dur + rel, (tt) => {
    const env = (1 - Math.exp(-tt / 0.005)) * Math.exp(-tt / 1.6) * (tt > dur ? Math.exp(-(tt - dur) / (rel / 4)) : 1);
    const idx = (0.3 + 0.5 * vel) * Math.exp(-tt / 0.25);
    const x = Math.sin(TAU * f * tt + idx * Math.sin(TAU * f * tt)) + 0.12 * Math.sin(2 * TAU * f * tt) * Math.exp(-tt / 0.3);
    return run(lp, x) * env * (1 + 0.12 * Math.sin(TAU * 4.8 * tt)) * vel;
  });
}

/** Strummed chord: notes 12 ms apart, spread across the stereo field. Returns the mono sum when `bounce`. */
function epChord(notes, t0, dur, vel, { gain = 0.13, bounce = false } = {}) {
  const strum = 0.012;
  const sum = bounce ? new Float32Array(Math.round((dur + 0.15 + strum * notes.length) * SR)) : null;
  notes.forEach((m, k) => {
    const buf = epNote(m, dur - k * strum, vel * (k === 0 ? 1 : 0.85));
    if (bounce) buf.forEach((s, i) => { sum[i + Math.round(k * strum * SR)] += s; });
    else place(buf, t0 + k * strum, { gain, pan: (k / (notes.length - 1) - 0.5) * 0.6, verb: 0.3, keys: true });
  });
  return sum;
}

/** Soft, dark detuned-saw pad under the keys. */
function pad(notes, t0, t1, { attack = 0.4, release = 0.7, gain = 0.035 } = {}) {
  const hold = t1 - t0;
  notes.forEach((m, k) => {
    for (const cents of [-6, 6]) {
      const f = mtof(m) * 2 ** (cents / 1200), dt = f / SR, lp = biquad('lp', 750, 0.6);
      let p = rand();
      const buf = render(hold + release, (tt) => {
        const v = 2 * p - 1 - polyBlep(p, dt);
        p += dt;
        if (p >= 1) p -= 1;
        const rise = Math.sin((Math.PI / 2) * Math.min(1, tt / attack)) ** 2;
        const fall = tt > hold ? Math.exp(-(tt - hold) / (release / 4)) : 1;
        return run(lp, v) * rise * fall;
      });
      place(buf, t0, { gain, pan: Math.sign(cents) * (k % 2 ? 0.5 : 0.3), verb: 0.4, keys: true });
    }
  });
}

const KICKS = [];
function kick(t0, gain = 0.42) {
  KICKS.push(t0);
  let ph = 0;
  const lp = biquad('lp', 1800);
  const buf = render(0.45, (tt) => {
    ph += (TAU * (42 + 70 * Math.exp(-tt / 0.04))) / SR;
    return run(lp, Math.tanh(1.4 * Math.sin(ph) * Math.exp(-tt / 0.22) * (1 - Math.exp(-tt / 0.002))));
  });
  place(buf, t0, { gain });
}

function noiseHit(t0, { len, decay, type, f, q = Math.SQRT1_2, gain, pan = 0, verb = 0 }) {
  const fl = biquad(type, f, q);
  const buf = render(len, (tt) => run(fl, noise()) * (1 - Math.exp(-tt / 0.0005)) * Math.exp(-tt / decay));
  place(buf, t0, { gain, pan, verb });
}

/** Short low sine thump; the "body" under taps, clicks and the snare. */
function thump(t0, f0, f1, decay, gain, pan = 0) {
  let ph = 0;
  const buf = render(decay * 6, (tt) => {
    ph += (TAU * (f1 + (f0 - f1) * Math.exp(-tt / 0.02))) / SR;
    return Math.sin(ph) * Math.exp(-tt / decay) * (1 - Math.exp(-tt / 0.001));
  });
  place(buf, t0, { gain, pan });
}

const hat = (t0, gain) => noiseHit(t0, { len: 0.1, decay: 0.022, type: 'bp', f: 6500, q: 0.7, gain, pan: 0.2 });
function snare(t0, gain = 0.12) {
  noiseHit(t0, { len: 0.35, decay: 0.08, type: 'bp', f: 1600, q: 0.8, gain, pan: -0.08, verb: 0.25 });
  thump(t0, 230, 185, 0.04, gain * 0.7);
}

function bass(m, t0, dur, gain = 0.22, decay = 1.4) {
  const f = mtof(m), lp = biquad('lp', 700);
  const buf = render(dur + 0.15, (tt) => {
    const body = Math.exp(-Math.min(tt, dur) / decay) * (tt > dur ? Math.exp(-(tt - dur) / 0.03) : 1);
    const x = Math.sin(TAU * f * tt) + 0.25 * Math.sin(2 * TAU * f * tt);
    return run(lp, Math.tanh(1.4 * x) * Math.min(1, tt / 0.015) * body);
  });
  place(buf, t0, { gain });
}

/** Band-passed noise whose centre glides f0 → f1 (whoosh / swell). */
function sweep(t0, t1, f0, f1, { gain = 0.07, q = 1.3, pan = 0, verb = 0.3, shape = (p) => Math.sin(Math.PI * p) ** 1.5 } = {}) {
  const len = t1 - t0, fl = biquad('bp', f0, q);
  const buf = render(len, (tt, i) => {
    const p = tt / len;
    if (i % 16 === 0) tune(fl, 'bp', f0 * (f1 / f0) ** p, q);
    return run(fl, noise()) * shape(p);
  });
  place(buf, t0, { gain, pan, verb });
}

/** Soft fingertip tap: a short noise tick over a low thump; no pitch you could hum. */
function tap(t0, gain, { f = 2400, pan = 0 } = {}) {
  noiseHit(t0, { len: 0.03, decay: 0.005, type: 'bp', f, q: 1.0, gain, pan });
  thump(t0, 170, 120, 0.012, gain * 0.8, pan);
}

/** Mouse click. */
function click(t0, gain = 0.28, pan = 0) {
  noiseHit(t0, { len: 0.02, decay: 0.0022, type: 'hp', f: 3000, gain, pan });
  thump(t0, 210, 160, 0.01, gain * 0.7, pan);
}

/** Keyboard key, slightly varied per stroke. */
function key(t0, gain) {
  const pan = (rand() - 0.5) * 0.3;
  noiseHit(t0, { len: 0.04, decay: 0.004, type: 'bp', f: 3000 + rand() * 700, q: 1.2, gain, pan });
  thump(t0, 160, 130, 0.008, gain * 0.5, pan);
}

function boom(t0, gain = 0.3) {
  thump(t0, 60, 38, 0.6, gain);
}

// ------------------------------------------------------------------ music

const CHORDS = [
  { bar: 0, notes: [53, 57, 60, 64], hits: [[0, 0.7], [10, 0.45]] },          // Fmaj7
  { bar: 1, notes: [55, 57, 60, 64], hits: [[0, 0.9], [6, 0.5], [10, 0.65]] }, // Am7
  { bar: 2, notes: [53, 57, 60, 64], hits: [[0, 1], [6, 0.55], [10, 0.7]] },   // Dm9 (over D)
  { bar: 3, notes: [53, 57, 58, 62], hits: [[0, 1], [6, 0.55], [10, 0.7]] },   // Bbmaj7
  { bar: 4, notes: [53, 55, 58, 62], hits: [[0, 1], [6, 0.55]] },              // Gm7, then C9sus4 below
];
for (const { bar, notes, hits } of CHORDS) {
  hits.forEach(([step, vel], i) => {
    const next = i + 1 < hits.length ? hits[i + 1][0] : 16;
    epChord(notes, at(bar, step), (next - step) * SIX, vel);
  });
  // The first pad starts with the film and swells slowly under the intro.
  if (bar === 0) pad(notes, 0, at(1, 0), { attack: O + 1.0, gain: 0.04 });
  else pad(notes, at(bar, 0), at(bar + 1, 0));
}
epChord([53, 55, 58, 62], at(4, 8), 0.3, 0.6);                                  // C9sus4 stab

// Reverse swell of the final chord, ending exactly on the hit.
const FINAL = [55, 57, 60, 64, 69];
const swell = epChord(FINAL, 0, 0.9, 0.8, { bounce: true }).reverse();
const swellLen = swell.length / SR;
swell.forEach((s, i, a) => { a[i] = s * Math.min(1, i / (0.2 * SR)); });
place(swell, T.endHit - swellLen, { gain: 0.12, verb: 0.3, keys: true });

epChord(FINAL, T.endHit, 2.6, 0.9);
pad(FINAL, T.endHit, T.duration - 1.4, { attack: 0.05, release: 1.4, gain: 0.04 });

// Drums: swung lo-fi pattern from the click on; hats alone while the card appears.
const swing = (step) => (step % 4 === 2 ? SWING : 0);
for (const step of [0, 2, 4, 6, 8, 10, 12, 14]) hat(at(1, step) + swing(step), step % 4 ? 0.022 : 0.012);
for (const bar of [2, 3]) {
  for (const step of [0, 6, 10]) kick(at(bar, step));
  for (const step of [4, 12]) snare(at(bar, step));
  for (const step of [0, 2, 4, 6, 8, 10, 12, 14]) hat(at(bar, step) + swing(step), step % 4 ? 0.035 : 0.02);
}
for (const step of [0, 6]) kick(at(4, step));
snare(at(4, 4));
for (const step of [0, 2, 4, 6]) hat(at(4, step) + swing(step), step % 4 ? 0.035 : 0.02);
sweep(at(4, 8), T.endHit, 400, 2500, { gain: 0.035, q: 0.8, verb: 0.2, shape: (p) => p ** 2 });
kick(T.endHit, 0.48);
boom(T.endHit);

for (const [bar, m] of [[2, 38], [3, 34]]) {
  bass(m, at(bar, 0), 5 * SIX);
  bass(m, at(bar, 6), 3 * SIX);
  bass(m, at(bar, 10), 5 * SIX);
}
bass(43, at(4, 0), 5 * SIX);
bass(43, at(4, 6), 2 * SIX);
bass(36, at(4, 8), T.endHit - at(4, 8) - 0.01);
bass(29, T.endHit, 2.0, 0.2, 1.0);

// ------------------------------------------------------------------ interface sounds (no pitched tones)

I.typed.forEach((t) => key(t, 0.12));                                                           // 开头：打出「继续」
I.erased.forEach((t) => key(t, 0.1));                                                           // 删掉
sweep(I.dock[0], I.dock[1] + 0.1, 2600, 700, { gain: 0.045, q: 1.0 });                          // 输入框归位

sweep(T.rowIn[0], T.reveal[0] + 0.05, 1200, 4000, { gain: 0.02, q: 2 });                       // 正在生成
[2000, 2300, 2600].forEach((f, i) => tap(T.chipsIn[0] + i * T.chipsIn[1], 0.06, { f, pan: -0.25 + i * 0.12 })); // 三个按钮
click(T.click, 0.28, -0.2);                                                                     // 点推荐按钮
sweep(T.fly[0], T.fly[1], 3200, 900, { gain: 0.06, q: 1.1, pan: -0.15 });                        // 指令飞向输入框
thump(T.fill, 220, 120, 0.05, 0.12);                                                            // 落入输入框
noiseHit(T.fill, { len: 0.03, decay: 0.006, type: 'bp', f: 1200, q: 1, gain: 0.05 });
T.typedAt.forEach((t) => key(t, 0.1 * (0.8 + 0.4 * rand())));                                   // 打字
click(T.sendClick, 0.28, 0.3);                                                                  // 点发送
sweep(T.send, T.send + 0.38, 700, 3800, { gain: 0.06, q: 1.2, pan: 0.2, shape: (p) => Math.sin(Math.PI * p) });
tap(T.used, 0.05, { f: 2200, pan: -0.25 });                                                     // 按钮变为「改后发送」
tap(T.used + 0.09, 0.04, { f: 2600, pan: -0.25 });

// ------------------------------------------------------------------ master

function freeverb(inL, inR, { room = 0.82, damp = 0.4 } = {}) {
  const k = SR / 44100;
  const line = (d) => ({ buf: new Float32Array(Math.round(d * k)), i: 0, store: 0 });
  const chan = (spread) => ({
    combs: [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((d) => line(d + spread)),
    aps: [556, 441, 341, 225].map((d) => line(d + spread)),
  });
  const chans = [chan(0), chan(23)];
  const out = [new Float32Array(N), new Float32Array(N)];
  for (let n = 0; n < N; n++) {
    const x = (inL[n] + inR[n]) * 0.015;
    for (let c = 0; c < 2; c++) {
      let y = 0;
      for (const cb of chans[c].combs) {
        const o = cb.buf[cb.i];
        cb.store = o * (1 - damp) + cb.store * damp;
        cb.buf[cb.i] = x + cb.store * room;
        if (++cb.i >= cb.buf.length) cb.i = 0;
        y += o;
      }
      for (const ap of chans[c].aps) {
        const b = ap.buf[ap.i];
        ap.buf[ap.i] = y + b * 0.5;
        if (++ap.i >= ap.buf.length) ap.i = 0;
        y = b - y;
      }
      out[c][n] = y;
    }
  }
  return out;
}

// Keys duck under each kick (fast dip, 140 ms recovery) so the groove breathes.
const duck = new Float32Array(N).fill(1);
for (const tk of KICKS) {
  const i0 = Math.round(tk * SR);
  for (let i = i0; i < Math.min(N, i0 + SR); i++) duck[i] = Math.min(duck[i], 1 - 0.3 * Math.exp(-(i - i0) / (0.14 * SR)));
}
const sendL = bus.mainSend[0].map((x, n) => x + bus.keysSend[0][n] * duck[n]);
const sendR = bus.mainSend[1].map((x, n) => x + bus.keysSend[1][n] * duck[n]);
const wet = freeverb(sendL, sendR);
const mix = [0, 1].map((c) => {
  const hp = biquad('hp', 28);
  return bus.main[c].map((x, n) => run(hp, x + bus.keys[c][n] * duck[n] + wet[c][n] * 1.1));
});

// Level: RMS to TARGET_RMS dBFS, soft knee above 0.7, peak at -1 dBFS; short fade at both ends.
const TARGET_RMS = -17.5;
let sum = 0;
for (let n = 0; n < N; n++) sum += (mix[0][n] ** 2 + mix[1][n] ** 2) / 2;
const scale = 10 ** (TARGET_RMS / 20) / Math.sqrt(sum / N);
const knee = (x) => {
  const a = Math.abs(x);
  return a < 0.7 ? x : Math.sign(x) * (0.7 + 0.3 * Math.tanh((a - 0.7) / 0.3));
};
let peak = 0;
for (const ch of mix) for (let n = 0; n < N; n++) {
  const fade = Math.min(1, n / (0.01 * SR), (N - n) / (0.25 * SR));
  ch[n] = knee(ch[n] * scale) * fade;
  peak = Math.max(peak, Math.abs(ch[n]));
}
const ceiling = 10 ** (-1 / 20);
if (peak > ceiling) for (const ch of mix) for (let n = 0; n < N; n++) ch[n] *= ceiling / peak;

const wav = Buffer.alloc(44 + N * 4);
wav.write('RIFF', 0);
wav.writeUInt32LE(36 + N * 4, 4);
wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(SR, 24);
wav.writeUInt32LE(SR * 4, 28);
wav.writeUInt16LE(4, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(N * 4, 40);
for (let n = 0; n < N; n++) {
  wav.writeInt16LE(Math.round(clamp(mix[0][n], -1, 1) * 32767), 44 + n * 4);
  wav.writeInt16LE(Math.round(clamp(mix[1][n], -1, 1) * 32767), 46 + n * 4);
}
writeFileSync(outPath, wav);
console.error(`soundtrack: ${T.duration}s, peak ${(20 * Math.log10(Math.min(peak, ceiling))).toFixed(1)} dBFS → ${outPath}`);
