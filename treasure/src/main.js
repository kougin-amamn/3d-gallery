import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildChest } from './chest/build.js';
import { createStudio, contactShadow, createMetalEnv } from './look/studio.js';
import { buildTreasure, launch, retract, stepTreasure } from './fx/treasure.js';
import { createGrounds } from './look/ground.js';

async function loadJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} を読み込めませんでした(${r.status})`);
  return r.json();
}

const $ = (s) => document.querySelector(s);

async function main() {
  const [cfg, scn, gcfg] = await Promise.all([loadJSON('./data/chest.json'), loadJSON('./data/scene.json'), loadJSON('./data/grounds.json')]);
  const params = new URLSearchParams(location.search);
  const tier = scn.quality[params.get('q') || (matchMedia('(pointer: coarse)').matches ? 'low' : 'high')] || scn.quality.high;

  // ---------- 描画の準備 ----------
  const canvas = $('#view');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, tier.pixelRatio));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = scn.exposure;
  renderer.shadowMap.enabled = tier.shadows;
  renderer.shadowMap.type = tier.shadowType === 'pcf' ? THREE.PCFSoftShadowMap : THREE.VSMShadowMap;
  // 影は何かが動いたときだけ描き直す(止まっている間は前の影をそのまま使う)
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(scn.camera.fov, 1, 0.05, 100);
  camera.position.set(...scn.camera.position);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(...scn.camera.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = scn.camera.minDistance;
  controls.maxDistance = scn.camera.maxDistance;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.enablePan = false;
  controls.autoRotate = false;

  const studio = createStudio(renderer, scene, scn);

  // ---------- 宝箱 ----------
  const built = buildChest(cfg);
  const { root, lid, lock, shackle, dims } = built;
  // 跳ねる動きは hop に、箱そのものは root に(つぶれの中心は箱の底)
  const hop = new THREE.Group();
  hop.add(root);
  scene.add(hop);
  root.traverse((o) => { if (o.isMesh && !o.material?.transparent) o.castShadow = o.castShadow && tier.shadows; });
  const shadowBlob = contactShadow(dims.W * 1.7, dims.D * 2.0);
  scene.add(shadowBlob);

  const tr = buildTreasure(cfg, dims, root);
  scene.add(tr.flyCoins, ...tr.flyGems);
  // ---------- 地面 ----------
  const grounds = createGrounds(scene, gcfg, studio);
  let padR = scn.pedestal.radius - 0.08;     // 金貨が転がってよい半径
  const STORE = 'treasure.ground';
  function setGround(id) {
    const def = grounds.set(id);
    padR = def.pedestal ? scn.pedestal.radius - 0.08 : grounds.radius * 0.62;
    renderer.shadowMap.needsUpdate = true;
    for (const b of document.querySelectorAll('#grounds button')) b.setAttribute('aria-pressed', String(b.dataset.id === def.id));
    try { localStorage.setItem(STORE, def.id); } catch (e) { /* 保存できなくても動く */ }
    return def.id;
  }
  {
    const nav = $('#grounds');
    for (const d of gcfg.grounds) {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.id = d.id; b.textContent = d.label;
      b.addEventListener('click', () => setGround(d.id));
      nav.appendChild(b);
    }
    let first = params.get('ground');
    if (!first) { try { first = localStorage.getItem(STORE); } catch (e) { first = null; } }
    setGround(first || gcfg.default);
  }

  // 金属には専用の暗いスタジオを映す(背景の明るいパステルを映すと金が平板な黄色になる)
  const metalEnv = createMetalEnv(renderer, scn.metalEnv);
  scene.traverse((o) => {
    for (const m of [].concat(o.material || [])) {
      if (m.metalness >= 0.99 || m.userData.metalEnv) { m.envMap = metalEnv; m.envMapIntensity = scn.metalEnv.intensity; m.needsUpdate = true; }
    }
  });

  // ---------- ポストプロセス ----------
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), scn.bloom.strength, scn.bloom.radius, scn.bloom.threshold);
  bloom.enabled = tier.bloom;
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    camera.aspect = w / h;
    // 縦長の画面では引いて、箱が切れないようにする
    const aspect = w / h;
    camera.fov = aspect < 1 ? Math.min(70, scn.camera.fov * Math.pow(1 / aspect, 0.85)) : scn.camera.fov;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  // ---------- 動き ----------
  const M = cfg.motion;
  const openRad = (cfg.lid.openDeg * Math.PI) / 180;
  const st = {
    open: false, lidA: 0, lidV: 0, target: 0,
    hopT: -1, nextHop: 1.2, burstAt: -1, glow: 0,
    lockT: 0, lockState: 'home', lockP: new THREE.Vector3(), lockV: new THREE.Vector3(), lockW: 0, lockRot: 0,
    time: 0, paused: false,
  };

  function setHint() {
    $('#hint').textContent = st.open ? 'もう一度タップで閉じる' : 'タップして開ける';
  }
  function open() {
    if (st.open) return;
    st.open = true;
    st.hopT = -1;
    // 錠前: つるが跳ね上がってから、前へ外れて落ちる
    st.lockState = 'unlock'; st.lockT = 0;
    st.target = openRad;
    st.burstAt = st.time + M.unlockTime + M.burstDelay;
    setHint();
  }
  function close() {
    if (!st.open) return;
    st.open = false;
    retract(tr);
    st.burstAt = -1;
    st.target = 0;
    st.lockState = 'return'; st.lockT = 0;
    st.lockFrom = lock.position.clone(); st.lockRotFrom = lock.rotation.clone();
    setHint();
  }
  const toggle = () => (st.open ? close() : open());

  function updateHop(dt) {
    if (st.open || st.lidA > 0.01) { hop.position.y = 0; root.scale.set(1, 1, 1); return; }
    st.nextHop -= dt;
    if (st.hopT < 0 && st.nextHop <= 0) { st.hopT = 0; }
    if (st.hopT < 0) { root.scale.set(1, 1, 1); hop.position.y = 0; return; }
    st.hopT += dt;
    const T = st.hopT;
    // 0〜0.12 ため(つぶれる)→ 0.12〜0.5 跳ぶ(伸びる)→ 0.5〜0.75 着地(つぶれて戻る)
    let y = 0, s = 0;
    if (T < 0.12) { s = -M.squash * Math.sin((T / 0.12) * Math.PI / 2); }
    else if (T < 0.5) {
      const u = (T - 0.12) / 0.38;
      y = M.hopHeight * 4 * u * (1 - u);
      s = M.squash * 0.8 * (1 - u) - M.squash * 0.2 * u;
    } else if (T < 0.85) {
      const u = (T - 0.5) / 0.35;
      s = -M.squash * Math.exp(-u * 4) * Math.cos(u * Math.PI * 2.4);
    } else {
      st.hopT = -1;
      st.nextHop = M.hopEvery[0] + Math.random() * (M.hopEvery[1] - M.hopEvery[0]);
    }
    hop.position.y = y;
    root.scale.set(1 - s * 0.5, 1 + s, 1 - s * 0.5);
    // 跳ねたときにフタがほんの少し浮く(中身が気になる演出)
    lid.rotation.x = -Math.max(0, y) * 0.35;
  }

  function updateLid(dt) {
    const k = M.lidSpring.stiffness, c = M.lidSpring.damping;
    const sub = 4;
    for (let i = 0; i < sub; i++) {
      const h = dt / sub;
      const acc = k * (st.target - st.lidA) - c * st.lidV;
      st.lidV += acc * h;
      st.lidA += st.lidV * h;
      if (st.lidA < 0) { st.lidA = 0; if (st.lidV < 0) st.lidV = -st.lidV * 0.25; }
    }
    if (st.open || st.lidA > 0.001) lid.rotation.x = -st.lidA;
  }

  const lockHome = dims.lockHome.clone();
  function updateLock(dt) {
    if (st.lockState === 'home') return;
    st.lockT += dt;
    if (st.lockState === 'unlock') {
      // つるが跳ね上がる
      const u = Math.min(1, st.lockT / 0.14);
      shackle.position.y = 0.028 * Math.sin(u * Math.PI / 2);
      if (st.lockT > 0.16) {
        st.lockState = 'fall';
        st.lockP.copy(lock.position);
        st.lockV.set(0.15, 0.9, 0.85);
        st.lockW = 7;
      }
    } else if (st.lockState === 'fall') {
      st.lockV.y -= 9.8 * dt;
      st.lockP.addScaledVector(st.lockV, dt);
      lock.rotation.x += st.lockW * dt * 0.6;
      lock.rotation.z += st.lockW * dt * 0.15;
      const floor = 0.02;
      if (st.lockP.y < floor) {
        st.lockP.y = floor;
        st.lockV.y = -st.lockV.y * 0.35;
        st.lockV.x *= 0.6; st.lockV.z *= 0.6;
        st.lockW *= 0.5;
        if (Math.abs(st.lockV.y) < 0.3) { st.lockState = 'rest'; st.lockT = 0; st.restFrom = lock.rotation.clone(); }
      }
      lock.position.copy(st.lockP);
    } else if (st.lockState === 'rest') {
      // 背中を下にして寝かせる
      const u = Math.min(1, st.lockT / 0.25);
      lock.rotation.x = THREE.MathUtils.lerp(st.restFrom.x, -Math.PI / 2, u);
      lock.rotation.z = THREE.MathUtils.lerp(st.restFrom.z, 0.35, u);
      lock.position.y = THREE.MathUtils.lerp(lock.position.y, 0.02, u);
      if (u >= 1) st.lockState = 'down';
    } else if (st.lockState === 'return') {
      // 弧を描いて元の位置へ戻り、つるがカチッと閉まる
      const u = Math.min(1, st.lockT / 0.55);
      const e = 1 - Math.pow(1 - u, 3);
      lock.position.lerpVectors(st.lockFrom, lockHome, e);
      lock.position.y += Math.sin(u * Math.PI) * 0.25;
      lock.rotation.set(
        THREE.MathUtils.lerp(st.lockRotFrom.x, 0, e), 0, THREE.MathUtils.lerp(st.lockRotFrom.z, 0, e));
      if (u >= 1) {
        const v = Math.min(1, (st.lockT - 0.55) / 0.1);
        shackle.position.y = 0.028 * (1 - v);
        if (v >= 1) st.lockState = 'home';
      }
    }
  }

  function updateGlow(dt) {
    const want = st.open && st.lidA > 0.6 ? 1 : 0;
    st.glow += (want - st.glow) * Math.min(1, dt * (want ? 4 : 8));
    const flick = 1 + Math.sin(st.time * 7.3) * 0.04 + Math.sin(st.time * 13.1) * 0.03;
    tr.light.intensity = M.glow * st.glow * flick;
    tr.glow.material.opacity = 0.75 * st.glow * flick;
    for (const s of tr.sparkles) {
      const d = s.userData;
      const k = Math.max(0, Math.sin(st.time * d.speed + d.phase));
      s.material.opacity = st.glow * Math.pow(k, 6);
      const z = d.size * (0.4 + Math.pow(k, 3));
      s.scale.set(z, z, 1);
      s.position.y = d.base.y + ((st.time * 0.08 + d.phase) % 0.3);
    }
    // 閉じているときは錠前の宝石がときどききらっと光る
    const gem = built.materials.lockGem;
    const twinkle = Math.pow(Math.max(0, Math.sin(st.time * 1.7)), 30);
    gem.emissiveIntensity = 0.12 + twinkle * 1.6;
  }

  // ---------- 操作 ----------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let down = null;
  const hitChest = (e) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.intersectObject(hop, true).length > 0;
  };
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    if (moved < 8 && performance.now() - down.t < 500) toggle();
    down = null;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || down) return;
    canvas.style.cursor = hitChest(e) ? 'pointer' : '';
  });
  addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); }
  });
  $('#hint').addEventListener('click', toggle);

  // ---------- ループ ----------
  const clock = new THREE.Clock();
  function frame() {
    const dt = Math.min(0.05, clock.getDelta());
    if (!st.paused) step(dt);
    controls.update();
    composer.render(dt);
    requestAnimationFrame(frame);
  }
  const lastPose = { lid: 0, hop: 0, sy: 1, lockY: 0, lockZ: 0 };
  function step(dt) {
    st.time += dt;
    updateHop(dt);
    updateLid(dt);
    updateLock(dt);
    if (st.burstAt > 0 && st.time >= st.burstAt) { st.burstAt = -1; launch(tr, cfg, dims); }
    const flying = stepTreasure(tr, cfg, dims, dt, padR);
    updateGlow(dt);
    // 見えないものは描かない: 箱の中身はフタが開いている間だけ、飛ぶ金貨は出ている間だけ
    tr.pile.visible = lid.rotation.x < -0.004;
    tr.flyCoins.visible = flying;
    for (const g of tr.flyGems) g.visible = flying;
    // 影の描き直しが要るか
    const moved = Math.abs(lid.rotation.x - lastPose.lid) > 1e-5 || Math.abs(hop.position.y - lastPose.hop) > 1e-5 ||
      Math.abs(root.scale.y - lastPose.sy) > 1e-5 || Math.abs(lock.position.y - lastPose.lockY) > 1e-5 || Math.abs(lock.position.z - lastPose.lockZ) > 1e-5;
    if (moved || tr.moving) renderer.shadowMap.needsUpdate = true;
    lastPose.lid = lid.rotation.x; lastPose.hop = hop.position.y; lastPose.sy = root.scale.y; lastPose.lockY = lock.position.y; lastPose.lockZ = lock.position.z;
  }

  setHint();
  document.body.classList.add('ready');
  $('#loading').hidden = true;
  requestAnimationFrame(frame);

  // ページを離れるときに、作ったテクスチャ・素材・形を GPU から解放する
  function dispose() {
    const seen = new Set();
    scene.traverse((o) => {
      if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
      for (const m of [].concat(o.material || [])) {
        if (seen.has(m)) continue;
        seen.add(m);
        for (const v of Object.values(m)) if (v && v.isTexture && !seen.has(v)) { seen.add(v); v.dispose(); }
        m.dispose();
      }
    });
    metalEnv.dispose(); studio.envTexture.dispose(); grounds.dispose();
    composer.dispose(); renderer.dispose();
  }
  addEventListener('pagehide', dispose, { once: true });

  // 確認用の入口
  window.__chest = {
    ready: true, st, open, close, toggle, camera, controls, renderer, scene, built, tr, dispose, setGround, grounds,
    /** 時間を進める(スクリーンショット用) */
    advance(sec, fps = 60) { const n = Math.round(sec * fps); for (let i = 0; i < n; i++) step(1 / fps); },
    pause(v = true) { st.paused = v; },
  };
}

main().catch((err) => {
  console.error(err);
  $('#loading').hidden = true;
  const box = $('#error');
  box.hidden = false;
  box.querySelector('.error-message').textContent = err.message;
});
