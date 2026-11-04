// 軌道線: 天体の少し後ろが最も濃く、後ろへ行くほど薄くなる
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aPhase;   // 軌道上の位置(0〜1、公転の向きに増える)
uniform float uPhase;     // 天体の現在位置
varying float vFade;
void main() {
  float behind = fract(uPhase - aPhase);
  vFade = pow(1.0 - behind, 1.6);
  vec4 w = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}
