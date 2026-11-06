import * as THREE from 'three';
import { patchUnderwater } from '../core/patch.js';
import { makeRng } from '../core/noise.js';

// 赤いエビ(チェリーシュリンプ): 流木と岩の上に散らばり、ときどき向きを変えて少しだけ歩く。
// 画面の手前に小さな赤い点を置く「差し色」の役目。

function shrimpGeometry(L) {
  const parts = [];
  // 胴: 背中が丸く反った、先細りの管
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    pts.push(new THREE.Vector3((0.5 - t) * L, Math.sin(t * Math.PI) * L * 0.14 - t * t * L * 0.08, 0));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const body = new THREE.TubeGeometry(curve, 16, 1, 8, false);
  const pos = body.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const ring = Math.floor(i / 9) / 16;
    const center = curve.getPointAt(Math.min(ring, 1));
    v.fromBufferAttribute(pos, i).sub(center);
    const r = L * (0.11 * Math.sin(Math.PI * (0.15 + ring * 0.8)) + 0.02);
    v.multiplyScalar(r);
    v.y *= 1.15; v.z *= 0.85;
    pos.setXYZ(i, center.x + v.x, center.y + v.y, center.z + v.z);
  }
  body.deleteAttribute('uv');
  body.computeVertexNormals();
  parts.push(body);
  // 尾の扇
  const fan = new THREE.CircleGeometry(L * 0.13, 10, Math.PI * 0.7, Math.PI * 0.6);
  fan.rotateX(-Math.PI / 2);
  fan.rotateZ(-0.5);
  fan.translate(-L * 0.5, -L * 0.07, 0);
  fan.deleteAttribute('uv');
  parts.push(fan);
  // 触角(細い管)
  for (const s of [-1, 1]) {
    const a = new THREE.CatmullRomCurve3([
      new THREE.Vector3(L * 0.5, L * 0.03, s * L * 0.02),
      new THREE.Vector3(L * 0.85, L * 0.16, s * L * 0.12),
      new THREE.Vector3(L * 1.2, L * 0.12, s * L * 0.3),
    ]);
    const g = new THREE.TubeGeometry(a, 8, L * 0.006, 3, false);
    g.deleteAttribute('uv');
    parts.push(g);
  }
  // 脚(短い棒を左右に)
  for (let k = 0; k < 5; k++) {
    for (const s of [-1, 1]) {
      const x = L * (0.25 - k * 0.1);
      const g = new THREE.CylinderGeometry(L * 0.008, L * 0.006, L * 0.16, 3);
      g.rotateX(s * 0.7);
      g.translate(x, -L * 0.06, s * L * 0.07);
      g.deleteAttribute('uv');
      parts.push(g);
    }
  }
  const merged = mergeAll(parts);
  merged.computeBoundingSphere();
  return merged;
}
function mergeAll(geos) {
  let n = 0, idx = 0;
  for (const g of geos) { n += g.attributes.position.count; idx += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), ind = new Uint32Array(idx);
  let o = 0, io = 0;
  for (const g of geos) {
    const gi = g.index ? g.index.array : [...Array(g.attributes.position.count).keys()];
    pos.set(g.attributes.position.array, o * 3);
    if (!g.attributes.normal) g.computeVertexNormals();
    nor.set(g.attributes.normal.array, o * 3);
    for (let i = 0; i < gi.length; i++) ind[io + i] = gi[i] + o;
    o += g.attributes.position.count; io += gi.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setIndex(new THREE.BufferAttribute(ind, 1));
  return out;
}

export function createShrimp(scene3d, cfg, rocks, uniforms, shaders) {
  const sc = cfg.shrimp;
  if (!sc) return { update() {} };
  const geo = shrimpGeometry(sc.length);
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(sc.color), roughness: 0.32, metalness: 0.0, emissive: new THREE.Color(sc.color), emissiveIntensity: 0.22 });
  patchUnderwater(mat, { shared: uniforms, shaders, key: 'shrimp' });
  const mesh = new THREE.InstancedMesh(geo, mat, sc.count);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  scene3d.add(mesh);

  // 置き場所: 流木と岩の上面を、上から光線を当てて探す
  const rng = makeRng(77);
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const woodCurves = cfg.wood.map((w) => new THREE.CatmullRomCurve3(w.points.map((p) => new THREE.Vector3(...p))));
  const items = [];
  let guard = 0;
  while (items.length < sc.count && guard++ < 2000) {
    const onWood = items.length < sc.onWood;
    let x, z;
    if (onWood) {
      const c = woodCurves[Math.floor(rng() * woodCurves.length)];
      const p = c.getPointAt(0.1 + rng() * 0.8);
      x = p.x + (rng() - 0.5) * 0.3; z = p.z + (rng() - 0.5) * 0.3;
    } else {
      const r = cfg.rocks[Math.floor(rng() * cfg.rocks.length)];
      const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * r.scale * 0.8;
      x = r.pos[0] + Math.cos(a) * d; z = r.pos[1] + Math.sin(a) * d;
    }
    ray.set(new THREE.Vector3(x, 20, z), down);
    const hit = ray.intersectObject(onWood ? rocks.wood : rocks.rocks, false)[0];
    if (!hit || hit.face.normal.y < 0.45) continue;
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    items.push({ p: hit.point.clone(), n, heading: rng() * Math.PI * 2, target: 0, timer: rng() * 4, phase: rng() * 10, scale: 0.85 + rng() * 0.3 });
  }
  mesh.count = items.length;

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), qa = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const s = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  function update(dt, t) {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      it.timer -= dt;
      if (it.timer <= 0) { it.target = it.heading + (Math.random() - 0.5) * 2.2; it.timer = 2 + Math.random() * 5; it.walk = Math.random() < 0.5 ? 0.6 : 0; }
      it.heading += (it.target - it.heading) * Math.min(1, dt * 1.5);
      // 面に沿ってほんの少し歩く(元の場所から離れすぎない)
      if (it.walk > 0) {
        it.walk -= dt;
        fwd.set(Math.cos(it.heading), 0, -Math.sin(it.heading)).projectOnPlane(it.n).normalize();
        it.p.addScaledVector(fwd, dt * 0.08);
      }
      q.setFromUnitVectors(up, it.n);
      qa.setFromAxisAngle(up, it.heading);
      q.multiply(qa);
      // 食べるしぐさで、体がわずかに上下する
      const bob = Math.sin(t * 6 + it.phase) * 0.006;
      s.setScalar(it.scale);
      m.compose(it.p.clone().addScaledVector(it.n, 0.035 + bob), q, s);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  update(0, 0);
  return { mesh, update };
}
