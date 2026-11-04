// 恒星: 実際の等級と色。カメラの露出に合わせて見える数が変わる
attribute vec3 aColor;
attribute float aMag;
uniform float uExposure;
uniform float uPixel;
uniform float uMagLimit;
varying vec3 vColor;
varying float vCore;

void main() {
  // 等級 → 明るさ(0等星を1とする)
  float flux = pow(10.0, -0.4 * aMag) * uExposure;
  float vis = smoothstep(uMagLimit + 0.5, uMagLimit - 0.5, aMag);
  // 暗い星も見えるよう、明るさの差を目の感じ方に近づけて圧縮する
  vColor = aColor * min(pow(flux, 0.55), 3.0) * vis * 0.9;
  float size = clamp(1.6 + sqrt(flux) * 3.2, 1.6, 9.0) * uPixel;
  vCore = clamp(flux, 0.0, 1.0);
  gl_PointSize = size;
  gl_Position = projectionMatrix * viewMatrix * vec4(position * 1.0e6, 1.0);
}
