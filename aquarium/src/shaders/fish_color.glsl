// 種ごとの模様。体の局所座標(頭 +0.5 〜 尾 -0.5)で描く。
{
  vec3 lp = vFishLocal;
  float yn = lp.y / uBodyH;                 // 体高で正規化(おおよそ -0.5〜0.5)
  vec3 body = mix(uBelly, uBack, smoothstep(-0.2, 0.32, yn));

  if (uPattern == 1) {
    // ネオン: 青く光る側線と、下半身後方の赤
    float line = smoothstep(0.075, 0.015, abs(yn - 0.07))
               * smoothstep(0.42, 0.32, lp.x) * smoothstep(-0.34, -0.22, lp.x);
    float red = smoothstep(0.02, -0.1, yn) * smoothstep(0.1, -0.04, lp.x) * smoothstep(-0.36, -0.26, lp.x);
    body = mix(body, uAccent2, red * 0.92);
    body = mix(body, uAccent, line);
    fishGlow = line;
  } else if (uPattern == 2) {
    // 縦縞(エンゼル系)
    float bars = 0.0;
    bars = max(bars, smoothstep(0.035, 0.012, abs(lp.x - 0.33)) * step(-0.42, yn));
    bars = max(bars, smoothstep(0.05, 0.02, abs(lp.x - 0.12)));
    bars = max(bars, smoothstep(0.045, 0.018, abs(lp.x + 0.12)));
    body = mix(body, uAccent, bars * 0.88);
    // 頭頂のほのかな暖色
    body = mix(body, uAccent2, smoothstep(0.25, 0.45, yn) * smoothstep(0.2, 0.4, lp.x) * 0.45);
  } else if (uPattern == 3) {
    // 斑点(コリドラス系)
    vec2 cell = floor(lp.xy * vec2(34.0, 30.0));
    float h = fishHash(cell);
    vec2 f = fract(lp.xy * vec2(34.0, 30.0)) - 0.5;
    float spot = step(0.55, h) * smoothstep(0.42, 0.25, length(f));
    body = mix(body, uAccent, spot * 0.75 * smoothstep(-0.3, 0.0, yn));
    // 側面の金属光沢帯
    body = mix(body, uAccent2, smoothstep(0.06, 0.0, abs(yn - 0.02)) * 0.4);
  } else if (uPattern == 4) {
    // 後半の黒い楔形(ラスボラ系)
    float lower = -0.32 + (0.1 - lp.x) * 0.82;
    float wedge = smoothstep(0.12, 0.06, lp.x) * smoothstep(-0.33, -0.27, lp.x)
                * smoothstep(lower - 0.02, lower + 0.03, yn) * smoothstep(0.3, 0.22, yn);
    body = mix(body, uAccent, wedge * 0.92);
    body = mix(body, uAccent2, smoothstep(0.1, 0.35, yn) * 0.25);
  } else if (uPattern == 5) {
    // 細い横縞と斑(グラミー系)
    float bars = 0.5 + 0.5 * sin(lp.x * 46.0 + yn * 3.0);
    body = mix(body, uAccent, smoothstep(0.6, 0.95, bars) * 0.28 * smoothstep(-0.25, 0.1, yn));
    float spot = smoothstep(0.05, 0.02, length(vec2(lp.x + 0.02, yn * uBodyH)));
    body = mix(body, uAccent, spot * 0.85);
    // 腹びれ付近の暖色
    body = mix(body, uAccent2, smoothstep(-0.15, -0.4, yn) * 0.35);
  }

  // ヒレ: 体色に寄せつつ明るく
  vec3 fin = mix(body, uFinColor, 0.7);
  body = mix(body, fin, vFin);
  if (uPattern == 2) body = mix(body, uAccent, vFin * smoothstep(0.04, 0.0, abs(lp.x + 0.12)) * 0.6);

  // 目
  float side = step(0.3, abs(vFishNz)) * (1.0 - vFin);
  float ed = length(lp.xy - uEye.xy);
  float pupil = smoothstep(uEye.z * 0.62, uEye.z * 0.5, ed);
  float iris = smoothstep(uEye.z, uEye.z * 0.88, ed);
  body = mix(body, mix(vec3(0.55, 0.52, 0.42), vec3(0.008), pupil), iris * side);

  diffuseColor.rgb *= body;
  // ヒレは半透明。付け根は濃く、縁ほど薄い
  float finEdge = smoothstep(0.0, 0.3, length(vec2(min(lp.x - uEye.x + 0.9, 0.0), abs(yn) - 0.45)));
  diffuseColor.a = mix(1.0, mix(0.72, 0.42, finEdge), vFin);
  fishFinMask = vFin;
}
