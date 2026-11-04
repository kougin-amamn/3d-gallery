varying float vLife;
varying vec3 vWorld;

void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = length(c);
  if (d > 1.0) discard;

  float rim = smoothstep(0.55, 0.92, d) * (1.0 - smoothstep(0.92, 1.0, d));
  float spec = smoothstep(0.38, 0.0, length(c - vec2(-0.35, -0.38)));
  float a = rim * 0.55 + spec * 0.9 + 0.05;
  a *= smoothstep(1.0, 0.95, vLife) * smoothstep(0.0, 0.04, vLife);

  vec3 tr = uwTransmittance(vWorld);
  vec3 col = mix(uShallow, vec3(1.0), 0.75) * (0.55 + 0.25 * uSunIntensity);
  float fade = (tr.g + tr.b) * 0.5;
  gl_FragColor = vec4(col, a * fade);
}
