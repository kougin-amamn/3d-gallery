import * as THREE from 'three';
import { makeRng, noise3, clamp } from '../core/noise.js';

// 群れの挙動。Boids(分離・整列・結合)に、壁・層・障害物・餌・捕食者回避・個体差を重ねる。
// 速度ベクトルを直接いじらず「目標の向きと速さ」を作ってから滑らかに近づける。

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class School {
  constructor(spec, index, world) {
    this.spec = spec;
    this.world = world;
    this.fish = [];
    this.active = spec.count;
    const rng = makeRng(1000 + index * 37);
    this.rng = rng;
    const b = world.bounds;
    const [d0, d1] = spec.depth;
    const center = new THREE.Vector3(
      b.min.x + (0.2 + rng() * 0.6) * (b.max.x - b.min.x),
      0,
      b.min.z + (0.3 + rng() * 0.5) * (b.max.z - b.min.z)
    );
    for (let i = 0; i < spec.count; i++) {
      const p = new THREE.Vector3(
        center.x + (rng() - 0.5) * 6,
        0,
        center.z + (rng() - 0.5) * 4
      );
      p.x = clamp(p.x, b.min.x + 1, b.max.x - 1);
      p.z = clamp(p.z, b.min.z + 1, b.max.z - 1);
      const floor = world.sandHeight(p.x, p.z);
      p.y = spec.behavior === 'bottom'
        ? floor + 0.12
        : THREE.MathUtils.lerp(b.min.y, b.max.y, d0 + rng() * (d1 - d0));
      p.y = Math.max(p.y, floor + 0.4);
      const a = rng() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(spec.speed.cruise);
      this.fish.push({
        p, v,
        dir: v.clone().normalize(),
        seed: rng() * 100,
        scale: THREE.MathUtils.lerp(spec.length[0], spec.length[1], rng()),
        phase: rng() * Math.PI * 2,
        amp: 1,
        roll: 0,
        yawRate: 0,
        burst: 0,
        pause: 0,
        target: null,
      });
    }
  }

  update(dt, t, schools, food) {
    const spec = this.spec;
    const w = this.world;
    const b = w.bounds;
    const f = spec.flock;
    const n = this.active;
    const cruise = spec.speed.cruise;
    const maxSpeed = spec.speed.max;
    const rangeY = b.max.y - b.min.y;
    const depthMin = b.min.y + spec.depth[0] * rangeY;
    const depthMax = b.min.y + spec.depth[1] * rangeY;
    const r2 = f.radius * f.radius;
    const feeding = food.active();

    for (let i = 0; i < n; i++) {
      const a = this.fish[i];
      const desired = new THREE.Vector3().copy(a.dir).multiplyScalar(1.2);  // 慣性
      let speedTarget = cruise * (1 + 0.18 * Math.sin(t * 0.6 + a.seed * 7));

      // ---- 群れ ----
      if (spec.behavior !== 'solo') {
        const sep = new THREE.Vector3(), ali = new THREE.Vector3(), coh = new THREE.Vector3();
        let cnt = 0;
        for (let j = 0; j < n; j++) {
          if (j === i) continue;
          const o = this.fish[j];
          _v.subVectors(a.p, o.p);
          const d2 = _v.lengthSq();
          if (d2 > r2) continue;
          // 前方の仲間を重視(後ろは見えにくい)
          const front = _w.copy(_v).negate().normalize().dot(a.dir);
          const weight = front > -0.5 ? 1 : 0.35;
          const d = Math.sqrt(d2) + 1e-4;
          if (d < f.separation * (a.scale + o.scale)) sep.addScaledVector(_v, weight / (d * d));
          ali.addScaledVector(o.v, weight);
          coh.addScaledVector(o.p, weight);
          cnt += weight;
        }
        if (cnt > 0) {
          if (ali.lengthSq() > 0) desired.addScaledVector(ali.normalize(), f.wAli);
          coh.divideScalar(cnt).sub(a.p);
          const cd = coh.length();
          if (cd > 0) desired.addScaledVector(coh.normalize(), f.wCoh * Math.min(1, cd / f.radius));
        }
        if (sep.lengthSq() > 0) desired.addScaledVector(sep.normalize(), f.wSep);
      }

      // ---- 気まぐれ(個体ごとのノイズ) ----
      const ns = t * 0.12;
      desired.x += noise3(a.seed, ns, 0) * f.wWander * 1.4;
      desired.y += noise3(a.seed, ns, 7.3) * f.wWander * 0.5;
      desired.z += noise3(a.seed, ns, 13.1) * f.wWander * 1.4;

      // ---- 単独の大型魚: 目的地を巡回 ----
      if (spec.behavior === 'solo') {
        if (!a.target || a.target.distanceTo(a.p) < 2.5) {
          const r = this.rng;
          a.target = new THREE.Vector3(
            THREE.MathUtils.lerp(b.min.x + 3, b.max.x - 3, r()),
            THREE.MathUtils.lerp(depthMin, depthMax, r()),
            THREE.MathUtils.lerp(b.min.z + 2, b.max.z - 2, r())
          );
        }
        _v.subVectors(a.target, a.p).normalize();
        desired.addScaledVector(_v, 1.3);
        // 他の大型魚と距離を取る
        for (let j = 0; j < n; j++) {
          if (j === i) continue;
          _v.subVectors(a.p, this.fish[j].p);
          const d = _v.length();
          if (d < f.separation) desired.addScaledVector(_v.normalize(), f.wSep * (1 - d / f.separation));
        }
      }

      // ---- 好みの深さ ----
      const floor = w.sandHeight(a.p.x, a.p.z);
      if (spec.behavior === 'bottom') {
        desired.y = 0;
        a.pause -= dt;
        if (a.pause < -6 - (a.seed % 5)) a.pause = 1.5 + (a.seed % 3);   // 時々立ち止まる
        if (a.pause > 0) speedTarget = 0.04;
      } else {
        const lo = Math.max(depthMin, floor + 0.8);
        if (a.p.y < lo) desired.y += (lo - a.p.y) * 0.9;
        if (a.p.y > depthMax) desired.y -= (a.p.y - depthMax) * 0.9;
        // 底に近づきすぎない
        const clear = a.p.y - floor;
        if (clear < 1.0) desired.y += (1.0 - clear) * 3.0;
      }

      // ---- 壁(滑らかに避ける) ----
      const margin = 2.5;
      const wall = (v, lo, hi) => {
        if (v < lo + margin) return Math.pow((lo + margin - v) / margin, 2);
        if (v > hi - margin) return -Math.pow((v - (hi - margin)) / margin, 2);
        return 0;
      };
      desired.x += wall(a.p.x, b.min.x, b.max.x) * 4;
      desired.z += wall(a.p.z, b.min.z, b.max.z) * 4;
      if (spec.behavior !== 'bottom') desired.y += wall(a.p.y, b.min.y, b.max.y) * 3;

      // ---- 障害物(岩・流木) ----
      for (const o of w.obstacles) {
        _v.subVectors(a.p, o.center);
        if (spec.behavior === 'bottom') _v.y = 0;
        const d = _v.length();
        const rr = o.radius + 0.6 + a.scale * 0.5;
        if (d < rr && d > 1e-4) {
          const k = (rr - d) / rr;
          desired.addScaledVector(_v.normalize(), k * 5);
          if (spec.behavior !== 'bottom' && a.p.y < o.center.y + o.height) desired.y += k * 1.5;
        }
      }

      // ---- 大型魚を避ける ----
      if (spec.flee) {
        for (const s of schools) {
          if (s.spec.behavior !== 'solo') continue;
          for (let j = 0; j < s.active; j++) {
            const o = s.fish[j];
            _v.subVectors(a.p, o.p);
            const d = _v.length();
            const R = 2.2 + o.scale;
            if (d < R) {
              desired.addScaledVector(_v.normalize(), 3 * (1 - d / R));
              a.burst = Math.max(a.burst, 0.6);
            }
          }
        }
      }

      // ---- 餌 ----
      if (feeding) {
        const sense = spec.behavior === 'solo' ? 9 : 7;
        const target = food.nearest(a.p, sense, spec.behavior === 'bottom');
        if (target) {
          _v.subVectors(target.p, a.p);
          const d = _v.length();
          if (spec.behavior === 'bottom') _v.y = 0;
          desired.addScaledVector(_v.normalize(), 3.2);
          speedTarget = Math.max(speedTarget, cruise * (spec.behavior === 'solo' ? 1.6 : 2.0));
          if (d < 0.2 + a.scale * 0.3) {
            food.eat(target);
            a.burst = 0.3;
          }
        }
      }

      // ---- 速度と向き ----
      if (a.burst > 0) {
        speedTarget = Math.max(speedTarget, maxSpeed * 0.85);
        a.burst -= dt;
      }
      // 上下方向の泳ぎを抑える(魚は垂直には泳がない)
      const hLen = Math.hypot(desired.x, desired.z);
      desired.y = clamp(desired.y, -hLen * 0.55, hLen * 0.55);
      if (desired.lengthSq() < 1e-6) desired.copy(a.dir);
      desired.normalize().multiplyScalar(Math.min(speedTarget, maxSpeed));

      _v.subVectors(desired, a.v).multiplyScalar(Math.min(1, spec.agility * dt));
      a.v.add(_v);
      const sp = a.v.length();
      if (sp > maxSpeed) a.v.multiplyScalar(maxSpeed / sp);
      a.p.addScaledVector(a.v, dt);

      // 接地と範囲内への押し戻し
      a.p.x = clamp(a.p.x, b.min.x, b.max.x);
      a.p.z = clamp(a.p.z, b.min.z, b.max.z);
      const fl = w.sandHeight(a.p.x, a.p.z);
      if (spec.behavior === 'bottom') {
        a.p.y += (fl + 0.1 * a.scale + 0.04 - a.p.y) * Math.min(1, dt * 6);
        a.v.y = 0;
      } else {
        a.p.y = clamp(a.p.y, fl + 0.35, b.max.y);
      }

      // 向きはゆっくり追従(急に向きを変えない)
      const prevX = a.dir.x, prevZ = a.dir.z;
      if (sp > 0.03) {
        _v.copy(a.v).normalize();
        a.dir.lerp(_v, 1 - Math.exp(-dt * (spec.agility * 1.8))).normalize();
      }
      const yaw = (prevX * a.dir.z - prevZ * a.dir.x) / Math.max(dt, 1e-3);
      a.yawRate += (yaw - a.yawRate) * Math.min(1, dt * 5);
      a.roll += (clamp(-a.yawRate * 0.35, -0.55, 0.55) - a.roll) * Math.min(1, dt * 3);

      // 泳ぎのリズム: 速いほど速く大きく尾を振る。曲がるときも強く振る
      const ratio = clamp(sp / cruise, 0, 2.5);
      const turn = Math.min(Math.abs(a.yawRate), 1.5);
      const freq = spec.swim.freq * (0.45 + 0.75 * ratio) + turn * 0.6;
      a.phase += dt * freq * Math.PI * 2;
      const ampTarget = 0.45 + 0.55 * Math.min(ratio, 1.6) + turn * 0.5;
      a.amp += (ampTarget - a.amp) * Math.min(1, dt * 4);
    }
  }

  // 位置・向き・傾きから変換行列を作る
  writeMatrices(mesh, swimAttr) {
    const m = new THREE.Matrix4();
    const x = new THREE.Vector3(), y = new THREE.Vector3(), z = new THREE.Vector3();
    const q = new THREE.Quaternion();
    for (let i = 0; i < this.active; i++) {
      const a = this.fish[i];
      x.copy(a.dir);
      z.crossVectors(x, UP);
      if (z.lengthSq() < 1e-6) z.set(0, 0, 1);
      z.normalize();
      y.crossVectors(z, x);
      m.makeBasis(x, y, z);
      q.setFromAxisAngle(x, a.roll);
      m.premultiply(new THREE.Matrix4().makeRotationFromQuaternion(q));
      m.scale(_v.set(a.scale, a.scale, a.scale));
      m.setPosition(a.p);
      mesh.setMatrixAt(i, m);
      swimAttr.array[i * 2] = a.phase;
      swimAttr.array[i * 2 + 1] = a.amp;
    }
    mesh.count = this.active;
    mesh.instanceMatrix.needsUpdate = true;
    swimAttr.needsUpdate = true;
  }
}
