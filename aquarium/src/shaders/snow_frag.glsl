varying float vSeed;
varying vec3 vWorld;
uniform float uSnowGlow;

void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = dot(c, c);
  if (d > 1.0) discard;
  float a = exp(-d * 3.0);

  // 光が届く上の方ほど明るく、時々きらめく
  float lit = 0.35 + 0.65 * smoothstep(uFloorY, uSurfaceY, vWorld.y);
  float tw = 0.7 + 0.3 * sin(uTime * (0.6 + vSeed) + vSeed * 50.0);
  vec3 tr = uwTransmittance(vWorld);

  vec3 col = mix(uShallow, uSunColor, 0.5) * lit * tw * uSnowGlow * (0.25 + 0.2 * uSunIntensity);
  gl_FragColor = vec4(col * tr * a * 0.32, 1.0);
}
