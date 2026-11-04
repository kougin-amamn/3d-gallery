import * as THREE from 'three';
import { patchUnderwater } from '../core/patch.js';

// 餌: 水面に落ちてしばらく漂い、ゆっくり沈んで底でしばらく残る
export function createFood(scene3d, cfg, uniforms, shaders, sandHeight) {
  const fc = cfg.food;
  const pellets = [];
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const mat = new THREE.MeshStandardMaterial({ color: '#B8743A', roughness: 0.7, emissive: '#3A1C08' });
  patchUnderwater(mat, { shared: uniforms, shaders, key: 'food', caustics: false });
  const mesh = new THREE.InstancedMesh(geo, mat, fc.max);
  mesh.count = 0;
  mesh.frustumCulled = false;
  scene3d.add(mesh);
  const m = new THREE.Matrix4();
  const s = new THREE.Vector3(), q = new THREE.Quaternion();

  return {
    feed(center) {
      for (let i = 0; i < fc.perFeed && pellets.length < fc.max; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * 1.4;
        pellets.push({
          p: new THREE.Vector3(center.x + Math.cos(a) * r, cfg.surfaceY - 0.15, center.z + Math.sin(a) * r * 0.7),
          v: new THREE.Vector3(),
          float: 0.6 + Math.random() * 1.8,
          size: 0.045 + Math.random() * 0.03,
          rest: 0,
          seed: Math.random() * 10,
          eaten: false,
        });
      }
    },
    active() { return pellets.length > 0; },
    nearest(p, range, bottomOnly) {
      let best = null, bd = range * range;
      for (const f of pellets) {
        if (f.eaten) continue;
        if (bottomOnly && f.rest <= 0 && f.p.y - sandHeight(f.p.x, f.p.z) > 1.2) continue;
        const d = f.p.distanceToSquared(p);
        if (d < bd) { bd = d; best = f; }
      }
      return best;
    },
    eat(f) { f.eaten = true; },
    update(dt, t) {
      for (const f of pellets) {
        if (f.eaten) continue;
        const floor = sandHeight(f.p.x, f.p.z) + f.size * 0.6;
        if (f.float > 0) {
          f.float -= dt;
          f.p.x += Math.sin(t * 0.8 + f.seed) * dt * 0.05;
        } else if (f.p.y > floor) {
          f.p.y -= dt * (0.32 + f.seed * 0.01);
          f.p.x += Math.sin(t * 1.7 + f.seed * 3) * dt * 0.12;
          f.p.z += Math.cos(t * 1.3 + f.seed * 2) * dt * 0.08;
          if (f.p.y <= floor) f.p.y = floor;
        } else {
          f.rest += dt;
          if (f.rest > fc.restSeconds) f.eaten = true;
        }
      }
      for (let i = pellets.length - 1; i >= 0; i--) if (pellets[i].eaten) pellets.splice(i, 1);
      pellets.forEach((f, i) => {
        s.setScalar(f.size);
        m.compose(f.p, q, s);
        mesh.setMatrixAt(i, m);
      });
      mesh.count = pellets.length;
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
