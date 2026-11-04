// 水面を下から見た表現: 斜めからは鏡のように水中を映し、真上に近いほど明るい窓(スネルの窓)が見える
varying vec3 vWorld;
varying vec2 vUv;

void main() {
  vec3 V = normalize(vWorld - cameraPosition);   // 上向きの視線
  vec2 q = vWorld.xz * 0.32;
  float t = uTime;

  // 波による揺らぎ(複数の正弦波の和)
  vec2 g = vec2(0.0);
  g += vec2(cos(q.x * 1.0 + q.y * 0.4 + t * 0.55), cos(q.y * 0.9 - q.x * 0.3 + t * 0.47)) * 0.5;
  g += vec2(cos(q.x * 2.3 - q.y * 1.1 - t * 0.83), cos(q.y * 2.1 + q.x * 0.7 + t * 0.71)) * 0.25;
  g += vec2(cos(q.x * 4.7 + q.y * 2.9 + t * 1.3), cos(q.y * 5.1 - q.x * 2.2 - t * 1.1)) * 0.12;

  float tilt = V.y + dot(g, V.xz) * 0.08;
  float window = smoothstep(0.55, 0.8, tilt);

  vec3 reflected = mix(uDeep, uShallow, 0.55) * 0.75;
  vec3 sky = uShallow * 1.4 + uSunColor * 0.5 * uSunIntensity * 0.3;
  vec3 col = mix(reflected, sky, window);

  // きらめく光の網目
  float glint = uwCausticPattern(vWorld.xz * 0.22 + g * 0.15, t * 0.7);
  col += uSunColor * uSunIntensity * glint * 0.09 * (0.35 + window);

  // 波頭のハイライト
  float ridge = pow(max(0.0, g.x * 0.6 + g.y * 0.4), 3.0);
  col += uShallow * ridge * 0.35;

  // 太陽のにじみ
  vec3 L = -normalize(uSunDir);
  col += uSunColor * uSunIntensity * pow(max(dot(V, L), 0.0), 24.0) * 0.6;

  gl_FragColor = vec4(uwApply(col, vWorld), 1.0);
}
