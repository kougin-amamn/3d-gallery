import * as THREE from 'three';

// スタジオ: 暗い部屋に光の板(ソフトボックス)を置いて撮影した環境マップを作る。
// 磨いた金属にはこの光の板がくっきり写り込み、それが金属らしさになる。
export function createStudio(renderer, scene, cfg) {
  const room = new THREE.Scene();
  room.background = new THREE.Color(cfg.background).multiplyScalar(0.6);
  // 部屋の壁(ごく暗い、床だけ少し明るい)
  const walls = new THREE.Mesh(
    new THREE.SphereGeometry(120, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = mix(vec3(0.020,0.016,0.014), vec3(0.006,0.006,0.008), smoothstep(-0.2, 0.6, h)); gl_FragColor = vec4(c, 1.0); }',
    })
  );
  room.add(walls);
  for (const b of cfg.softboxes) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(b.size[0], b.size[1]),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(b.color).multiplyScalar(b.intensity), side: THREE.DoubleSide })
    );
    m.position.set(...b.pos);
    m.lookAt(0, 0, 0);
    room.add(m);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(room, 0.0, 0.1, 400);
  scene.environment = rt.texture;
  scene.environmentIntensity = cfg.environmentIntensity;
  scene.background = new THREE.Color(cfg.background);
  pmrem.dispose();

  // 影を落とす主光源と、弱い補助光
  const key = new THREE.DirectionalLight(cfg.key.color, cfg.key.intensity);
  key.position.set(...cfg.key.dir).normalize().multiplyScalar(160);
  key.castShadow = true;
  key.shadow.mapSize.set(cfg.key.shadowSize, cfg.key.shadowSize);
  const sc = key.shadow.camera;
  sc.left = -62; sc.right = 62; sc.top = 62; sc.bottom = -62; sc.near = 60; sc.far = 280;
  key.shadow.bias = -0.0002;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 3;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(cfg.fill.color, cfg.fill.intensity);
  fill.position.set(...cfg.fill.dir).normalize().multiplyScalar(60);
  scene.add(fill);
  return { key, fill, envTexture: rt.texture };
}
