import * as THREE from 'three';
import { coinEmboss, goldTextures } from '../chest/wood.js';

// 宝箱の中身: 金貨の山、宝石、あふれる光、きらめき。開けたときに飛び出す金貨と宝石。

let seed = 12345;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const range = (a, b) => a + (b - a) * rnd();

/** 金貨の形: 縁が盛り上がり、中央に一段低い面 */
function coinGeometry(r, th) {
  const h = th / 2;
  const prof = [
    [0, h * 0.6], [r * 0.8, h * 0.6], [r * 0.88, h], [r, h * 0.75],
    [r, -h * 0.75], [r * 0.88, -h], [r * 0.8, -h * 0.6], [0, -h * 0.6],
  ].map(([x, y]) => new THREE.Vector2(x, y)).reverse();
  const g = new THREE.LatheGeometry(prof, 22);   // 小さいので 22 分割で十分(300枚以上並ぶ)
  // 表裏の面に刻印を貼るため、上から見た位置を UV にする
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / (r * 2) + 0.5, p.getZ(i) / (r * 2) + 0.5);
  return g;
}

/** 宝石の形: ブリリアントカット風(上は平らなテーブル、下はとがったパビリオン) */
function gemGeometry(s) {
  const prof = [[0, -s * 0.62], [s, 0], [s * 0.92, s * 0.14], [s * 0.55, s * 0.36], [0, s * 0.36]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(prof, 8).toNonIndexed();
  g.computeVertexNormals();
  return g;
}

function radialTexture(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [o, col] of stops) g.addColorStop(o, col);
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function starTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.15, 'rgba(255,240,200,0.6)'); g.addColorStop(1, 'rgba(255,220,150,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  x.globalCompositeOperation = 'lighter';
  for (const [w, h] of [[128, 6], [6, 128]]) {
    const lg = x.createLinearGradient(64 - w / 2, 64 - h / 2, 64 + w / 2, 64 + h / 2);
    lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,1)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = lg; x.fillRect(64 - w / 2, 64 - h / 2, w, h);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildTreasure(cfg, dims, chest) {
  const T = cfg.treasure, C = cfg.colors;
  const { W, D, yt, wl } = dims;
  const coinGeo = coinGeometry(T.coinRadius, T.coinThick);
  const gemGeo = gemGeometry(T.gemSize);
  const coinTex = goldTextures({ aged: 0.3, seed: 11, size: 256 });
  const gold = new THREE.MeshPhysicalMaterial({
    color: C.coin, metalness: 1, roughness: 1, map: coinTex.map, roughnessMap: coinTex.roughnessMap,
    normalMap: coinEmboss(256), normalScale: new THREE.Vector2(1.2, 1.2),
  });
  // 宝石も金属と同じ暗いスタジオを映す(面ごとに明暗がはっきりして、きらめく)
  const gemMats = C.gems.map((h) => new THREE.MeshPhysicalMaterial({
    color: h, metalness: 0.05, roughness: 0.03, clearcoat: 1, ior: 2.2, specularIntensity: 1,
    emissive: new THREE.Color(h), emissiveIntensity: 0.06, flatShading: true,
    iridescence: 0.25, iridescenceIOR: 1.6,
  })).map((m) => { m.userData.metalEnv = true; return m; });

  // ---------- 金貨の山(箱の中) ----------
  const pile = new THREE.Group();
  pile.name = 'pile';
  chest.add(pile);
  const ax = (W - 2 * wl) / 2 - 0.02, az = (D - 2 * wl) / 2 - 0.02;
  const top = yt + 0.06;
  const heap = (x, z) => {
    const fx = 1 - Math.pow(x / ax, 4), fz = 1 - Math.pow(z / az, 2);
    return yt - 0.07 + 0.13 * Math.max(0, fx) * Math.max(0, fz);
  };
  // 金貨の下に見える金の「かたまり」(すき間から内張りが見えないように)
  {
    const g = new THREE.PlaneGeometry(ax * 2, az * 2, 40, 24).rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, heap(p.getX(i), p.getZ(i)) - 0.012);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#B88A3E', metalness: 1, roughness: 0.5 }));
    m.receiveShadow = true;
    pile.add(m);
  }
  const pileCoins = new THREE.InstancedMesh(coinGeo, gold, T.pileCoins);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < T.pileCoins; i++) {
    const x = range(-ax, ax), z = range(-az, az);
    const y = heap(x, z) - rnd() * 0.012;
    e.set(range(-0.6, 0.6), rnd() * Math.PI * 2, range(-0.6, 0.6));
    q.setFromEuler(e);
    m4.compose(v.set(x, y, z), q, one);
    pileCoins.setMatrixAt(i, m4);
  }
  pileCoins.castShadow = false;   // 箱の中で、影はフタと壁の影で足りる
  pileCoins.receiveShadow = true;
  pile.add(pileCoins);
  for (let i = 0; i < T.pileGems; i++) {
    const x = range(-ax * 0.8, ax * 0.8), z = range(-az * 0.7, az * 0.7);
    const g = new THREE.Mesh(gemGeo, gemMats[i % gemMats.length]);
    g.position.set(x, heap(x, z) + 0.01, z);
    g.rotation.set(range(-0.5, 0.5), rnd() * 6, range(-0.5, 0.5));
    g.castShadow = true;
    pile.add(g);
  }

  // ---------- あふれる光 ----------
  const light = new THREE.PointLight('#FFC870', 0, 3.0, 2);
  light.position.set(0, top + 0.05, 0.05);
  chest.add(light);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture([[0, 'rgba(255,236,170,0.95)'], [0.25, 'rgba(255,200,90,0.45)'], [1, 'rgba(255,170,60,0)']]),
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0,
  }));
  glow.position.set(0, top + 0.1, 0.02);
  glow.scale.set(1.5, 1.0, 1);
  chest.add(glow);
  const star = starTexture();
  const sparkles = [];
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: star, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, color: '#FFF3C8' }));
    s.userData = { base: new THREE.Vector3(range(-ax, ax), top + range(0.0, 0.35), range(-az, az)), phase: rnd() * 10, speed: range(1.2, 2.4), size: range(0.05, 0.11) };
    s.position.copy(s.userData.base);
    chest.add(s);
    sparkles.push(s);
  }

  // ---------- 飛び出す金貨と宝石 ----------
  const nC = T.burstCoins, nG = T.burstGems;
  const flyCoins = new THREE.InstancedMesh(coinGeo, gold, nC);
  flyCoins.castShadow = true;
  flyCoins.frustumCulled = false;
  const flyGems = gemMats.map((m) => { const im = new THREE.InstancedMesh(gemGeo, m, Math.ceil(nG / gemMats.length)); im.castShadow = true; im.frustumCulled = false; return im; });
  const particles = [];
  for (let i = 0; i < nC + nG; i++) {
    const isGem = i >= nC;
    particles.push({
      isGem, mesh: isGem ? flyGems[(i - nC) % gemMats.length] : flyCoins,
      slot: isGem ? Math.floor((i - nC) / gemMats.length) : i,
      p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(),
      rest: new THREE.Quaternion(), scale: 0, target: 0, delay: 0, state: 'hidden', landed: false,
      half: isGem ? T.gemSize * 0.36 : T.coinThick / 2,
    });
  }
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const hideAll = () => {
    for (const pt of particles) { pt.state = 'hidden'; pt.scale = 0; pt.mesh.setMatrixAt(pt.slot, zero); }
    flyCoins.instanceMatrix.needsUpdate = true;
    for (const g of flyGems) g.instanceMatrix.needsUpdate = true;
  };
  hideAll();

  return {
    pile, light, glow, sparkles, flyCoins, flyGems, particles, heapTop: top, hideAll,
    coinGeo, gemGeo, gold, gemMats, ax, az, heap,
  };
}

/**
 * 飛び出しを始める。金貨と宝石を山の上から弧を描いて投げる。
 * 後ろ(フタの側)には飛ばさず、前と左右へ広げる。
 */
export function launch(tr, cfg, dims) {
  const T = cfg.treasure;
  tr.particles.forEach((pt, i) => {
    const a = range(-Math.PI * 0.95, Math.PI * 0.95) * 0.5 + Math.PI / 2;  // 前(+z)を中心に扇形
    const sp = range(T.speed[0], T.speed[1]);
    const h = sp * range(0.32, 0.55) * T.spread;
    pt.p.set(range(-tr.ax * 0.7, tr.ax * 0.7), tr.heapTop + range(-0.02, 0.04), range(-tr.az * 0.5, tr.az * 0.6));
    pt.v.set(Math.cos(a) * h, sp * range(0.75, 0.95), Math.sin(a) * h);
    pt.q.setFromEuler(new THREE.Euler(rnd() * 6, rnd() * 6, rnd() * 6));
    pt.w.set(range(-14, 14), range(-8, 8), range(-14, 14));
    pt.delay = (i / tr.particles.length) * 0.45 + rnd() * 0.08;
    pt.state = 'wait';
    pt.scale = 0; pt.target = 1; pt.landed = false;
    // 着地後の向き: 金貨は表か裏を上に平らに、宝石はテーブル面か横倒し
    const flip = rnd() < 0.5 ? 0 : Math.PI;
    pt.rest.setFromEuler(new THREE.Euler(pt.isGem ? range(-0.2, 0.2) + (rnd() < 0.4 ? 1.2 : 0) : flip, rnd() * 6, 0));
  });
}

/** 片付け: 小さくなって消える */
export function retract(tr) {
  tr.particles.forEach((pt, i) => {
    if (pt.state === 'hidden') return;
    pt.target = 0;
    pt.delay = (i % 17) * 0.012;
  });
}

const m4 = new THREE.Matrix4(), s3 = new THREE.Vector3(), dq = new THREE.Quaternion();
/** 1コマ進める。台の上面は y = 0(箱の座標)、台の半径 padR */
export function stepTreasure(tr, cfg, dims, dt, padR) {
  const T = cfg.treasure;
  const { W, D, yt, t } = dims;
  const hx = W / 2 + t * 1.4, hz = D / 2 + t * 1.4;
  let dirty = false;
  tr.moving = false;     // 1つでも動いていれば true(影の描き直しに使う)
  for (const pt of tr.particles) {
    if (pt.state === 'hidden') continue;
    dirty = true;
    if (pt.delay > 0) { pt.delay -= dt; continue; }
    // 大きさ: 出るときはポンと弾み、消えるときはすっと縮む
    if (pt.target === 1) pt.scale = Math.min(1, pt.scale + dt * 9);
    else { pt.scale = Math.max(0, pt.scale - dt * 7); if (pt.scale === 0) { pt.state = 'hidden'; pt.mesh.setMatrixAt(pt.slot, m4.makeScale(0, 0, 0)); pt.mesh.instanceMatrix.needsUpdate = true; continue; } }
    pt.state = 'fly';
    if (!pt.landed || pt.scale < 1 || pt.target === 0 || pt.v.lengthSq() > 1e-4) tr.moving = true;
    if (!pt.landed || pt.v.lengthSq() > 1e-4) {
      pt.v.y -= T.gravity * dt;
      pt.p.addScaledVector(pt.v, dt);
      // 箱の外壁に当たったら跳ね返す(箱の上端より下だけ)
      if (pt.p.y < yt + 0.02 && Math.abs(pt.p.x) < hx && Math.abs(pt.p.z) < hz) {
        const ox = hx - Math.abs(pt.p.x), oz = hz - Math.abs(pt.p.z);
        if (ox < oz) { pt.p.x = Math.sign(pt.p.x || 1) * hx; pt.v.x = Math.abs(pt.v.x) * Math.sign(pt.p.x) * 0.5; }
        else { pt.p.z = Math.sign(pt.p.z || 1) * hz; pt.v.z = Math.abs(pt.v.z) * Math.sign(pt.p.z) * 0.5; }
      }
      // 台の縁から落ちないように内側へ戻す
      const r = Math.hypot(pt.p.x, pt.p.z);
      if (r > padR) {
        const nx = pt.p.x / r, nz = pt.p.z / r;
        pt.p.x = nx * padR; pt.p.z = nz * padR;
        const vn = pt.v.x * nx + pt.v.z * nz;
        if (vn > 0) { pt.v.x -= 1.6 * vn * nx; pt.v.z -= 1.6 * vn * nz; }
      }
      // 床で跳ねる
      if (pt.p.y < pt.half) {
        pt.p.y = pt.half;
        if (pt.v.y < 0) {
          pt.v.y = -pt.v.y * T.bounce;
          pt.v.x *= T.friction; pt.v.z *= T.friction;
          pt.w.multiplyScalar(0.55);
          if (Math.abs(pt.v.y) < 0.35) { pt.v.y = 0; pt.landed = true; }
        }
      }
      if (pt.landed) {
        pt.v.x *= Math.max(0, 1 - dt * 6); pt.v.z *= Math.max(0, 1 - dt * 6);
      }
    }
    // 回転: 飛んでいる間は回り、着地したら平らに寝る
    if (pt.landed) {
      pt.q.slerp(pt.rest, Math.min(1, dt * 10));
    } else {
      const w = pt.w, ang = w.length() * dt;
      if (ang > 0) { dq.setFromAxisAngle(s3.copy(w).normalize(), ang); pt.q.premultiply(dq); }
    }
    if (pt.landed && pt.scale === 1 && pt.target === 1 && pt.v.lengthSq() <= 1e-4 && pt.q.angleTo(pt.rest) < 1e-3) continue;
    const k = pt.target === 1 ? easeOutBack(pt.scale) : pt.scale;
    m4.compose(pt.p, pt.q, s3.set(k, k, k));
    pt.mesh.setMatrixAt(pt.slot, m4);
    pt.mesh.instanceMatrix.needsUpdate = true;
  }
  return dirty;
}

function easeOutBack(x) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}
