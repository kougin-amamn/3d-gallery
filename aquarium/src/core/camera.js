import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// カメラ: 通常はゆっくり漂い、ドラッグで視点を回せる。水槽の外が見えないよう範囲を制限する。
export function createCamera(cfg, canvas) {
  const c = cfg.camera;
  const camera = new THREE.PerspectiveCamera(c.fov, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(...c.position);

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(...c.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.rotateSpeed = 0.45;
  controls.zoomSpeed = 0.6;
  controls.minDistance = c.minDistance;
  controls.maxDistance = c.maxDistance;
  controls.minPolarAngle = c.minPolar;
  controls.maxPolarAngle = c.maxPolar;
  controls.minAzimuthAngle = c.minAzimuth;
  controls.maxAzimuthAngle = c.maxAzimuth;
  controls.update();

  let lastInput = performance.now();
  let idleT = 0;
  let base = null;
  const sph = new THREE.Spherical();
  const off = new THREE.Vector3();
  const sway = c.idleSway;

  const markInput = () => { lastInput = performance.now(); base = null; idleT = 0; };
  controls.addEventListener('start', markInput);
  canvas.addEventListener('wheel', markInput, { passive: true });

  return {
    camera,
    controls,
    resize(w, h) {
      camera.aspect = w / h;
      // 縦長の画面では横方向の見える範囲が狭くなりすぎないよう画角を広げる
      const aspect = w / h;
      const ref = Math.tan(THREE.MathUtils.degToRad(c.fov) / 2) * 1.6;
      const want = THREE.MathUtils.radToDeg(2 * Math.atan(ref * 0.62 / aspect));
      camera.fov = THREE.MathUtils.clamp(want, c.fov, 72);
      // 縦長では視線を少し上げて、砂地より水中と魚を多く見せる
      controls.target.y = c.target[1] + (aspect < 1 ? 3.0 * (1 - aspect) : 0);
      camera.updateProjectionMatrix();
    },
    update(dt) {
      const idle = (performance.now() - lastInput) / 1000 > c.idleDelay;
      if (idle) {
        off.subVectors(camera.position, controls.target);
        if (!base) { sph.setFromVector3(off); base = { theta: sph.theta, r: sph.radius }; idleT = 0; }
        idleT += dt;
        const ramp = Math.min(1, idleT / 8);
        const w = (Math.PI * 2) / sway.period;
        sph.setFromVector3(off);
        const theta = base.theta + Math.sin(idleT * w) * sway.azimuth * ramp;
        const r = base.r + Math.sin(idleT * w * 1.37) * sway.distance * ramp;
        sph.theta = THREE.MathUtils.clamp(theta, c.minAzimuth, c.maxAzimuth);
        sph.radius = THREE.MathUtils.clamp(r, c.minDistance, c.maxDistance);
        off.setFromSpherical(sph);
        camera.position.copy(controls.target).add(off);
      }
      controls.update();
    },
  };
}
