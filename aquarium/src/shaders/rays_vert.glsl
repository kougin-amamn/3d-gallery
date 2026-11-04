// 光の筋: 水面から光の向きに伸びる帯。光軸を中心にカメラの方へ向ける(円柱ビルボード)
attribute vec4 aRay;   // x, z(水面上の起点), 幅, 乱数
uniform vec3 uSunDir;
uniform float uSurfaceY;
uniform float uFloorY;

varying vec2 vUv;
varying float vSeed;
varying vec3 vWorld;

void main() {
  vec3 L = normalize(uSunDir);
  float len = (uSurfaceY - uFloorY + 1.0) / max(-L.y, 0.3);
  float t = 1.0 - uv.y;                         // 0 = 水面, 1 = 底
  vec3 top = vec3(aRay.x, uSurfaceY, aRay.y);
  vec3 p = top + L * (t * len);

  vec3 toCam = normalize(cameraPosition - p);
  vec3 right = normalize(cross(L, toCam));
  float w = aRay.z * (1.0 + t * 0.7);
  p += right * (uv.x - 0.5) * w;

  vUv = uv;
  vSeed = aRay.w;
  vWorld = p;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
