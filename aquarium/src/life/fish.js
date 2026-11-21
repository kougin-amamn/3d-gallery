import * as THREE from 'three';
import { buildFishGeometry } from './fishGeometry.js';
import { School } from './boids.js';
import { patchUnderwater } from '../core/patch.js';

const PATTERNS = { plain: 0, neon: 1, bars: 2, spots: 3, wedge: 4, gourami: 5, honey: 6, koi: 7, cardinal: 8 };

export function createFish(scene3d, speciesData, world, uniforms, shaders) {
  const schools = [];
  const meshes = [];

  speciesData.species.forEach((spec, index) => {
    const { geometry, eye, bodyH } = buildFishGeometry(spec.shape);
    const swim = new THREE.InstancedBufferAttribute(new Float32Array(spec.count * 2), 2);
    swim.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aSwim', swim);

    const c = spec.colors;
    const fishUniforms = {
      uSwimAmp: { value: spec.swim.amp },
      uWaveK: { value: 5.6 },
      uBack: { value: new THREE.Color(c.back) },
      uBelly: { value: new THREE.Color(c.belly) },
      uAccent: { value: new THREE.Color(c.accent) },
      uAccent2: { value: new THREE.Color(c.accent2) },
      uFinColor: { value: new THREE.Color(c.fin) },
      uBodyH: { value: bodyH },
      uEye: { value: eye },
      uPattern: { value: PATTERNS[spec.pattern] ?? 0 },
      uGlow: { value: spec.glow ?? 0 },
      // ヒレ: 不透明度(付け根, 縁)、体色をどれだけ残すか、条(すじ)の濃さ、尾びれの付け根の位置
      uFinAlpha: { value: new THREE.Vector2(...(spec.fins?.alpha ?? [0.72, 0.42])) },
      uFinTint: { value: spec.fins?.tint ?? 0.7 },
      uFinRays: { value: spec.fins?.rays ?? 0 },
      uTailX: { value: 0.5 - (1 - spec.shape.tail) },
      // 肌: うろこの大きさ・凹凸・きらめき、細部の量(画質で変わる)
      uSkin: { value: new THREE.Vector4(spec.skin?.scale ?? 0, spec.skin?.depth ?? 0, spec.skin?.sparkle ?? 0, 1) },
      uEyeIris: { value: new THREE.Color(spec.skin?.iris ?? '#8C8470') },
    };
    const makeMaterial = (fin) => {
      const base = {
        color: 0xffffff,
        roughness: fin ? 0.5 : spec.material.roughness,
        metalness: fin ? 0 : spec.material.metalness,
        side: THREE.DoubleSide,
        envMapIntensity: 1.2,
        transparent: fin,
        depthWrite: !fin,
      };
      // 体は、肌の指定がある種だけ「ぬめり」(クリアコート)と、銀色の干渉色(イリデセンス)を持つ
      const sk = spec.skin;
      const m = !fin && sk
        ? new THREE.MeshPhysicalMaterial({
          ...base,
          clearcoat: sk.clearcoat ?? 0, clearcoatRoughness: sk.clearcoatRoughness ?? 0.2,
          iridescence: sk.iridescence ?? 0, iridescenceIOR: 1.35, iridescenceThicknessRange: [180, 420],
        })
        : new THREE.MeshStandardMaterial(base);
      return patchUnderwater(m, {
        shared: uniforms,
        shaders,
        key: `fish-${spec.id}-${fin ? 'fin' : 'body'}`,
        uniforms: fishUniforms,
        vertex: [
          { at: '#include <common>', code: shaders.fish_pars_vertex, mode: 'after' },
          { at: '#include <begin_vertex>', code: shaders.fish_vertex, mode: 'replace' },
        ],
        fragment: [
          { at: '#include <common>', code: shaders.fish_pars_fragment, mode: 'after' },
          { at: '#include <color_fragment>', code: shaders.fish_color, mode: 'after' },
          { at: '#include <emissivemap_fragment>', code: shaders.fish_emissive, mode: 'after' },
          { at: '#include <normal_fragment_maps>', code: shaders.fish_normal, mode: 'after' },
          { at: '#include <roughnessmap_fragment>', code: shaders.fish_roughness, mode: 'after' },
        ],
      });
    };
    const mat = [makeMaterial(false), makeMaterial(true)];
    for (const m of mat) m.userData.fishUniforms = fishUniforms;

    const mesh = new THREE.InstancedMesh(geometry, mat, spec.count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // 個体ごとのわずかな色の差
    const col = new THREE.Color();
    for (let i = 0; i < spec.count; i++) {
      col.setScalar(0.9 + ((i * 0.6180339) % 1) * 0.2);
      mesh.setColorAt(i, col);
    }
    scene3d.add(mesh);

    const school = new School(spec, index, world);
    schools.push(school);
    meshes.push({ mesh, swim, school });
  });

  return {
    schools,
    meshes,
    /** 細部の量(うろこ・えらぶた)。画質「低」では 0 */
    setDetail(v) {
      for (const m of meshes) for (const mat of [].concat(m.mesh.material)) {
        if (mat.userData.fishUniforms) mat.userData.fishUniforms.uSkin.value.w = v;
      }
    },
    setDensity(f) {
      for (const s of schools) {
        const min = s.spec.behavior === 'solo' ? s.spec.count : 1;
        s.active = Math.max(min, Math.round(s.spec.count * f));
      }
    },
    update(dt, t, food) {
      for (const s of schools) s.update(dt, t, schools, food);
      for (const m of meshes) m.school.writeMatrices(m.mesh, m.swim);
    },
  };
}
