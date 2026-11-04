// 衛星の位置計算(母天体中心の黄道座標、km)。
// 月: 天文年鑑の簡易式(精度 約0.3度。月相・日食の日付が分かる程度)
// ガリレオ衛星: Meeus『Astronomical Algorithms』第44章の低精度式
// その他: 平均軌道要素による円軌道(位相は概算)

const DEG = Math.PI / 180;
const sin = (d) => Math.sin(d * DEG);
const cos = (d) => Math.cos(d * DEG);
const EARTH_RADIUS_KM = 6378.14;

/** 月の地心黄道座標(km) */
export function moonGeocentric(days) {
  const T = days / 36525;
  const lon = 218.32 + 481267.881 * T
    + 6.29 * sin(134.9 + 477198.85 * T) - 1.27 * sin(259.2 - 413335.38 * T)
    + 0.66 * sin(235.7 + 890534.23 * T) + 0.21 * sin(269.9 + 954397.70 * T)
    - 0.19 * sin(357.5 + 35999.05 * T) - 0.11 * sin(186.6 + 966404.05 * T);
  const lat = 5.13 * sin(93.3 + 483202.03 * T) + 0.28 * sin(228.2 + 960400.87 * T)
    - 0.28 * sin(318.3 + 6003.18 * T) - 0.17 * sin(217.6 - 407332.20 * T);
  const par = 0.9508 + 0.0518 * cos(134.9 + 477198.85 * T) + 0.0095 * cos(259.2 - 413335.38 * T)
    + 0.0078 * cos(235.7 + 890534.23 * T) + 0.0028 * cos(269.9 + 954397.70 * T);
  const r = EARTH_RADIUS_KM / Math.sin(par * DEG);
  // 式は「その日の春分点」基準なので、歳差(1世紀に約1.397度)を戻して J2000 にそろえる
  const lonJ2000 = lon - 1.3970 * T;
  return [r * cos(lat) * cos(lonJ2000), r * cos(lat) * sin(lonJ2000), r * sin(lat)];
}

/**
 * ガリレオ衛星の木星中心の位置(黄道座標、km)。
 * Meeus の u は地球から見た角度なので、位相角 ψ を除いて太陽基準の角度にする。
 * @param {number} days J2000 からの日数
 * @param {number[]} jupiterHelio 木星の日心位置(au)
 * @param {number} index 0:イオ 1:エウロパ 2:ガニメデ 3:カリスト
 * @param {number} aKm 軌道長半径
 */
export function galilean(days, jupiterHelio, index, aKm) {
  const d = days;
  const V = 172.74 + 0.00111588 * d;
  const N = 20.020 + 0.0830853 * d + 0.329 * sin(V);
  const B = 5.555 * sin(N) + 0.168 * sin(2 * N);
  const base = [163.8069 + 203.4058646 * d, 358.4140 + 101.2916335 * d, 5.7176 + 50.2345180 * d, 224.8092 + 21.4879800 * d];
  // 木星から太陽への向きを基準に、公転方向へ測った角度
  const phi = base[index] - B;
  const [jx, jy] = jupiterHelio;
  const sunDir = Math.atan2(-jy, -jx) / DEG;
  const ang = sunDir + phi;
  return [aKm * cos(ang), aKm * sin(ang), 0];
}

/** 円軌道の衛星(母天体の赤道面、km)。pole は母天体の自転軸(黄道座標の単位ベクトル) */
export function circularMoon(days, m, pole) {
  const ang = (m.L0 + (360 / m.periodDays) * days) * DEG;
  // 赤道面の基底(北極と黄道北極から作る)
  const ref = Math.abs(pole[2]) > 0.99 ? [1, 0, 0] : [0, 0, 1];
  const u = normalize(cross(ref, pole));
  const v = cross(pole, u);
  const c = Math.cos(ang), s = Math.sin(ang);
  return [
    m.aKm * (c * u[0] + s * v[0]),
    m.aKm * (c * u[1] + s * v[1]),
    m.aKm * (c * u[2] + s * v[2]),
  ];
}

function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function normalize(a) { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; }
