import * as THREE from 'three';
import { circularGraining, radialGraining, genevaStripes, perlage, placed } from './finishes.js';

// 素材を data/materials.json から作る。仕上げ模様(異方性反射)は部品ごとに位置を合わせて複製する。
export function createMaterials(cfg) {
  const tex = {
    circular: circularGraining(512),
    radial: radialGraining(512),
    geneva: genevaStripes(512, 4),
    perlage: perlage(512, 6),
  };
  const base = (k, extra = {}) => {
    const c = cfg[k];
    const p = {
      color: new THREE.Color(c.color),
      metalness: c.metalness ?? 0,
      roughness: c.roughness ?? 0.5,
    };
    if (c.anisotropy) p.anisotropy = c.anisotropy;
    if (c.iridescence) Object.assign(p, { iridescence: c.iridescence, iridescenceIOR: c.iridescenceIOR, iridescenceThicknessRange: c.iridescenceThickness });
    if (c.transmission) Object.assign(p, { transmission: c.transmission, ior: c.ior, thickness: c.thickness, attenuationColor: new THREE.Color(c.attenuationColor), attenuationDistance: 0.4 });
    if (c.sheen) Object.assign(p, { sheen: c.sheen, sheenColor: new THREE.Color(c.sheenColor), sheenRoughness: c.sheenRoughness });
    Object.assign(p, extra);
    return new THREE.MeshPhysicalMaterial(p);
  };

  const cache = {};
  return {
    tex,
    /** materials.json の項目からそのまま作る(extra で上書き) */
    make: (k, extra) => base(k, extra),
    /** 歯車の面: 中心 (0,0)、半径 R の円形筋目 */
    gold(R) {
      const k = `gold:${R.toFixed(2)}`;
      if (!cache[k]) {
        const o = { repeat: 1 / (2 * R), offset: [0.5, 0.5] };
        cache[k] = base('gold', { anisotropyMap: placed(tex.circular.aniso, o), roughnessMap: placed(tex.circular.rough, o) });
      }
      return cache[k];
    },
    steelSatin(R) {
      const k = `steelSatin:${R.toFixed(2)}`;
      if (!cache[k]) {
        const o = { repeat: 1 / (2 * R), offset: [0.5, 0.5] };
        cache[k] = base('steelSatin', { anisotropyMap: placed(tex.circular.aniso, o), roughnessMap: placed(tex.circular.rough, o) });
      }
      return cache[k];
    },
    /** 角穴車・丸穴車: 放射状の筋目の鋼 */
    sunburst(R) {
      const k = `sun:${R.toFixed(2)}`;
      if (!cache[k]) {
        const o = { repeat: 1 / (2 * R), offset: [0.5, 0.5] };
        cache[k] = base('steelSatin', { anisotropyMap: placed(tex.radial.aniso, o), roughnessMap: placed(tex.radial.rough, o), anisotropy: 0.9, roughness: 0.26, color: new THREE.Color('#CDD2D9') });
      }
      return cache[k];
    },
    /** 受け: 縞の幅 stripeMM、角度 deg */
    bridge(stripeMM = 1.1, deg = 32) {
      const k = `bridge:${stripeMM}:${deg}`;
      if (!cache[k]) {
        const rot = (deg * Math.PI) / 180;
        const o = { repeat: 1 / (stripeMM * 4), rotation: rot };
        cache[k] = base('rhodium', { anisotropyMap: placed(tex.geneva.aniso, o), roughnessMap: placed(tex.geneva.rough, o), anisotropyRotation: rot });
      }
      return cache[k];
    },
    /** 地板: 円の大きさ cellMM のペルラージュ */
    plate(cellMM = 0.6) {
      const k = `plate:${cellMM}`;
      if (!cache[k]) {
        const o = { repeat: 1 / (cellMM * 6) };
        cache[k] = base('rhodium', { anisotropyMap: placed(tex.perlage.aniso, o), roughnessMap: placed(tex.perlage.rough, o), roughness: 0.52, anisotropy: 0.3, color: new THREE.Color('#B6B9BD') });
      }
      return cache[k];
    },
    steel: cache.steel || (cache.steel = base('steel')),
    blued: base('blued'),
    ruby: base('ruby'),
    hairspring: base('hairspring'),
    balanceGold: base('balanceGold'),
    velvet: base('velvet'),
    edge: base('rhodium', { roughness: 0.12, anisotropy: 0 }),
    goldEdge: base('gold', { roughness: 0.12, anisotropy: 0 }),
  };
}
