import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm3, noise3, makeRng, smoothstep } from '../core/noise.js';
import { patchUnderwater } from '../core/patch.js';

// 岩: 球をいくつかの平面で切り落として、平らな面と鋭い稜線を作る(青龍石のような角張った石)。
// その上に縦の筋(層の削れ)と細かい凹凸を足し、苔と窪みの暗さを頂点色で入れる
function makeRock(def, style) {
  // 細かさは大きさに合わせる(小さな岩に細かい網目は要らない)
  const detail = Math.round(style.detail * Math.min(1, Math.max(0.45, def.scale / style.detailScale)));
  const ico = new THREE.IcosahedronGeometry(1, detail);
  ico.deleteAttribute('normal');
  ico.deleteAttribute('uv');
  const geo = mergeVertices(ico);
  const pos = geo.attributes.position;
  const shade = new Float32Array(pos.count);     // 窪みの暗さ(0 明るい 〜 1 暗い)
  const vein = new Float32Array(pos.count);      // 白い筋
  const v = new THREE.Vector3();
  const rng = makeRng(def.seed * 31 + 7);
  const o = def.seed * 13.7;
  const stretch = new THREE.Vector3(...def.stretch);

  // 切り落とす平面: 横向きを多めに、上は斜めの面を1〜2枚
  const planes = [];
  for (let k = 0; k < style.cuts; k++) {
    const a = rng() * Math.PI * 2;
    const up = k < 2 ? 0.55 + rng() * 0.35 : (rng() - 0.35) * 0.7;
    const n = new THREE.Vector3(Math.cos(a), up, Math.sin(a)).normalize();
    planes.push({ n, d: style.cutDepth[0] + rng() * (style.cutDepth[1] - style.cutDepth[0]) });
  }
  // 角の欠け: 浅い小さな平面を足して、大きな面の角を細かく割る
  for (let k = 0; k < Math.round(style.cuts * 0.6); k++) {
    const n = new THREE.Vector3(rng() - 0.5, (rng() - 0.2) * 0.8, rng() - 0.5).normalize();
    planes.push({ n, d: style.cutDepth[1] + 0.05 + rng() * 0.12 });
  }
  // 筋の向き: ほぼ縦、少し傾ける
  const grainA = rng() * Math.PI;
  const across = new THREE.Vector3(Math.cos(grainA), 0, Math.sin(grainA));

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const big = fbm3(v.x * 0.8 + o, v.y * 0.8, v.z * 0.8 - o, 3);
    v.multiplyScalar(1 + big * 0.28);
    // 平面で切り落とす(ほんの少し丸みを残す)
    for (const pl of planes) {
      const s = v.dot(pl.n) - pl.d;
      if (s > 0) v.addScaledVector(pl.n, -s * 0.97);
    }
    // 縦の筋: 横方向の位置で溝を刻む。溝の深さは場所でむらを付ける
    const w = v.dot(across) + v.y * 0.25 + noise3(v.x * 1.5 + o, v.y * 0.6, v.z * 1.5) * 0.35;
    // 溝の幅は頂点の間隔より広くする(狭いと形に出ない)
    const groove = Math.pow(1 - Math.abs(Math.sin(w * style.grain)), 2.5) * (0.45 + 0.55 * smoothstep(-0.3, 0.4, noise3(v.x * 2 - o, v.y * 1.2, v.z * 2)));
    const len = v.length() || 1;
    v.multiplyScalar(1 - groove * style.grainDepth / len);
    // 細かい凹凸
    const fine = fbm3(v.x * 6 - o, v.y * 6, v.z * 6 + o, 2);
    v.multiplyScalar(1 + fine * 0.025);
    // 底を平らにして砂に埋める
    if (v.y < -0.3) v.y = -0.3 + (v.y + 0.3) * 0.15;
    v.multiply(stretch);
    pos.setXYZ(i, v.x, v.y, v.z);
    shade[i] = Math.min(1, groove * 1.4 + Math.max(0, -big) * 0.8);
    vein[i] = smoothstep(0.06, 0.0, Math.abs(noise3(v.x * 1.2 + o * 2, v.y * 3.0, v.z * 1.2)));
  }
  geo.computeVertexNormals();

  const n = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const C = style.colors;
  const stoneA = new THREE.Color(C.light), stoneB = new THREE.Color(C.dark);
  const moss = new THREE.Color(C.moss), veinC = new THREE.Color(C.vein), sand = new THREE.Color(C.sand);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const ny = n.getY(i);
    const t = noise3(v.x * 1.3 + o, v.y * 2.2, v.z * 1.3) * 0.5 + 0.5;
    c.lerpColors(stoneB, stoneA, t);
    c.lerp(veinC, vein[i] * 0.5);
    c.multiplyScalar(1 - shade[i] * 0.45);
    // 苔: 上を向いた面の、ところどころだけ
    const mossAmt = smoothstep(0.45, 0.85, ny) * smoothstep(0.45, 0.7, noise3(v.x * 3 - o, v.y * 3, v.z * 3) * 0.5 + 0.5);
    c.lerp(moss, mossAmt * style.moss);
    // 根元は砂で汚れる
    c.lerp(sand, smoothstep(-0.12, -0.3 * stretch.y, v.y) * 0.45);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

// 流木: 太い枝(scene.json の points)を少しねじ曲げ、そこから細い枝と小枝を生やし、根元に根の切り株を付ける
function branchTube(curve, r0, style, seed, tipTaper = 0.95) {
  const len = curve.getLength();
  const tubular = Math.max(8, Math.round(len * style.segPerUnit));
  const radial = r0 > 0.2 ? 10 : r0 > 0.08 ? 7 : 5;
  const geo = new THREE.TubeGeometry(curve, tubular, 1, radial, false);
  geo.deleteAttribute('uv');
  const pos = geo.attributes.position, nrm = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const C = style.colors;
  const dark = new THREE.Color(C.groove), mid = new THREE.Color(C.wood), light = new THREE.Color(C.ridge), bleach = new THREE.Color(C.bleached);
  const c = new THREE.Color(), v = new THREE.Vector3(), nv = new THREE.Vector3();
  const o = seed * 7.1;
  for (let i = 0; i < pos.count; i++) {
    const ring = Math.floor(i / (radial + 1)), u = ring / tubular;
    nv.fromBufferAttribute(nrm, i);
    const center = curve.getPointAt(Math.min(u, 1));
    const ang = Math.atan2(nv.z, nv.x) + nv.y;
    // 先細り + こぶ
    const knot = Math.pow(Math.max(0, noise3(u * len * 1.6 + o, 0.3, 0.7)), 3) * 0.6;
    const taper = (1 - Math.pow(u, 1.5) * tipTaper) * (1 + knot);
    // 長手方向に流れる木の筋(溝)
    const gw = ang * style.grooves + noise3(u * len * 0.8 + o, ang * 0.5, 0.2) * 2.2;
    const groove = Math.pow(Math.abs(Math.sin(gw)), 3);
    const r = r0 * taper * (1 - groove * style.grooveDepth);
    v.copy(center).addScaledVector(nv, r);
    pos.setXYZ(i, v.x, v.y, v.z);
    // 色: 溝は暗く、山は明るい。細いところと上の面は日に焼けて白っぽい
    c.lerpColors(light, dark, groove * 0.85);
    c.lerp(mid, 0.35);
    c.lerp(bleach, smoothstep(0.12, 0.03, r0 * taper) * 0.45 + Math.max(0, nv.y) * 0.12);
    c.multiplyScalar(0.75 + Math.max(0, nv.y) * 0.25);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.computeVertexNormals();
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

function makeDriftwood(defs, style, sandHeight) {
  const geos = [], obstacles = [];
  const rng = makeRng(style.seed);
  const up = new THREE.Vector3(0, 1, 0);
  const tmp = new THREE.Vector3(), axis = new THREE.Vector3();

  // 点列を少しねじ曲げる(まっすぐな線を、節で折れた枝にする)
  const gnarl = (pts, r) => {
    const out = [pts[0].clone()];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const mid = a.clone().lerp(b, 0.5);
      mid.add(new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(r * style.gnarl));
      out.push(mid, b.clone());
    }
    return out;
  };
  // 枝を1本作り、太さが残っていればさらに枝分かれさせる
  const grow = (curve, r0, depth, seed) => {
    geos.push(branchTube(curve, r0, style, seed));
    for (let u = 0; u <= 1.001; u += 0.2) {
      const rr = r0 * (1 - Math.pow(u, 1.5) * 0.95);
      if (rr > 0.07) obstacles.push({ center: curve.getPointAt(Math.min(u, 1)), radius: rr * 1.6 + 0.2, height: rr });
    }
    if (depth >= style.depth) return;
    const n = style.children[0] + Math.floor(rng() * (style.children[1] - style.children[0] + 1));
    for (let k = 0; k < n; k++) {
      const u = 0.3 + rng() * 0.55;
      const p0 = curve.getPointAt(u), dir = curve.getTangentAt(u);
      const rHere = r0 * (1 - Math.pow(u, 1.5) * 0.95);
      const r1 = rHere * (0.4 + rng() * 0.2);
      if (r1 < style.minRadius) continue;
      // 親の向きから 35〜75° 開く。やや上へ
      axis.set(rng() - 0.5, rng() - 0.5, rng() - 0.5).cross(dir).normalize();
      const d = dir.clone().applyAxisAngle(axis, (35 + rng() * 40) * Math.PI / 180).addScaledVector(up, 0.25).normalize();
      const L = curve.getLength() * (0.25 + rng() * 0.25) * (depth === 0 ? 1 : 0.8);
      const pts = [p0.clone().addScaledVector(d, -rHere * 0.5)];
      let p = p0.clone(), dd = d.clone();
      for (let s = 1; s <= 3; s++) {
        dd.add(tmp.set(rng() - 0.5, (rng() - 0.6) * 0.6, rng() - 0.5).multiplyScalar(0.5)).normalize();
        p = p.clone().addScaledVector(dd, L / 3);
        pts.push(p);
      }
      grow(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), r1, depth + 1, seed * 3 + k + 1);
    }
  };

  defs.forEach((def, i) => {
    const pts = gnarl(def.points.map((q) => new THREE.Vector3(...q)), def.radius);
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    grow(curve, def.radius, i === 0 ? 0 : 1, def.seed);
  });

  // 根元の根の切り株(いちばん太い枝の根元から、砂へもぐる短い枝)
  const root = defs[0];
  const base = new THREE.Vector3(...root.points[0]);
  for (let k = 0; k < style.roots; k++) {
    const a = (k / style.roots) * Math.PI * 2 + rng() * 0.8;
    const dir = new THREE.Vector3(Math.cos(a), -0.25 - rng() * 0.25, Math.sin(a)).normalize();
    const L = root.radius * (2.2 + rng() * 1.8);
    const p1 = base.clone().addScaledVector(dir, L * 0.5).add(new THREE.Vector3(0, rng() * 0.1, 0));
    const p2 = base.clone().addScaledVector(dir, L);
    p2.y = Math.min(p2.y, sandHeight(p2.x, p2.z) - 0.05);
    const curve = new THREE.CatmullRomCurve3([base.clone().add(new THREE.Vector3(0, root.radius * 0.3, 0)), p1, p2], false, 'centripetal');
    geos.push(branchTube(curve, root.radius * (0.45 + rng() * 0.2), style, 50 + k, 0.7));
  }
  return { geos, obstacles };
}

export function createRocks(scene3d, cfg, uniforms, shaders, sandHeight) {
  const geos = [];
  const obstacles = [];
  const H = cfg.hardscape;
  for (const r of cfg.rocks) {
    const stretch = new THREE.Vector3(...r.stretch);
    const g = makeRock(r, H.rock);
    const rng = makeRng(r.seed);
    const [x, z] = r.pos;
    const y = sandHeight(x, z) - r.sink * r.scale;
    g.rotateY(rng() * Math.PI * 2);
    g.rotateZ((rng() - 0.5) * 0.25);
    g.scale(r.scale, r.scale, r.scale);
    g.translate(x, y, z);
    geos.push(g);
    const radius = r.scale * Math.max(stretch.x, stretch.z) * 1.05;
    obstacles.push({
      center: new THREE.Vector3(x, y + r.scale * stretch.y * 0.3, z),
      radius,
      height: r.scale * stretch.y * 1.2,
    });
  }
  const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: H.rock.roughness, metalness: 0 });
  patchUnderwater(rockMat, { shared: uniforms, shaders, key: 'rock' });
  const rocks = new THREE.Mesh(mergeGeometries(geos), rockMat);
  rocks.castShadow = rocks.receiveShadow = true;
  scene3d.add(rocks);

  const dw = makeDriftwood(cfg.wood, H.wood, sandHeight);
  const woodGeos = dw.geos;
  obstacles.push(...dw.obstacles);
  const woodMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: H.wood.roughness, metalness: 0 });
  patchUnderwater(woodMat, { shared: uniforms, shaders, key: 'wood' });
  const wood = new THREE.Mesh(mergeGeometries(woodGeos), woodMat);
  wood.castShadow = wood.receiveShadow = true;
  scene3d.add(wood);

  return { rocks, wood, obstacles };
}
