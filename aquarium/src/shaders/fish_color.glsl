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
  } else if (uPattern == 6) {
    // ハニードワーフグラミー: 橙金色の体、喉から腹は濃い紺、背びれの縁は黄
    body = mix(uBelly, uBack, smoothstep(-0.35, 0.3, yn));
    float throat = smoothstep(0.05, -0.2, yn) * smoothstep(-0.25, 0.2, lp.x) * smoothstep(0.45, 0.3, lp.x);
    body = mix(body, uAccent, throat * 0.85);
    body = mix(body, uAccent2, smoothstep(0.3, 0.48, yn) * 0.7);
  } else if (uPattern == 7) {
    // コイ・エンゼル: 白地に橙の大きな斑と、黒い細かな斑
    vec2 q = lp.xy * vec2(5.5, 5.5 / max(uBodyH, 0.1) * 0.5);
    float n1 = fishNoise(q + 3.1) * 0.65 + fishNoise(q * 2.3 + 7.7) * 0.35;
    float orange = smoothstep(0.5, 0.58, n1) * smoothstep(-0.45, -0.1, yn + 0.25 * lp.x);
    float head = smoothstep(0.15, 0.32, lp.x) * smoothstep(-0.05, 0.25, yn);
    body = mix(body, uAccent2, max(orange, head) * 0.95);
    float n2 = fishNoise(lp.xy * vec2(16.0, 13.0) + 1.3);
    float black = smoothstep(0.66, 0.72, n2) * (1.0 - head);
    body = mix(body, uAccent, black * 0.9);
  } else if (uPattern == 8) {
    // カーディナルテトラ: 青く光る側線と、頭から尾まで続く赤い腹
    float line = smoothstep(0.08, 0.015, abs(yn - 0.07))
               * smoothstep(0.44, 0.32, lp.x) * smoothstep(-0.36, -0.22, lp.x);
    float red = smoothstep(0.03, -0.12, yn) * smoothstep(0.42, 0.3, lp.x) * smoothstep(-0.38, -0.28, lp.x);
    body = mix(body, uAccent2, red * 0.95);
    body = mix(body, uAccent, line);
    fishGlow = line;
  }

  // ヒレ: 体色に寄せつつ明るく
  vec3 fin = mix(body, uFinColor, 0.7);
  body = mix(body, fin, vFin);
  if (uPattern == 2) body = mix(body, uAccent, vFin * smoothstep(0.04, 0.0, abs(lp.x + 0.12)) * 0.6);
  if (uPattern == 7) body = mix(body, uAccent2, vFin * smoothstep(0.1, 0.4, yn) * 0.55);

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
