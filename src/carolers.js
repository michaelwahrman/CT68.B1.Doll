// CT68.B1.Doll: the three caroler dolls as one object, for the page here and for any other three.js page
// (the Darkride). It holds what the page and an embedding page share:
//
//   Candles      the candle lights, the flame level (size and light) and the blow-out: the flames flicker, go out,
//                the dolls stand in the dark, and after a few seconds the flames light again
//   Performer    sing, talk, spin 360°, blink and auto blink
//   perlin1, fbm the signed Perlin noise of the noise channels; NoiseMixer runs a list of channels
//   createCarolers(THREE, options)   everything above, plus the dolls, in one group you add to your scene
//
// It imports only the rig. Pass THREE in (any three.js from r150 on; it was tested with r180).
// See EMBED.md for the API and embed/example.html for a working page.

import { buildDoll, placeDoll, CONTROLS, REST_POSE, OFFSETS, DOLL_ORDER, VERSION } from './doll_rig.js';

// ---------------- MIDI: the default CCs (the page's map table starts from these) ----------------
// buttons on MIDI: a CC going from below 64 to 64 or more presses the button
export const TRIGGERS = [
  { key: 'sing', label: 'Sing (on/off)', cc: 29, note: 'starts or stops singing' },
  { key: 'spin360', label: 'Spin 360°', cc: 30, note: 'one turn on the stand' },
  { key: 'rec', label: 'Record (on/off)', cc: 31, note: 'starts or stops recording (the page only)' },
  { key: 'blinkOnce', label: 'Blink', cc: 33, note: 'one blink' },
  { key: 'autoBlink', label: 'Auto blink (on/off)', cc: 34, note: 'blinks every 8 to 20 seconds' },
  { key: 'talk', label: 'Talk (on/off)', cc: 35, note: 'starts or stops talking' },
  { key: 'noise', label: 'Noise (on/off)', cc: 36, note: 'turns the enabled noise channels on or off' },
  { key: 'blowOut', label: 'Blow out candles', cc: 38, note: 'A7: the flames flicker and go out, then light again' },   // A7
];
// A7: continuous controls that are not part of the pose
export const LEVELS = [
  { key: 'flameLevel', label: 'Flame level', min: 0, max: 3, def: 1, unit: '', cc: 37, note: 'A7: the flames\' size and light; 1 is normal' },
];
export const MIDI_DEFAULTS = Object.fromEntries([...CONTROLS, ...TRIGGERS, ...LEVELS].map(c => [c.key, c.cc]));

// ---------------- A7: candles, flame level and blow-out ----------------
export const CANDLE_LIGHT = { color: '#ffa64d', intensity: 0.35, distance: 2.5, decay: 2 };
// seconds: flicker, then die down, stay dark, light again; each doll a little after the one before
export const BLOWOUT = { flicker: 1.6, die: 0.45, dark: 4, relight: 1.3, stagger: 0.22, darkness: 0.04 };
export const FLAME_MAX = 3;

// smooth value noise in −1..1 (deterministic, so a recording made twice is the same)
const hash1 = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return 2 * (s - Math.floor(s)) - 1; };
const vnoise = x => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash1(i) + (hash1(i + 1) - hash1(i)) * u; };
const smooth01 = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export class Candles {
  // rigs: from buildDoll. parent: where the candle lights go (the scene, or the dolls' group).
  // lights: false makes no lights (only the flames). shadowIndex: the doll whose light casts shadows (−1 none).
  // scale: the size the dolls are drawn at (lights reach and shine in proportion).
  constructor(THREE, rigs, { parent = null, lights = true, shadowIndex = 1, scale = 1, timing = {} } = {}) {
    this.THREE = THREE; this.rigs = rigs; this.parent = parent; this.scale = scale;
    this.timing = { ...BLOWOUT, ...timing };
    this.level = 1;            // 0 none … 1 normal … 3
    this.state = 'lit';        // 'lit' or 'out' (from the blow-out until every flame is lit again)
    this.t0 = 0; this.now = 0;
    this.mult = rigs.map(() => 1);   // each flame now, 0..~1.3, from the blow-out
    this.room = 1;             // 0..1: how lit the room is (the page dims its other lights by this; so can a host)
    this._lp = new THREE.Vector3();
    rigs.forEach((rig, i) => {
      rig.candleMaterials = rig.materials.filter(m => m.userData.part === 'candle');
      if (!lights) return;
      const L = new THREE.PointLight(CANDLE_LIGHT.color, CANDLE_LIGHT.intensity, CANDLE_LIGHT.distance * scale, CANDLE_LIGHT.decay);
      L.name = `${rig.doll.name}_candle_light`;
      L.castShadow = i === shadowIndex; L.shadow.mapSize.set(512, 512); L.shadow.bias = -0.002;
      (parent || rig.root.parent).add(L);
      rig.light = L;
    });
  }
  setLevel(v) { this.level = Math.max(0, Math.min(FLAME_MAX, +v || 0)); return this.level; }
  get length() { const T = this.timing; return T.flicker + T.die + T.dark + T.relight + T.stagger * (this.rigs.length - 1); }
  // the flames flicker and go out, then light again after timing.dark seconds. false if they are already out.
  blowOut(opts = {}) {
    if (this.state !== 'lit') return false;
    if (opts.dark !== undefined) this.timing.dark = Math.max(0, +opts.dark);
    this.state = 'out'; this.t0 = this.now; return true;
  }
  // light them now (skips the rest of the dark). false if they are not out.
  relight() {
    if (this.state !== 'out') return false;
    const T = this.timing, u = this.now - this.t0, at = T.flicker + T.die + T.dark;
    if (u < at) this.t0 = this.now - at;
    return true;
  }
  // phase now: 'lit', 'flicker', 'dying', 'dark' or 'relight' (of the first doll)
  get phase() {
    if (this.state === 'lit') return 'lit';
    const T = this.timing, u = this.now - this.t0;
    return u < T.flicker ? 'flicker' : u < T.flicker + T.die ? 'dying' : u < T.flicker + T.die + T.dark ? 'dark' : 'relight';
  }
  // one flame's strength at u seconds into the blow-out
  _mult(u, i) {
    const T = this.timing;
    if (u < 0) return 1;
    const n = vnoise(u * 16 + i * 9.3) * 0.6 + vnoise(u * 37 + i * 4.1) * 0.4;
    if (u < T.flicker) {                         // gutters harder and harder
      const s = u / T.flicker;
      return Math.max(0.12, (1 - 0.45 * s) * (1 + (0.25 + 0.55 * s) * n));
    }
    u -= T.flicker;
    if (u < T.die) { const s = u / T.die; return 0.55 * (1 - s) ** 2 * (1 + 0.4 * n); }
    u -= T.die;
    if (u < T.dark) return 0;
    u -= T.dark;
    if (u < T.relight) {                         // catches, sputters, a small flare, settles
      const s = u / T.relight;
      return smooth01(s * 1.6) * (1 + 0.35 * Math.sin(s * Math.PI) * (1 + n)) * (s < 0.08 ? 0.3 : 1);
    }
    return 1;
  }
  // call once a frame after the rigs are posed: t in seconds. Moves the flames and the lights.
  update(t) {
    this.now = t;
    const T = this.timing, lp = this._lp;
    let sum = 0, done = true;
    const size = this.level <= 0 ? 0 : Math.sqrt(this.level);
    this.rigs.forEach((rig, i) => {
      const f = rig.tick(t);                       // the rig's own flicker (0.75..1.25)
      let m = 1, wild = 0;
      if (this.state === 'out') {
        const u = t - this.t0 - i * T.stagger;
        m = this._mult(u, i);
        if (u < T.flicker + T.die + T.dark + T.relight) done = false;
        if (u > 0 && u < T.flicker + T.die) wild = Math.min(1, u / T.flicker);
      }
      this.mult[i] = m;
      sum += Math.min(1, m);
      const s = size * m;
      rig.flame.visible = s > 0.02;
      rig.flame.scale.multiplyScalar(Math.max(1e-4, s));
      if (wild) {                                   // lean and stretch while it gutters
        rig.flame.rotation.z += 0.5 * wild * vnoise(t * 9 + i * 3);
        rig.flame.scale.y *= 1 + 0.5 * wild * vnoise(t * 21 + i);
      }
      for (const cm of rig.candleMaterials) cm.emissiveIntensity = 0.12 * Math.min(2, this.level * m);
      if (rig.light) {
        rig.lightAt.getWorldPosition(lp);
        const par = rig.light.parent;
        if (par) par.worldToLocal(lp);
        rig.light.position.copy(lp);
        rig.light.intensity = CANDLE_LIGHT.intensity * this.scale * this.scale * f * this.level * m;
        rig.light.distance = CANDLE_LIGHT.distance * this.scale * Math.sqrt(Math.max(0.25, this.level));
        rig.light.visible = rig.light.intensity > 0;
      }
    });
    if (this.state === 'out' && done) { this.state = 'lit'; this.mult.fill(1); }
    const want = T.darkness + (1 - T.darkness) * (sum / Math.max(1, this.rigs.length));
    const dt = this._lastT === undefined ? 1 : Math.max(0, Math.min(1, t - this._lastT)); this._lastT = t;
    this.room += (want - this.room) * (1 - Math.exp(-dt / 0.05));   // eased over about 0.05 s, at any frame rate
    return this.room;
  }
  // for exports: the candles' light now, as a multiple of normal
  get exportLevel() { return this.level * this.mult.reduce((a, b) => a + Math.min(1, b), 0) / Math.max(1, this.mult.length); }
}

// ---------------- sing, talk, spin and blink (A2..A6, moved here from the page in A7) ----------------
// A line of words becomes one mouth shape per syllable. The vowel sets the shape: how open, and rounded
// ("oo", −) or wide ("ee", +). Syllables starting with m, b, p, f, v or w close the lips first. '|' is a pause.
const VOWEL = { a: [0.85, 0.15], e: [0.5, 0.7], i: [0.38, 0.95], y: [0.38, 0.9], o: [0.72, -0.75], u: [0.45, -0.95] };
export function timeline(text, { syl, hold, gap, pause }) {
  const notes = [];
  let t = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (word === '|') { t += pause; continue; }
    const syls = word.split('-').filter(Boolean);
    syls.forEach((sy, i) => {
      const v = (sy.toLowerCase().match(/oo|ow|[aeiouy]/) || ['a'])[0];
      const [open, shape] = v === 'oo' ? [0.45, -1] : v === 'ow' ? [0.7, -0.8] : VOWEL[v];
      const dur = syl * (/[,.?!]$/.test(sy) || (i === syls.length - 1 && hold.test(sy)) ? 2 : 1);
      notes.push({ t, dur, syl: sy, open, shape, closed: /^[mbpfvw]/i.test(sy) });
      t += dur;
    });
    t += gap;
  }
  return { notes, length: t };
}
// the mouth at time st in a timeline: open and shape
export function mouthAt(tl, st, scale) {
  for (const n of tl.notes) {
    if (st < n.t || st >= n.t + n.dur) continue;
    const u = (st - n.t) / n.dur;
    const env = (n.closed && u < 0.15 ? 0.05 : Math.min(1, u / 0.22)) * (1 - 0.5 * Math.max(0, (u - 0.6) / 0.4));
    return { open: scale * n.open * env, shape: n.shape, note: n };
  }
  return { open: 0, shape: 0, note: null };
}
export const LYRIC = 'Bright the can-dles glow-ing, | soft the snow is fall-ing, | sing we, sing we, all to-geth-er, | all the win-ter night long |';
export const SONG = timeline(LYRIC, { syl: 0.34, hold: /long|night/, gap: 0, pause: 0.55 });
// A3: talking: quicker, smaller syllables in phrases, with pauses between them
export const SPEECH = 'Good eve-ning to you all. | We have come a long way to sing for you to-night. | Is it not a love-ly win-ter? | ' +
  'The snow is soft, and the can-dles are bright. | Will you sing with us? |';
export const TALK = timeline(SPEECH, { syl: 0.16, hold: /^$/, gap: 0.05, pause: 0.7 });
// A5: a slower blink: shut in 0.16 s, held 0.08 s, open in 0.28 s
export const B_SHUT = 0.16, B_HOLD = 0.08, B_OPEN = 0.28, B_LEN = B_SHUT + B_HOLD + B_OPEN;
export const blinkShape = u => (u < 0 ? 0 : u < B_SHUT ? 0.5 - 0.5 * Math.cos(u / B_SHUT * Math.PI) : u < B_SHUT + B_HOLD ? 1
  : u < B_LEN ? 0.5 + 0.5 * Math.cos((u - B_SHUT - B_HOLD) / B_OPEN * Math.PI) : 0);

export class Performer {
  constructor(seed = 12345) {
    this.singing = false; this.talking = false; this.actT0 = 0; this.spinT0 = null; this.eyeNext = 0; this.now = 0;
    this.autoBlink = true; this.blinkT0 = null; this.blinkNext = 5; this.blinkAgain = false;   // A5: on, but rare
    this.eyeAim = { x: 0, y: 0 };
    this.perf = { headTurn: 0, headNod: 0, eyeX: 0, eyeY: 0, spin: 0, blink: 0 };   // added on top of the pose
    this.seed = seed;   // a seeded random, so a recording made twice moves the same way
  }
  rnd() { return ((this.seed = (this.seed * 16807) % 2147483647) / 2147483647); }
  // Sing and Talk: starting one stops the other
  setAct(kind, on) { this.singing = kind === 'sing' && on; this.talking = kind === 'talk' && on; this.actT0 = this.now; this.eyeNext = 0; }
  setSing(on) { this.setAct('sing', on); }
  setTalk(on) { this.setAct('talk', on); }
  spin() { this.spinT0 = this.now; }
  get spinning() { return this.spinT0 !== null; }
  blink() { this.blinkT0 = this.now; }
  setAutoBlink(on) { this.autoBlink = on; this.blinkNext = this.now + 1; }
  // t in seconds. Fills this.perf and returns the targets it sets ({ mouthOpen, mouthShape, sway }), or null.
  // this.spinEnded is true on the frame a spin finishes.
  update(t) {
    this.now = t; this.spinEnded = false;
    const perf = this.perf, eyeAim = this.eyeAim;
    for (const k in perf) perf[k] = 0;
    let targets = null;
    if (this.singing) {
      // A3: simpler: the mouth, a slight sway and a slight turn of the head with it
      const ts = t - this.actT0, m = mouthAt(SONG, ts % (SONG.length + 1.2), 0.85);   // the line, then a breath, over and over
      const ph = ts * Math.PI / 2.72;                                                // one sway each way per two bars
      targets = { mouthOpen: m.open, mouthShape: m.shape, sway: 0.3 * Math.sin(ph) };
      perf.headTurn = 5 * Math.sin(ph - 0.5);
    } else if (this.talking) {
      const ts = t - this.actT0, st = ts % (TALK.length + 1.5), m = mouthAt(TALK, st, 0.55);
      targets = { mouthOpen: m.open, mouthShape: m.shape * 0.7 };
      // small nods that follow the words, a slow turn, and glances now and then
      const speaking = m.note ? 1 : 0;
      perf.headNod = 1.6 * speaking * Math.sin(st * 2 * Math.PI / 0.9) + 1.5 * Math.sin(ts * 0.6);
      perf.headTurn = 6 * Math.sin(ts * 0.31) + 2 * Math.sin(ts * 0.9 + 1);
      if (t >= this.eyeNext) {
        eyeAim.x = this.rnd() < 0.5 ? 0 : (this.rnd() - 0.5) * 0.5; eyeAim.y = (this.rnd() - 0.4) * 0.25;
        this.eyeNext = t + 1.2 + this.rnd() * 2;
      }
      perf.eyeX = eyeAim.x; perf.eyeY = eyeAim.y;
    }
    if (!this.talking) eyeAim.x = eyeAim.y = 0;
    if (this.spinT0 !== null) {
      const u = Math.min(1, (t - this.spinT0) / 3.2);
      perf.spin = 360 * (u * u * (3 - 2 * u));
      if (u >= 1) { this.spinT0 = null; perf.spin = 0; this.spinEnded = true; }
    }
    // A5: blinks, on the button or very occasionally (every 8 to 20 s, now and then twice)
    if (this.autoBlink && t >= this.blinkNext && (this.blinkT0 === null || t - this.blinkT0 > B_LEN + 0.05)) {
      this.blinkT0 = t; this.blinkAgain = this.rnd() < 0.1; this.blinkNext = t + 8 + this.rnd() * 12;
    }
    if (this.blinkT0 !== null) {
      const u = t - this.blinkT0;
      perf.blink = blinkShape(u);
      if (u > B_LEN + 0.05) { if (this.blinkAgain) { this.blinkAgain = false; this.blinkT0 = t; } else this.blinkT0 = null; }
    }
    return targets;
  }
}

// ---------------- A3: signed Perlin noise ----------------
// Signed 1D Perlin (gradient) noise, summed over octaves (fBm): each octave at twice the frequency and half the
// size, divided by the total so the result stays within −1..1. Every channel has its own seed.
export function perlin1(seed) {
  const g = new Float32Array(512);
  let s = (seed * 9301 + 49297) % 233280 || 1;
  for (let i = 0; i < 512; i++) { s = (s * 16807) % 2147483647; g[i] = (s / 2147483647) * 2 - 1; }
  return x => {
    const i = Math.floor(x), f = x - i, a = g[i & 511], b = g[(i + 1) & 511];
    const u = f * f * f * (f * (f * 6 - 15) + 10);
    return 2 * (a * f + (b * (f - 1) - a * f) * u);   // gradient noise is within about ±0.5; ×2 for ±1
  };
}
export function fbm(n, x, oct) {
  let sum = 0, amp = 1, norm = 0, fr = 1;
  for (let o = 0; o < oct; o++) { sum += amp * n(x * fr + o * 31.7); norm += amp; amp *= 0.5; fr *= 2; }
  return Math.max(-1, Math.min(1, sum / norm));
}
// a list of channels { part, axis, amp (degrees), oct, mult (coordinate ×), seed, on } as on the page.
// update(t) returns the offsets { 'head.yaw': degrees, … } for rig.setOffsets.
export class NoiseMixer {
  constructor(channels = []) { this.channels = channels; this.all = 1; this.phase = new Map(); this.fns = new Map(); this.last = null; this.out = {}; }
  update(t) {
    const dt = this.last === null ? 0 : Math.max(0, Math.min(0.1, t - this.last)); this.last = t;
    const out = this.out; for (const k in out) delete out[k];
    this.channels.forEach((c, i) => {
      const seed = c.seed ?? i + 1;
      const ph = (this.phase.get(seed) || 0) + dt * (c.mult ?? 0.35) * this.all;
      this.phase.set(seed, ph);
      if (c.on === false || !c.amp) return;
      if (!this.fns.has(seed)) this.fns.set(seed, perlin1(seed));
      const k = `${c.part}.${c.axis}`;
      out[k] = (out[k] || 0) + c.amp * fbm(this.fns.get(seed), ph, c.oct ?? 3);
    });
    return out;
  }
}

// ---------------- the dolls' files ----------------
// From a folder laid out as CT68's dolls/ (dolls/<name>/doll.json and its tex/), served over http(s).
export async function loadDollData(baseUrl) {
  const base = String(baseUrl || new URL('../dolls/', import.meta.url).href).replace(/\/?$/, '/');
  return Promise.all(DOLL_ORDER.map(async n => {
    const r = await fetch(`${base}${n}/doll.json`);
    if (!r.ok) throw new Error(`cannot load ${base}${n}/doll.json (${r.status})`);
    const doll = await r.json();
    const data = {};
    for (const [k, f] of Object.entries(doll.textures)) data[k] = `${base}${n}/${f}`;
    return { doll, data };
  }));
}
export function loadDollTextures(THREE, d, anisotropy = 8) {
  const loader = new THREE.TextureLoader(), tx = {};
  return Promise.all(Object.entries(d.data).map(([k, src]) => new Promise((res, rej) => loader.load(src, t => {
    t.colorSpace = k !== 'faceMask' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = anisotropy; tx[k] = t; res();
  }, undefined, () => rej(new Error(`cannot load the texture ${k} of ${d.doll.name}`)))))).then(() => tx);
}

// ---------------- createCarolers: the whole thing, for another page ----------------
// options (all optional):
//   dolls        the dolls' data ([{ doll, data }], as the packed bundle has it); else loaded from baseUrl
//   baseUrl      the dolls/ folder (default: ../dolls/ next to this file)
//   scale        the size of the dolls (1: about 1 unit tall, standing on y = 0, the row 1.6 wide)
//   lights       true: each candle has a point light (added to the group)
//   roomLights   your own lights to dim when the candles go out (their intensity now is taken as full)
//   singing, talking, autoBlink, flameLevel, hair ({ line, thick, opacity }), noise ([channels]), blowout (timing)
export async function createCarolers(THREE, opts = {}) {
  const { scale = 1, lights = true, singing = false, talking = false, autoBlink = true, flameLevel = 1 } = opts;
  const data = opts.dolls || await loadDollData(opts.baseUrl);
  const group = new THREE.Group(); group.name = 'ct68_carolers'; group.scale.setScalar(scale);
  const rigs = [];
  for (const [i, d] of data.entries()) {
    const rig = buildDoll(THREE, d.doll, await loadDollTextures(THREE, d));
    group.add(rig.root); placeDoll(rig, i); rigs.push(rig);
  }
  if (opts.hair) for (const r of rigs) r.setHair(opts.hair);
  const candles = new Candles(THREE, rigs, { parent: group, lights, scale, timing: opts.blowout });
  candles.setLevel(flameLevel);
  const performer = new Performer();
  performer.setAutoBlink(autoBlink);
  if (singing) performer.setSing(true); else if (talking) performer.setTalk(true);
  const noise = new NoiseMixer(opts.noise || []);
  const room = [];
  const addRoomLight = l => { room.push({ light: l, full: l.intensity }); };
  (opts.roomLights || []).forEach(addRoomLight);

  const target = { ...REST_POSE }, current = { ...REST_POSE }, shown = { ...REST_POSE };
  const eyeNow = { x: 0, y: 0 };
  const clampC = (c, v) => Math.max(c.min, Math.min(c.max, v));
  const listeners = new Set();
  let last = null, noiseOn = !!(opts.noise && opts.noise.length);
  const ccHigh = {}, map = { ...MIDI_DEFAULTS, ...(opts.midiMap || {}) };
  const emit = (type, detail) => { for (const f of listeners) f(type, detail); };

  const api = {
    VERSION, group, rigs, candles, performer, noise, CONTROLS, OFFSETS, TRIGGERS, LEVELS, midiMap: map,
    target, shown,
    // the pose: { headTurn, headNod, armRaise, eyeX, eyeY, mouthOpen, mouthShape, sway, spin, blink } (see CONTROLS).
    // Eased toward over about 0.06 s; now = true jumps there.
    setPose(p, now = false) {
      for (const c of CONTROLS) if (p[c.key] !== undefined) { target[c.key] = clampC(c, +p[c.key]); if (now) current[c.key] = target[c.key]; }
    },
    // a control from 0..1 (as from a MIDI fader, value / 127)
    setControl01(key, u) { const c = CONTROLS.find(q => q.key === key); if (c) api.setPose({ [key]: c.min + (c.max - c.min) * u }); },
    resetPose() { api.setPose(REST_POSE); },
    sing(on = !performer.singing) { performer.setSing(on); if (!on) api.setPose({ mouthOpen: 0, mouthShape: 0, sway: 0 }); emit('sing', on); return on; },
    talk(on = !performer.talking) { performer.setTalk(on); if (!on) api.setPose({ mouthOpen: 0, mouthShape: 0, sway: 0 }); emit('talk', on); return on; },
    get singing() { return performer.singing; }, get talking() { return performer.talking; },
    spin360() { performer.spin(); },
    blink() { performer.blink(); },
    setAutoBlink(on) { performer.setAutoBlink(on); },
    // A7 candles
    blowOut(o) { const ok = candles.blowOut(o); if (ok) emit('blowout', candles.timing); return ok; },
    relight() { return candles.relight(); },
    setFlameLevel(v) { return candles.setLevel(v); },
    get flameLevel() { return candles.level; },
    get flamePhase() { return candles.phase; },
    get roomLight() { return candles.room; },          // 0..1: dim your own lights by this if you did not pass them
    addRoomLight,
    setHair(h) { for (const r of rigs) r.setHair(h); },
    setNoise(channels, on = true) { if (channels) noise.channels = channels; noiseOn = on; },
    // the dolls' own MIDI map (see MIDI_DEFAULTS). Returns true if the CC did something.
    handleCC(cc, value) {
      let used = false;
      for (const c of CONTROLS) if (map[c.key] === cc) { api.setControl01(c.key, value / 127); used = true; }
      if (map.flameLevel === cc) { candles.setLevel(LEVELS[0].min + (LEVELS[0].max - LEVELS[0].min) * value / 127); used = true; }
      const press = value >= 64 && !ccHigh[cc]; ccHigh[cc] = value >= 64;
      for (const c of TRIGGERS) if (map[c.key] === cc) {
        used = true; if (!press) continue;
        if (c.key === 'sing') api.sing(); else if (c.key === 'talk') api.talk(); else if (c.key === 'spin360') api.spin360();
        else if (c.key === 'blinkOnce') api.blink(); else if (c.key === 'autoBlink') api.setAutoBlink(!performer.autoBlink);
        else if (c.key === 'noise') noiseOn = !noiseOn; else if (c.key === 'blowOut') api.blowOut();
      }
      return used;
    },
    // a raw Web MIDI message (ev.data or [status, d1, d2]); control changes on any channel
    handleMIDI(msg) { const d = msg.data || msg; return (d[0] & 0xf0) === 0xb0 ? api.handleCC(d[1], d[2]) : false; },
    on(f) { listeners.add(f); return () => listeners.delete(f); },
    // call once a frame, with the time in seconds (any clock that runs forward: performance.now() / 1000 will do)
    update(t) {
      const dt = last === null ? 0 : Math.max(0, Math.min(0.1, t - last)); last = t;
      const tg = performer.update(t);
      if (tg) api.setPose(tg);
      if (performer.spinEnded) emit('spinEnd');
      const off = noiseOn ? noise.update(t) : (noise.update(t), {});
      const k = 1 - Math.exp(-dt / 0.06), ke = 1 - Math.exp(-dt / 0.05), perf = performer.perf;
      eyeNow.x += (perf.eyeX - eyeNow.x) * ke; eyeNow.y += (perf.eyeY - eyeNow.y) * ke;
      for (const c of CONTROLS) {
        current[c.key] += (target[c.key] - current[c.key]) * k;
        let v = current[c.key] + (c.key === 'eyeX' ? eyeNow.x : c.key === 'eyeY' ? eyeNow.y : perf[c.key] || 0);
        shown[c.key] = c.key === 'spin' ? ((v % 360) + 360) % 360 : clampC(c, v);
      }
      for (const r of rigs) { for (const q in r.offsets) delete r.offsets[q]; Object.assign(r.offsets, off); r.setPose(shown); }
      const lit = candles.update(t);
      for (const { light, full } of room) light.intensity = full * lit;
      return lit;
    },
    dispose() {
      group.removeFromParent();
      group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.isLight && o.dispose) o.dispose(); });
      for (const r of rigs) for (const m of [...r.materials, ...r.flameMaterials]) { if (m.map) m.map.dispose(); m.dispose(); }
      listeners.clear();
    },
  };
  return api;
}
