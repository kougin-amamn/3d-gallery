// ===== 地表テクスチャの生成(正距円筒図法で1回だけ描く) =====
// 出力: rgb = 色(sRGB), a = 高さ(0〜1)。北が上、経度0度が中央。
varying vec2 vUv;
uniform int uKind;
uniform vec3 uC[5];
uniform float uSeed;
uniform float uMaria;
uniform float uCraters;
uniform float uFlow;
uniform float uSpot;

const float PI = 3.14159265;

// 天体固定座標の向き(y が北、x が経度0度、-z が東経90度)
vec3 dirFromUv(vec2 uv) {
  float lat = (uv.y - 0.5) * PI;
  float lon = (uv.x - 0.5) * 2.0 * PI;
  return vec3(cos(lat) * cos(lon), sin(lat), -cos(lat) * sin(lon));
}

// クレーター: 中央が窪み、縁が盛り上がる。若いクレーターほど明るい放出物
vec2 craterField(vec3 p, float scale, float density) {
  vec3 w = worley(p * scale + uSeed);
  float keep = step(1.0 - density, w.y);
  float r = mix(0.28, 0.48, fract(w.y * 13.7));
  float d = w.x / r;
  float h = 0.0;
  if (d < 1.0) h = (d * d - 1.0) * 0.55;
  h += 0.32 * exp(-pow((d - 1.0) / 0.18, 2.0));
  float fresh = step(0.86, fract(w.y * 7.3));
  float ejecta = fresh * exp(-max(d - 1.0, 0.0) * 2.2) * smoothstep(0.0, 0.9, d);
  return vec2(h * keep, ejecta * keep);
}

void cratered(vec3 p, out vec3 col, out float h) {
  float base = fbm(p * 2.5 + uSeed, 6) * 0.5 + 0.5;
  float maria = smoothstep(0.52, 0.62, fbm(p * 1.1 + uSeed * 0.3, 4) * 0.5 + 0.5) * uMaria;
  col = mix(uC[1], uC[2], base);
  col = mix(col, uC[0], maria);
  col = mix(col, uC[3], smoothstep(0.3, 0.8, fbm(p * 9.0 + 3.0, 4) * 0.5 + 0.5) * 0.3);
  h = base * 0.25 - maria * 0.2;
  float ej = 0.0;
  for (int i = 0; i < 4; i++) {
    float s = 3.0 * pow(2.3, float(i));
    float dens = uCraters * mix(0.35, 0.8, float(i) / 3.0);
    vec2 c = craterField(p, s, min(dens, 0.95));
    h += c.x * pow(0.62, float(i)) * (1.0 - maria * 0.6);
    ej += c.y * pow(0.7, float(i));
  }
  col = mix(col, uC[2] * 1.12, clamp(ej, 0.0, 1.0) * 0.6);
  h += fbm(p * 40.0, 3) * 0.05;
}

void mars(vec3 p, out vec3 col, out float h) {
  float n = fbm(p * 2.2 + uSeed, 6) * 0.5 + 0.5;
  float dark = smoothstep(0.45, 0.62, fbm(p * 1.4 + 11.0, 5) * 0.5 + 0.5);
  col = mix(uC[1], uC[2], n);
  col = mix(col, uC[0], dark * 0.75);
  col = mix(col, uC[3], smoothstep(0.62, 0.8, fbm(p * 5.0 - 4.0, 4) * 0.5 + 0.5) * 0.4);
  h = n * 0.4 + ridged(p * 3.0, 4) * 0.25;
  for (int i = 0; i < 3; i++) {
    vec2 c = craterField(p, 4.0 * pow(2.4, float(i)), uCraters * 0.7);
    h += c.x * 0.45 * pow(0.6, float(i));
  }
  // 極冠
  float lat = abs(p.y);
  float cap = smoothstep(0.86, 0.93, lat + fbm(p * 8.0, 4) * 0.04 + (p.y < 0.0 ? -0.025 : 0.0));
  col = mix(col, vec3(0.93, 0.92, 0.9), cap);
  h += cap * 0.1;
}

void venus(vec3 p, out vec3 col, out float h) {
  // 緯度ごとに速さの違う雲の流れ(Y字の模様)
  float lat = asin(p.y);
  vec3 q = p;
  float shear = lat * 2.2;
  q.xz = mat2(cos(shear), -sin(shear), sin(shear), cos(shear)) * q.xz;
  float n = fbm(vec3(q.x * 2.0, q.y * 5.0, q.z * 2.0) + fbm(q * 3.0, 3) * 0.6, 6) * 0.5 + 0.5;
  col = mix(uC[0], uC[1], n);
  col = mix(col, uC[2], smoothstep(0.62, 0.85, n) * 0.6);
  col = mix(col, uC[3], smoothstep(0.35, 0.15, n) * 0.4);
  h = 0.5;
}

// 縞模様のガス惑星。band() は緯度から帯の明暗を作る
float jupiterBands(float lat) {
  return sin(lat * 13.0) * 0.5 + sin(lat * 23.0 + 1.3) * 0.25 + sin(lat * 41.0 + 0.4) * 0.12;
}

void jupiter(vec3 p, out vec3 col, out float h) {
  float lat = asin(clamp(p.y, -1.0, 1.0));
  // 帯に沿って引き延ばしたノイズで乱流を作る
  vec3 s = vec3(p.x * 2.0, p.y * 14.0, p.z * 2.0);
  float turb = fbm(s + fbm(p * 6.0 + uSeed, 4) * 1.6, 6);
  float warp = lat + turb * 0.045 * uFlow + fbm(p * 18.0, 3) * 0.008;
  float b = jupiterBands(warp);
  col = mix(uC[0], uC[1], smoothstep(-0.3, 0.45, b));
  col = mix(col, uC[2], smoothstep(0.2, -0.6, b) * 0.65);
  col = mix(col, uC[3], smoothstep(0.35, 0.9, fbm(s * 1.7 - 2.0, 4) * 0.5 + 0.5) * smoothstep(0.0, -0.5, b) * 0.6);
  // 渦(白い楕円)
  vec3 w = worley(vec3(p.x * 6.0, p.y * 16.0, p.z * 6.0) + uSeed);
  col = mix(col, uC[1] * 1.05, smoothstep(0.22, 0.08, w.x) * step(0.82, w.y) * 0.7);
  // 大赤斑(南緯22度)
  float lon = atan(-p.z, p.x);
  vec2 d = vec2((lon - 1.1) * cos(lat) / 0.13, (lat + 0.384) / 0.065);
  float r = length(d);
  float ang = atan(d.y, d.x) + r * 2.5;
  float swirl = 0.5 + 0.5 * sin(ang * 3.0 + fbm(p * 30.0, 3) * 3.0);
  col = mix(col, mix(uC[4], uC[4] * 1.25, swirl), smoothstep(1.0, 0.6, r) * 0.9);
  col = mix(col, uC[1], smoothstep(1.35, 1.0, r) * smoothstep(0.8, 1.0, r) * 0.6);
  // 極域は暗く青みがかる
  col = mix(col, uC[3] * vec3(0.85, 0.9, 1.0), smoothstep(0.75, 1.25, abs(lat)) * 0.55);
  h = 0.5;
}

void saturn(vec3 p, out vec3 col, out float h) {
  float lat = asin(clamp(p.y, -1.0, 1.0));
  vec3 s = vec3(p.x * 2.0, p.y * 18.0, p.z * 2.0);
  float turb = fbm(s + fbm(p * 5.0 + uSeed, 3), 5);
  float warp = lat + turb * 0.02 * uFlow;
  float b = sin(warp * 17.0) * 0.4 + sin(warp * 31.0 + 0.7) * 0.25 + sin(warp * 61.0) * 0.1;
  col = mix(uC[0], uC[1], smoothstep(-0.5, 0.6, b));
  col = mix(col, uC[2], smoothstep(0.1, -0.6, b) * 0.4);
  col = mix(col, uC[4], smoothstep(0.2, 0.0, abs(lat)) * 0.5);
  col = mix(col, uC[3] * vec3(0.9, 0.95, 1.05), smoothstep(1.0, 1.4, abs(lat)) * 0.6);
  h = 0.5;
}

void icegiant(vec3 p, out vec3 col, out float h) {
  float lat = asin(clamp(p.y, -1.0, 1.0));
  float turb = fbm(vec3(p.x * 2.0, p.y * 10.0, p.z * 2.0) + uSeed, 5);
  float b = sin((lat + turb * 0.03 * uFlow) * 11.0);
  col = mix(uC[0], uC[1], smoothstep(-0.8, 0.8, b) * 0.6 + 0.2);
  col = mix(col, uC[2], smoothstep(0.6, 1.3, abs(lat)) * 0.4);
  if (uSpot > 0.0) {
    // 大暗斑と白い雲の筋
    float lon = atan(-p.z, p.x);
    vec2 d = vec2((lon + 0.6) * cos(lat) / 0.16, (lat + 0.35) / 0.08);
    col = mix(col, uC[2] * 0.7, smoothstep(1.0, 0.5, length(d)) * uSpot);
    float streak = smoothstep(0.55, 0.8, fbm(vec3(p.x * 3.0, p.y * 40.0, p.z * 3.0) + 5.0, 4) * 0.5 + 0.5);
    col = mix(col, uC[3] * 1.3, streak * 0.55 * smoothstep(0.5, 0.2, abs(abs(lat) - 0.45)));
  }
  h = 0.5;
}

void io(vec3 p, out vec3 col, out float h) {
  float n = fbm(p * 3.0 + uSeed, 6) * 0.5 + 0.5;
  col = mix(uC[0], uC[1], n);
  col = mix(col, vec3(0.75, 0.42, 0.18), smoothstep(0.6, 0.75, fbm(p * 2.0 + 8.0, 4) * 0.5 + 0.5) * 0.5);
  vec3 w = worley(p * 9.0 + uSeed);
  float vent = step(0.6, w.y);
  col = mix(col, uC[3], smoothstep(0.12, 0.04, w.x) * vent);
  col = mix(col, uC[2], smoothstep(0.3, 0.12, w.x) * vent * 0.6);
  h = n * 0.4;
}

void europa(vec3 p, out vec3 col, out float h) {
  float n = fbm(p * 2.5 + uSeed, 5) * 0.5 + 0.5;
  col = mix(uC[1], uC[0], n * 0.6);
  col = mix(col, uC[3], smoothstep(0.55, 0.75, fbm(p * 1.8 + 3.0, 4) * 0.5 + 0.5) * 0.55);
  float lines = 0.0;
  for (int i = 0; i < 3; i++) {
    float r = 1.0 - abs(snoise(p * (2.0 + float(i) * 1.7) + float(i) * 5.3));
    lines = max(lines, smoothstep(0.965, 0.995, r) * (1.0 - float(i) * 0.25));
  }
  col = mix(col, uC[2], lines * 0.8);
  h = 0.5 + lines * 0.1;
}

void ganymede(vec3 p, out vec3 col, out float h) {
  float dark = smoothstep(0.45, 0.55, fbm(p * 1.6 + uSeed, 5) * 0.5 + 0.5);
  float grooves = ridged(vec3(p.x * 6.0, p.y * 6.0, p.z * 20.0), 4);
  col = mix(uC[2], uC[0], dark);
  col = mix(col, uC[1], (1.0 - dark) * smoothstep(0.7, 0.95, grooves) * 0.5);
  h = (1.0 - dark) * grooves * 0.2;
  float ej = 0.0;
  for (int i = 0; i < 3; i++) {
    vec2 c = craterField(p, 4.0 * pow(2.4, float(i)), uCraters * 0.8);
    h += c.x * 0.4 * pow(0.6, float(i));
    ej += c.y;
  }
  col = mix(col, uC[2] * 1.1, clamp(ej, 0.0, 1.0) * 0.6);
}

void pluto(vec3 p, out vec3 col, out float h) {
  float n = fbm(p * 3.0 + uSeed, 6) * 0.5 + 0.5;
  col = mix(uC[0], uC[1], n);
  // 赤道付近の暗い帯
  col = mix(col, uC[3], smoothstep(0.35, 0.05, abs(p.y + 0.05 + fbm(p * 4.0, 3) * 0.08)) * 0.7);
  // ハート形の氷原(東経約175度、北緯約25度)
  float lat = asin(clamp(p.y, -1.0, 1.0));
  float lon = atan(-p.z, p.x);
  float dl = lon - 3.05;
  dl = mod(dl + PI, 2.0 * PI) - PI;
  vec2 q = vec2(dl * cos(lat), lat - 0.3) / 0.42;
  float heart = length(q - vec2(-0.3, 0.05)) < 0.55 || length(q - vec2(0.3, 0.0)) < 0.62 || (q.y < 0.0 && abs(q.x) < 0.9 + q.y) ? 1.0 : 0.0;
  heart *= smoothstep(0.0, 0.2, 0.9 + q.y);
  col = mix(col, uC[2], heart * (0.85 + 0.15 * n));
  h = n * 0.3 * (1.0 - heart);
  for (int i = 0; i < 2; i++) {
    vec2 c = craterField(p, 5.0 * pow(2.4, float(i)), uCraters * (1.0 - heart));
    h += c.x * 0.3;
  }
}

void titan(vec3 p, out vec3 col, out float h) {
  float n = fbm(p * 2.0 + uSeed, 4) * 0.5 + 0.5;
  col = mix(uC[0], uC[1], n * 0.5 + 0.25);
  col = mix(col, uC[2], smoothstep(0.55, 0.7, fbm(p * 1.5 + 4.0, 4) * 0.5 + 0.5) * 0.35);
  col = mix(col, uC[3], smoothstep(0.7, 1.0, abs(p.y)) * 0.4);
  h = 0.5;
}

// 太陽: r, g = 2層の粒状斑(時間で混ぜて沸き立たせる), b = 超粒状斑の明暗, a = 黒点
void sunSurface(vec3 p, out vec3 col, out float h) {
  vec3 w1 = worley(p * 60.0 + uSeed);
  vec3 w2 = worley(p * 60.0 + uSeed + vec3(13.1, 7.7, 3.3));
  vec3 w3 = worley(p * 115.0 - uSeed);
  float g1 = smoothstep(0.0, 0.9, w1.z - w1.x) * 0.7 + smoothstep(0.0, 0.8, w3.z - w3.x) * 0.3;
  float g2 = smoothstep(0.0, 0.9, w2.z - w2.x) * 0.7 + smoothstep(0.0, 0.8, w3.z - w3.x) * 0.3;
  float big = fbm(p * 4.0 + uSeed, 4) * 0.5 + 0.5;
  float f = fbm(p * 3.0 + 7.3, 4) * 0.5 + 0.5;
  float spots = smoothstep(0.78, 0.86, f) * smoothstep(0.55, 0.2, abs(p.y)) * 0.6
              + smoothstep(0.84, 0.9, f) * 0.4;
  col = vec3(g1, g2, big);
  h = spots * 2.0 - 1.0;
}

void main() {
  vec3 p = dirFromUv(vUv);
  vec3 col; float h;
  if (uKind == 0) cratered(p, col, h);
  else if (uKind == 1) mars(p, col, h);
  else if (uKind == 2) venus(p, col, h);
  else if (uKind == 3) jupiter(p, col, h);
  else if (uKind == 4) saturn(p, col, h);
  else if (uKind == 5) icegiant(p, col, h);
  else if (uKind == 6) io(p, col, h);
  else if (uKind == 7) europa(p, col, h);
  else if (uKind == 8) ganymede(p, col, h);
  else if (uKind == 9) pluto(p, col, h);
  else if (uKind == 10) titan(p, col, h);
  else sunSurface(p, col, h);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), clamp(h * 0.5 + 0.5, 0.0, 1.0));
}
