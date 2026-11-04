// 惑星の位置計算。JPL「Approximate Positions of the Planets」(E.M. Standish) の
// ケプラー軌道要素を使い、日心黄道座標(J2000、単位au)を求める。
// 描画に依存しない純粋な関数だけを置く(Nodeでテストできる)。

const DEG = Math.PI / 180;

/** 角度を -180〜180 度に収める */
export const wrap180 = (deg) => ((((deg + 180) % 360) + 360) % 360) - 180;

/** ケプラー方程式 M = E − e sin E を解く(M, E は度) */
export function solveKepler(Mdeg, e) {
  const M = wrap180(Mdeg);
  const eStar = e / DEG; // 度単位の離心率
  let E = M + eStar * Math.sin(M * DEG);
  for (let i = 0; i < 12; i++) {
    const dM = M - (E - eStar * Math.sin(E * DEG));
    const dE = dM / (1 - e * Math.cos(E * DEG));
    E += dE;
    if (Math.abs(dE) < 1e-8) break;
  }
  return E;
}

/**
 * 指定時刻の軌道要素を求める。
 * @param {object} orbit  bodies.json の orbit(table1 と任意で table2)
 * @param {number} days   J2000 からの日数(TT)
 * @returns {{a,e,I,L,peri,node,M, table:'1'|'2'|'1x'}}
 */
export function elementsAt(orbit, days) {
  const T = days / 36525; // ユリウス世紀
  const year = 2000 + days / 365.25;
  let t = orbit.table1;
  let table = '1';
  if ((year < 1800 || year > 2050) && orbit.table2) { t = orbit.table2; table = '2'; }
  else if (year < 1800 || year > 2050) table = '1x'; // 範囲外だが別表がない(精度低下)

  const [a0, e0, I0, L0, p0, n0] = t.values;
  const [a1, e1, I1, L1, p1, n1] = t.rates;
  const el = {
    a: a0 + a1 * T,
    e: e0 + e1 * T,
    I: I0 + I1 * T,
    L: L0 + L1 * T,
    peri: p0 + p1 * T,
    node: n0 + n1 * T,
    table,
  };
  let M = el.L - el.peri;
  if (table === '2' && t.extra) {
    const [b, c, s, f] = t.extra;
    M += b * T * T + c * Math.cos(f * T * DEG) + s * Math.sin(f * T * DEG);
  }
  el.M = M;
  return el;
}

/** 軌道要素から日心黄道座標(au)を求める。返り値 [x, y, z](z は黄道の北) */
export function positionFromElements(el, eccentricAnomaly) {
  const E = eccentricAnomaly ?? solveKepler(el.M, el.e);
  const w = (el.peri - el.node) * DEG; // 近日点引数
  const O = el.node * DEG;
  const I = el.I * DEG;
  const xp = el.a * (Math.cos(E * DEG) - el.e);
  const yp = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E * DEG);
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), cI = Math.cos(I), sI = Math.sin(I);
  return [
    (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    (sw * sI) * xp + (cw * sI) * yp,
  ];
}

export function heliocentric(orbit, days) {
  const el = elementsAt(orbit, days);
  return { pos: positionFromElements(el), el };
}

/** 軌道の形(1周分の点列、au)。軌道線の描画に使う */
export function orbitPath(el, segments = 360) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    // 離心近点角で等分すると、近日点付近も滑らかになる
    const E = (i / segments) * 360;
    pts.push(positionFromElements(el, E));
  }
  return pts;
}

/** 公転周期(日) */
export const periodDays = (orbit) => 36525 * 360 / orbit.table1.rates[3];
