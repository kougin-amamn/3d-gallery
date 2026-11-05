import * as THREE from 'three';

// 部品の平面形状(mm)。押し出して厚みを付けるのは parts 側で行う。

const TAU = Math.PI * 2;
const pol = (r, a) => new THREE.Vector2(r * Math.cos(a), r * Math.sin(a));

/** インボリュート曲線上の点(基礎円半径 rb、展開角 t) */
function involute(rb, t) {
  return [rb * (Math.cos(t) + t * Math.sin(t)), rb * (Math.sin(t) - t * Math.cos(t))];
}

/**
 * インボリュート歯車の輪郭
 * @param {number} N 歯数
 * @param {number} m モジュール(歯の大きさ)
 */
export function involuteOutline(N, m, pressureDeg = 20, steps = 7) {
  const rp = (m * N) / 2;                     // ピッチ円
  const ra = rp + m;                          // 歯先円
  const rf = Math.max(rp - 1.25 * m, rp * 0.6); // 歯底円
  const rb = rp * Math.cos((pressureDeg * Math.PI) / 180); // 基礎円
  const tMax = Math.sqrt((ra * ra) / (rb * rb) - 1);
  const tPitch = Math.sqrt((rp * rp) / (rb * rb) - 1);
  const [px, py] = involute(rb, tPitch);
  const pitchAngle = Math.atan2(py, px);       // ピッチ円上での展開角
  const halfTooth = Math.PI / (2 * N);         // ピッチ円上の歯厚の半分(角度)
  const pts = [];
  for (let i = 0; i < N; i++) {
    const c = (i / N) * TAU;                    // 歯の中心角
    // 左の歯面(中心から −側)
    const flank = [];
    for (let s = 0; s <= steps; s++) {
      const t = (s / steps) * tMax;
      const [x, y] = involute(rb, t);
      const r = Math.hypot(x, y);
      const a = Math.atan2(y, x);
      flank.push([Math.max(r, rf), a]);
    }
    const base = c - halfTooth - pitchAngle;
    pts.push(pol(rf, c - Math.PI / N));                    // 歯底(歯と歯の間の中央)
    for (const [r, a] of flank) pts.push(pol(r, base + a));
    // 歯先
    const tipA = flank[flank.length - 1][1];
    const left = base + tipA, right = c + halfTooth + pitchAngle - tipA;
    for (let s = 1; s < 3; s++) pts.push(pol(ra, left + ((right - left) * s) / 3));
    // 右の歯面(対称)
    for (let s = flank.length - 1; s >= 0; s--) {
      const [r, a] = flank[s];
      pts.push(pol(r, c + halfTooth + pitchAngle - a));
    }
  }
  return { points: pts, rp, ra, rf };
}

/** かな(小歯車): 時計らしい丸い葉の形 */
export function pinionOutline(N, m) {
  const rp = (m * N) / 2;
  const ra = rp + m * 0.9;
  const rf = rp - m * 1.1;
  const pts = [];
  const steps = 10;
  for (let i = 0; i < N; i++) {
    const c = (i / N) * TAU;
    const w = (Math.PI / N) * 0.5;
    pts.push(pol(rf, c - Math.PI / N));
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;                     // 0→1 で葉の左端から右端へ
      const a = c - w + 2 * w * u;
      const bulge = Math.sin(u * Math.PI);
      pts.push(pol(rf + (ra - rf) * Math.pow(bulge, 0.45), a));
    }
  }
  return { points: pts, rp, ra, rf };
}

/**
 * ガンギ車(スイスレバー式の「クラブ歯」)。時計回りに回り、反時計回り側の面が衝撃面
 */
export function escapeOutline(N, rTip, rRoot) {
  const pitch = TAU / N;
  const pts = [];
  for (let i = 0; i < N; i++) {
    const a0 = i * pitch;
    // 歯底 → 鎖止め面(先頭の面、わずかに前傾) → 歯先 → 衝撃面(斜めに下がる) → 背中の曲線
    pts.push(pol(rRoot, a0 - pitch * 0.18));
    pts.push(pol(rRoot + (rTip - rRoot) * 0.55, a0 - pitch * 0.06));
    pts.push(pol(rTip, a0));
    pts.push(pol(rTip - 0.02, a0 + pitch * 0.07));
    pts.push(pol(rTip - 0.13, a0 + pitch * 0.2));
    // 背中: 歯底へ戻る緩い曲線
    for (let s = 1; s <= 6; s++) {
      const u = s / 6;
      const r = rTip - 0.13 - (rTip - 0.13 - rRoot) * Math.pow(u, 0.6);
      pts.push(pol(r, a0 + pitch * (0.2 + 0.62 * u)));
    }
  }
  return { points: pts };
}

/** 中央の穴(軸)と、スポークの間の窓を穴として加えた形を作る */
export function wheelShape(outline, opts = {}) {
  const shape = new THREE.Shape(outline.points);
  const { spokes = 0, rimInner = 0, hubR = 0.3, spokeW = 0.25, axle = 0.08 } = opts;
  if (spokes > 0 && rimInner > hubR + 0.1) {
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * TAU + Math.PI / spokes;
      const half = Math.PI / spokes;
      // スポークの幅ぶん角度を詰める(内側ほど角度で多く詰める)
      const dOut = Math.asin(Math.min(0.9, spokeW / 2 / rimInner));
      const dIn = Math.asin(Math.min(0.9, spokeW / 2 / (hubR + 0.08)));
      const seg = 18;
      const pts = [];
      for (let s = 0; s <= seg; s++) {
        const u = s / seg;
        pts.push(pol(rimInner, a - half + dOut + (2 * half - 2 * dOut) * u));
      }
      for (let s = 0; s <= seg; s++) {
        const u = s / seg;
        pts.push(pol(hubR + 0.08, a + half - dIn - (2 * half - 2 * dIn) * u));
      }
      shape.holes.push(new THREE.Path(pts));
    }
  }
  if (axle > 0) {
    const h = new THREE.Path();
    h.absarc(0, 0, axle, 0, TAU, true);
    shape.holes.push(h);
  }
  return shape;
}

/** 円環 */
export function ringShape(R, r, seg = 128) {
  const s = new THREE.Shape();
  s.absarc(0, 0, R, 0, TAU, false);
  const h = new THREE.Path();
  h.absarc(0, 0, r, 0, TAU, true);
  s.holes.push(h);
  void seg;
  return s;
}

/** 2点を結ぶ、両端が丸い棒 */
export function capsuleShape(a, b, w) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const ang = Math.atan2(dy, dx);
  const s = new THREE.Shape();
  s.absarc(a[0], a[1], w / 2, ang + Math.PI / 2, ang + Math.PI * 1.5, false);
  s.absarc(b[0], b[1], w / 2, ang - Math.PI / 2, ang + Math.PI / 2, false);
  s.closePath();
  return s;
}

/** 円の集まりを包む滑らかな輪郭(受けの形)。外周は凸包 */
export function hullShape(circles, holes = []) {
  const pts = [];
  for (const [x, y, r] of circles) {
    for (let i = 0; i < 96; i++) {
      const a = (i / 96) * TAU;
      pts.push([x + r * Math.cos(a), y + r * Math.sin(a)]);
    }
  }
  const hull = convexHull(pts);
  const s = new THREE.Shape(hull.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const [x, y, r] of holes) {
    const h = new THREE.Path();
    h.absarc(x, y, r, 0, TAU, true);
    s.holes.push(h);
  }
  return s;
}

function convexHull(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

/**
 * 受けの形: 円(軸や脚の部分)と、それをつなぐ腕を「なめらかに溶け合わせた」輪郭。
 * 距離場の smooth-min で角に丸いくびれを作り、等高線(マーチングスクエア)で外形を取り出す。
 * @param circles [[x, y, r], ...]
 * @param links   [[i, j, 腕の幅], ...]
 * @param k       くびれの丸み(mm)
 */
export function bridgeShape(circles, links = [], k = 0.9, step = 0.035) {
  const segDist = (px, py, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - a[0] - dx * t, py - a[1] - dy * t);
  };
  const smin = (a, b) => {
    const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k));
    return b * (1 - h) + a * h - k * h * (1 - h);
  };
  const prims = [
    ...circles.map(([x, y, r]) => (px, py) => Math.hypot(px - x, py - y) - r),
    ...links.map(([i, j, w]) => (px, py) => segDist(px, py, circles[i], circles[j]) - w / 2),
  ];
  const f = (x, y) => prims.reduce((acc, p) => smin(acc, p(x, y)), 1e9);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y, r] of circles) { x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); }
  return contourShape(f, [x0 - 0.5, y0 - 0.5, x1 + 0.5, y1 + 0.5], step, false);
}

/**
 * 距離場 f(x, y)(内側が負)の0等高線を、マーチングスクエアで Shape にする。
 * holes が true なら、外形の内側にできた輪を穴として加える(ブレゲ針の輪など)。
 */
export function contourShape(f, [x0, y0, x1, y1], step = 0.035, holes = true) {
  const nx = Math.ceil((x1 - x0) / step) + 1, ny = Math.ceil((y1 - y0) / step) + 1;
  const v = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) v[j * nx + i] = f(x0 + i * step, y0 + j * step);
  const key = (i, j, e) => `${i},${j},${e}`; // e: 0=下辺(水平) 1=左辺(垂直)
  const pt = (i, j, e) => {
    if (e === 0) { const a = v[j * nx + i], b = v[j * nx + i + 1]; return [x0 + (i + a / (a - b)) * step, y0 + j * step]; }
    const a = v[j * nx + i], b = v[(j + 1) * nx + i]; return [x0 + i * step, y0 + (j + a / (a - b)) * step];
  };
  const next = new Map();
  const link = (a, b) => { next.set(a, b); };
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const c0 = v[j * nx + i] < 0, c1 = v[j * nx + i + 1] < 0, c2 = v[(j + 1) * nx + i + 1] < 0, c3 = v[(j + 1) * nx + i] < 0;
      const idx = (c0 ? 1 : 0) | (c1 ? 2 : 0) | (c2 ? 4 : 0) | (c3 ? 8 : 0);
      if (idx === 0 || idx === 15) continue;
      const B = key(i, j, 0), R = key(i + 1, j, 1), T = key(i, j + 1, 0), L = key(i, j, 1);
      switch (idx) {
        case 1: link(L, B); break; case 2: link(B, R); break; case 3: link(L, R); break;
        case 4: link(R, T); break; case 5: link(L, T); link(R, B); break; case 6: link(B, T); break;
        case 7: link(L, T); break; case 8: link(T, L); break; case 9: link(T, B); break;
        case 10: link(T, R); link(B, L); break; case 11: link(T, R); break; case 12: link(R, L); break;
        case 13: link(R, B); break; case 14: link(B, L); break;
      }
    }
  }
  const seen = new Set();
  const loops = [];
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    let cur = start;
    while (cur && !seen.has(cur)) { seen.add(cur); loop.push(cur); cur = next.get(cur); }
    if (loop.length > 8) loops.push(loop);
  }
  loops.sort((a, b) => b.length - a.length);
  const toPts = (loop) => loop.map((s) => { const [i, j, e] = s.split(',').map(Number); return new THREE.Vector2(...pt(i, j, e)); }).filter((_, i) => i % 2 === 0);
  const shape = new THREE.Shape(toPts(loops[0]));
  if (holes) for (const l of loops.slice(1)) shape.holes.push(new THREE.Path(toPts(l)));
  return shape;
}

/** 角穴車のようなノコギリ歯の輪郭(時計回りに巻き上げる向き) */
export function ratchetOutline(N, m) {
  const rp = (m * N) / 2, ra = rp + m * 0.8, rf = rp - m * 1.1;
  const pts = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU, p = TAU / N;
    pts.push(pol(rf, a));
    pts.push(pol(rf + (ra - rf) * 0.35, a + p * 0.12));
    pts.push(pol(ra, a + p * 0.55));
    pts.push(pol(ra - 0.02, a + p * 0.62));
    pts.push(pol(rf, a + p * 0.92));
  }
  return { points: pts, rp, ra, rf };
}
