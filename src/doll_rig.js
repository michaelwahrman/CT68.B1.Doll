// CT68.A4.Doll (from A1): the caroler doll rig. One builder makes every doll; a doll differs only by its doll.json
// (made by tools/doll_textures.py from a photograph and a spec) and its textures.
// Shared by the browser page and the Node exporter. It imports nothing: pass THREE in.
//
//   const rig = buildDoll(THREE, doll, textures)   // textures: { face, faceMask, eye, dress, ... } or {} in Node
//   rig.setPose({ headTurn: 30, armRaise: 0.5, eyeX: -0.4 })
//   rig.tick(seconds)                              // candle flicker
//   rig.root                                       // add it to the scene
//
// Y is up, the doll faces +Z, she stands on y = 0 and is about 1 unit tall (her candle arm is her left, +X).
// Every mesh has UVs 0..1 of its own; how often a fabric repeats is in material.userData.repeat.

export const CONTROLS = [
  { key: 'headTurn', label: 'Head turn',        min: -70, max: 70, def: 0, unit: '°', cc: 20, note: '− her right, + her left' },
  { key: 'headNod',  label: 'Head nod',         min: -25, max: 25, def: 0, unit: '°', cc: 21, note: '− down, + up' },
  { key: 'armRaise', label: 'Raise candle arm', min: 0,   max: 1,  def: 0, unit: '',  cc: 22, note: '0 at her waist, 1 held high' },
  { key: 'eyeX',     label: 'Eyes left/right',  min: -1,  max: 1,  def: 0, unit: '',  cc: 23, note: '− her right, + her left (±30°)' },
  { key: 'eyeY',     label: 'Eyes up/down',     min: -1,  max: 1,  def: 0, unit: '',  cc: 24, note: '− down, + up (±20°)' },
  // A2
  { key: 'mouthOpen',  label: 'Mouth open',     min: 0,   max: 1,  def: 0, unit: '',  cc: 25, note: '0 closed, 1 wide open' },
  { key: 'mouthShape', label: 'Mouth shape',    min: -1,  max: 1,  def: 0, unit: '',  cc: 26, note: '− rounded "oo", + wide "ee"' },
  { key: 'sway',       label: 'Body sway',      min: -1,  max: 1,  def: 0, unit: '',  cc: 27, note: '− to her right, + to her left (±6°)' },
  { key: 'spin',       label: 'Spin',           min: 0,   max: 360, def: 0, unit: '°', cc: 28, note: 'turns each doll on her stand' },
  // A3
  { key: 'blink',      label: 'Eyelids',        min: 0,   max: 1,  def: 0, unit: '',  cc: 32, note: '0 open, 1 closed' },
];
// A3: the parts and axes the page's Perlin-noise channels can move, as offsets in degrees on top of the pose
// (rig.setOffsets({ 'head.yaw': 3, 'body.roll': -1 })). Eyes are in degrees of gaze.
export const OFFSETS = [
  { part: 'head', label: 'Head', axes: [['yaw', 'Yaw (turn)'], ['pitch', 'Pitch (nod)'], ['roll', 'Roll (tilt)']] },
  { part: 'eyes', label: 'Eyes', axes: [['yaw', 'Left/right'], ['pitch', 'Up/down']] },
  { part: 'body', label: 'Body (from her feet)', axes: [['roll', 'Roll (sway)'], ['yaw', 'Yaw (twist)'], ['pitch', 'Pitch (lean)']] },
  { part: 'armL', label: 'Candle arm', axes: [['pitch', 'Pitch (forward)'], ['roll', 'Roll (out)'], ['yaw', 'Yaw (twist)']] },
  { part: 'armR', label: 'Other arm', axes: [['pitch', 'Pitch (forward)'], ['roll', 'Roll (out)'], ['yaw', 'Yaw (twist)']] },
  { part: 'spin', label: 'Whole doll', axes: [['yaw', 'Yaw (on her stand)']] },
];
export const REST_POSE = Object.fromEntries(CONTROLS.map(c => [c.key, c.def]));

const D2R = Math.PI / 180;
// the head's size and place
const NECK_Y = 0.765, HEAD_UP = 0.1, RX = 0.1, RY = 0.112, RZ = 0.098;
const SLIT = 0.012;   // half height of the lip slit cut in face_mask.png, in face units (tools/doll_textures.py: SLIT)
const SQUEEZE = 0.15; // how far the slit is squeezed shut when the mouth is closed (1 = not at all)

// a sphere whose rows and columns crowd together where detail is wanted. dTheta(θ), dPhi(φ): density;
// θ from the top pole, φ round from the front (+Z). Same layout as SphereGeometry (rows of W+1, UVs 0..1).
function spacing(n, lo, hi, dens) {
  const M = 4000, cs = [0];
  for (let i = 1; i <= M; i++) cs.push(cs[i - 1] + dens(lo + (hi - lo) * (i - 0.5) / M));
  const out = []; let k = 0;
  for (let j = 0; j <= n; j++) {
    const c = cs[M] * j / n;
    while (k < M - 1 && cs[k + 1] < c) k++;
    const f = (c - cs[k]) / ((cs[k + 1] - cs[k]) || 1);
    out.push(lo + (hi - lo) * (k + f) / M);
  }
  return out;
}
function denseSphere(THREE, W, H, dTheta, dPhi) {
  const th = spacing(H, 0, Math.PI, dTheta), ph = spacing(W, -Math.PI, Math.PI, dPhi);
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= H; j++) for (let i = 0; i <= W; i++) {
    const s = Math.sin(th[j]);
    pos.push(s * Math.sin(ph[i]), Math.cos(th[j]), s * Math.cos(ph[i]));
    uv.push(i / W, 1 - j / H);
  }
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const a = j * (W + 1) + i, b = a + W + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export function buildDoll(THREE, doll, textures = {}) {
  const P = doll.params || {};
  const mats = [];
  const root = new THREE.Group();
  root.name = `doll_${doll.name}`;

  // ---------------- materials ----------------
  function mat(name, tex, opts = {}) {
    const { repeat = [1, 1], color = '#ffffff', rough = 0.85, metal = 0, side = THREE.FrontSide, alphaMap = null, emissive = null } = opts;
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, side });
    if (tex && textures[tex]) { m.map = textures[tex].clone(); m.map.repeat.set(repeat[0], repeat[1]); m.map.needsUpdate = true; }
    if (alphaMap && textures[alphaMap]) { m.alphaMap = textures[alphaMap]; m.alphaTest = 0.5; }
    if (emissive) { m.emissive = new THREE.Color(emissive.color); m.emissiveIntensity = emissive.intensity; }
    m.name = `${doll.name}_${name}`;
    m.userData = { part: name, tex, repeat, color, rough, metal, alphaMap, doubleSided: side === THREE.DoubleSide, emissive };
    mats.push(m);
    return m;
  }
  const M = {
    face:    mat('face', 'face', { rough: 0.32, alphaMap: 'faceMask', side: THREE.DoubleSide }),
    skin:    mat('skin', null, { color: doll.skin, rough: 0.35 }),
    eye:     mat('eye', 'eye', { rough: 0.08 }),
    hair:    mat('hair', 'hair', { repeat: [4, 2], rough: 0.9, side: THREE.DoubleSide }),
    curl:    mat('curl', 'hair', { repeat: [1, 2], rough: 0.9 }),
    bonnet:  mat('bonnet', 'bonnet', { repeat: [3, 2], side: THREE.DoubleSide }),
    brim:    mat('brim', 'bonnet', { repeat: [6, 1], side: THREE.DoubleSide }),
    lace:    mat('lace', 'lace', { repeat: [6, 1], side: THREE.DoubleSide }),
    bodice:  mat('bodice', 'lace', { repeat: [3, 1] }),
    dress:   mat('dress', 'dress', { repeat: P.dressRepeat || [3, 2], side: THREE.DoubleSide }),
    sleeve:  mat('sleeve', 'sleeve', { repeat: [2, 1] }),
    ribbon:  mat('ribbon', 'ribbon', { repeat: [1, 2], rough: 0.6, side: THREE.DoubleSide }),
    candle:  mat('candle', 'candle', { rough: 0.55, emissive: { color: '#ffcf8a', intensity: 0.12 } }),
    holder:  mat('holder', P.holder ? 'holder' : null, { color: P.holder ? '#ffffff' : '#3a2a1c', rough: 0.45, metal: 0.55, repeat: [2, 1] }),
    base:    mat('base', null, { color: '#2a1d14', rough: 0.6 }),
    socket:  mat('socket', null, { color: '#1a0f0a', rough: 0.9 }),
    mouth:   mat('mouth', null, { color: '#240707', rough: 0.85 }),
    teeth:   mat('teeth', null, { color: '#cfc3aa', rough: 0.4 }),
    nail:    mat('nail', null, { color: mix(doll.skin || '#d9a089', '#ffffff', 0.35), rough: 0.25 }),
    lid:     mat('lid', null, { color: doll.skin, rough: 0.4 }),
    lash:    mat('lash', null, { color: '#2a1a12', rough: 0.8 }),
  };
  const flameMat = new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const flameCore = new THREE.MeshBasicMaterial({ color: '#fff3c4' });
  flameMat.userData = { part: 'flame', flame: true }; flameCore.userData = { part: 'flame_core', flame: true };

  const mesh = (g, m, name) => { const o = new THREE.Mesh(g, m); o.name = name; o.castShadow = o.receiveShadow = true; return o; };

  // A2: root (placed by the layout) > spinner (Spin, about her stand) > base, and body (Sway, from her feet)
  const spinner = new THREE.Group(); spinner.name = 'spin'; root.add(spinner);
  const body = new THREE.Group(); body.name = 'body'; spinner.add(body);

  // lathe from (radius, y) pairs; zScale squashes it front-to-back
  // A4: a profile drawn top to bottom made the surface inside out (the sleeves, cuffs, collar and curls), so
  // it is turned round to run bottom to top
  function lathe(pts, seg = 64, zScale = 1) {
    if (pts.length > 1 && pts[0][1] > pts[pts.length - 1][1]) pts = pts.slice().reverse();
    const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
    if (zScale !== 1) g.scale(1, 1, zScale);
    return g;
  }
  // drop the triangles whose centre fails keep(x, y, z) (in the geometry's own, unscaled units)
  function cut(g, keep) {
    const pos = g.attributes.position, idx = g.index.array, out = [];
    for (let t = 0; t < idx.length; t += 3) {
      let x = 0, y = 0, z = 0;
      for (let k = 0; k < 3; k++) { x += pos.getX(idx[t + k]); y += pos.getY(idx[t + k]); z += pos.getZ(idx[t + k]); }
      if (keep(x / 3, y / 3, z / 3)) out.push(idx[t], idx[t + 1], idx[t + 2]);
    }
    g.setIndex(out);
    return g;
  }

  // ---------------- stand and dress ----------------
  const base = mesh(lathe([[0, 0], [0.33, 0], [0.34, 0.012], [0.33, 0.028], [0, 0.028]], 64), M.base, 'base');
  base.position.y = -0.028;
  spinner.add(base);

  const skirt = mesh(lathe([[0.30, 0.0], [0.296, 0.05], [0.27, 0.15], [0.225, 0.27], [0.17, 0.38], [0.125, 0.46], [0.105, 0.5]], 72, 0.86), M.dress, 'skirt');
  body.add(skirt);
  const hem = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; hem.push([0.306 + 0.012 * Math.sin(t * Math.PI), t * 0.07]); }
  body.add(mesh(lathe(hem, 72, 0.86), M.lace, 'hem_lace'));
  const bodice = mesh(lathe([[0.104, 0.495], [0.112, 0.55], [0.124, 0.61], [0.126, 0.66], [0.11, 0.70], [0.075, 0.725], [0.04, 0.74], [0.03, 0.745]], 64, 0.72), M.bodice, 'bodice');
  body.add(bodice);
  // a ruffled lace collar
  {
    const g = lathe([[0.034, 0.745], [0.06, 0.735], [0.085, 0.712], [0.1, 0.69]], 96, 0.8);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), r = Math.hypot(x, z / 0.8);
      const w = 1 + 0.08 * Math.sin(a * 22) * Math.min(1, (r - 0.034) / 0.05);
      p.setXYZ(i, x * w, p.getY(i) + 0.006 * Math.sin(a * 22) * (r - 0.034) / 0.066, z * w);
    }
    g.computeVertexNormals();
    body.add(mesh(g, M.lace, 'collar'));
  }
  body.add(mesh(lathe([[0.031, 0.72], [0.03, 0.79], [0.0, 0.79]], 32), M.skin, 'neck'));

  // ---------------- head ----------------
  const headPivot = new THREE.Group(); headPivot.name = 'head_pivot';
  headPivot.position.y = NECK_Y;
  body.add(headPivot);
  const head = new THREE.Group(); head.name = 'head';
  head.position.y = HEAD_UP;
  headPivot.add(head);

  // the face: a sphere, planar UVs from the front (the face texture covers -1..1), a sculpted nose, cheeks,
  // lips and a chin. A2: the rows crowd round the lip line and the nose, so the nose can be sharp and the
  // mouth can open across the lip slit in the mask (see deformMouth).
  const MO = doll.mouth || { x: 0, y: -0.6, w: 0.14 }, NO = doll.nose || { x: 0, y: -0.3 };
  let deformMouth = () => {};
  {
    const thM = Math.acos(MO.y), thN = Math.acos(NO.y);
    const g = denseSphere(THREE, 200, 200,
      t => 1 + 10 * Math.exp(-(((t - thM) / 0.06) ** 2)) + 2.5 * Math.exp(-(((t - thN) / 0.18) ** 2)) + 1.2 * Math.exp(-(((t - thM) / 0.35) ** 2)),
      f => 1 + 3.5 * Math.exp(-((f / 0.6) ** 2)));
    const p = g.attributes.position, uv = g.attributes.uv, n = p.count;
    const bump = (x, y, cx, cy, sx, sy) => Math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2));
    const nx = NO.x, ny = NO.y, EY = 0.07; // the nose tip, and the eye line where the bridge starts
    const sculpt = (x, y) => {
      let d = 0;
      // the bridge: a narrow ridge from between the eyes, rising and widening toward the tip
      const tb = Math.max(0, Math.min(1, (EY - y) / (EY - ny)));
      const fade = y > EY ? Math.exp(-(((y - EY) / 0.07) ** 2)) : y < ny ? Math.exp(-(((y - ny) / 0.025) ** 2)) : 1;
      d += (0.018 + 0.06 * tb ** 1.6) * Math.exp(-(((x - nx) / (0.04 + 0.025 * tb)) ** 2)) * fade;
      d += 0.045 * bump(x, y, nx, ny, 0.05, 0.045);                                               // the tip
      d += 0.032 * (bump(x, y, nx - 0.07, ny - 0.025, 0.035, 0.04) + bump(x, y, nx + 0.07, ny - 0.025, 0.035, 0.04)); // the wings
      d -= 0.016 * (bump(x, y, nx - 0.105, ny - 0.03, 0.014, 0.05) + bump(x, y, nx + 0.105, ny - 0.03, 0.014, 0.05)); // creases round the wings
      d -= 0.03 * (bump(x, y, nx - 0.032, ny - 0.058, 0.02, 0.014) + bump(x, y, nx + 0.032, ny - 0.058, 0.02, 0.014)); // nostrils
      d -= 0.02 * bump(x, y, nx, ny - 0.085, 0.09, 0.022);                                        // under the nose
      const py = (ny + MO.y) / 2, ph = Math.max(0.02, (ny - MO.y) / 2.4);                        // the philtrum: a groove between two ridges
      d += 0.008 * (bump(x, y, nx - 0.03, py, 0.012, ph) + bump(x, y, nx + 0.03, py, 0.012, ph));
      d += 0.035 * (bump(x, y, -0.42, -0.4, 0.22, 0.2) + bump(x, y, 0.42, -0.4, 0.22, 0.2));      // cheeks
      d += 0.026 * bump(x, y, MO.x, MO.y + 0.028, MO.w * 0.85, 0.026);                           // upper lip
      d += 0.032 * bump(x, y, MO.x, MO.y - 0.036, MO.w * 0.8, 0.034);                            // lower lip
      d -= 0.012 * bump(x, y, MO.x, MO.y - 0.12, MO.w * 1.1, 0.04);                              // the dip under the lower lip
      d += 0.04 * bump(x, y, 0, -0.88, 0.25, 0.12);                                              // chin
      return d;
    };
    const ux = new Float32Array(n), uy = new Float32Array(n), base = new Float32Array(3 * n);
    for (let i = 0; i < n; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      uv.setXY(i, 0.5 + x / 2, 0.5 + y / 2);
      ux[i] = x; uy[i] = y;
      const s = 1 + (z > 0 ? sculpt(x, y) * z : 0);
      base[3 * i] = x * s; base[3 * i + 1] = y * s; base[3 * i + 2] = z * s;
    }
    // the vertices the mouth moves
    const near = [];
    for (let i = 0; i < n; i++) if (base[3 * i + 2] > 0 && Math.abs(ux[i] - MO.x) < MO.w * 2.2 && uy[i] > MO.y - 0.7 && uy[i] < MO.y + 0.3) near.push(i);
    // open: 0..1. shape: −1 rounded "oo" .. +1 wide "ee". Works in face units, then scales to the head.
    let last = null;
    deformMouth = (open, shape) => {
      const key = open.toFixed(4) + ',' + shape.toFixed(4);
      if (key === last) return; last = key;
      for (let i = 0; i < n; i++) p.setXYZ(i, base[3 * i] * RX, base[3 * i + 1] * RY, base[3 * i + 2] * RZ);
      for (const i of near) {
        const x = ux[i], y = uy[i], t = y - MO.y, dx = (x - MO.x) / MO.w;
        const L = Math.exp(-((dx / 0.82) ** 4)) * (1 - 0.25 * Math.max(0, shape));   // how far the lips part here
        const sq = 1 - (1 - SQUEEZE) * Math.exp(-((dx / 1.05) ** 6));                  // closed: the slit squeezed shut
        const U = open * 0.028 * L, D = open * 0.08 * L;                               // upper lip up, lower lip and jaw down
        let ny2, dz = 0;
        if (Math.abs(t) <= SLIT) ny2 = MO.y + t * sq + (t >= 0 ? U : -D) * Math.abs(t) / SLIT;
        else if (t > 0) { const e = t - SLIT; ny2 = y - SLIT * (1 - sq) * Math.exp(-((e / 0.05) ** 2)) + U * Math.exp(-((e / 0.09) ** 2)); }
        else { const e = -t - SLIT, w = Math.exp(-((e / 0.3) ** 2)); ny2 = y + SLIT * (1 - sq) * Math.exp(-((e / 0.05) ** 2)) - D * w; dz -= 0.15 * D * w; }
        const wy = Math.exp(-((t / 0.13) ** 2)), wx = Math.exp(-((dx / 1.7) ** 2));
        const nx2 = x + (x - MO.x) * (0.2 * shape - 0.1 * open) * wy * wx;            // corners out for "ee", in for "oo"
        dz += 0.035 * Math.max(0, -shape) * Math.exp(-((dx / 0.9) ** 2) - (t / 0.09) ** 2); // pout for "oo"
        p.setXYZ(i, (base[3 * i] + nx2 - x) * RX, (base[3 * i + 1] + ny2 - y) * RY, (base[3 * i + 2] + dz) * RZ);
      }
      p.needsUpdate = true;
      g.computeVertexNormals();
      g.computeBoundingSphere();
    };
    deformMouth(0, 0);
    head.add(mesh(g, M.face, 'face'));
    // a dark shell just inside the face: what shows round an eye that has turned is a shadowed socket
    const sg = new THREE.SphereGeometry(1, 128, 96); sg.scale(RX * 0.955, RY * 0.955, RZ * 0.955);
    head.add(mesh(sg, M.socket, 'socket'));
    // inside the mouth, seen through the lip slit: a dark red mouth and a row of upper teeth
    // a patch of the head's ellipsoid (scaled by r) over a box in face units, with smooth edges; round = its
    // corners rounded off (the teeth)
    const patch = (r, x0, x1, y0, y1, m, name, round = 0) => {
      const NU = 48, NV = 12, pos = [], uvs = [], idx = [];
      for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
        const u = i / NU, v = j / NV;
        const x = x0 + (x1 - x0) * u;
        const y = y0 + (y1 - y0) * v * (1 - round * (2 * u - 1) ** 4);
        const z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
        pos.push(x * RX * r, y * RY * r, z * RZ * r); uvs.push(u, v);
      }
      for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
        const a = j * (NU + 1) + i, b = a + NU + 1;
        if (y1 > y0) idx.push(a, a + 1, b, a + 1, b + 1, b); else idx.push(a, b, a + 1, a + 1, b, b + 1); // facing out
      }
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      pg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      pg.setIndex(idx); pg.computeVertexNormals();
      head.add(mesh(pg, m, name));
    };
    patch(0.966, MO.x - MO.w * 1.5, MO.x + MO.w * 1.5, MO.y - 0.17, MO.y + 0.08, M.mouth, 'mouth_inside');
    patch(0.982, MO.x - MO.w * 0.7, MO.x + MO.w * 0.7, MO.y + 0.032, MO.y - 0.006, M.teeth, 'teeth', 0.6);
  }

  // the eyes: glass balls behind the openings cut in the face mask
  const eyes = [], lids = [];
  for (const [i, e] of (doll.eyes || []).entries()) {
    // the ball: wide enough to fill the opening, and sized so its 40° iris is about the opening's height
    const zAt = (x, y) => RZ * Math.sqrt(Math.max(0.02, 1 - (x / RX) ** 2 - (y / RY) ** 2));
    const ex = e.x * RX, ey = e.y * RY, hw = e.w * RX, hh = e.h * RY;
    const re = Math.max(1.12 * hw, 1.6 * hh);
    // sink it so that it stays behind the face all round the opening: the face falls away faster on the outer side
    const ballFall = d => re - Math.sqrt(Math.max(0, re * re - d * d));
    const recess = Math.max(0.0015, -Math.min(...Array.from({ length: 16 }, (_, k) => {
      const a = k / 16 * 2 * Math.PI, dx = Math.cos(a) * hw, dy = Math.sin(a) * hh;
      return (zAt(ex + dx, ey + dy) - zAt(ex, ey)) + ballFall(Math.hypot(dx, dy));
    })) + 0.0012);
    const g = new THREE.SphereGeometry(re, 40, 28);
    g.rotateX(Math.PI / 2);                                         // the pole (iris) looks along +Z
    const pivot = new THREE.Group(); pivot.name = `eye_${i ? 'L' : 'R'}`;
    pivot.position.set(ex, ey, zAt(ex, ey) - recess - re);
    pivot.add(mesh(g, M.eye, `eyeball_${i ? 'L' : 'R'}`));
    head.add(pivot);
    eyes.push(pivot);
    // A3: an upper eyelid, a skin-coloured cap on a shell just outside the ball (it does not turn with the gaze),
    // with a dark lash line along its edge. It swings down over the front of the ball to blink.
    const rl = re * 1.02, CAP = 80 * D2R, lim = Math.asin(Math.min(1, hh / re));
    const lidOpen = 90 * D2R - lim * 1.25 - 4 * D2R - CAP;      // the edge just above the opening
    const lidShut = 90 * D2R + lim * 1.2 + 6 * D2R - CAP;       // the edge just below it
    const lg = new THREE.SphereGeometry(rl, 40, 14, 0, 2 * Math.PI, 0, CAP);
    const lid = new THREE.Group(); lid.name = `lid_${i ? 'L' : 'R'}`;
    lid.position.copy(pivot.position);
    lid.add(mesh(lg, M.lid, `eyelid_${i ? 'L' : 'R'}`));
    const ring = new THREE.TorusGeometry(rl * Math.sin(CAP), 0.0007, 6, 64);
    ring.rotateX(Math.PI / 2); ring.translate(0, rl * Math.cos(CAP), 0);
    lid.add(mesh(ring, M.lash, `lash_${i ? 'L' : 'R'}`));
    head.add(lid);
    lids.push({ lid, lidOpen, lidShut, r: rl });
  }
  // A3: the dark socket shell came in front of the ball (and so the lid) on the nose side. Press a cup into it
  // behind each eye, a little wider than the lid, so the ball and lid always sit in front of it.
  {
    const sp = head.getObjectByName('socket').geometry.attributes.position;
    for (let v = 0; v < sp.count; v++) {
      let z = sp.getZ(v);
      if (z <= 0) continue;
      const x = sp.getX(v), y = sp.getY(v);
      eyes.forEach((e, k) => {
        const R = lids[k].r * 1.12, d2 = (x - e.position.x) ** 2 + (y - e.position.y) ** 2;
        if (d2 < R * R) z = Math.min(z, e.position.z - Math.sqrt(R * R - d2) * 0.9);
      });
      sp.setZ(v, z);
    }
    sp.needsUpdate = true;
    head.getObjectByName('socket').geometry.computeVertexNormals();
  }

  // the hair: a cap round the back and sides that leaves the face open, then curls or strands.
  // A4: rebuilt by setHair({ line, thick, opacity }): line 'back' (A4: the hairline well back under the bonnet and
  // the curls behind the ears) or 'a3' (as before); thick 0.3..1 scales the curls and the cap's depth; opacity
  // 0.2..1 (below 1 the hair is dithered in the browser, so it needs no sorting, and has opacity in Arnold).
  // A6: the opacity is the curls' only; the cap (the top and crown of the head) is always solid
  const hairGroup = new THREE.Group(); hairGroup.name = 'hair'; head.add(hairGroup);
  const hair = { line: 'back', thick: 0.55, opacity: 0.6 };   // A5 default (A6: the curls 0.6, the cap solid)
  function buildHair() {
    for (const c of [...hairGroup.children]) { hairGroup.remove(c); c.geometry.dispose(); }
    const back = hair.line !== 'a3', th = Math.max(0.3, Math.min(1, hair.thick));
    const g = cut(new THREE.SphereGeometry(1, 128, 96), back
      ? (x, y, z) => !(z > -0.02 && y < 0.66 + 0.05 * Math.cos(x * 6) && Math.abs(x) < 0.97) && y > -0.75
      : (x, y, z) => !(z > 0.05 && y < 0.52 + 0.04 * Math.cos(x * 9) && Math.abs(x) < 0.86) && y > -0.75);
    const lift = back ? 0.03 + 0.04 * th : 0.07;
    g.scale(RX * (1 + lift), RY * (1 + lift * 0.86), RZ * (1 + lift * 1.43)); g.translate(0, 0.004, -0.006);
    hairGroup.add(mesh(g, M.hair, 'hair_cap'));
    const style = P.hair || 'ringlets';
    const n = style === 'wispy' ? 22 : style === 'curly' ? 26 : 16;
    const span = back ? 112 : 155;                                   // how far round from the back the curls reach
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < n; k++) {
      const a = (-span + 2 * span * (k + 0.5) / n + (rnd() - 0.5) * 8) * D2R;   // round the back, 0 = straight back
      let len, r, prof = [];
      if (style === 'wispy') { len = 0.16 + 0.1 * rnd(); r = 0.008 + 0.004 * rnd(); }
      else if (style === 'curly') { len = 0.07 + 0.05 * rnd(); r = 0.017 + 0.006 * rnd(); }
      else { len = 0.12 + 0.06 * rnd(); r = 0.014 + 0.004 * rnd(); }
      if (back) r *= th;
      const bumps = style === 'wispy' ? 2 : Math.round(len / (r * 1.6));
      for (let j = 0; j <= 24; j++) {
        const t = j / 24;
        const env = Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.5;
        prof.push([Math.max(0.0005, r * env * (0.78 + 0.22 * Math.cos(t * bumps * 2 * Math.PI))), -t * len]);
      }
      const curl = mesh(lathe(prof, 12), M.curl, `curl_${k}`);
      const sx = Math.sin(a), sz = -Math.cos(a);
      const side = Math.abs(sx);
      if (back) curl.position.set(sx * RX * 1.0, -RY * (0.2 + 0.3 * side) + 0.01, sz * RZ * 1.0 - 0.012 * side);
      else curl.position.set(sx * RX * 1.02, -RY * (0.15 + 0.35 * side) + 0.01, sz * RZ * 1.02 + (side > 0.8 ? -0.01 : 0));
      curl.rotation.set(-sz * 0.25 + (rnd() - 0.5) * 0.2, 0, sx * 0.25 + (rnd() - 0.5) * 0.2);
      hairGroup.add(curl);
    }
    const op = Math.max(0.2, Math.min(1, hair.opacity));
    for (const [m, o] of [[M.hair, 1], [M.curl, op]]) {   // A6: the cap solid, the curls see-through
      m.opacity = o; m.alphaHash = o < 1; m.transparent = false; m.userData.opacity = o; m.needsUpdate = true;
    }
  }
  buildHair();

  // the bonnet: a hood over the back half of the head, a ruffled brim framing the face, a lace frill inside it
  {
    const bx = RX * 1.24, by = RY * 1.2, bz = RZ * 1.3;
    const g = cut(new THREE.SphereGeometry(1, 72, 54), (x, y, z) => z < 0.02 && y > -0.62);
    g.scale(bx, by, bz); g.translate(0, 0.012, -0.012);
    head.add(mesh(g, M.bonnet, 'bonnet_hood'));
    // the brim: from her left jaw over the top to her right jaw, out and forward, with a ruffled edge
    const brim = (L, out, fwd, ruff, waves, m, name) => {
      const NU = 120, NV = 8, pos = [], uvs = [], idx = [];
      const a0 = -32 * D2R, a1 = 212 * D2R;
      for (let i = 0; i <= NU; i++) {
        const u = i / NU, a = a0 + (a1 - a0) * u;
        const c = Math.cos(a), s = Math.sin(a);
        for (let j = 0; j <= NV; j++) {
          const v = j / NV;
          // soft gathered folds: a few waves of uneven size, growing toward the front edge
          const ph = u * waves * 2 * Math.PI;
          const wav = ruff * (Math.sin(ph) + 0.35 * Math.sin(ph * 2.3 + 1.1)) * v ** 1.5;
          const rr = 1 + out * v + wav;
          const x = c * bx * rr;
          const y = s * by * rr + 0.012;
          const z = -0.012 + fwd * Math.sin(v * Math.PI / 2) + 0.5 * wav * L;
          pos.push(x, y, z);
          uvs.push(u, v);
        }
      }
      for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
        const a = i * (NV + 1) + j, b = a + NV + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
      const bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      bg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      bg.setIndex(idx); bg.computeVertexNormals();
      head.add(mesh(bg, m, name));
    };
    brim(0.05, 0.12, 0.1, 0.03, 13, M.brim, 'bonnet_brim');
    brim(0.03, -0.05, 0.085, 0.022, 19, M.lace, 'bonnet_frill');
  }

  // the ribbon: ties from the bonnet under the chin to a bow at her throat, and two tails
  {
    const tie = (pts, w, name) => {
      const curve = new THREE.CatmullRomCurve3(pts.map(q => new THREE.Vector3(...q)));
      const g = new THREE.TubeGeometry(curve, 24, w, 6, false);
      g.scale(1, 1, 1);
      return mesh(g, M.ribbon, name);
    };
    const bowY = NECK_Y - 0.03, bowZ = 0.075;
    body.add(tie([[-RX * 1.2, NECK_Y + 0.07, 0.0], [-0.07, NECK_Y + 0.0, 0.05], [-0.02, bowY, bowZ]], 0.008, 'tie_R'));
    body.add(tie([[RX * 1.2, NECK_Y + 0.07, 0.0], [0.07, NECK_Y + 0.0, 0.05], [0.02, bowY, bowZ]], 0.008, 'tie_L'));
    for (const sgn of [-1, 1]) {
      const lg = new THREE.TorusGeometry(0.026, 0.009, 10, 32);
      lg.scale(1, 0.62, 0.45);
      const loop = mesh(lg, M.ribbon, `bow_loop_${sgn > 0 ? 'L' : 'R'}`);
      loop.position.set(sgn * 0.03, bowY + 0.004, bowZ + 0.008);
      loop.rotation.set(0.15, sgn * 0.3, sgn * -0.2);
      body.add(loop);
      // a tail: a bent strip hanging down over the bodice
      const NU = 16, pos = [], uvs = [], idx = [];
      for (let i = 0; i <= NU; i++) {
        const t = i / NU, y = bowY - t * 0.2, z = bowZ + 0.01 + 0.05 * Math.sin(t * 1.4) - 0.02 * t, x = sgn * (0.012 + 0.04 * t);
        for (const k of [-1, 1]) { pos.push(x + k * 0.016 * (1 + 0.3 * t), y + k * sgn * 0.004, z); uvs.push((k + 1) / 2, t); }
      }
      for (let i = 0; i < NU; i++) { const a = 2 * i; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      const tg = new THREE.BufferGeometry();
      tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      tg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      tg.setIndex(idx); tg.computeVertexNormals();
      body.add(mesh(tg, M.ribbon, `bow_tail_${sgn > 0 ? 'L' : 'R'}`));
    }
    const knot = mesh(new THREE.SphereGeometry(0.014, 16, 12), M.ribbon, 'bow_knot');
    knot.scale.set(1, 0.9, 0.7); knot.position.set(0, bowY, bowZ + 0.012);
    body.add(knot);
  }

  // ---------------- arms ----------------
  function arm(sgn) {
    const L = sgn > 0 ? 'L' : 'R';
    const shoulder = new THREE.Group(); shoulder.name = `shoulder_${L}`;
    shoulder.position.set(sgn * 0.118, 0.69, 0);
    body.add(shoulder);
    // A4: a better formed arm. A gathered puff sleeve, closed and rounded at the shoulder, narrowing to the
    // elbow; a round elbow; a tapered forearm; a small lace ruffle at the cuff; and a bare wrist.
    const puff = [];
    for (let j = 0; j <= 20; j++) {
      const t = j / 20, y = -0.155 + 0.17 * t;                     // bottom (elbow) to top (shoulder)
      const r = 0.023 + 0.019 * Math.sin(Math.PI * Math.min(1, t * 1.05)) ** 0.7 * (t > 0.85 ? Math.max(0, Math.cos(Math.min(1, (t - 0.85) / 0.15) * Math.PI / 2)) ** 0.5 : 1);
      puff.push([Math.max(0.0005, r), y]);
    }
    puff.push([0, 0.016]);
    const pg = lathe(puff, 48);
    { // gathers: soft pleats round the puff, strongest at its widest
      const pp = pg.attributes.position;
      for (let i = 0; i < pp.count; i++) {
        const x = pp.getX(i), z = pp.getZ(i), y = pp.getY(i), r = Math.hypot(x, z);
        if (r < 1e-4) continue;
        const k = 1 + 0.07 * Math.sin(Math.atan2(z, x) * 10) * Math.sin(Math.PI * Math.max(0, Math.min(1, (y + 0.15) / 0.16)));
        pp.setX(i, x * k); pp.setZ(i, z * k);
      }
      pg.computeVertexNormals();
    }
    shoulder.add(mesh(pg, M.sleeve, `sleeve_upper_${L}`));
    const elbow = new THREE.Group(); elbow.name = `elbow_${L}`;
    elbow.position.y = -0.155;
    shoulder.add(elbow);
    elbow.add(mesh(new THREE.SphereGeometry(0.0235, 24, 16), M.sleeve, `elbow_${L}`));
    elbow.add(mesh(lathe([[0.0005, -0.124], [0.0172, -0.123], [0.0185, -0.11], [0.0215, -0.06], [0.0235, -0.015], [0.0232, 0.0], [0.0005, 0.004]], 32), M.sleeve, `sleeve_lower_${L}`));
    const cuff = [];
    for (let j = 0; j <= 8; j++) { const t = j / 8; cuff.push([0.0165 + 0.0105 * t ** 1.4, -0.108 - 0.026 * t]); }
    const cg = lathe(cuff, 64);
    const cp = cg.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      const a = Math.atan2(cp.getZ(i), cp.getX(i)), t = (-cp.getY(i) - 0.108) / 0.026;
      cp.setY(i, cp.getY(i) + 0.003 * Math.sin(a * 14) * t);
    }
    cg.computeVertexNormals();
    elbow.add(mesh(cg, M.lace, `cuff_${L}`));
    const wg = new THREE.CylinderGeometry(0.0098, 0.0112, 0.03, 20); wg.translate(0, -0.135, 0);
    elbow.add(mesh(wg, M.skin, `forearm_${L}`));
    const wrist = new THREE.Group(); wrist.name = `wrist_${L}`;
    wrist.position.y = -0.15;
    elbow.add(wrist);
    const fingers = hand(wrist, sgn, L);
    return { shoulder, elbow, wrist, fingers };
  }

  // A2: a hand with a palm, a thumb and four fingers of three bones each, and fingernails. In the wrist's
  // frame the fingers point down (−Y), the palm faces her body (−sgn X) and the thumb is at the front (+Z).
  // curl(c) bends every finger joint toward the palm.
  function hand(wrist, sgn, L) {
    const h = new THREE.Group(); h.name = `hand_${L}`; wrist.add(h);
    const wr = new THREE.CapsuleGeometry(0.0095, 0.012, 4, 14); wr.scale(0.85, 1, 1.05); wr.translate(0, -0.004, 0);
    h.add(mesh(wr, M.skin, `wrist_${L}`));
    const pg = new THREE.SphereGeometry(1, 28, 20);
    // a palm: flat, wider toward the knuckles, with a mound under the thumb
    { const pp = pg.attributes.position;
      for (let i = 0; i < pp.count; i++) {
        const x = pp.getX(i), y = pp.getY(i), z = pp.getZ(i);
        pp.setXYZ(i, x * 0.0072 * (1 - 0.25 * (y < 0 ? 0 : y)), y * 0.0175, z * 0.0145 * (1 + 0.12 * Math.max(0, -y)));
      }
      pg.computeVertexNormals(); }
    const palm = mesh(pg, M.skin, `palm_${L}`); palm.position.y = -0.018; h.add(palm);
    const mound = mesh(new THREE.SphereGeometry(1, 16, 12), M.skin, `thumb_mound_${L}`);
    mound.scale.set(0.0065, 0.011, 0.0065); mound.position.set(-sgn * 0.003, -0.013, 0.0085); h.add(mound);
    const joints = [];
    const finger = (base, rot, bones, r0, name) => {
      let parent = new THREE.Group(); parent.position.set(...base); parent.rotation.set(rot[0], 0, rot[1]); h.add(parent);
      bones.forEach((len, j) => {
        const r = r0 * (1 - 0.13 * j);
        const seg = new THREE.Group(); parent.add(seg); joints.push({ seg, j, thumb: name === 'thumb' });
        const g = new THREE.CapsuleGeometry(r, len, 4, 10); g.translate(0, -len / 2, 0);
        seg.add(mesh(g, M.skin, `${name}_${L}${j}`));
        if (j === bones.length - 1) {   // the nail, on the back of the last bone
          const ng = new THREE.SphereGeometry(1, 12, 8); ng.scale(r * 0.42, len * 0.55, r * 0.78);
          const nail = mesh(ng, M.nail, `nail_${name}_${L}`); nail.position.set(sgn * r * 0.72, -len * 0.62, 0); seg.add(nail);
        }
        const next = new THREE.Group(); next.position.y = -len; seg.add(next); parent = next;
      });
    };
    const F = [ // across the palm: index (front) to little finger
      { z: 0.0102, bones: [0.0105, 0.0066, 0.0052], r: 0.0034 },
      { z: 0.0035, bones: [0.0116, 0.0072, 0.0056], r: 0.0036 },
      { z: -0.0033, bones: [0.011, 0.0068, 0.0053], r: 0.0034 },
      { z: -0.0098, bones: [0.0086, 0.0056, 0.0046], r: 0.0029 },
    ];
    F.forEach((f, k) => finger([0, -0.033 + 0.0012 * Math.abs(k - 1.4), f.z], [(k - 1.5) * 0.09, 0], f.bones, f.r, `finger${k}`));
    finger([-sgn * 0.0025, -0.012, 0.013], [-0.75, -sgn * 0.45], [0.0095, 0.0078], 0.0042, 'thumb');
    return {
      curl(c) {
        for (const { seg, j, thumb } of joints) seg.rotation.z = thumb ? -sgn * c * (j ? 0.7 : 0.35) : -sgn * c * (j ? 1.05 : 0.75);
      },
    };
  }
  const armL = arm(1), armR = arm(-1);

  // the candle, in a holder if she has one: kept upright whatever the arm does
  const candle = new THREE.Group(); candle.name = 'candle';
  armL.wrist.add(candle);
  candle.position.set(-0.022, -0.024, 0.002); // A2: held in the curled fingers, palm side
  const candleTop = P.holder ? 0.2 : 0.17;
  let lightAt;
  {
    const c = new THREE.Group(); c.name = 'candle_upright';
    candle.add(c);
    c.position.y = -0.025;
    let y0 = -0.05;
    if (P.holder) {
      c.add(mesh(lathe([[0.0, -0.07], [0.022, -0.07], [0.016, -0.06], [0.011, -0.03], [0.012, 0.0], [0.008, 0.02], [0.03, 0.03], [0.034, 0.038], [0.024, 0.04], [0.0, 0.04]], 32), M.holder, 'holder'));
      y0 = 0.035;
    }
    const h = candleTop - y0;
    c.add(mesh(lathe([[0, y0], [0.019, y0], [0.0195, y0 + h * 0.5], [0.019, y0 + h - 0.006], [0.015, y0 + h], [0.0, y0 + h - 0.004]], 32), M.candle, 'candle_wax'));
    const wick = mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.012, 6), M.base, 'wick');
    wick.position.y = y0 + h + 0.002; c.add(wick);
    const flame = new THREE.Group(); flame.name = 'flame';
    flame.position.y = y0 + h + 0.006;
    const fg = new THREE.SphereGeometry(1, 16, 12); fg.translate(0, 1, 0);
    const outer = new THREE.Mesh(fg, flameMat); outer.scale.set(0.007, 0.018, 0.007); outer.name = 'flame_outer';
    const core = new THREE.Mesh(fg, flameCore); core.scale.set(0.0035, 0.009, 0.0035); core.name = 'flame_core';
    flame.add(outer, core);
    c.add(flame);
    lightAt = new THREE.Object3D(); lightAt.name = 'candle_light'; lightAt.position.y = 0.02; flame.add(lightAt);
  }
  const flame = candle.getObjectByName('flame');

  // ---------------- pose ----------------
  const pose = { ...REST_POSE };
  const off = {};   // A3: noise offsets, in degrees, by 'part.axis'
  const o = k => (off[k] || 0) * D2R;
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  function apply() {
    headPivot.rotation.set(-pose.headNod * D2R * 0.6 - o('head.pitch') * 0.6, pose.headTurn * D2R + o('head.yaw'), o('head.roll'), 'YXZ');
    head.rotation.set(-pose.headNod * D2R * 0.4 - o('head.pitch') * 0.4, 0, 0);
    for (const e of eyes) e.rotation.set(-pose.eyeY * 20 * D2R - o('eyes.pitch'), pose.eyeX * 30 * D2R + o('eyes.yaw'), 0, 'YXZ');
    // A3: the lids follow the gaze up and down a little, and close to blink
    const up = Math.max(-1, Math.min(1, pose.eyeY + (off['eyes.pitch'] || 0) / 20));
    for (const { lid, lidOpen, lidShut } of lids) {
      const open = lidOpen - up * 7 * D2R;
      lid.rotation.x = open + (lidShut - open) * Math.max(0, Math.min(1, pose.blink));
    }
    const t = Math.max(0, Math.min(1, pose.armRaise));
    const s = t * t * (3 - 2 * t);
    // candle arm (her left, +X): forward and up, opening out to clear the bonnet
    armL.shoulder.rotation.set(-0.3 - 2.25 * s - o('armL.pitch'), o('armL.yaw'), 0.1 + 0.42 * s + o('armL.roll'), 'XYZ');
    armL.elbow.rotation.set(-1.45 + 1.0 * s, 0, -0.5 * (1 - s), 'XYZ');
    // the other hand rests at her waist
    armR.shoulder.rotation.set(-0.35 - o('armR.pitch'), -o('armR.yaw'), -0.08 - o('armR.roll'), 'XYZ');
    armR.elbow.rotation.set(-1.25, 0, 0.75, 'XYZ');
    armL.fingers.curl(0.85); armR.fingers.curl(0.45);
    // A2: spin on the stand, sway from the feet, and the mouth
    spinner.rotation.y = pose.spin * D2R + o('spin.yaw');
    body.rotation.set(-o('body.pitch'), pose.sway * 2 * D2R + o('body.yaw'), -pose.sway * 6 * D2R - o('body.roll'));
    deformMouth(pose.mouthOpen, pose.mouthShape);
    // keep the candle upright in her own frame
    root.updateMatrixWorld(true);
    armL.wrist.getWorldQuaternion(qa);
    root.getWorldQuaternion(qb);
    candle.quaternion.copy(qa.invert().multiply(qb));
    candle.updateMatrixWorld(true);
  }
  apply();

  return {
    hair, setHair(h = {}) { Object.assign(hair, h); buildHair(); apply(); },
    root, body, spinner, materials: mats, flameMaterials: [flameMat, flameCore], eyes, lids, headPivot, armL, armR, candle, flame, lightAt, doll,
    pose, offsets: off,
    setPose(p) { for (const c of CONTROLS) if (p[c.key] !== undefined) pose[c.key] = Math.max(c.min, Math.min(c.max, +p[c.key])); apply(); },
    // A3: offsets in degrees by 'part.axis' (see OFFSETS); replaces the previous set. Call setPose or apply after.
    setOffsets(q = {}) { for (const k in off) delete off[k]; Object.assign(off, q); apply(); },
    // flicker: returns 0..1.3, the flame's brightness now
    tick(t) {
      const ph = doll.name.length * 1.7;
      const f = 1 + 0.12 * Math.sin(t * 13 + ph) + 0.08 * Math.sin(t * 23.7 + ph * 2) + 0.05 * Math.sin(t * 41 + ph);
      flame.scale.set(1 + 0.08 * Math.sin(t * 17 + ph), f, 1);
      flame.rotation.z = 0.06 * Math.sin(t * 5.3 + ph);
      return f;
    },
  };
}

// a 1024 checker with U and V written in it, for the UV view (browser only: uses a canvas)
export function makeUVCanvas(size = 1024) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), n = 8, s = size / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, v = 1 - (j + 0.5) / n;
    g.fillStyle = `rgb(${Math.round(40 + 215 * u)},${Math.round(40 + 215 * v)},${(i + j) % 2 ? 70 : 150})`;
    g.fillRect(i * s, j * s, s, s);
  }
  g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2;
  for (let i = 0; i <= n * 2; i++) { g.beginPath(); g.moveTo(i * s / 2, 0); g.lineTo(i * s / 2, size); g.moveTo(0, i * s / 2); g.lineTo(size, i * s / 2); g.stroke(); }
  g.fillStyle = '#fff'; g.font = `bold ${Math.round(s * 0.2)}px sans-serif`; g.textAlign = 'center';
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    g.fillText(`${(i / n).toFixed(2)},${(1 - (j + 1) / n).toFixed(2)}`, i * s + s / 2, j * s + s * 0.62);
  }
  g.fillStyle = '#000'; g.font = `bold ${Math.round(s * 0.45)}px sans-serif`;
  g.fillText('U →', size * 0.5, size - 8); g.save(); g.translate(28, size * 0.5); g.rotate(-Math.PI / 2); g.fillText('V →', 0, 0); g.restore();
  return c;
}

// A6: the version, the one place it is set: the page title and label, and the .ass / .obj headers all use it
export const VERSION = 'CT68.B1.Doll';

// where the three dolls stand (shared by the page and the exporter), in the order they are listed
export const DOLL_ORDER = ['green', 'cream', 'blonde'];
export const LAYOUT = [{ x: -0.8, rotY: 14 }, { x: 0, rotY: 0 }, { x: 0.8, rotY: -14 }];
export function placeDoll(rig, i) {
  const l = LAYOUT[i % LAYOUT.length];
  rig.root.position.set(l.x, 0, 0);
  rig.root.rotation.y = l.rotY * D2R;
  rig.setPose(rig.pose);
}

// mix two #rrggbb colours
function mix(a, b, t) {
  const h = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const A = h(a), B = h(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
