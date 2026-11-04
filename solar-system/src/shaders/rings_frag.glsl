// ===== 土星の環: 半径ごとの色と透け具合、土星本体の影、裏側からの透過光 =====
#include <common>
#include <logdepthbuf_pars_fragment>
varying vec3 vPosW;
varying float vR;              // 惑星半径を1とした距離

uniform sampler2D uRingTex;    // rgb: 色(sRGB), a: 不透明度
uniform float uInner;          // 惑星半径を1とした内半径
uniform float uOuter;
uniform vec3 uNormal;          // 環の面の法線(北極方向)
uniform vec3 uCenter;
uniform float uRp;
uniform vec3 uLight;

void main() {
  #include <logdepthbuf_fragment>
  float u = (vR - uInner) / (uOuter - uInner);
  if (u < 0.0 || u > 1.0) discard;
  vec4 t = texture2D(uRingTex, vec2(u, 0.5));
  vec3 albedo = pow(t.rgb, vec3(2.2));
  vec3 V = normalize(-vPosW);
  vec3 L = normalize(uSunPos - vPosW);
  float nl = dot(uNormal, L);
  float nv = dot(uNormal, V);
  float sameSide = step(0.0, nl * nv);
  // 光が当たる面: 粒子の反射。裏面: 粒子を透かした光(薄い所ほど明るく見える)
  float lit = abs(nl);
  float reflected = (0.25 + 0.75 * pow(lit, 0.5));
  float transmitted = (1.0 - t.a) * t.a * 2.2 + pow(max(dot(-V, L), 0.0), 6.0) * (1.0 - t.a) * 0.6;
  float light = mix(transmitted * 0.6, reflected, sameSide);
  float sh = eclipseBy(vPosW, vec4(uCenter, uRp));
  vec3 col = albedo * uLight * light * sh;
  // 斜めから見ると濃く見える
  float alpha = 1.0 - pow(1.0 - t.a, 1.0 / max(abs(nv), 0.08));
  gl_FragColor = vec4(col * alpha, alpha);
}
