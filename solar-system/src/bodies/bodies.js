import * as THREE from 'three';
import { makeRingTexture } from './bake.js';

// 天体の描画オブジェクト。位置は毎フレーム「カメラ基準」で置き直す(浮動原点)。
// group の向き: ローカル X = 経度0度、Y = 北極、Z = 経度0度 × 北極(-Z が東経90度)

const _m = new THREE.Matrix4();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();

/** 黄道座標 → 描画座標(Y が黄道の北) */
export const eclToScene = (v, out = new THREE.Vector3()) => out.set(v[0], v[2], -v[1]);

export function createBodies(scene, data, ctx) {
  const { shaders, baker, quality, shared } = ctx;
  const list = [];
  const byId = {};

  const shadowUniforms = () => ({
    uSunPos: shared.uSunPos,
    uSunRadius: shared.uSunRadius,
    uOccluders: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) },
    uOccCount: { value: 0 },
  });
  const sphere = (seg) => new THREE.SphereGeometry(1, seg, seg / 2);
  const fullSegs = quality.sphereSegments;

  for (const def of data.bodies) {
    // 衛星と準惑星は小さく写るので、球の分割数を半分にする
    const segs = def.type === 'moon' || def.type === 'dwarf' ? Math.max(48, fullSegs / 2) : fullSegs;
    const group = new THREE.Group();
    group.name = def.id;
    scene.add(group);
    const obj = { def, group, parts: [], uniforms: null, extra: {} };

    if (def.id === 'sun') {
      const u = { uTime: shared.uTime, uIntensity: { value: 14 }, uMap: { value: baker.bake(def, quality.bakeWidth * 2) } }; // 粒状斑は細かいので倍の解像度で焼く
      const mat = new THREE.ShaderMaterial({
        uniforms: u,
        vertexShader: shaders.body_vert,
        fragmentShader: shaders.sun_frag,
      });
      const mesh = new THREE.Mesh(sphere(segs), mat);
      group.add(mesh);
      obj.mesh = mesh;
      obj.uniforms = u;

      // コロナ(グループの外。カメラに正対させる)
      const cu = {
        uTime: shared.uTime,
        uCenter: { value: new THREE.Vector3() },
        uSize: { value: 1 },
        uRadiusFrac: { value: 0.2 },
        uIntensity: { value: 1 },
        uGlare: { value: 1 },
        uLimb: { value: 1 },
        uProm: { value: 0 },
      };
      const corona = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        new THREE.ShaderMaterial({
          uniforms: cu,
          vertexShader: shaders.corona_vert,
          fragmentShader: shaders.noise + shaders.corona_frag,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      corona.frustumCulled = false;
      corona.renderOrder = 20;
      scene.add(corona);
      obj.extra.corona = corona;
      obj.extra.coronaU = cu;
    } else if (def.id === 'earth') {
      const loader = new THREE.TextureLoader();
      const load = (url) => {
        const t = loader.load(url);
        t.anisotropy = 8;
        t.wrapS = THREE.RepeatWrapping;
        return t;
      };
      const ti = quality.earthTexture;
      const u = {
        ...shadowUniforms(),
        uDay: { value: load(def.textures.day[0]) },
        uNight: { value: load(def.textures.night[0]) },
        uBRC: { value: load(def.textures.brc[0]) },
        uTexel: { value: new THREE.Vector2(1 / 2048, 1 / 1024) },
        uLight: { value: new THREE.Vector3() },
        uPole: { value: new THREE.Vector3() },
        uCloudOffset: { value: 0 },
        uCityLights: { value: 1.6 },
        uAtmoColor: { value: new THREE.Vector3(...def.atmosphere.color) },
        uFill: shared.uFill,
      };
      const mat = new THREE.ShaderMaterial({
        uniforms: u,
        vertexShader: shaders.body_vert,
        fragmentShader: shaders.shadow + shaders.earth_frag,
      });
      const mesh = new THREE.Mesh(sphere(segs), mat);
      group.add(mesh);
      obj.mesh = mesh;
      obj.uniforms = u;
      // 高解像度テクスチャは近づいたときに差し替える
      obj.extra.hiRes = { wanted: ti > 0, loaded: false, load: () => {
        obj.extra.hiRes.loaded = true;
        const swap = (key, url, texel) => loader.load(url, (t) => {
          t.anisotropy = 8; t.wrapS = THREE.RepeatWrapping;
          const old = u[key].value; u[key].value = t; old.dispose();
          if (texel) u.uTexel.value.set(1 / 4096, 1 / 2048);
        });
        swap('uDay', def.textures.day[1]);
        swap('uNight', def.textures.night[1]);
        swap('uBRC', def.textures.brc[1], true);
      } };

      // 雲
      const cu = {
        ...shadowUniforms(),
        uOccluders: u.uOccluders, uOccCount: u.uOccCount,
        uBRC: u.uBRC, uLight: u.uLight, uCloudOffset: u.uCloudOffset, uFill: shared.uFill,
      };
      const clouds = new THREE.Mesh(sphere(segs), new THREE.ShaderMaterial({
        uniforms: cu,
        vertexShader: shaders.body_vert,
        fragmentShader: shaders.shadow + shaders.clouds_frag,
        transparent: true,
        depthWrite: false,
      }));
      clouds.scale.setScalar(1.006);
      clouds.renderOrder = 2;
      group.add(clouds);
      obj.extra.cloudsU = cu;
    } else {
      const tex = baker.bake(def, quality.bakeWidth);
      const s = def.surface;
      const isGas = ['jupiter', 'saturn', 'icegiant', 'venus', 'titan'].includes(s.kind);
      const u = {
        ...shadowUniforms(),
        uMap: { value: tex },
        uTexel: { value: new THREE.Vector2(1 / quality.bakeWidth, 2 / quality.bakeWidth) },
        uBump: { value: (s.bump ?? 0) * 1.6 },
        uLight: { value: new THREE.Vector3() },
        uCenter: { value: new THREE.Vector3() },
        uRadius: { value: 1 },
        uPole: { value: new THREE.Vector3() },
        uLommel: { value: isGas ? 0 : 0.65 },
        uLimb: { value: isGas && s.kind !== 'titan' ? 0.55 : 0 },
        uAtmoColor: { value: new THREE.Vector3(...(def.atmosphere?.color ?? [0, 0, 0])) },
        uAtmoRim: { value: def.atmosphere ? 0.6 : 0 },
        uAmbient: { value: 0.0006 },
        uFill: shared.uFill,
        uRing: { value: new THREE.Vector4(0, 0, 0, 0) },
        uRingTex: { value: null },
      };
      const mat = new THREE.ShaderMaterial({
        uniforms: u,
        vertexShader: shaders.body_vert,
        fragmentShader: shaders.shadow + shaders.planet_frag,
      });
      const mesh = new THREE.Mesh(sphere(segs), mat);
      if (def.oblateness) mesh.scale.y = 1 - def.oblateness;
      group.add(mesh);
      obj.mesh = mesh;
      obj.uniforms = u;

      if (def.rings) {
        const ringTex = makeRingTexture(def.rings);
        const inner = def.rings.innerKm / def.radiusKm;
        const outer = def.rings.outerKm / def.radiusKm;
        const ru = {
          ...shadowUniforms(),
          uRingTex: { value: ringTex },
          uInner: { value: inner },
          uOuter: { value: outer },
          uNormal: { value: new THREE.Vector3() },
          uCenter: u.uCenter,
          uRp: { value: 1 },
          uLight: u.uLight,
        };
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(inner, outer, 256, 4),
          new THREE.ShaderMaterial({
            uniforms: ru,
            vertexShader: shaders.rings_vert,
            fragmentShader: shaders.shadow + shaders.rings_frag,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.CustomBlending,
            blendSrc: THREE.OneFactor,
            blendDst: THREE.OneMinusSrcAlphaFactor,
          })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.renderOrder = 3;
        group.add(ring);
        u.uRing.value.set(1, def.rings.innerKm, def.rings.outerKm, 0);
        u.uRingTex.value = ringTex;
        obj.extra.ringU = ru;
      }
    }

    // 大気
    if (def.atmosphere) {
      const a = def.atmosphere;
      const au = {
        ...shadowUniforms(),
        uOccluders: obj.uniforms.uOccluders ?? { value: [] },
        uOccCount: obj.uniforms.uOccCount ?? { value: 0 },
        uCenter: { value: new THREE.Vector3() },
        uRp: { value: 1 },
        uRa: { value: 1 },
        uLight: obj.uniforms.uLight,
        uAtmoColor: { value: new THREE.Vector3(...a.color) },
        uStrength: { value: a.strength },
        uHaze: { value: a.haze },
        uSteps: { value: quality.atmoSteps },
      };
      const atmo = new THREE.Mesh(sphere(Math.max(48, segs / 2)), new THREE.ShaderMaterial({
        uniforms: au,
        vertexShader: shaders.body_vert,
        fragmentShader: shaders.shadow + shaders.atmosphere_frag,
        transparent: true,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
      }));
      atmo.scale.setScalar(1 + a.height);
      atmo.renderOrder = 4;
      group.add(atmo);
      obj.extra.atmoU = au;
      obj.extra.atmoHeight = a.height;
    }

    list.push(obj);
    byId[def.id] = obj;
  }

  // 影を落とす天体: 惑星には衛星、衛星には母天体
  for (const o of list) {
    const d = o.def;
    if (d.id === 'sun') continue;
    o.occluders = d.parent && d.parent !== 'sun'
      ? [d.parent]
      : list.filter((m) => m.def.parent === d.id).map((m) => m.def.id).slice(0, 4);
  }

  const tmpV = new THREE.Vector3();
  return {
    list,
    byId,
    /**
     * 毎フレームの更新
     * @param view  { rel(id) → Vector3 カメラ基準の位置, radius(id), frame(id), lightAt(id) }
     */
    update(view) {
      for (const o of list) {
        const d = o.def;
        const p = view.rel(d.id);
        const r = view.radius(d.id);
        o.group.position.copy(p);
        o.group.scale.setScalar(r);
        const f = view.frame(d.id);
        if (f) {
          eclToScene(f.prime, _x);
          eclToScene(f.pole, _y);
          _z.crossVectors(_x, _y);
          _m.makeBasis(_x, _y, _z);
          o.group.quaternion.setFromRotationMatrix(_m);
        }
        const u = o.uniforms;
        if (d.id === 'sun') {
          const cu = o.extra.coronaU;
          cu.uCenter.value.copy(p);
          const dist = p.length();
          // 遠くからでも見えるよう、板の大きさに下限を設ける
          const size = Math.max(r * 7, dist * 0.022);
          cu.uSize.value = size;
          cu.uRadiusFrac.value = r / size;
          // 近くから見ると、球の見かけの縁は中心を通る板の上では半径より外側に来る
          cu.uLimb.value = Math.min(4, dist / Math.sqrt(Math.max(dist * dist - r * r, 1e-9)));
          // 紅炎は太陽がある程度大きく写っているときだけ(小さいとちらつく)
          cu.uProm.value = view.sunIntensity * 0.35 * Math.min(1, Math.max(0, (view.sunPx - 25) / 60));
          cu.uGlare.value = view.sunGlare;
          continue;
        }
        u.uLight.value.copy(view.lightAt(d.id));
        if (u.uPole) u.uPole.value.copy(_y);
        if (u.uCenter) u.uCenter.value.copy(p);
        if (u.uRadius) u.uRadius.value = r;
        // 影を落とす天体
        let n = 0;
        for (const id of o.occluders) {
          if (n >= 4) break;
          const q = view.rel(id);
          u.uOccluders.value[n++].set(q.x, q.y, q.z, view.radius(id));
        }
        u.uOccCount.value = n;
        if (o.extra.ringU) {
          o.extra.ringU.uNormal.value.copy(_y);
          o.extra.ringU.uRp.value = r;
          o.uniforms.uRing.value.y = d.rings.innerKm / d.radiusKm * r;
          o.uniforms.uRing.value.z = d.rings.outerKm / d.radiusKm * r;
        }
        if (o.extra.atmoU) {
          const au = o.extra.atmoU;
          au.uCenter.value.copy(p);
          au.uRp.value = r;
          au.uRa.value = r * (1 + o.extra.atmoHeight);
        }
        if (o.extra.cloudsU) {
          // 雲はゆっくり東へ流れる
          u.uCloudOffset.value = (view.days * -0.0016) % 1;
        }
        if (o.extra.hiRes && o.extra.hiRes.wanted && !o.extra.hiRes.loaded) {
          if (p.length() < r * 40) o.extra.hiRes.load();
        }
      }
      void tmpV;
    },
    setEarthHiRes(on) {
      const e = byId.earth;
      if (e) e.extra.hiRes.wanted = on;
    },
  };
}
