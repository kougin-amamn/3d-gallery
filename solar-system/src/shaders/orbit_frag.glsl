#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor;
uniform float uOpacity;
varying float vFade;
void main() {
  #include <logdepthbuf_fragment>
  gl_FragColor = vec4(uColor * uOpacity * (0.12 + 0.88 * vFade), 1.0);
}
