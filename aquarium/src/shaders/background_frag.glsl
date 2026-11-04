// 背景: 視線の向きで水の色を決める(遠景はフォグと同じ色に溶ける)
varying vec3 vWorld;
varying vec2 vUv;
uniform vec3 uViewOrigin;

void main() {
  vec3 dir = normalize(vWorld - uViewOrigin);
  float up = dir.y;
  vec3 col = uwFogDir(dir, uViewOrigin.y);

  // 光の来る方向がぼんやり明るい
  vec3 L = -normalize(uSunDir);
  float sun = pow(max(dot(dir, L), 0.0), 5.0);
  col += uSunColor * uShallow * sun * 0.35 * uSunIntensity * smoothstep(-0.1, 0.5, up);

  // ごく弱い揺らぎ
  float n = sin(dir.x * 7.0 + uTime * 0.12) * sin(dir.z * 6.0 - uTime * 0.09);
  col *= 1.0 + n * 0.025;

  gl_FragColor = vec4(col, 1.0);
}
