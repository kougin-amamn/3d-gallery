import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { loadJSON } from './core/loader.js';
import { createQuality } from './core/quality.js';
import { createStudio } from './look/studio.js';
import { createMaterials } from './look/materials.js';
import { buildMovement } from './parts/movement.js';
import { buildCase, buildDial, buildStrap } from './parts/watch.js';
import { trainAngles, moonAgeDays } from './mech/train.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

async function main() {
  const [cfg, matCfg, light, viewCfg, partCfg, W] = await Promise.all([
    loadJSON('./data/movement.json'),
    loadJSON('./data/materials.json'),
    loadJSON('./data/lighting.json'),
    loadJSON('./data/views.json'),
    loadJSON('./data/parts.json'),
    loadJSON('./data/watch.json'),
  ]);
  // 文字盤の印刷に使う書体を待つ(届かなければ代わりの書体で描く)
  try {
    await Promise.race([document.fonts.load('500 64px "Cormorant Garamond"'), new Promise((r) => setTimeout(r, 2500))]);
  } catch (e) { /* 代わりの書体で続ける */ }

  // ---------- 描画の準備 ----------
  const canvas = $('view');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = light.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  let shaderFailed = false;
  renderer.debug.onShaderError = (gl, program, vs, fs) => {
    shaderFailed = true;
    console.warn('シェーダーを組み立てられませんでした。簡易な質感に切り替えます', gl.getProgramInfoLog(program), gl.getShaderInfoLog(fs));
  };

  const scene = new THREE.Scene();
  const studio = createStudio(renderer, scene, light);
  const M = createMaterials(matCfg);
  const movement = buildMovement(cfg, M);

  // 腕時計の組み立て: watchRoot(持ち上げ) → flip(表裏の回転) → ムーブメントとケース
  // 表裏の回転軸は 12時-6時を結ぶ線(バネ棒の位置)。ベルトは回らない側に置く
  const watchRoot = new THREE.Group();
  const flip = new THREE.Group();
  watchRoot.add(flip);
  flip.add(movement.root);
  movement.root.position.y = -W.pivotZ;
  const watchCase = buildCase(W, M);
  const dial = buildDial(W, M);
  movement.frame.add(watchCase.group, dial.group);
  const strap = buildStrap(W, M);
  watchRoot.add(strap);
  scene.add(watchRoot);
  const dress = [watchCase.group, dial.group, strap];
  scene.fog = new THREE.Fog(light.background, 320, 620);

  // 下に敷くベルベット
  const velvet = new THREE.Mesh(new THREE.CircleGeometry(700, 96), M.velvet);
  velvet.rotation.x = -Math.PI / 2;
  velvet.position.y = -W.restDrop;
  velvet.receiveShadow = true;
  scene.add(velvet);
  studio.key.target.position.set(0, 0, 0);

  const camera = new THREE.PerspectiveCamera(28, 1, 0.3, 1600);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 4;
  controls.maxDistance = 260;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.zoomSpeed = 0.8;

  // ---------- 後処理 ----------
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.22, 0.5, 0.92);
  const bokeh = new BokehPass(scene, camera, { focus: 15, aperture: 0.0018, maxblur: 0.006 });
  const output = new OutputPass();
  // 計算の破綻(NaN)が1画素でもあると、ぼかしで画面全体に広がって黒くなるので、ここで取り除く
  const clean = new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0); gl_FragColor = min(c, vec4(48.0)); }',
  });
  composer.addPass(renderPass);
  composer.addPass(clean);
  composer.addPass(bokeh);
  composer.addPass(bloom);
  composer.addPass(output);
  // ガラスは被写界深度の奥行きに入れない(ガラスの向こうにピントを合わせるため)
  const bokehRender = bokeh.render.bind(bokeh);
  bokeh.render = (...a) => {
    for (const gl of watchCase.glass) gl.visible = false;
    bokehRender(...a);
    for (const gl of watchCase.glass) gl.visible = true;
  };

  const quality = createQuality(viewCfg.quality, (tier) => {
    renderer.setPixelRatio(Math.min(devicePixelRatio, tier.pixelRatio));
    renderer.shadowMap.enabled = tier.shadows;
    studio.key.castShadow = tier.shadows;
    bokeh.enabled = tier.dof;
    bloom.enabled = tier.bloom;
    // ルビーの透け感は描画を1回余分に行うので、高画質のときだけ使う
    M.ruby.transmission = tier.transmission ? matCfg.ruby.transmission : 0;
    M.ruby.roughness = tier.transmission ? matCfg.ruby.roughness : 0.18;
    scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => (m.needsUpdate = true)); });
    resize();
  }, params.get('q') || undefined);

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    camera.aspect = w / h;
    // 縦長の画面では少し引いて全体を収める
    camera.fov = w / h < 0.8 ? 40 : 28;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);

  // ---------- 分解の状態(視点より先に用意する) ----------
  let explodeTarget = params.has('explode') ? 1 : 0;
  let explode = explodeTarget;
  const explodeBtn = $('explode');

  // ---------- 視点 ----------
  const views = Object.fromEntries(viewCfg.views.map((v) => [v.id, v]));
  let fly = null;
  let currentView = null;
  // 見る面の座標 → ワールド座標(その面を上に向けて置いたとき)
  const viewWorld = (side, x, y, h) => new THREE.Vector3(x, side === 'front' ? h + W.pivotZ : h - W.pivotZ, -y);
  // 表裏: 0 = 裏が上、1 = 表が上
  let side = 'front';
  let flipT = 1, flipTarget = 1;
  function setSide(s) {
    side = s;
    flipTarget = s === 'front' ? 1 : 0;
    for (const b of document.querySelectorAll('#sides button')) b.setAttribute('aria-pressed', String(b.dataset.side === s));
    for (const b of document.querySelectorAll('#views button')) b.hidden = views[b.dataset.id].side !== s;
  }
  function setView(id, instant = false) {
    const v = views[id];
    if (!v) return;
    if (v.side === 'front' && explodeTarget) { explodeTarget = 0; explodeBtn.setAttribute('aria-pressed', 'false'); }
    currentView = id;
    setSide(v.side || 'back');
    if (instant) { flipT = flipTarget; applyFlip(); }
    const toT = viewWorld(v.side, ...v.target);
    const toC = viewWorld(v.side, ...v.camera);
    if (instant) {
      controls.target.copy(toT);
      camera.position.copy(toC);
      fly = null;
    } else {
      fly = { t: 0, fromT: controls.target.clone(), fromC: camera.position.clone(), toT, toC };
    }
    $('info-title').textContent = v.title;
    $('info-text').textContent = v.text;
    for (const b of document.querySelectorAll('#views button')) b.setAttribute('aria-pressed', String(b.dataset.id === id));
  }
  const viewBar = $('views');
  for (const v of viewCfg.views) {
    if (v.hidden) continue;
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.id = v.id;
    b.textContent = v.label;
    b.addEventListener('click', () => setView(v.id));
    viewBar.append(b);
  }
  controls.addEventListener('start', () => { fly = null; });
  for (const [s, label, first] of [['front', '表', 'dial'], ['back', '裏', 'caseback']]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.side = s;
    b.textContent = label;
    b.addEventListener('click', () => setView(first));
    $('sides').append(b);
  }
  function applyFlip() {
    const k = flipT * flipT * (3 - 2 * flipT);
    flip.rotation.z = Math.PI * k;
    // 回すときはケースが布に当たらないよう、いったん持ち上げる
    watchRoot.position.y = 22 * Math.sin(Math.PI * k);
  }

  // ---------- 時間 ----------
  // 時計の中の時刻(午前0時からの秒)。実速のときは実際の時刻に合わせる
  const nowSeconds = () => {
    const d = new Date();
    return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000;
  };
  let simT = params.has('t') ? Number(params.get('t')) : nowSeconds();
  let speed = 1;
  let paused = params.has('pause');
  const speedBar = $('speeds');
  function setSpeed(id) {
    const s = viewCfg.speeds.find((x) => x.id === id);
    if (!s) return;
    speed = s.value;
    if (speed === 1 && !params.has('t')) simT = nowSeconds();
    for (const b of speedBar.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.id === id));
  }
  for (const s of viewCfg.speeds) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.id = s.id;
    b.textContent = s.label;
    b.addEventListener('click', () => setSpeed(s.id));
    speedBar.append(b);
  }
  setSpeed('1');

  const clockText = $('time');
  let lastText = '';
  function showTime(t) {
    const s = Math.floor(((t % 86400) + 86400) % 86400);
    const txt = `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    if (txt !== lastText) { clockText.textContent = txt; lastText = txt; }
  }

  // ---------- 分解表示 ----------
  let viewBeforeExplode = null;
  // 分解はケースを外し、裏側を上にして行う
  function setExploded(on) {
    explodeTarget = on ? 1 : 0;
    explodeBtn.setAttribute('aria-pressed', String(on));
    if (on) { viewBeforeExplode = currentView; setView('exploded'); }
    else setView(viewBeforeExplode && viewBeforeExplode !== 'exploded' ? viewBeforeExplode : 'overview');
  }
  explodeBtn.addEventListener('click', () => setExploded(explodeTarget === 0));
  explodeBtn.setAttribute('aria-pressed', String(explodeTarget === 1));

  // ---------- 部品の名札と、クリックで説明 ----------
  const parts = partCfg.parts;
  const labelLayer = $('labels');
  const labels = [];
  for (const [id, p] of Object.entries(parts)) {
    if (!p.at) continue;
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'label';
    el.innerHTML = `<span class="ja">${p.name}</span><span class="en">${p.en}</span>`;
    el.addEventListener('click', () => showPart(id));
    labelLayer.append(el);
    labels.push({ id, p, el, v: new THREE.Vector3() });
  }
  function showPart(id) {
    const p = parts[id];
    if (!p) return;
    $('info-title').textContent = `${p.name}  ${p.en}`;
    $('info-text').textContent = p.text;
    for (const l of labels) l.el.classList.toggle('on', l.id === id);
  }
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const shown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
    const hit = ray.intersectObject(watchRoot, true).find((h) => shown(h.object));
    let o = hit && hit.object;
    while (o && !o.userData.part) o = o.parent;
    if (o) showPart(o.userData.part);
  });

  addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, textarea')) return;
    if (e.key === '1') setView('escapement');
    else if (e.key === '2') setView('balance');
    else if (e.key === '3') setView('winding');
    else if (e.key === '4') setView('overview');
    else if (e.key === 'e' || e.key === 'E') setExploded(explodeTarget === 0);
    else if (e.key === 'f' || e.key === 'F') setView(side === 'front' ? 'caseback' : 'dial');
    else if (e.key === '5') setView('dial');
    else if (e.key === '6') setView('daynight');
    else if (e.key === '7') setView('seconds');
    else if (e.key === ' ') { paused = !paused; e.preventDefault(); }
  });

  // ---------- ループ ----------
  if (explode) movement.setExplode(explode);
  setView(params.get('view') || (explode ? 'exploded' : viewCfg.default), true);
  resize();
  quality.start();

  const timer = new THREE.Clock();
  let frames = 0;
  let state = trainAngles(simT, cfg);
  const focusPoint = new THREE.Vector3();

  function frame() {
    const dt = Math.min(0.1, timer.getDelta());
    if (!paused) simT += dt * speed;
    state = trainAngles(simT, cfg);
    movement.update(state);
    // 月齢は「時計の中の日時」で: 実際の今 + 時計の時刻のずれ
    dial.update(state, moonAgeDays(Date.now() + (simT - nowSeconds()) * 1000, W.synodic), (((simT % 86400) + 86400) % 86400) / 86400);
    if (flipT !== flipTarget) {
      const step = dt / 1.6;
      flipT = flipTarget > flipT ? Math.min(flipTarget, flipT + step) : Math.max(flipTarget, flipT - step);
      applyFlip();
    }
    // 外装は分解しているあいだ外す
    const dressed = explodeTarget === 0 && explode === 0;
    if (dress[0].visible !== dressed) for (const d of dress) d.visible = dressed;
    showTime(simT);
    if (explode !== explodeTarget) {
      const step = dt / 2.2;
      explode = explodeTarget > explode ? Math.min(explodeTarget, explode + step) : Math.max(explodeTarget, explode - step);
      movement.setExplode(explode);
    }

    if (fly) {
      fly.t = Math.min(1, fly.t + dt / 1.4);
      const k = fly.t * fly.t * (3 - 2 * fly.t);
      controls.target.lerpVectors(fly.fromT, fly.toT, k);
      camera.position.lerpVectors(fly.fromC, fly.toC, k);
      if (fly.t >= 1) fly = null;
    }
    controls.update();

    // 名札: 分解したときだけ、部品の横に出す
    const showLabels = explode > 0.6;
    labelLayer.classList.toggle('show', showLabels);
    if (showLabels) {
      const w = innerWidth, h = innerHeight;
      for (const l of labels) {
        const layer = l.p.layer ? movement.layers[l.p.layer] : 0;
        l.v.set(l.p.at[0], l.p.at[1], l.p.at[2] + movement.explodeOffset(layer));
        movement.frame.localToWorld(l.v).project(camera);
        const vis = l.v.z < 1 && Math.abs(l.v.x) < 1.05 && Math.abs(l.v.y) < 1.05;
        l.el.style.visibility = vis ? 'visible' : 'hidden';
        if (vis) l.el.style.transform = `translate(${((l.v.x + 1) / 2) * w}px, ${((1 - l.v.y) / 2) * h}px)`;
      }
    }

    // ピントは注視点に合わせる
    focusPoint.copy(controls.target);
    const fd = camera.position.distanceTo(focusPoint);
    bokeh.uniforms.focus.value = fd;
    // 寄るほど背景がぼけ、引いたときは全体にピントが合うようにする
    bokeh.uniforms.aperture.value = 0.0018 * Math.min(1.2, (14 / fd) ** 2);

    if (shaderFailed && frames < 200) { simplifyMaterials(scene); shaderFailed = false; }
    composer.render(dt);
    quality.tick(dt);
    frames++;
    if (frames === 2) $('loading').classList.add('done');
  }
  renderer.setAnimationLoop(frame);

  // 確認用のつまみ(画面撮影や検証に使う)
  window.__clock = {
    get ready() { return frames > 2; },
    get state() { return state; },
    get view() { return currentView; },
    setTime(t) { simT = t; },
    pause(p = true) { paused = p; },
    setView: (id) => setView(id, true),
    setSpeed,
    setExploded,
    showPart,
    explodeNow(on = true) { explodeTarget = explode = on ? 1 : 0; movement.setExplode(explode); explodeBtn.setAttribute('aria-pressed', String(on)); },
    get side() { return side; },
    camera, controls, renderer, scene, movement, viewWorld,
  };
}

// 物理ベースの質感が使えない環境では、標準の質感に置き換える
function simplifyMaterials(scene) {
  const cache = new Map();
  scene.traverse((o) => {
    if (!o.material) return;
    const swap = (m) => {
      if (!m.isMeshPhysicalMaterial) return m;
      if (!cache.has(m)) cache.set(m, new THREE.MeshStandardMaterial({ color: m.color, metalness: m.metalness, roughness: m.roughness, transparent: m.transmission > 0, opacity: m.transmission > 0 ? 0.85 : 1 }));
      return cache.get(m);
    };
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
  });
}

main().catch((e) => {
  console.error(e);
  $('loading').classList.add('done');
  const box = $('error');
  box.hidden = false;
  box.querySelector('.error-message').textContent = e.message;
});
