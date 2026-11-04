// ===== 岩石天体・ガス惑星の地表 =====
#include <common>
#include <logdepthbuf_pars_fragment>
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;
varying vec3 vDirO;

uniform sampler2D uMap;      // rgb: 色(sRGB), a: 高さ
uniform vec2 uTexel;
uniform float uBump;
uniform vec3 uLight;         // この天体に届く太陽光(色×強さ)
uniform vec3 uCenter;
uniform float uRadius;
uniform vec3 uPole;
uniform float uLommel;       // 0: ランバート, 1: 月面のような散乱
uniform float uLimb;         // ガス惑星の周縁減光
uniform vec3 uAtmoColor;
uniform float uAtmoRim;
uniform float uAmbient;
uniform float uFill;         // 夜側の補助光(昼の光に対する割合)
// 環の影(土星)
uniform vec4 uRing;          // x: 有効, y: 内半径, z: 外半径
uniform sampler2D uRingTex;

float ringShadow(vec3 P, vec3 L) {
  if (uRing.x < 0.5) return 1.0;
  float denom = dot(L, uPole);
  if (abs(denom) < 1e-5) return 1.0;
  float t = dot(uCenter - P, uPole) / denom;
  if (t <= 0.0) return 1.0;
  vec3 Q = P + L * t;
  float r = length(Q - uCenter);
  float u = (r - uRing.y) / (uRing.z - uRing.y);
  if (u < 0.0 || u > 1.0) return 1.0;
  float a = texture2D(uRingTex, vec2(u, 0.5)).a;
  return 1.0 - a * 0.92;
}

void main() {
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(-vPosW);
  vec3 L = normalize(uSunPos - vPosW);

  vec4 tex = texture2D(uMap, vUv);
  vec3 albedo = pow(tex.rgb, vec3(2.2));

  // 高さから法線を作る(東=経度の増える向き、北)
  if (uBump > 0.0) {
    float hE = texture2D(uMap, vUv + vec2(uTexel.x, 0.0)).a - texture2D(uMap, vUv - vec2(uTexel.x, 0.0)).a;
    float hN = texture2D(uMap, vUv + vec2(0.0, uTexel.y)).a - texture2D(uMap, vUv - vec2(0.0, uTexel.y)).a;
    vec3 east = normalize(cross(uPole, N) + vec3(1e-6));
    vec3 north = cross(N, east);
    float lat = asin(clamp(vDirO.y, -1.0, 1.0));
    N = normalize(N - uBump * (hE * east / max(cos(lat), 0.05) * 0.5 + hN * north * 0.5));
  }

  float NdL = dot(N, L);
  float NdV = max(dot(N, V), 0.0);
  float mu0 = max(NdL, 0.0);
  // 太陽の大きさによる柔らかい明暗境界
  float soft = smoothstep(-0.02, 0.06, dot(normalize(vNormalW), L));
  float lambert = mu0;
  float lommel = mu0 / (mu0 + NdV + 1e-4) * 1.6;
  float diffuse = mix(lambert, lommel, uLommel) * soft;
  if (uLimb > 0.0) diffuse *= mix(1.0, pow(NdV, 0.35), uLimb);

  float shadow = eclipse(vPosW) * ringShadow(vPosW, L);
  vec3 col = albedo * uLight * diffuse * shadow;
  col += albedo * uAmbient;
  // 夜側でも地表の模様が分かるよう、視線方向からごく弱い光を足す(実際より明るくする演出)
  col += albedo * uLight * uFill * (0.35 + 0.65 * NdV) * (1.0 - soft * 0.8);

  // 大気の縁の明るさ(薄い大気がある天体)
  if (uAtmoRim > 0.0) {
    float rim = pow(1.0 - NdV, 3.0);
    float lit = smoothstep(-0.25, 0.4, dot(normalize(vNormalW), L));
    col += uAtmoColor * uLight * rim * lit * uAtmoRim * 0.35;
  }
  gl_FragColor = vec4(col, 1.0);
}
