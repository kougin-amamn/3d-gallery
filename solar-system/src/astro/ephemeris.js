// 全天体の位置と向きを、指定時刻について計算する(実寸、日心黄道座標、km)。
import { heliocentric } from './kepler.js';
import { moonGeocentric, galilean, circularMoon } from './moons.js';
import { bodyFrame, normalize, cross } from './rotation.js';
import { AU_KM } from './scale.js';

const MOON_EARTH_MASS_RATIO = 1 / 82.30056; // 月/(地球+月) ≒ 0.01215

export function createEphemeris(bodies) {
  const byId = Object.fromEntries(bodies.map((b) => [b.id, b]));
  const state = {};
  for (const b of bodies) {
    state[b.id] = { pos: [0, 0, 0], local: [0, 0, 0], frame: null, el: null };
  }

  function update(days) {
    // 1. 惑星(と地球-月の重心)
    for (const b of bodies) {
      const s = state[b.id];
      if (b.id === 'sun') { s.pos = [0, 0, 0]; continue; }
      if (!b.orbit) continue;
      const { pos, el } = heliocentric(b.orbit, days);
      s.pos = [pos[0] * AU_KM, pos[1] * AU_KM, pos[2] * AU_KM];
      s.el = el;
    }
    // 2. 自転(衛星の円軌道は母天体の赤道面を使うので先に求める)
    for (const b of bodies) {
      if (b.rotation && !b.rotation.tidal) state[b.id].frame = bodyFrame(b.rotation, days);
    }
    // 3. 衛星
    for (const b of bodies) {
      if (!b.moon) continue;
      const s = state[b.id];
      const p = state[b.parent];
      let local;
      if (b.moon.model === 'lunar') {
        local = moonGeocentric(days);
        // 地球の位置を重心から求め直す
        const emb = p.pos;
        p.pos = [emb[0] - local[0] * MOON_EARTH_MASS_RATIO, emb[1] - local[1] * MOON_EARTH_MASS_RATIO, emb[2] - local[2] * MOON_EARTH_MASS_RATIO];
      } else if (b.moon.model === 'galilean') {
        local = galilean(days, p.pos.map((v) => v / AU_KM), b.moon.index, b.moon.aKm);
      } else {
        local = circularMoon(days, b.moon, p.frame.pole);
      }
      s.local = local;
    }
    for (const b of bodies) {
      if (!b.moon) continue;
      const s = state[b.id], p = state[b.parent];
      s.pos = [p.pos[0] + s.local[0], p.pos[1] + s.local[1], p.pos[2] + s.local[2]];
      // 潮汐固定: 経度0度が母天体を向く
      const toParent = normalize(s.local.map((v) => -v));
      const pole = p.frame ? p.frame.pole : [0, 0, 1];
      const east = normalize(cross(pole, toParent));
      s.frame = { pole: cross(toParent, east), prime: toParent, east };
    }
    return state;
  }

  return { state, update, byId };
}
