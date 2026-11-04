// コロナ(太陽の周りの淡い光)、縁の紅炎(プロミネンス)、遠くからでも太陽が分かるグレア
#include <common>
#include <logdepthbuf_pars_fragment>
varying vec2 vUv;
uniform float uTime;
uniform float uRadiusFrac;  // 板の大きさに対する太陽の半径
uniform float uLimb;        // 見かけの縁の位置(近いほど 1 より大きくなる)
uniform float uIntensity;
uniform float uGlare;
uniform float uProm;        // 紅炎の明るさ

void main() {
  #include <logdepthbuf_fragment>
  float r = length(vUv);
  if (r > 1.0) discard;
  // 見かけの縁を1とした距離(縁の内側は1)
  float x = max(r / uRadiusFrac / uLimb, 1.0);
  float h = x - 1.0;
  float ang = atan(vUv.y, vUv.x + 1e-5);
  vec2 dir = vec2(cos(ang), sin(ang));
  float t = uTime;

  // コロナ: 放射状の筋がゆっくり揺らめく
  float streams = 0.55 + 0.45 * (snoise(vec3(dir * 3.0, t * 0.03)) * 0.5 + 0.5);
  streams *= 0.7 + 0.3 * (snoise(vec3(dir * 11.0, x * 0.4 - t * 0.05)) * 0.5 + 0.5);
  float corona = pow(x, -3.2) * mix(1.0, streams, smoothstep(0.0, 0.15, h));

  // 紅炎: 縁から立ち上がる炎。場所ごとに強さが変わり、上へ流れながら形を変える
  float site = smoothstep(0.46, 0.8, snoise(vec3(dir * 2.6, t * 0.006)) * 0.5 + 0.5);
  // 縁に根元がある細い炎の舌: 高くなるほど切り取りのしきい値を上げて先細りにする
  float flame = snoise(vec3(dir * 22.0, h * 4.0 - t * 0.15)) * 0.5 + 0.5;
  flame = flame * 0.75 + (snoise(vec3(dir * 90.0 + 5.0, h * 14.0 - t * 0.3)) * 0.5 + 0.5) * 0.25;
  float cut = 0.42 + h * 3.2;
  float prom = site * smoothstep(cut, cut + 0.18, flame) * exp(-h * 9.0);
  // 彩層: 縁に沿った細い赤い縁取り(ちらちら揺れる)
  float rim = exp(-h * 90.0) * (0.75 + 0.25 * snoise(vec3(dir * 60.0, t * 0.3)));

  float glare = exp(-r * 9.0) * 0.25 + exp(-r * 30.0) * 0.6;
  float fade = smoothstep(1.0, 0.75, r);
  vec3 col = vec3(1.0, 0.86, 0.66) * corona * uIntensity * 0.35
           + vec3(1.0, 0.34, 0.1) * (prom * 3.0 + rim * 1.2) * uProm
           + vec3(1.0, 0.9, 0.75) * glare * uGlare;
  gl_FragColor = vec4(max(col * fade, vec3(0.0)), 1.0);
}
