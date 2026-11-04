// 遠くの天体を光点として描く(円盤が1ピクセルより小さいと消えてしまうため)
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 aColor;
attribute float aSize;
uniform float uPixel;
varying vec3 vColor;
void main() {
  vColor = aColor;
  gl_PointSize = aSize * uPixel;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
