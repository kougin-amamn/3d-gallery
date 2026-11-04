// 時間の進め方。開いた瞬間の現在時刻から始め、段階的な速度で進める・戻す。
export const SPEEDS = [
  { s: -31557600, label: '−1年/秒' },
  { s: -2629800, label: '−1か月/秒' },
  { s: -604800, label: '−1週間/秒' },
  { s: -86400, label: '−1日/秒' },
  { s: -3600, label: '−1時間/秒' },
  { s: 0, label: '停止' },
  { s: 1, label: '実時間' },
  { s: 3600, label: '1時間/秒' },
  { s: 86400, label: '1日/秒' },
  { s: 604800, label: '1週間/秒' },
  { s: 2629800, label: '1か月/秒' },
  { s: 31557600, label: '1年/秒' },
];

// 計算できる範囲(JPLの表2が使える範囲)
const MIN_MS = Date.UTC(-2999, 0, 1);
const MAX_MS = Date.UTC(2999, 11, 31);

export function createClock(startMs = Date.now(), startIndex = 7) {
  let ms = startMs;
  let index = startIndex;
  let paused = false;
  let resume = startIndex;
  const listeners = [];
  const emit = () => listeners.forEach((fn) => fn());
  return {
    get ms() { return ms; },
    get speed() { return paused ? 0 : SPEEDS[index].s; },
    get label() { return paused ? '停止' : SPEEDS[index].label; },
    get index() { return index; },
    get paused() { return paused || SPEEDS[index].s === 0; },
    onChange(fn) { listeners.push(fn); },
    set(newMs) { ms = Math.min(MAX_MS, Math.max(MIN_MS, newMs)); emit(); },
    now() { ms = Date.now(); emit(); },
    faster() { paused = false; index = Math.min(SPEEDS.length - 1, index + 1); emit(); },
    slower() { paused = false; index = Math.max(0, index - 1); emit(); },
    setIndex(i) { paused = false; index = Math.min(SPEEDS.length - 1, Math.max(0, i)); emit(); },
    toggle() {
      if (this.paused) { paused = false; if (SPEEDS[index].s === 0) index = resume === 5 ? 7 : resume; }
      else { resume = index; paused = true; }
      emit();
    },
    tick(dtReal) {
      if (this.paused) return;
      ms = Math.min(MAX_MS, Math.max(MIN_MS, ms + dtReal * 1000 * SPEEDS[index].s));
    },
  };
}
