// ===== 太陽の表面: 流れる粒状斑、明るさの揺らぎ、黒点、周縁減光 =====
// 模様は起動時に焼き込んだテクスチャから読む(毎ピクセルの重いノイズ計算をしない)。
// 動きは「フローマップ」: 大きな流れに沿って模様をずらし、2つの位相を交互に重ねる。
#include <common>
#include <logdepthbuf_pars_fragment>
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;
varying vec3 vDirO;

uniform sampler2D uMap;
uniform float uTime;
uniform float uIntensity;

void main() {
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(-vPosW);
  float mu = clamp(dot(N, V), 0.0, 1.0);
  float t = uTime;

  // 流れの向き(超粒状斑の明暗を2か所から読んで、ゆっくり変わるベクトルにする)
  vec2 flow = vec2(
    texture2D(uMap, vUv * 0.5 + vec2(0.37, 0.11) + vec2(t * 0.0006, 0.0)).b,
    texture2D(uMap, vUv * 0.5 + vec2(0.71, 0.53) - vec2(0.0, t * 0.0005)).b) - 0.5;
  vec2 off = flow * vec2(0.016, 0.03);

  // 2つの位相をずらして重ね、模様が絶えず湧き出しては流れて消えるように見せる
  float ph0 = fract(t * 0.07);
  float ph1 = fract(t * 0.07 + 0.5);
  float w0 = 1.0 - abs(ph0 * 2.0 - 1.0);
  vec4 a = texture2D(uMap, vUv + off * (ph0 - 0.5));
  vec4 b = texture2D(uMap, vUv + off * (ph1 - 0.5) + vec2(0.013, 0.007));
  float gran = mix(b.g, a.r, w0);
  float big = mix(b.b, a.b, w0);
  float spots = texture2D(uMap, vUv).a;

  // 明るさの大きな揺らぎ(呼吸するように明滅する)
  float pulse = 0.94 + 0.06 * sin(t * 0.9 + big * 9.0) * sin(t * 0.37 + flow.x * 20.0);

  float limb = 1.0 - 0.72 * (1.0 - pow(max(mu, 1e-4), 0.7));
  vec3 center = vec3(1.0, 0.68, 0.28);
  vec3 edge = vec3(0.92, 0.24, 0.03);
  vec3 col = mix(edge, center, pow(max(mu, 1e-4), 0.45));
  // 粒の明るい中心は白っぽく、暗い境目は赤っぽく(温度差)
  col = mix(col * vec3(1.0, 0.8, 0.6), col * vec3(1.05, 1.02, 0.96), gran);
  float br = limb * (0.5 + 0.5 * gran) * (0.8 + 0.2 * big) * pulse;
  br *= 1.0 - spots * 0.6;
  // 縁の白斑
  br += smoothstep(0.35, 0.0, mu) * smoothstep(0.6, 0.85, big) * 0.18;
  gl_FragColor = vec4(max(col * br * uIntensity, vec3(0.0)), 1.0);
}
