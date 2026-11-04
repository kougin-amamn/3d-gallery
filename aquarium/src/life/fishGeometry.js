import * as THREE from 'three';

// 魚の形を手続きで作る。全長1(頭 +0.5、尾の先 -0.5)、体高は shape.height。
// 属性 aFin: 体 0 / ヒレ 1(色と動きの切り替えに使う)
export function buildFishGeometry(shape) {
  const H = shape.height, W = shape.width;
  const tailLen = shape.tail;
  const bodyLen = 1 - tailLen;
  const x0 = 0.5;                    // 吻端
  const xPed = x0 - bodyLen;         // 尾柄(体と尾の境目)
  const sMax = 0.34;                 // 体高が最大になる位置
  const ped = 0.16;                  // 尾柄の太さ(最大比)

  const profile = (s) => {
    if (s < sMax) {
      const u = (sMax - s) / sMax;
      return Math.sqrt(Math.max(0, 1 - u * u));
    }
    const t = (s - sMax) / (1 - sMax);
    return 1 - (1 - ped) * (t * t * (3 - 2 * t));
  };

  const positions = [], normals = [], fins = [], indices = [];

  // ---- 胴体(楕円断面のロフト) ----
  const L = 30, R = 18;
  const centerY = (s) => H * 0.04 * Math.sin(Math.PI * s);     // 背中側へわずかに反る
  for (let i = 0; i <= L; i++) {
    const s = i / L;
    const x = x0 - s * bodyLen;
    const f = profile(s);
    const h = H * 0.5 * f;
    const w = W * 0.5 * f * (1 - 0.25 * Math.max(0, (s - sMax) / (1 - sMax)));
    for (let j = 0; j <= R; j++) {
      const a = (j / R) * Math.PI * 2;
      const sy = Math.sin(a), cz = Math.cos(a);
      const belly = sy < 0 ? 1.06 : 1.0;
      positions.push(x, centerY(s) + h * sy * belly, w * cz);
      normals.push(0, 0, 0);
      fins.push(0);
    }
  }
  // 尾柄の後ろを閉じる
  const capIndex = (L + 1) * (R + 1);
  positions.push(xPed - 0.012, centerY(1), 0);
  normals.push(0, 0, 0);
  fins.push(0);
  for (let i = 0; i < L; i++) {
    for (let j = 0; j < R; j++) {
      const a = i * (R + 1) + j, b = a + R + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  for (let j = 0; j < R; j++) {
    const a = L * (R + 1) + j;
    indices.push(a, capIndex, a + 1);
  }
  const bodyIndexCount = indices.length;

  // 胴体だけ法線を計算する
  const bodyGeo = new THREE.BufferGeometry();
  bodyGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  bodyGeo.setIndex(indices.slice());
  bodyGeo.computeVertexNormals();
  const bn = bodyGeo.attributes.normal.array;
  for (let i = 0; i < bn.length; i++) normals[i] = bn[i];

  // ---- ヒレ(z=0 の薄い板) ----
  const addFin = (grid, nu, nv) => {
    const start = positions.length / 3;
    for (const [x, y] of grid) {
      positions.push(x, y, 0);
      normals.push(0, 0, 1);
      fins.push(1);
    }
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) {
        const a = start + i * (nv + 1) + j, b = a + nv + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  };

  const bodyTop = (s) => centerY(s) + H * 0.5 * profile(s) * 0.92;
  const bodyBottom = (s) => centerY(s) - H * 0.5 * profile(s) * 1.0;

  // 尾びれ(二叉)
  {
    const nu = 8, nv = 10;
    const pedH = H * ped;
    const tailH = shape.tailHeight;
    const grid = [];
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      for (let j = 0; j <= nv; j++) {
        const v = j / nv * 2 - 1;
        const fork = 1 - shape.tailFork * (1 - Math.pow(Math.abs(v), 1.4));
        const x = xPed + 0.02 - (tailLen + 0.02) * u * fork;
        const hh = pedH * 0.5 + (tailH * 0.5 - pedH * 0.5) * Math.pow(u, 0.75);
        grid.push([x, centerY(1) + v * hh]);
      }
    }
    addFin(grid, nu, nv);
  }

  // 背びれ・尻びれ
  const longFin = (range, height, top) => {
    const nu = 10, nv = 6;
    const grid = [];
    const [s0, s1] = range;
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      const s = s0 + (s1 - s0) * u;
      const xBase = x0 - s * bodyLen;
      const yBase = top ? bodyTop(s) - 0.01 : bodyBottom(s) + 0.01;
      // 前が高く後ろへ流れる輪郭
      const env = Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.15 + 0.02)), 0.6) * (1 - 0.25 * u);
      for (let j = 0; j <= nv; j++) {
        const v = j / nv;
        const hgt = height * env * v;
        const sweep = shape.sweep * height * v * v * (0.4 + u);
        grid.push([xBase - sweep, yBase + (top ? hgt : -hgt)]);
      }
    }
    addFin(grid, nu, nv);
  };
  if (shape.dorsal > 0) longFin(shape.dorsalRange, shape.dorsal, true);
  if (shape.anal > 0) longFin(shape.analRange, shape.anal, false);

  // 胸びれ(体の側面に小さく)
  {
    const s = sMax * 0.9;
    const xb = x0 - s * bodyLen, yb = centerY(s) - H * 0.18;
    const len = 0.05 + H * 0.07;
    for (const side of [1, -1]) {
      const start = positions.length / 3;
      const zb = W * 0.5 * profile(s) * 0.8 * side;
      const pts = [
        [xb, yb, zb], [xb - 0.01, yb - 0.02, zb],
        [xb - len, yb - 0.03, zb + side * len * 0.35], [xb - len * 0.7, yb - 0.055, zb + side * len * 0.3],
      ];
      for (const p of pts) { positions.push(...p); normals.push(0, 0, side); fins.push(1); }
      indices.push(start, start + 2, start + 1, start + 1, start + 2, start + 3);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('aFin', new THREE.Float32BufferAttribute(fins, 1));
  geo.setIndex(indices);
  // 胴体(不透明)とヒレ(半透明)を別のマテリアルで描く
  geo.addGroup(0, bodyIndexCount, 0);
  geo.addGroup(bodyIndexCount, indices.length - bodyIndexCount, 1);
  geo.computeBoundingSphere();

  // 目の位置(体の前寄り、やや上)
  const se = 0.09;
  const eye = new THREE.Vector3(x0 - se * bodyLen, centerY(se) + H * 0.12, Math.max(0.018, H * 0.075));
  return { geometry: geo, eye, bodyH: H };
}
