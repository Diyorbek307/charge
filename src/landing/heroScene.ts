/**
 * The landing hero: a 3D map of Uzbekistan built from Natural Earth outlines.
 *
 * Plain three.js rather than a React renderer — the scene is one imperative
 * object the page drives through a handful of setters (pointer, scroll,
 * stations), and it is lazy-loaded so three.js stays out of the main bundle.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { UZ_RINGS } from './uzShape';

export type ScenePoint = { id: string; lat: number; lng: number };
export type SceneStation = ScenePoint & { power: number; free: number; total: number };

export interface HeroScene {
  setStations(stations: SceneStation[]): void;
  /** Pointer in -1..1 on both axes, relative to the canvas. */
  setPointer(x: number, y: number): void;
  /** 0 at the top of the page, 1 once the hero has scrolled out. */
  setScroll(p: number): void;
  /** City labels are DOM nodes the scene positions every frame. */
  setLabels(els: Map<string, HTMLElement>): void;
  /**
   * Hover picking. Pass the pointer in canvas pixels (or null when it leaves);
   * the scene keeps `tip` pinned above the hovered beam every frame and
   * reports the hovered station id when it changes.
   */
  setHover(px: { x: number; y: number } | null): void;
  setTooltip(tip: HTMLElement | null, onChange: (id: string | null) => void): void;
  resize(w: number, h: number): void;
  setRunning(on: boolean): void;
  dispose(): void;
}

const LNG0 = 64.4;
const LAT0 = 41.2;
const K = Math.cos((LAT0 * Math.PI) / 180);
const S = 1.15; // world units per degree of latitude
const DEPTH = 0.32; // extrusion height of the country slab
const TOP = DEPTH + 0.004;

const MINT = new THREE.Color('#3BF0C8');
const TEAL = new THREE.Color('#0E7C86');
const GOLD = new THREE.Color('#FFC857');

/** lng/lat → world x/z on the slab's top plane. North is away from the camera. */
function project(lng: number, lat: number): [number, number] {
  return [(lng - LNG0) * K * S, -(lat - LAT0) * S];
}

/** Even-odd test against every outer ring, in projected 2D. */
function inside(x: number, z: number, rings: [number, number][][]) {
  let hit = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, zi] = ring[i];
      const [xj, zj] = ring[j];
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
    }
  }
  return hit;
}

export const HUB_CITIES: ScenePoint[] = [
  { id: 'tashkent', lat: 41.311, lng: 69.24 },
  { id: 'samarkand', lat: 39.654, lng: 66.96 },
  { id: 'bukhara', lat: 39.775, lng: 64.429 },
  { id: 'khiva', lat: 41.378, lng: 60.364 },
  { id: 'nukus', lat: 42.46, lng: 59.603 },
  { id: 'namangan', lat: 40.998, lng: 71.673 },
  { id: 'andijan', lat: 40.783, lng: 72.344 },
  { id: 'fergana', lat: 40.386, lng: 71.787 },
  { id: 'navoi', lat: 40.103, lng: 65.374 },
  { id: 'karshi', lat: 38.861, lng: 65.789 },
  { id: 'termez', lat: 37.224, lng: 67.278 },
  { id: 'jizzakh', lat: 40.116, lng: 67.842 },
  { id: 'gulistan', lat: 40.49, lng: 68.784 },
  { id: 'kokand', lat: 40.529, lng: 70.943 },
  { id: 'urgench', lat: 41.55, lng: 60.633 },
];

/** Charging corridors along the main highways. */
const CORRIDORS: [string, string][] = [
  ['tashkent', 'gulistan'], ['gulistan', 'jizzakh'], ['jizzakh', 'samarkand'],
  ['samarkand', 'navoi'], ['navoi', 'bukhara'], ['bukhara', 'urgench'],
  ['urgench', 'khiva'], ['urgench', 'nukus'], ['samarkand', 'karshi'],
  ['karshi', 'termez'], ['tashkent', 'kokand'], ['kokand', 'fergana'],
  ['fergana', 'andijan'], ['kokand', 'namangan'], ['namangan', 'andijan'],
  ['bukhara', 'karshi'],
];

const glowVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export function createHeroScene(canvas: HTMLCanvasElement, opts: { lite: boolean; still: boolean }): HeroScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !opts.lite, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, opts.lite ? 1.5 : 2));
  renderer.setClearColor(0x04060c, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x04060c, 18, 42);

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  const world = new THREE.Group();
  scene.add(world);
  const map = new THREE.Group();
  world.add(map);

  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

  const uniforms = { uTime: { value: 0 } };

  // ── Country slab ──
  const rings = UZ_RINGS.map(r => r.map(([lng, lat]) => project(lng, lat)));
  const shapes = rings.map(r => new THREE.Shape(r.map(([x, z]) => new THREE.Vector2(x, -z))));
  const slabGeo = track(new THREE.ExtrudeGeometry(shapes, { depth: DEPTH, bevelEnabled: false, curveSegments: 1 }));
  slabGeo.rotateX(-Math.PI / 2);
  const capMat = track(new THREE.MeshStandardMaterial({ color: 0x07131c, roughness: 0.55, metalness: 0.4 }));
  const sideMat = track(
    new THREE.ShaderMaterial({
      uniforms: { uTop: { value: DEPTH }, uColor: { value: TEAL.clone() } },
      vertexShader: /* glsl */ `
        varying float vH;
        void main() { vH = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTop; uniform vec3 uColor; varying float vH;
        void main() { float t = clamp(vH / uTop, 0.0, 1.0); gl_FragColor = vec4(uColor * (0.15 + 0.85 * pow(t, 2.0)), 1.0); }
      `,
    }),
  );
  map.add(new THREE.Mesh(slabGeo, [capMat, sideMat]));

  // Bright rim on the top edge plus a holographic curtain rising from it.
  for (const r of rings) {
    const pts = r.map(([x, z]) => new THREE.Vector3(x, TOP, z));
    const rim = track(new THREE.BufferGeometry().setFromPoints(pts));
    map.add(new THREE.LineLoop(rim, track(new THREE.LineBasicMaterial({ color: MINT, transparent: true, opacity: 0.95 }))));

    const pos: number[] = [];
    const uv: number[] = [];
    let len = 0;
    for (let i = 0; i <= r.length; i++) {
      const [x, z] = r[i % r.length];
      if (i > 0) {
        const [px, pz] = r[(i - 1) % r.length];
        len += Math.hypot(x - px, z - pz);
      }
      pos.push(x, TOP, z, x, TOP + 0.38, z);
      uv.push(len, 0, len, 1);
    }
    const idx: number[] = [];
    for (let i = 0; i < r.length; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const wall = track(new THREE.BufferGeometry());
    wall.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    wall.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    wall.setIndex(idx);
    const wallMat = track(
      new THREE.ShaderMaterial({
        uniforms: { ...uniforms, uColor: { value: MINT.clone() } },
        vertexShader: glowVert,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
          void main() {
            float fade = pow(1.0 - vUv.y, 3.0);
            float scan = 0.55 + 0.45 * sin(vUv.x * 2.2 - uTime * 1.6);
            gl_FragColor = vec4(uColor, fade * 0.16 * scan);
          }
        `,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    map.add(new THREE.Mesh(wall, wallMat));
  }

  // ── Dot lattice with energy waves rolling out from Tashkent ──
  const [hx, hz] = project(69.24, 41.311);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const r of rings) for (const [x, z] of r) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  const step = opts.lite ? 0.17 : 0.12;
  const dotPos: number[] = [];
  const dotDist: number[] = [];
  const dotRand: number[] = [];
  let row = 0;
  for (let z = minZ; z <= maxZ; z += step * 0.866, row++) {
    for (let x = minX + (row % 2 ? step / 2 : 0); x <= maxX; x += step) {
      if (!inside(x, z, rings)) continue;
      dotPos.push(x, TOP + 0.01, z);
      dotDist.push(Math.hypot(x - hx, z - hz));
      dotRand.push(Math.random());
    }
  }
  const dotGeo = track(new THREE.BufferGeometry());
  dotGeo.setAttribute('position', new THREE.Float32BufferAttribute(dotPos, 3));
  dotGeo.setAttribute('aDist', new THREE.Float32BufferAttribute(dotDist, 1));
  dotGeo.setAttribute('aRand', new THREE.Float32BufferAttribute(dotRand, 1));
  const dotMat = track(
    new THREE.ShaderMaterial({
      uniforms: {
        ...uniforms,
        uSize: { value: opts.lite ? 26 : 30 },
        uPx: { value: renderer.getPixelRatio() },
        uDim: { value: TEAL.clone() },
        uHot: { value: MINT.clone() },
      },
      vertexShader: /* glsl */ `
        uniform float uTime; uniform float uSize; uniform float uPx;
        attribute float aDist; attribute float aRand;
        varying float vI; varying float vR;
        void main() {
          float wave = fract(aDist * 0.11 - uTime * 0.16);
          float ring = smoothstep(0.0, 0.06, wave) * (1.0 - smoothstep(0.06, 0.2, wave));
          float twinkle = 0.5 + 0.5 * sin(uTime * 2.0 + aRand * 40.0);
          vI = 0.18 + ring * 1.1 + twinkle * 0.12;
          vR = aRand;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = uSize * uPx * (0.55 + ring * 0.6) / -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uDim; uniform vec3 uHot; varying float vI; varying float vR;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.15, d);
          vec3 c = mix(uDim, uHot, clamp(vI - 0.15, 0.0, 1.0));
          gl_FragColor = vec4(c * vI * 1.4, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  map.add(new THREE.Points(dotGeo, dotMat));

  // ── Highway corridors with charge pulses travelling along them ──
  const cityPos = new Map(HUB_CITIES.map(c => {
    const [x, z] = project(c.lng, c.lat);
    return [c.id, new THREE.Vector3(x, TOP + 0.02, z)];
  }));
  const tubeGeos: THREE.TubeGeometry[] = [];
  CORRIDORS.forEach(([a, b], i) => {
    const pa = cityPos.get(a)!;
    const pb = cityPos.get(b)!;
    const mid = pa.clone().lerp(pb, 0.5);
    mid.y += 0.25 + pa.distanceTo(pb) * 0.22;
    const curve = new THREE.QuadraticBezierCurve3(pa, mid, pb);
    const geo = track(new THREE.TubeGeometry(curve, 64, opts.lite ? 0.016 : 0.012, 6, false));
    tubeGeos.push(geo);
    const mat = track(
      new THREE.ShaderMaterial({
        uniforms: { ...uniforms, uOff: { value: i * 0.37 }, uSpeed: { value: 0.18 + (i % 4) * 0.05 } },
        vertexShader: glowVert,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform float uOff; uniform float uSpeed; varying vec2 vUv;
          void main() {
            float x = fract(vUv.x - uTime * uSpeed + uOff);
            float comet = pow(x, 14.0);
            vec3 c = mix(vec3(0.23, 0.94, 0.78), vec3(1.0, 0.78, 0.34), comet);
            gl_FragColor = vec4(c * (0.6 + comet * 2.4), 0.16 + comet * 0.9);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    map.add(new THREE.Mesh(geo, mat));
  });

  // City nodes: a soft disc with a pulsing ring.
  const discTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.6)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    return track(new THREE.CanvasTexture(c));
  })();
  const ringGeo = track(new THREE.RingGeometry(0.1, 0.13, 40));
  ringGeo.rotateX(-Math.PI / 2);
  const pulseRings: { mesh: THREE.Mesh; phase: number }[] = [];
  HUB_CITIES.forEach((c, i) => {
    const p = cityPos.get(c.id)!;
    const big = c.id === 'tashkent';
    const sm = track(new THREE.SpriteMaterial({ map: discTex, color: big ? GOLD : MINT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const sp = new THREE.Sprite(sm);
    sp.position.copy(p);
    sp.scale.setScalar(big ? 0.7 : 0.38);
    map.add(sp);
    const rm = track(new THREE.MeshBasicMaterial({ color: big ? GOLD : MINT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    const ring = new THREE.Mesh(ringGeo, rm);
    ring.position.copy(p);
    map.add(ring);
    pulseRings.push({ mesh: ring, phase: i * 0.29 });
  });

  // ── Live stations: light beams whose height follows charger power ──
  const beamGeo = track(new THREE.CylinderGeometry(0.035, 0.035, 1, 10, 1, true));
  beamGeo.translate(0, 0.5, 0);
  const beamGroup = new THREE.Group();
  map.add(beamGroup);
  const beamMat = (color: THREE.Color) =>
    track(
      new THREE.ShaderMaterial({
        uniforms: { ...uniforms, uColor: { value: color } },
        vertexShader: glowVert,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
          void main() {
            float fade = pow(1.0 - vUv.y, 1.6);
            float flow = 0.7 + 0.3 * sin(vUv.y * 18.0 - uTime * 5.0);
            gl_FragColor = vec4(uColor * 2.2, fade * flow);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
  const freeMat = beamMat(MINT.clone());
  const busyMat = beamMat(GOLD.clone());

  const beams: { id: string; mesh: THREE.Mesh }[] = [];
  let hovered: string | null = null;

  function setStations(stations: SceneStation[]) {
    beamGroup.clear();
    beams.length = 0;
    // Several stations share a city; fan them out a little so each beam reads.
    const seen = new Map<string, number>();
    for (const s of stations) {
      const key = `${s.lat.toFixed(1)}:${s.lng.toFixed(1)}`;
      const n = seen.get(key) ?? 0;
      seen.set(key, n + 1);
      const [x, z] = project(s.lng, s.lat);
      const beam = new THREE.Mesh(beamGeo, s.free > 0 ? freeMat : busyMat);
      beam.position.set(x + n * 0.09, TOP, z + n * 0.05);
      beam.scale.set(1, 1.1 + Math.min(s.power, 350) / 150 * 1.4, 1);
      beamGroup.add(beam);
      beams.push({ id: s.id, mesh: beam });
    }
  }

  // ── Backdrop: drifting dust and a faint floor grid ──
  const starN = opts.lite ? 500 : 1400;
  const starPos = new Float32Array(starN * 3);
  for (let i = 0; i < starN; i++) {
    starPos[i * 3] = (Math.random() - 0.5) * 60;
    starPos[i * 3 + 1] = Math.random() * 14 - 3;
    starPos[i * 3 + 2] = (Math.random() - 0.5) * 50 - 6;
  }
  const starGeo = track(new THREE.BufferGeometry());
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(
    starGeo,
    track(new THREE.PointsMaterial({ color: 0x7fd8ff, size: 0.05, transparent: true, opacity: 0.5, depthWrite: false })),
  );
  scene.add(stars);

  const grid = new THREE.GridHelper(80, 80, 0x0f3a44, 0x0a1d26);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.35;
  grid.position.y = -0.02;
  scene.add(grid);
  track(grid.geometry);
  track(grid.material as THREE.Material);

  scene.add(new THREE.AmbientLight(0x6688aa, 0.6));
  const key = new THREE.DirectionalLight(0x9fe8ff, 1.4);
  key.position.set(-6, 10, 6);
  scene.add(key);
  const warm = new THREE.PointLight(0xffc857, 18, 14);
  warm.position.set(hx, 2.2, hz);
  map.add(warm);

  // ── Post-processing ──
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), opts.lite ? 0.6 : 0.72, 0.5, 0.22);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // ── Camera framing that adapts to the viewport ──
  let aspect = 1;
  let scroll = 0;
  const pointer = new THREE.Vector2();
  const eased = new THREE.Vector2();
  function frame() {
    const wide = aspect > 1.15;
    // On wide screens the map sits right of the headline; on phones it is a backdrop.
    map.position.x = wide ? 4 : 0;
    map.position.z = 0;
    // Distance that fits a given world width in view at this aspect (vertical FOV 34°).
    const fit = (width: number) => width / 2 / (Math.tan((17 * Math.PI) / 180) * aspect);
    const dist = wide ? Math.min(Math.max(fit(30), 15), 36) : Math.min(fit(19.5), 50);
    const tilt = 0.86 - scroll * 0.35;
    camera.position.set(0, Math.sin(tilt) * dist * (1 - scroll * 0.2), Math.cos(tilt) * dist);
    camera.lookAt(0, -0.4 + scroll * 1.5, 0.6);
  }

  function resize(w: number, h: number) {
    aspect = w / Math.max(h, 1);
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.resolution.set(w / 2, h / 2);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    frame();
    if (!running || opts.still) render(0);
  }

  let labels = new Map<string, HTMLElement>();
  const tmp = new THREE.Vector3();

  // ── Hover picking: nearest beam to the pointer in screen space ──
  let pointerPx: { x: number; y: number } | null = null;
  let tip: HTMLElement | null = null;
  let onHover: (id: string | null) => void = () => {};
  const toScreen = (v: THREE.Vector3, w: number, h: number) => {
    v.project(camera);
    return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h };
  };

  function pickAndPlace() {
    const w = renderer.domElement.clientWidth;
    const h = renderer.domElement.clientHeight;
    let best: { id: string; d: number; top: { x: number; y: number }; mesh: THREE.Mesh } | null = null;
    if (pointerPx) {
      for (const b of beams) {
        const base = toScreen(b.mesh.localToWorld(tmp.set(0, 0, 0)), w, h);
        const top = toScreen(b.mesh.localToWorld(tmp.set(0, 1, 0)), w, h);
        // Distance from the pointer to the beam's on-screen segment.
        const dx = top.x - base.x, dy = top.y - base.y;
        const t = Math.max(0, Math.min(1, ((pointerPx.x - base.x) * dx + (pointerPx.y - base.y) * dy) / (dx * dx + dy * dy || 1)));
        const d = Math.hypot(pointerPx.x - (base.x + t * dx), pointerPx.y - (base.y + t * dy));
        if (d < 22 && (!best || d < best.d)) best = { id: b.id, d, top, mesh: b.mesh };
      }
    }
    for (const b of beams) {
      const target = best && b.mesh === best.mesh ? 2.2 : 1;
      b.mesh.scale.x += (target - b.mesh.scale.x) * 0.25;
      b.mesh.scale.z = b.mesh.scale.x;
    }
    const id = best?.id ?? null;
    if (id !== hovered) {
      hovered = id;
      onHover(id);
    }
    if (tip) {
      tip.style.opacity = best ? '1' : '0';
      if (best) tip.style.transform = `translate(${best.top.x}px, ${best.top.y}px)`;
    }
  }
  function placeLabels() {
    const w = renderer.domElement.clientWidth;
    const h = renderer.domElement.clientHeight;
    for (const [id, el] of labels) {
      const p = cityPos.get(id);
      if (!p) continue;
      tmp.copy(p);
      tmp.y += 0.12;
      map.localToWorld(tmp);
      tmp.project(camera);
      const vis = tmp.z < 1 && Math.abs(tmp.x) < 1.05 && Math.abs(tmp.y) < 1.05;
      el.style.opacity = vis ? '' : '0';
      el.style.transform = `translate(${((tmp.x + 1) / 2) * w}px, ${((1 - tmp.y) / 2) * h}px)`;
    }
  }

  let last = 0;
  let elapsed = 0;
  function render(dt: number) {
    if (!opts.still) elapsed += dt;
    uniforms.uTime.value = opts.still ? 6 : elapsed;
    eased.lerp(pointer, opts.still ? 1 : 0.05);
    const sway = opts.still ? 0 : Math.sin(elapsed * 0.18) * 0.06;
    world.rotation.y = eased.x * 0.16 + sway - 0.08;
    world.rotation.x = eased.y * 0.05;
    for (const { mesh, phase } of pulseRings) {
      const t = ((opts.still ? 0.4 : elapsed * 0.55) + phase) % 1;
      mesh.scale.setScalar(1 + t * 2.2);
      (mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.55;
    }
    stars.rotation.y = elapsed * 0.004;
    composer.render();
    placeLabels();
    pickAndPlace();
  }

  let running = false;
  let raf = 0;
  function loop() {
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    render(Math.min((now - last) / 1000, 0.05));
    last = now;
  }
  function setRunning(on: boolean) {
    if (opts.still) {
      render(0);
      return;
    }
    if (on === running) return;
    running = on;
    if (on) {
      last = performance.now();
      loop();
    } else cancelAnimationFrame(raf);
  }

  return {
    setStations(s) {
      setStations(s);
      if (!running) render(0);
    },
    setPointer(x, y) {
      pointer.set(x, y);
    },
    setScroll(p) {
      scroll = Math.min(Math.max(p, 0), 1);
      frame();
    },
    setLabels(els) {
      labels = els;
      if (!running) render(0);
    },
    setHover(px) {
      pointerPx = px;
      if (!running || opts.still) render(0);
    },
    setTooltip(el, cb) {
      tip = el;
      onHover = cb;
    },
    resize,
    setRunning,
    dispose() {
      setRunning(false);
      cancelAnimationFrame(raf);
      disposables.forEach(d => d.dispose());
      composer.dispose();
      renderer.dispose();
    },
  };
}
