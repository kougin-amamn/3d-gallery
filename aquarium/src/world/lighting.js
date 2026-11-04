import * as THREE from 'three';

// 水の共通uniformと光源。時間帯プリセット間をゆっくり補間する。
export function createWaterUniforms(scene) {
  return {
    uTime: { value: 0 },
    uShallow: { value: new THREE.Color() },
    uDeep: { value: new THREE.Color() },
    uAbsorb: { value: new THREE.Vector3() },
    uFogDensity: { value: 1 },
    uSurfaceY: { value: scene.surfaceY },
    uFloorY: { value: scene.floorY },
    uSunDir: { value: new THREE.Vector3(0, -1, 0) },
    uSunColor: { value: new THREE.Color() },
    uSunIntensity: { value: 1 },
    uCaustics: { value: 1 },
  };
}

const NUM_KEYS = ['sunIntensity', 'ambient', 'fogDensity', 'rays', 'caustics', 'exposure', 'bloom', 'snowGlow'];
const COLOR_KEYS = ['sunColor', 'shallow', 'deep'];
const VEC_KEYS = ['sunDir', 'absorb'];
const GRADE_KEYS = ['contrast', 'saturation', 'warmth', 'vignette', 'grain'];

function toState(p) {
  const s = { grade: {} };
  for (const k of NUM_KEYS) s[k] = p[k];
  for (const k of COLOR_KEYS) s[k] = new THREE.Color(p[k]);
  for (const k of VEC_KEYS) s[k] = new THREE.Vector3(...p[k]);
  for (const k of GRADE_KEYS) s.grade[k] = p.grade[k];
  s.sunDir.normalize();
  return s;
}

function lerpState(out, a, b, t) {
  for (const k of NUM_KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  for (const k of COLOR_KEYS) out[k].lerpColors(a[k], b[k], t);
  for (const k of VEC_KEYS) out[k].lerpVectors(a[k], b[k], t);
  out.sunDir.normalize();
  for (const k of GRADE_KEYS) out.grade[k] = a.grade[k] + (b.grade[k] - a.grade[k]) * t;
}

function cloneState(s) {
  const c = { grade: { ...s.grade } };
  for (const k of NUM_KEYS) c[k] = s[k];
  for (const k of COLOR_KEYS) c[k] = s[k].clone();
  for (const k of VEC_KEYS) c[k] = s[k].clone();
  return c;
}

export function createLighting(scene3d, uniforms, palettes, sceneCfg) {
  const presets = {};
  for (const [name, p] of Object.entries(palettes.timeOfDay)) presets[name] = toState(p);

  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -17; sc.right = 17; sc.top = 13; sc.bottom = -13; sc.near = 1; sc.far = 80;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 4;
  sun.target.position.set(0, 0, -1.5);
  scene3d.add(sun, sun.target);

  const sandColor = new THREE.Color(palettes.base.sand);
  const hemi = new THREE.HemisphereLight(0xffffff, sandColor, 0.5);
  scene3d.add(hemi);

  let current = cloneState(presets[palettes.default]);
  let from = cloneState(current);
  let to = presets[palettes.default];
  let t = 1;
  let name = palettes.default;
  const duration = palettes.transitionSeconds ?? 4;
  const listeners = [];

  function apply() {
    const s = current;
    uniforms.uShallow.value.copy(s.shallow);
    uniforms.uDeep.value.copy(s.deep);
    uniforms.uAbsorb.value.copy(s.absorb);
    uniforms.uFogDensity.value = s.fogDensity;
    uniforms.uSunDir.value.copy(s.sunDir);
    uniforms.uSunColor.value.copy(s.sunColor);
    uniforms.uSunIntensity.value = s.sunIntensity;
    uniforms.uCaustics.value = s.caustics;

    sun.color.copy(s.sunColor);
    sun.intensity = s.sunIntensity;
    sun.position.copy(sun.target.position).addScaledVector(s.sunDir, -40);
    hemi.color.copy(s.shallow);
    hemi.groundColor.copy(sandColor).multiplyScalar(0.35).lerp(s.deep, 0.5);
    hemi.intensity = s.ambient * 0.9;
    for (const fn of listeners) fn(s);
  }

  apply();

  return {
    sun,
    hemi,
    get name() { return name; },
    get state() { return current; },
    presets,
    onChange(fn) { listeners.push(fn); fn(current); },
    setPreset(next, instant = false) {
      if (!presets[next]) return;
      name = next;
      from = cloneState(current);
      to = presets[next];
      t = instant ? 1 : 0;
      if (instant) { current = cloneState(to); apply(); }
    },
    // 開発用: 現在値を直接書き換える
    applyNow() { apply(); },
    update(dt) {
      if (t >= 1) return false;
      t = Math.min(1, t + dt / duration);
      const e = t * t * (3 - 2 * t);
      lerpState(current, from, to, e);
      apply();
      return t >= 1;
    },
  };
}
