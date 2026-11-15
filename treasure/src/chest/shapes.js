import * as THREE from 'three';
import { toCreasedNormals, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// 形を作る道具。箱の部品はすべてここの関数の組み合わせで作る。

/**
 * 角の丸い直方体。three.js の RoundedBoxGeometry と同じ考え方で、
 * 細かく割った立方体の頂点を「内側の箱 + 法線方向に半径 r」へ動かす。
 * 平らな面は平らなまま、角だけが滑らかに丸くなる(法線も正確)。
 */
export function roundedBox(w, h, d, r = 0.01, seg = 2) {
  r = Math.min(r, w / 2, h / 2, d / 2);
  const n = seg * 2 + 1;
  const g = new THREE.BoxGeometry(1, 1, 1, n, n, n).toNonIndexed();
  const half = 0.5 / n;
  const inner = new THREE.Vector3(w / 2 - r, h / 2 - r, d / 2 - r);
  const pos = g.attributes.position, nor = g.attributes.normal;
  const p = new THREE.Vector3(), nv = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    nv.set(p.x - Math.sign(p.x) * half, p.y - Math.sign(p.y) * half, p.z - Math.sign(p.z) * half);
    // 中央の帯(平らな面)は法線を面の向きにそろえる
    for (const a of ['x', 'y', 'z']) if (Math.abs(p[a]) <= half + 1e-6) nv[a] = 0;
    nv.normalize();
    pos.setXYZ(i,
      Math.sign(p.x) * inner.x + nv.x * r,
      Math.sign(p.y) * inner.y + nv.y * r,
      Math.sign(p.z) * inner.z + nv.z * r);
    nor.setXYZ(i, nv.x, nv.y, nv.z);
  }
  g.deleteAttribute('uv');
  return g;
}

/**
 * (z, y) 平面に描いた輪郭を x 方向へ length だけ押し出す(中心は x = 0)。
 * 角は 45° の面取り(bevel)。滑らかな曲面と面取りの角を両立させるため、
 * 30° 以下の角だけ法線をなめらかにする。
 */
export function extrudeX(pointsZY, length, bevel = 0.004, holes = [], curveSegments = 24) {
  const toShapePts = (pts) => pts.map(([z, y]) => new THREE.Vector2(-z, y));
  const shape = new THREE.Shape(toShapePts(pointsZY));
  for (const h of holes) shape.holes.push(new THREE.Path(toShapePts(h)));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1e-4, length - bevel * 2), bevelEnabled: bevel > 0,
    bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 1, curveSegments,
  });
  g.translate(0, 0, -(length - bevel * 2) / 2);
  g.rotateY(Math.PI / 2);
  g.deleteAttribute('uv');
  const out = toCreasedNormals(g, Math.PI / 6);
  g.dispose();
  return out;
}

/** (x, z) 平面に描いた輪郭を y 方向へ height だけ押し出す(下端が y = 0) */
export function extrudeY(pointsXZ, height, bevel = 0.004, holes = []) {
  const toShapePts = (pts) => pts.map(([x, z]) => new THREE.Vector2(x, z));
  const shape = new THREE.Shape(toShapePts(pointsXZ));
  for (const h of holes) shape.holes.push(new THREE.Path(toShapePts(h)));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1e-4, height - bevel * 2), bevelEnabled: bevel > 0,
    bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 1, curveSegments: 12,
  });
  g.translate(0, 0, bevel);
  g.rotateX(Math.PI / 2);          // z → -y になるので反転して上向きに
  g.scale(1, -1, 1);
  // 反転で面の向きが裏返るので、三角形の順番を戻す
  flipWinding(g);
  g.deleteAttribute('uv');
  const out = toCreasedNormals(g, Math.PI / 6);
  g.dispose();
  return out;
}

function flipWinding(g) {
  const pos = g.attributes.position;
  if (g.index) {
    const idx = g.index.array;
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    return;
  }
  for (const name of Object.keys(g.attributes)) {
    const a = g.attributes[name], s = a.itemSize, arr = a.array;
    for (let i = 0; i < pos.count; i += 3) {
      for (let k = 0; k < s; k++) {
        const b = (i + 1) * s + k, c = (i + 2) * s + k;
        const t = arr[b]; arr[b] = arr[c]; arr[c] = t;
      }
    }
  }
}

/** 円弧の点列。中心 (cz, cy)、半径 r、角度 a0→a1(z 軸から y 軸へ測る) */
export function arc(cz, cy, r, a0, a1, n = 24) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * (i / n);
    pts.push([cz + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

/** 角の丸い長方形の点列(2D) */
export function roundRect(w, h, r, n = 6) {
  const pts = [];
  const cs = [[w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, 90], [-w / 2 + r, -h / 2 + r, 180], [w / 2 - r, -h / 2 + r, 270]];
  for (const [cx, cy, a0] of cs) {
    for (let i = 0; i <= n; i++) {
      const a = ((a0 + (90 * i) / n) * Math.PI) / 180;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  }
  return pts;
}

/**
 * 箱投影の UV。面の向きで投影面を選び、along 軸を u(木目の流れ)にする。
 * offset で板ごとに木目の位置をずらし、scaleV で筋の間隔(太さ)を板ごとに変える。
 * 木口(along 方向を向いた切り口)はほぼ一点に縮め、頂点色で暗くする(paintEnds)。
 */
export function boxUV(g, { along = 'x', scale = 1, scaleV = scale, offset = [0, 0] } = {}) {
  const pos = g.attributes.position, nor = g.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  const other = { x: ['y', 'z'], y: ['x', 'z'], z: ['y', 'x'] }[along];
  const v3 = new THREE.Vector3(), n3 = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v3.fromBufferAttribute(pos, i); n3.fromBufferAttribute(nor, i);
    const ax = Math.abs(n3.x), ay = Math.abs(n3.y), az = Math.abs(n3.z);
    const dom = ax > ay && ax > az ? 'x' : ay > az ? 'y' : 'z';
    let u, v;
    if (dom === along) { u = v3[other[0]] * 0.04; v = v3[other[1]] * 0.04; }
    else { u = v3[along] * scale; v = (dom === other[0] ? v3[other[1]] : v3[other[0]]) * scaleV; }
    uv[i * 2] = u + offset[0];
    uv[i * 2 + 1] = v + offset[1];
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** 円筒の UV(フタの板): u = x、v = 弧の長さ */
export function cylUV(g, { cy = 0, cz = 0, scale = 1, scaleV = scale, offset = [0, 0] } = {}) {
  const pos = g.attributes.position, nor = g.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = Math.abs(nor.getX(i));
    const r = Math.hypot(y - cy, z - cz), a = Math.atan2(y - cy, z - cz);
    if (nx > 0.7) { uv[i * 2] = (z - cz) * scale + offset[0]; uv[i * 2 + 1] = (y - cy) * scaleV + offset[1]; }
    else { uv[i * 2] = x * scale + offset[0]; uv[i * 2 + 1] = a * r * scaleV + offset[1]; }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/**
 * 金具の角の摩耗: 面取りの部分の頂点色を明るくして、角だけ地金が光るようにする。
 * axis は押し出しの向き('x' / 'y')。'box' は角の丸い直方体。
 */
export function edgePaint(g, axis = 'box', bright = 1.3) {
  return paint(g, (p, n) => {
    let edge;
    if (axis === 'none') edge = false;
    else if (axis === 'box') edge = Math.max(Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)) < 0.97;
    else { const a = Math.abs(n[axis]); edge = a > 0.3 && a < 0.92; }
    const k = edge ? bright : 1;
    return [k, k, k];
  });
}

/** 頂点色をつける。fn(位置, 法線) → [r, g, b] */
export function paint(g, fn) {
  const pos = g.attributes.position, nor = g.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i); n.fromBufferAttribute(nor, i);
    const c = fn(p, n);
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** 属性をそろえて1つにまとめる(描画の回数を減らす) */
export function merge(list) {
  const keep = ['position', 'normal', 'uv', 'color'];
  const has = keep.filter((k) => list.every((g) => g.attributes[k]));
  const prepared = list.map((g) => {
    const h = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(h.attributes)) if (!has.includes(k)) h.deleteAttribute(k);
    return h;
  });
  return mergeGeometries(prepared, false);
}
