// Renderer, camera, bloom, and the static scenery: the warping grid floor,
// track rails, horizon line and stars.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CFG, COLORS, ANIM, BLOOM, GRID_PATTERNS } from './config.js';

const RIPPLES = 8;

const floorVS = /* glsl */ `
uniform float uTime;
uniform float uDist;
uniform vec4 uRip[${RIPPLES}];
varying vec3 vPos;
varying float vRip;
void main() {
  vec3 p = position;
  float rip = 0.0;
  for (int i = 0; i < ${RIPPLES}; i++) {
    vec4 r = uRip[i];
    float age = uTime - r.z;
    if (r.w == 0.0 || age < 0.0 || age > ${ANIM.rippleLife.toFixed(2)}) continue;
    vec2 c = vec2(r.x, -(r.y - uDist));
    float d = distance(p.xz, c);
    float ring = exp(-pow((d - age * ${ANIM.rippleSpeed.toFixed(2)}) / ${ANIM.rippleWidth.toFixed(2)}, 2.0)) * exp(-age * ${ANIM.rippleDecay.toFixed(2)}) * r.w;
    rip += ring;
  }
  rip = min(rip, 2.5);
  p.y -= rip * ${ANIM.rippleDepth.toFixed(2)};
  vPos = p;
  vRip = rip;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

// Grid patterns (GRID_PATTERNS order): 0 grid, 1 hexagons, 2 oblique grid,
// 3 triangles, 4 dot grid, 5 outlined polka dots. All antialiased with fwidth.
const floorFS = /* glsl */ `
uniform float uDist;
uniform float uTW;
uniform float uVoid;
uniform float uPattern;
uniform float uScroll;
uniform float uCamX;
uniform vec3 uGrid;
uniform vec3 uBg;
varying vec3 vPos;
varying float vRip;
float gridLine(float c, float w) {
  float f = abs(fract(c - 0.5) - 0.5) / fwidth(c);
  return 1.0 - min(f / w, 1.0);
}
// Distance to the nearest hexagon edge (cells 1 unit across the flats).
float hexEdge(vec2 p) {
  const vec2 s = vec2(1.0, 1.7320508);
  vec4 c = floor(vec4(p, p - vec2(0.5, 0.8660254)) / s.xyxy) + 0.5;
  vec4 h = vec4(p - c.xy * s, p - (c.zw + 0.5) * s);
  vec2 q = abs(dot(h.xy, h.xy) < dot(h.zw, h.zw) ? h.xy : h.zw);
  return 0.5 - max(dot(q, s * 0.5), q.x);
}
// Pattern brightness at p (pattern units); w = line width in pixels.
float pattern(vec2 p, float w) {
  float px = max(length(fwidth(p)), 1e-4);
  if (uPattern < 0.5) return max(gridLine(p.x, w), gridLine(p.y, w));
  if (uPattern < 1.5) return 1.0 - min(abs(hexEdge(p)) / (px * w * 0.7), 1.0);
  if (uPattern < 2.5) return max(gridLine((p.x + p.y) * 0.7071, w), gridLine((p.x - p.y) * 0.7071, w));
  if (uPattern < 3.5) return max(gridLine(p.y, w), max(gridLine(dot(p, vec2(0.8660254, 0.5)), w), gridLine(dot(p, vec2(-0.8660254, 0.5)), w)));
  if (uPattern < 4.5) {
    float d = length(fract(p) - 0.5) - 0.07;
    return (1.0 - smoothstep(0.0, px * 1.4, d)) * 1.6;
  }
  vec2 q = p;
  q.x += 0.5 * mod(floor(q.y), 2.0);
  float d = abs(length(fract(q) - 0.5) - 0.26);
  return 1.0 - min(d / (px * w * 0.6), 1.0);
}
void main() {
  float inT = step(abs(vPos.x), uTW) * (1.0 - uVoid);
  float l;
  if (uVoid > 0.5) {
    // Background: scrolls slower and follows the camera, so it reads as far below.
    float wz = -vPos.z + uDist * uScroll;
    vec2 p = vec2(vPos.x - uCamX, wz);
    l = (uPattern < 0.5 ? max(gridLine(p.x / 0.8, 1.0), gridLine(p.y * 0.5, 1.0)) : pattern(p / 1.6, 1.0)) * 0.3;
  } else {
    float wz = -vPos.z + uDist;
    l = uPattern < 0.5 ? max(gridLine(vPos.x / 0.4, 1.3), gridLine(wz, 1.3)) : pattern(vec2(vPos.x, wz) / 0.6, 1.3);
    l *= inT;
  }
  float fade = exp(-max(-vPos.z, 0.0) / 40.0);
  vec3 col = uBg + uGrid * (l * (1.0 + vRip * 5.0) + inT * 0.05) * fade;
  col += vec3(0.5, 0.15, 1.0) * vRip * 0.5 * fade;
  gl_FragColor = vec4(col, 1.0);
}`;

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: false, stencil: false, powerPreference: 'high-performance',
  });
  renderer.info.autoReset = false;
  const bg = new THREE.Color(COLORS.bg);
  renderer.setClearColor(bg, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 220);
  const lookAt = new THREE.Vector3();

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), BLOOM.strength, BLOOM.radius, BLOOM.threshold);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // Shared by every point-sprite material: converts world size to pixels.
  const pointScale = { value: 1 };

  const ripples = Array.from({ length: RIPPLES }, () => new THREE.Vector4(0, 0, -99, 0));
  let ripI = 0;

  // The track is a raised strip; the outer grid sits far below it so units
  // that run off the edge visibly fall.
  const shared = {
    uTime: { value: 0 },
    uDist: { value: 0 },
    uRip: { value: ripples },
    uTW: { value: CFG.TW },
    uPattern: { value: Math.max(0, GRID_PATTERNS.indexOf(CFG.GRID_PATTERN)) },
    uScroll: { value: CFG.VOID_SCROLL },
    uCamX: { value: 0 },
    uGrid: { value: new THREE.Vector3(...COLORS.grid) },
    uBg: { value: new THREE.Vector3(bg.r, bg.g, bg.b) },
  };
  function floorMesh(width, segX, y, isVoid) {
    const geo = new THREE.PlaneGeometry(width, 130, segX, 260);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, y, -55);
    const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader: floorVS,
      fragmentShader: floorFS,
      uniforms: { ...shared, uVoid: { value: isVoid ? 1 : 0 } },
    }));
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  }
  floorMesh(2 * CFG.TW, 16, 0, false);
  const voidMesh = floorMesh(120, 120, -CFG.VOID_DEPTH, true);
  let followMul = 1;
  const floorMat = { uniforms: shared };

  // Faint walls under the rails so the track reads as a raised platform.
  const wallGeo = new THREE.PlaneGeometry(130, 0.6);
  wallGeo.rotateY(Math.PI / 2);
  wallGeo.translate(0, -0.3, -55);
  const wallMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(...COLORS.rail).multiplyScalar(0.12),
    side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  for (const s of [-1, 1]) {
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.x = s * CFG.TW;
    scene.add(wall);
  }

  const railMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(...COLORS.rail) });
  const railGeo = new THREE.BoxGeometry(0.05, 0.05, 130);
  railGeo.translate(0, 0.03, -55);
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(railGeo, railMat);
    rail.position.x = s * CFG.TW;
    scene.add(rail);
  }

  const horizon = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 0.25),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(...COLORS.horizon) }),
  );
  horizon.position.set(0, 0, -118);
  scene.add(horizon);

  const starPos = new Float32Array(400 * 3);
  for (let i = 0; i < 400; i++) {
    starPos[i * 3] = (Math.random() * 2 - 1) * 140;
    starPos[i * 3 + 1] = 1 + Math.random() * 70;
    starPos[i * 3 + 2] = -119;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: new THREE.Color(0.7, 0.75, 0.9), size: 1.5, sizeAttenuation: false,
  })));

  let pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(w, h);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(w, h);
    camera.aspect = w / h;
    // Fit the track width at the army's depth, whatever the aspect ratio.
    const hHalf = Math.atan((CFG.TW + 0.6) / 9.5);
    let fov = 2 * Math.atan(Math.tan(hHalf) / camera.aspect) * 180 / Math.PI;
    fov = Math.min(80, Math.max(45, fov));
    camera.fov = fov;
    // Lens shift: render a window offset downward, so the whole scene (army
    // included) moves up the screen without tilting the camera.
    camera.setViewOffset(w, h, 0, h * CFG.CAMERA_LIFT, w, h);
    camera.updateProjectionMatrix();
    pointScale.value = h * pixelRatio / (2 * Math.tan(fov * Math.PI / 360));
  }

  return {
    renderer, scene, camera, pointScale,
    get pixelRatio() { return pixelRatio; },
    setPixelRatio(pr) { pixelRatio = pr; resize(); },
    resize,
    addRipple(x, wz, amp, time) {
      ripples[ripI].set(x, wz, time, amp);
      ripI = (ripI + 1) % RIPPLES;
    },
    update(time, dist, ax, shake, battle = 0) {
      floorMat.uniforms.uTime.value = time;
      floorMat.uniforms.uDist.value = dist;
      const sx = shake ? (Math.random() * 2 - 1) * shake : 0;
      const sy = shake ? (Math.random() * 2 - 1) * shake : 0;
      const push = battle * ANIM.battleCamPush;
      camera.position.set(ax * 0.3 + sx, 6.2 - push * 0.7 + sy, 7.4 - push);
      floorMat.uniforms.uCamX.value = ax * 0.3 * CFG.VOID_FOLLOW * followMul;
      lookAt.set(ax * 0.45, 0, -7 + push * 0.6);
      camera.lookAt(lookAt);
    },
    render() { composer.render(); },
    // Grid pattern by name (GRID_PATTERNS); returns the one now showing.
    setPattern(name) {
      const i = GRID_PATTERNS.indexOf(name);
      if (i >= 0) floorMat.uniforms.uPattern.value = i;
      return GRID_PATTERNS[floorMat.uniforms.uPattern.value];
    },
    // Background parallax on (the new deep, slow, camera-following void) or
    // off (the original: 4 below, same speed).
    setParallax(on) {
      floorMat.uniforms.uScroll.value = on ? CFG.VOID_SCROLL : 1;
      voidMesh.position.y = on ? 0 : CFG.VOID_DEPTH - 4;
      followMul = on ? 1 : 0;
    },
  };
}
