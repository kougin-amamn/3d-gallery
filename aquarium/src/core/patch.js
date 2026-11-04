// Three.js 標準マテリアルに水中表現(色の吸収・フォグ・コースティクス)を組み込む。
// 種類ごとの追加処理(魚の遊泳、水草の揺れ)も同じ仕組みで差し込む。

/**
 * @param {THREE.Material} material
 * @param {object} opts
 * @param {object} opts.shared     全マテリアル共通のuniform(参照を共有するので更新が全体に伝わる)
 * @param {object} opts.shaders    読み込み済みのGLSL
 * @param {string} opts.key        プログラムキャッシュ用の識別子
 * @param {object} [opts.uniforms] このマテリアル専用のuniform
 * @param {boolean} [opts.caustics=true]
 * @param {boolean} [opts.worldFromVertex=true] false のときは独自処理で vUwWorld を設定する
 * @param {Array} [opts.vertex]   [{ at, code, mode }] mode: 'before' | 'after' | 'replace'
 * @param {Array} [opts.fragment]
 */
export function patchUnderwater(material, opts) {
  const {
    shared, shaders, key, uniforms = {}, caustics = true,
    worldFromVertex = true, vertex = [], fragment = [], defines = {},
  } = opts;

  material.defines = { ...(material.defines || {}), ...defines };
  if (caustics) material.defines.UW_CAUSTICS = '';

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared, uniforms);

    let vs = shader.vertexShader;
    let fs = shader.fragmentShader;

    vs = inject(vs, '#include <common>', shaders.uw_pars_vertex, 'after');
    if (worldFromVertex) vs = inject(vs, '#include <project_vertex>', shaders.uw_vertex, 'after');
    for (const p of vertex) vs = inject(vs, p.at, p.code, p.mode);

    fs = inject(fs, '#include <common>', shaders.common + '\n' + shaders.uw_pars_fragment, 'after');
    fs = inject(fs, '#include <opaque_fragment>', shaders.uw_light, 'before');
    fs = inject(fs, '#include <fog_fragment>', 'gl_FragColor.rgb = uwApply(gl_FragColor.rgb, vUwWorld);', 'replace');
    for (const p of fragment) fs = inject(fs, p.at, p.code, p.mode);

    shader.vertexShader = vs;
    shader.fragmentShader = fs;
  };
  material.customProgramCacheKey = () => `uw:${key}`;
  return material;
}

function inject(src, at, code, mode = 'after') {
  if (!src.includes(at)) throw new Error(`シェーダーの差し込み位置が見つかりません: ${at}`);
  if (mode === 'replace') return src.replace(at, code);
  if (mode === 'before') return src.replace(at, `${code}\n${at}`);
  return src.replace(at, `${at}\n${code}`);
}
