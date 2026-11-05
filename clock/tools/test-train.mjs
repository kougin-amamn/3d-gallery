// 輪列と脱進機の計算の確認。使い方: node tools/test-train.mjs
import fs from 'node:fs';
import { escapementState, trainAngles, trainRatios, moonAgeDays } from '../src/mech/train.js';

const cfg = JSON.parse(fs.readFileSync(new URL('../data/movement.json', import.meta.url)));
const DEG = 180 / Math.PI;
let fail = 0;
const check = (label, ok, detail = '') => {
  if (!ok) fail++;
  console.log(`${ok ? 'OK  ' : 'NG  '} ${label}${detail ? ` (${detail})` : ''}`);
};
const near = (a, b, eps) => Math.abs(a - b) <= eps;

// 歯数の比
const r = trainRatios(cfg);
check('2番車/香箱 = 8', near(r.centerPerBarrel, 8, 1e-9), r.centerPerBarrel);
check('3番車/2番車 = 8', near(r.thirdPerCenter, 8, 1e-9), r.thirdPerCenter);
check('4番車/3番車 = 7.5', near(r.fourthPerThird, 7.5, 1e-9), r.fourthPerThird);
check('ガンギ車/4番車 = 16', near(r.escapePerFourth, 16, 1e-9), r.escapePerFourth);
check('日の裏の比 = 12', near(r.motionWorks, 12, 1e-9), r.motionWorks);
const vph = cfg.beatsPerSecond * 3600;
const escTeethPerSec = (r.escapePerFourth / 60) * cfg.escape.teeth;
check('ガンギ車が毎秒4歯進む(1歯=2振動)', near(escTeethPerSec * 2, cfg.beatsPerSecond, 1e-9), `${escTeethPerSec} 歯/秒, ${vph} 振動/時`);

// 時刻と針の角度
const at = (h, m, s) => trainAngles(h * 3600 + m * 60 + s + 0.01, cfg);
let a = at(12, 30, 0);
check('12時30分00秒: 分針が180度', near((a.center * DEG) % 360, 180, 0.01), `${((a.center * DEG) % 360).toFixed(3)}°`);
check('12時30分00秒: 時針が15度', near((a.hour * DEG) % 360, 15, 0.01), `${((a.hour * DEG) % 360).toFixed(3)}°`);
a = at(3, 0, 45);
check('3時00分45秒: 秒針が270度(1/8秒刻みなので ±0.8°)', near((a.fourth * DEG) % 360, 270, 0.8), `${((a.fourth * DEG) % 360).toFixed(3)}°`);

// 秒針の誤差: どの時刻でも 1/8 秒以内
let maxErr = 0;
for (let i = 0; i < 20000; i++) {
  const t = Math.random() * 86400;
  const e = escapementState(t, cfg);
  maxErr = Math.max(maxErr, Math.abs((e.count - 0.5) / cfg.beatsPerSecond - t));
}
check('振動から数えた時刻と実時刻の差が 1/16 秒程度以内', maxErr <= 1 / 16 + 0.01, `最大 ${maxErr.toFixed(4)} 秒`);

// てんぷとアンクル: てんぷが中心を通るときアンクルは中央、振り切ったときは止まりに当たっている
const mid = escapementState(1 / 8 * 1000, cfg);
check('てんぷが中心のときアンクルは中央', near(mid.pallet, 0, 1e-6));
const far = escapementState(1 / 8 * 1000 + 1 / 16, cfg);
check('振り切ったときアンクルは止まりに当たる', near(Math.abs(far.pallet * DEG), cfg.pallet.swingDeg, 1e-6), `${(far.pallet * DEG).toFixed(2)}°`);
check('ガンギ車はロック中に動かない', near(escapementState(10.03, cfg).escape, escapementState(10.09, cfg).escape, 1e-12));

// 月齢: 2024-04-08 18:21 UTC は新月(日食)
const age = moonAgeDays(Date.UTC(2024, 3, 8, 18, 21));
check('2024年4月8日(日食)の月齢が新月付近', age < 0.8 || age > 28.8, `${age.toFixed(2)} 日`);

console.log(fail ? `\n${fail}件が不合格です` : '\nすべて合格です');
process.exit(fail ? 1 : 0);
