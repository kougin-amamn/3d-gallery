// 自転の向き。IAU WGCCRE の北極方向(赤経・赤緯)と本初子午線の角度 W から、
// 天体固定座標の基底を黄道座標で求める。

const DEG = Math.PI / 180;
export const OBLIQUITY = 23.4392911 * DEG; // J2000 の黄道傾斜角

/** 赤道座標(ICRF) → 黄道座標 */
export function equatorialToEcliptic([x, y, z]) {
  const c = Math.cos(OBLIQUITY), s = Math.sin(OBLIQUITY);
  return [x, c * y + s * z, -s * y + c * z];
}

export function radecToVector(raDeg, decDeg) {
  const ra = raDeg * DEG, dec = decDeg * DEG;
  return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
}

/**
 * 天体固定座標の基底(黄道座標)。
 * prime: 経度0度の方向、pole: 北極、east: 東経90度の方向
 */
export function bodyFrame(rot, days) {
  const T = days / 36525;
  const ra = rot.ra0 + (rot.raRate || 0) * T;
  const dec = rot.dec0 + (rot.decRate || 0) * T;
  const W = (rot.W0 + rot.Wdot * days) * DEG;

  const poleEq = radecToVector(ra, dec);
  // 赤道の昇交点(ICRF の赤道面との交線)
  const node = normalize(cross([0, 0, 1], poleEq));
  const q = cross(poleEq, node);
  const primeEq = [
    Math.cos(W) * node[0] + Math.sin(W) * q[0],
    Math.cos(W) * node[1] + Math.sin(W) * q[1],
    Math.cos(W) * node[2] + Math.sin(W) * q[2],
  ];
  const pole = equatorialToEcliptic(poleEq);
  const prime = equatorialToEcliptic(primeEq);
  const east = cross(pole, prime);
  return { pole, prime, east };
}

export function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
export function normalize(a) { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; }
