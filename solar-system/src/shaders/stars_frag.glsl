varying vec3 vColor;
varying float vCore;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = dot(c, c);
  if (d > 1.0) discard;
  float a = exp(-d * 9.0) + exp(-d * 2.5) * 0.12 * vCore;
  gl_FragColor = vec4(vColor * a, 1.0);
}
