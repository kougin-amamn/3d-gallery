import * as THREE from 'three';

// カメラ: 注目している天体の周りを回る。距離は「天体の表示半径の何倍か」で持つので、
// スケールを切り替えても天体が画面から消えない。
// 天体間の移動は、いったん引いてから寄る弧を描く。

const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function createCameraRig(canvas, world) {
  const camera = new THREE.PerspectiveCamera(42, 1, 1e-3, 1e9);
  const state = { focus: 'system', k: 1.7, yaw: 0.6, pitch: 0.5 };
  if (window.innerWidth < window.innerHeight) state.k = 1.7 * Math.min(2.2, window.innerHeight / window.innerWidth * 0.75);
  const pos = [0, 0, 0];      // カメラの表示座標(倍精度)
  const center = [0, 0, 0];   // 注視点
  let flight = null;
  let aspect = 1.6;
  let lastInput = performance.now();
  const listeners = { pick: [] };

  const limits = (focus) => {
    if (focus === 'system') return [0.04, 8];
    if (focus === 'sun') return [1.6, 3000];
    const atmo = world.atmosphereHeight(focus);
    return [1.18 + atmo * 1.5, 6000];
  };
  const ref = (focus) => (focus === 'system' ? world.systemRadius() : world.radius(focus));
  const focusPos = (focus) => (focus === 'system' ? world.pos('sun') : world.pos(focus));

  // ---- 入力 ----
  const pointers = new Map();
  let dragDist = 0, pinch0 = 0;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragDist = 0;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
    }
    lastInput = performance.now();
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    lastInput = performance.now();
    if (pointers.size === 1) {
      dragDist += Math.abs(dx) + Math.abs(dy);
      if (flight) return;
      state.yaw -= dx * 0.0045;
      state.pitch = THREE.MathUtils.clamp(state.pitch + dy * 0.0045, -1.48, 1.48);
    } else if (pointers.size === 2) {
      dragDist += 10;
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch0 > 0) zoom(pinch0 / d);
      pinch0 = d;
    }
  });
  const up = (e) => {
    if (pointers.has(e.pointerId) && pointers.size === 1 && dragDist < 6) {
      for (const fn of listeners.pick) fn(e.clientX, e.clientY);
    }
    pointers.delete(e.pointerId);
    pinch0 = 0;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', (e) => pointers.delete(e.pointerId));
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    lastInput = performance.now();
    zoom(Math.exp(e.deltaY * 0.0012));
  }, { passive: false });

  function zoom(f) {
    if (flight) return;
    const [lo, hi] = limits(state.focus);
    state.k = THREE.MathUtils.clamp(state.k * f, lo, hi);
  }

  function offset(k, yaw, pitch, r) {
    const d = k * r;
    return [d * Math.cos(pitch) * Math.sin(yaw), d * Math.sin(pitch), d * Math.cos(pitch) * Math.cos(yaw)];
  }

  // 到着時の向き: 昼側を斜めから見る
  function arrivalAngles(target) {
    if (target === 'system') return { yaw: state.yaw, pitch: 0.42 };
    if (target === 'sun') return { yaw: state.yaw, pitch: 0.18 };
    const p = focusPos(target);
    const s = world.pos('sun');
    const sunYaw = Math.atan2(s[0] - p[0], s[2] - p[2]);
    return { yaw: sunYaw - 1.3, pitch: 0.2 };
  }

  return {
    camera,
    state,
    pos,
    center,
    get flying() { return !!flight; },
    get focus() { return flight ? flight.to : state.focus; },
    onPick(fn) { listeners.pick.push(fn); },
    markInput() { lastInput = performance.now(); },
    resize(w, h) {
      aspect = w / h;
      camera.aspect = w / h;
      camera.fov = w < h ? 58 : 42;
      camera.updateProjectionMatrix();
    },
    flyTo(target, opts = {}) {
      if (target === this.focus && !opts.force) return;
      const from = { ...state, center: [...center], dist: state.k * ref(state.focus) };
      const arrive = arrivalAngles(target);
      // 縦長の画面では少し引いて、天体が横にはみ出さないようにする
      const portrait = aspect < 1 ? 1 / Math.max(aspect, 0.45) * 0.75 : 1;
      const k = opts.k ?? (target === 'system' ? 1.7 * portrait : (target === 'sun' ? 5 : (world.hasRings(target) ? 5.5 : 3.6)) * Math.max(1, portrait));
      const to = focusPos(target);
      const sep = Math.hypot(to[0] - from.center[0], to[1] - from.center[1], to[2] - from.center[2]);
      const toDist = k * ref(target);
      const dur = opts.instant ? 0 : THREE.MathUtils.clamp(1.6 + 0.55 * Math.log10(1 + sep / Math.max(toDist, 1e-6)), 2, 5);
      flight = { from, to: target, k, yaw: arrive.yaw, pitch: arrive.pitch, t: 0, dur, sep };
      if (dur === 0) this.update(0);
    },
    update(dt) {
      if (flight) {
        flight.t = flight.dur > 0 ? Math.min(1, flight.t + dt / flight.dur) : 1;
        const e = smoother(flight.t);
        const a = flight.from;
        const b = focusPos(flight.to);
        for (let i = 0; i < 3; i++) center[i] = a.center[i] + (b[i] - a.center[i]) * e;
        const dA = a.dist, dB = flight.k * ref(flight.to);
        const mid = Math.log(dA) + (Math.log(dB) - Math.log(dA)) * e;
        const peak = Math.log(Math.max(flight.sep * 0.75, 1e-9));
        const bump = Math.max(0, peak - (Math.log(dA) + Math.log(dB)) / 2) * Math.sin(Math.PI * e);
        const dist = Math.exp(mid + bump);
        state.yaw = a.yaw + wrapPi(flight.yaw - a.yaw) * e;
        state.pitch = a.pitch + (flight.pitch - a.pitch) * e;
        const o = offset(1, state.yaw, state.pitch, dist);
        for (let i = 0; i < 3; i++) pos[i] = center[i] + o[i];
        if (flight.t >= 1) {
          state.focus = flight.to;
          state.k = flight.k;
          flight = null;
        }
      } else {
        const idle = (performance.now() - lastInput) / 1000 > 10;
        if (idle) state.yaw += dt * (state.focus === 'system' ? 0.012 : 0.03);
        const c = focusPos(state.focus);
        const o = offset(state.k, state.yaw, state.pitch, ref(state.focus));
        for (let i = 0; i < 3; i++) { center[i] = c[i]; pos[i] = c[i] + o[i]; }
      }
      camera.position.set(0, 0, 0);
      camera.up.set(0, 1, 0);
      camera.lookAt(center[0] - pos[0], center[1] - pos[1], center[2] - pos[2]);
      camera.updateMatrixWorld();
    },
  };
}
