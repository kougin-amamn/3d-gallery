import * as THREE from 'three';
import { roundedBox, extrudeX, extrudeY, arc, roundRect, boxUV, cylUV, paint, merge } from './shapes.js';
import { woodTextures, velvetNormal, goldTextures } from './wood.js';

// 宝箱を組み立てる。単位はメートル、x が幅、y が上、z が手前。
// 原点は箱の底の中心。フタは後ろの上の辺(ちょうつがい)を軸に回る。

const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
const pick = (a) => a[Math.floor(rnd() * a.length)];

export function buildChest(cfg) {
  const { body: B, lid: L, bands: BD, rivets: RV, colors: C } = cfg;
  const W = B.width, D = B.depth, H = B.height, wl = B.wall;
  const t = BD.thick, t1 = t * 1.3, tc = t * 1.12, bw = BD.width;
  const R = D / 2;
  const yb = t, yt = t + H;                    // 胴の底と上端(下に帯金の厚み分だけ浮かせる)

  // ---------- 素材 ----------
  const woodTex = woodTextures(cfg.wood, C);
  const wood = new THREE.MeshStandardMaterial({
    map: woodTex.map, normalMap: woodTex.normalMap, roughnessMap: woodTex.roughnessMap,
    normalScale: new THREE.Vector2(cfg.wood.normalScale, cfg.wood.normalScale),
    roughness: 1, metalness: 0, vertexColors: true,
  });
  // 金は2段階: 帯金・角金・取っ手は古びた金(くすみと槌目)、鋲・錠前・ちょうつがいは磨いた金
  const MT = cfg.metal;
  const agedTex = goldTextures({ aged: MT.aged, seed: 3 });
  const polTex = goldTextures({ aged: MT.polished, seed: 7, size: 256 });
  const ns = new THREE.Vector2(MT.normalScale, MT.normalScale);
  const brass = new THREE.MeshPhysicalMaterial({
    color: C.brass, metalness: 1, roughness: 1,
    map: agedTex.map, roughnessMap: agedTex.roughnessMap, normalMap: agedTex.normalMap, normalScale: ns,
  });
  const brassPolished = new THREE.MeshPhysicalMaterial({
    color: C.goldPolished, metalness: 1, roughness: 1,
    map: polTex.map, roughnessMap: polTex.roughnessMap, normalMap: polTex.normalMap, normalScale: ns.clone().multiplyScalar(0.5),
  });
  const velvet = new THREE.MeshPhysicalMaterial({
    color: C.velvet, roughness: 0.9, sheen: 1, sheenColor: new THREE.Color('#FF8A9A'), sheenRoughness: 0.4,
    normalMap: velvetNormal(), normalScale: new THREE.Vector2(0.4, 0.4), side: THREE.BackSide,
  });
  const keyhole = new THREE.MeshBasicMaterial({ color: C.keyhole });
  const lockGem = new THREE.MeshPhysicalMaterial({
    color: C.lockGem, roughness: 0.04, metalness: 0, clearcoat: 1, ior: 2.0, specularIntensity: 1,
    emissive: new THREE.Color(C.lockGem), emissiveIntensity: 0.12,
  });

  const tints = C.woodTint.map((h) => new THREE.Color(h));
  const center = new THREE.Vector3(0, yb + H / 2, 0);
  /** 木の頂点色: 板ごとの色むら × 内側は暗く */
  const woodPaint = (g, tint, c = center, edges = false) => paint(g, (p, n) => {
    const inner = n.dot(p.clone().sub(c)) < 0;
    let k = inner ? 0.48 : 1;
    // 板の角の丸み(面取り)は少し暗く: 板と板のすき間が深く見える
    if (edges && Math.max(Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)) < 0.97) k *= 0.62;
    return [tint.r * k, tint.g * k * 0.96, tint.b * k * 0.9];
  });

  const root = new THREE.Group();
  root.name = 'chest';

  // ---------- 胴の板 ----------
  const bodyWood = [];
  const ph = H / B.planks;
  for (let i = 0; i < B.planks; i++) {
    const y = yb + (i + 0.5) * ph;
    for (const s of [1, -1]) {
      // 前後の板(横長)
      const g = roundedBox(W - 0.002, ph - B.gap, wl, B.bevel, 2);
      g.translate(0, y, s * (D / 2 - wl / 2));
      boxUV(g, { along: 'x', scale: 0.9, offset: [rnd(), rnd()] });
      bodyWood.push(woodPaint(g, pick(tints), center, true));
      // 左右の板(前後の板の間にはさまる)
      const gs = roundedBox(wl, ph - B.gap, D - 2 * wl - B.gap, B.bevel, 2);
      gs.translate(s * (W / 2 - wl / 2), y, 0);
      boxUV(gs, { along: 'z', scale: 0.9, offset: [rnd(), rnd()] });
      bodyWood.push(woodPaint(gs, pick(tints), center, true));
    }
  }
  {
    const g = roundedBox(W - 2 * wl, wl, D - 2 * wl, B.bevel, 2);
    g.translate(0, yb + wl / 2, 0);
    boxUV(g, { along: 'x', scale: 0.9, offset: [rnd(), rnd()] });
    bodyWood.push(woodPaint(g, pick(tints), center, true));
  }
  const bodyMesh = new THREE.Mesh(merge(bodyWood), wood);
  bodyMesh.castShadow = bodyMesh.receiveShadow = true;
  root.add(bodyMesh);

  // ---------- 内張り(赤いベルベット) ----------
  {
    const iw = W - 2 * wl - 0.004, id = D - 2 * wl - 0.004, ih = H - wl;
    const g = new THREE.BoxGeometry(iw, ih, id);
    const hidden = new THREE.MeshBasicMaterial({ visible: false });
    const m = new THREE.Mesh(g, [velvet, velvet, hidden, velvet, velvet, velvet]);
    m.position.set(0, yb + wl + ih / 2 + 0.001, 0);
    m.receiveShadow = true;
    root.add(m);
  }

  // ---------- 胴の金具 ----------
  const bodyBrass = [];
  // 縦の帯金(前・底・後ろをまたぐ U 字)
  for (const sx of BD.strapX) {
    const pts = [
      [-(R + t1), 0], [R + t1, 0], [R + t1, yt], [R, yt], [R, yb], [-R, yb], [-R, yt], [-(R + t1), yt],
    ];
    const g = extrudeX(pts, bw, BD.bevel);
    g.translate(sx, 0, 0);
    bodyBrass.push(g);
  }
  // 上下の縁帯
  const ring = (y0, h) => {
    const outer = roundRect(W + 2 * t, D + 2 * t, 0.006, 3);
    const hole = roundRect(W - 0.002, D - 0.002, 0.002, 1);
    const g = extrudeY(outer, h, BD.bevel * 0.8, [hole]);
    g.translate(0, y0, 0);
    return g;
  };
  bodyBrass.push(ring(yt - BD.rim, BD.rim));
  bodyBrass.push(ring(0, BD.rim + yb));
  // 四隅の角金(L 字)
  const c = BD.corner;
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    const X = W / 2, Z = D / 2;
    let pts = [
      [sx * (X + tc), sz * (Z + tc)], [sx * (X - c), sz * (Z + tc)], [sx * (X - c), sz * Z],
      [sx * X, sz * Z], [sx * X, sz * (Z - c)], [sx * (X + tc), sz * (Z - c)],
    ];
    if (sx * sz < 0) pts = pts.reverse();
    bodyBrass.push(extrudeY(pts, yt, BD.bevel * 0.8));
  }
  const bodyBrassGeo = merge(bodyBrass.map((g) => boxUV(g, { along: 'y', scale: 1.4 })));
  const bodyBrassMesh = new THREE.Mesh(bodyBrassGeo, brass);
  bodyBrassMesh.castShadow = bodyBrassMesh.receiveShadow = true;
  root.add(bodyBrassMesh);

  // ---------- 取っ手(左右) ----------
  for (const s of [1, -1]) {
    const hx = s * (W / 2 + t);
    const parts = [];
    for (const z of [-0.1, 0.1]) {
      const p = roundedBox(0.014, 0.075, 0.05, 0.005, 2);
      p.translate(hx + s * 0.007, yt - 0.09, z);
      parts.push(boxUV(p, { along: 'y' }));
      const eye = new THREE.TorusGeometry(0.016, 0.006, 8, 16).rotateY(Math.PI / 2).toNonIndexed();
      eye.deleteAttribute('uv');
      eye.translate(hx + s * 0.022, yt - 0.09, z);
      parts.push(boxUV(eye, { along: 'y' }));
    }
    const handle = new THREE.TorusGeometry(0.1, 0.012, 10, 28, Math.PI).rotateZ(Math.PI).rotateY(Math.PI / 2).toNonIndexed();
    handle.deleteAttribute('uv');
    handle.translate(hx + s * 0.03, yt - 0.09, 0);
    parts.push(boxUV(handle, { along: 'z' }));
    const m = new THREE.Mesh(merge(parts), brass);
    m.castShadow = true;
    root.add(m);
  }

  // ---------- フタ ----------
  // 形は箱の座標(軸の中心が (0, yt, 0))で作り、最後にちょうつがいの位置へずらす
  const lid = new THREE.Group();
  lid.name = 'lid';
  lid.position.set(0, yt, -R);
  root.add(lid);
  const toHinge = (g) => g.translate(0, -yt, R);

  const lidWood = [];
  const gapA = L.gap / R;
  for (let k = 0; k < L.staves; k++) {
    const a0 = (k / L.staves) * Math.PI + (k === 0 ? 0 : gapA / 2);
    const a1 = ((k + 1) / L.staves) * Math.PI - (k === L.staves - 1 ? 0 : gapA / 2);
    const pts = [...arc(0, yt, R, a0, a1, 10), ...arc(0, yt, R - wl, a1, a0, 10)];
    const g = extrudeX(pts, W - 0.002, L.bevel, [], 10);
    cylUV(g, { cy: yt, cz: 0, scale: 0.9, offset: [rnd(), rnd()] });
    lidWood.push(woodPaint(g, pick(tints), new THREE.Vector3(0, yt, 0)));
  }
  for (const s of [1, -1]) {
    const pts = [...arc(0, yt, R - wl * 0.98, 0, Math.PI, 28)];
    const g = extrudeX(pts, wl, L.bevel, [], 28);
    g.translate(s * (W / 2 - wl / 2 - 0.001), 0, 0);
    cylUV(g, { cy: yt, cz: 0, scale: 0.9, offset: [rnd(), rnd()] });
    lidWood.push(woodPaint(g, pick(tints), new THREE.Vector3(-s * 2, yt, 0)));
  }
  const lidWoodGeo = toHinge(merge(lidWood));
  const lidMesh = new THREE.Mesh(lidWoodGeo, wood);
  lidMesh.castShadow = lidMesh.receiveShadow = true;
  lid.add(lidMesh);

  const lidBrass = [];
  const lidStrap = (x, th) => {
    const pts = [...arc(0, yt, R + th, 0, Math.PI, 40), ...arc(0, yt, R - 0.001, Math.PI, 0, 40)];
    const g = extrudeX(pts, bw, BD.bevel, [], 40);
    g.translate(x, 0, 0);
    return g;
  };
  for (const sx of BD.strapX) lidBrass.push(lidStrap(sx, t1));
  for (const s of [1, -1]) lidBrass.push(lidStrap(s * (W / 2 - bw / 2 + 0.002), t));
  // フタの前の縁(下の辺)。後ろはちょうつがいなので縁を付けない
  {
    const g = roundedBox(W + 2 * t - 0.004, BD.rim * 0.9, t, 0.004, 2);
    g.translate(0, yt + BD.rim * 0.45, R + t / 2);
    lidBrass.push(g);
  }
  // 掛け金(フタから垂れる板)
  const zf = R + t;                  // 前の金具の表面
  const hasp = roundedBox(0.1, 0.17, 0.012, 0.012, 3);
  hasp.translate(0, yt - 0.025, zf + 0.006);
  lidBrass.push(hasp);
  const lidBrassGeo = toHinge(merge(lidBrass.map((g) => boxUV(g, { along: 'x', scale: 1.4 }))));
  const lidBrassMesh = new THREE.Mesh(lidBrassGeo, brass);
  lidBrassMesh.castShadow = lidBrassMesh.receiveShadow = true;
  lid.add(lidBrassMesh);
  // 掛け金の輪(南京錠のつるが通る)
  const stapleY = yt - 0.093;
  {
    const g = new THREE.TorusGeometry(0.018, 0.0055, 10, 18, Math.PI).rotateZ(-Math.PI / 2).rotateY(-Math.PI / 2);
    g.translate(0, stapleY, zf + 0.012);
    toHinge(g);
    const m = new THREE.Mesh(g, brassPolished);
    m.castShadow = true;
    lid.add(m);
  }

  // ---------- ちょうつがい(後ろ) ----------
  {
    const parts = [];
    for (const x of [-0.16, 0.16]) {
      const knuckle = new THREE.CylinderGeometry(0.014, 0.014, 0.11, 16).rotateZ(Math.PI / 2).toNonIndexed();
      knuckle.translate(x, yt, -(R + t * 0.9));
      parts.push(knuckle);
      const leaf = roundedBox(0.09, 0.07, 0.008, 0.004, 2);
      leaf.translate(x, yt - 0.045, -(R + t + 0.004));
      parts.push(leaf);
    }
    const g = merge(parts.map((p) => { p.deleteAttribute('uv'); return boxUV(p, { along: 'x' }); }));
    const m = new THREE.Mesh(g, brassPolished);
    m.castShadow = true;
    root.add(m);
  }

  // ---------- 鋲 ----------
  const rivetGeo = new THREE.SphereGeometry(RV.radius, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const bodyRivets = [], lidRivets = [];
  const sp = RV.spacing;
  const along = (a, b, margin = 0.05) => {
    const out = [];
    const n = Math.max(1, Math.floor((b - a - 2 * margin) / sp));
    for (let i = 0; i <= n; i++) out.push(a + margin + ((b - a - 2 * margin) * i) / n);
    return out;
  };
  const nearStrap = (x) => BD.strapX.some((s) => Math.abs(x - s) < bw * 0.9);
  for (const sx of BD.strapX) for (const s of [1, -1]) {
    for (const y of along(yb, yt - BD.rim, 0.04)) bodyRivets.push([sx, y, s * (R + t1), 0, 0, s]);
  }
  for (const [y, h] of [[yt - BD.rim / 2, 0], [(BD.rim + yb) / 2, 1]]) {
    for (const s of [1, -1]) {
      for (const x of along(-W / 2 + c, W / 2 - c, 0.02)) {
        if (nearStrap(x) || (h === 0 && s === 1 && Math.abs(x) < 0.1)) continue;
        bodyRivets.push([x, y, s * (R + t), 0, 0, s]);
      }
      for (const z of along(-R + c, R - c, 0.02)) bodyRivets.push([s * (W / 2 + t), y, z, s, 0, 0]);
    }
  }
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    for (const y of along(0, yt, 0.05)) {
      bodyRivets.push([sx * (W / 2 - c / 2 + tc / 2), y, sz * (R + tc), 0, 0, sz]);
      bodyRivets.push([sx * (W / 2 + tc), y, sz * (R - c / 2 + tc / 2), sx, 0, 0]);
    }
  }
  const arcRivets = (x, rr) => {
    const n = Math.floor((Math.PI * rr) / sp);
    for (let i = 1; i < n; i++) {
      const a = (Math.PI * i) / n;
      lidRivets.push([x, yt + rr * Math.sin(a), rr * Math.cos(a), 0, Math.sin(a), Math.cos(a)]);
    }
  };
  for (const sx of BD.strapX) arcRivets(sx, R + t1);
  for (const s of [1, -1]) arcRivets(s * (W / 2 - bw / 2 + 0.002), R + t);
  for (const x of along(-W / 2 + 0.06, W / 2 - 0.06, 0.02)) {
    if (nearStrap(x) || Math.abs(x) < 0.08) continue;
    lidRivets.push([x, yt + BD.rim * 0.45, R + t, 0, 0, 1]);
  }
  for (const [x, y] of [[-0.03, yt + 0.035], [0.03, yt + 0.035]]) lidRivets.push([x, y, zf + 0.012, 0, 0, 1]);

  const makeRivets = (list, offset) => {
    const m = new THREE.InstancedMesh(rivetGeo, brassPolished, list.length);
    const up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), mat = new THREE.Matrix4();
    list.forEach(([x, y, z, nx, ny, nz], i) => {
      q.setFromUnitVectors(up, new THREE.Vector3(nx, ny, nz));
      const s = 0.85 + rnd() * 0.25;
      mat.compose(new THREE.Vector3(x + offset.x, y + offset.y, z + offset.z), q, new THREE.Vector3(s, s * 0.8, s));
      m.setMatrixAt(i, mat);
    });
    m.castShadow = true;
    return m;
  };
  root.add(makeRivets(bodyRivets, new THREE.Vector3()));
  lid.add(makeRivets(lidRivets, new THREE.Vector3(0, -yt, R)));

  // ---------- 南京錠 ----------
  const lock = new THREE.Group();
  lock.name = 'lock';
  const zs = zf + 0.02;                 // 錠の厚みの中心
  const ls = cfg.lockScale ?? 1;
  const lockTop = stapleY - 0.042 * ls;  // つるの頂点が掛け金の輪を通る高さ
  lock.position.set(0, lockTop, zs);    // 原点はつるの付け根の中心
  lock.scale.setScalar(ls);
  root.add(lock);
  {
    const bodyG = roundedBox(0.14, 0.125, 0.04, 0.018, 3);
    bodyG.translate(0, -0.0625, 0);
    const m = new THREE.Mesh(bodyG, brassPolished);
    m.castShadow = true;
    lock.add(m);
    // 鍵穴
    const sh = new THREE.Shape();
    sh.absarc(0, 0, 0.011, -Math.PI * 0.32, Math.PI * 1.32, false);
    sh.lineTo(-0.008, -0.03); sh.lineTo(0.008, -0.03);
    const kh = new THREE.Mesh(new THREE.ShapeGeometry(sh, 16), keyhole);
    kh.position.set(0, -0.07, 0.0205);
    lock.add(kh);
    // 鍵穴の周りの座金
    const ringG = new THREE.TorusGeometry(0.02, 0.003, 8, 28);
    const ringM = new THREE.Mesh(ringG, brass);
    ringM.position.set(0, -0.07, 0.02);
    lock.add(ringM);
    // 上の赤い宝石(丸く磨いたカボション)
    const gem = new THREE.Mesh(new THREE.SphereGeometry(0.013, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), lockGem);
    gem.rotation.x = Math.PI / 2;
    gem.scale.set(1, 0.7, 1);
    gem.position.set(0, -0.03, 0.019);
    gem.name = 'lockGem';
    lock.add(gem);
  }
  const shackle = new THREE.Group();
  shackle.name = 'shackle';
  lock.add(shackle);
  {
    const arcG = new THREE.TorusGeometry(0.042, 0.0085, 12, 32, Math.PI);
    const legs = [-0.042, 0.042].map((x) => new THREE.CylinderGeometry(0.0085, 0.0085, 0.03, 12).translate(x, -0.015, 0));
    const g = merge([arcG.toNonIndexed(), ...legs.map((l) => l.toNonIndexed())]);
    const m = new THREE.Mesh(g, brassPolished);
    m.castShadow = true;
    shackle.add(m);
  }

  return {
    root, lid, lock, shackle,
    materials: { wood, brass, brassPolished, velvet, lockGem },
    dims: { W, D, H, R, yb, yt, wl, t, t1, zf, lockHome: lock.position.clone() },
  };
}
