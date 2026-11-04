// イェール輝星星表(BSC5)の固定長テキストを、描画用のコンパクトなJSONに変換する。
// 使い方: node tools/build-stars.mjs <catalog> data/stars.json
// 出典: https://heasarc.gsfc.nasa.gov/W3Browse/star-catalog/bsc5p.html
import fs from 'node:fs';

const [src, out] = process.argv.slice(2);
if (!src || !out) {
  console.error('使い方: node tools/build-stars.mjs <catalog> <out.json>');
  process.exit(1);
}

// よく知られた明るい星の固有名(HR番号 → 日本語名)
const NAMES = {
  2491: 'シリウス', 2326: 'カノープス', 5340: 'アークトゥルス', 7001: 'ベガ',
  1708: 'カペラ', 1713: 'リゲル', 2943: 'プロキオン', 2061: 'ベテルギウス',
  472: 'アケルナル', 7557: 'アルタイル', 1457: 'アルデバラン', 5056: 'スピカ',
  6134: 'アンタレス', 2990: 'ポルックス', 8728: 'フォーマルハウト', 7924: 'デネブ',
  3982: 'レグルス', 424: '北極星',
};

const field = (line, a, b) => line.slice(a - 1, b).trim();
const stars = [];
for (const line of fs.readFileSync(src, 'latin1').split('\n')) {
  if (line.length < 110) continue;
  const rah = field(line, 76, 77);
  if (!rah) continue; // 位置のない項目(新星など)は除外
  const vmag = parseFloat(field(line, 103, 107));
  if (!Number.isFinite(vmag)) continue;
  const ra = (parseFloat(rah) + parseFloat(field(line, 78, 79)) / 60 + parseFloat(field(line, 80, 83)) / 3600) * 15;
  const sign = field(line, 84, 84) === '-' ? -1 : 1;
  const dec = sign * (parseFloat(field(line, 85, 86)) + parseFloat(field(line, 87, 88)) / 60 + parseFloat(field(line, 89, 90)) / 3600);
  let bv = parseFloat(field(line, 110, 114));
  if (!Number.isFinite(bv)) bv = 0.6;
  const hr = parseInt(field(line, 1, 4), 10);
  const row = [+ra.toFixed(4), +dec.toFixed(4), +vmag.toFixed(2), +bv.toFixed(2)];
  if (NAMES[hr]) row.push(NAMES[hr]);
  stars.push(row);
}
stars.sort((a, b) => a[2] - b[2]); // 明るい順(画質に応じて先頭から使う)

const json = {
  source: 'Yale Bright Star Catalog, 5th Revised Ed. (HEASARC)',
  fields: ['raDeg', 'decDeg', 'vmag', 'bv', 'name?'],
  epoch: 'J2000',
  stars,
};
fs.writeFileSync(out, JSON.stringify(json));
console.log(`${stars.length} stars -> ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
