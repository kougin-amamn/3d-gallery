import * as THREE from 'three';
import { loadJSON, loadShaders, requireKeys } from './core/loader.js';
import { createQuality } from './core/quality.js';
import { createCameraRig } from './core/camera.js';
import { createClock } from './core/clock.js';
import { createEphemeris } from './astro/ephemeris.js';
import { createScale, AU_KM } from './astro/scale.js';
import { msToDays } from './astro/time.js';
import { elementsAt, orbitPath, solveKepler, periodDays } from './astro/kepler.js';
import { moonGeocentric, galilean, circularMoon } from './astro/moons.js';
import { createBaker } from './bodies/bake.js';
import { createBodies, eclToScene } from './bodies/bodies.js';
import { createStars, createMilkyWay, createBelts, createOrbitLine, createDots } from './sky/sky.js';
import { createComposer } from './post/composer.js';
import { createHud, createLabels } from './ui/hud.js';

const SHADERS = [
  'noise', 'shadow', 'scale', 'bake_vert', 'bake_frag', 'body_vert', 'planet_frag', 'earth_frag', 'clouds_frag',
  'atmosphere_frag', 'sun_frag', 'corona_vert', 'corona_frag', 'rings_vert', 'rings_frag', 'stars_vert', 'stars_frag',
  'sky_vert', 'milkyway_frag', 'belt_vert', 'belt_frag', 'orbit_vert', 'orbit_frag', 'dots_vert', 'dots_frag',
  'post_vert', 'grade_frag',
];
const params = new URLSearchParams(location.search);
const SUN_LIGHT = 2.2; // 地球の位置での太陽光の強さ(HDR)
const setLoading = (t) => { document.getElementById('loading-text').textContent = t; };
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

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
  const [data, starData, theme, qualityCfg, shaders] = await Promise.all([
    loadJSON('./data/bodies.json'),
    loadJSON('./data/stars.json'),
    loadJSON('./data/theme.json'),
    loadJSON('./data/quality.json'),
    loadShaders('./src/shaders', SHADERS),
  ]);
  requireKeys(data, 'bodies.json', ['display.radiusK', 'display.distanceK', 'display.distanceP', 'bodies', 'belts']);
  data.bodies.forEach((b) => requireKeys(b, `bodies.json の「${b.id}」`, ['id', 'name', 'type', 'radiusKm', 'info']));
  requireKeys(qualityCfg, 'quality.json', ['tiers.low', 'tiers.medium', 'tiers.high']);
  for (const [k, v] of Object.entries(theme.colors)) document.documentElement.style.setProperty(`--${k}`, v);

  // ---- 描画の土台 ----
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(theme.colors.space);

  const shared = {
    uTime: { value: 0 },
    uSunPos: { value: new THREE.Vector3() },
    uSunRadius: { value: 1 },
    uPixel: { value: 1 },
    uDays: { value: 0 },
    uScale: { value: new THREE.Vector4() },
    uFill: { value: data.display.nightFill ?? 0.06 },
  };

  let quality = null;
  let tierSettings = qualityCfg.tiers.high;
  // 画質の初期値(地表の解像度など、起動時にしか変えられない設定に使う)
  quality = createQuality(qualityCfg, (t) => applyQuality(t), params.get('quality'));
  tierSettings = qualityCfg.tiers[quality.tier];

  const clock = createClock(params.get('date') ? Date.parse(params.get('date')) : Date.now());
  const eph = createEphemeris(data.bodies);
  const scale = createScale(data.display);
  let scaleTarget = params.get('scale') === 'real' ? 1 : 0;
  let scaleFrom = scaleTarget, scaleAnim = 1;
  scale.t = scaleTarget;
  const defs = Object.fromEntries(data.bodies.map((b) => [b.id, b]));

  setLoading('地表を描いています');
  await nextFrame();
  const baker = createBaker(renderer, shaders);
  const bodies = createBodies(scene, data, { shaders, baker, shared, quality: tierSettings });
  baker.dispose();

  const stars = createStars(scene, starData, shaders, shared);
  const milky = createMilkyWay(scene, shaders);
  const belts = createBelts(scene, data.belts, shaders, shared);
  const color = (id) => theme.orbitColors[id] || theme.orbitColors.default;
  const planetDefs = data.bodies.filter((b) => b.orbit);
  const moonDefs = data.bodies.filter((b) => b.moon);
  const orbits = {};
  for (const d of planetDefs) orbits[d.id] = createOrbitLine(scene, shaders, 360, color(d.id));
  for (const d of moonDefs) orbits[d.id] = createOrbitLine(scene, shaders, 160, color(d.id) || color('moon'));
  const dotDefs = data.bodies.filter((b) => b.id !== 'sun');
  const dots = createDots(scene, dotDefs.length, shaders, shared);
  const dotColor = Object.fromEntries(dotDefs.map((d) => [d.id, new THREE.Color(theme.dotColors[d.id] || '#D8E1EA')]));

  // ---- 表示座標 ----
  const disp = {};       // 表示座標(描画座標系、倍精度)
  const rad = {};        // 表示半径
  const tmp = new THREE.Vector3();
  function computeDisplay() {
    for (const d of data.bodies) {
      const s = eph.state[d.id];
      rad[d.id] = scale.radius(d);
      if (d.id === 'sun') { disp.sun = [0, 0, 0]; continue; }
      if (d.moon) {
        const p = disp[d.parent];
        const m = scale.mapMoon(s.local, defs[d.parent]);
        eclToScene(m, tmp);
        disp[d.id] = [p[0] + tmp.x, p[1] + tmp.y, p[2] + tmp.z];
      } else {
        eclToScene(scale.mapHelio(s.pos), tmp);
        disp[d.id] = [tmp.x, tmp.y, tmp.z];
      }
    }
  }

  const world = {
    pos: (id) => disp[id],
    radius: (id) => rad[id],
    systemRadius: () => scale.helioDistance(35 * AU_KM),
    atmosphereHeight: (id) => defs[id]?.atmosphere?.height ?? 0,
    hasRings: (id) => !!defs[id]?.rings,
  };
  const rig = createCameraRig(canvas, world);
  const cam = rig.camera;

  const relCache = {};
  const rel = (id) => {
    const v = relCache[id] || (relCache[id] = new THREE.Vector3());
    const p = disp[id];
    return v.set(p[0] - rig.pos[0], p[1] - rig.pos[1], p[2] - rig.pos[2]);
  };
  let falloff = 1.2;
  const lightCache = {};
  const lightAt = (id) => {
    const p = eph.state[id].pos;
    const rAU = Math.max(Math.hypot(p[0], p[1], p[2]) / AU_KM, 0.05);
    const k = SUN_LIGHT / Math.pow(rAU, falloff);
    return (lightCache[id] || (lightCache[id] = new THREE.Vector3())).set(1.0 * k, 0.97 * k, 0.92 * k);
  };
  const view = { rel, radius: (id) => rad[id], frame: (id) => eph.state[id].frame, lightAt, sunGlare: 1, days: 0 };

  // ---- ポストプロセス ----
  const post = createComposer(renderer, scene, cam, shaders);

  // ---- 画質 ----
  let pixelRatio = 1;
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    pixelRatio = Math.min(window.devicePixelRatio || 1, tierSettings.pixelRatioMax);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(w, h, false);
    rig.resize(w, h);
    post.setSize(w, h, pixelRatio);
    shared.uPixel.value = pixelRatio;
  }
  function applyQuality(t) {
    tierSettings = t;
    post.bloom.enabled = t.bloom;
    post.setSamples(t.msaa);
    post.grade.uniforms.uFlare.value = t.flare;
    stars.uniforms.uMagLimit.value = t.starMagLimit;
    for (const b of belts) b.setDensity(t.belts);
    bodies.setEarthHiRes(t.earthTexture > 0);
    resize();
  }

  // ---- UI ----
  let showOrbits = true, showLabels = true;
  const goTo = (id) => {
    rig.flyTo(id);
    hud.setFocus(id);
    rig.markInput();
  };
  const hud = createHud({
    bodies: data.bodies, theme, clock,
    onSelect: goTo,
    onScale: (v) => setScale(v),
    onToggle: (key, on) => {
      if (key === 'orbits') showOrbits = on;
      if (key === 'labels') { showLabels = on; labels.setVisible(on); }
    },
    onQuality: (m) => quality.setMode(m),
    onDate: (ms) => clock.set(ms),
  });
  const labels = createLabels(document.getElementById('labels'), goTo);
  for (const d of data.bodies) labels.add(d.id, d.name, d.type === 'moon' ? 'moon' : 'body');
  for (const s of stars.named) labels.add(`star:${s.name}`, s.name, 'star');
  function setScale(v, instant = false) {
    scaleFrom = scale.t;
    scaleTarget = v;
    scaleAnim = instant ? 1 : 0;
    if (instant) scale.t = v;
    hud.setScale(v);
  }
  hud.setScale(scaleTarget);
  quality.onChange((mode, tier) => hud.setQuality(mode, tier));
  quality.start();
  hud.setQuality(quality.mode, quality.tier);
  window.addEventListener('resize', resize);

  // 画面上の天体をクリックすると移動する
  const screen = {};
  rig.onPick((x, y) => {
    let best = null, bestScore = Infinity;
    for (const d of data.bodies) {
      const s = screen[d.id];
      if (!s || !s.front) continue;
      const dist = Math.hypot(s.x - x, s.y - y);
      const reach = Math.max(s.r, 14);
      if (dist > reach) continue;
      const score = dist - s.r * 0.5 + (s.depth * 1e-12);
      if (score < bestScore) { bestScore = score; best = d.id; }
    }
    if (best) goTo(best);
  });

  // ---- 初期位置 ----
  view.days = msToDays(clock.ms);
  eph.update(view.days);
  computeDisplay();
  const startFocus = params.get('focus') && (defs[params.get('focus')] || params.get('focus') === 'system') ? params.get('focus') : 'system';
  rig.update(0);
  if (startFocus !== 'system') rig.flyTo(startFocus, { instant: true });
  hud.setFocus(startFocus);

  // 開発用の調整パネル
  const tune = { exposure: 0.95, bloom: 0.55, cityLights: 1.6, sun: 14, milkyway: 0.03, nightFill: shared.uFill.value };
  let dev = null;
  if (params.has('dev')) {
    const { default: GUI } = await import('three/addons/libs/lil-gui.module.min.js');
    const gui = new GUI({ title: '調整(開発用)' });
    gui.add(tune, 'exposure', 0.2, 3, 0.01).name('露出');
    gui.add(tune, 'bloom', 0, 2, 0.01).name('ブルーム');
    gui.add(tune, 'cityLights', 0, 5, 0.01).name('都市の明かり');
    gui.add(tune, 'sun', 1, 80, 0.1).name('太陽の明るさ');
    gui.add(tune, 'milkyway', 0, 0.3, 0.001).name('天の川');
    gui.add(tune, 'nightFill', 0, 0.3, 0.001).name('夜側の明るさ');
    const stat = { fps: 0 };
    gui.add(stat, 'fps').listen().disable();
    dev = stat;
  }

  // テストとスクリーンショット用
  window.__solar = {
    renderer, scene, rig, clock, eph, disp, rad, quality,
    goto: (id, instant = true) => { rig.flyTo(id, { instant, force: true }); hud.setFocus(id); snapAdapt = instant; },
    setTime: (iso) => clock.set(Date.parse(iso)),
    setScale: (v) => setScale(v, true),
    view: (yaw, pitch, k) => { if (yaw != null) rig.state.yaw = yaw; if (pitch != null) rig.state.pitch = pitch; if (k != null) rig.state.k = k; },
  };

  renderer.compile(scene, cam);
  document.getElementById('loading').classList.add('done');

  // ---- メインループ ----
  const timer = new THREE.Clock();
  let snapAdapt = true;
  let frameCount = 0;
  let moonOrbitTimer = 0;
  let t = 0, adapt = 1, infoTimer = 0, orbitTimer = 0, lastScaleT = -1, fpsAvg = 60;
  const fwd = new THREE.Vector3();
  const sunNdc = new THREE.Vector3();
  const halfH = () => window.innerHeight / 2;

  renderer.setAnimationLoop(() => {
    const raw = timer.getDelta();
    const dt = Math.min(raw, 1 / 15);
    t += dt;
    fpsAvg += (1 / Math.max(raw, 1e-3) - fpsAvg) * 0.05;
    clock.tick(dt);
    const days = msToDays(clock.ms);
    view.days = days;
    shared.uTime.value = t;
    shared.uDays.value = days;

    // スケールの切り替え(2.5秒で補間)
    if (scaleAnim < 1) {
      scaleAnim = Math.min(1, scaleAnim + dt / 2.5);
      const e = scaleAnim * scaleAnim * (3 - 2 * scaleAnim);
      scale.t = scaleFrom + (scaleTarget - scaleFrom) * e;
    }
    falloff = 1.2 + 0.8 * scale.t;
    const su = scale.uniforms();
    shared.uScale.value.set(su.k, su.p, su.t, su.au);

    eph.update(days);
    computeDisplay();
    rig.update(Math.min(raw, 0.1)); // 飛行の所要時間は実時間で保つ

    shared.uSunPos.value.copy(rel('sun'));
    shared.uSunRadius.value = rad.sun;

    // ---- 露出: 注目している天体の明るさに目を慣らす。太陽を見ると絞る ----
    const focus = rig.focus;
    let rFocus = 1;
    if (focus !== 'system' && focus !== 'sun') {
      const p = eph.state[focus].pos;
      rFocus = Math.max(Math.hypot(p[0], p[1], p[2]) / AU_KM, 0.39);
    }
    cam.getWorldDirection(fwd);
    const sunRel = shared.uSunPos.value;
    const sunDist = sunRel.length();
    const sunAng = Math.asin(Math.min(1, rad.sun / sunDist));
    const toward = Math.max(0, fwd.dot(sunRel) / sunDist);
    const sunInView = Math.pow(toward, 6) * Math.min(1, sunAng / 0.08 + 0.15);
    let target = Math.pow(rFocus, falloff * 0.8) / (1 + sunInView * 2.2);
    // 太陽に寄ったときは大きく絞り、表面の粒状斑が見えるようにする
    if (focus === 'sun') target = THREE.MathUtils.lerp(0.085, target, THREE.MathUtils.clamp((rig.state.k - 3) / 60, 0, 1));
    // 目の慣れは実時間で進める(フレームが遅くても同じ速さ)
    adapt = snapAdapt ? target : adapt + (target - adapt) * Math.min(1, Math.min(raw, 0.25) * 1.6);
    snapAdapt = false;
    renderer.toneMappingExposure = tune.exposure * adapt;
    const starGain = Math.pow(adapt, -0.6);
    stars.uniforms.uExposure.value = starGain;
    milky.uniforms.uExposure.value = Math.pow(adapt, -0.9);
    milky.uniforms.uStrength.value = tune.milkyway;
    for (const b of belts) b.uniforms.uExposure.value = 1;
    post.bloom.strength = tune.bloom;
    // ブルームは露出前の値に掛かるので、しきい値を露出に合わせる
    post.bloom.threshold = 1.0 / Math.max(renderer.toneMappingExposure, 1e-3);
    bodies.byId.earth.uniforms.uCityLights.value = tune.cityLights;
    bodies.byId.sun.uniforms.uIntensity.value = tune.sun;
    shared.uFill.value = tune.nightFill;
    view.sunGlare = 0.6 + 0.6 * Math.min(1, sunDist / (rad.sun * 400));

    view.sunIntensity = tune.sun;
    view.sunPx = screen.sun ? screen.sun.r : 0;
    bodies.update(view);

    // ---- 画面上の位置(ラベル・光点・クリック判定) ----
    const H = halfH(), W = window.innerWidth / 2;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    for (const d of data.bodies) {
      const p = rel(d.id);
      const dist = p.length();
      tmp.copy(p).project(cam);
      const front = tmp.z < 1 && fwd.dot(p) > 0;
      const s = screen[d.id] || (screen[d.id] = {});
      s.x = (tmp.x * 0.5 + 0.5) * window.innerWidth;
      s.y = (-tmp.y * 0.5 + 0.5) * window.innerHeight;
      s.front = front;
      s.depth = dist;
      s.r = (rad[d.id] / Math.max(dist, 1e-9)) / tanHalf * H;
    }
    // 他の天体の円盤の後ろに隠れているか
    const hidden = (id, labelX) => {
      const s = screen[id];
      for (const d of data.bodies) {
        if (d.id === id) continue;
        const o = screen[d.id];
        if (!o.front || o.r < 3 || o.depth > s.depth) continue;
        if (Math.hypot(o.x - s.x, o.y - s.y) < o.r) return true;
        if (labelX !== undefined && Math.hypot(o.x - labelX - 20, o.y - s.y) < o.r) return true;
      }
      return false;
    };

    // 光点
    const dp = dots.geo.attributes.position, dc = dots.geo.attributes.aColor, ds = dots.geo.attributes.aSize;
    dotDefs.forEach((d, i) => {
      const p = rel(d.id);
      dp.setXYZ(i, p.x, p.y, p.z);
      const s = screen[d.id];
      let a = THREE.MathUtils.clamp((3.5 - s.r) / 2.5, 0, 1);
      if (d.moon) {
        const ps = screen[d.parent];
        a *= THREE.MathUtils.clamp((Math.hypot(ps.x - s.x, ps.y - s.y) - ps.r - 4) / 10, 0, 1);
      }
      const L = lightAt(d.id).x / SUN_LIGHT;
      const b = a * Math.min(1, 0.35 + Math.pow(L * adapt, 0.5) * 0.9);
      const c = dotColor[d.id];
      dc.setXYZ(i, c.r * b, c.g * b, c.b * b);
      ds.setX(i, d.moon ? 2.6 : 3.4);
    });
    dp.needsUpdate = dc.needsUpdate = ds.needsUpdate = true;

    // 軌道線
    orbitTimer -= dt;
    const scaleChanged = Math.abs(scale.t - lastScaleT) > 1e-4;
    if (scaleChanged || orbitTimer <= 0) {
      orbitTimer = 0.5;
      lastScaleT = scale.t;
      for (const d of planetDefs) {
        const el = elementsAt(d.orbit, days);
        const pts = orbitPath(el, 360);
        const attr = orbits[d.id].geo.attributes.position;
        pts.forEach((q, i) => {
          eclToScene(scale.mapHelio([q[0] * AU_KM, q[1] * AU_KM, q[2] * AU_KM]), tmp);
          attr.setXYZ(i, tmp.x, tmp.y, tmp.z);
        });
        attr.needsUpdate = true;
        orbits[d.id].el = el;
      }
    }
    for (const d of planetDefs) {
      const o = orbits[d.id];
      const el = elementsAt(d.orbit, days);
      o.uniforms.uPhase.value = (((solveKepler(el.M, el.e) % 360) + 360) % 360) / 360;
      o.line.position.copy(rel('sun'));
      const s = screen[d.id];
      const near = THREE.MathUtils.clamp((s.r - 6) / 30, 0, 1);
      o.uniforms.uOpacity.value = showOrbits ? (focus === 'system' ? theme.orbitOpacity.system : theme.orbitOpacity.focused) * (1 - near * 0.85) : 0;
      o.line.visible = showOrbits;
    }
    // 衛星の軌道: 1周期ぶんの実際の軌跡を描く(形の計算は0.2秒ごと)
    moonOrbitTimer -= Math.min(raw, 0.25);
    // 時間を速く進めているときは衛星が大きく動くので毎フレーム作り直す
    const rebuildMoons = moonOrbitTimer <= 0 || scaleChanged || Math.abs(clock.speed) > 21600;
    if (rebuildMoons) moonOrbitTimer = 0.2;
    for (const d of moonDefs) {
      const o = orbits[d.id];
      const parent = defs[d.parent];
      const pr = rel(d.parent).length() / rad[d.parent];
      const visible = showOrbits && pr < 260;
      o.line.visible = visible;
      if (!visible) continue;
      o.line.position.copy(rel(d.parent));
      const nearMoon0 = THREE.MathUtils.clamp((screen[d.id].r - 6) / 30, 0, 1);
      o.uniforms.uOpacity.value = theme.orbitOpacity.moons * THREE.MathUtils.clamp((260 - pr) / 120, 0, 1) * (1 - nearMoon0 * 0.9);
      if (!rebuildMoons && o.built) continue;
      o.built = true;
      const attr = o.geo.attributes.position;
      const N = attr.count - 1;
      const P = d.moon.periodDays;
      const jup = eph.state.jupiter.pos.map((v) => v / AU_KM);
      for (let i = 0; i <= N; i++) {
        const dd = days - P * (1 - i / N);
        let loc;
        if (d.moon.model === 'lunar') loc = moonGeocentric(dd);
        else if (d.moon.model === 'galilean') loc = galilean(dd, jup, d.moon.index, d.moon.aKm);
        else loc = circularMoon(dd, d.moon, eph.state[d.parent].frame.pole);
        eclToScene(scale.mapMoon(loc, parent), tmp);
        attr.setXYZ(i, tmp.x, tmp.y, tmp.z);
      }
      attr.needsUpdate = true;
      o.uniforms.uPhase.value = 0.9999;
    }

    // ---- ラベル ----
    if (showLabels) {
      const placements = [];
      for (const d of data.bodies) {
        const s = screen[d.id];
        const lx = s.x + Math.max(s.r, 3) + 4;
        let visible = s.front && s.r < H * 0.55 && !hidden(d.id, lx);
        if (d.moon) {
          const ps = screen[d.parent];
          visible = visible && Math.hypot(ps.x - s.x, ps.y - s.y) > ps.r + 16;
        }
        const pri = d.id === focus ? 100 : d.type === 'planet' || d.type === 'star' ? 50 + Math.log(d.radiusKm) : d.type === 'dwarf' ? 30 : 20;
        placements.push({ id: d.id, x: lx, y: s.y, visible, priority: pri });
      }
      for (const st of stars.named) {
        tmp.copy(st.dir).project(cam);
        const front = tmp.z < 1 && fwd.dot(st.dir) > 0;
        const sx = (tmp.x * 0.5 + 0.5) * window.innerWidth, sy = (-tmp.y * 0.5 + 0.5) * window.innerHeight;
        // 天体の円盤に重なる星の名前は出さない
        const behind = data.bodies.some((d) => { const o = screen[d.id]; return o.front && o.r > 2 && Math.hypot(o.x - sx, o.y - sy) < o.r + 30; });
        placements.push({
          id: `star:${st.name}`, x: sx + 5, y: sy,
          visible: front && !behind && Math.abs(tmp.x) < 1 && Math.abs(tmp.y) < 1, priority: 1 - st.mag * 0.1,
        });
      }
      labels.layout(placements);
    }

    // ---- レンズフレア ----
    sunNdc.copy(sunRel).project(cam);
    const sunVisible = fwd.dot(sunRel) > 0 && Math.abs(sunNdc.x) < 1.2 && Math.abs(sunNdc.y) < 1.2 && !hidden('sun');
    const g = post.grade.uniforms;
    // フレアは太陽が小さく見えるときだけ(大きく写っているときは不自然になる)
    const flareSize = THREE.MathUtils.clamp((70 - screen.sun.r) / 50, 0, 1);
    g.uSun.value.set(sunNdc.x * 0.5 + 0.5, sunNdc.y * 0.5 + 0.5, sunVisible ? Math.min(1, 1.3 - Math.max(Math.abs(sunNdc.x), Math.abs(sunNdc.y))) * flareSize : 0);
    g.uTime.value = t;

    // ---- 情報パネル(0.25秒ごと) ----
    infoTimer -= dt;
    if (infoTimer <= 0) {
      infoTimer = 0.25;
      hud.updateTime(clock.ms);
      hud.showInfo(focus, factsFor(focus));
    }

    quality.tick(raw);
    if (dev) dev.fps = Math.round(fpsAvg);
    // シェーダーの成否は実際に描いた後で分かるので、数フレーム後に確かめる
    frameCount++;
    if (frameCount === 3 || frameCount === 90) replaceBrokenMaterials(renderer, scene);
    post.render(dt);
    void W;
  });

  function factsFor(id) {
    const f = hud.facts;
    const state = eph.state;
    const rows = [];
    const add = (k, v) => rows.push(`<dt>${k}</dt><dd>${v}</dd>`);
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const d = defs[id];
    if (!d) {
      const e = state.earth.pos;
      add('日時', new Date(clock.ms).toLocaleString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }));
      add('地球と太陽', f.distText(Math.hypot(...e)));
      add('海王星まで', `光で${f.lightTime(dist(state.neptune.pos, e))}`);
      add('表示', scaleTarget ? '実寸' : '見やすい');
      return rows.join('');
    }
    if (d.id !== 'sun' && !d.moon) add('太陽から', f.distText(Math.hypot(...state[id].pos)));
    if (d.moon) add(`${defs[d.parent].name}から`, f.distText(Math.hypot(...state[id].local)));
    if (id !== 'earth') {
      const km = dist(state[id].pos, state.earth.pos);
      add('地球から', f.distText(km));
      add('光の到達', f.lightTime(km));
    } else {
      add('光の到達', `太陽から${f.lightTime(Math.hypot(...state.earth.pos))}`);
    }
    add('直径', `${f.fmt(d.radiusKm * 2)}<small>km</small>`);
    if (d.orbit) add('公転周期', f.periodText(periodDays(d.orbit)));
    if (d.moon) add('公転周期', f.periodText(d.moon.periodDays));
    add('自転周期', d.info.rotationText);
    add('温度', d.info.temp);
    return rows.join('');
  }
}

// シェーダーがこの端末でコンパイルできなかった場合、何も描かれず黒く抜けてしまう。
// その天体だけ単純な色の材質に置き換えて、少なくとも見えるようにする。
function replaceBrokenMaterials(renderer, scene) {
  const broken = [];
  scene.traverse((o) => {
    if (!o.material || !o.material.isShaderMaterial) return;
    const program = renderer.properties.get(o.material).currentProgram;
    if (program && program.diagnostics && program.diagnostics.runnable === false) broken.push(o);
  });
  for (const o of broken) {
    const isSun = o.parent?.name === 'sun';
    console.warn(`シェーダーを読み込めなかったため簡易表示に切り替えます: ${o.parent?.name || o.type}`);
    o.material = isSun
      ? new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.62, 0.25).multiplyScalar(6) })
      : new THREE.MeshBasicMaterial({ color: 0x404040, transparent: true, opacity: 0 });
  }
  return broken.length;
}

boot().catch(fail);
