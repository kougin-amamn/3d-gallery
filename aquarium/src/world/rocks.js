import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm3, noise3, makeRng, smoothstep } from '../core/noise.js';
import { patchUnderwater } from '../core/patch.js';

// 岩: 球を手続きノイズで崩し、苔と窪みの暗さを頂点色で入れる
function makeRock(seed, stretch) {
  // 頂点を共有させて滑らかな法線にする
  const ico = new THREE.IcosahedronGeometry(1, 6);
  ico.deleteAttribute('normal');
  ico.deleteAttribute('uv');
  const geo = mergeVertices(ico);
  const pos = geo.attributes.position;
  const disp = new Float32Array(pos.count);
  const v = new THREE.Vector3();
  const o = seed * 13.7;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // 大きな塊 + 稜線 + 細かい凹凸
    const big = fbm3(v.x * 0.9 + o, v.y * 0.9, v.z * 0.9 - o, 3);
    const ridge = 1 - Math.abs(noise3(v.x * 2.2 + o, v.y * 2.2, v.z * 2.2));
    const fine = fbm3(v.x * 5 - o, v.y * 5, v.z * 5 + o, 3);
    let r = 1 + big * 0.42 + ridge * ridge * 0.16 + fine * 0.07;
    v.multiplyScalar(r);
    // 層状の削れ
    v.y += Math.sin(v.y * 7 + big * 4) * 0.025;
    // 底を平らにして接地させる
    if (v.y < -0.35) v.y = -0.35 + (v.y + 0.35) * 0.15;
    v.multiply(stretch);
    pos.setXYZ(i, v.x, v.y, v.z);
    disp[i] = big * 0.42 + fine * 0.07;
  }
  geo.computeVertexNormals();

  const n = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const stoneA = new THREE.Color('#7A7468');
  const stoneB = new THREE.Color('#4F4B45');
  const moss = new THREE.Color('#4A6B2E');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const ny = n.getY(i);
    const t = noise3(v.x * 1.7 + o, v.y * 1.7, v.z * 1.7) * 0.5 + 0.5;
    c.lerpColors(stoneB, stoneA, t);
    // 窪みは暗く(簡易AO)
    c.multiplyScalar(0.55 + smoothstep(-0.25, 0.25, disp[i]) * 0.55);
    // 上を向いた面に苔
    const mossAmt = smoothstep(0.45, 0.85, ny) * smoothstep(0.35, 0.65, noise3(v.x * 2.5 - o, v.y * 2.5, v.z * 2.5) * 0.5 + 0.5);
    c.lerp(moss, mossAmt * 0.8);
    // 根元は砂で汚れる
    c.lerp(new THREE.Color('#9C8C6C'), smoothstep(-0.15, -0.35 * stretch.y, v.y) * 0.5);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

// 流木: 曲線に沿った筒を先細りにし、樹皮の凹凸を付ける
function makeWood(def) {
  const pts = def.points.map((p) => new THREE.Vector3(...p));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const tubular = 64, radial = 12;
  const geo = new THREE.TubeGeometry(curve, tubular, def.radius, radial, false);
  geo.deleteAttribute('uv');
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const bark = new THREE.Color('#3E2F22');
  const light = new THREE.Color('#7A6650');
  const c = new THREE.Color();
  const v = new THREE.Vector3(), nv = new THREE.Vector3();
  const o = def.seed * 7.1;
  for (let i = 0; i < pos.count; i++) {
    const ring = Math.floor(i / (radial + 1));
    const u = ring / tubular;
    v.fromBufferAttribute(pos, i);
    nv.fromBufferAttribute(nrm, i);
    const center = curve.getPointAt(Math.min(u, 1));
    const taper = (1 - Math.pow(u, 2.2) * 0.92) * (1 + 0.25 * Math.sin(u * 9 + o));
    const groove = noise3(v.x * 6 + o, v.y * 2, v.z * 6) * 0.25 + Math.sin(Math.atan2(nv.z, nv.x) * 7 + u * 4) * 0.08;
    const r = def.radius * taper * (1 + groove);
    v.copy(center).addScaledVector(nv, r);
    pos.setXYZ(i, v.x, v.y, v.z);
    const t = smoothstep(-0.1, 0.25, groove);
    c.lerpColors(bark, light, t * 0.8).multiplyScalar(0.8 + nv.y * 0.2);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.computeVertexNormals();
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return { geo, curve };
}

export function createRocks(scene3d, cfg, uniforms, shaders, sandHeight) {
  const geos = [];
  const obstacles = [];
  for (const r of cfg.rocks) {
    const stretch = new THREE.Vector3(...r.stretch);
    const g = makeRock(r.seed, stretch);
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
  const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 });
  patchUnderwater(rockMat, { shared: uniforms, shaders, key: 'rock' });
  const rocks = new THREE.Mesh(mergeGeometries(geos), rockMat);
  rocks.castShadow = rocks.receiveShadow = true;
  scene3d.add(rocks);

  const woodGeos = [];
  for (const w of cfg.wood) {
    const { geo, curve } = makeWood(w);
    woodGeos.push(geo);
    for (let u = 0; u <= 1; u += 0.2) {
      obstacles.push({ center: curve.getPointAt(u), radius: w.radius * 1.6 + 0.2, height: w.radius });
    }
  }
  const woodMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
  patchUnderwater(woodMat, { shared: uniforms, shaders, key: 'wood' });
  const wood = new THREE.Mesh(mergeGeometries(woodGeos), woodMat);
  wood.castShadow = wood.receiveShadow = true;
  scene3d.add(wood);

  return { rocks, wood, obstacles };
}
