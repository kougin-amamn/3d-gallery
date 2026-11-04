// ===== 天の川: 銀河座標で帯を描く(実際の向きと一致) =====
varying vec3 vDir;
uniform mat3 uToGalactic;
uniform float uExposure;
uniform float uStrength;

void main() {
  vec3 d = normalize(vDir);
  vec3 g = uToGalactic * d;            // x: 銀河中心, z: 銀河北極
  float b = asin(clamp(g.z, -1.0, 1.0));
  float l = atan(g.y, g.x);

  float n = fbm(d * 6.0, 5) * 0.5 + 0.5;
  float fine = fbm(d * 22.0 + 3.0, 4) * 0.5 + 0.5;
  float width = 0.11 + 0.05 * n;
  float band = exp(-pow(b / width, 2.0)) * (0.28 + 0.72 * exp(-pow(l / 1.3, 2.0)));
  float bulge = exp(-(l * l + b * b * 3.0) / 0.06) * 0.9;
  float lum = (band + bulge) * (0.55 + 0.7 * n) * (0.75 + 0.5 * fine);
  // 暗黒帯(塵の帯)
  float dust = smoothstep(0.05, 0.0, abs(b - 0.012 + (fbm(d * 9.0 + 7.0, 4)) * 0.035));
  dust *= smoothstep(1.9, 0.2, abs(l));
  lum *= 1.0 - dust * 0.75;
  // 背景のごく淡い光
  lum += 0.025 * (0.6 + 0.4 * n);

  vec3 warm = vec3(1.0, 0.84, 0.66);
  vec3 cool = vec3(0.7, 0.8, 1.0);
  vec3 col = mix(cool, warm, clamp(exp(-pow(l / 1.0, 2.0)) + bulge, 0.0, 1.0));
  gl_FragColor = vec4(col * lum * uStrength * uExposure, 1.0);
}
