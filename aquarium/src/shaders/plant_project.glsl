// 水流による揺れはワールド空間で加える(群生全体に波が伝わって見える)
vec4 uwInst = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  uwInst = instanceMatrix * uwInst;
#endif
uwInst = modelMatrix * uwInst;
{
  float ph = dot(uwInst.xz, vec2(0.33, 0.21)) - uTime * 0.85 + aPlant.x;
  float hh = vPlantH * vPlantH;
  float sway = sin(ph) * 0.55 + sin(ph * 2.3 + 1.7) * 0.22 + sin(uTime * 0.29 + aPlant.x * 3.0) * 0.4;
  vec2 side = vec2(-uCurrentDir.y, uCurrentDir.x);
  uwInst.xz += (uCurrentDir * (sway + 0.35) + side * sin(ph * 1.7 + aPlant.x * 5.0) * 0.25) * hh * aPlant.y;
  uwInst.y -= abs(sway + 0.35) * hh * aPlant.y * 0.18;
}
vUwWorld = uwInst.xyz;
vec4 mvPosition = viewMatrix * uwInst;
gl_Position = projectionMatrix * mvPosition;
