import * as THREE from 'three';
import { woodTextures } from '../chest/wood.js';

// 地面。種類は data/grounds.json。テクスチャは CanvasTexture で、選ばれたときに初めて作る。
// どのテクスチャも、上下左右がつながる(繰り返して貼っても継ぎ目が出ない)ように描く。

let seed = 9;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const range = (a, b) => a + (b - a) * rnd();

const css = (hex, a = 1) => {
  const c = new THREE.Color(hex).convertLinearToSRGB();
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
};
const mix = (h1, h2, t) => '#' + new THREE.Color(h1).lerp(new THREE.Color(h2), t).getHexString();
const gray = (v, a = 1) => `rgba(${Math.round(v * 255)},${Math.round(v * 255)},${Math.round(v * 255)},${a})`;

function canvases(w, h = w) {
  const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const col = mk(), srf = mk();
  return { col, srf, cx: col.getContext('2d', { willReadFrequently: true }), sx: srf.getContext('2d', { willReadFrequently: true }), w, h };
}
/** 縁をまたぐ図形は、上下左右にずらしてもう一度描く(継ぎ目をなくす) */
function wrap(w, h, fn) {
  for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) fn(ox, oy);
}
/**
 * 細かい粒: 画素ごとに明るさをランダムに揺らす(1px の点を何十万回も描くより速い)。
 * amount は揺れ幅(0〜1)。
 */
function grains(ctx, w, h, amount) {
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const k = 1 + (rnd() - 0.5) * 2 * amount;
    d[i] = Math.min(255, d[i] * k); d[i + 1] = Math.min(255, d[i + 1] * k); d[i + 2] = Math.min(255, d[i + 2] * k);
  }
  ctx.putImageData(img, 0, 0);
}
/** 大きなむら(ぼかした円を重ねる) */
function blotches(ctx, w, h, n, rMin, rMax, colorFn) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * w, y = rnd() * h, r = range(rMin, rMax), c = colorFn();
    wrap(w, h, (ox, oy) => {
      if (x + ox + r < 0 || x + ox - r > w || y + oy + r < 0 || y + oy - r > h) return;
      const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      g.addColorStop(0, c); g.addColorStop(1, c.replace(/[\d.]+\)$/, '0)'));
      ctx.fillStyle = g; ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    });
  }
}

/** 砂浜: 細かい砂粒、風紋、湿った濃い砂 */
function sand(T, rough) {
  const { col, srf, cx, sx, w, h } = canvases(T.size);
  cx.fillStyle = css(T.base); cx.fillRect(0, 0, w, h);
  sx.fillStyle = gray(rough[1]); sx.fillRect(0, 0, w, h);
  blotches(cx, w, h, 14, w * 0.08, w * 0.3, () => css(rnd() < 0.5 ? T.light : T.dark, 0.18));
  blotches(cx, w, h, 4, w * 0.1, w * 0.25, () => css(T.wet, 0.22));
  // 風紋: ゆるく波打つ筋。山の片側だけ明るい(光が当たる)
  for (let i = 0; i < T.ripples; i++) {
    const y0 = (i / T.ripples) * h + range(-4, 4), amp = range(3, 9), k = 1 + Math.floor(rnd() * 2), ph = rnd() * 6.28;
    for (const oy of [-h, 0, h]) {
      for (const [dy, c, s, lw] of [[0, css(T.dark, 0.16), gray(0, 0.10), 2.2], [2.5, css(T.light, 0.18), gray(1, 0.08), 1.6]]) {
        cx.beginPath(); sx.beginPath();
        for (let x = 0; x <= w; x += 6) {
          const y = y0 + oy + dy + amp * Math.sin((x / w) * Math.PI * 2 * k + ph) + 2 * Math.sin((x / w) * Math.PI * 2 * (k + 3) + ph * 2);
          x === 0 ? (cx.moveTo(x, y), sx.moveTo(x, y)) : (cx.lineTo(x, y), sx.lineTo(x, y));
        }
        cx.lineWidth = sx.lineWidth = lw; cx.strokeStyle = c; sx.strokeStyle = s; cx.stroke(); sx.stroke();
      }
    }
  }
  grains(cx, w, h, 0.16);
  grains(sx, w, h, 0.12);
  return { col, srf };
}

/** 石畳: 大きさの違う四角い石をずらして敷く。目地は暗く低い */
function stone(T, rough) {
  const { col, srf, cx, sx, w, h } = canvases(T.size);
  cx.fillStyle = css(T.mortar); cx.fillRect(0, 0, w, h);
  sx.fillStyle = gray(rough[1] * 0.55); sx.fillRect(0, 0, w, h);
  const rowH = h / T.rows, gap = w * 0.008;
  for (let r = 0; r < T.rows; r++) {
    let x = rnd() * w * 0.3;               // 列ごとに継ぎ目の位置をずらす
    const x0 = x, y = r * rowH;
    while (x < x0 + w - w * 0.08) {
      let sw = w * range(0.16, 0.34);
      if (x + sw > x0 + w - w * 0.1) sw = x0 + w - x;   // 最後の石で1周を閉じる
      const tone = mix(mix(T.dark, T.light, rnd()), T.base, 0.4);
      const rr = Math.min(sw, rowH) * 0.06;
      for (const ox of [-w, 0, w]) {
        const bx = x + gap + ox, by = y + gap, bw = sw - gap * 2, bh = rowH - gap * 2;
        // 石の面: 縁に向かって少し暗く・低く(角が欠けて丸い)
        cx.fillStyle = css(tone); sx.fillStyle = gray(rough[0] + 0.05);
        for (const c of [cx, sx]) { c.beginPath(); c.roundRect(bx, by, bw, bh, rr); c.fill(); }
        const g = cx.createLinearGradient(bx, by, bx, by + bh);
        g.addColorStop(0, css(T.light, 0.12)); g.addColorStop(0.15, css(T.light, 0)); g.addColorStop(0.85, css(T.dark, 0)); g.addColorStop(1, css(T.dark, 0.25));
        cx.fillStyle = g; cx.beginPath(); cx.roundRect(bx, by, bw, bh, rr); cx.fill();
        // 縁の盛り上がり(凹凸用): 内側を一段明るく
        sx.fillStyle = gray(rough[0] + 0.12); sx.beginPath(); sx.roundRect(bx + gap * 1.5, by + gap * 1.5, bw - gap * 3, bh - gap * 3, rr); sx.fill();
      }
      x += sw;
    }
  }
  // 石の表面のむら・欠け・細かい粒
  cx.save(); sx.save();
  blotches(cx, w, h, 60, w * 0.01, w * 0.06, () => css(rnd() < 0.5 ? T.dark : T.light, 0.18));
  grains(cx, w, h, 0.12);
  grains(sx, w, h, 0.08);
  cx.restore(); sx.restore();
  return { col, srf };
}

/** 草地: 短い草の葉を細い線で無数に描く */
function grass(T, rough) {
  const { col, srf, cx, sx, w, h } = canvases(T.size);
  cx.fillStyle = css(mix(T.base, '#2A3A18', 0.35)); cx.fillRect(0, 0, w, h);
  sx.fillStyle = gray(0.55); sx.fillRect(0, 0, w, h);
  blotches(cx, w, h, 16, w * 0.06, w * 0.22, () => css(rnd() < 0.7 ? T.greens[Math.floor(rnd() * T.greens.length)] : T.dry, 0.25));
  cx.lineCap = sx.lineCap = 'round';
  for (let i = 0; i < T.blades; i++) {
    const x = rnd() * w, y = rnd() * h, len = range(5, 16), a = range(0, Math.PI * 2), bend = range(-0.5, 0.5);
    const dry = rnd() < 0.07;
    const c = dry ? T.dry : T.greens[Math.floor(Math.pow(rnd(), 0.8) * T.greens.length)];
    const ex = Math.cos(a) * len, ey = Math.sin(a) * len;
    const lw = range(0.8, 1.8);
    wrap(w, h, (ox, oy) => {
      if (x + ox < -20 || x + ox > w + 20 || y + oy < -20 || y + oy > h + 20) return;
      cx.beginPath(); cx.moveTo(x + ox, y + oy); cx.quadraticCurveTo(x + ox + ex * 0.5 - ey * bend, y + oy + ey * 0.5 + ex * bend, x + ox + ex, y + oy + ey);
      cx.lineWidth = lw; cx.strokeStyle = css(c, range(0.6, 0.95)); cx.stroke();
      sx.beginPath(); sx.moveTo(x + ox, y + oy); sx.quadraticCurveTo(x + ox + ex * 0.5 - ey * bend, y + oy + ey * 0.5 + ex * bend, x + ox + ex, y + oy + ey);
      sx.lineWidth = lw; sx.strokeStyle = gray(range(0.8, 1), 0.7); sx.stroke();
    });
  }
  return { col, srf };
}

/** 船の甲板: 宝箱と同じ木目の生成で細長い板。目地に黒いコーキング、板の端は互い違い */
function deck(T, rough) {
  const W = T.width, H = T.height;
  const wood = woodTextures({ width: W, height: H, seed: 13, bands: 12, lines: 260, knots: 2, pores: 3000, streaks: 50, roughness: rough },
    { wood: T.base, woodDark: T.dark, woodLight: T.light });
  const { col, srf, cx, sx } = canvases(W, H);
  cx.fillStyle = css(T.base); cx.fillRect(0, 0, W, H);
  sx.fillStyle = gray(rough[1]); sx.fillRect(0, 0, W, H);
  const bh = H / T.boards;
  for (let i = 0; i < T.boards; i++) {
    // 板ごとに木目の位置と明るさを変えて写す
    const sy = Math.floor(rnd() * (H - bh)), shift = Math.floor(rnd() * W);
    for (const [src, dst] of [[wood.map.image, cx], [wood.surface.image, sx]]) {
      for (const ox of [0, W]) dst.drawImage(src, 0, sy, W, bh, ox - shift, i * bh, W, bh);
    }
    cx.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,' + range(0.02, 0.12) + ')' : 'rgba(255,240,220,' + range(0.02, 0.08) + ')';
    cx.fillRect(0, i * bh, W, bh);
    // 板の継ぎ目(互い違い)
    const jx = (i % 2 ? 0.25 : 0.75) * W + range(-30, 30);
    for (const c of [cx, sx]) { c.fillStyle = c === cx ? css(T.caulk, 0.9) : gray(0.2); c.fillRect(jx, i * bh, 3, bh); }
    // 長手方向の目地(コーキング)
    for (const c of [cx, sx]) { c.fillStyle = c === cx ? css(T.caulk) : gray(0.15); c.fillRect(0, i * bh, W, 4); }
    // 釘の跡
    for (const nx of [jx - 14, jx + 17]) for (const ny of [0.3, 0.7]) {
      cx.fillStyle = 'rgba(30,24,20,0.7)'; cx.beginPath(); cx.arc(nx, i * bh + bh * ny, 2.2, 0, 7); cx.fill();
    }
  }
  wood.map.dispose(); wood.surface.dispose();
  return { col, srf };
}

const makers = { sand, stone, grass, deck };

/**
 * 地面の管理。set(id) で切り替える。
 * スタジオは既存の丸い台を見せ、それ以外は縁が透明に溶ける平らな円を見せる。
 */
export function createGrounds(scene, cfg, { pedestal, backdrop }) {
  const cache = new Map();
  // 縁を背景に溶かす透明度(円の中心で 1、外周で 0)
  const ac = document.createElement('canvas'); ac.width = ac.height = 256;
  const ax = ac.getContext('2d');
  const g = ax.createRadialGradient(128, 128, 128 * (1 - cfg.fade), 128, 128, 128);
  g.addColorStop(0, '#fff'); g.addColorStop(1, '#000');
  ax.fillStyle = '#000'; ax.fillRect(0, 0, 256, 256); ax.fillStyle = g; ax.fillRect(0, 0, 256, 256);
  const alphaMap = new THREE.CanvasTexture(ac);
  const R = cfg.radius;
  const plane = new THREE.Mesh(new THREE.CircleGeometry(R, 72).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ transparent: true, alphaMap }));
  plane.receiveShadow = true;
  plane.visible = false;
  scene.add(plane);

  function material(def) {
    if (cache.has(def.id)) return cache.get(def.id);
    const { col, srf } = makers[def.tex.kind](def.tex, def.roughness);
    const tex = (c, srgb) => {
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      const k = R * 2 * def.repeat;          // 円の直径に何回繰り返すか
      t.repeat.set(k, k);
      t.anisotropy = 8;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    const m = new THREE.MeshStandardMaterial({
      map: tex(col, true), bumpMap: tex(srf, false), roughnessMap: null, bumpScale: def.bumpScale,
      roughness: 1, metalness: 0, transparent: true, alphaMap, depthWrite: true,
    });
    m.roughnessMap = m.bumpMap;              // 灰色1枚を凹凸と粗さに兼用
    cache.set(def.id, m);
    return m;
  }

  let current = null;
  function set(id) {
    const def = cfg.grounds.find((d) => d.id === id) || cfg.grounds.find((d) => d.id === cfg.default);
    current = def.id;
    const u = backdrop.material.uniforms;
    u.top.value.set(def.background.top); u.horizon.value.set(def.background.horizon); u.bottom.value.set(def.background.bottom);
    pedestal.visible = !!def.pedestal;
    plane.visible = !def.pedestal;
    if (!def.pedestal) plane.material = material(def);
    return def;
  }
  function dispose() {
    for (const m of cache.values()) { m.map.dispose(); m.bumpMap.dispose(); m.dispose(); }
    alphaMap.dispose(); plane.geometry.dispose();
  }
  return { set, get current() { return current; }, list: cfg.grounds, radius: R, plane, dispose };
}
