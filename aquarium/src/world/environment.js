import * as THREE from 'three';

// 背景(水の広がり)と、PBR反射用の環境マップ。
export function createEnvironment(renderer, scene3d, uniforms, shaders) {
  const viewOrigin = { value: new THREE.Vector3() };
  const material = new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uViewOrigin: viewOrigin },
    vertexShader: shaders.world_vert,
    fragmentShader: shaders.common + shaders.background_frag,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(90, 48, 24), material);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  scene3d.add(dome);

  // 環境マップ用(同じ見た目を別シーンで撮る)
  const envOrigin = new THREE.Vector3(0, 4, 0);
  const envMat = material.clone();
  envMat.uniforms = { ...uniforms, uViewOrigin: { value: envOrigin } };
  const envScene = new THREE.Scene();
  // PMREM は原点から撮影するので、球は原点に置き、色の計算だけ水中の高さを基準にする
  const envDome = new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16), envMat);
  envScene.add(envDome);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null;

  function refreshEnv() {
    const next = pmrem.fromScene(envScene, 0.02, 0.1, 100);
    scene3d.environment = next.texture;
    if (envRT) envRT.dispose();
    envRT = next;
  }
  refreshEnv();
  scene3d.environmentIntensity = 0.6;

  return {
    dome,
    refreshEnv,
    update(camera) {
      dome.position.copy(camera.position);
      viewOrigin.value.copy(camera.position);
    },
  };
}
