import * as THREE from 'three';
import { makeRng, fbm2 } from '../core/noise.js';
import { patchUnderwater } from '../core/patch.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// 葉の形(高さ1、根元が原点)。種類ごとに幅と輪郭を変える。
const BLADE = {
  ribbon: { width: 0.13, segs: 10, outline: (t) => 1 - Math.pow(t, 8), cup: 0.02, height: [3.2, 7.8], flex: [0.55, 1.1], arch: [0.2, 0.9], twist: [-1.2, 1.2] },
  sword:  { width: 0.36, segs: 8, outline: (t) => Math.sin(Math.PI * (0.12 + 0.88 * t)) * (1 - t * 0.2), cup: 0.05, height: [1.4, 2.6], flex: [0.12, 0.25], arch: [0.4, 1.1], twist: [-0.5, 0.5] },
  // 赤い有茎草(ロタラなど): 細い茎に小さな葉が段々に付き、先端ほど赤い
  stem:   { width: 0.03, segs: 20, outline: () => 1, cup: 0.0, height: [2.0, 3.6], flex: [0.1, 0.22], arch: [0.05, 0.25], twist: [-0.3, 0.3], stem: true },
  carpet: { width: 0.06, segs: 3, outline: (t) => 1 - t * 0.85, cup: 0.0, height: [0.16, 0.36], flex: [0.08, 0.16], arch: [0.02, 0.08], twist: [-0.6, 0.6], tuft: 7 },
};

function stemGeometry(b, baseColor, tipColor) {
  const positions = [], colors = [], indices = [];
  const c = new THREE.Color();
  const quad = (pts, col) => {
    const i0 = positions.length / 3;
    for (const p of pts) { positions.push(...p); colors.push(col.r, col.g, col.b); }
    indices.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  };
  // 茎(十字に組んだ細い板)
  for (const [ax, az] of [[1, 0], [0, 1]]) {
    for (let i = 0; i < b.segs; i++) {
      const t0 = i / b.segs, t1 = (i + 1) / b.segs, w = b.width / 2;
      c.lerpColors(baseColor, tipColor, Math.pow(t0, 1.6)).multiplyScalar(0.8);
      quad([[-w * ax, t0, -w * az], [w * ax, t0, w * az], [w * ax, t1, w * az], [-w * ax, t1, -w * az]], c);
    }
  }
  // 葉: 節ごとに4枚、少しずつ向きを回す
  const nodes = 22;
  for (let n = 1; n < nodes; n++) {
    const t = n / nodes;
    c.lerpColors(baseColor, tipColor, Math.pow(t, 1.3));
    const len = 0.13 * (1 - t * 0.45), w = 0.028;
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + n * 0.7;
      const dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx;
      const up = 0.035 + t * 0.02;
      quad([
        [px * w * 0.3, t, pz * w * 0.3],
        [dx * len * 0.5 + px * w, t + up * 0.5, dz * len * 0.5 + pz * w],
        [dx * len, t + up, dz * len],
        [dx * len * 0.5 - px * w, t + up * 0.5, dz * len * 0.5 - pz * w],
      ], c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function bladeGeometry(kind, baseColor, tipColor) {
  const b = BLADE[kind];
  if (b.stem) return stemGeometry(b, baseColor, tipColor);
  const positions = [], colors = [], uvs = [], indices = [];
  const c = new THREE.Color();
  for (let i = 0; i <= b.segs; i++) {
    const t = i / b.segs;
    const w = b.width * Math.max(b.outline(t), 0.02) * 0.5;
    c.lerpColors(baseColor, tipColor, Math.pow(t, 0.8));
    for (const s of [-1, 0, 1]) {
      positions.push(s * w, t, Math.abs(s) * b.cup);
      colors.push(c.r * (s === 0 ? 0.92 : 1), c.g * (s === 0 ? 0.92 : 1), c.b * (s === 0 ? 0.92 : 1));
      uvs.push((s + 1) / 2, t);
    }
  }
  for (let i = 0; i < b.segs; i++) {
    for (let j = 0; j < 2; j++) {
      const a = i * 3 + j, d = a + 3;
      indices.push(a, a + 1, d, a + 1, d + 1, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  if (!b.tuft) return geo;

  // 小さな草は数枚を放射状に束ねて1株にする
  const parts = [];
  for (let k = 0; k < b.tuft; k++) {
    const g = geo.clone();
    const tilt = 0.25 + (k % 3) * 0.18;
    g.rotateX(tilt);
    g.scale(1, 0.7 + ((k * 0.37) % 0.6), 1);
    g.rotateY((k / b.tuft) * Math.PI * 2 + k * 0.4);
    parts.push(g);
  }
  return mergeGeometries(parts);
}

export function createPlants(scene3d, cfg, palettes, uniforms, shaders, sandHeight, obstacles) {
  const currentDir = new THREE.Vector2(...cfg.currentDir).normalize();
  const groupsByType = { ribbon: [], sword: [], stem: [], carpet: [] };
  for (const g of cfg.plants) groupsByType[g.type]?.push(g);

  const meshes = [];
  let seed = 1;
  for (const [type, groups] of Object.entries(groupsByType)) {
    if (!groups.length) continue;
    const pal = palettes.plants[type];
    const geo = bladeGeometry(type, new THREE.Color(pal.base), new THREE.Color(pal.tip));
    const b = BLADE[type];

    // 配置を先に集める(岩の中には生やさない)
    const items = [];
    for (const g of groups) {
      const rng = makeRng(seed++ * 97);
      let tries = 0, placed = 0;
      while (placed < g.count && tries++ < g.count * 6) {
        let x, z, density = 1;
        if (g.area) {
          x = g.area[0] + rng() * (g.area[1] - g.area[0]);
          z = g.area[2] + rng() * (g.area[3] - g.area[2]);
          // ノイズで群落の濃淡を作る(均一な芝生にしない)
          density = fbm2(x * 0.18 + 5, z * 0.18, 3) * 0.5 + 0.5;
          if (rng() > Math.pow(density, 2.2) * 1.6) continue;
        } else {
          const a = rng() * Math.PI * 2;
          const r = Math.sqrt(rng()) * g.radius;
          x = g.center[0] + Math.cos(a) * r;
          z = g.center[1] + Math.sin(a) * r * 0.8;
          density = 1 - r / g.radius;
        }
        const blocked = obstacles.some((o) => {
          const dx = x - o.center.x, dz = z - o.center.z;
          return dx * dx + dz * dz < Math.pow(o.radius * 0.8, 2) && o.center.y < 3;
        });
        if (blocked) continue;
        items.push({ g, x, z, density });
        placed++;
      }
    }
    // 画質で本数を減らしたときにも偏らないよう並びを混ぜる
    const shuffle = makeRng(seed * 31);
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(shuffle() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, side: THREE.DoubleSide, roughness: 0.62, metalness: 0,
    });
    patchUnderwater(mat, {
      shared: uniforms, shaders, key: `plant-${type}`, worldFromVertex: false,
      uniforms: { uCurrentDir: { value: currentDir } },
      vertex: [
        { at: '#include <common>', code: shaders.plant_pars_vertex, mode: 'after' },
        { at: '#include <begin_vertex>', code: shaders.plant_vertex, mode: 'replace' },
        { at: '#include <project_vertex>', code: shaders.plant_project, mode: 'replace' },
      ],
      fragment: [
        { at: '#include <common>', code: 'varying float vPlantH;', mode: 'after' },
        { at: '#include <emissivemap_fragment>', code: shaders.plant_fragment, mode: 'after' },
        // 薄い葉は表裏どちらも上からの光を受けるよう、法線を上向きに寄せる
        { at: '#include <normal_fragment_begin>', code: 'normal = normalize(mix(normal, (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz, 0.5));', mode: 'after' },
      ],
    });

    const count = items.length;
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const attr = new Float32Array(count * 4);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const col = new THREE.Color();
    const tints = pal.tints.map((t) => new THREE.Color(t));
    const rng = makeRng(seed * 13);
    const lerp = (r, v) => r[0] + (r[1] - r[0]) * v;
    for (let i = 0; i < count; i++) {
      const it = items[i];
      const hScale = type === 'carpet' ? 1 : 0.55 + 0.45 * it.density;
      const h = lerp(b.height, rng()) * hScale;
      e.set((rng() - 0.5) * 0.25, rng() * Math.PI * 2, (rng() - 0.5) * 0.25);
      q.setFromEuler(e);
      const ws = 0.8 + rng() * 0.5;
      m.compose(new THREE.Vector3(it.x, sandHeight(it.x, it.z) - 0.05, it.z), q, new THREE.Vector3(ws, h, ws));
      mesh.setMatrixAt(i, m);
      col.copy(tints[Math.floor(rng() * tints.length)]).multiplyScalar(1.1 + (rng() - 0.5) * 0.3);
      mesh.setColorAt(i, col);
      attr[i * 4] = rng() * Math.PI * 2;
      attr[i * 4 + 1] = lerp(b.flex, rng()) * Math.min(h / 4, 1.6);
      attr[i * 4 + 2] = lerp(b.arch, rng());
      attr[i * 4 + 3] = lerp(b.twist, rng());
    }
    geo.setAttribute('aPlant', new THREE.InstancedBufferAttribute(attr, 4));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    scene3d.add(mesh);
    meshes.push({ mesh, max: count });
  }

  return {
    meshes,
    setDensity(f) {
      for (const p of meshes) p.mesh.count = Math.max(1, Math.round(p.max * f));
    },
  };
}
