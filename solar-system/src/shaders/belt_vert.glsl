// 小惑星帯・カイパーベルト: 各粒の軌道を GPU 上で進める
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec4 aOrbit;   // a(au), e, i(rad), Ω(rad)
attribute vec4 aOrbit2;  // ω(rad), M0(rad), 大きさ, 明るさ
uniform float uDays;
uniform vec3 uSunRel;    // 太陽の位置(カメラ基準)
uniform float uPixel;
uniform float uSize;
varying float vBright;
varying float vDist;

void main() {
  float a = aOrbit.x, e = aOrbit.y, inc = aOrbit.z, node = aOrbit.w;
  float peri = aOrbit2.x;
  float n = 0.01720209895 / (a * sqrt(a));      // 平均運動(rad/日)
  float M = aOrbit2.y + n * uDays;
  float nu = M + 2.0 * e * sin(M) + 1.25 * e * e * sin(2.0 * M);
  float r = a * (1.0 - e * e) / (1.0 + e * cos(nu));
  float u = nu + peri;
  // 黄道座標 → 描画座標(x, z, -y)
  vec3 ecl = vec3(
    cos(node) * cos(u) - sin(node) * sin(u) * cos(inc),
    sin(node) * cos(u) + cos(node) * sin(u) * cos(inc),
    sin(u) * sin(inc));
  vec3 dir = vec3(ecl.x, ecl.z, -ecl.y);
  vec3 p = uSunRel + dir * displayDistance(r);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vDist = -mv.z;
  vBright = aOrbit2.w / (r * r) * 4.0;
  gl_PointSize = clamp(aOrbit2.z * uSize * uPixel, 1.0, 3.0 * uPixel);
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}
