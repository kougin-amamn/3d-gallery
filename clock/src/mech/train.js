// 時刻から各部品の角度を計算する(描画に依存しない純粋な関数。Node でテストできる)。
// 角度はすべてラジアン。反時計回りが正(裏側から見た向き)。
//
// 考え方: フレームごとに角度を積み上げるとずれがたまるので、
// 「午前0時からの経過秒」から毎回すべての角度を求める。

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * 脱進機とてんぷの状態
 * @param {number} t 午前0時からの経過秒
 * @param {object} cfg movement.json
 */
export function escapementState(t, cfg) {
  const bps = cfg.beatsPerSecond;                 // 毎秒8振動
  const freq = bps / 2;                           // てんぷの周波数 4Hz
  const A = cfg.balance.amplitudeDeg * DEG;       // 振れ幅 270°
  const lift = cfg.balance.liftDeg * DEG;         // アンクルと噛み合う範囲(中心から±)
  const omega = TAU * freq;

  // てんぷ: 中心(角度0)を 1/8 秒ごとに通る単振動
  const balance = A * Math.sin(omega * t);

  // アンクル: てんぷの振り石が爪に入っている間だけ連動し、外では止まり(ドテピン)に当たっている
  const k = cfg.balance.rollerPinRadius / cfg.pallet.forkLength;
  const swing = cfg.pallet.swingDeg * DEG;
  const pallet = Math.max(-swing, Math.min(swing, -k * balance * (swing / (k * lift))));

  // ガンギ車: 噛み合いの間(衝撃の時間)に半歯ぶん進み、ほかは止まっている
  const n = Math.round(t * bps);                  // 最も近い「中心を通る」番号
  const window = Math.asin(Math.min(1, lift / A)) / omega; // 噛み合っている時間の半分(秒)
  const local = (t - n / bps) / window;           // -1〜1 が噛み合いの間
  let count;
  if (local <= -1) count = n;
  else if (local >= 1) count = n + 1;
  else {
    const s = (local + 1) / 2;
    // 前半はロックを外すだけ(ガンギ車は止まったまま)、後半で一気に半歯進む
    count = n + smooth(0.28, 0.92, s);
  }
  const halfPitch = TAU / cfg.escape.teeth / 2;
  return { balance, pallet, count, escape: -count * halfPitch, engaged: Math.abs(local) < 1 };
}

/**
 * 輪列と針の角度。count はガンギ車が進んだ半歯の数(= 振動の数)
 */
export function trainAngles(t, cfg) {
  const e = escapementState(t, cfg);
  // 振動数から数えた経過秒(1/8秒刻み)。半振動ぶんずらして実時刻との差を ±1/16 秒に収める
  const seconds = (e.count - 0.5) / cfg.beatsPerSecond;
  const fourth = (seconds / 60) * TAU;            // 4番車: 1分で1回転(秒針)
  const third = -(seconds / 450) * TAU;           // 3番車: 7.5分で1回転(逆向き)
  const center = (seconds / 3600) * TAU;          // 2番車: 1時間で1回転(分針)
  const barrel = -(seconds / 28800) * TAU;        // 香箱: 8時間で1回転
  const hour = (seconds / 43200) * TAU;           // 筒車: 12時間で1回転(時針)
  const day24 = -(seconds / 86400) * TAU;         // 24時間車
  return { ...e, seconds, fourth, third, center, barrel, hour, day24 };
}

/** 歯車どうしの比が設計どおりか(テスト用) */
export function trainRatios(cfg) {
  const by = Object.fromEntries(cfg.train.map((w) => [w.id, w]));
  const r = (a, b) => by[a].teeth / by[b].pinion;
  return {
    centerPerBarrel: r('barrel', 'center'),
    thirdPerCenter: r('center', 'third'),
    fourthPerThird: r('third', 'fourth'),
    escapePerFourth: r('fourth', 'escape'),
    motionWorks: (cfg.motionWorks.minuteWheel / cfg.motionWorks.cannonPinion) * (cfg.motionWorks.hourWheel / cfg.motionWorks.minutePinion),
  };
}

/**
 * かみ合う2つの歯車の初期角度を合わせる。
 * 駆動側の歯の中心が中心線上に来たとき、受け側は歯と歯の間が中心線に来るようにする。
 * @returns 受け側の角度 = phase − 駆動側角度 × (Na / Nb)
 */
export function meshPhase(centerA, centerB, Na, Nb) {
  const alpha = Math.atan2(centerB[1] - centerA[1], centerB[0] - centerA[0]);
  return { alpha, phase: alpha + Math.PI + Math.PI / Nb + alpha * (Na / Nb) };
}

/** 月齢(日)。基準の新月 2000-01-06 18:14 UTC と朔望月の平均から求める */
export function moonAgeDays(ms, synodic = 29.530589) {
  const ref = Date.UTC(2000, 0, 6, 18, 14);
  const d = (ms - ref) / 86400000;
  return ((d % synodic) + synodic) % synodic;
}
