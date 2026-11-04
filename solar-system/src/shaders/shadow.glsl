// ===== 影(食)の計算 =====
// 点 P から見て、太陽の円盤がほかの天体でどれだけ隠れるかを求める(本影と半影)。

uniform vec3 uSunPos;
uniform float uSunRadius;
uniform vec4 uOccluders[4];   // xyz: 中心(カメラ基準), w: 半径
uniform int uOccCount;

float eclipseBy(vec3 P, vec4 occ) {
  vec3 toS = uSunPos - P;
  float dS = length(toS);
  vec3 toO = occ.xyz - P;
  float dO = length(toO);
  if (dO > dS || dot(toO, toS) <= 0.0) return 1.0;
  float aS = asin(clamp(uSunRadius / dS, 0.0, 1.0));
  float aO = asin(clamp(occ.w / dO, 0.0, 1.0));
  float sep = acos(clamp(dot(toS / dS, toO / dO), -1.0, 1.0));
  if (sep >= aS + aO) return 1.0;
  float t = clamp((aS + aO - sep) / (2.0 * min(aS, aO) + 1e-9), 0.0, 1.0);
  t = t * t * (3.0 - 2.0 * t);
  float cover = t * min(1.0, (aO * aO) / (aS * aS));
  return 1.0 - cover;
}

float eclipse(vec3 P) {
  float l = 1.0;
  for (int i = 0; i < 4; i++) {
    if (i >= uOccCount) break;
    l *= eclipseBy(P, uOccluders[i]);
  }
  return l;
}
