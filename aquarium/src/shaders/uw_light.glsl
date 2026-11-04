// 照明の後処理: コースティクスを足し、深さによる吸収をかける
{
  vec3 uwN = inverseTransformDirection(normal, viewMatrix);
  float uwUp = clamp(dot(uwN, -normalize(uSunDir)), 0.0, 1.0);
  #ifdef UW_CAUSTICS
    float uwC = uwCaustics(vUwWorld);
    outgoingLight += diffuseColor.rgb * uSunColor * uSunIntensity * uwC * uCaustics * uwUp * 0.32;
  #endif
  outgoingLight = uwDepthTint(outgoingLight, vUwWorld.y);
}
