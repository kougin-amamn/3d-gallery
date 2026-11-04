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
uniform int uPattern;    // 0 無地, 1 ネオン, 2 縦縞, 3 斑点, 4 楔形, 5 グラミー
uniform float uGlow;
float fishGlow = 0.0;
float fishFinMask = 0.0;

float fishHash(vec2 p) {
  return fract(sin(dot(p, vec2(41.3, 289.1))) * 15731.743);
}
