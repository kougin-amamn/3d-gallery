// 気泡: GPU上で上昇を繰り返す。上がるほど少し大きくなり、水面で消える
attribute vec4 aBubble;   // 発生位置x, z, 乱数, 大きさ
attribute float aEmitY;
uniform float uTime;
uniform float uSurfaceY;
uniform float uPixel;

varying float vLife;
varying vec3 vWorld;

void main() {
  float seed = aBubble.z;
  float speed = 0.9 + seed * 0.7;
  float height = uSurfaceY - aEmitY;
  float period = height / speed;
  float tt = uTime + seed * period * 13.0;
  float life = fract(tt / period);

  float y = aEmitY + life * height;
  vec3 p = vec3(
    aBubble.x + sin(tt * 5.0 + seed * 30.0) * 0.05 * (0.3 + life) + sin(tt * 1.3 + seed * 9.0) * 0.18 * life,
    y,
    aBubble.y + cos(tt * 4.3 + seed * 11.0) * 0.05
  );

  vLife = life;
  vWorld = p;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float size = (0.035 + 0.06 * aBubble.w) * (0.7 + life * 0.7);
  gl_PointSize = max(size * uPixel / -mv.z, 1.0);
  gl_Position = projectionMatrix * mv;
}
