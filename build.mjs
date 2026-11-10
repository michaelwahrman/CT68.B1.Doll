// CT68.B1.Doll: build the page and the embed bundle, both working offline straight from the disk.
//
//   index.html, dolls_midi.html   (A7: index.html is the same page, for onrender and other web hosts)
//     lib/ (three.js r180, OrbitControls), src/doll_rig.js, src/carolers.js, src/ass_export.js, src/mp4_record.js and
//     every doll's doll.json and textures (as data URLs), packed into src/viewer.html.
//   embed/ct68_carolers.js        (A7) one classic script for another three.js page (the Darkride): the rig,
//     src/carolers.js and the dolls' data. It brings no three.js of its own: it uses the page's. See EMBED.md.
//
//   node build.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOLL_ORDER, VERSION } from './src/doll_rig.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = p => fs.readFileSync(path.join(here, p), 'utf8');
const mime = { '.jpg': 'image/jpeg', '.png': 'image/png' };
const dolls = DOLL_ORDER.map(n => {
  const dir = path.join(here, 'dolls', n);
  const doll = JSON.parse(fs.readFileSync(path.join(dir, 'doll.json'), 'utf8'));
  const data = {};
  for (const [k, f] of Object.entries(doll.textures)) {
    data[k] = `data:${mime[path.extname(f)]};base64,` + fs.readFileSync(path.join(dir, f)).toString('base64');
  }
  return { doll, data };
});
const parts = {
  __THREE_CORE__: read('lib/three.core.js'),
  __THREE_MODULE__: read('lib/three.module.js'),
  __ORBIT__: read('lib/OrbitControls.js'),
  __RIG__: read('src/doll_rig.js'),
  __CAROLERS__: read('src/carolers.js'),   // A7
  __ASS__: read('src/ass_export.js'),
  __REC__: read('src/mp4_record.js'),
  __DOLLS__: JSON.stringify(dolls),
  __VERSION__: VERSION,   // A6: the page title (the label is set from VERSION when the page runs)
};
let html = read('src/viewer.html');
for (const [k, v] of Object.entries(parts)) {
  if (v.includes('</script')) throw new Error(`${k} contains </script and cannot be embedded`);
  html = html.split(k).join(v);
}
for (const f of ['index.html', 'dolls_midi.html']) {
  const out = path.join(here, f);
  fs.writeFileSync(out, html);
  console.log(`${out} (${(html.length / 1e6).toFixed(1)} MB)`);
}

// A7: the embed bundle. The two ES modules become one classic script: their `export`s are dropped (no names clash),
// the import of the rig is dropped (it is above it), and the dolls' data is packed in.
const unexport = s => s.replace(/^export (?=(async )?(const|function|class|let) )/gm, '');
const rig = unexport(read('src/doll_rig.js'));
let car = read('src/carolers.js');
const imp = /^import \{[^}]*\} from '\.\/doll_rig\.js';\r?\n/m;
if (!imp.test(car)) throw new Error('src/carolers.js: the import of ./doll_rig.js was not found');
car = unexport(car.replace(imp, '')).split("new URL('../dolls/', import.meta.url).href").join("'dolls/'");
if (/import\.meta|^import |^export /m.test(rig + car)) throw new Error('the bundle still has an import or export');
const bundle = `// ${VERSION}: the three caroler dolls, for any three.js page. Built by build.mjs from src/doll_rig.js and src/carolers.js.
// A classic script: load it after three.js, then
//   const carolers = await CT68Carolers.create(THREE, { roomLights: [myLight] });
//   scene.add(carolers.group);  … every frame: carolers.update(seconds)
// See EMBED.md. The dolls' textures are packed in, so it works from the disk with no server.
(function (global) {
'use strict';
${rig}
${car}
const PACKED_DOLLS = ${JSON.stringify(dolls)};
global.CT68Carolers = {
  VERSION, CONTROLS, OFFSETS, REST_POSE, TRIGGERS, LEVELS, MIDI_DEFAULTS, BLOWOUT, CANDLE_LIGHT, DOLL_ORDER, LAYOUT,
  buildDoll, placeDoll, Candles, Performer, NoiseMixer, perlin1, fbm, SONG, TALK, PACKED_DOLLS,
  // create(THREE, options) or create(options) to use the page's global THREE
  create(THREE, opts) {
    if (!THREE || !THREE.WebGLRenderer) { opts = THREE; THREE = global.THREE; }
    if (!THREE) throw new Error('CT68Carolers.create: no THREE (load three.js first, or pass it)');
    opts = opts || {};
    return createCarolers(THREE, Object.assign({ dolls: opts.baseUrl ? undefined : PACKED_DOLLS }, opts));
  },
};
})(typeof window !== 'undefined' ? window : globalThis);
`;
if (bundle.includes('</script')) throw new Error('the bundle contains </script');
fs.mkdirSync(path.join(here, 'embed'), { recursive: true });
const bout = path.join(here, 'embed', 'ct68_carolers.js');
fs.writeFileSync(bout, bundle);
console.log(`${bout} (${(bundle.length / 1e6).toFixed(1)} MB)`);
