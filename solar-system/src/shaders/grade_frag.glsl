// 最終仕上げ: レンズフレア(太陽が画面内のとき)、ビネット、粒子感
uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform vec3 uSun;          // xy: 太陽の画面位置(0〜1), z: 見えている度合い
uniform float uFlare;
uniform float uVignette;
uniform float uGrain;
uniform float uTime;
varying vec2 vUv;

vec3 ghost(vec2 uv, vec2 pos, float size, vec3 tint) {
  vec2 d = (uv - pos) * vec2(uResolution.x / uResolution.y, 1.0);
  float r = length(d) / size;
  float ring = smoothstep(1.0, 0.85, r) * (0.35 + 0.65 * smoothstep(0.5, 1.0, r));
  return tint * ring;
}

void main() {
  vec3 col = texture2D(tDiffuse, vUv).rgb;
  if (uSun.z > 0.001 && uFlare > 0.0) {
    vec2 s = uSun.xy;
    vec2 axis = vec2(0.5) - s;
    vec3 f = vec3(0.0);
    f += ghost(vUv, s + axis * 0.55, 0.035, vec3(0.25, 0.35, 0.6));
    f += ghost(vUv, s + axis * 1.1, 0.09, vec3(0.15, 0.3, 0.2));
    f += ghost(vUv, s + axis * 1.45, 0.05, vec3(0.5, 0.3, 0.15));
    f += ghost(vUv, s + axis * 1.8, 0.14, vec3(0.08, 0.12, 0.25));
    // 光芒
    vec2 d = (vUv - s) * vec2(uResolution.x / uResolution.y, 1.0);
    float a = atan(d.y, d.x + 1e-5);
    float r = length(d);
    float rays = pow(abs(cos(a * 3.0)), 60.0) + pow(abs(cos(a * 3.0 + 0.52)), 120.0) * 0.5;
    f += vec3(1.0, 0.9, 0.75) * rays * exp(-r * 9.0) * 0.6;
    col += f * uSun.z * uFlare * 0.12;
  }
  vec2 c = vUv - 0.5;
  col *= 1.0 - uVignette * smoothstep(0.15, 0.75, dot(c, c) * 1.8);
  float g = fract(sin(dot(vUv * uResolution + fract(uTime) * 61.0, vec2(12.9898, 78.233))) * 43758.5453);
  col += (g - 0.5) * uGrain;
  // 不正な値(NaN)が出ても黒い点にならないようにする
  if (any(isnan(col))) col = texture2D(tDiffuse, vUv).rgb;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
