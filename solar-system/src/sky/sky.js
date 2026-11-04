import * as THREE from 'three';
import { radecToVector, equatorialToEcliptic } from '../astro/rotation.js';
import { eclToScene } from '../bodies/bodies.js';

// 星の B−V 色指数 → 色(Ballesteros の式で温度にし、黒体の色に近似)
function bvToColor(bv) {
  const T = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
  const t = T / 100;
  let r, g, b;
  if (t <= 66) {
    r = 255;
    g = 99.47 * Math.log(t) - 161.12;
    b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04;
  } else {
    r = 329.7 * Math.pow(t - 60, -0.1332);
    g = 288.12 * Math.pow(t - 60, -0.0755);
    b = 255;
  }
  const c = new THREE.Color(
    Math.min(255, Math.max(0, r)) / 255,
    Math.min(255, Math.max(0, g)) / 255,
    Math.min(255, Math.max(0, b)) / 255
  );
  // 実際の星は淡い色に見えるので、少し白に寄せる
  return c.lerp(new THREE.Color(1, 1, 1), 0.35);
}

const toScene = (eqVec) => eclToScene(equatorialToEcliptic(eqVec));

export function createStars(scene, starData, shaders, shared) {
  const rows = starData.stars;
  const pos = new Float32Array(rows.length * 3);
  const col = new Float32Array(rows.length * 3);
  const mag = new Float32Array(rows.length);
  const named = [];
  rows.forEach((s, i) => {
    const v = toScene(radecToVector(s[0], s[1]));
    pos.set([v.x, v.y, v.z], i * 3);
    const c = bvToColor(s[3]);
    col.set([c.r, c.g, c.b], i * 3);
    mag[i] = s[2];
    if (s[4]) named.push({ name: s[4], dir: v.clone(), mag: s[2] });
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aMag', new THREE.BufferAttribute(mag, 1));
  const u = { uExposure: { value: 1 }, uPixel: shared.uPixel, uMagLimit: { value: 7 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: shaders.stars_vert,
    fragmentShader: shaders.stars_frag,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = -9;
  scene.add(points);
  return { points, uniforms: u, named };
}

export function createMilkyWay(scene, shaders) {
  const gal = (ra, dec) => toScene(radecToVector(ra, dec));
  const z = gal(192.85948, 27.12825);          // 銀河北極
  const x0 = gal(266.40500, -28.93617);        // 銀河中心
  const x = x0.clone().addScaledVector(z, -x0.dot(z)).normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  const m = new THREE.Matrix3().set(x.x, x.y, x.z, y.x, y.y, y.z, z.x, z.y, z.z);
  const u = { uToGalactic: { value: m }, uExposure: { value: 1 }, uStrength: { value: 0.05 } };
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 64, 32),
    new THREE.ShaderMaterial({
      uniforms: u,
      vertexShader: shaders.sky_vert,
      fragmentShader: shaders.noise + shaders.milkyway_frag,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    })
  );
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  scene.add(mesh);
  return { mesh, uniforms: u };
}

// 小惑星帯とカイパーベルト
export function createBelts(scene, belts, shaders, shared) {
  const out = [];
  for (const b of belts) {
    let seed = b.count * 13 + 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-9)) * Math.cos(2 * Math.PI * rand());
    const n = b.count;
    const o1 = new Float32Array(n * 4);
    const o2 = new Float32Array(n * 4);
    let i = 0;
    while (i < n) {
      const a = b.aRange[0] + rand() * (b.aRange[1] - b.aRange[0]);
      // カークウッドの間隙(木星との共鳴で粒が少ない所)
      if (b.gaps.some((g) => Math.abs(a - g) < 0.03) && rand() < 0.85) continue;
      o1.set([a, rand() * b.eMax, Math.abs(gauss()) * b.iSigma * Math.PI / 180 * (rand() < 0.5 ? 1 : -1), rand() * Math.PI * 2], i * 4);
      o2.set([rand() * Math.PI * 2, rand() * Math.PI * 2, 0.7 + Math.pow(rand(), 6) * 1.6, 0.5 + rand() * 0.5], i * 4);
      i++;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('aOrbit', new THREE.BufferAttribute(o1, 4));
    geo.setAttribute('aOrbit2', new THREE.BufferAttribute(o2, 4));
    const u = {
      uDays: shared.uDays,
      uSunRel: shared.uSunPos,
      uPixel: shared.uPixel,
      uScale: shared.uScale,
      uSize: { value: b.size * 1.6 },
      uColor: { value: new THREE.Vector3(...b.color) },
      uExposure: { value: 1 },
      uOpacity: { value: 0.5 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: u,
      vertexShader: shaders.scale + shaders.belt_vert,
      fragmentShader: shaders.belt_frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 6;
    scene.add(pts);
    out.push({ def: b, points: pts, uniforms: u, setDensity(f) { geo.setDrawRange(0, Math.round(n * f)); } });
  }
  return out;
}

// 軌道線
export function createOrbitLine(scene, shaders, segments, color) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((segments + 1) * 3), 3));
  const phase = new Float32Array(segments + 1);
  for (let i = 0; i <= segments; i++) phase[i] = i / segments;
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const u = { uPhase: { value: 0 }, uColor: { value: new THREE.Vector3(...color) }, uOpacity: { value: 1 } };
  const line = new THREE.Line(geo, new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: shaders.orbit_vert,
    fragmentShader: shaders.orbit_frag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  line.frustumCulled = false;
  line.renderOrder = 5;
  scene.add(line);
  return { line, geo, uniforms: u };
}

// 遠くの天体の光点
export function createDots(scene, count, shaders, shared) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(count), 1));
  const pts = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms: { uPixel: shared.uPixel },
    vertexShader: shaders.dots_vert,
    fragmentShader: shaders.dots_frag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  pts.frustumCulled = false;
  pts.renderOrder = 7;
  scene.add(pts);
  return { points: pts, geo };
}
