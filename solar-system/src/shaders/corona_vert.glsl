// コロナとグレア: カメラに正対する板
#include <common>
#include <logdepthbuf_pars_vertex>
uniform vec3 uCenter;
uniform float uSize;
varying vec2 vUv;

void main() {
  vUv = uv * 2.0 - 1.0;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 p = uCenter + (right * position.x + up * position.y) * uSize;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  #include <logdepthbuf_vertex>
}
