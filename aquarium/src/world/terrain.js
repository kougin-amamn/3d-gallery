import * as THREE from 'three';
import { fbm2, noise2, makeRng, smoothstep } from '../core/noise.js';
import { patchUnderwater } from '../core/patch.js';

// 底砂の高さ。魚や配置物も同じ関数で接地させる。
export function makeSandHeight(cfg) {
  const s = cfg.sand;
  return (x, z) => {
    const dune = fbm2(x * s.duneScale + 3.1, z * s.duneScale - 1.7, 4) * s.duneHeight;
    const back = smoothstep(1.5, -9, z) * s.backRise;
    const warp = fbm2(x * 0.2, z * 0.2, 2) * 2.5;
    const ripple = Math.sin(x * 2.4 + z * 0.8 + warp) * s.rippleHeight * (0.6 + 0.4 * noise2(x * 0.3, z * 0.3));
    return cfg.floorY + 0.35 + dune + back + ripple;
  };
}

// 砂粒のテクスチャ(色と法線)を生成する
function makeSandTextures(baseHex, size = 512) {
  const rng = makeRng(42);
  const h = new Float32Array(size * size);
  for (let i = 0; i < h.length; i++) h[i] = rng();
  // 少しぼかして粒の塊を作る
  const blur = new Float32Array(h.length);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        sum += h[((y + dy + size) % size) * size + ((x + dx + size) % size)];
      }
      blur[y * size + x] = h[y * size + x] * 0.45 + (sum / 9) * 0.55;
    }
  }

  const base = new THREE.Color(baseHex);
  const colorData = new Uint8Array(size * size * 4);
  const normalData = new Uint8Array(size * size * 4);
  const c = new THREE.Color();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const v = blur[i];
      // 粒ごとの色ゆらぎ(暗い粒と明るい粒が混ざる)
      const r = h[i];
      c.copy(base).multiplyScalar(0.72 + v * 0.5);
      if (r > 0.985) c.setRGB(0.25, 0.22, 0.2);
      else if (r < 0.02) c.multiplyScalar(1.25);
      colorData[i * 4] = Math.min(255, c.r * 255);
      colorData[i * 4 + 1] = Math.min(255, c.g * 255);
      colorData[i * 4 + 2] = Math.min(255, c.b * 255);
      colorData[i * 4 + 3] = 255;

      const hx = blur[y * size + ((x + 1) % size)] - blur[y * size + ((x - 1 + size) % size)];
      const hy = blur[((y + 1) % size) * size + x] - blur[((y - 1 + size) % size) * size + x];
      const n = new THREE.Vector3(-hx * 2.2, -hy * 2.2, 1).normalize();
      normalData[i * 4] = (n.x * 0.5 + 0.5) * 255;
      normalData[i * 4 + 1] = (n.y * 0.5 + 0.5) * 255;
      normalData[i * 4 + 2] = (n.z * 0.5 + 0.5) * 255;
      normalData[i * 4 + 3] = 255;
    }
  }
  const map = new THREE.DataTexture(colorData, size, size);
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = new THREE.DataTexture(normalData, size, size);
  for (const t of [map, normalMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    t.needsUpdate = true;
  }
  return { map, normalMap };
}

export function createTerrain(scene3d, cfg, palettes, uniforms, shaders, sandHeight) {
  const s = cfg.sand;
  const geo = new THREE.PlaneGeometry(s.size[0], s.size[1], s.segments[0], s.segments[1]);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -4);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const base = new THREE.Color(palettes.base.sand);
  const dark = base.clone().multiplyScalar(0.55).lerp(new THREE.Color('#5E5A44'), 0.4);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, sandHeight(x, z));
    // 色むら: 窪みや岩の周りはやや暗い
    const m = fbm2(x * 0.15 + 9, z * 0.15 - 4, 3) * 0.5 + 0.5;
    c.copy(base).lerp(dark, smoothstep(0.45, 0.85, m) * 0.55);
    c.multiplyScalar(0.9 + noise2(x * 1.3, z * 1.3) * 0.06);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const tex = makeSandTextures('#ffffff');
  tex.map.repeat.set(s.grainRepeat, s.grainRepeat * s.size[1] / s.size[0]);
  tex.normalMap.repeat.copy(tex.map.repeat);

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: tex.map,
    normalMap: tex.normalMap,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 0.95,
    metalness: 0,
  });
  patchUnderwater(mat, { shared: uniforms, shaders, key: 'sand' });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  scene3d.add(mesh);
  return { mesh, material: mat };
}

// 小石: 岩の周りと砂地にまばらに散らす
export function createPebbles(scene3d, cfg, uniforms, shaders, sandHeight, rocks) {
  const max = cfg.pebbles.count;
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const p = geo.attributes.position;
  const rng0 = makeRng(77);
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i);
    v.multiplyScalar(1 + (rng0() - 0.5) * 0.25);
    p.setXYZ(i, v.x, v.y * 0.6, v.z);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0, flatShading: false });
  patchUnderwater(mat, { shared: uniforms, shaders, key: 'pebble' });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const rng = makeRng(101);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const col = new THREE.Color();
  const tones = ['#6E6658', '#8A8070', '#4E4A44', '#A39782', '#5F5A4C'];
  for (let i = 0; i < max; i++) {
    let x, z;
    if (rocks.length && rng() < 0.7) {
      const r = rocks[Math.floor(rng() * rocks.length)];
      const a = rng() * Math.PI * 2;
      const d = r.radius * (0.9 + rng() * 0.9) + rng() * cfg.pebbles.near;
      x = r.center.x + Math.cos(a) * d;
      z = r.center.z + Math.sin(a) * d;
    } else {
      x = (rng() - 0.5) * 28;
      z = -9 + rng() * 14;
    }
    const s = 0.05 + Math.pow(rng(), 3) * 0.22;
    e.set(rng() * 0.5, rng() * Math.PI * 2, rng() * 0.5);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(x, sandHeight(x, z) + s * 0.25, z), q, new THREE.Vector3(s, s, s * (0.8 + rng() * 0.4)));
    mesh.setMatrixAt(i, m);
    col.set(tones[Math.floor(rng() * tones.length)]).multiplyScalar(0.85 + rng() * 0.3);
    mesh.setColorAt(i, col);
  }
  mesh.instanceMatrix.needsUpdate = true;
  scene3d.add(mesh);
  return { mesh, max };
}
