import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// HDR描画 → ブルーム → トーンマッピング → レンズフレアと仕上げ
export function createComposer(renderer, scene, camera, shaders) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.55, 0.6, 1.0);
  // ブルームはぼかすだけなので、半分の解像度で計算しても見た目はほぼ変わらない
  const bloomSetSize = bloom.setSize.bind(bloom);
  bloom.setSize = (w, h) => bloomSetSize(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)));
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uResolution: { value: new THREE.Vector2(size.x, size.y) },
      uSun: { value: new THREE.Vector3() },
      uFlare: { value: 1 },
      uVignette: { value: 0.35 },
      uGrain: { value: 0.018 },
      uTime: { value: 0 },
    },
    vertexShader: shaders.post_vert,
    fragmentShader: shaders.grade_frag,
  });
  composer.addPass(grade);

  return {
    composer, bloom, grade,
    setSamples(n) {
      for (const t of [composer.renderTarget1, composer.renderTarget2]) {
        if (t.samples !== n) { t.samples = n; t.dispose(); }
      }
    },
    setSize(w, h, pr) {
      composer.setPixelRatio(pr);
      composer.setSize(w, h);
      grade.uniforms.uResolution.value.set(w * pr, h * pr);
    },
    render(dt) { composer.render(dt); },
  };
}
