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

/**
 * 木目(CanvasTexture)。横(u)が板の長手方向。
 * - color: 色。板ごとの色の違いは頂点色で掛けるので、ここは1種類
 * - surface: 灰色1枚を、凹凸(bumpMap は R)と粗さ(roughnessMap は G)の両方に使う。
 *   明るさ 0.8〜0.95 がそのまま粗さになり、暗い筋(道管・晩材)は浅い溝になる
 * 年輪の等高線ではなく、長手方向に流れる細い筋の集まりで描く(柾目〜追柾の板)。
 * 筋の間隔・太さ・濃さ・うねりを1本ずつ変え、規則的な縞に見えないようにする。
 */
export function woodTextures(cfg, colors) {
  const W = cfg.width, H = cfg.height;
  let s = cfg.seed || 1;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const col = mk(), srf = mk();
  const cx = col.getContext('2d'), sx = srf.getContext('2d');
  const base = new THREE.Color(colors.wood), dark = new THREE.Color(colors.woodDark), light = new THREE.Color(colors.woodLight);
  const css = (c, a = 1) => `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
  const sRGB = (c) => c.clone().convertLinearToSRGB();
  const B = sRGB(base), D = sRGB(dark), L = sRGB(light);
  cx.fillStyle = css(B); cx.fillRect(0, 0, W, H);
  sx.fillStyle = `rgb(${Math.round(cfg.roughness[1] * 255)},${Math.round(cfg.roughness[1] * 255)},${Math.round(cfg.roughness[1] * 255)})`;
  sx.fillRect(0, 0, W, H);

  // 上下に3回描いて、縦方向にも継ぎ目なくつながるようにする
  const wrapY = (fn) => { for (const o of [-H, 0, H]) fn(o); };
  // 1) 幅の広い色の帯(材の色むら)
  for (let i = 0; i < cfg.bands; i++) {
    const y = rnd() * H, h = H * (0.04 + rnd() * 0.18), c = rnd() < 0.5 ? L : D;
    wrapY((o) => {
      const g = cx.createLinearGradient(0, y + o - h, 0, y + o + h);
      g.addColorStop(0, css(c, 0)); g.addColorStop(0.5, css(c, 0.10 + rnd() * 0.16)); g.addColorStop(1, css(c, 0));
      cx.fillStyle = g; cx.fillRect(0, y + o - h, W, h * 2);
    });
  }
  // 2) 長手方向の筋。u 方向は1周期で必ず元に戻る(横にも継ぎ目なし)
  const knots = [];
  for (let k = 0; k < cfg.knots; k++) knots.push({ x: rnd() * W, y: rnd() * H, w: W * (0.04 + rnd() * 0.05), a: H * (0.02 + rnd() * 0.04) });
  const line = (y0, amp, ph, k, wid, alphaC, alphaS, tone) => {
    wrapY((o) => {
      cx.beginPath(); sx.beginPath();
      for (let x = 0; x <= W; x += 8) {
        let y = y0 + o + amp * Math.sin((x / W) * Math.PI * 2 * k + ph) + amp * 0.35 * Math.sin((x / W) * Math.PI * 2 * (k + 2) + ph * 1.7);
        // 節の近くで筋が押しのけられる
        for (const n of knots) {
          let dx = x - n.x; dx -= Math.round(dx / W) * W;
          const dy = (y0 - n.y);
          const e = Math.exp(-(dx * dx) / (n.w * n.w)) * Math.exp(-(dy * dy) / (n.a * n.a * 16));
          y += Math.sign(dy || 1) * n.a * e;
        }
        if (x === 0) { cx.moveTo(x, y); sx.moveTo(x, y); } else { cx.lineTo(x, y); sx.lineTo(x, y); }
      }
      cx.lineWidth = sx.lineWidth = wid;
      cx.strokeStyle = css(tone, alphaC); cx.stroke();
      sx.strokeStyle = `rgba(0,0,0,${alphaS})`; sx.stroke();
    });
  };
  let y = 0;
  while (y < H) {
    // 間隔はばらばら(詰まった所と空いた所ができる)。うねりは小さく、ほぼまっすぐ流れる
    y += (H / cfg.lines) * (0.3 + rnd() * 1.4);
    const r = rnd();
    const late = r < 0.18;                     // 濃い晩材の筋(少なめ)
    const hair = r > 0.55;                     // ごく細い筋(多め)
    line(y, H * (0.001 + rnd() * 0.005), rnd() * 6.28, 1 + Math.floor(rnd() * 2),
      late ? 1.0 + rnd() * 1.6 : hair ? 0.5 : 0.7 + rnd() * 0.8,
      late ? 0.16 + rnd() * 0.16 : hair ? 0.05 + rnd() * 0.07 : 0.07 + rnd() * 0.1,
      late ? 0.05 + rnd() * 0.03 : 0.015 + rnd() * 0.02,
      late ? D : rnd() < 0.5 ? D.clone().lerp(B, 0.4) : L);
  }
  // 長手方向に伸びた色の濃淡(筋に沿ってところどころ濃く・淡くなる)
  for (let i = 0; i < (cfg.streaks || 0); i++) {
    const sx0 = rnd() * W, sy0 = rnd() * H, len = W * (0.15 + rnd() * 0.5), h = 2 + rnd() * 10;
    const c = rnd() < 0.55 ? D : L;
    for (const ox of [-W, 0, W]) wrapY((o) => {
      const g = cx.createLinearGradient(sx0 + ox, 0, sx0 + ox + len, 0);
      g.addColorStop(0, css(c, 0)); g.addColorStop(0.5, css(c, 0.08 + rnd() * 0.1)); g.addColorStop(1, css(c, 0));
      cx.fillStyle = g; cx.fillRect(sx0 + ox, sy0 + o - h / 2, len, h);
    });
  }
  // 3) 道管(短い点線状のくぼみ)
  for (let i = 0; i < cfg.pores; i++) {
    const px = rnd() * W, py = rnd() * H, len = 3 + rnd() * 10;
    cx.fillStyle = css(D, 0.10 + rnd() * 0.12); cx.fillRect(px, py, len, 1);
    sx.fillStyle = 'rgba(0,0,0,0.06)'; sx.fillRect(px, py, len, 1);
  }
  // 4) 節の芯
  for (const n of knots) {
    wrapY((o) => {
      const g = cx.createRadialGradient(n.x, n.y + o, 0, n.x, n.y + o, n.a * 1.2);
      g.addColorStop(0, css(D, 0.55)); g.addColorStop(1, css(D, 0));
      cx.fillStyle = g; cx.beginPath(); cx.ellipse(n.x, n.y + o, n.a * 2.2, n.a * 1.2, 0, 0, Math.PI * 2); cx.fill();
    });
  }
  const tex = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: tex(col, true), surface: tex(srf, false) };
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
export function goldTextures({ aged = 0.5, size = 512, seed = 1, stain = [0.42, 0.5, 0.62], roughRange = null } = {}) {
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
      const r = 1 - t * stain[0], g = 1 - t * stain[1], b = 1 - t * stain[2];   // 白に掛ける係数(地の色は素材の color で決める)
      col[i * 4] = Math.round(255 * r); col[i * 4 + 1] = Math.round(255 * g); col[i * 4 + 2] = Math.round(255 * b); col[i * 4 + 3] = 255;
      // 粗さ: 一方向の細かい磨き傷 + くすみは粗い
      const scratch = Math.pow(fbm(u * 3, v * 120, 3, 120, seed + 41, 2), 5) * 4 + Math.pow(fbm(u * 90, v * 4, 90, 4, seed + 51, 2), 6) * 3;
      const rr = roughRange ? roughRange[0] + (roughRange[1] - roughRange[0]) * Math.min(1, scratch * 0.5 + t * 0.8 + (cloud - 0.3) * 0.6) : 0.12 + aged * 0.16 + scratch * 0.12 + t * 0.3;
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
