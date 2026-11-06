import * as THREE from 'three';
import { loadJSON, loadShaders, requireKeys } from './core/loader.js';
import { createCamera } from './core/camera.js';
import { createQuality } from './core/quality.js';
import { createWaterUniforms, createLighting } from './world/lighting.js';
import { createEnvironment } from './world/environment.js';
import { makeSandHeight, createTerrain, createPebbles } from './world/terrain.js';
import { createRocks } from './world/rocks.js';
import { createPlants } from './world/plants.js';
import { createSurface, createRays, createBubbles, createSnow } from './world/water.js';
import { createFish } from './life/fish.js';
import { createFood } from './life/food.js';
import { createShrimp } from './life/shrimp.js';
import { createComposer } from './post/composer.js';
import { createHud } from './ui/hud.js';

const SHADERS = [
  'common', 'uw_pars_vertex', 'uw_vertex', 'uw_pars_fragment', 'uw_light',
  'world_vert', 'background_frag', 'surface_frag', 'rays_vert', 'rays_frag',
  'bubbles_vert', 'bubbles_frag', 'snow_vert', 'snow_frag', 'post_vert', 'grade_frag',
  'fish_pars_vertex', 'fish_vertex', 'fish_pars_fragment', 'fish_color', 'fish_emissive',
  'plant_pars_vertex', 'plant_vertex', 'plant_project', 'plant_fragment',
];

const params = new URLSearchParams(location.search);

function fail(err) {
  console.error(err);
  const box = document.getElementById('error');
  box.querySelector('.error-message').textContent = err?.message || String(err);
  box.hidden = false;
  document.getElementById('loading').classList.add('done');
}

async function boot() {
  const canvas = document.getElementById('view');
  if (!canvas.getContext('webgl2')) {
    throw new Error('このブラウザはWebGL2に対応していないため表示できません。最新のChrome / Safari / Firefox / Edgeでお試しください。');
  }

  const [sceneCfg, speciesData, palettes, qualityCfg, shaders] = await Promise.all([
    loadJSON('./data/scene.json'),
    loadJSON('./data/species.json'),
    loadJSON('./data/palettes.json'),
    loadJSON('./data/quality.json'),
    loadShaders('./src/shaders', SHADERS),
  ]);
  requireKeys(sceneCfg, 'scene.json', ['surfaceY', 'floorY', 'bounds.min', 'bounds.max', 'camera', 'sand', 'rocks', 'plants', 'bubbles', 'rays', 'snow', 'food']);
  requireKeys(palettes, 'palettes.json', ['base.sand', 'plants', 'default', 'timeOfDay']);
  requireKeys(qualityCfg, 'quality.json', ['tiers.low', 'tiers.medium', 'tiers.high', 'auto']);
  speciesData.species.forEach((s, i) => requireKeys(s, `species.json の ${i + 1} 番目`, ['id', 'behavior', 'count', 'length', 'speed', 'depth', 'flock', 'swim', 'colors', 'shape']));

  // ---- 描画の土台 ----
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene3d = new THREE.Scene();
  const uniforms = createWaterUniforms(sceneCfg);
  const pixelU = { value: 600 };
  const lighting = createLighting(scene3d, uniforms, palettes, sceneCfg);
  const startTime = params.get('time') in palettes.timeOfDay ? params.get('time') : palettes.default;
  lighting.setPreset(startTime, true);

  const view = createCamera(sceneCfg, canvas);
  const env = createEnvironment(renderer, scene3d, uniforms, shaders);

  // ---- 環境 ----
  const sandHeight = makeSandHeight(sceneCfg);
  createTerrain(scene3d, sceneCfg, palettes, uniforms, shaders, sandHeight);
  const rocks = createRocks(scene3d, sceneCfg, uniforms, shaders, sandHeight);
  const pebbles = createPebbles(scene3d, sceneCfg, uniforms, shaders, sandHeight, rocks.obstacles.slice(0, sceneCfg.rocks.length));
  const plants = createPlants(scene3d, sceneCfg, palettes, uniforms, shaders, sandHeight, rocks.obstacles);
  createSurface(scene3d, sceneCfg, uniforms, shaders);
  const rays = createRays(scene3d, sceneCfg, uniforms, shaders);
  createBubbles(scene3d, sceneCfg, uniforms, shaders, pixelU);
  const snow = createSnow(scene3d, sceneCfg, uniforms, shaders, pixelU);

  // ---- 生き物 ----
  const world = {
    bounds: { min: new THREE.Vector3(...sceneCfg.bounds.min), max: new THREE.Vector3(...sceneCfg.bounds.max) },
    sandHeight,
    obstacles: rocks.obstacles,
  };
  const fish = createFish(scene3d, speciesData, world, uniforms, shaders);
  const food = createFood(scene3d, sceneCfg, uniforms, shaders, sandHeight);
  const shrimp = createShrimp(scene3d, sceneCfg, rocks, uniforms, shaders);

  // ---- ポストプロセス ----
  const post = createComposer(renderer, scene3d, view.camera, shaders);

  lighting.onChange((s) => {
    renderer.toneMappingExposure = s.exposure;
    post.bloom.strength = s.bloom;
    rays.uniform.value = s.rays;
    snow.glow.value = s.snowGlow;
    const g = post.grade.uniforms;
    g.uContrast.value = s.grade.contrast;
    g.uSaturation.value = s.grade.saturation;
    g.uWarmth.value = s.grade.warmth;
    g.uVignette.value = s.grade.vignette;
    g.uGrain.value = s.grade.grain;
  });

  // ---- 画質 ----
  let pixelRatio = 1;
  let tierSettings = qualityCfg.tiers.high;
  const resize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    pixelRatio = Math.min(window.devicePixelRatio || 1, tierSettings.pixelRatioMax);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(w, h, false);
    view.resize(w, h);
    post.setSize(w, h, pixelRatio);
    pixelU.value = (h * pixelRatio) / (2 * Math.tan(THREE.MathUtils.degToRad(view.camera.fov) / 2));
  };

  const quality = createQuality(qualityCfg, (t) => {
    tierSettings = t;
    const shadowsOn = t.shadows > 0;
    if (renderer.shadowMap.enabled !== shadowsOn) {
      renderer.shadowMap.enabled = shadowsOn;
      scene3d.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    }
    if (shadowsOn && lighting.sun.shadow.mapSize.x !== t.shadows) {
      lighting.sun.shadow.mapSize.set(t.shadows, t.shadows);
      lighting.sun.shadow.map?.dispose();
      lighting.sun.shadow.map = null;
    }
    post.bloom.enabled = t.bloom;
    post.setSamples(t.msaa);
    post.grade.uniforms.uAberration.value = t.aberration;
    fish.setDensity(t.fish);
    plants.setDensity(t.plants);
    snow.setDensity(t.snow);
    rays.setDensity(t.rays);
    pebbles.mesh.count = Math.round(pebbles.max * t.pebbles);
    resize();
  }, params.get('quality'));

  // ---- 操作 ----
  const feedAt = () => {
    // 画面中央の奥あたりに落とす
    const tgt = view.controls.target;
    food.feed(new THREE.Vector3(tgt.x + (Math.random() - 0.5) * 3, 0, tgt.z + (Math.random() - 0.5) * 2));
  };
  const hud = createHud({
    onFeed: feedAt,
    onTime: (name) => { lighting.setPreset(name); hud.setTime(name); },
    onQuality: (m) => quality.setMode(m),
  });
  hud.setTime(lighting.name);
  quality.onChange((mode, tier) => hud.setQuality(mode, tier));
  quality.start();
  hud.setQuality(quality.mode, quality.tier);
  window.addEventListener('resize', resize);

  let dev = null;
  if (params.has('dev')) {
    const { createDevGui } = await import('./ui/devgui.js');
    dev = await createDevGui(lighting, post, () => ({ tier: quality.tier }));
  }

  // 自動テスト・スクリーンショット用
  let frozen = false;
  window.__aquarium = {
    renderer, scene: scene3d, camera: view.camera, lighting, fish, food, shrimp, quality, feed: feedAt,
    // 確認用: 各種を1匹ずつ横に並べてカメラを寄せる
    lineup() {
      frozen = true;
      let x = -5;
      for (const s of fish.schools) {
        const a = s.fish[0];
        a.p.set(x + a.scale * 0.5, 5, 2);
        a.dir.set(1, 0, 0); a.v.set(0, 0, 0); a.roll = 0;
        x += a.scale + 0.8;
        for (let i = 1; i < s.active; i++) s.fish[i].p.set(0, -50, 0);
      }
      for (const m of fish.meshes) m.school.writeMatrices(m.mesh, m.swim);
      view.camera.position.set(-0.2, 5.3, 9);
      view.camera.lookAt(-0.2, 5, 2);
    },
  };

  // ---- 初期化完了 ----
  // シェーダーを先にコンパイルしておき、表示直後のカクつきを防ぐ
  renderer.compile(scene3d, view.camera);
  document.getElementById('loading').classList.add('done');
  setTimeout(() => document.getElementById('title').classList.add('show'), 600);
  setTimeout(() => document.getElementById('title').classList.remove('show'), 7000);

  // ---- メインループ ----
  const clock = new THREE.Clock();
  let t = 0, fpsAvg = 60;
  const fixedDt = params.has('fixed') ? 1 / 30 : 0;   // 撮影用の固定時間刻み
  renderer.setAnimationLoop(() => {
    const raw = clock.getDelta();
    const dt = fixedDt || Math.min(raw, 1 / 20);
    t += dt;
    fpsAvg += ((1 / Math.max(raw, 1e-3)) - fpsAvg) * 0.05;

    uniforms.uTime.value = t;
    post.grade.uniforms.uTime.value = t;
    if (lighting.update(dt)) env.refreshEnv();
    if (!frozen) {
      view.update(dt);
      food.update(dt, t);
      fish.update(dt, t, food);
      shrimp.update(dt, t);
    } else {
      for (const m of fish.meshes) { for (const a of m.school.fish) a.phase += dt * 6; m.school.writeMatrices(m.mesh, m.swim); }
    }
    env.update(view.camera);
    quality.tick(raw);
    dev?.update(fpsAvg);

    post.render(dt);
  });
}

boot().catch(fail);
