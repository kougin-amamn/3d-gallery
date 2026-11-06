import * as THREE from 'three';
import { contourShape } from '../mech/gear.js';

// 腕時計の外装: ケース・ガラス・裏蓋・文字盤・針・ムーンフェイズ・リューズ・革ベルト。
// ケースと文字盤はムーブメントと同じ組み立て座標(mv)に入れる。ベルトは裏返しても動かない側に置く。

const TAU = Math.PI * 2;
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** 断面(r, z)を z 軸まわりに回した面 */
function lathe(profile, seg = 160) {
  const g = new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r, z)), seg);
  g.rotateX(Math.PI / 2);
  return g;
}
function mesh(geo, mat, { shadow = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  m.receiveShadow = receive;
  return m;
}
function extrude(shape, h, bevel = 0.03, curveSegments = 24) {
  const b = Math.min(bevel, h * 0.3);
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.001, h - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 2, curveSegments });
  g.translate(0, 0, b);
  return g;
}
const circleShape = (r, x = 0, y = 0) => { const s = new THREE.Shape(); s.absarc(x, y, r, 0, TAU, false); return s; };
const circlePath = (r, x = 0, y = 0) => { const s = new THREE.Path(); s.absarc(x, y, r, 0, TAU, true); return s; };

// ------------------------------------------------------------
// ケース
// ------------------------------------------------------------
export function buildCase(W, M) {
  const c = W.case;
  const g = new THREE.Group();
  g.name = 'case';
  const polish = M.make('caseSteel', { side: THREE.DoubleSide });
  const brushed = M.make('caseBrushed', { side: THREE.DoubleSide });

  // 胴(内壁と、ふくらんだ側面)
  g.add(mesh(lathe([[c.bore, c.back], [c.bore, c.front]]), polish));
  const flank = [];
  for (let i = 0; i <= 24; i++) {
    const t = -Math.PI / 2 + (i / 24) * Math.PI;
    flank.push([c.flankRadius + c.flankBulge * Math.cos(t), (c.front + c.back) / 2 + ((c.back - c.front) / 2) * Math.sin(t)]);
  }
  g.add(mesh(lathe(flank), polish));
  // ベゼル(表のガラスを囲む鏡面の輪)
  const f = c.front;
  g.add(mesh(lathe([[c.flankRadius, f], [19.45, f - 0.45], [19.1, f - 0.8], [18.3, f - 0.87], [17.6, f - 0.62], [17.55, f]]), polish));
  // 裏蓋: 外周は鏡面、平らな輪はヘアライン(円周方向)
  const b = c.back;
  g.add(mesh(lathe([[c.flankRadius, b], [19.25, b + 0.65], [18.6, b + 0.95]]), polish));
  g.add(mesh(lathe([[18.6, b + 0.95], [15.4, b + 0.95]]), brushed));
  g.add(mesh(lathe([[15.4, b + 0.95], [14.8, b + 0.8], [14.75, b + 0.15]]), polish));
  // 裏蓋のネジ(6本)
  const screwGeo = lathe([[0.55, 0], [0.55, 0.12], [0.42, 0.24], [0.0, 0.29]], 32);
  const slotGeo = new THREE.BoxGeometry(1.2, 0.14, 0.2);
  const dark = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.7, metalness: 0.5 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + Math.PI / 6;
    const s = new THREE.Group();
    s.add(mesh(screwGeo, polish));
    const slot = new THREE.Mesh(slotGeo, dark); slot.position.z = 0.26;
    s.add(slot);
    s.position.set(17.0 * Math.cos(a), 17.0 * Math.sin(a), b + 0.95);
    s.rotation.z = a + 0.6 * i;
    g.add(s);
  }

  // ラグ(ベルトの付け根)。側面の輪郭を押し出して作る
  const L = c.lugs;
  const lugProfile = [[15.0, -2.7], [18.5, -2.6], [21.0, -2.0], [23.0, -1.25], [24.15, -0.3], [24.3, 0.55], [23.7, 1.5], [21.6, 2.45], [18.6, 3.05], [15.0, 3.3]];
  for (const sy of [1, -1]) {
    const sh = new THREE.Shape(lugProfile.map(([y, z]) => new THREE.Vector2(sy * y, z)));
    for (const sx of [1, -1]) {
      const geo = extrude(sh, L.thickness, 0.3, 24);
      const x0 = sx > 0 ? L.innerX : -L.innerX - L.thickness;
      geo.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, x0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));
      geo.computeVertexNormals();
      g.add(mesh(geo, [polish, brushed]));
    }
    // バネ棒
    const bar = new THREE.CylinderGeometry(0.5, 0.5, L.innerX * 2 + 0.6, 16);
    bar.rotateZ(Math.PI / 2);
    const bm = mesh(bar, polish);
    bm.position.set(0, sy * L.springBarY, W.pivotZ);
    g.add(bm);
  }

  // リューズ(文字盤側から見て3時)。ギザギザは頂点を波打たせて作る
  {
    const prof = [[0.01, 0], [1.25, 0], [1.25, 1.1], [2.3, 1.15], [2.55, 1.5], [2.55, 3.55], [2.25, 3.95], [1.1, 4.12], [0.01, 4.16]];
    const geo = new THREE.LatheGeometry(prof.map(([r, a]) => new THREE.Vector2(r, a)), 120);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y > 1.45 && y < 3.6) {
        const x = pos.getX(i), z = pos.getZ(i);
        const ang = Math.atan2(z, x);
        const k = 1 + 0.04 * Math.cos(ang * 24);
        pos.setX(i, x * k); pos.setZ(i, z * k);
      }
    }
    geo.computeVertexNormals();
    geo.rotateZ(Math.PI / 2);            // 軸を -x 方向へ
    const m = mesh(geo, polish);
    m.position.set(c.crown.x, 0, c.crown.z);
    g.add(m);
  }

  // ガラス(表のドーム型サファイアと、裏のシースルー窓)。写り込みだけ見せる
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.02, ior: 1.77, transparent: true, opacity: 0.16, depthWrite: false, envMapIntensity: 1.6, specularIntensity: 1 });
  const front = [];
  for (let i = 0; i <= 24; i++) { const r = (i / 24) * 17.6; front.push([r + 0.001, f - 0.65 - 0.35 * (1 - (r / 17.6) ** 2)]); }
  const crystal = mesh(lathe([...front, [17.6, f]], 96), glassMat, { shadow: false, receive: false });
  const backPts = [];
  for (let i = 0; i <= 16; i++) { const r = (i / 16) * 14.8; backPts.push([r + 0.001, b + 0.7 + 0.12 * (1 - (r / 14.8) ** 2)]); }
  const window = mesh(lathe([...backPts, [14.8, b + 0.15]], 96), glassMat, { shadow: false, receive: false });
  crystal.renderOrder = window.renderOrder = 10;
  crystal.raycast = window.raycast = () => {};
  g.add(crystal, window);

  for (const o of g.children) if (!o.userData.part) o.userData.part = 'case';
  return { group: g, glass: [crystal, window] };
}

// ------------------------------------------------------------
// 文字盤・針・ムーンフェイズ(文字盤側から見た座標で作り、組み立て座標へは Y 軸まわりに半回転して入れる)
// ------------------------------------------------------------
export function buildDial(W, M) {
  const D = W.dial;
  const g = new THREE.Group();
  g.name = 'dial';
  g.rotation.y = Math.PI;
  const dn = D.dayNight;
  const sec = D.seconds;
  const sm = sec.moon;

  // 円盤をのぞく窓: 中心 c のまわりの弧の帯。dir の向きに開き、humps なら両端に「丘」を付ける
  const windowShape = ({ center: [cx, cy], path, bodyR, dir, humps, sector }) => {
    const outer = path + bodyR + 0.15, inner = path - bodyR - 0.12, humpR = bodyR + 0.08;
    const ca = Math.cos(dir - Math.PI / 2), sa = Math.sin(dir - Math.PI / 2);
    const local = (x, y) => { const dx = x - cx, dy = y - cy; return [dx * ca + dy * sa, -dx * sa + dy * ca]; };
    const hx = path * Math.cos(Math.PI / 6), hy = path * Math.sin(Math.PI / 6);
    const f = (x, y) => {
      const [lx, ly] = local(x, y);
      const r = Math.hypot(lx, ly);
      const dSector = -(ly * Math.cos(sector) - Math.abs(lx) * Math.sin(sector));
      let d = Math.max(r - outer, inner - r, dSector);
      if (humps) d = Math.max(d, humpR - Math.hypot(lx - hx, ly - hy), humpR - Math.hypot(lx + hx, ly - hy));
      return d;
    };
    const R = outer + 0.4;
    return contourShape(f, [cx - R, cy - R, cx + R, cy + R], 0.025, false);
  };
  const dnWin = windowShape({ center: dn.center, path: dn.path, bodyR: dn.bodyRadius, dir: Math.PI / 2, humps: false, sector: dn.sectorDeg * Math.PI / 180 });
  const smWin = windowShape({ center: [0, 0], path: sm.path, bodyR: sm.moonRadius, dir: -Math.PI / 2, humps: true, sector: Math.PI / 7.2 });

  // 文字盤
  const dialShape = circleShape(D.radius);
  dialShape.holes.push(new THREE.Path(dnWin.getPoints().slice().reverse()));
  dialShape.holes.push(circlePath(sec.radius, sec.pos[0], sec.pos[1]));
  const print = dialTexture(W);
  const uvT = { repeat: 1 / (2 * D.radius), offset: 0.5 };
  print.repeat.set(uvT.repeat, uvT.repeat);
  print.offset.set(uvT.offset, uvT.offset);
  const dialMat = M.make('dialSilver', { map: print, metalnessMap: print, roughnessMap: print });
  const dialEdge = M.make('caseSteel', { roughness: 0.15 });
  const dial = mesh(extrude(dialShape, D.thickness, 0.05, 64), [dialMat, dialEdge]);
  dial.position.z = D.h;
  g.add(dial);

  // 小秒針の文字盤(一段低く、同心円の筋目)。下側に月の窓
  const subTop = D.h + D.thickness - sec.recess;
  const subdial = new THREE.Group();
  subdial.position.set(sec.pos[0], sec.pos[1], 0);
  {
    const t = subdialTexture(W);
    const R = sec.radius + 0.05;
    t.repeat.set(1 / (2 * R), 1 / (2 * R)); t.offset.set(0.5, 0.5);
    const aniso = M.tex.circular.aniso.clone();
    aniso.repeat.set(1 / (2 * R), 1 / (2 * R)); aniso.offset.set(0.5, 0.5); aniso.needsUpdate = true;
    const mat = M.make('dialSilver', { map: t, metalnessMap: t, anisotropy: 0.8, anisotropyMap: aniso, roughness: 0.34 });
    const shape = circleShape(R);
    shape.holes.push(new THREE.Path(smWin.getPoints().slice().reverse()));
    const sd = mesh(extrude(shape, 0.1, 0.02, 64), [mat, dialEdge]);
    sd.position.z = subTop - 0.1;
    subdial.add(sd);
  }
  g.add(subdial);

  // ムーンフェイズ(小秒針の中): 夜空の円盤に2つの金の月
  const moonGroup = new THREE.Group();
  moonGroup.position.set(sec.pos[0], sec.pos[1], subTop - 0.1 - 0.13);
  {
    const t = moonTexture(sm.diskRadius);
    t.repeat.set(1 / (2 * sm.diskRadius), 1 / (2 * sm.diskRadius)); t.offset.set(0.5, 0.5);
    moonGroup.add(mesh(extrude(circleShape(sm.diskRadius), 0.05, 0.008, 96), M.make('moonDisk', { map: t }), { shadow: false }));
    for (const a of [0, Math.PI]) {
      const r = sm.moonRadius;
      const m = mesh(lathe([[r, 0], [r, 0.025], [r * 0.7, 0.05], [0.001, 0.06]], 48), M.gold(r), { shadow: false });
      m.position.set(sm.path * Math.cos(a), sm.path * Math.sin(a), 0.05);
      moonGroup.add(m);
    }
  }
  g.add(moonGroup);

  // デイナイト(12時): 昼の空に金の太陽、夜空に銀の三日月。1日に1回転
  const dayGroup = new THREE.Group();
  dayGroup.position.set(dn.center[0], dn.center[1], dn.h);
  {
    const t = dayNightTexture(dn.diskRadius, dn.path, dn.bodyRadius);
    t.repeat.set(1 / (2 * dn.diskRadius), 1 / (2 * dn.diskRadius)); t.offset.set(0.5, 0.5);
    dayGroup.add(mesh(extrude(circleShape(dn.diskRadius), 0.08, 0.01, 96), M.make('moonDisk', { map: t }), { shadow: false }));
    const r = dn.bodyRadius * 0.62;
    const sun = mesh(lathe([[r, 0], [r, 0.03], [r * 0.75, 0.075], [0.001, 0.09]], 64), M.gold(r), { shadow: false });
    sun.position.set(dn.path, 0, 0.08);
    const crescent = contourShape((x, y) => Math.max(Math.hypot(x, y) - dn.bodyRadius * 0.78, dn.bodyRadius * 0.66 - Math.hypot(x - dn.bodyRadius * 0.42, y + dn.bodyRadius * 0.12)),
      [-dn.bodyRadius, -dn.bodyRadius, dn.bodyRadius, dn.bodyRadius], 0.012, false);
    const moonC = mesh(extrude(crescent, 0.07, 0.02, 16), M.make('caseSteel', { roughness: 0.16 }), { shadow: false });
    moonC.position.set(-dn.path, 0, 0.08);
    moonC.rotation.z = Math.PI / 2 + 0.25;
    dayGroup.add(sun, moonC);
  }
  g.add(dayGroup);

  // 針(ブレゲ針: 根元の円、細い竿、先の近くの中抜きの輪、細い先端)
  const H = W.hands;
  const seg = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - ax - dx * t, py - ay - dy * t);
  };
  const smin = (a, b, k = 0.12) => { const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k)); return b * (1 - h) + a * h - k * h * (1 - h); };
  const breguet = (h) => {
    const ringW = h.pommeR * 0.36;
    return contourShape((x, y) => {
      const hub = Math.hypot(x, y) - h.hub;
      const shaft = seg(x, y, 0, 0, 0, h.pomme) - (h.width / 2) * (1 - 0.35 * Math.max(0, y) / h.pomme);
      const ring = Math.abs(Math.hypot(x, y - h.pomme) - (h.pommeR - ringW / 2)) - ringW / 2;
      const tipLen = h.length - h.pomme - h.pommeR;
      const ty = Math.max(0, Math.min(1, (y - h.pomme - h.pommeR + 0.15) / tipLen));
      const tip = seg(x, y, 0, h.pomme + h.pommeR - 0.15, 0, h.length) - (h.width / 2) * (1 - ty) * 0.9 - 0.012;
      const tail = seg(x, y, 0, 0, 0, -h.hub * 1.6) - h.width * 0.45;
      return smin(smin(smin(smin(hub, shaft), ring), tip), tail);
    }, [-h.pommeR - 0.3, -h.hub * 2, h.pommeR + 0.3, h.length + 0.2], 0.012, true);
  };
  const hourHand = mesh(extrude(breguet(H.hour), 0.1, 0.02, 8), M.blued);
  hourHand.position.z = H.hour.h;
  const minuteHand = mesh(extrude(breguet(H.minute), 0.09, 0.02, 8), M.blued);
  minuteHand.position.z = H.minute.h;
  const cap = mesh(lathe([[0.5, 0], [0.5, 0.06], [0.3, 0.14], [0.001, 0.17]], 32), M.blued);
  cap.position.z = H.minute.h + 0.09;
  const hourPivot = new THREE.Group(); hourPivot.add(hourHand);
  const minutePivot = new THREE.Group(); minutePivot.add(minuteHand, cap);
  g.add(hourPivot, minutePivot);
  // 小秒針
  const S = H.seconds;
  const secShape = contourShape((x, y) => {
    const hub = Math.hypot(x, y) - S.hub;
    const needle = seg(x, y, 0, -S.tail, 0, S.length) - S.width / 2 * (1 - 0.6 * Math.max(0, y) / S.length);
    const weight = Math.hypot(x, y + S.tail * 0.75) - S.width * 1.6;
    return smin(smin(hub, needle, 0.05), weight, 0.08);
  }, [-0.5, -S.tail - 0.4, 0.5, S.length + 0.15], 0.008, false);
  const secHand = mesh(extrude(secShape, 0.06, 0.012, 8), M.blued);
  secHand.position.z = S.h;
  const secPivot = new THREE.Group();
  secPivot.position.set(sec.pos[0], sec.pos[1], 0);
  secPivot.add(secHand);
  g.add(secPivot);

  dial.userData.part = 'dial';
  subdial.userData.part = 'smallSeconds';
  moonGroup.userData.part = 'moonphase';
  dayGroup.userData.part = 'dayNight';
  hourPivot.userData.part = minutePivot.userData.part = 'hands';
  secPivot.userData.part = 'smallSeconds';

  return {
    group: g,
    /** 針は時刻から、月は月齢(日)から、デイナイトは1日のうちの割合から */
    update(state, moonAge, dayFrac) {
      hourPivot.rotation.z = -state.hour;
      minutePivot.rotation.z = -state.center;
      secPivot.rotation.z = -state.fourth;
      // 月: 小秒針の下側の窓。新月で左の丘の下、満月で窓の真ん中、右へ抜けて欠ける。2つの月で1朔望月に半回転
      moonGroup.rotation.z = Math.PI + Math.PI * (moonAge / W.synodic);
      // 太陽: 朝6時に左から昇り、正午に窓の真ん中、夕方6時に右へ沈む。真夜中は月が真ん中
      dayGroup.rotation.z = Math.PI / 2 - (dayFrac - 0.5) * TAU;
    },
  };
}

// ---------- 文字盤の印刷(キャンバスに描いて貼る) ----------
const SERIF = '"Cormorant Garamond", "Times New Roman", serif';

function dialTexture(W) {
  const D = W.dial;
  const S = 2048, R = D.radius, k = S / (2 * R);
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const X = (x) => (x + R) * k, Y = (y) => (R - y) * k;
  // オパーリン: ごく細かい粒と、ほんのわずかな中心の明るさ
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, '#ECEBE6'); grad.addColorStop(1, '#DEDCD5');
  g.fillStyle = grad; g.fillRect(0, 0, S, S);
  const img = g.getImageData(0, 0, S, S), d = img.data;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * 9; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
  const ink = '#1A1B20';
  g.strokeStyle = g.fillStyle = ink;
  // 分の目盛り(鉄道線路のような二重線)
  const r1 = 14.0, r2 = 14.55;
  g.lineWidth = 0.05 * k;
  for (const r of [r1, r2]) { g.beginPath(); g.arc(S / 2, S / 2, r * k, 0, TAU); g.stroke(); }
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * TAU;
    const five = i % 5 === 0;
    g.lineWidth = (five ? 0.11 : 0.05) * k;
    const ri = five ? r1 - 0.25 : r1, ro = r2;
    g.beginPath();
    g.moveTo(X(Math.sin(a) * ri), Y(Math.cos(a) * ri));
    g.lineTo(X(Math.sin(a) * ro), Y(Math.cos(a) * ro));
    g.stroke();
  }
  // ローマ数字(VI は小秒針と重なるので省く)
  const nums = ['XII', 'I', 'II', 'III', 'IIII', 'V', '', 'VII', 'VIII', 'IX', 'X', 'XI'];
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `500 ${2.15 * k}px ${SERIF}`;
  for (let i = 0; i < 12; i++) {
    if (!nums[i]) continue;
    const a = (i / 12) * TAU;
    g.save();
    g.translate(X(Math.sin(a) * D.numeralsRadius), Y(Math.cos(a) * D.numeralsRadius));
    g.rotate(a);
    g.scale(0.82, 1);
    g.fillText(nums[i], 0, 0);
    g.restore();
  }
  // 文字
  for (const t of D.texts) {
    g.font = `500 ${t.size * k}px ${SERIF}`;
    if ('letterSpacing' in g) g.letterSpacing = `${t.spacing * k}px`;
    g.fillText(t.text, X(0), Y(t.y));
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function subdialTexture(W) {
  const R = W.dial.seconds.radius + 0.05, S = 768, k = S / (2 * R);
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#E3E2DD'; g.fillRect(0, 0, S, S);
  const c = S / 2;
  g.strokeStyle = g.fillStyle = '#1A1B20';
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * TAU, five = i % 5 === 0;
    g.lineWidth = (five ? 0.06 : 0.03) * k;
    const ri = (five ? 2.85 : 3.05) * k, ro = 3.35 * k;
    g.beginPath(); g.moveTo(c + Math.sin(a) * ri, c - Math.cos(a) * ri); g.lineTo(c + Math.sin(a) * ro, c - Math.cos(a) * ro); g.stroke();
  }
  g.lineWidth = 0.03 * k;
  g.beginPath(); g.arc(c, c, 3.35 * k, 0, TAU); g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `500 ${0.62 * k}px ${SERIF}`;
  for (const [n, a] of [['60', 0], ['15', 0.25], ['45', 0.75]]) {
    g.fillText(n, c + Math.sin(a * TAU) * 2.3 * k, c - Math.cos(a * TAU) * 2.3 * k);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function dayNightTexture(R, path, bodyR) {
  const S = 1024, k = S / (2 * R);
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const img = g.createImageData(S, S), d = img.data;
  const mix = (a, b, t) => a + (b - a) * t;
  const night = [12, 26, 69], day = [104, 170, 222], dusk = [232, 140, 76];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const px = (x + 0.5) / k - R, py = R - (y + 0.5) / k;
      const a = Math.atan2(py, px);           // 太陽は 0 の向き
      const c = Math.cos(a);
      const t = Math.min(1, Math.max(0, (c + 0.25) / 0.6));
      const col = night.map((n, i) => mix(n, day[i], t * t * (3 - 2 * t)));
      const dz = Math.exp(-((c - 0.02) ** 2) / 0.012) * 0.75;   // 夕焼けと朝焼けの帯
      const i = (y * S + x) * 4;
      d[i] = mix(col[0], dusk[0], dz); d[i + 1] = mix(col[1], dusk[1], dz); d[i + 2] = mix(col[2], dusk[2], dz); d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // 夜側の星
  let seed = 23;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 160; i++) {
    const r = Math.sqrt(rnd()) * R, a = Math.PI / 2 + rnd() * Math.PI;
    if (Math.cos(a) > -0.3) continue;
    const x = S / 2 + Math.cos(a) * r * k, y = S / 2 - Math.sin(a) * r * k;
    const s = (0.04 + rnd() * 0.07) * k;
    g.fillStyle = `rgba(235, 225, 200, ${0.5 + rnd() * 0.5})`;
    g.beginPath();
    for (let j = 0; j < 8; j++) { const aa = (j / 8) * TAU, rr = j % 2 ? s * 0.3 : s; g.lineTo(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr); }
    g.fill();
  }
  // 太陽の光条(金の円盤のまわり)
  const sx = S / 2 + path * k, sy = S / 2;
  g.strokeStyle = 'rgba(255, 214, 120, 0.95)'; g.lineCap = 'round';
  for (let j = 0; j < 16; j++) {
    const aa = (j / 16) * TAU, r0 = bodyR * 0.72 * k, r1 = bodyR * (j % 2 ? 0.95 : 1.08) * k;
    g.lineWidth = (j % 2 ? 0.05 : 0.08) * k;
    g.beginPath(); g.moveTo(sx + Math.cos(aa) * r0, sy + Math.sin(aa) * r0); g.lineTo(sx + Math.cos(aa) * r1, sy + Math.sin(aa) * r1); g.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function moonTexture(R) {
  const S = 1024, k = S / (2 * R);
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, '#1B3478'); grad.addColorStop(1, '#0C1A45');
  g.fillStyle = grad; g.fillRect(0, 0, S, S);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 140; i++) {
    const r = Math.sqrt(rnd()) * R, a = rnd() * TAU;
    const x = S / 2 + Math.cos(a) * r * k, y = S / 2 + Math.sin(a) * r * k;
    const s = (0.04 + rnd() * 0.08) * k;
    g.fillStyle = `rgba(240, 210, 140, ${0.55 + rnd() * 0.45})`;
    // 小さな四芒星
    g.beginPath();
    for (let j = 0; j < 8; j++) { const aa = (j / 8) * TAU, rr = j % 2 ? s * 0.32 : s; g.lineTo(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr); }
    g.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ------------------------------------------------------------
// 革ベルト(ワールド座標: 12時が −Z、上が +Y。バネ棒の高さが y=0)
// ------------------------------------------------------------
export function buildStrap(W, M) {
  const st = W.strap;
  const g = new THREE.Group();
  g.name = 'strap';
  const grain = leatherNormal(256);
  const drop = W.restDrop - st.thickness / 2;   // ベルトの中心が布の上に乗る高さ
  const pieces = [
    { dir: -1, L: st.short.length, holes: [] },
    { dir: 1, L: st.long.length, holes: st.long.holes },
  ];
  const mats = [];
  for (const p of pieces) {
    const map = strapTexture(st, p.L, p.holes);
    const nrm = grain.clone(); nrm.repeat.set(3.5, p.L / 5.7); nrm.needsUpdate = true;
    const mat = M.make('leather', { map, normalMap: nrm, normalScale: new THREE.Vector2(0.35, 0.35), side: THREE.DoubleSide });
    mats.push(mat);
    const geo = strapGeometry(p, st, drop);
    const m = mesh(geo, mat);
    m.userData.part = 'strap';
    g.add(m);
  }
  // 尾錠(短い側の先)
  {
    const steel = M.make('caseSteel', { roughness: 0.1 });
    const d = st.short.length - 2.5;
    const frame = new THREE.Shape();
    const w = st.width + 2.4, l = 9;
    const rr = (s, x, y, ww, hh, r) => { s.moveTo(x + r, y); s.lineTo(x + ww - r, y); s.quadraticCurveTo(x + ww, y, x + ww, y + r); s.lineTo(x + ww, y + hh - r); s.quadraticCurveTo(x + ww, y + hh, x + ww - r, y + hh); s.lineTo(x + r, y + hh); s.quadraticCurveTo(x, y + hh, x, y + hh - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); };
    rr(frame, -w / 2, 0, w, l, 3.2);
    const hole = new THREE.Path(); rr(hole, -w / 2 + 1.4, 1.4, w - 2.8, l - 2.8, 2.0);
    frame.holes.push(hole);
    const geo = extrude(frame, 1.3, 0.35, 24);
    // 形の y を −Z(外向き)へ、押し出しを +Y(上)へ
    geo.applyMatrix4(new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1));
    const bm = mesh(geo, steel);
    bm.position.set(0, -drop - st.thickness / 2 + 0.05, -(W.case.lugs.springBarY + d - 1.5));
    g.add(bm);
    const tang = new THREE.CylinderGeometry(0.45, 0.45, l - 1.2, 12);
    tang.rotateX(Math.PI / 2);
    const tm = mesh(tang, steel);
    tm.position.set(0, -drop + st.thickness / 2 + 0.5, -(W.case.lugs.springBarY + d - 1.5 + l / 2));
    g.add(tm);
    bm.userData.part = tm.userData.part = 'strap';
  }
  return g;
}

function strapGeometry(p, st, drop) {
  const z0 = 22.6 * p.dir; // バネ棒(後で W から渡すほどではないので固定)
  const samples = [];
  for (let d = -1.6; d < 24; d += 0.4) samples.push(d);
  for (let d = 24; d <= p.L; d += 1.5) samples.push(d);
  if (samples[samples.length - 1] < p.L) samples.push(p.L);
  const yAt = (d) => -drop * smoothstep(0.5, 17, d);
  const widthAt = (d) => {
    let w = st.width - 2 * smoothstep(0, 55, d) - (p.dir > 0 ? 2 * smoothstep(55, p.L, d) : 0);
    const tipStart = p.L - w / 2;
    if (p.dir > 0 && d > tipStart) w *= Math.sqrt(Math.max(0, 1 - ((d - tipStart) / (w / 2)) ** 2));
    return Math.max(0.05, w);
  };
  const tAt = (d) => st.thickness * (1 - 0.18 * smoothstep(10, 60, d));
  // 断面: 上下の平らな面と、丸い側面
  const prof = [];
  const arcN = 5;
  // (u: 幅方向 -1〜1, v: 厚み方向 -1〜1, 面の向き)
  prof.push([-0.92, 1], [0.92, 1]);
  for (let i = 1; i < arcN; i++) { const a = Math.PI / 2 - (i / arcN) * Math.PI; prof.push([0.92 + 0.08 * Math.cos(a), Math.sin(a)]); }
  prof.push([0.92, -1], [-0.92, -1]);
  for (let i = 1; i < arcN; i++) { const a = -Math.PI / 2 - (i / arcN) * Math.PI; prof.push([-0.92 + 0.08 * Math.cos(a), Math.sin(a)]); }
  const P = prof.length;
  const pos = [], uv = [], idx = [];
  for (let s = 0; s < samples.length; s++) {
    const d = samples[s];
    const y = yAt(d), w = widthAt(d), t = tAt(d);
    const dy = (yAt(d + 0.1) - yAt(d - 0.1)) / 0.2;
    // 進行方向 (0, dy, dir) に垂直な「上向き」
    const nl = Math.hypot(1, dy);
    const ny = 1 / nl, nz = -dy * p.dir / nl;
    for (const [u, v] of prof) {
      const x = (u * w) / 2;
      const off = (v * t) / 2;
      pos.push(x, y + ny * off, z0 + p.dir * d + nz * off);
      uv.push((u + 1) / 2, 1 - (d + 1.6) / (p.L + 1.6));
    }
  }
  for (let s = 0; s < samples.length - 1; s++) {
    for (let i = 0; i < P; i++) {
      const a = s * P + i, b = s * P + ((i + 1) % P), c = a + P, e = b + P;
      if (p.dir > 0) idx.push(a, c, b, b, c, e); else idx.push(a, b, c, b, e, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function strapTexture(st, L, holes) {
  const W = 256, k = W / st.width, H = Math.min(2048, Math.round((L + 1.6) * k));
  const kv = H / (L + 1.6);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = st.color; g.fillRect(0, 0, W, H);
  // 色むら
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(${rnd() < 0.5 ? '20,10,5' : '120,80,50'}, ${0.04 + rnd() * 0.05})`;
    g.beginPath(); g.ellipse(rnd() * W, rnd() * H, 4 + rnd() * 20, 8 + rnd() * 40, 0, 0, TAU); g.fill();
  }
  // ステッチ(縁に沿って)
  g.strokeStyle = st.thread; g.lineWidth = 0.35 * k; g.lineCap = 'round';
  g.setLineDash([1.6 * kv, 1.0 * kv]);
  for (const u of [0.075, 0.925]) {
    g.beginPath(); g.moveTo(u * W, (1.6 + 3) * kv); g.lineTo(u * W, H - 6 * kv); g.stroke();
  }
  g.setLineDash([]);
  // 穴
  for (const d of holes) {
    const y = (d + 1.6) * kv;
    g.fillStyle = '#120905';
    g.beginPath(); g.ellipse(W / 2, y, 0.9 * k, 0.9 * kv, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 0.25 * k;
    g.beginPath(); g.ellipse(W / 2, y, 1.15 * k, 1.15 * kv, 0, 0, TAU); g.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** 革のシボ(細かな凹凸)の法線マップ */
function leatherNormal(size) {
  const h = new Float32Array(size * size);
  let seed = 5;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // 細胞状の凹凸: ランダムな点からの距離
  const pts = [];
  for (let i = 0; i < 900; i++) pts.push([rnd() * size, rnd() * size]);
  const cell = 24, grid = new Map();
  for (const p of pts) { const k = `${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(p); }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let d1 = 1e9, d2 = 1e9;
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const kx = ((cx + i) % (size / cell) + size / cell) % (size / cell), ky = ((cy + j) % (size / cell) + size / cell) % (size / cell);
        for (const p of grid.get(`${kx},${ky}`) || []) {
          let dx = Math.abs(x - p[0]); dx = Math.min(dx, size - dx);
          let dy = Math.abs(y - p[1]); dy = Math.min(dy, size - dy);
          const d = Math.hypot(dx, dy);
          if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
        }
      }
      h[y * size + x] = Math.min(1, (d2 - d1) / 6);
    }
  }
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const hx = h[y * size + ((x + 1) % size)] - h[y * size + ((x - 1 + size) % size)];
      const hy = h[((y + 1) % size) * size + x] - h[((y - 1 + size) % size) * size + x];
      const nx = -hx * 1.4, ny = -hy * 1.4, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const i = (y * size + x) * 4;
      data[i] = (nx / l * 0.5 + 0.5) * 255; data[i + 1] = (ny / l * 0.5 + 0.5) * 255; data[i + 2] = (nz / l * 0.5 + 0.5) * 255; data[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, size, size);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}
