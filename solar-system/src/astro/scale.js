// 表示スケールの変換。計算は常に実寸(km)で行い、描画の直前に表示座標へ変換する。
// 表示単位: 1 = 1,000 km。
// 見やすい表示: 距離と大きさを冪乗で圧縮する(大小の順序は保つ)。
// t = 0 で見やすい表示、t = 1 で実寸。途中は対数空間で補間して滑らかにつなぐ。

export const UNIT_KM = 1000;
export const AU_KM = 149597870.7;

export function createScale(cfg) {
  const s = cfg; // data/bodies.json の display
  const lerpLog = (a, b, t) => Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * t);

  return {
    t: 0,
    /** 天体の表示半径 */
    radius(body) {
      const real = body.radiusKm / UNIT_KM;
      const styl = body.display?.radius ?? s.radiusK * Math.sqrt(body.radiusKm) / 1;
      return lerpLog(styl, real, this.t);
    },
    /** 日心距離(km) → 表示距離 */
    helioDistance(rKm) {
      const real = rKm / UNIT_KM;
      const styl = s.distanceK * Math.pow(rKm / AU_KM, s.distanceP);
      return lerpLog(Math.max(styl, 1e-6), Math.max(real, 1e-6), this.t);
    },
    /** 母天体からの距離(km) → 表示距離 */
    moonDistance(dKm, parent) {
      const real = dKm / UNIT_KM;
      const pr = parent.radiusKm;
      const styl = this.styledRadius(parent) * (s.moonBase + s.moonK * Math.sqrt(dKm / pr));
      return lerpLog(styl, real, this.t);
    },
    styledRadius(body) {
      return body.display?.radius ?? s.radiusK * Math.sqrt(body.radiusKm);
    },
    /** 位置ベクトル(km)を、向きを保ったまま距離だけ変換する */
    mapHelio(v) {
      const r = Math.hypot(v[0], v[1], v[2]);
      if (r === 0) return [0, 0, 0];
      const k = this.helioDistance(r) / r;
      return [v[0] * k, v[1] * k, v[2] * k];
    },
    mapMoon(v, parent) {
      const r = Math.hypot(v[0], v[1], v[2]);
      if (r === 0) return [0, 0, 0];
      const k = this.moonDistance(r, parent) / r;
      return [v[0] * k, v[1] * k, v[2] * k];
    },
    /** GLSL側で同じ変換をするための係数 */
    uniforms() {
      return { k: s.distanceK, p: s.distanceP, t: this.t, au: AU_KM / UNIT_KM };
    },
  };
}
