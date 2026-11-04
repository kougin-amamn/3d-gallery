// 体を進行方向と逆向きに伝わる波でくねらせる。頭は小さく、尾ほど大きく振れる。
vec3 transformed = vec3(position);
vFishLocal = position;
vFin = aFin;
vFishNz = normal.z;

float tail = clamp((0.32 - position.x) / 0.82, 0.0, 1.0);
float amp = uSwimAmp * aSwim.y;
float wave = sin(position.x * uWaveK - aSwim.x);
transformed.z += wave * amp * (0.1 + tail * tail * 1.15);
transformed.z -= sin(aSwim.x) * amp * 0.18 * (1.0 - tail);

// ヒレのはためき(背びれ・尻びれ)
transformed.z += aFin * (1.0 - tail * 0.5) * sin(aSwim.x * 1.4 + position.x * 9.0 + position.y * 6.0) * 0.012;
