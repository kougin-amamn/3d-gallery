// 表示スケールの変換(JS の astro/scale.js と同じ式)
uniform vec4 uScale;   // x: distanceK, y: distanceP, z: t(0=見やすい, 1=実寸), w: 1au の表示単位

float displayDistance(float rAU) {
  float styl = uScale.x * pow(max(rAU, 1e-6), uScale.y);
  float real = rAU * uScale.w;
  return exp(mix(log(styl), log(real), uScale.z));
}
