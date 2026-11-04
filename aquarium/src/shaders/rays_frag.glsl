varying vec2 vUv;
varying float vSeed;
varying vec3 vWorld;
uniform float uRays;

void main() {
  float edge = pow(sin(vUv.x * 3.14159), 2.4);
  float t = 1.0 - vUv.y;
  float along = smoothstep(0.0, 0.06, t) * pow(1.0 - t, 1.5);

  float s = vSeed * 31.0;
  float flicker = 0.5 + 0.5 * sin(uTime * (0.25 + vSeed * 0.35) + s) * sin(uTime * 0.17 + s * 0.7);
  flicker = 0.25 + 0.75 * flicker;
  float streak = 0.7 + 0.3 * sin(vUv.x * 17.0 + s + uTime * 0.25);

  float camFade = smoothstep(2.5, 8.0, distance(vWorld, cameraPosition));
  vec3 tr = uwTransmittance(vWorld);

  vec3 col = uSunColor * mix(vec3(1.0), uShallow, 0.45) * uSunIntensity;
  col *= edge * along * flicker * streak * camFade * uRays * 0.09;
  gl_FragColor = vec4(col * tr, 1.0);
}
