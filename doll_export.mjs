// CT68.B1.Doll (from A1): export the three dolls, posed, as Arnold .ass (with their textures) and OBJ.
//
//   node doll_export.mjs                          every pose in poses/  ->  exports/
//   node doll_export.mjs --pose poses/raised.json one pose (a pose saved from the page works too)
//   node doll_export.mjs --res 1920 1080
//
// For each pose it writes exports/dolls_<pose>.ass (doll textures), exports/dolls_<pose>_uv.ass (the UV test
// image on every part) and exports/dolls_<pose>.obj. Render from this folder:  kick -i exports/dolls_rest.ass

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from './lib/three.module.js';
import { buildDoll, placeDoll, REST_POSE, DOLL_ORDER, VERSION } from './src/doll_rig.js';
import { toASS, toOBJ } from './src/ass_export.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = { poses: [], out: path.join(here, 'exports'), res: [1600, 900] };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--pose') opt.poses.push(args[++i]);
  else if (a === '--out') opt.out = args[++i];
  else if (a === '--res') opt.res = [parseInt(args[++i], 10), parseInt(args[++i], 10)];
  else { console.error(`unknown option ${a}`); process.exit(1); }
}
if (!opt.poses.length) {
  const dir = path.join(here, 'poses');
  opt.poses = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().map(f => path.join(dir, f));
}
fs.mkdirSync(opt.out, { recursive: true });

const dolls = DOLL_ORDER.map(n => JSON.parse(fs.readFileSync(path.join(here, 'dolls', n, 'doll.json'), 'utf8')));
const rigs = dolls.map((d, i) => { const r = buildDoll(THREE, d, {}); placeDoll(r, i); return r; });
for (const file of opt.poses) {
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  const pose = { ...REST_POSE, ...(json.pose || json) };
  const name = (json.name || path.basename(file, '.json')).replace(/[^\w.-]+/g, '_');
  for (const r of rigs) { r.setHair({ line: 'back', thick: 0.55, opacity: 0.6, ...(json.hair || {}) }); r.setOffsets(json.offsets || {}); r.setPose(pose); }   // A4: hair saved with a pose   // A3: noise offsets saved with a pose
  const header = `${VERSION} dolls ${DOLL_ORDER.join(', ')}, pose ${name} ${JSON.stringify(pose)}` + (json.offsets ? ` offsets ${JSON.stringify(json.offsets)}` : '') + (json.hair ? ` hair ${JSON.stringify(json.hair)}` : '');
  const base = path.join(opt.out, `dolls_${name}`);
  const a = toASS(THREE, rigs, { name: `dolls_${name}`, header, res: opt.res, version: VERSION, flameLevel: json.flameLevel ?? 1 });   // A7: flameLevel
  fs.writeFileSync(base + '.ass', a.text);
  fs.writeFileSync(base + '_uv.ass', toASS(THREE, rigs, { name: `dolls_${name}_uv`, header: header + ' (UV test)', res: opt.res, uvTest: true, version: VERSION }).text);
  fs.writeFileSync(base + '.obj', toOBJ(THREE, rigs, header, VERSION));
  console.log(`${name}: ${a.stats.meshes} meshes, ${a.stats.vertices} vertices, ${a.stats.triangles} triangles -> ${base}.ass / _uv.ass / .obj`);
}
