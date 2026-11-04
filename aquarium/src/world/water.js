import * as THREE from 'three';
import { makeRng } from '../core/noise.js';

// 水面(下から見上げた面)
export function createSurface(scene3d, cfg, uniforms, shaders) {
  const geo = new THREE.PlaneGeometry(160, 160, 1, 1);
  geo.rotateX(Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: shaders.world_vert,
    fragmentShader: shaders.common + shaders.surface_frag,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = cfg.surfaceY;
  mesh.renderOrder = -5;
  scene3d.add(mesh);
  return { mesh };
}

// 光の筋(ゴッドレイ)。1回の描画で全本を描く。
export function createRays(scene3d, cfg, uniforms, shaders) {
  const rc = cfg.rays;
  const base = new THREE.PlaneGeometry(1, 1, 1, 24);
  base.translate(0.5, 0.5, 0); // uv と同じ 0..1 に
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.attributes.position);
  geo.setAttribute('uv', base.attributes.uv);

  const rng = makeRng(7);
  const data = new Float32Array(rc.count * 4);
  for (let i = 0; i < rc.count; i++) {
    // 手前寄りに偏らせ、奥へ行くほどまばらに
    data[i * 4] = rc.area[0] + rng() * (rc.area[1] - rc.area[0]);
    data[i * 4 + 1] = rc.area[2] + Math.pow(rng(), 0.7) * (rc.area[3] - rc.area[2]);
    data[i * 4 + 2] = rc.width[0] + rng() * (rc.width[1] - rc.width[0]);
    data[i * 4 + 3] = rng();
  }
  geo.setAttribute('aRay', new THREE.InstancedBufferAttribute(data, 4));
  geo.instanceCount = rc.count;

  const raysU = { value: 1 };
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uRays: raysU },
    vertexShader: shaders.rays_vert,
    fragmentShader: shaders.common + shaders.rays_frag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  scene3d.add(mesh);
  return {
    mesh,
    uniform: raysU,
    setDensity(f) { geo.instanceCount = Math.max(1, Math.round(rc.count * f)); },
  };
}

// 気泡
export function createBubbles(scene3d, cfg, uniforms, shaders, pixelU) {
  const bc = cfg.bubbles;
  const count = bc.emitters.length * bc.perEmitter;
  const geo = new THREE.BufferGeometry();
  const aBubble = new Float32Array(count * 4);
  const aEmitY = new Float32Array(count);
  const rng = makeRng(23);
  let i = 0;
  for (const [x, y, z] of bc.emitters) {
    for (let k = 0; k < bc.perEmitter; k++, i++) {
      aBubble[i * 4] = x + (rng() - 0.5) * 0.15;
      aBubble[i * 4 + 1] = z + (rng() - 0.5) * 0.15;
      aBubble[i * 4 + 2] = rng();
      aBubble[i * 4 + 3] = Math.pow(rng(), 2.5);
      aEmitY[i] = y;
    }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('aBubble', new THREE.BufferAttribute(aBubble, 4));
  geo.setAttribute('aEmitY', new THREE.BufferAttribute(aEmitY, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uPixel: pixelU },
    vertexShader: shaders.bubbles_vert,
    fragmentShader: shaders.common + shaders.bubbles_frag,
    transparent: true,
    depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 6;
  scene3d.add(pts);
  return { points: pts };
}

// 浮遊粒子(マリンスノー)
export function createSnow(scene3d, cfg, uniforms, shaders, pixelU) {
  const sc = cfg.snow;
  const geo = new THREE.BufferGeometry();
  const a = new Float32Array(sc.count * 4);
  const rng = makeRng(9);
  for (let i = 0; i < a.length; i++) a[i] = rng();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sc.count * 3), 3));
  geo.setAttribute('aSnow', new THREE.BufferAttribute(a, 4));
  const glow = { value: 1 };
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...uniforms,
      uPixel: pixelU,
      uSnowGlow: glow,
      uBoxMin: { value: new THREE.Vector3(...sc.boxMin) },
      uBoxMax: { value: new THREE.Vector3(...sc.boxMax) },
    },
    vertexShader: shaders.snow_vert,
    fragmentShader: shaders.common + shaders.snow_frag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 7;
  scene3d.add(pts);
  return {
    points: pts,
    glow,
    setDensity(f) { geo.setDrawRange(0, Math.max(1, Math.round(sc.count * f))); },
  };
}
