// 最終仕上げ: 周辺の色ずれ、コントラスト・彩度・色温度、ビネット、粒子感
uniform sampler2D tDiffuse;
uniform float uTime;
uniform float uContrast;
uniform float uSaturation;
uniform float uWarmth;
uniform float uVignette;
uniform float uGrain;
uniform float uAberration;
uniform vec2 uResolution;
varying vec2 vUv;

void main() {
  vec2 c = vUv - 0.5;
  float r2 = dot(c, c);
  vec2 off = c * uAberration * r2 * 0.012;

  vec3 col;
  col.r = texture2D(tDiffuse, vUv - off).r;
  col.g = texture2D(tDiffuse, vUv).g;
  col.b = texture2D(tDiffuse, vUv + off).b;

  col = (col - 0.5) * uContrast + 0.5;
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSaturation);
  col += vec3(uWarmth, uWarmth * 0.35, -uWarmth) * 0.5;

  col *= 1.0 - uVignette * smoothstep(0.12, 0.62, r2 * 1.5);

  float g = fract(sin(dot(vUv * uResolution + fract(uTime) * 97.0, vec2(12.9898, 78.233))) * 43758.5453);
  col += (g - 0.5) * uGrain;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
