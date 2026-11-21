// うろこ・えらぶた・目の膨らみの凹凸(fishH)で法線を傾ける。three.js の bumpMap と同じ計算
if (uSkin.x > 0.0) {
  vec3 fPos = -vViewPosition;
  vec3 dpdx = dFdx(fPos), dpdy = dFdy(fPos);
  vec2 dH = vec2(dFdx(fishH), dFdy(fishH)) * uSkin.y * 0.012;
  vec3 r1 = cross(dpdy, normal), r2 = cross(normal, dpdx);
  float det = dot(dpdx, r1) * faceDirection;
  vec3 grad = sign(det) * (dH.x * r1 + dH.y * r2);
  normal = normalize(abs(det) * normal - grad);
}
