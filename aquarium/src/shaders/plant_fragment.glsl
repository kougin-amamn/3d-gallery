// 光が葉を透ける表現(先端ほど明るい)
totalEmissiveRadiance += diffuseColor.rgb * uSunColor * uSunIntensity * (0.015 + 0.06 * vPlantH);
