// 操作バー・情報パネル・ラベル
import { SPEEDS } from '../core/clock.js';

const TYPE = { star: '恒星 · Star', planet: '惑星 · Planet', moon: '衛星 · Moon', dwarf: '準惑星 · Dwarf planet' };
const fmt = (n, d = 0) => n.toLocaleString('ja-JP', { maximumFractionDigits: d, minimumFractionDigits: d });

function lightTime(km) {
  const s = km / 299792.458;
  if (s < 60) return `${fmt(s, 1)}秒`;
  if (s < 3600) return `${fmt(s / 60, 1)}分`;
  return `${fmt(s / 3600, 1)}時間`;
}
function distText(km) {
  const au = km / 149597870.7;
  if (au < 0.05) return `${fmt(km)}<small>km</small>`;
  return `${fmt(au, au < 10 ? 3 : 2)}<small>au</small>`;
}
function periodText(days) {
  if (days > 730) return `${fmt(days / 365.25, 2)}年`;
  return `${fmt(days, days < 30 ? 2 : 1)}日`;
}

export function createHud({ bodies, theme, clock, onSelect, onScale, onToggle, onQuality, onDate }) {
  const $ = (id) => document.getElementById(id);
  const bar = $('bar'), panel = $('panel');

  // ---- 天体の選択 ----
  const chips = {};
  const bodiesRow = $('bodies');
  const addChip = (id, label, cls, key) => {
    const b = document.createElement('button');
    b.className = `chip ${cls}`;
    b.type = 'button';
    b.dataset.id = id;
    b.setAttribute('aria-pressed', 'false');
    const color = theme.dotColors[id] || (id === 'sun' ? '#FFB46B' : '#D8E1EA');
    b.innerHTML = `${cls === 'system' ? '' : `<i style="--c:${color}"></i>`}<span>${label}</span>${key ? `<kbd>${key}</kbd>` : ''}`;
    b.addEventListener('click', () => onSelect(id));
    bodiesRow.appendChild(b);
    chips[id] = b;
  };
  addChip('system', '全体', 'system', '');
  for (const d of bodies) if (d.type !== 'moon') addChip(d.id, d.name, '', d.key);
  const moonChips = [];

  function setMoonChips(parentId) {
    for (const c of moonChips) { c.remove(); delete chips[c.dataset.id]; }
    moonChips.length = 0;
    const moons = bodies.filter((d) => d.parent === parentId && d.type === 'moon');
    const anchor = chips[parentId];
    if (!anchor) return;
    let after = anchor;
    for (const m of moons) {
      addChip(m.id, m.name, 'moon', '');
      const c = chips[m.id];
      after.after(c);
      after = c;
      moonChips.push(c);
    }
  }

  // ---- 時間 ----
  const toggleBtn = $('t-toggle');
  const dateInput = $('t-date');
  $('t-slower').addEventListener('click', () => clock.slower());
  $('t-faster').addEventListener('click', () => clock.faster());
  toggleBtn.addEventListener('click', () => clock.toggle());
  $('t-now').addEventListener('click', () => clock.now());
  let editingDate = false;
  dateInput.addEventListener('focus', () => { editingDate = true; });
  dateInput.addEventListener('blur', () => { editingDate = false; });
  dateInput.addEventListener('change', () => {
    const v = Date.parse(dateInput.value);
    if (Number.isFinite(v)) onDate(v);
    dateInput.blur(); // キー操作(天体の選択など)をすぐ使えるようにする
  });
  const pad = (n) => String(n).padStart(2, '0');
  const localValue = (ms) => {
    const d = new Date(ms);
    const y = d.getFullYear();
    if (y < 1 || y > 9999) return '';
    return `${String(y).padStart(4, '0')}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  function syncTime() {
    $('t-speed').textContent = clock.label;
    toggleBtn.classList.toggle('paused', clock.paused);
    toggleBtn.setAttribute('aria-label', clock.paused ? '再生' : '一時停止');
  }
  clock.onChange(syncTime);
  syncTime();

  // ---- スケール・表示 ----
  const scaleBtns = [...document.querySelectorAll('#scale button')];
  for (const b of scaleBtns) b.addEventListener('click', () => onScale(Number(b.dataset.scale)));
  const toggles = { orbits: $('tg-orbits'), labels: $('tg-labels') };
  for (const [key, b] of Object.entries(toggles)) {
    b.addEventListener('click', () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on));
      onToggle(key, on);
    });
  }
  const quality = $('quality');
  quality.addEventListener('change', () => onQuality(quality.value));
  $('fullscreen').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  });

  // 操作バーの高さ(スマホで情報パネルを上に置くため)
  const syncBarHeight = () => document.documentElement.style.setProperty('--bar-h', `${bar.offsetHeight}px`);
  new ResizeObserver(syncBarHeight).observe(bar);
  syncBarHeight();

  // ---- 操作がないと薄くする ----
  let idleTimer = 0;
  const wake = () => {
    bar.classList.remove('dim');
    panel.classList.remove('dim');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { bar.classList.add('dim'); panel.classList.add('dim'); }, 7000);
  };
  for (const ev of ['pointermove', 'pointerdown', 'keydown', 'wheel']) window.addEventListener(ev, wake, { passive: true });
  wake();

  // ---- キー操作 ----
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    const d = bodies.find((b) => b.key === e.key);
    if (d) { onSelect(d.id); return; }
    if (e.key === ' ') { e.preventDefault(); clock.toggle(); }
    if (e.key === '[') clock.slower();
    if (e.key === ']') clock.faster();
    if (e.key === 'Escape') onSelect('system');
  });

  // ---- 情報パネル ----
  function showInfo(id, facts) {
    const d = bodies.find((b) => b.id === id);
    if (!d) {
      $('p-type').textContent = 'Overview';
      $('p-name').textContent = '太陽系';
      $('p-en').textContent = 'Solar System';
      $('p-facts').innerHTML = facts;
      $('p-desc').textContent = '天体を選ぶか、画面の天体をクリックすると移動します。ドラッグで視点を回し、ホイールで寄れます。';
      return;
    }
    $('p-type').textContent = TYPE[d.type] || '';
    $('p-name').textContent = d.name;
    $('p-en').textContent = d.en;
    $('p-facts').innerHTML = facts;
    $('p-desc').textContent = d.info?.desc || '';
  }

  return {
    setFocus(id) {
      for (const [k, c] of Object.entries(chips)) c.setAttribute('aria-pressed', String(k === id));
      const d = bodies.find((b) => b.id === id);
      const parent = d ? (d.type === 'moon' ? d.parent : d.id) : null;
      setMoonChips(parent);
      for (const [k, c] of Object.entries(chips)) c.setAttribute('aria-pressed', String(k === id));
      chips[id]?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    },
    setScale(v) {
      for (const b of scaleBtns) b.setAttribute('aria-checked', String(Number(b.dataset.scale) === v));
      const note = $('mode-note');
      note.textContent = v ? '実寸表示:距離と大きさは実際の比率です' : '見やすい表示:距離と大きさは実際と異なります';
      note.classList.toggle('real', !!v);
    },
    setQuality(mode, tier) {
      quality.value = mode;
      quality.querySelector('option[value="auto"]').textContent = mode === 'auto' ? `画質 自動(${{ low: '低', medium: '中', high: '高' }[tier]})` : '画質 自動';
    },
    updateTime(ms) { if (!editingDate) dateInput.value = localValue(ms); },
    showInfo,
    facts: { lightTime, distText, periodText, fmt },
  };
}

// ---- ラベル(天体名) ----
export function createLabels(root, onClick) {
  const items = new Map();
  return {
    add(id, text, cls) {
      const el = document.createElement('div');
      el.className = `label ${cls}`;
      el.textContent = text;
      if (cls !== 'star') el.addEventListener('click', () => onClick(id));
      root.appendChild(el);
      items.set(id, { el, x: 0, y: 0, visible: false });
    },
    /** placements: [{id, x, y, visible, priority}] 重なったら優先度の低い方を隠す */
    layout(placements) {
      const placed = [];
      placements.sort((a, b) => b.priority - a.priority);
      for (const p of placements) {
        const it = items.get(p.id);
        if (!it) continue;
        let show = p.visible;
        if (it.w === undefined || it.w === 0) it.w = it.el.offsetWidth;
        const w = it.w || 60;
        const cx = p.x + w / 2;
        if (show) {
          for (const q of placed) {
            if (Math.abs(q.x - cx) < (w + q.w) / 2 + 4 && Math.abs(q.y - p.y) < 15) { show = false; break; }
          }
        }
        if (show) {
          placed.push({ x: cx, y: p.y, w });
          it.el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y - 8)}px)`;
        }
        it.el.classList.toggle('hidden', !show);
      }
    },
    setVisible(on) { root.style.display = on ? '' : 'none'; },
  };
}
export { SPEEDS };
