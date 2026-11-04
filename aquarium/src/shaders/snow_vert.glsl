// 浮遊粒子(マリンスノー): 箱の中をゆっくり漂い、端で反対側へ回り込む
attribute vec4 aSnow;   // 箱内の位置(0〜1)xyz, 乱数
uniform float uTime;
uniform vec3 uBoxMin;
uniform vec3 uBoxMax;
uniform float uPixel;

varying float vSeed;
varying vec3 vWorld;

void main() {
  vec3 box = uBoxMax - uBoxMin;
  float s = aSnow.w;
  vec3 p = aSnow.xyz * box;
  p.y -= uTime * (0.04 + s * 0.07);
  p.x += sin(uTime * 0.18 + s * 40.0) * 0.6 + uTime * 0.05;
  p.z += cos(uTime * 0.15 + s * 31.0) * 0.6;
  p = uBoxMin + mod(p, box);

  vSeed = s;
  vWorld = p;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float size = 0.022 + 0.04 * fract(s * 7.13);
  gl_PointSize = max(size * uPixel / -mv.z, 1.0);
  gl_Position = projectionMatrix * mv;
}
