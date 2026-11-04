// 軌道計算の確認。既知の天文現象の日付で、位置関係が合っているかを調べる。
// 使い方: node tools/test-orbits.mjs
import fs from 'node:fs';
import { createEphemeris } from '../src/astro/ephemeris.js';
import { msToDays } from '../src/astro/time.js';

const data = JSON.parse(fs.readFileSync(new URL('../data/bodies.json', import.meta.url)));
const eph = createEphemeris(data.bodies);
const DEG = 180 / Math.PI;
const lon = (v) => ((Math.atan2(v[1], v[0]) * DEG) + 360) % 360;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const angle = (a, b) => {
  const d = Math.abs(lon(a) - lon(b)) % 360;
  return d > 180 ? 360 - d : d;
};

let fail = 0;
const check = (label, value, max) => {
  const ok = value <= max;
  if (!ok) fail++;
  console.log(`${ok ? 'OK  ' : 'NG  '} ${label}: ${value.toFixed(2)}° (許容 ${max}°)`);
};
const at = (iso) => eph.update(msToDays(Date.parse(iso)));

// 春分: 地心から見た太陽の黄経が0度 → 地球の日心黄経が180度。
// 計算は J2000 座標なので、その日の春分点との差(歳差 約1.397度/世紀)を足して比べる
let s = at('2026-03-20T14:46:00Z');
const precession = 1.397 * (26.22 / 100);
check('2026年春分 地球の日心黄経と180度の差(歳差補正後)', Math.abs(lon(s.earth.pos) + precession - 180), 0.05);

// 衝: 惑星と地球の日心黄経が一致する
for (const [id, iso] of [['mars', '2025-01-16T02:00:00Z'], ['jupiter', '2026-01-10T08:00:00Z'], ['saturn', '2025-09-21T05:00:00Z'], ['neptune', '2025-09-23T12:00:00Z']]) {
  s = at(iso);
  check(`${id} の衝 (${iso.slice(0, 10)})`, angle(s[id].pos, s.earth.pos), 0.5);
}

// 皆既日食 2024-04-08 18:18 UTC: 地球から見た月と太陽の方向がほぼ一致
s = at('2024-04-08T18:18:00Z');
const toSun = sub(s.sun.pos, s.earth.pos);
const toMoon = sub(s.moon.pos, s.earth.pos);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sep = Math.acos(dot(toSun, toMoon) / Math.hypot(...toSun) / Math.hypot(...toMoon)) * DEG;
check('2024年4月8日 日食 太陽と月の離角', sep, 0.6);

// 皆既月食 2025-09-07 18:12 UTC: 月が太陽のほぼ反対側
s = at('2025-09-07T18:12:00Z');
const sep2 = 180 - Math.acos(dot(sub(s.sun.pos, s.earth.pos), sub(s.moon.pos, s.earth.pos)) / Math.hypot(...sub(s.sun.pos, s.earth.pos)) / Math.hypot(...sub(s.moon.pos, s.earth.pos))) * DEG;
check('2025年9月7日 月食 反対方向からのずれ', sep2, 0.6);

// 地球の日本: 2026-01-01 03:00 UTC(日本時間正午)に東経135度が太陽を向く
s = at('2026-01-01T03:00:00Z');
const f = s.earth.frame;
const sunDir = sub(s.sun.pos, s.earth.pos).map((v) => v / Math.hypot(...sub(s.sun.pos, s.earth.pos)));
const lon135 = [0, 1, 2].map((i) => Math.cos(135 / DEG) * f.prime[i] + Math.sin(135 / DEG) * f.east[i]);
const lonAng = Math.acos(Math.min(1, dot(lon135, sunDir) / Math.hypot(...lon135))) * DEG;
check('日本時間正午 東経135度と太陽方向(赤緯分を含む)', lonAng, 25);

// 範囲外(3000年)でも計算できる
s = at('2900-06-01T00:00:00Z');
console.log(`2900年 木星の表: ${s.jupiter.el.table}, 冥王星の表: ${s.pluto.el.table}`);

console.log(fail ? `\n${fail}件が許容範囲外です` : '\nすべて許容範囲内です');
process.exit(fail ? 1 : 0);
