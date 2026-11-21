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
    // 点は格子に並ばないよう、位置と大きさを1つずつずらす
    vec2 cell = floor(lp.xy * vec2(34.0, 30.0));
    float h = fishHash(cell);
    vec2 jit = vec2(fishHash(cell + 3.7), fishHash(cell + 9.1)) - 0.5;
    vec2 f = fract(lp.xy * vec2(34.0, 30.0)) - 0.5 - jit * 0.45;
    float rad = 0.16 + 0.2 * fishHash(cell + 5.3);
    float spot = step(0.5, h) * smoothstep(rad + 0.08, rad - 0.04, length(f * vec2(1.0, 0.8 + 0.4 * h)));
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
  vec3 fin = mix(body, uFinColor, uFinTint);
  // 条(すじ): 尾びれは付け根から放射状、背びれ・尻びれは後ろへ流れる斜めの筋
  float rays = 0.0;
  if (uFinRays > 0.0) {
    float r = lp.x < uTailX
      ? sin(atan(lp.y, uTailX - lp.x + 0.02) * 26.0)
      : sin((lp.x + abs(lp.y) * 0.75) * 80.0);
    rays = smoothstep(0.35, 0.95, r) * uFinRays;
    fin *= 1.0 - rays * 0.45;
  }
  body = mix(body, fin, vFin);
  if (uPattern == 2) body = mix(body, uAccent, vFin * smoothstep(0.04, 0.0, abs(lp.x + 0.12)) * 0.6);
  if (uPattern == 7) body = mix(body, uAccent2, vFin * smoothstep(0.1, 0.4, yn) * 0.55);

  // ---- 肌(うろこ・えらぶた・目)。uSkin.x が 0 の種は今までどおり ----
  float bodyMask = 1.0 - step(0.5, vFin);
  if (uSkin.x > 0.0 && uSkin.w > 0.0) {
    // うろこ: 尾の側へ重なって並ぶ列。1列おきに半分ずらす
    vec2 sc = vec2(lp.x, lp.y * 1.25) / uSkin.x;
    float row = floor(sc.y);
    sc.x += 0.5 * mod(row, 2.0);
    vec2 cell = vec2(floor(sc.x), row);
    vec2 f = fract(sc) - vec2(0.62, 0.5);           // 中心を頭の側へずらし、尾の側の縁が見える
    float d = length(f * vec2(1.0, 1.15));
    float dome = smoothstep(0.68, 0.05, d);
    float edge = smoothstep(0.34, 0.5, d);
    // 遠くて細かすぎるときは消す(ちらつき防止)
    float aa = 1.0 - smoothstep(0.22, 0.6, fwidth(lp.x) / uSkin.x);
    // 頭(目より前)と、背中・腹の縁の近くにはうろこを出さない
    float area = smoothstep(uEye.x + 0.02, uEye.x - 0.08, lp.x) * smoothstep(0.5, 0.36, abs(yn)) * bodyMask;
    float k = aa * area * uSkin.w;
    body *= 1.0 - edge * 0.1 * k;
    float h1 = fishHash(cell + 7.1);
    // きらめき: ところどころのうろこだけが強く光る(泳ぐと点滅して見える)
    float spark = step(1.0 - uSkin.z * 0.12, h1) * dome * k;
    body *= 1.0 + spark * 0.35 + (h1 - 0.5) * 0.06 * k;
    fishH += (dome * 0.8 - edge * 0.4) * uSkin.y * k;
    fishRough += (edge * 0.18 - spark * 0.25) * k;

    // えらぶた: 目の後ろの弧の溝
    vec2 gc = vec2(uEye.x + 0.015, uEye.y - uBodyH * 0.06);
    float gr = uBodyH * 0.32 + 0.03;
    float gd = length((lp.xy - gc) * vec2(1.0, 0.82)) - gr;
    float gill = smoothstep(0.012, 0.0, abs(gd)) * step(lp.x, gc.x) * smoothstep(0.42, 0.25, abs(yn)) * bodyMask * uSkin.w;
    body *= 1.0 - gill * 0.22;
    fishH -= gill * 0.5 / max(uSkin.y, 0.05);
  }

  // 目: 黒い瞳と、細い金属光沢の虹彩。うるんだ膨らみ
  float side = step(0.3, abs(vFishNz)) * bodyMask;
  float ed = length(lp.xy - uEye.xy);
  if (uSkin.x > 0.0) {
    float eyeIn = smoothstep(uEye.z * 1.05, uEye.z * 0.92, ed) * side;
    float pupil = smoothstep(uEye.z * 0.72, uEye.z * 0.6, ed);
    vec3 eye = mix(uEyeIris * (0.75 + 0.5 * fishNoise(lp.xy * 260.0)), vec3(0.006), pupil);
    body = mix(body * (1.0 - smoothstep(uEye.z * 1.5, uEye.z, ed) * 0.35 * side), eye, eyeIn);   // 目のまわりは少し暗い
    fishEye = eyeIn;
    fishH += sqrt(max(0.0, 1.0 - pow(ed / uEye.z, 2.0))) * 0.6 * side / max(uSkin.y, 0.05);
  } else {
    float pupil = smoothstep(uEye.z * 0.62, uEye.z * 0.5, ed);
    float iris = smoothstep(uEye.z, uEye.z * 0.88, ed);
    body = mix(body, mix(vec3(0.55, 0.52, 0.42), vec3(0.008), pupil), iris * side);
  }

  diffuseColor.rgb *= body;
  // ヒレは半透明。付け根は濃く、縁ほど薄い
  float finEdge = smoothstep(0.0, 0.3, length(vec2(min(lp.x - uEye.x + 0.9, 0.0), abs(yn) - 0.45)));
  if (uFinRays > 0.0) {
    // 体から離れるほど薄く: 背びれ・尻びれは体の上下の縁から、尾びれは付け根から測る。
    // 付け根を濃くすると、体とヒレがひと続きの菱形に見える
    float far = lp.x < uTailX ? (uTailX - lp.x) / 0.26 : (abs(yn) - 0.45) / 0.65;
    finEdge = smoothstep(0.0, 1.0, far);
  }
  float finA = clamp(mix(uFinAlpha.x, uFinAlpha.y, finEdge) + rays * 0.18, 0.0, 1.0);
  if (abs(vFin - 0.8) < 0.05) finA = 0.85;        // 腹びれの糸
  if (abs(vFin - 0.6) < 0.05) finA = 0.3;         // 胸びれ(ほぼ透明)
  diffuseColor.a = mix(1.0, finA, step(0.5, vFin));
  fishFinMask = vFin;
}
