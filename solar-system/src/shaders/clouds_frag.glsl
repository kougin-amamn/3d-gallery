// ===== 地球の雲(地表より少し上の球) =====
#include <common>
#include <logdepthbuf_pars_fragment>
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;
varying vec3 vDirO;

uniform sampler2D uBRC;
uniform vec3 uLight;
uniform float uCloudOffset;
uniform float uFill;

void main() {
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(-vPosW);
  vec3 L = normalize(uSunPos - vPosW);
  float c = texture2D(uBRC, vUv + vec2(uCloudOffset, 0.0)).b;
  float alpha = smoothstep(0.12, 0.85, c);
  float NdL = dot(N, L);
  float lit = smoothstep(-0.08, 0.25, NdL);
  vec3 tint = mix(vec3(1.0, 0.5, 0.28), vec3(1.0), smoothstep(0.0, 0.3, NdL));
  // 雲の縁は前方散乱で少し明るい
  float fwd = pow(max(dot(-V, L), 0.0), 8.0) * 0.6;
  vec3 col = vec3(0.95) * uLight * tint * (lit * (0.35 + 0.65 * max(NdL, 0.0)) + fwd * lit) * eclipse(vPosW);
  col += vec3(0.95) * uLight * uFill * 0.6 * (1.0 - lit);
  float edge = smoothstep(0.0, 0.25, dot(N, V));
  gl_FragColor = vec4(col, alpha * edge);
}
