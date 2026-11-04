// ===== 大気(惑星より少し大きな球。視線に沿って散乱光を積分する) =====
#include <common>
#include <logdepthbuf_pars_fragment>
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;
varying vec3 vDirO;

uniform vec3 uCenter;
uniform float uRp;          // 惑星の半径
uniform float uRa;          // 大気の外側の半径
uniform vec3 uLight;
uniform vec3 uAtmoColor;
uniform float uStrength;
uniform float uHaze;        // 0: レイリー散乱中心, 1: もや(金星・タイタン)
uniform int uSteps;

vec2 raySphere(vec3 o, vec3 d, vec3 c, float r) {
  vec3 oc = o - c;
  float b = dot(oc, d);
  float h = b * b - (dot(oc, oc) - r * r);
  if (h < 0.0) return vec2(-1.0);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

void main() {
  #include <logdepthbuf_fragment>
  vec3 o = vec3(0.0);
  vec3 d = normalize(vPosW);
  vec2 ta = raySphere(o, d, uCenter, uRa);
  if (ta.y < 0.0) discard;
  vec2 tp = raySphere(o, d, uCenter, uRp);
  float t0 = max(ta.x, 0.0);
  float t1 = tp.x > 0.0 ? tp.x : ta.y;
  float H = (uRa - uRp) * 0.28;
  vec3 L = normalize(uSunPos - uCenter);

  float ds = (t1 - t0) / float(uSteps);
  float sum = 0.0;
  float sumTwilight = 0.0;
  float depth = 0.0;
  for (int i = 0; i < 16; i++) {
    if (i >= uSteps) break;
    vec3 p = o + d * (t0 + ds * (float(i) + 0.5));
    vec3 n = (p - uCenter);
    float r = length(n);
    n /= r;
    float dens = exp(-max(r - uRp, 0.0) / H);
    float cosL = dot(n, L);
    float lit = smoothstep(-0.18, 0.25, cosL);
    sum += dens * lit * ds;
    sumTwilight += dens * smoothstep(-0.2, 0.0, cosL) * smoothstep(0.25, 0.0, cosL) * ds;
    depth += dens * ds;
  }
  float norm = 1.0 / (uRa - uRp);
  sum *= norm; sumTwilight *= norm; depth *= norm;

  float mu = dot(d, L);
  float rayleigh = 0.75 * (1.0 + mu * mu);
  float g = 0.76;
  float mie = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * mu, 1.5) * 0.08;

  vec3 sky = uAtmoColor * rayleigh * (1.0 - uHaze) + mix(uAtmoColor, vec3(1.0), 0.4) * uHaze * 1.2;
  vec3 col = sky * sum + vec3(1.0, 0.8, 0.6) * mie * sum;
  col += vec3(1.0, 0.45, 0.2) * sumTwilight * 0.8 * (1.0 - uHaze);
  col *= uLight * uStrength * 0.07 * eclipse(uCenter + (uRp * 1.01) * L);
  float alpha = clamp(1.0 - exp(-depth * 0.12 * (0.3 + uHaze)), 0.0, 1.0);
  gl_FragColor = vec4(col, alpha * uHaze);
}
