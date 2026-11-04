// 最小限の操作バー。操作したときだけ表示し、しばらく触らないと消える。
export function createHud({ onFeed, onTime, onQuality }) {
  const hud = document.getElementById('hud');
  const timeButtons = [...hud.querySelectorAll('[data-group="time"] button')];
  const quality = hud.querySelector('[data-act="quality"]');
  const feedBtn = hud.querySelector('[data-act="feed"]');
  let hideTimer = 0;
  let hovering = false;

  const show = () => {
    hud.classList.add('show');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { if (!hovering) hud.classList.remove('show'); }, 3500);
  };

  for (const ev of ['pointermove', 'pointerdown', 'keydown', 'touchstart']) {
    window.addEventListener(ev, show, { passive: true });
  }
  hud.addEventListener('pointerenter', () => { hovering = true; });
  hud.addEventListener('pointerleave', () => { hovering = false; show(); });
  hud.addEventListener('focusin', show);

  const feed = () => {
    onFeed();
    feedBtn.classList.remove('pulse');
    void feedBtn.offsetWidth;
    feedBtn.classList.add('pulse');
  };
  feedBtn.addEventListener('click', feed);

  for (const b of timeButtons) b.addEventListener('click', () => onTime(b.dataset.value));
  quality.addEventListener('change', () => onQuality(quality.value));

  hud.querySelector('[data-act="fullscreen"]').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  });

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLSelectElement) return;
    if (e.key === 'f' || e.key === 'F') feed();
    if (e.key === '1') onTime('morning');
    if (e.key === '2') onTime('day');
    if (e.key === '3') onTime('night');
  });

  return {
    show,
    setTime(name) {
      for (const b of timeButtons) b.setAttribute('aria-checked', String(b.dataset.value === name));
    },
    setQuality(mode, tier) {
      quality.value = mode;
      const auto = quality.querySelector('option[value="auto"]');
      auto.textContent = mode === 'auto' ? `画質 自動(${{ low: '低', medium: '中', high: '高' }[tier]})` : '画質 自動';
    },
  };
}
