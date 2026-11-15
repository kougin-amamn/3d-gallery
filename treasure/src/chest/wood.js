import * as THREE from 'three';

// 木目、金の表面、金貨の刻印のテクスチャを起動時に作る。
// どれも上下左右につながる(繰り返して貼っても継ぎ目が出ない)ように、周期のあるノイズを使う。

function hash(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** 周期 (px, py) の値ノイズ */
function vnoise(x, y, px, py, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const m = (a, p) => ((a % p) + p) % p;
  const x0 = m(xi, px), x1 = m(xi + 1, px), y0 = m(yi, py), y1 = m(yi + 1, py);
  const a = hash(x0, y0, seed), b = hash(x1, y0, seed), c = hash(x0, y1, seed), d = hash(x1, y1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, px, py, seed, oct = 4) {
  let s = 0, amp = 0.5, f = 1;
  for (let o = 0; o < oct; o++) {
    s += amp * vnoise(x * f, y * f, px * f, py * f, seed + o * 17);
    amp *= 0.5; f *= 2;
  }
  return s;
}

const srgb = (hex) => new THREE.Color(hex);

/**
 * 木目。u(横)が木の繊維の向き。色、凹凸(法線)、粗さの3枚を返す。
 * 年輪の線を、ゆがみのノイズで波打たせ、ところどころに節(ふし)を入れる。
 */
export function woodTextures(cfg, colors) {
  const W = cfg.size, H = cfg.size;
  const light = srgb(colors.woodLight), dark = srgb(colors.woodDark);
  // 色は sRGB のまま混ぜる(キャンバスに描くため)
  const L = [light.r, light.g, light.b].map((c) => Math.pow(c, 1 / 2.2));
  const D = [dark.r, dark.g, dark.b].map((c) => Math.pow(c, 1 / 2.2));
  const height = new Float32Array(W * H);
  const tone = new Float32Array(W * H);
  const knots = [];
  for (let k = 0; k < cfg.knots; k++) knots.push([hash(k, 1, 9) , hash(k, 2, 9), 0.012 + 0.02 * hash(k, 3, 9)]);
  const rings = cfg.rings;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W, v = y / H;
      // 繊維方向に長く伸びたゆがみ
      const warp = fbm(u * 2, v * 6, 2, 6, 3) - 0.5;
      let f = v * rings + warp * 2.6;
      // 節: 年輪が節の周りで押し広げられる
      let knotDark = 0;
      for (const [kx, ky, kr] of knots) {
        let dx = u - kx; dx -= Math.round(dx);
        let dy = v - ky; dy -= Math.round(dy);
        const d2 = (dx * dx) / (kr * kr * 9) + (dy * dy) / (kr * kr);
        const e = Math.exp(-d2 * 0.5);
        f += e * 2.2 * Math.sign(dy || 1) * 0.5;
        knotDark = Math.max(knotDark, Math.exp(-d2 * 2.5));
      }
      const ring = f - Math.floor(f);
      // 年輪: 夏材(濃い)は細く、春材(淡い)は広い
      const late = Math.pow(Math.max(0, Math.sin(ring * Math.PI)), 6);
      const fiber = fbm(u * 4, v * 160, 4, 160, 5, 3);          // 細い繊維の筋
      const blotch = fbm(u * 3, v * 3, 3, 3, 11, 3);            // 大きな色むら
      let t = 0.22 + late * 0.42 + (fiber - 0.5) * 0.3 + (blotch - 0.5) * 0.4 + knotDark * 0.7;
      t = Math.max(0, Math.min(1, t));
      tone[y * W + x] = t;
      height[y * W + x] = -late * 0.6 - (fiber - 0.5) * 0.5 - knotDark * 0.4;
    }
  }
  const color = new Uint8Array(W * H * 4), normal = new Uint8Array(W * H * 4), rough = new Uint8Array(W * H * 4);
  const [r0, r1] = cfg.roughness;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x, t = tone[i];
      for (let c = 0; c < 3; c++) color[i * 4 + c] = Math.round(255 * (L[c] + (D[c] - L[c]) * t));
      color[i * 4 + 3] = 255;
      const hx = height[y * W + ((x + 1) % W)] - height[y * W + ((x - 1 + W) % W)];
      const hy = height[((y + 1) % H) * W + x] - height[((y - 1 + H) % H) * W + x];
      const s = 2.2;
      let nx = -hx * s, ny = -hy * s, nz = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      normal[i * 4] = Math.round((nx * 0.5 + 0.5) * 255);
      normal[i * 4 + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      normal[i * 4 + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      normal[i * 4 + 3] = 255;
      const g = Math.round(255 * (r0 + (r1 - r0) * Math.min(1, t * 1.2)));
      rough[i * 4] = rough[i * 4 + 1] = rough[i * 4 + 2] = g; rough[i * 4 + 3] = 255;
    }
  }
  const make = (data, srgbSpace) => {
    const t = new THREE.DataTexture(data, W, H);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true; t.anisotropy = 8;
    if (srgbSpace) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  };
  return { map: make(color, true), normalMap: make(normal, false), roughnessMap: make(rough, false) };
}

/** ベルベットの毛並み(内張り): ごく弱い凹凸の法線 */
export function velvetNormal(size = 256) {
  const data = new Uint8Array(size * size * 4);
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = fbm(x / size * 32, y / size * 32, 32, 32, 51, 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const hx = h[y * size + ((x + 1) % size)] - h[y * size + ((x - 1 + size) % size)];
      const hy = h[((y + 1) % size) * size + x] - h[((y - 1 + size) % size) * size + x];
      const i = (y * size + x) * 4;
      let nx = -hx * 3, ny = -hy * 3, nz = 1; const l = Math.hypot(nx, ny, nz);
      data[i] = Math.round((nx / l * 0.5 + 0.5) * 255); data[i + 1] = Math.round((ny / l * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round((nz / l * 0.5 + 0.5) * 255); data[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, size, size);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}

/**
 * 金の表面。色(くすみ)、粗さ(磨き傷)、法線(槌目)の3枚。
 * 本物の金属の安っぽさの差は「均一さ」から来るので、色・粗さ・面の向きにわずかなむらを入れる。
 * aged が大きいほど古びる(くすみが濃く、槌目が深い)。
 */
export function goldTextures({ aged = 0.5, size = 512, seed = 1 } = {}) {
  const N = size;
  const height = new Float32Array(N * N);
  // 槌目: ゆがんだ格子の点のまわりのくぼみ(周期的なボロノイ)
  const cells = 14;
  const pts = [];
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) pts.push([(i + 0.15 + 0.7 * hash(i, j, seed)) / cells, (j + 0.15 + 0.7 * hash(i, j, seed + 5)) / cells]);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N;
      let d1 = 9;
      const ci = Math.floor(u * cells), cj = Math.floor(v * cells);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = (ci + di + cells) % cells, jj = (cj + dj + cells) % cells;
        let [px, py] = pts[jj * cells + ii];
        px += Math.floor((ci + di) / cells) * 1 + (ci + di < 0 ? 0 : 0);
        let dx = u - px; dx -= Math.round(dx);
        let dy = v - py; dy -= Math.round(dy);
        d1 = Math.min(d1, Math.hypot(dx, dy) * cells);
      }
      const dent = -Math.pow(Math.max(0, 1 - d1 * 1.1), 2);
      height[y * N + x] = dent * (0.4 + aged * 0.8) + (fbm(u * 8, v * 8, 8, 8, seed + 9, 3) - 0.5) * 0.35;
    }
  }
  const col = new Uint8Array(N * N * 4), rough = new Uint8Array(N * N * 4), nrm = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x, u = x / N, v = y / N;
      // くすみ: 大きな雲状のむら + 小さな斑点。くすむと茶色く暗くなる
      const cloud = fbm(u * 3, v * 3, 3, 3, seed + 21, 4);
      const spot = Math.pow(fbm(u * 24, v * 24, 24, 24, seed + 33, 2), 4) * 3;
      const tarnish = Math.min(1, Math.max(0, (cloud - 0.45) * 2.2 * aged + spot * aged * 0.5));
      // くぼみの底はくすみが残り、出っ張りは磨かれて明るい
      const hgt = height[i];
      const t = Math.min(1, tarnish + Math.max(0, -hgt) * aged * 0.6);
      const r = 1 - t * 0.42, g = 1 - t * 0.5, b = 1 - t * 0.62;   // 白に掛ける係数(金の色は素材の color で決める)
      col[i * 4] = Math.round(255 * r); col[i * 4 + 1] = Math.round(255 * g); col[i * 4 + 2] = Math.round(255 * b); col[i * 4 + 3] = 255;
      // 粗さ: 一方向の細かい磨き傷 + くすみは粗い
      const scratch = Math.pow(fbm(u * 3, v * 120, 3, 120, seed + 41, 2), 5) * 4 + Math.pow(fbm(u * 90, v * 4, 90, 4, seed + 51, 2), 6) * 3;
      const rr = 0.12 + aged * 0.16 + scratch * 0.12 + t * 0.3;
      const gch = Math.round(255 * Math.min(1, rr));
      rough[i * 4] = rough[i * 4 + 1] = rough[i * 4 + 2] = gch; rough[i * 4 + 3] = 255;
      const hx = height[y * N + ((x + 1) % N)] - height[y * N + ((x - 1 + N) % N)];
      const hy = height[((y + 1) % N) * N + x] - height[((y - 1 + N) % N) * N + x];
      let nx = -hx * 3, ny = -hy * 3, nz = 1; const l = Math.hypot(nx, ny, nz);
      nrm[i * 4] = Math.round((nx / l * 0.5 + 0.5) * 255); nrm[i * 4 + 1] = Math.round((ny / l * 0.5 + 0.5) * 255);
      nrm[i * 4 + 2] = Math.round((nz / l * 0.5 + 0.5) * 255); nrm[i * 4 + 3] = 255;
    }
  }
  const make = (d, srgb) => {
    const t = new THREE.DataTexture(d, N, N);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
    return t;
  };
  return { map: make(col, true), roughnessMap: make(rough, false), normalMap: make(nrm, false) };
}

/**
 * 金貨の刻印(浮き彫り)の法線。中央に王冠、まわりに輪と粒。
 * キャンバスに白黒で描いてぼかし、それを高さとして法線にする。
 */
export function coinEmboss(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const S = size, m = S / 2;
  x.fillStyle = '#000'; x.fillRect(0, 0, S, S);
  // 2回重ねて描く: 大きくぼかした層でふっくらした盛り上がり、細くぼかした層でくっきりした縁
  const draw = () => {
    x.fillStyle = '#fff'; x.strokeStyle = '#fff';
    // 縁の内側の輪
    x.lineWidth = S * 0.025; x.beginPath(); x.arc(m, m, S * 0.4, 0, Math.PI * 2); x.stroke();
    // 粒の輪
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      x.beginPath(); x.arc(m + Math.cos(a) * S * 0.45, m + Math.sin(a) * S * 0.45, S * 0.014, 0, Math.PI * 2); x.fill();
    }
    // 王冠
    x.beginPath();
    const w = S * 0.36, h = S * 0.24, bx = m - w / 2, by = m + h * 0.45;
    x.moveTo(bx, by);
    x.lineTo(bx - w * 0.04, by - h * 0.85);
    x.lineTo(bx + w * 0.25, by - h * 0.45);
    x.lineTo(bx + w * 0.5, by - h * 1.05);
    x.lineTo(bx + w * 0.75, by - h * 0.45);
    x.lineTo(bx + w * 1.04, by - h * 0.85);
    x.lineTo(bx + w, by);
    x.closePath(); x.fill();
    x.fillRect(bx - w * 0.02, by + h * 0.12, w * 1.04, h * 0.18);
    for (const [px, py] of [[bx - w * 0.04, by - h * 0.85], [bx + w * 0.5, by - h * 1.05], [bx + w * 1.04, by - h * 0.85]]) {
      x.beginPath(); x.arc(px, py - S * 0.012, S * 0.026, 0, Math.PI * 2); x.fill();
    }
    // 王冠の下の小さな星2つ
    for (const sx of [-1, 1]) {
      const cx = m + sx * S * 0.16, cy = m + S * 0.24;
      x.beginPath();
      for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5; const r = k % 2 ? S * 0.016 : S * 0.04; x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
      x.closePath(); x.fill();
    }
  };
  x.globalCompositeOperation = 'lighter';
  x.globalAlpha = 0.55; x.filter = `blur(${S / 28}px)`; draw();
  x.globalAlpha = 0.5; x.filter = `blur(${S / 110}px)`; draw();
  x.globalAlpha = 1; x.filter = 'none';
  const img = x.getImageData(0, 0, S, S).data;
  const hgt = (i, j) => img[(Math.min(S - 1, Math.max(0, j)) * S + Math.min(S - 1, Math.max(0, i))) * 4] / 255;
  const data = new Uint8Array(S * S * 4);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const dx = hgt(i + 1, j) - hgt(i - 1, j), dy = hgt(i, j + 1) - hgt(i, j - 1);
    let nx = -dx * 4, ny = dy * 4, nz = 1; const l = Math.hypot(nx, ny, nz);
    const k = (j * S + i) * 4;
    data[k] = Math.round((nx / l * 0.5 + 0.5) * 255); data[k + 1] = Math.round((ny / l * 0.5 + 0.5) * 255);
    data[k + 2] = Math.round((nz / l * 0.5 + 0.5) * 255); data[k + 3] = 255;
  }
  const t = new THREE.DataTexture(data, S, S);
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}
