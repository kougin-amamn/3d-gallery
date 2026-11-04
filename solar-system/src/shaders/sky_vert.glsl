// 背景の天球(カメラと一緒に動く。向きだけを使う)
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position * 1.0e5, 1.0);
}
