// ネオンの発光と、光が透けるヒレ
totalEmissiveRadiance += uAccent * fishGlow * uGlow * 0.6;
totalEmissiveRadiance += diffuseColor.rgb * fishFinMask * uSunColor * uSunIntensity * 0.045;
// 周囲の水に散乱した光による柔らかい補助光(逆光で真っ黒にならないように)
totalEmissiveRadiance += diffuseColor.rgb * uShallow * 0.32;
