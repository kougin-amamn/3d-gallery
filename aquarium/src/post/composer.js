import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// 描画 → ブルーム → トーンマッピング → 仕上げ(色調・ビネット・粒子感)
export function createComposer(renderer, scene3d, camera, shaders) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);

  composer.addPass(new RenderPass(scene3d, camera));

  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.3, 0.65, 0.82);
  composer.addPass(bloom);

  composer.addPass(new OutputPass());

  const grade = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uContrast: { value: 1 },
      uSaturation: { value: 1 },
      uWarmth: { value: 0 },
      uVignette: { value: 0.4 },
      uGrain: { value: 0.03 },
      uAberration: { value: 1 },
      uResolution: { value: new THREE.Vector2(size.x, size.y) },
    },
    vertexShader: shaders.post_vert,
    fragmentShader: shaders.grade_frag,
  });
  composer.addPass(grade);

  return {
    composer,
    bloom,
    grade,
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
