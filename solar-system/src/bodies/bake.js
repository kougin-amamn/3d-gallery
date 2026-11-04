import * as THREE from 'three';

// 手続き生成の地表を GPU で正距円筒図法のテクスチャに焼き込む(起動時に1回)。
const KINDS = { cratered: 0, mars: 1, venus: 2, jupiter: 3, saturn: 4, icegiant: 5, io: 6, europa: 7, ganymede: 8, pluto: 9, titan: 10, sun: 11 };

export function createBaker(renderer, shaders) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const uniforms = {
    uKind: { value: 0 },
    uC: { value: Array.from({ length: 5 }, () => new THREE.Vector3()) },
    uSeed: { value: 0 },
    uMaria: { value: 0 },
    uCraters: { value: 0 },
    uFlow: { value: 1 },
    uSpot: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: shaders.bake_vert,
    fragmentShader: shaders.noise + shaders.bake_frag,
    depthTest: false,
    depthWrite: false,
  });
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
  const tmp = new THREE.Color();
  const rgb = {};

  return {
    bake(body, width) {
      const s = body.surface;
      const kind = KINDS[s.kind];
      if (kind === undefined) throw new Error(`bodies.json: ${body.id} の surface.kind「${s.kind}」は未対応です`);
      uniforms.uKind.value = kind;
      for (let i = 0; i < 5; i++) {
        tmp.set(s.colors[Math.min(i, s.colors.length - 1)]);
        tmp.getRGB(rgb, THREE.SRGBColorSpace);
        uniforms.uC.value[i].set(rgb.r, rgb.g, rgb.b);
      }
      uniforms.uSeed.value = [...body.id].reduce((a, c) => a + c.charCodeAt(0), 0) * 0.137;
      uniforms.uMaria.value = s.maria ?? 0;
      uniforms.uCraters.value = s.craters ?? 0;
      uniforms.uFlow.value = s.flow ?? 1;
      uniforms.uSpot.value = s.spot ?? 0;

      const rt = new THREE.WebGLRenderTarget(width, width / 2, {
        generateMipmaps: true,
        minFilter: THREE.LinearMipmapLinearFilter,
        magFilter: THREE.LinearFilter,
        wrapS: THREE.RepeatWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        depthBuffer: false,
      });
      rt.texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      const prev = renderer.getRenderTarget();
      const prevTone = renderer.toneMapping;
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.setRenderTarget(rt);
      renderer.render(scene, camera);
      renderer.setRenderTarget(prev);
      renderer.toneMapping = prevTone;
      return rt.texture;
    },
    dispose() { material.dispose(); },
  };
}

// 土星の環の半径方向の模様(色と不透明度)。半径は km で、実際の環の構造に合わせる
export function makeRingTexture(rings) {
  const N = 2048;
  const data = new Uint8Array(N * 4);
  const span = rings.outerKm - rings.innerKm;
  // 決定的な乱数(細かな環の筋)
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const ripple = new Float32Array(N);
  for (let i = 0; i < N; i++) ripple[i] = rand();
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const band = (r, a, b, soft = 300) => smooth(a - soft, a + soft, r) * (1 - smooth(b - soft, b + soft, r));

  for (let i = 0; i < N; i++) {
    const r = rings.innerKm + (i / (N - 1)) * span;
    const fine = 0.75 + 0.25 * (ripple[i] * 0.5 + ripple[(i + 3) % N] * 0.3 + ripple[(i + 11) % N] * 0.2);
    let op = 0, bright = 0.7, warm = 0.5;
    // C環(薄く暗い)
    op += band(r, 74658, 92000, 400) * (0.1 + 0.08 * Math.sin(r / 900)) ;
    // B環(最も濃く明るい)
    const bT = (r - 92000) / (117580 - 92000);
    op += band(r, 92000, 117580, 250) * (0.72 + 0.25 * Math.sin(bT * Math.PI));
    // カッシーニの間隙
    op *= 1 - band(r, 117580, 122170, 120) * 0.95;
    // A環とエンケの間隙
    op += band(r, 122170, 136775, 200) * 0.55;
    op *= 1 - band(r, 133423, 133745, 40);
    op *= 1 - band(r, 136485, 136530, 15);
    // F環(細い)
    op += Math.exp(-Math.pow((r - 140180) / 220, 2)) * 0.5;
    op = Math.min(0.97, op * fine);

    if (r < 92000) { bright = 0.45; warm = 0.35; }
    else if (r < 117580) { bright = 0.92; warm = 0.6; }
    else if (r < 122170) { bright = 0.4; warm = 0.3; }
    else { bright = 0.75; warm = 0.45; }
    const c = rings.color;
    const k = bright * (0.9 + 0.1 * ripple[i]);
    data[i * 4] = Math.min(255, (c[0] + warm * 0.05) * k * 255);
    data[i * 4 + 1] = Math.min(255, c[1] * k * 255);
    data[i * 4 + 2] = Math.min(255, (c[2] - warm * 0.05) * k * 255);
    data[i * 4 + 3] = op * 255;
  }
  const tex = new THREE.DataTexture(data, N, 1);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
