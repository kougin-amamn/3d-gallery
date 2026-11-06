import * as THREE from 'three';
import { involuteOutline, pinionOutline, escapeOutline, wheelShape, ringShape, capsuleShape, bridgeShape, contourShape, ratchetOutline } from '../mech/gear.js';
import { meshPhase } from '../mech/train.js';

// ムーブメント(香箱・輪列・脱進機・てんぷ)を組み立てる。
// 座標: 地板の中心が原点、+Y が12時、z は地板上面からの高さ(mm)。
// 最後にグループ全体を X 軸まわりに −90° 回して、z を画面の上方向にする。

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const dir = (a) => [Math.cos(a), Math.sin(a)];
const add = (p, d, s = 1) => [p[0] + d[0] * s, p[1] + d[1] * s];
const rot = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];

/** 形を厚み h で押し出す(z は 0〜h)。縁に小さな面取りを付ける */
function extrude(shape, h, bevel = 0.025, curveSegments = 24) {
  const b = Math.min(bevel, h * 0.3);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, h - 2 * b),
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: -b,
    bevelSegments: 2,
    curveSegments,
  });
  g.translate(0, 0, b);
  return g;
}

/** z 軸に沿った円柱(z0〜z1) */
function cylinder(r, z0, z1, seg = 24) {
  const g = new THREE.CylinderGeometry(r, r, z1 - z0, seg);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, (z0 + z1) / 2);
  return g;
}

/** 断面(r, z)を z 軸まわりに回した形 */
function lathe(profile, seg = 40) {
  const g = new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r, z)), seg);
  g.rotateX(Math.PI / 2);
  return g;
}

function mesh(geo, mat, { shadow = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

/** 点から折れ線までの距離 */
function polyDist(pts, x, y) {
  if (pts.length === 1) return Math.hypot(x - pts[0][0], y - pts[0][1]);
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    d = Math.min(d, Math.hypot(x - ax - dx * t, y - ay - dy * t));
  }
  return d;
}
/** 円と腕をなめらかにつないだ形の距離場(内側が負) */
function sdfUnion(circles, links, k) {
  const smin = (a, b) => { const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k)); return b * (1 - h) + a * h - k * h * (1 - h); };
  return (x, y) => {
    let d = 1e9;
    for (const [cx, cy, r] of circles) d = smin(d, Math.hypot(x - cx, y - cy) - r);
    for (const [i, j, w] of links) d = smin(d, polyDist([circles[i], circles[j]], x, y) - w / 2);
    return d;
  };
}

export function buildMovement(cfg, M) {
  const root = new THREE.Group();
  root.name = 'movement';
  const mv = new THREE.Group();     // XY 平面で組み立てる
  root.add(mv);
  mv.rotation.x = -Math.PI / 2;

  // 分解表示: 部品ごとに「何段目か」を持たせ、段 × 間隔だけ上に持ち上げる
  const LAYER = { third: 1.0, fourth: 1.3, center: 1.6, barrel: 2.0, escape: 2.3, pallet: 2.7, balance: 3.4, winding: 5.4 };
  const BRIDGE_LAYER = { trainBridge: 4.2, fourthBridge: 4.2, barrelBridge: 4.4, escapeBridge: 5.2, palletBridge: 5.2, balanceCock: 6.2 };
  const SPACING = 2.3;
  const placedParts = [];
  const put = (layer, part, ...objs) => {
    for (const o of objs) {
      o.userData.part = part;
      o.userData.layer = layer;
      o.userData.baseZ = o.position.z;
      placedParts.push(o);
      mv.add(o);
    }
  };
  let explode = 0;
  const setExplode = (e) => {
    explode = e;
    for (const o of placedParts) {
      // 上の段ほど少し遅れて動き出す(ほどけるように見える)
      const L = o.userData.layer;
      const k = Math.min(1, Math.max(0, e * 1.35 - (L / 6.2) * 0.35));
      const ease = k * k * (3 - 2 * k);
      o.position.z = o.userData.baseZ + ease * L * SPACING;
    }
  };
  const explodeOffset = (layer) => {
    const k = Math.min(1, Math.max(0, explode * 1.35 - (layer / 6.2) * 0.35));
    return k * k * (3 - 2 * k) * layer * SPACING;
  };

  const E = cfg.escape.pos, P = cfg.pallet.pos, B = cfg.balance.pos;
  const fourthCfg = cfg.train.find((w) => w.id === 'fourth');
  const F = fourthCfg.pos;
  const m = cfg.module;

  // ---------- 地板 ----------
  const plateShape = new THREE.Shape();
  plateShape.absarc(0, 0, cfg.plate.radius, 0, TAU, false);
  const plate = mesh(extrude(plateShape, cfg.plate.thickness, 0.18, 160), [M.plate(0.5), M.edge]);
  plate.position.z = -cfg.plate.thickness;
  put(0, 'plate', plate);

  // ---------- 部品の小物 ----------
  // 穴石: 磨いたすり鉢状のくぼみ(シャトン)にルビーをはめ、真ん中に軸の先が見える
  const jewel = (x, y, z, r = 0.34) => {
    const g = new THREE.Group();
    const sink = mesh(lathe([[r + 0.24, 0.0], [r + 0.12, -0.035], [r + 0.02, -0.07]], 48), M.edge, { shadow: false });
    const stone = mesh(lathe([[0.07, -0.02], [0.13, -0.012], [r * 0.7, -0.03], [r, -0.065], [r + 0.03, -0.07]], 48), M.ruby, { shadow: false });
    const pivot = mesh(cylinder(0.06, -0.08, -0.005, 16), M.steel, { shadow: false });
    g.add(sink, stone, pivot);
    g.position.set(x, y, z);
    return g;
  };

  // 金の座金(シャトン): 穴石を囲む金の輪を、2本の小さな青ネジで留める
  const chaton = (x, y, z) => {
    const g = new THREE.Group();
    const ring = mesh(lathe([[0.95, 0], [0.95, 0.07], [0.88, 0.12], [0.62, 0.12], [0.56, 0.06]], 64), M.gold(0.95));
    g.add(ring);
    for (const a of [0.6, 0.6 + Math.PI]) {
      const s = screw(1.18 * Math.cos(a), 1.18 * Math.sin(a), 0);
      s.scale.set(0.42, 0.42, 0.6);
      g.add(s);
    }
    g.position.set(x, y, z);
    return g;
  };

  // 青ネジ: 頭の切り込みは2つの半円を離して置いて作る
  const screwHead = (() => {
    const R = 0.42, slot = 0.075;
    const half = (s) => {
      const sh = new THREE.Shape();
      sh.absarc(s * slot / 2, 0, R, s > 0 ? -Math.PI / 2 : Math.PI / 2, s > 0 ? Math.PI / 2 : Math.PI * 1.5, false);
      sh.closePath();
      return sh;
    };
    const base = new THREE.Shape(); base.absarc(0, 0, R, 0, TAU, false);
    return { base: extrude(base, 0.09, 0.02, 40), a: extrude(half(1), 0.16, 0.05, 32), b: extrude(half(-1), 0.16, 0.05, 32) };
  })();
  let screwSeed = 1;
  const screw = (x, y, z) => {
    const g = new THREE.Group();
    const s1 = mesh(screwHead.base, M.blued);
    const s2 = mesh(screwHead.a, M.blued); s2.position.z = 0.07;
    const s3 = mesh(screwHead.b, M.blued); s3.position.z = 0.07;
    g.add(s1, s2, s3);
    g.position.set(x, y, z);
    g.rotation.z = (screwSeed++ * 2.39996) % TAU;   // ネジの向きは少しずつ違う
    return g;
  };

  // ---------- 受け(ブリッジ) ----------
  const bridges = {};
  // 大きな受け: 窓を除いた円を、それぞれの軸(seeds)に近い場所ごとに分け、境目に細い溝を入れる
  const pt = cfg.partition;
  const openSdf = sdfUnion(pt.opening.circles, pt.opening.links, 0.8);
  const partBridges = cfg.bridges.filter((b) => b.type === 'partition');
  const seedDist = (b, x, y) => polyDist(b.seeds, x, y);
  const regionSdf = (b) => (x, y) => {
    const own = seedDist(b, x, y);
    let other = Infinity;
    for (const o of partBridges) if (o !== b) other = Math.min(other, seedDist(o, x, y));
    return Math.max(Math.hypot(x, y) - pt.radius, -openSdf(x, y), (own - other) / 2 + pt.gap / 2);
  };
  const ratchetAt = cfg.train.find((w) => w.id === 'barrel').pos;
  const screwAvoid = [...cfg.bridges.flatMap((b) => [...(b.jewels || []), ...(b.screws || [])]), ...partBridges.flatMap((b) => b.seeds)];
  for (const b of partBridges) {
    b.z = 0; b.thickness = pt.top;
    const f = regionSdf(b);
    b.shape = contourShape(f, [-pt.radius - 0.3, -pt.radius - 0.3, pt.radius + 0.3, pt.radius + 0.3], 0.04, true);
    // ネジ: 候補のうち、受けの内側で縁に近く、ほかの部品から離れた場所を3つまで
    b.screws = cfg.partitionScrewCandidates
      .filter(([x, y]) => f(x, y) < -0.85 && f(x, y) > -2.6 && screwAvoid.every(([ax, ay]) => Math.hypot(ax - x, ay - y) > 2.2) && Math.hypot(x - ratchetAt[0], y - ratchetAt[1]) > 3.8)
      .slice(0, 3);
    b.foot = false;
  }
  for (const b of cfg.bridges) {
    const shape = b.shape || bridgeShape(b.circles, b.links || []);
    const body = mesh(extrude(shape, b.thickness, 0.08, 32), [M.bridge(2.3, b.stripeDeg ?? 32), M.edge]);
    body.position.z = b.z;
    const L = BRIDGE_LAYER[b.id] ?? 4.2;
    put(L, b.id, body);
    const top = b.z + b.thickness;
    for (const [x, y] of b.jewels) put(L, b.id, jewel(x, y, top + 0.001));
    for (const [x, y] of b.chatons || []) put(L, b.id, chaton(x, y, top));
    for (const [x, y] of b.screws) {
      put(L, b.id, screw(x, y, top));
      if (b.foot === false) continue;
      // ネジの下は地板まで届く脚(受けの端の円と同じ大きさで、段差なく下りる)
      const c = b.circles.reduce((best, q) => (Math.hypot(q[0] - x, q[1] - y) < Math.hypot(best[0] - x, best[1] - y) ? q : best));
      const foot = mesh(cylinder(c[2] - 0.02, 0, b.z + 0.02, 48), M.edge);
      foot.position.set(x, y, 0);
      put(L, b.id, foot);
    }
    bridges[b.id] = body;
  }
  const byId = Object.fromEntries(cfg.train.map((w) => [w.id, w]));
  const trainTop = cfg.bridges.find((b) => b.id === 'trainBridge').z;
  const C = byId.center.pos, T = byId.third.pos, BR = byId.barrel.pos;
  // 地板側の穴石(軸の下端)
  for (const p of [E, P, B, F, C, T]) put(0, 'jewel', jewel(p[0], p[1], 0.001, 0.3));

  /** 金色の歯車 + 同じ軸のかな。回るのは spin の中身 */
  const wheel = ({ pos, teeth, module: mm = m, z, thickness, spokes, pinion, arborTop }) => {
    const g = new THREE.Group();
    g.position.set(pos[0], pos[1], 0);
    const ol = involuteOutline(teeth, mm, 20, 6);
    const w = mesh(extrude(wheelShape(ol, { spokes, rimInner: ol.rf - 0.38, hubR: 0.5, spokeW: 0.3, axle: 0.09 }), thickness, 0.012, 12), [M.gold(ol.ra), M.goldEdge]);
    w.position.z = z;
    const hub = mesh(cylinder(0.34, z - 0.02, z + thickness + 0.05, 32), M.steel);
    g.add(w, hub);
    if (pinion) {
      const pn = mesh(extrude(wheelShape(pinionOutline(pinion.teeth, pinion.module), { axle: 0 }), pinion.z1 - pinion.z0, 0.01, 8), M.steel);
      pn.position.z = pinion.z0;
      g.add(pn);
    }
    g.add(mesh(cylinder(0.07, 0, arborTop, 16), M.steel));
    return g;
  };

  // ---------- 2番車・3番車・4番車 ----------
  const center = wheel({ ...byId.center, arborTop: trainTop,
    pinion: { teeth: byId.center.pinion, module: byId.center.pinionModule, z0: byId.center.pinionZ[0], z1: byId.center.pinionZ[1] } });
  const third = wheel({ ...byId.third, arborTop: trainTop,
    pinion: { teeth: byId.third.pinion, module: m, z0: byId.third.pinionZ[0], z1: byId.third.pinionZ[1] } });
  const fourth = wheel({ ...fourthCfg, arborTop: trainTop,
    pinion: { teeth: fourthCfg.pinion, module: m, z0: 0.02, z1: 0.24 } });
  put(LAYER.center, 'center', center);
  put(LAYER.third, 'third', third);
  put(LAYER.fourth, 'fourth', fourth);

  // ---------- 香箱(ゼンマイの入った太鼓) ----------
  const bc0 = byId.barrel;
  const barrel = new THREE.Group();
  barrel.position.set(BR[0], BR[1], 0);
  {
    const ol = involuteOutline(bc0.teeth, bc0.module, 20, 6);
    const ring = mesh(extrude(wheelShape(ol, { axle: ol.rf - 0.3 }), bc0.toothHeight, 0.015, 12), [M.gold(ol.ra), M.goldEdge]);
    ring.position.z = bc0.z;
    const drumShape = new THREE.Shape(); drumShape.absarc(0, 0, ol.rf - 0.15, 0, TAU, false);
    const drum = mesh(extrude(drumShape, bc0.height - bc0.toothHeight, 0.06, 120), [M.gold(ol.rf), M.goldEdge]);
    drum.position.z = bc0.z + bc0.toothHeight;
    barrel.add(ring, drum);
  }
  put(LAYER.barrel, 'barrel', barrel);
  const barrelTop = cfg.bridges.find((b) => b.id === 'barrelBridge');
  {
    const arbor = mesh(cylinder(0.5, bc0.z, barrelTop.z + barrelTop.thickness, 32), M.steel);
    arbor.position.set(BR[0], BR[1], 0);
    put(LAYER.barrel, 'barrel', arbor);
  }

  // ---------- 角穴車と丸穴車(巻き上げの歯車。受けの上で太陽のような筋目が光る) ----------
  const wd = cfg.winding;
  const wz = barrelTop.z + barrelTop.thickness;
  const ratchet = new THREE.Group();
  ratchet.position.set(BR[0], BR[1], wz);
  {
    const ol = ratchetOutline(wd.ratchet.teeth, wd.ratchet.module);
    const w = mesh(extrude(wheelShape(ol, { axle: 0 }), wd.ratchet.thickness, 0.03, 8), [M.sunburst(ol.ra), M.edge]);
    ratchet.add(w);
    const s = screw(0, 0, wd.ratchet.thickness); s.scale.set(1.7, 1.7, 1.3);
    ratchet.add(s);
  }
  put(LAYER.winding, 'ratchet', ratchet);
  const crownPos = add(BR, dir(wd.crown.angleDeg * DEG), (wd.ratchet.module * (wd.ratchet.teeth + wd.crown.teeth)) / 2);
  const crown = new THREE.Group();
  crown.position.set(crownPos[0], crownPos[1], wz);
  {
    const ol = involuteOutline(wd.crown.teeth, wd.crown.module, 20, 6);
    const w = mesh(extrude(wheelShape(ol, { axle: 0 }), wd.crown.thickness, 0.03, 8), [M.sunburst(ol.ra), M.edge]);
    crown.add(w);
    const s = screw(0, 0, wd.crown.thickness); s.scale.set(1.15, 1.15, 1.1);
    crown.add(s);
    const ph = meshPhase(BR, crownPos, wd.ratchet.teeth, wd.crown.teeth);
    crown.rotation.z = ph.phase;
  }
  put(LAYER.winding, 'crown', crown);

  // かみ合いの位相(香箱 → 2番かな → 3番かな → 4番かな → ガンギかな)
  const phCB = meshPhase(BR, C, bc0.teeth, byId.center.pinion);
  const phTC = meshPhase(C, T, byId.center.teeth, byId.third.pinion);
  const phFT = meshPhase(T, F, byId.third.teeth, fourthCfg.pinion);

  // ---------- ガンギ車 ----------
  const rTip = cfg.escape.tipRadius;
  const halfPitch = TAU / cfg.escape.teeth / 2;
  const aEP = Math.atan2(P[1] - E[1], P[0] - E[0]);
  const span = (cfg.escape.spanTeeth * TAU / cfg.escape.teeth) / 2; // 入爪と出爪の間の角度の半分(30°)
  const cEntry = aEP + span, cExit = aEP - span;
  // 振動数が奇数のとき出爪で止まり(アンクルは −振れ)、偶数のとき入爪で止まる(+振れ)
  const escapeOffset = cExit + halfPitch;

  const escape = new THREE.Group();
  escape.position.set(E[0], E[1], 0);
  const escapeWheel = new THREE.Group();
  {
    const ol = escapeOutline(cfg.escape.teeth, rTip, cfg.escape.rootRadius);
    const w = mesh(extrude(wheelShape(ol, { spokes: 4, rimInner: cfg.escape.rootRadius - 0.28, hubR: 0.36, spokeW: 0.2, axle: 0.07 }), cfg.escape.thickness, 0.012, 8), [M.steelSatin(rTip), M.steel]);
    w.position.z = cfg.escape.z;
    const hub = mesh(cylinder(0.28, cfg.escape.z - 0.03, cfg.escape.z + cfg.escape.thickness + 0.05, 32), M.steel);
    escapeWheel.add(w, hub);
  }
  const escapePinion = mesh(extrude(wheelShape(pinionOutline(cfg.escape.pinion, m), { axle: 0 }), 0.3, 0.01, 8), M.steel);
  escapePinion.position.z = 0.18;
  const escArbor = mesh(cylinder(0.06, 0, cfg.bridges.find((b) => b.id === 'escapeBridge').z, 16), M.steel);
  escape.add(escapeWheel, escapePinion, escArbor);
  put(LAYER.escape, 'escape', escape);
  // ガンギかなが4番車にかみ合う位相
  const mp = meshPhase(F, E, fourthCfg.teeth, cfg.escape.pinion);

  // ---------- アンクル ----------
  const swing = cfg.pallet.swingDeg * DEG;
  const pallet = new THREE.Group();
  const palletTop = cfg.bridges.find((b) => b.id === 'palletBridge').z;
  pallet.position.set(P[0], P[1], 0);
  const zP = 0.76, tP = cfg.pallet.thickness;
  {
    const toLocal = (wpt, lockAngle) => rot([wpt[0] - P[0], wpt[1] - P[1]], -lockAngle);
    const stones = [
      { c: cEntry, lock: +swing },
      { c: cExit, lock: -swing },
    ];
    const armMat = M.steelSatin(3.5);
    for (const s of stones) {
      const tip = add(E, dir(s.c), rTip - 0.1);
      const tipL = toLocal(tip, s.lock);
      const ang = s.c - s.lock;               // 爪石の向き(ローカル)
      const len = 0.75, w = 0.16;
      const stoneShape = new THREE.Shape();
      const d = dir(ang), n = [-d[1], d[0]];
      const p0 = add(tipL, n, -w / 2), p1 = add(tipL, n, w / 2);
      // 先端は衝撃面として斜めに切る
      stoneShape.moveTo(...add(p0, d, 0.08));
      stoneShape.lineTo(...add(p1, d, 0.0));
      stoneShape.lineTo(...add(p1, d, len));
      stoneShape.lineTo(...add(p0, d, len));
      stoneShape.closePath();
      const st = mesh(extrude(stoneShape, zP + tP + 0.06 - (cfg.escape.z - 0.04), 0.015, 4), M.ruby);
      st.position.z = cfg.escape.z - 0.04;
      pallet.add(st);
      // 腕: 軸から爪石の根元まで
      const base = add(tipL, d, len * 0.72);
      const arm = mesh(extrude(capsuleShape([0, 0], base, 0.46), tP, 0.03, 16), armMat);
      arm.position.z = zP;
      pallet.add(arm);
    }
    // 竿と、振り石を受けるハコ(先端の2本の角)
    const u = dir(Math.atan2(B[1] - P[1], B[0] - P[0]));
    const nrm = [-u[1], u[0]];
    const L = cfg.pallet.forkLength;
    const body = mesh(extrude(capsuleShape([0, 0], add([0, 0], u, L - 0.55), 0.36), tP, 0.03, 16), armMat);
    body.position.z = zP;
    pallet.add(body);
    for (const s of [-1, 1]) {
      const a = add(add([0, 0], u, L - 0.5), nrm, s * 0.21);
      const b = add(add([0, 0], u, L + 0.15), nrm, s * 0.23);
      const horn = mesh(extrude(capsuleShape(a, b, 0.15), tP, 0.03, 12), armMat);
      horn.position.z = zP;
      pallet.add(horn);
    }
    const hub = mesh(cylinder(0.3, zP - 0.04, zP + tP + 0.04, 32), M.steel);
    const arbor = mesh(cylinder(0.055, 0, palletTop, 16), M.steel);
    pallet.add(hub, arbor);

    // ドテピン(アンクルの振れを止める2本のピン)
    for (const s of [-1, 1]) {
      const local = add(add([0, 0], u, 2.2), nrm, s * (0.18 + 0.09));
      const w = add(P, rot(local, s * swing));
      const pin = mesh(cylinder(0.09, 0, zP + tP + 0.08, 20), M.steel);
      pin.position.set(w[0], w[1], 0);
      put(0, 'pallet', pin);
    }
  }
  put(LAYER.pallet, 'pallet', pallet);

  // ---------- てんぷ ----------
  const bc = cfg.balance;
  const balance = new THREE.Group();
  balance.position.set(B[0], B[1], 0);
  {
    const ring = mesh(extrude(ringShape(bc.radius, bc.radius - bc.rimWidth), bc.rimHeight, 0.03, 160), [M.balanceGold, M.balanceGold]);
    ring.position.z = bc.z;
    balance.add(ring);
    for (let i = 0; i < bc.arms; i++) {
      const a = (i / bc.arms) * TAU + 0.35;
      const arm = mesh(extrude(capsuleShape([0, 0], add([0, 0], dir(a), bc.radius - bc.rimWidth * 0.5), 0.26), 0.16, 0.03, 12), M.balanceGold);
      arm.position.z = bc.z + 0.03;
      balance.add(arm);
    }
    // 慣性を調整するネジ(リムの外周に並ぶ)
    const screwGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.24, 20);
    const shankGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.2, 10);
    for (let i = 0; i < bc.screws; i++) {
      const a = (i / bc.screws) * TAU + 0.35 + Math.PI / bc.screws;
      const head = mesh(screwGeo, M.balanceGold);
      head.rotation.z = a - Math.PI / 2;
      head.position.set(...add([0, 0], dir(a), bc.radius + 0.1), bc.z + bc.rimHeight / 2);
      const shank = mesh(shankGeo, M.balanceGold);
      shank.rotation.z = a - Math.PI / 2;
      shank.position.set(...add([0, 0], dir(a), bc.radius - 0.02), bc.z + bc.rimHeight / 2);
      balance.add(head, shank);
    }
    const hub = mesh(cylinder(0.32, bc.z - 0.02, bc.z + 0.22, 32), M.balanceGold);
    const staff = mesh(cylinder(0.075, 0.0, 2.9, 16), M.steel);
    // 振り座(ローラー)と振り石
    const roller = mesh(cylinder(1.0, 0.98, 1.06, 48), M.steel);
    const pinDir = dir(Math.atan2(P[1] - B[1], P[0] - B[0]));
    const ip = mesh(cylinder(0.075, zP - 0.02, 0.98, 20), M.ruby);
    ip.position.set(...add([0, 0], pinDir, bc.rollerPinRadius), 0);
    const collet = mesh(cylinder(0.5, bc.hairspring.z - 0.05, bc.hairspring.z + 0.12, 32), M.steel);
    balance.add(hub, staff, roller, ip, collet);
  }
  put(LAYER.balance, 'balance', balance);

  // ---------- ひげゼンマイ(シェーダーで呼吸させる) ----------
  const hs = bc.hairspring;
  const cock = cfg.bridges.find((b) => b.id === 'balanceCock');
  const toStud = Math.atan2(cock.screws[0][1] - B[1], cock.screws[0][0] - B[0]);
  const hair = buildHairspring(hs, toStud, M.hairspring);
  hair.mesh.position.set(B[0], B[1], hs.z);
  put(LAYER.balance, 'hairspring', hair.mesh);
  // 外端を留めるひげ持ち(てんぷ受けから下りる柱)
  {
    const end = add(B, dir(toStud), hs.outer + 0.08);
    const stud = mesh(cylinder(0.16, hs.z - 0.08, cock.z, 20), M.steel);
    stud.position.set(end[0], end[1], 0);
    put(BRIDGE_LAYER.balanceCock, 'balanceCock', stud);
  }

  // ---------- 動かす ----------
  function update(state) {
    balance.rotation.z = state.balance;
    pallet.rotation.z = state.pallet;
    escape.rotation.z = escapeOffset + state.escape;
    // ガンギかなの位相は輪列の角度から求める(ガンギ車と同じ軸に付いている)
    barrel.rotation.z = state.barrel;
    center.rotation.z = phCB.phase - barrel.rotation.z * (bc0.teeth / byId.center.pinion);
    third.rotation.z = phTC.phase - center.rotation.z * (byId.center.teeth / byId.third.pinion);
    fourth.rotation.z = phFT.phase - third.rotation.z * (byId.third.teeth / fourthCfg.pinion);
    escapePinion.rotation.z = mp.phase - fourth.rotation.z * (fourthCfg.teeth / cfg.escape.pinion) - escape.rotation.z;
    hair.setTheta(state.balance);
  }

  // カメラの目標などに使う、組み立て座標 → ワールド座標
  const world = (x, y, z = 0) => new THREE.Vector3(x, z, -y);

  return { root, frame: mv, update, world, bridges, setExplode, explodeOffset, layers: { ...LAYER, ...BRIDGE_LAYER }, points: { E, P, B, F, C, T, BR } };
}

/** アルキメデスらせんのリボン。各頂点に「内端からの割合 u」を持たせ、θ·(1−u) だけ回す */
function buildHairspring(hs, outerAngle, baseMat) {
  const turns = hs.turns;
  const total = turns * TAU;
  const start = outerAngle - total;          // 外端がひげ持ちの方向に来るように
  const steps = Math.round(turns * 96);
  const h = 0.12, w = hs.wire * 1.6;
  const pos = [], nor = [], us = [], idx = [];
  // 断面の4隅(内側下, 外側下, 外側上, 内側上)と各面の法線
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const phi = start + u * total;
    const r = hs.inner + (hs.outer - hs.inner) * u;
    const c = Math.cos(phi), s = Math.sin(phi);
    const corners = [[r - w / 2, 0], [r + w / 2, 0], [r + w / 2, h], [r - w / 2, h]];
    const normals = [[-c, -s, 0], [c, s, 0], [0, 0, 1], [0, 0, -1]];
    // 面ごとに頂点を分ける(内壁, 外壁, 上面, 下面)
    const faces = [[0, 3, 0], [1, 2, 1], [3, 2, 2], [0, 1, 3]];
    for (const [a, b, nI] of faces) {
      for (const k of [a, b]) {
        const [rr, zz] = corners[k];
        pos.push(rr * c, rr * s, zz);
        nor.push(...normals[nI]);
        us.push(u);
      }
    }
  }
  const per = 8;
  for (let i = 0; i < steps; i++) {
    for (let f = 0; f < 4; f++) {
      const a = i * per + f * 2, b = a + 1, c = a + per, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aU', new THREE.Float32BufferAttribute(us, 1));
  g.setIndex(idx);

  const mat = baseMat.clone();
  mat.side = THREE.DoubleSide;
  const uTheta = { value: 0 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTheta = uTheta;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aU;\nuniform float uTheta;\nmat2 hsRot(){ float a = uTheta * (1.0 - aU); float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal.xy = hsRot() * objectNormal.xy;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.xy = hsRot() * transformed.xy;');
  };
  mat.customProgramCacheKey = () => 'hairspring';
  const m = new THREE.Mesh(g, mat);
  m.castShadow = false;
  m.receiveShadow = true;
  return { mesh: m, setTheta: (t) => { uTheta.value = t; } };
}
