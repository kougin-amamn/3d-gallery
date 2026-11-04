// ===== 水中表現の共通処理(全マテリアルで共有) =====
// 色はリニア空間。uSunDir は光が進む向き(下向き)。

uniform float uTime;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uAbsorb;
uniform float uFogDensity;
uniform float uSurfaceY;
uniform float uFloorY;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform float uCaustics;

// 高さに応じた水の色(浅いほど明るい青緑、深いほど暗い青)
vec3 uwFogColor(float y) {
  return mix(uDeep, uShallow, smoothstep(uFloorY - 3.0, uSurfaceY + 3.0, y));
}

// 視点からの距離による透過率(赤が先に減衰する)
vec3 uwTransmittance(vec3 worldPos) {
  float d = distance(worldPos, cameraPosition);
  // 遠景は完全に水の色へ溶かす(地面の端を見せない)
  return exp(-uAbsorb * d * uFogDensity) * (1.0 - smoothstep(22.0, 42.0, d));
}

// 視線の向きで決まる水の色。背景もこの色を使うので、遠景は背景に自然に溶ける。
vec3 uwFogDir(vec3 dir, float originY) {
  float h = smoothstep(uFloorY, uSurfaceY, originY) - 0.5;
  float t = clamp(0.3 + dir.y * 0.8 + h * 0.15, 0.0, 1.0);
  t = t * t * (3.0 - 2.0 * t);
  return mix(uDeep, uShallow, t * 0.82);
}

vec3 uwApply(vec3 col, vec3 worldPos) {
  vec3 tr = uwTransmittance(worldPos);
  vec3 fogC = uwFogDir(normalize(worldPos - cameraPosition), cameraPosition.y);
  return col * tr + fogC * (1.0 - tr);
}

// 水面から届くまでの吸収(深い場所ほど青く暗くなる)
vec3 uwDepthTint(vec3 col, float y) {
  float depth = max(uSurfaceY - y, 0.0);
  return col * exp(-uAbsorb * depth * 0.32);
}

// ---- コースティクス(揺らぐ光の網目) ----
vec2 uwHash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

// 動くボロノイの境界線 = 光の網目
float uwWeb(vec2 uv, float t) {
  vec2 i = floor(uv);
  vec2 f = fract(uv);
  float f1 = 8.0;
  float f2 = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = uwHash2(i + g);
      o = 0.5 + 0.42 * sin(t + 6.2831 * o);
      float d = length(g + o - f);
      if (d < f1) { f2 = f1; f1 = d; }
      else if (d < f2) { f2 = d; }
    }
  }
  return 1.0 - smoothstep(0.0, 0.18, f2 - f1);
}

float uwCausticPattern(vec2 uv, float t) {
  uv += 0.18 * vec2(sin(uv.y * 1.3 + t * 0.7), cos(uv.x * 1.1 + t * 0.6));
  float a = uwWeb(uv, t);
  float b = uwWeb(uv * 1.43 + vec2(3.1, 1.7), t * 1.21);
  float c = a * 0.6 + b * 0.4;
  return c * c * 1.6;
}

// 位置から光の方向に沿って水面へ投影し、模様を求める
float uwCaustics(vec3 worldPos) {
  vec3 L = normalize(uSunDir);
  float k = (uSurfaceY - worldPos.y) / max(-L.y, 0.25);
  vec2 uv = (worldPos.xz - L.xz * k) * 0.42;
  float c = uwCausticPattern(uv, uTime * 0.55);
  float depthFade = exp(-(uSurfaceY - worldPos.y) * 0.035);
  return c * depthFade;
}
