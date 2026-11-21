// 肌の粗さ: うろこの縁は少し粗く、きらめくうろこと目はなめらか
roughnessFactor = clamp(roughnessFactor + fishRough, 0.04, 1.0);
roughnessFactor = mix(roughnessFactor, 0.06, fishEye);
