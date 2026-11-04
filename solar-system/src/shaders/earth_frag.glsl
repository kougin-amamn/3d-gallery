// ===== 地球の地表: 昼の色、夜の都市光、海の鏡面反射、雲の影 =====
#include <common>
#include <logdepthbuf_pars_fragment>
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;
varying vec3 vDirO;

uniform sampler2D uDay;
uniform sampler2D uNight;
uniform sampler2D uBRC;      // r: 高さ, g: 粗さ, b: 雲
uniform vec2 uTexel;
uniform vec3 uLight;
uniform vec3 uPole;
uniform float uCloudOffset;
uniform float uCityLights;
uniform vec3 uAtmoColor;
uniform float uFill;

void main() {
  #include <logdepthbuf_fragment>
  vec3 Ng = normalize(vNormalW);
  vec3 V = normalize(-vPosW);
  vec3 L = normalize(uSunPos - vPosW);
  vec3 east = normalize(cross(uPole, Ng) + vec3(1e-6));
  vec3 north = cross(Ng, east);
  float lat = asin(clamp(vDirO.y, -1.0, 1.0));

  vec4 brc = texture2D(uBRC, vUv);
  float hE = texture2D(uBRC, vUv + vec2(uTexel.x, 0.0)).r - texture2D(uBRC, vUv - vec2(uTexel.x, 0.0)).r;
  float hN = texture2D(uBRC, vUv + vec2(0.0, uTexel.y)).r - texture2D(uBRC, vUv - vec2(0.0, uTexel.y)).r;
  vec3 N = normalize(Ng - 0.9 * (hE * east / max(cos(lat), 0.05) + hN * north));

  vec3 day = pow(texture2D(uDay, vUv).rgb, vec3(2.2));
  float NdLg = dot(Ng, L);
  float mu0 = max(dot(N, L), 0.0);
  float NdV = max(dot(N, V), 1e-3);
  float soft = smoothstep(-0.03, 0.08, NdLg);

  // 雲の影: 太陽の方向へずらした位置の雲を読む
  vec2 shift = vec2(dot(L, east) / max(cos(lat), 0.08) / 6.2832, dot(L, north) / 3.1416) * 0.0035;
  float cloudShadow = texture2D(uBRC, vUv + vec2(uCloudOffset, 0.0) + shift).b;
  float shade = 1.0 - smoothstep(0.15, 0.9, cloudShadow) * 0.55;

  float sh = eclipse(vPosW);
  // 夕焼け: 明暗境界付近の光は赤みを帯びる
  vec3 tint = mix(vec3(1.0, 0.7, 0.5), vec3(1.0), smoothstep(0.0, 0.2, NdLg));
  vec3 light = uLight * tint * sh;
  vec3 col = day * light * mu0 * soft * shade;

  // 海の鏡面反射(粗さが小さい所だけ)
  float rough = clamp(brc.g, 0.0, 1.0);
  float ocean = 1.0 - smoothstep(0.08, 0.35, rough);
  vec3 H = normalize(L + V);
  float a = mix(0.06, 0.5, rough);
  float a2 = a * a;
  float NdH = max(dot(Ng, H), 0.0);
  float D = a2 / (3.1416 * pow(NdH * NdH * (a2 - 1.0) + 1.0, 2.0));
  float F = 0.02 + 0.98 * pow(1.0 - max(dot(H, V), 0.0), 5.0);
  col += light * D * F * max(NdLg, 0.0) * 0.25 / NdV * ocean * shade * soft * 0.6;

  // 夜側の補助光(都市の明かりが主役になるよう控えめに)
  col += day * uLight * uFill * 0.6 * (0.35 + 0.65 * NdV) * (1.0 - soft);

  // 夜の都市光(雲があると弱くなる)
  vec3 night = pow(texture2D(uNight, vUv).rgb, vec3(2.2));
  float darkSide = smoothstep(0.05, -0.18, NdLg);
  float cloudHere = texture2D(uBRC, vUv + vec2(uCloudOffset, 0.0)).b;
  col += night * vec3(1.0, 0.82, 0.55) * darkSide * (1.0 - cloudHere * 0.75) * uCityLights;

  // 大気越しに見る縁の青み
  float rim = pow(1.0 - NdV, 2.5);
  col = mix(col, uAtmoColor * light * 0.18 * smoothstep(-0.2, 0.5, NdLg), rim * 0.4);
  gl_FragColor = vec4(col, 1.0);
}
