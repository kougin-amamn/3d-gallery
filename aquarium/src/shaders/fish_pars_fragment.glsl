varying vec3 vFishLocal;
varying float vFin;
varying float vFishNz;
uniform vec3 uBack;
uniform vec3 uBelly;
uniform vec3 uAccent;
uniform vec3 uAccent2;
uniform vec3 uFinColor;
uniform float uBodyH;
uniform vec3 uEye;       // x, y, 半径
uniform int uPattern;    // 0 無地, 1 ネオン, 2 縦縞, 3 斑点, 4 楔形, 5 グラミー, 6 ハニー, 7 コイ, 8 カーディナル
uniform float uGlow;
float fishGlow = 0.0;
float fishFinMask = 0.0;

float fishHash(vec2 p) {
  return fract(sin(dot(p, vec2(41.3, 289.1))) * 15731.743);
}

// なめらかな値ノイズ(コイ・エンゼルの斑)
float fishNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(fishHash(i), fishHash(i + vec2(1.0, 0.0)), u.x),
             mix(fishHash(i + vec2(0.0, 1.0)), fishHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
