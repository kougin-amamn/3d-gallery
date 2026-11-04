// ワールド座標を求めてフラグメントへ渡す
{
  vec4 uwW = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    uwW = instanceMatrix * uwW;
  #endif
  vUwWorld = (modelMatrix * uwW).xyz;
}
