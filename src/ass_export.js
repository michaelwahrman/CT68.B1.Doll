// CT68.B1.Doll (from A1): write posed dolls as an Arnold .ass scene with their textures (and OBJ for anything else).
// Shared by the browser page and the Node exporter. It imports nothing: pass THREE in.
//
// collect() bakes each doll's current pose into plain triangle meshes, one per doll and material part,
// in world space (so the three dolls keep their places). UVs are multiplied by the part's repeat, so the
// image nodes need no scaling. Texture paths are written relative to the CT68 folder (texRoot).

export const VIEW = { position: [0, 0.82, 3.4], target: [0, 0.56, 0], fov: 44 }; // Arnold's fov is horizontal

export function collect(THREE, rigs, { bakeRepeat = true } = {}) {
  const parts = [];
  const v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
  for (const rig of rigs) {
    rig.root.updateMatrixWorld(true);
    const byPart = new Map();
    rig.root.traverseVisible(o => {   // A7: a hidden group (a blown-out flame) hides what is in it
      if (!o.isMesh) return;
      const ud = o.material.userData || {};
      const key = ud.part || 'misc';
      let P = byPart.get(key);
      if (!P) { P = { doll: rig.doll.name, part: key, ud, pos: [], nrm: [], uv: [], idx: [] }; byPart.set(key, P); parts.push(P); }
      const g = o.geometry, pos = g.attributes.position, nor = g.attributes.normal, uvA = g.attributes.uv;
      const rep = bakeRepeat && ud.repeat ? ud.repeat : [1, 1];
      const base = P.pos.length / 3;
      nm.getNormalMatrix(o.matrixWorld);
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
        P.pos.push(v.x, v.y, v.z); P.nrm.push(n.x, n.y, n.z);
        if (uvA) P.uv.push(uvA.getX(i) * rep[0], uvA.getY(i) * rep[1]); else P.uv.push(0, 0);
      }
      const flip = o.matrixWorld.determinant() < 0;
      const idx = g.index ? g.index.array : null, cnt = idx ? idx.length : pos.count;
      for (let t = 0; t < cnt; t += 3) {
        const a = idx ? idx[t] : t, b = idx ? idx[t + 1] : t + 1, d = idx ? idx[t + 2] : t + 2;
        if (flip) P.idx.push(base + a, base + d, base + b); else P.idx.push(base + a, base + b, base + d);
      }
    });
  }
  return parts;
}

export function stats(parts) {
  let v = 0, f = 0;
  for (const P of parts) { v += P.pos.length / 3; f += P.idx.length / 3; }
  return { vertices: v, triangles: f, meshes: parts.length };
}

const f5 = x => (Math.abs(x) < 5e-6 ? '0' : x.toFixed(5).replace(/0+$/, '').replace(/\.$/, ''));
const f4 = x => (Math.abs(x) < 5e-5 ? '0' : x.toFixed(4).replace(/0+$/, '').replace(/\.$/, ''));
const toLin = x => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
const hexLin = h => [1, 3, 5].map(i => toLin(parseInt(h.slice(i, i + 2), 16) / 255));

// rigs: the posed dolls. texRoot: how the .ass reaches the CT68 folder ('' when kick runs there).
// uvTest: put the UV test image on every part instead of the doll textures.
export function toASS(THREE, rigs, { name = 'dolls', header = '', res = [1600, 900], view = VIEW, texRoot = '', uvTest = false, version = 'CT68.B1.Doll', flameLevel = 1 } = {}) {   // A6: version from the rig's VERSION; A7: flameLevel
  const parts = collect(THREE, rigs, { bakeRepeat: !uvTest }); // the UV test shows each part's own 0..1, as the page does
  const L = [];
  const vec = a => a.map(f5).join(' ');
  const wrap = (arr, per, fmt) => {
    const out = [];
    for (let i = 0; i < arr.length; i += per) out.push('  ' + Array.from(arr.slice(i, i + per), fmt).join(' '));
    return out;
  };
  const tex = (doll, file) => `${texRoot}${uvTest ? 'tex/uv_test.png' : `dolls/${doll}/${file}`}`;

  L.push(`# ${header}`);
  L.push(`# ${version}. Y up, the dolls face +Z. Texture paths are relative to the ${version} folder:`);
  L.push(`#   cd ${version} && kick -i exports/${name}.ass   (add -sl -set options.abort_on_license_fail false without a licence)`);
  L.push('options', '{', '  AA_samples 6', `  xres ${res[0]}`, `  yres ${res[1]}`, '  GI_diffuse_depth 2', '  GI_specular_depth 1',
    '  GI_transmission_depth 2', '  camera "cam"', '  outputs "RGBA RGBA gauss png_out"', '  texture_searchpath ".;.."', '}', '');
  L.push('gaussian_filter', '{', '  name gauss', '}', '');
  L.push('driver_png', '{', '  name png_out', `  filename "${name}.png"`, '}', '');
  L.push('persp_camera', '{', '  name cam', `  position ${vec(view.position)}`, `  look_at ${vec(view.target)}`, '  up 0 1 0', `  fov ${view.fov}`, '}', '');
  // a dim warm room, a soft key from the upper left and the candles
  L.push('skydome_light', '{', '  name sky', '  color 0.35 0.32 0.3', `  intensity ${uvTest ? 1.2 : 0.18}`, '  camera 0', '}', '');
  L.push('quad_light', '{', '  name key', '  vertices 4 1 VECTOR', '    -0.6 -0.6 0  0.6 -0.6 0  0.6 0.6 0  -0.6 0.6 0',
    '  matrix 1 1 MATRIX', '    0.8 0 -0.6 0', '    -0.25 0.91 -0.33 0', '    0.55 0.41 0.73 0', '    -2.2 2.4 3 1',
    '  color 1 0.86 0.7', `  intensity ${uvTest ? 3 : 2.2}`, '  exposure 1.6', '  samples 2', '}', '');
  L.push('polymesh', '{', '  name floor', '  nsides 1 1 UINT 4', '  vidxs 4 1 UINT 0 1 2 3', '  vlist 4 1 VECTOR',
    '    -6 -0.028 -2  -6 -0.028 4  6 -0.028 4  6 -0.028 -2', '  shader "sh_floor"', '}', '');
  L.push('polymesh', '{', '  name backdrop', '  nsides 1 1 UINT 4', '  vidxs 4 1 UINT 0 1 2 3', '  vlist 4 1 VECTOR',
    '    -6 -0.028 -1.6  6 -0.028 -1.6  6 4.8 -1.6  -6 4.8 -1.6', '  shader "sh_back"', '}', '');
  L.push('standard_surface', '{', '  name sh_floor', '  base 1', '  base_color 0.05 0.035 0.03', '  specular 0.2', '  specular_roughness 0.5', '}', '');
  L.push('standard_surface', '{', '  name sh_back', '  base 1', '  base_color 0.07 0.045 0.035', '  specular 0', '}', '');

  for (const rig of rigs) {
    if (flameLevel <= 0 || (rig.flame && !rig.flame.visible)) continue;   // A7: blown out (or level 0): no candle light
    rig.root.updateMatrixWorld(true);
    const p = new THREE.Vector3(); rig.lightAt.getWorldPosition(p);
    L.push('point_light', '{', `  name ${rig.doll.name}_candle`, `  position ${vec([p.x, p.y, p.z])}`, '  radius 0.01',
      '  color 1 0.62 0.3', `  intensity ${f4(0.25 * flameLevel)}`, '  exposure 0', '  samples 2', '}', '');
  }

  const done = new Set();
  for (const P of parts) {
    const ud = P.ud, sh = `sh_${P.doll}_${P.part}`;
    if (done.has(sh)) continue; done.add(sh);
    const S = ['standard_surface', '{', `  name ${sh}`];
    if (ud.flame) {
      const c = P.part === 'flame_core' ? [1, 0.92, 0.7] : [1, 0.55, 0.15];
      S.push('  base 0', '  specular 0', '  emission 6', `  emission_color ${vec(c)}`);
    } else {
      S.push('  base 1', `  specular ${ud.rough < 0.4 ? 0.6 : 0.15}`, `  specular_roughness ${f4(Math.max(0.15, ud.rough * 0.8))}`);
      if (ud.metal) S.push(`  metalness ${ud.metal}`);
      if (ud.tex || uvTest) S.push(`  base_color img_${P.doll}_${P.part}`);
      else S.push(`  base_color ${vec(hexLin(ud.color || '#ffffff'))}`);
      if (ud.alphaMap) S.push(`  opacity msk_${P.doll}_${P.part}`);
      else if (ud.opacity !== undefined && ud.opacity < 1) S.push(`  opacity ${f4(ud.opacity)} ${f4(ud.opacity)} ${f4(ud.opacity)}`); // A4: see-through hair
      if (ud.emissive && !uvTest) S.push(`  emission ${f4(ud.emissive.intensity)}`, `  emission_color ${vec(hexLin(ud.emissive.color))}`);
    }
    S.push('}', '');
    if (!ud.flame && (ud.tex || uvTest)) {
      L.push('image', '{', `  name img_${P.doll}_${P.part}`, `  filename "${tex(P.doll, `tex/${ud.tex}.jpg`)}"`);
      if (ud.tex && !uvTest && ud.color && ud.color !== '#ffffff') L.push(`  multiply ${vec(hexLin(ud.color))}`);
      L.push('}', '');
    }
    if (ud.alphaMap) L.push('image', '{', `  name msk_${P.doll}_${P.part}`, `  filename "${texRoot}dolls/${P.doll}/tex/face_mask.png"`, '  color_space "linear"', '}', '');
    L.push(...S);
  }

  for (const P of parts) {
    const nv = P.pos.length / 3, nf = P.idx.length / 3;
    L.push('polymesh', '{', `  name ${P.doll}_${P.part}`);
    L.push(`  nsides ${nf} 1 BYTE`, ...wrap(new Array(nf).fill(3), 60, String));
    L.push(`  vidxs ${P.idx.length} 1 UINT`, ...wrap(P.idx, 30, String));
    L.push(`  nidxs ${P.idx.length} 1 UINT`, ...wrap(P.idx, 30, String));
    L.push(`  uvidxs ${P.idx.length} 1 UINT`, ...wrap(P.idx, 30, String));
    L.push(`  vlist ${nv} 1 VECTOR`, ...wrap(P.pos, 12, f5));
    L.push(`  nlist ${nv} 1 VECTOR`, ...wrap(P.nrm, 12, f4));
    L.push(`  uvlist ${nv} 1 VECTOR2`, ...wrap(P.uv, 12, f4));
    L.push('  smoothing on', `  shader "sh_${P.doll}_${P.part}"`);
    if (P.ud.alphaMap || (P.ud.opacity !== undefined && P.ud.opacity < 1)) L.push('  opaque off');
    if (P.ud.flame) L.push('  visibility 253'); // flames cast no shadows
    L.push('}', '');
  }
  return { text: L.join('\n'), stats: stats(parts) };
}

// plain OBJ of the same meshes (world space, UVs with the repeats baked in), one object per doll part
export function toOBJ(THREE, rigs, header = '', version = 'CT68.A6.Doll') {
  const parts = collect(THREE, rigs);
  const out = [`# ${header}`, `# ${version}. Y up, the dolls face +Z.`];
  let off = 1;
  for (const P of parts) {
    const nv = P.pos.length / 3;
    out.push(`o ${P.doll}_${P.part}`, `usemtl ${P.doll}_${P.part}`);
    for (let i = 0; i < nv; i++) out.push(`v ${f5(P.pos[3 * i])} ${f5(P.pos[3 * i + 1])} ${f5(P.pos[3 * i + 2])}`);
    for (let i = 0; i < nv; i++) out.push(`vn ${f4(P.nrm[3 * i])} ${f4(P.nrm[3 * i + 1])} ${f4(P.nrm[3 * i + 2])}`);
    for (let i = 0; i < nv; i++) out.push(`vt ${f4(P.uv[2 * i])} ${f4(P.uv[2 * i + 1])}`);
    for (let t = 0; t < P.idx.length; t += 3) {
      const a = P.idx[t] + off, b = P.idx[t + 1] + off, d = P.idx[t + 2] + off;
      out.push(`f ${a}/${a}/${a} ${b}/${b}/${b} ${d}/${d}/${d}`);
    }
    off += nv;
  }
  return out.join('\n') + '\n';
}
