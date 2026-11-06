// ネオンの発光と、光が透けるヒレ
totalEmissiveRadiance += uAccent * fishGlow * uGlow * 0.6;
totalEmissiveRadiance += diffuseColor.rgb * fishFinMask * uSunColor * uSunIntensity * 0.045;
// 周囲の水に散乱した光による柔らかい補助光(逆光で真っ黒にならないように)
// 水の色をそのまま足すと暖色が青緑にくすむので、明るさだけを主に足す
float uwLum = dot(uShallow, vec3(0.299, 0.587, 0.114));
totalEmissiveRadiance += diffuseColor.rgb * mix(vec3(uwLum), uShallow, 0.35) * 0.32;
