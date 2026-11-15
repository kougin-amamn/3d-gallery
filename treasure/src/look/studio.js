import * as THREE from 'three';

// 撮影スタジオ: パステルの背景、光の板を並べた環境マップ(金具の写り込み)、主光源と影、丸い台。

const gradientVert = 'varying vec3 vP; void main(){ vP = position; vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; }';
const gradientFrag = `
  uniform vec3 top; uniform vec3 bottom; uniform vec3 horizon;
  varying vec3 vP;
  void main(){
    float h = normalize(vP).y;
    vec3 c = h > 0.0 ? mix(horizon, top, smoothstep(0.0, 0.7, h)) : mix(horizon, bottom, smoothstep(0.0, -0.5, h));
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }`;

/** 画面に貼る背景: 上が空色、下がピンクの縦グラデーション(視点を回しても変わらないポスターのような背景) */
function screenBackdrop(cfg) {
  const lin = (h) => new THREE.Color(h);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    depthWrite: false, depthTest: false,
    uniforms: { top: { value: lin(cfg.top) }, bottom: { value: lin(cfg.bottom) }, horizon: { value: lin(cfg.horizon) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 horizon; varying vec2 vUv;
      void main(){ float y = vUv.y; vec3 c = y > 0.45 ? mix(horizon, top, smoothstep(0.45, 1.0, y)) : mix(bottom, horizon, smoothstep(0.0, 0.45, y));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  m.frustumCulled = false;
  m.renderOrder = -10;
  return m;
}

function backdrop(cfg, radius) {
  const lin = (h) => new THREE.Color(h);
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { top: { value: lin(cfg.top) }, bottom: { value: lin(cfg.bottom) }, horizon: { value: lin(cfg.horizon) } },
      vertexShader: gradientVert, fragmentShader: gradientFrag,
    })
  );
}

export function createStudio(renderer, scene, cfg) {
  // 環境マップ: 背景と同じ色の部屋に、白い光の板を置いて撮る
  const room = new THREE.Scene();
  // 写り込み用の部屋は暖かい白の天井と、台と同じ色の床。金が濁らないように青は入れない
  const walls = backdrop(cfg.envRoom, 30);
  for (const k of ['top', 'bottom', 'horizon']) walls.material.uniforms[k].value.multiplyScalar(cfg.envRoom.brightness);
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
  const rt = pmrem.fromScene(room, 0.02, 0.1, 100);
  scene.environment = rt.texture;
  scene.environmentIntensity = cfg.environmentIntensity;
  pmrem.dispose();

  scene.add(screenBackdrop(cfg.background));

  // 主光源(柔らかい影)と補助光
  const key = new THREE.DirectionalLight(cfg.key.color, cfg.key.intensity);
  key.position.set(...cfg.key.dir).normalize().multiplyScalar(6);
  key.castShadow = true;
  key.shadow.mapSize.set(cfg.key.shadowSize, cfg.key.shadowSize);
  const sc = key.shadow.camera;
  sc.left = -2.2; sc.right = 2.2; sc.top = 2.2; sc.bottom = -2.2; sc.near = 2; sc.far = 12;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.012;
  key.shadow.radius = 6;
  key.shadow.blurSamples = 16;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(cfg.fill.color, cfg.fill.intensity);
  fill.position.set(...cfg.fill.dir).normalize().multiplyScalar(6);
  scene.add(fill);
  const hemi = new THREE.HemisphereLight(cfg.hemi.sky, cfg.hemi.ground, cfg.hemi.intensity);
  scene.add(hemi);

  // 台: 上の縁が丸い円柱
  const P = cfg.pedestal;
  const r = P.radius, h = P.height, e = 0.05;
  const prof = [[0, -h * 4], [r - 0.02, -h * 4], [r, -h * 4 + 0.02], [r, -e]];
  for (let i = 1; i <= 8; i++) { const a = (i / 8) * Math.PI / 2; prof.push([r - e + e * Math.cos(a), -e + e * Math.sin(a)]); }
  prof.push([0, 0]);
  const pedGeo = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 96);
  const pedestal = new THREE.Mesh(pedGeo, new THREE.MeshStandardMaterial({ color: P.color, roughness: 0.78, metalness: 0 }));
  pedestal.receiveShadow = true;
  scene.add(pedestal);

  return { key, fill, hemi, pedestal, envTexture: rt.texture };
}

/** 接地影: 箱のすぐ下の、光が回り込まない暗がり */
export function contactShadow(w, d) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(128, 128, 20, 128, 128, 128);
  g.addColorStop(0, 'rgba(40,40,50,0.75)'); g.addColorStop(0.5, 'rgba(40,40,50,0.35)'); g.addColorStop(1, 'rgba(60,30,40,0)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  m.position.y = 0.002;
  m.renderOrder = 1;
  return m;
}

/**
 * 金属だけが映す環境: 暗い部屋に強い光の板。
 * 金属は「何が映るか」がそのまま色になる。明るい部屋を映すと全面が同じ黄色になって塗装のように見えるので、
 * 金属には暗い部分と鋭い光の両方がある部屋を映す(背景とは別)。
 */
export function createMetalEnv(renderer, cfg) {
  const room = new THREE.Scene();
  const walls = backdrop({ top: cfg.ceiling, horizon: cfg.wall, bottom: cfg.floor }, 30);
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
  const rt = pmrem.fromScene(room, 0.0, 0.1, 100);
  pmrem.dispose();
  return rt.texture;
}
