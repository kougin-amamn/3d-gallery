import * as THREE from 'three';

// 時計の仕上げ模様を「異方性反射の向き」のテクスチャとして作る。
// 金属を磨いた筋の向きに沿って光が伸びるので、光を動かすと模様が浮かび上がる。
// anisotropyMap: R,G = 筋の向き(タンジェント空間、-1〜1 を 0〜255 に)、B = 強さ
// roughnessMap: G = 粗さ(three.js は G チャンネルを読む)

function makeTexture(data, size, repeat = true) {
  const t = new THREE.DataTexture(data, size, size);
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}
const enc = (v) => Math.max(0, Math.min(255, Math.round((v * 0.5 + 0.5) * 255)));

/** 円形の筋目(歯車の面): 中心の周りを回る向き。中心が (0.5, 0.5) */
export function circularGraining(size = 512) {
  const aniso = new Uint8Array(size * size * 4);
  const rough = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const u = (x + 0.5) / size - 0.5, v = (y + 0.5) / size - 0.5;
      const r = Math.hypot(u, v) + 1e-6;
      aniso[i] = enc(-v / r); aniso[i + 1] = enc(u / r); aniso[i + 2] = 255; aniso[i + 3] = 255;
      // 同心円の細かな筋で粗さがわずかに揺らぐ
      const ring = 0.5 + 0.5 * Math.sin(r * size * 2.2) * Math.sin(r * 61.0);
      const g = 0.82 + 0.18 * ring;
      rough[i] = rough[i + 1] = rough[i + 2] = Math.round(g * 255); rough[i + 3] = 255;
    }
  }
  return { aniso: makeTexture(aniso, size, false), rough: makeTexture(rough, size, false) };
}

/** 太陽のような放射状の筋目(角穴車・丸穴車): 中心から外へ向かう向き */
export function radialGraining(size = 512) {
  const aniso = new Uint8Array(size * size * 4);
  const rough = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const u = (x + 0.5) / size - 0.5, v = (y + 0.5) / size - 0.5;
      const r = Math.hypot(u, v) + 1e-6;
      aniso[i] = enc(u / r); aniso[i + 1] = enc(v / r); aniso[i + 2] = 255; aniso[i + 3] = 255;
      const a = Math.atan2(v, u);
      const g = 0.8 + 0.2 * (0.5 + 0.5 * Math.sin(a * 360) * Math.sin(a * 97));
      rough[i] = rough[i + 1] = rough[i + 2] = Math.round(g * 255); rough[i + 3] = 255;
    }
  }
  return { aniso: makeTexture(aniso, size, false), rough: makeTexture(rough, size, false) };
}

/**
 * コート・ド・ジュネーブ(縞模様)。1枚のテクスチャに bands 本の縞を入れ、繰り返して使う。
 * 各縞の中では、回転する砥石が描いた円弧に沿って筋が曲がる。
 */
export function genevaStripes(size = 512, bands = 4) {
  const aniso = new Uint8Array(size * size * 4);
  const rough = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const across = (x + 0.5) / size * bands;           // 縞を横切る方向
      const band = Math.floor(across);
      const v = across - band - 0.5;                     // 縞の中の位置 -0.5〜0.5
      const along = (y + 0.5) / size * bands;            // 縞に沿う方向
      // 砥石の円弧: 縞の中央では縞を横切る向き、端に行くほど傾く
      const dir = [1.0, v * 1.3];
      void along;
      const l = Math.hypot(dir[0], dir[1]);
      aniso[i] = enc(dir[0] / l); aniso[i + 1] = enc(dir[1] / l); aniso[i + 2] = 255; aniso[i + 3] = 255;
      // 縞の境目はわずかに粗く、境目が線として見える
      const edge = Math.pow(Math.abs(v) * 2, 8);
      const g = 0.7 + 0.3 * edge;
      rough[i] = rough[i + 1] = rough[i + 2] = Math.round(g * 255); rough[i + 3] = 255;
    }
  }
  return { aniso: makeTexture(aniso, size), rough: makeTexture(rough, size) };
}

/**
 * ペルラージュ(小さな円の筋目を重ねた模様)。1枚に cells×cells 個の円を並べ、繰り返して使う。
 * 円は後から打ったものが上に重なる(実物と同じ順番)。
 */
export function perlage(size = 512, cells = 6) {
  const aniso = new Uint8Array(size * size * 4);
  const rough = new Uint8Array(size * size * 4);
  const R = 0.92;                    // 円の半径(セルの大きさに対する割合)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const gx = (x + 0.5) / size * cells, gy = (y + 0.5) / size * cells;
      let best = null, bestOrder = -Infinity;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const cy = Math.floor(gy) + dy;
          const cx = Math.floor(gx) + dx;
          // 1列おきに半分ずらす
          const hsh = Math.sin((((cx % cells) + cells) % cells) * 12.9898 + (((cy % cells) + cells) % cells) * 78.233) * 43758.5453;
          const jx = (hsh - Math.floor(hsh)) - 0.5, jy = ((hsh * 1.7) - Math.floor(hsh * 1.7)) - 0.5;
          const ox = cx + 0.5 + ((((cy % 2) + 2) % 2) ? 0.5 : 0) + jx * 0.16, oy = cy + 0.5 + jy * 0.16;
          const ddx = gx - ox, ddy = gy - oy;
          const d = Math.hypot(ddx, ddy);
          if (d > R) continue;
          const order = cy * 1000 + cx;  // 打った順番
          if (order > bestOrder) { bestOrder = order; best = [ddx, ddy, d, hsh - Math.floor(hsh)]; }
        }
      }
      if (!best) best = [1, 0, 1, 0.5];
      const [ddx, ddy, d, rnd] = best;
      const r = d + 1e-6;
      aniso[i] = enc(-ddy / r); aniso[i + 1] = enc(ddx / r); aniso[i + 2] = 190; aniso[i + 3] = 255;
      // 円の縁は少し粗い
      const g = 0.8 + 0.1 * rnd + 0.1 * Math.pow(d / R, 2);
      rough[i] = rough[i + 1] = rough[i + 2] = Math.round(g * 255); rough[i + 3] = 255;
    }
  }
  return { aniso: makeTexture(aniso, size), rough: makeTexture(rough, size) };
}

/** 部品ごとにテクスチャの位置合わせを変えるための複製 */
export function placed(tex, { repeat = 1, offset = [0, 0], rotation = 0 } = {}) {
  const t = tex.clone();
  t.repeat.set(repeat, repeat);
  t.offset.set(offset[0], offset[1]);
  t.rotation = rotation;
  t.needsUpdate = true;
  return t;
}
