// 開発用の調整パネル(URLに ?dev を付けたときだけ読み込む)。
// 決まった値は「JSONをコピー」で data/palettes.json に書き戻す。
export async function createDevGui(lighting, post, info) {
  const { default: GUI } = await import('three/addons/libs/lil-gui.module.min.js');
  const gui = new GUI({ title: '調整(開発用)' });
  const s = lighting.state;
  const apply = () => lighting.applyNow();

  const color = (obj, key) => {
    const proxy = { v: '#' + obj[key].getHexString() };
    return [proxy, 'v', (v) => { obj[key].set(v); apply(); }];
  };

  const water = gui.addFolder('水');
  for (const k of ['shallow', 'deep']) {
    const [p, kk, fn] = color(s, k);
    water.addColor(p, kk).name(k).onChange(fn);
  }
  water.add(s.absorb, 'x', 0, 0.4, 0.001).name('吸収 赤').onChange(apply);
  water.add(s.absorb, 'y', 0, 0.2, 0.001).name('吸収 緑').onChange(apply);
  water.add(s.absorb, 'z', 0, 0.2, 0.001).name('吸収 青').onChange(apply);
  water.add(s, 'fogDensity', 0.2, 2, 0.01).name('フォグ濃度').onChange(apply);

  const light = gui.addFolder('光');
  const [sp, sk, sfn] = color(s, 'sunColor');
  light.addColor(sp, sk).name('光の色').onChange(sfn);
  light.add(s, 'sunIntensity', 0, 6, 0.01).name('強さ').onChange(apply);
  light.add(s, 'ambient', 0, 2, 0.01).name('環境光').onChange(apply);
  light.add(s, 'rays', 0, 3, 0.01).name('光の筋').onChange(apply);
  light.add(s, 'caustics', 0, 4, 0.01).name('コースティクス').onChange(apply);
  light.add(s, 'snowGlow', 0, 4, 0.01).name('浮遊粒子').onChange(apply);

  const fx = gui.addFolder('仕上げ');
  fx.add(s, 'exposure', 0.3, 2, 0.01).name('露出').onChange(apply);
  fx.add(s, 'bloom', 0, 2, 0.01).name('ブルーム').onChange(apply);
  for (const [k, lo, hi] of [['contrast', 0.7, 1.4], ['saturation', 0.5, 1.6], ['warmth', -0.2, 0.2], ['vignette', 0, 1], ['grain', 0, 0.12]]) {
    fx.add(s.grade, k, lo, hi, 0.001).onChange(apply);
  }

  gui.add({
    copy() {
      const hex = (c) => '#' + c.getHexString().toUpperCase();
      const round = (v) => Math.round(v * 1000) / 1000;
      const out = {
        sunColor: hex(s.sunColor), sunIntensity: round(s.sunIntensity),
        sunDir: s.sunDir.toArray().map(round), ambient: round(s.ambient),
        shallow: hex(s.shallow), deep: hex(s.deep), absorb: s.absorb.toArray().map(round),
        fogDensity: round(s.fogDensity), rays: round(s.rays), caustics: round(s.caustics),
        exposure: round(s.exposure), bloom: round(s.bloom), snowGlow: round(s.snowGlow),
        grade: Object.fromEntries(Object.entries(s.grade).map(([k, v]) => [k, round(v)])),
      };
      navigator.clipboard?.writeText(JSON.stringify({ [lighting.name]: out }, null, 2));
    },
  }, 'copy').name('現在の時間帯をJSONでコピー');

  const stats = { fps: 0, tier: '' };
  gui.add(stats, 'fps').listen().disable();
  gui.add(stats, 'tier').name('画質').listen().disable();
  return {
    update(fps) { stats.fps = Math.round(fps); stats.tier = info().tier; },
  };
}
