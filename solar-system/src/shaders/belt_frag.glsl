#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor;
uniform float uExposure;
uniform float uOpacity;
varying float vBright;
varying float vDist;
void main() {
  #include <logdepthbuf_fragment>
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = dot(c, c);
  if (d > 1.0) discard;
  float a = exp(-d * 4.0);
  gl_FragColor = vec4(uColor * min(vBright * uExposure, 1.5) * a * uOpacity, 1.0);
}
