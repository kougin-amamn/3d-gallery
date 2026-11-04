// 画質プリセットと自動調整。フレームレートが落ちたら段階的に下げる(上げ直しはしない)。
export function createQuality(cfg, apply, initial) {
  const order = ['low', 'medium', 'high'];
  const isMobile = matchMedia('(pointer: coarse)').matches || /Mobi|Android/i.test(navigator.userAgent);
  let mode = initial || cfg.default;
  let tier = mode === 'auto' ? (isMobile ? cfg.auto.mobile : cfg.auto.desktop) : mode;
  let elapsed = 0, frames = 0, windowT = 0;
  const listeners = [];

  const set = (t) => {
    tier = t;
    apply(cfg.tiers[t], t);
    for (const fn of listeners) fn(mode, tier);
  };

  return {
    get mode() { return mode; },
    get tier() { return tier; },
    onChange(fn) { listeners.push(fn); },
    start() { set(tier); },
    setMode(m) {
      mode = m;
      elapsed = 0; frames = 0; windowT = 0;
      set(m === 'auto' ? (isMobile ? cfg.auto.mobile : cfg.auto.desktop) : m);
    },
    tick(dt) {
      if (mode !== 'auto') return;
      elapsed += dt;
      if (elapsed < cfg.auto.warmupSeconds) return;
      frames++; windowT += dt;
      if (windowT < cfg.auto.windowSeconds) return;
      const fps = frames / windowT;
      frames = 0; windowT = 0;
      const i = order.indexOf(tier);
      if (fps < cfg.auto.downgradeBelowFps && i > 0) set(order[i - 1]);
    },
  };
}
