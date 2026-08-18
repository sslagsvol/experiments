// SOLSCAPE — three.js simulation engine.
// createSim(container, opts) → api. All rendering, orbits, camera modes,
// picking, labels, belts, comet, and audio live here. UI lives in the DC shell.

import * as THREE from 'https://unpkg.com/three@0.184.0/build/three.module.js';

const TWO_PI = Math.PI * 2;
const KM_PER_AU = 1.496e8;
const TRUE_AU_UNITS = 420;                    // 1 AU = 420 units at true scale
const TOUR_ORBIT = (au) => 60 * Math.pow(au, 0.55);
const TRUE_ORBIT = (au) => TRUE_AU_UNITS * au;
const TRUE_R = (km) => Math.max(km * TRUE_AU_UNITS / KM_PER_AU, 0.01);
const TOUR_R = (km) => Math.max(Math.sqrt(km) * 0.019, 0.13);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeInOutCubic = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
// spaceship profile: gentle throttle-up, fast cruise, long cinematic braking approach
const easeShip = (t) => {
  t = clamp(t, 0, 1);
  if (t < 0.35) return Math.pow(t / 0.35, 2.6) * 0.45;
  const u = clamp(1 - (t - 0.35) / 0.65, 0, 1); // clamp: fp drift makes this go microscopically negative at t=1 → pow() NaN
  return 0.45 + (1 - Math.pow(u, 4)) * 0.55;
};
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

// ————————————————————————————— procedural textures —————————————————————————————

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function procTexture(p, seed) {
  const w = 512, h = 256;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  const r = mulberry32(seed);
  x.fillStyle = p.base; x.fillRect(0, 0, w, h);
  // mottled noise
  for (let i = 0; i < 1500; i++) {
    x.globalAlpha = 0.04 + r() * 0.08;
    x.fillStyle = r() > 0.5 ? p.shade : p.base;
    const rad = 2 + r() * r() * 26;
    x.beginPath(); x.ellipse(r() * w, r() * h, rad, rad * (0.5 + r() * 0.8), r() * 3, 0, TWO_PI); x.fill();
  }
  if (p.bands) {
    for (let i = 0; i < p.bands * 3; i++) {
      const y0 = r() * h, bh = 6 + r() * 22;
      const g = x.createLinearGradient(0, y0, 0, y0 + bh);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(255,240,210,0.10)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.globalAlpha = 1; x.fillStyle = g; x.fillRect(0, y0, w, bh);
    }
  }
  if (p.spots) {
    for (const col of p.spots) {
      for (let i = 0; i < 10 + r() * 16; i++) {
        x.globalAlpha = 0.18 + r() * 0.25; x.fillStyle = col;
        const rad = 3 + r() * r() * 22;
        x.beginPath(); x.ellipse(r() * w, h * 0.12 + r() * h * 0.76, rad, rad * 0.7, r() * 3, 0, TWO_PI); x.fill();
      }
    }
  }
  if (p.lines) {
    x.strokeStyle = p.lines;
    for (let i = 0; i < 42; i++) {
      x.globalAlpha = 0.15 + r() * 0.28; x.lineWidth = 0.6 + r() * 1.6;
      x.beginPath();
      const x0 = r() * w, y0 = r() * h;
      x.moveTo(x0, y0);
      x.bezierCurveTo(x0 + (r() - 0.5) * 300, y0 + (r() - 0.5) * 120, x0 + (r() - 0.5) * 300, y0 + (r() - 0.5) * 120, x0 + (r() - 0.5) * 420, y0 + (r() - 0.5) * 160);
      x.stroke();
    }
  }
  if (p.craters) {
    for (let i = 0; i < p.craters; i++) {
      const cx = r() * w, cy = h * 0.06 + r() * h * 0.88, rad = 1.5 + r() * r() * 13;
      x.globalAlpha = 0.28 + r() * 0.3; x.strokeStyle = p.shade; x.lineWidth = 0.8 + r() * 1.4;
      x.beginPath(); x.arc(cx, cy, rad, 0, TWO_PI); x.stroke();
      x.globalAlpha = 0.10; x.fillStyle = '#ffffff';
      x.beginPath(); x.arc(cx - rad * 0.2, cy - rad * 0.2, rad * 0.75, 0, TWO_PI); x.fill();
    }
  }
  if (p.bigCrater) {
    x.globalAlpha = 0.5; x.strokeStyle = p.shade; x.lineWidth = 5;
    x.beginPath(); x.arc(w * 0.3, h * 0.5, 34, 0, TWO_PI); x.stroke();
    x.globalAlpha = 0.25; x.fillStyle = '#ffffff';
    x.beginPath(); x.arc(w * 0.3, h * 0.5, 10, 0, TWO_PI); x.fill();
  }
  if (p.hemi) { // dark leading hemisphere (Iapetus)
    const g = x.createLinearGradient(0, 0, w * 0.55, 0);
    g.addColorStop(0, p.hemi); g.addColorStop(0.8, p.hemi); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.globalAlpha = 0.85; x.fillStyle = g; x.fillRect(0, 0, w * 0.55, h);
  }
  if (p.hemiN) { // dark polar cap (Charon)
    const g = x.createLinearGradient(0, 0, 0, h * 0.3);
    g.addColorStop(0, p.hemiN); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.globalAlpha = 0.8; x.fillStyle = g; x.fillRect(0, 0, w, h * 0.3);
  }
  x.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTexture(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, inner);
  g.addColorStop(0.25, outer);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

// ————————————————————————————— audio —————————————————————————————

class SimAudio {
  constructor() { this.ctx = null; this.enabled = true; this.master = null; }
  ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 1 : 0;
    this.master.connect(this.ctx.destination);
    // drone: filtered noise + two detuned oscillators
    const len = this.ctx.sampleRate * 4;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    const noise = this.ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 110; lp.Q.value = 0.4;
    const ng = this.ctx.createGain(); ng.gain.value = 0.05;
    noise.connect(lp); lp.connect(ng); ng.connect(this.master); noise.start();
    const og = this.ctx.createGain(); og.gain.value = 0.016; og.connect(this.master);
    for (const f of [48.2, 48.8, 96.5]) {
      const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const g2 = this.ctx.createGain(); g2.gain.value = f > 90 ? 0.3 : 1;
      o.connect(g2); g2.connect(og); o.start();
    }
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.05;
    const lg = this.ctx.createGain(); lg.gain.value = 40;
    lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
  }
  setEnabled(v) {
    this.enabled = v;
    if (this.master) this.master.gain.linearRampToValueAtTime(v ? 1 : 0, this.ctx.currentTime + 0.4);
  }
  blip(freq = 1240, dur = 0.07, gain = 0.05) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.72, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  whoosh(dur = 2.4) {
    if (!this.ctx || !this.enabled) return;
    if (!Number.isFinite(dur) || dur <= 0) dur = 2.4;
    const t = this.ctx.currentTime;
    const len = this.ctx.sampleRate * dur;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(160, t);
    bp.frequency.exponentialRampToValueAtTime(900, t + dur * 0.45);
    bp.frequency.exponentialRampToValueAtTime(140, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp); bp.connect(g); g.connect(this.master); src.start(t); src.stop(t + dur);
  }
}

// ————————————————————————————— main —————————————————————————————

export function createSim(container, opts) {
  const { BODIES, SPEEDS, TEX, on = {}, settings = {} } = opts;
  const ACCENT = settings.accent || '#3E86FF';
  const isTouch = matchMedia('(pointer: coarse)').matches;

  // ——— renderer / scene / camera ———
  const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;z-index:0;';
  container.appendChild(renderer.domElement);

  const labelLayer = document.createElement('div');
  labelLayer.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:1;';
  container.appendChild(labelLayer);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020204);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.005, 200000);

  const sunLight = new THREE.PointLight(0xfff2dd, 2.7, 0, 0);
  scene.add(sunLight);
  scene.add(new THREE.AmbientLight(0x2a3038, 0.5));

  // ——— texture loading with progress ———
  let texTotal = 0, texDone = 0, readyFired = false;
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');
  function bump() {
    texDone++;
    on.progress && on.progress(texDone, texTotal);
    if (texDone >= texTotal && !readyFired) { readyFired = true; setTimeout(() => on.ready && on.ready(), 250); }
  }
  function loadTex(file, color) {
    texTotal++;
    const t = loader.load(TEX + file, bump, undefined, bump);
    if (color) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  setTimeout(() => { if (!readyFired) { readyFired = true; on.ready && on.ready(); } }, 15000); // never hang

  // ——— starfield ———
  let starObj;
  (function stars() {
    const N = 13000, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    const rnd = mulberry32(42);
    const bandQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.05, 0.4, 0.5));
    const v = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const inBand = i > N * 0.45;
      if (inBand) {
        const a = rnd() * TWO_PI;
        let y = (rnd() + rnd() + rnd() - 1.5) * 0.18;
        v.set(Math.cos(a), y, Math.sin(a)).normalize().applyQuaternion(bandQ);
      } else {
        v.set(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize();
      }
      v.multiplyScalar(60000);
      pos.set([v.x, v.y, v.z], i * 3);
      const m = 0.35 + rnd() * 0.65;
      const warm = rnd();
      col.set([m * (warm > 0.7 ? 1 : 0.82 + rnd() * 0.18), m * 0.88, m * (warm > 0.7 ? 0.8 : 1)], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({ size: 3.1, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, map: glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0.22)') });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    pts.name = 'stars';
    const grp = new THREE.Group();
    grp.add(pts);
    // milky-way haze: soft luminous band on a huge inward-facing sphere
    const hc = document.createElement('canvas'); hc.width = 1024; hc.height = 512;
    const hx = hc.getContext('2d');
    const hg = hx.createLinearGradient(0, 156, 0, 356);
    hg.addColorStop(0, 'rgba(120,125,190,0)');
    hg.addColorStop(0.42, 'rgba(135,140,205,0.26)');
    hg.addColorStop(0.5, 'rgba(165,170,225,0.38)');
    hg.addColorStop(0.58, 'rgba(135,140,205,0.26)');
    hg.addColorStop(1, 'rgba(120,125,190,0)');
    hx.fillStyle = hg; hx.fillRect(0, 0, 1024, 512);
    // clumpy structure + dark dust lanes along the band (drawn wrapped so the
    // sphere's UV seam at x=0/1024 has identical pixels on both sides)
    const clumpCols = ['rgba(150,140,220,0.12)', 'rgba(110,130,215,0.12)', 'rgba(170,150,230,0.10)', 'rgba(120,110,190,0.13)', 'rgba(190,195,240,0.09)'];
    for (let i = 0; i < 260; i++) {
      const bx = rnd() * 1024, by = 256 + (rnd() + rnd() - 1) * 70;
      const br = 8 + rnd() * 46;
      const dust = rnd() < 0.32;
      const col = dust ? 'rgba(8,8,16,0.30)' : clumpCols[Math.floor(rnd() * clumpCols.length)];
      for (const ox of [-1024, 0, 1024]) {
        const bg = hx.createRadialGradient(bx + ox, by, 0, bx + ox, by, br);
        bg.addColorStop(0, col);
        bg.addColorStop(1, 'rgba(0,0,0,0)');
        hx.fillStyle = bg;
        hx.fillRect(bx + ox - br, by - br, br * 2, br * 2);
      }
    }
    const hazeTex = new THREE.CanvasTexture(hc);
    hazeTex.wrapS = THREE.RepeatWrapping;
    hazeTex.colorSpace = THREE.SRGBColorSpace;
    const haze = new THREE.Mesh(
      new THREE.SphereGeometry(1, 48, 32),
      new THREE.MeshBasicMaterial({ map: hazeTex, side: THREE.BackSide, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
    );
    haze.scale.setScalar(58000);
    haze.quaternion.copy(bandQ);
    haze.frustumCulled = false;
    grp.add(haze);
    scene.add(grp);
    starObj = grp;
  })();

  // ——— atmosphere shader ———
  function atmoShell(color, intensity, scale) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uInt: { value: intensity } },
      vertexShader: `varying vec3 vN; varying vec3 vV;
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uInt; varying vec3 vN; varying vec3 vV;
        void main(){ float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.6);
        gl_FragColor = vec4(uColor, rim * uInt); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), mat);
    mesh.scale.setScalar(scale);
    return mesh;
  }

  // ——— build bodies ———
  const recs = [];
  const byId = {};
  const sphereGeo = new THREE.SphereGeometry(1, 64, 48);
  const sphereGeoLo = new THREE.SphereGeometry(1, 32, 24);
  let earthShaderRef = null;
  let cloudMesh = null;

  BODIES.forEach((b, i) => {
    const rec = {
      b, group: new THREE.Group(), tilt: new THREE.Group(), mesh: null,
      phase0: (i * 137.508) % 360 * Math.PI / 180,
      dispR: 1, moons: [], orbitLine: null, moonLines: [],
      qOrbit: new THREE.Quaternion().setFromEuler(new THREE.Euler((b.inclDeg || 0) * Math.PI / 180, (i * 61) % 360 * Math.PI / 180, 0, 'YXZ')),
      worldPos: new THREE.Vector3(), screen: { x: 0, y: 0, r: 0, vis: false },
    };
    rec.group.add(rec.tilt);
    rec.tilt.rotation.z = -(b.tiltDeg || 0) * Math.PI / 180;

    let mat;
    if (b.type === 'star') {
      mat = new THREE.MeshBasicMaterial({ map: loadTex(b.tex.map, true) });
    } else if (b.tex) {
      mat = new THREE.MeshPhongMaterial({
        map: loadTex(b.tex.map, true),
        bumpMap: b.tex.bump ? loadTex(b.tex.bump) : null,
        bumpScale: 0.9,
        specularMap: b.tex.spec ? loadTex(b.tex.spec) : null,
        specular: b.tex.spec ? new THREE.Color(0x445566) : new THREE.Color(0x0a0a0a),
        shininess: b.tex.spec ? 16 : 5,
      });
      if (b.tex.lights) {
        mat.emissive = new THREE.Color(0xffffff);
        mat.emissiveMap = loadTex(b.tex.lights, true);
        mat.emissiveIntensity = 1.1;
        mat.onBeforeCompile = (shader) => {
          shader.uniforms.uSunDirView = { value: new THREE.Vector3(0, 0, 1) };
          shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
            '#include <common>\nuniform vec3 uSunDirView;');
          shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
             totalEmissiveRadiance *= smoothstep(0.12, -0.22, dot(normal, uSunDirView));`);
          earthShaderRef = shader;
        };
      }
    } else {
      mat = new THREE.MeshPhongMaterial({ map: procTexture(b.proc, i * 7919 + 13), shininess: 4, specular: new THREE.Color(0x0a0a0a) });
    }

    const mesh = new THREE.Mesh(b.radiusKm < 300 ? sphereGeoLo : sphereGeo, mat);
    if (b.proc && b.proc.lumpy) mesh.scale.set(1.22, 0.86, 1.02);
    if (b.ell) mesh.scale.set(b.ell[0], b.ell[1], b.ell[2]);
    rec.mesh = mesh;
    rec.tilt.add(mesh);

    if (b.atmo) {
      const shell = atmoShell(b.atmo.color, b.atmo.intensity * 0.9, 1.03);
      rec.tilt.add(shell); rec.atmo = shell;
    }
    if (b.tex && b.tex.clouds) {
      cloudMesh = new THREE.Mesh(sphereGeo, new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.85, depthWrite: false }));
      cloudMesh.scale.setScalar(1.015);
      cloudMesh.visible = false;
      rec.tilt.add(cloudMesh);
      makeClouds(TEX + b.tex.clouds, TEX + b.tex.cloudsAlpha);
    }
    if (b.ring) {
      const inner = b.ring.inner, outer = b.ring.outer;
      const g = new THREE.RingGeometry(inner, outer, 180, 1);
      const posA = g.attributes.position, uvA = g.attributes.uv;
      for (let k = 0; k < posA.count; k++) {
        const rr = Math.hypot(posA.getX(k), posA.getY(k));
        uvA.setXY(k, (rr - inner) / (outer - inner), 0.5);
      }
      const rm = new THREE.MeshBasicMaterial({
        map: loadTex(b.ring.map, true), alphaMap: loadTex(b.ring.alpha),
        color: 0xbfb9ad, transparent: true, opacity: b.ring.opacity, side: THREE.DoubleSide, depthWrite: false,
      });
      const ring = new THREE.Mesh(g, rm);
      ring.rotation.x = -Math.PI / 2;
      rec.tilt.add(ring); rec.ring = ring;
    }

    // orbit line (unit circle in body's orbital plane)
    if (b.parent && b.type !== 'comet') {
      const pts = [];
      const v = new THREE.Vector3();
      for (let k = 0; k <= 128; k++) {
        const a = k / 128 * TWO_PI;
        v.set(Math.cos(a), 0, Math.sin(a)).applyQuaternion(rec.qOrbit);
        pts.push(v.x, v.y, v.z);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: b.type === 'moon' ? 0.19 : 0.145, depthWrite: false }));
      line.frustumCulled = false;
      rec.orbitLine = line;
    }

    recs.push(rec); byId[b.id] = rec;
  });

  // parent/child wiring
  for (const rec of recs) {
    const p = rec.b.parent ? byId[rec.b.parent] : null;
    rec.parentRec = p;
    if (!p) { scene.add(rec.group); if (rec.orbitLine) scene.add(rec.orbitLine); }
    else if (rec.b.type === 'moon') {
      p.group.add(rec.group); p.moons.push(rec);
      if (rec.orbitLine) { p.group.add(rec.orbitLine); p.moonLines.push(rec.orbitLine); }
    } else {
      scene.add(rec.group);
      if (rec.orbitLine) scene.add(rec.orbitLine);
    }
  }
  const sunRec = byId.sun;

  // sun glow sprites
  const glowSprites = [];
  {
    const t1 = glowTexture('rgba(255,244,220,1)', 'rgba(255,180,90,0.35)');
    const t2 = glowTexture('rgba(255,220,160,0.8)', 'rgba(255,150,60,0.18)');
    for (const [tex, size, op] of [[t1, 3.4, 0.95], [t2, 8, 0.4], [t2, 18, 0.15]]) {
      const sm = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false });
      const s = new THREE.Sprite(sm);
      s.userData = { size, op };
      sunRec.group.add(s); glowSprites.push(s);
    }
  }

  // earth clouds (canvas-combined color + alpha)
  function makeClouds(mapUrl, alphaUrl) {
    texTotal += 2;
    const im = (url) => new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = url; });
    Promise.all([im(mapUrl), im(alphaUrl)]).then(([cm, ct]) => {
      const w = 1024, h = 512;
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d');
      x.drawImage(cm, 0, 0, w, h);
      const cd = x.getImageData(0, 0, w, h);
      const c2 = document.createElement('canvas'); c2.width = w; c2.height = h;
      const x2 = c2.getContext('2d'); x2.drawImage(ct, 0, 0, w, h);
      const td = x2.getImageData(0, 0, w, h);
      for (let i = 0; i < cd.data.length; i += 4) cd.data[i + 3] = 255 - td.data[i];
      x.putImageData(cd, 0, 0);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      cloudMesh.material.map = tex;
      cloudMesh.material.needsUpdate = true;
      cloudMesh.visible = true;
      bump(); bump();
    }).catch(() => { bump(); bump(); });
  }

  // ——— belts ———
  const MAX_DENS = 1.6;
  function makeBelt({ count, auMin, auMax, ySpread, colA, colB, opacity, gauss }) {
    const N = Math.floor(count * MAX_DENS);
    const aAu = new Float32Array(N), aAng = new Float32Array(N), aYf = new Float32Array(N), aSize = new Float32Array(N), aTint = new Float32Array(N);
    const rnd = mulberry32(count);
    for (let i = 0; i < N; i++) {
      const g = gauss ? (rnd() + rnd() + rnd()) / 3 : rnd();
      aAu[i] = auMin + g * (auMax - auMin);
      aAng[i] = rnd() * TWO_PI;
      aYf[i] = (rnd() + rnd() - 1) * ySpread;
      aSize[i] = 0.5 + rnd() * rnd() * 1.6;
      aTint[i] = rnd();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('aAu', new THREE.BufferAttribute(aAu, 1));
    g.setAttribute('aAng', new THREE.BufferAttribute(aAng, 1));
    g.setAttribute('aYf', new THREE.BufferAttribute(aYf, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(aSize, 1));
    g.setAttribute('aTint', new THREE.BufferAttribute(aTint, 1));
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3)); // required
    const m = new THREE.ShaderMaterial({
      uniforms: {
        uDays: { value: 0 }, uScaleT: { value: 0 }, uOpacity: { value: opacity },
        uColA: { value: new THREE.Color(colA) }, uColB: { value: new THREE.Color(colB) },
        uPx: { value: Math.min(devicePixelRatio || 1, 2) },
      },
      vertexShader: `attribute float aAu; attribute float aAng; attribute float aYf; attribute float aSize; attribute float aTint;
        uniform float uDays; uniform float uScaleT; uniform float uPx; varying float vTint;
        void main(){
          float rT = 60.0 * pow(aAu, 0.55);
          float rR = 420.0 * aAu;
          float r = mix(rT, rR, uScaleT);
          float ang = aAng + uDays * 0.0172 / (aAu * sqrt(aAu));
          vec3 p = vec3(cos(ang) * r, aYf * r, sin(ang) * r);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = clamp(aSize * uPx * 220.0 / -mv.z, 0.6, 3.6);
          vTint = aTint;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform vec3 uColA; uniform vec3 uColB; uniform float uOpacity; varying float vTint;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.12, d) * uOpacity;
          if (a < 0.01) discard;
          gl_FragColor = vec4(mix(uColA, uColB, vTint), a);
        }`,
      transparent: true, depthWrite: false,
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    pts.userData.baseCount = N;
    scene.add(pts);
    return pts;
  }
  const asteroidBelt = makeBelt({ count: 11000, auMin: 2.1, auMax: 3.3, ySpread: 0.02, colA: '#3d3a35', colB: '#575149', opacity: 0.38, gauss: true });
  const kuiperBelt = makeBelt({ count: 8000, auMin: 32, auMax: 48, ySpread: 0.05, colA: '#343a42', colB: '#4d5560', opacity: 0.26, gauss: false });
  function applyDensity(d) {
    for (const belt of [asteroidBelt, kuiperBelt]) {
      belt.geometry.setDrawRange(0, Math.floor(belt.userData.baseCount * clamp(d, 0.1, MAX_DENS) / MAX_DENS));
    }
  }
  applyDensity(settings.beltDensity ?? 1);

  // ——— comet tail + halley orbit line ———
  const halley = byId.halley;
  const tailGroup = new THREE.Group();
  halley.group.add(tailGroup);
  {
    const N = 500, pos = new Float32Array(N * 3), sz = new Float32Array(N);
    const rnd = mulberry32(7);
    for (let i = 0; i < N; i++) {
      const t = Math.pow(rnd(), 1.6);
      const spread = 0.03 + t * 0.16;
      pos.set([(rnd() - 0.5) * spread, (rnd() - 0.5) * spread, t], i * 3);
      sz[i] = (1 - t) * 2 + 0.4;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: 0x9fc4ff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
    const tail = new THREE.Points(g, m);
    tail.frustumCulled = false;
    tailGroup.add(tail);
    const comaMat = new THREE.SpriteMaterial({ map: glowTexture('rgba(210,230,255,0.9)', 'rgba(140,180,255,0.25)'), transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false });
    const coma = new THREE.Sprite(comaMat);
    halley.group.add(coma); halley.coma = coma;
  }
  const halleyLineGeo = new THREE.BufferGeometry();
  halleyLineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(257 * 3), 3));
  const halleyLine = new THREE.Line(halleyLineGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, depthWrite: false }));
  halleyLine.frustumCulled = false;
  scene.add(halleyLine);
  halley.orbitLine = halleyLine;

  function solveKepler(M, e) {
    M = ((M % TWO_PI) + TWO_PI) % TWO_PI;
    let E = Math.PI;
    for (let i = 0; i < 24; i++) {
      const f = E - e * Math.sin(E) - M;
      E = E - f / (1 - e * Math.cos(E));
      if (E < 0) E = 0.0001; if (E > TWO_PI) E = TWO_PI - 0.0001;
    }
    return E;
  }
  function halleyLocal(E, scaleT, out) {
    const a = halley.b.au, e = halley.b.ecc;
    const rAu = a * (1 - e * Math.cos(E));
    const nu = Math.atan2(Math.sqrt(1 - e * e) * Math.sin(E), Math.cos(E) - e);
    const r = lerp(TOUR_ORBIT(rAu), TRUE_ORBIT(rAu), scaleT);
    out.set(Math.cos(nu) * r, 0, Math.sin(nu) * r).applyQuaternion(halley.qOrbit);
    out.rAu = rAu;
    return out;
  }
  const _hv = new THREE.Vector3();
  function rebuildHalleyLine(scaleT) {
    const attr = halleyLineGeo.attributes.position;
    for (let k = 0; k <= 256; k++) {
      halleyLocal(k / 256 * TWO_PI, scaleT, _hv);
      attr.setXYZ(k, _hv.x, _hv.y, _hv.z);
    }
    attr.needsUpdate = true;
    halleyLineGeo.computeBoundingSphere();
  }
  rebuildHalleyLine(0);

  // ——— labels (DOM) ———
  const accentRGB = ACCENT;
  for (const rec of recs) {
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;left:0;top:0;display:none;pointer-events:none;transform:translate(-50%,-100%);text-align:center;will-change:transform;';
    el.innerHTML =
      `<div data-n style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:12px;letter-spacing:0.18em;color:#F2F3F5;text-shadow:0 1px 10px rgba(0,0,0,0.9);white-space:nowrap;">${rec.b.name.toUpperCase()}</div>` +
      `<div data-s style="font-family:'IBM Plex Mono',monospace;font-size:8px;letter-spacing:0.22em;color:rgba(242,243,245,0.5);margin-top:1px;white-space:nowrap;">${rec.b.type.toUpperCase()}</div>` +
      `<div data-l style="width:1px;height:14px;background:rgba(242,243,245,0.4);margin:3px auto 0;"></div>`;
    labelLayer.appendChild(el);
    rec.labelEl = el;
    rec.labelName = el.querySelector('[data-n]');
    rec.labelLine = el.querySelector('[data-l]');
  }
  const reticle = document.createElement('div');
  reticle.style.cssText = `position:absolute;display:none;pointer-events:none;border:1px solid ${accentRGB}55;border-radius:2px;box-shadow:0 0 12px ${accentRGB}22 inset;`;
  labelLayer.appendChild(reticle);

  // ——— state ———
  let simDays = 0;
  let wallSec = 0;
  let speedIdx = settings.speedIdx ?? 2;
  let paused = false;
  let scaleT = 0, scaleTarget = 0;
  let orbitsOn = settings.orbits ?? true;
  let labelsOn = settings.labels ?? true;
  let driftSpeed = settings.drift ?? 1;
  let glowMul = settings.glow ?? 1;
  let mode = 'system'; // system | transit | orbit | free
  let selected = null;
  let focusRec = null; // camera keeps following this after the pane is closed
  let hovered = null;
  const audio = new SimAudio();
  audio.enabled = settings.sound ?? true;

  // camera rig
  const rig = {
    target: new THREE.Vector3(0, 0, 0),
    theta: 0.9, phi: 1.12, radius: 620,
    vTheta: 0, vPhi: 0,
  };
  const transit = { active: false, t: 0, dur: 3, startPos: new THREE.Vector3(), startTgt: new THREE.Vector3(), endDir: new THREE.Vector3(), endDist: 10, toRec: null, toSystem: false };
  const rigAnim = { active: false, from: 0, to: 0, t: 0, dur: 1.6 };
  const releaseBlend = { active: false, t: 0, from: new THREE.Vector3(), cur: new THREE.Vector3() };
  function endReleaseBlend() {
    releaseBlend.active = false;
    _v1.copy(camera.position).sub(sunRec.worldPos);
    const len = _v1.length() || 1;
    rig.radius = clamp(len, minRadius(), maxRadius());
    rig.phi = Math.acos(clamp(_v1.y / len, -1, 1));
    rig.theta = Math.atan2(_v1.z, _v1.x);
    rig.target.copy(sunRec.worldPos);
    gazeEase.active = true; // continue easing residual difference in applyRig
  }
  // persistent gaze smoothing: applyRig eases toward its ideal pose instead of snapping
  const gazeEase = { active: false };
  const smoothPos = new THREE.Vector3();
  const smoothTgt = new THREE.Vector3();
  let smoothInit = false;
  const free = { yaw: 0, pitch: 0, keys: {}, speed: 0 };

  // ——— scale-dependent getters ———
  function orbitR(rec) {
    const b = rec.b;
    if (b.type === 'moon') {
      const pT = TOUR_R(rec.parentRec.b.radiusKm) * (rec.parentRec.b.type === 'star' ? 0.55 : 1);
      const tour = pT * 1.9 + Math.sqrt(b.distKm / 1000) * 0.35;
      return lerp(tour, b.distKm * TRUE_AU_UNITS / KM_PER_AU, scaleT);
    }
    return lerp(TOUR_ORBIT(b.au), TRUE_ORBIT(b.au), scaleT);
  }
  function dispR(rec) {
    const b = rec.b;
    let tour = TOUR_R(b.radiusKm);
    if (b.type === 'star') tour *= 0.55;
    return lerp(tour, TRUE_R(b.radiusKm), scaleT);
  }
  function systemRadius() { return lerp(620, 15500, scaleT); }

  // ——— positions ———
  const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
  function updatePositions() {
    for (const rec of recs) {
      const b = rec.b;
      rec.dispR = dispR(rec);
      rec.mesh.scale.setScalar(rec.dispR);
      if (b.proc && b.proc.lumpy) rec.mesh.scale.multiply(_v1.set(1.22, 0.86, 1.02));
      if (b.ell) rec.mesh.scale.multiply(_v1.set(b.ell[0], b.ell[1], b.ell[2]));
      if (rec.atmo) rec.atmo.scale.setScalar(rec.dispR * (b.atmo.intensity > 1 ? 1.06 : 1.03));
      if (cloudMesh && b.id === 'earth') cloudMesh.scale.setScalar(rec.dispR * 1.015);
      if (rec.ring) rec.ring.scale.setScalar(rec.dispR);

      if (b.type === 'comet') {
        const M = rec.phase0 + TWO_PI * simDays / b.periodDays;
        const E = solveKepler(M, b.ecc);
        halleyLocal(E, scaleT, _v1);
        rec.group.position.copy(_v1);
        rec.rAu = _v1.rAu;
      } else if (b.parent) {
        const r = orbitR(rec);
        const ang = rec.phase0 - simDays * TWO_PI / rec.b.periodDays;
        _v1.set(Math.cos(ang) * r, 0, Math.sin(ang) * r).applyQuaternion(rec.qOrbit);
        rec.group.position.copy(_v1);
        if (rec.orbitLine && rec.b.type !== 'comet') rec.orbitLine.scale.setScalar(r);
      }
      // spin
      const rh = b.rotationHours === 'locked' ? Math.abs(b.periodDays) * 24 * Math.sign(b.periodDays || 1) : b.rotationHours;
      if (rh) rec.mesh.rotation.y = -simDays * 24 / rh * TWO_PI;
      rec.group.getWorldPosition(rec.worldPos);
    }
    // sun glow scale
    const sunR = sunRec.dispR;
    for (const s of glowSprites) {
      s.scale.setScalar(sunR * s.userData.size * (1 + Math.sin(simDays * 8) * 0.015));
      s.material.opacity = s.userData.op * glowMul;
    }
    // clouds: co-rotate with Earth's surface, minus a differential drift, plus a
    // slow always-on wall-clock drift so they visibly move even paused/real-time
    if (cloudMesh) cloudMesh.rotation.y = byId.earth.mesh.rotation.y * 0.955 + wallSec * 0.01;
    // comet tail: point away from sun, length by distance
    if (halley.rAu) {
      _v1.copy(halley.worldPos).normalize();
      tailGroup.quaternion.setFromUnitVectors(_v3.set(0, 0, 1), _v1);
      const lenAu = clamp(Math.pow(2.2 / halley.rAu, 1.3), 0.02, 2.2);
      const len = lerp(TOUR_ORBIT(lenAu) * 0.55, TRUE_ORBIT(lenAu), scaleT);
      tailGroup.scale.setScalar(Math.max(len, halley.dispR * 4));
      const near = clamp(2.5 / halley.rAu, 0.1, 1);
      // dim with camera distance: full brightness while near the comet,
      // fading out as you zoom away (relative to the tail's own size)
      const camDist = camera.position.distanceTo(halley.worldPos);
      const tailLen = tailGroup.scale.z;
      const camFade = clamp(Math.pow(tailLen * 2.2 / Math.max(camDist, 1e-6), 1.7), 0.012, 1);
      tailGroup.children[0].material.opacity = 0.55 * near * camFade;
      halley.coma.scale.setScalar(halley.dispR * (6 + near * 14));
      halley.coma.material.opacity = (0.25 + near * 0.5) * clamp(camFade * 1.3, 0.05, 1);
    }
    // moon orbit-line visibility
    for (const rec of recs) {
      if (!rec.moons.length) continue;
      const camDist = camera.position.distanceTo(rec.worldPos);
      const extent = orbitR(rec.moons[rec.moons.length - 1]) || 1;
      const near = camDist < extent * 14;
      for (const l of rec.moonLines) l.visible = orbitsOn && near;
      for (const m of rec.moons) m.labelNear = near;
    }
    // earth night-lights sun direction (view space)
    if (earthShaderRef) {
      const e = byId.earth;
      _v1.copy(sunRec.worldPos).sub(e.worldPos).normalize().transformDirection(camera.matrixWorldInverse);
      earthShaderRef.uniforms.uSunDirView.value.copy(_v1);
    }
  }

  // ——— camera ———
  function camFocus() { return selected || focusRec; }
  function followPos() { return camFocus() ? camFocus().worldPos : sunRec.worldPos; }
  function minRadius() { return (camFocus() ? camFocus().dispR : sunRec.dispR) * 1.9 + 0.008; }
  function maxRadius() { return camFocus() ? Math.max(camFocus().dispR * 220, 30) : systemRadius() * 3.5; }

  function applyRig(dt) {
    if (releaseBlend.active) {
      // hold position, very slowly swing the gaze from the released body to the system
      releaseBlend.t += dt / 4.5;
      const tt = Math.min(releaseBlend.t, 1);
      const e = tt * tt * tt * (tt * (tt * 6 - 15) + 10); // smootherstep — gentle in and out
      releaseBlend.cur.lerpVectors(releaseBlend.from, sunRec.worldPos, e);
      camera.lookAt(releaseBlend.cur);
      smoothTgt.copy(releaseBlend.cur);
      smoothPos.copy(camera.position);
      smoothInit = true;
      if (releaseBlend.t >= 1) endReleaseBlend();
      return;
    }
    if (rigAnim.active) {
      rigAnim.t += dt / rigAnim.dur;
      const e = easeInOutCubic(Math.min(rigAnim.t, 1));
      rig.radius = lerp(rigAnim.from, rigAnim.to, e);
      if (rigAnim.t >= 1) rigAnim.active = false;
    }
    if (mode === 'system' && driftSpeed > 0 && !dragging) rig.theta += dt * 0.02 * driftSpeed;
    rig.theta += rig.vTheta; rig.phi += rig.vPhi;
    rig.vTheta *= 0.9; rig.vPhi *= 0.9;
    rig.phi = clamp(rig.phi, 0.05, Math.PI - 0.05);
    rig.radius = clamp(rig.radius, minRadius(), maxRadius());
    rig.target.copy(followPos());
    const sp = Math.sin(rig.phi);
    _v1.set(
      rig.target.x + rig.radius * sp * Math.cos(rig.theta),
      rig.target.y + rig.radius * Math.cos(rig.phi),
      rig.target.z + rig.radius * sp * Math.sin(rig.theta),
    );
    // critically-damped style smoothing: camera chases its ideal pose, never jumps.
    // Tracked-body motion is followed exactly (offset math), only pose *changes* are eased.
    if (!smoothInit) { smoothPos.copy(_v1); smoothTgt.copy(rig.target); smoothInit = true; }
    const k = 1 - Math.pow(0.0005, dt); // ~snappy but seamless (settles in ~1s)
    smoothPos.lerp(_v1, k);
    smoothTgt.lerp(rig.target, k);
    camera.position.copy(smoothPos);
    camera.lookAt(smoothTgt);
  }

  function startTransit(toRec, toSystem) {
    // cancel any in-flight camera choreography so nothing fights the transit
    releaseBlend.active = false;
    rigAnim.active = false;
    transit.active = true; transit.t = 0; transit.boost = 1;
    transit.toRec = toRec; transit.toSystem = !!toSystem;
    transit.startPos.copy(camera.position);
    // start the gaze exactly where the camera is actually looking (any mode), so there is no snap
    camera.getWorldDirection(_v3);
    const destPos = toSystem ? sunRec.worldPos : toRec.worldPos;
    transit.startTgt.copy(camera.position).addScaledVector(_v3, Math.max(camera.position.distanceTo(destPos) * 0.5, 1));
    const dest = destPos;
    transit.endDist = toSystem ? systemRadius() : toRec.dispR * 4.2 + 0.02;
    _v1.copy(camera.position).sub(dest);
    if (_v1.lengthSq() < 1e-9) _v1.set(1, 0.4, 0.6);
    _v1.normalize();
    // bias arrival toward the sunlit hemisphere so we never settle on the night side
    if (!toSystem && toRec !== sunRec) {
      _v2.copy(sunRec.worldPos).sub(dest).normalize();
      _v1.multiplyScalar(0.35).add(_v2.multiplyScalar(0.65)).normalize();
    }
    transit.endDir.copy(_v1).add(_v2.set(0, 0.35, 0)).normalize();
    const len = camera.position.distanceTo(dest);
    transit.dur = clamp(2.6 + len * 0.0095, 3.2, 8.5);
    mode = 'transit';
    on.mode && on.mode('transit');
    on.transit && on.transit(toSystem ? null : toRec.b.id);
    audio.whoosh(Math.min(transit.dur, 3));
  }
  function finishTransit() {
    transit.active = false;
    const dest = transit.toSystem ? sunRec.worldPos : transit.toRec.worldPos;
    // derive rig from end offset
    _v1.copy(transit.endDir).multiplyScalar(transit.endDist);
    rig.radius = transit.endDist;
    rig.phi = Math.acos(clamp(_v1.y / transit.endDist, -1, 1));
    rig.theta = Math.atan2(_v1.z, _v1.x);
    rig.target.copy(dest);
    // safety: never seed the damper from a corrupt camera pose
    if (!isFinite(camera.position.x)) camera.position.copy(dest).addScaledVector(transit.endDir, transit.endDist);
    smoothPos.copy(camera.position);
    smoothTgt.copy(dest);
    smoothInit = true;
    mode = transit.toSystem ? 'system' : 'orbit';
    camera.fov = 55; camera.updateProjectionMatrix();
    on.mode && on.mode(mode);
    on.transit && on.transit(null);
    audio.blip(880, 0.09, 0.045);
  }
  function updateTransit(dt) {
    transit.t += dt * (transit.boost || 1) / transit.dur;
    const t = Math.min(transit.t, 1);
    const e = easeShip(t);
    // subtle FOV stretch at peak velocity for a sense of speed
    camera.fov = 55 + 10 * Math.pow(Math.sin(Math.PI * t), 2);
    camera.updateProjectionMatrix();
    const dest = transit.toSystem ? sunRec.worldPos : transit.toRec.worldPos;
    _v1.copy(dest).add(_v2.copy(transit.endDir).multiplyScalar(transit.endDist)); // end pos
    const len = transit.startPos.distanceTo(_v1);
    _v2.lerpVectors(transit.startPos, _v1, e);
    _v2.y += Math.sin(Math.PI * e) * Math.min(len * 0.12, 40);
    camera.position.copy(_v2);
    _v3.lerpVectors(transit.startTgt, dest, easeOutCubic(Math.min(t * 1.5, 1)));
    camera.lookAt(_v3);
    if (t >= 1) finishTransit();
  }

  function updateFree(dt) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(free.pitch, free.yaw, 0, 'YXZ'));
    camera.quaternion.copy(q);
    let nearest = Infinity;
    for (const rec of recs) nearest = Math.min(nearest, camera.position.distanceTo(rec.worldPos) - rec.dispR);
    const base = clamp(nearest * 0.9, 0.03, 900) * (free.keys.shift ? 4 : 1);
    _v1.set(0, 0, 0);
    if (free.keys.w) _v1.z -= 1; if (free.keys.s) _v1.z += 1;
    if (free.keys.a) _v1.x -= 1; if (free.keys.d) _v1.x += 1;
    if (free.keys.e) _v1.y += 1; if (free.keys.q) _v1.y -= 1;
    const moving = _v1.lengthSq() > 0;
    free.speed = lerp(free.speed, moving ? base : 0, 1 - Math.pow(0.002, dt));
    if (free.speed > 0.0001) {
      _v1.normalize().applyQuaternion(q).multiplyScalar(free.speed * dt);
      camera.position.add(_v1);
      // soft no-clip
      for (const rec of recs) {
        const d = camera.position.distanceTo(rec.worldPos);
        const min = rec.dispR * 1.05;
        if (d < min) {
          _v2.copy(camera.position).sub(rec.worldPos).normalize().multiplyScalar(min);
          camera.position.copy(rec.worldPos).add(_v2);
        }
      }
    }
  }

  // ——— selection ———
  function select(id, opt = {}) {
    const rec = id ? byId[id] : null;
    if (rec === selected && mode !== 'system') return;
    setLineHighlight(selected, false);
    selected = rec;
    focusRec = rec || null;
    setLineHighlight(selected, true);
    on.select && on.select(rec ? rec.b.id : null);
    audio.ensure(); audio.blip(1320, 0.06, 0.05);
    if (rec) {
      // slow time on arrival so the body is watchable up close
      if (SPEEDS[speedIdx].dps > SPEEDS[1].dps) {
        speedIdx = 1; // 1S = 1 HR
        on.clock && on.clock(clockInfo());
      }
      if (opt.instant) {
        rig.radius = rec.dispR * 4.2;
        mode = 'orbit'; on.mode && on.mode('orbit');
      } else startTransit(rec, false);
    } else {
      startTransit(null, true);
    }
  }
  // exit a body: stop tracking it entirely and hand back the free system-orbit camera
  function releaseSelection() {
    if (!selected && !focusRec) return;
    const rec = selected || focusRec;
    setLineHighlight(selected, false);
    selected = null;
    focusRec = null;
    on.select && on.select(null);
    releaseBlend.active = true;
    releaseBlend.t = 0;
    releaseBlend.from.copy(rec.worldPos);
    mode = 'system';
    on.mode && on.mode('system');
    audio.blip(740, 0.07, 0.04);
  }

  function setLineHighlight(rec, hl) {
    if (!rec || !rec.orbitLine) return;
    rec.orbitLine.material.color.set(hl ? ACCENT : '#ffffff');
    rec.orbitLine.material.opacity = hl ? 0.72 : (rec.b.type === 'moon' ? 0.19 : rec.b.type === 'comet' ? 0.12 : 0.145);
  }

  // ——— input ———
  let dragging = false, dragMoved = 0, downX = 0, downY = 0, downT = 0;
  const pointers = new Map();
  let pinchDist = 0;
  const el = renderer.domElement;
  el.style.touchAction = 'none';
  el.style.cursor = 'grab';

  el.addEventListener('pointerdown', (ev) => {
    audio.ensure();
    if (releaseBlend.active) endReleaseBlend();
    pointers.set(ev.pointerId, [ev.clientX, ev.clientY]);
    if (pointers.size === 2) {
      const p = [...pointers.values()];
      pinchDist = Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]);
    }
    dragging = true; dragMoved = 0; downX = ev.clientX; downY = ev.clientY; downT = performance.now();
    el.setPointerCapture(ev.pointerId);
    if (mode !== 'free') el.style.cursor = 'grabbing';
  });
  el.addEventListener('pointermove', (ev) => {
    if (mode === 'free' && document.pointerLockElement === el) {
      free.yaw -= ev.movementX * 0.0021;
      free.pitch = clamp(free.pitch - ev.movementY * 0.0021, -1.45, 1.45);
      return;
    }
    if (!pointers.has(ev.pointerId)) { hoverAt(ev.clientX, ev.clientY); return; }
    const prev = pointers.get(ev.pointerId);
    const dx = ev.clientX - prev[0], dy = ev.clientY - prev[1];
    pointers.set(ev.pointerId, [ev.clientX, ev.clientY]);
    dragMoved += Math.abs(dx) + Math.abs(dy);
    if (pointers.size === 2) {
      const p = [...pointers.values()];
      const nd = Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]);
      if (pinchDist > 0) { rigAnim.active = false; rig.radius *= pinchDist / nd; }
      pinchDist = nd;
      return;
    }
    if (mode === 'system' || mode === 'orbit') {
      rig.vTheta = dx * 0.004;
      rig.vPhi = -dy * 0.004;
    }
  });
  function endPointer(ev) {
    pointers.delete(ev.pointerId);
    if (pointers.size < 2) pinchDist = 0;
    if (pointers.size === 0) dragging = false;
    el.style.cursor = mode === 'free' ? 'crosshair' : 'grab';
    if (dragMoved < 6 && performance.now() - downT < 500) handleClick(ev.clientX, ev.clientY);
  }
  el.addEventListener('pointerup', endPointer);
  el.addEventListener('pointercancel', (ev) => { pointers.delete(ev.pointerId); dragging = false; });
  el.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    rigAnim.active = false;
    if (mode === 'system' || mode === 'orbit') rig.radius *= Math.exp(ev.deltaY * 0.0011);
  }, { passive: false });
  el.addEventListener('contextmenu', (ev) => ev.preventDefault());

  function pickAt(px, py) {
    const rect = container.getBoundingClientRect();
    const x = px - rect.left, y = py - rect.top;
    let best = null, bestD = Infinity;
    for (const rec of recs) {
      const s = rec.screen;
      if (!s.vis) continue;
      if (rec.b.type === 'moon' && !rec.labelNear && selected !== rec) continue; // moons pickable only near
      const d = Math.hypot(s.x - x, s.y - y);
      const hitR = Math.max(s.r * 1.5, 14);
      if (d < hitR && d - s.r < bestD) { bestD = d - s.r; best = rec; }
    }
    return best;
  }
  function handleClick(px, py) {
    if (mode === 'transit') { skipTransit(); return; }
    if (mode === 'free') return;
    const rec = pickAt(px, py);
    if (rec && rec !== selected) select(rec.b.id);
  }
  function hoverAt(px, py) {
    if (mode === 'transit' || mode === 'free') { hovered = null; return; }
    const rec = pickAt(px, py);
    if (rec !== hovered) {
      hovered = rec;
      el.style.cursor = rec ? 'pointer' : 'grab';
      on.hover && on.hover(rec ? rec.b.id : null);
      if (rec) audio.blip(1760, 0.03, 0.012);
    }
  }
  // skip = fast-forward the flight (×6) instead of hard-cutting to arrival
  function skipTransit() { if (transit.active) transit.boost = 6; }

  // free flight toggle
  function toggleFree(onOff) {
    const want = onOff ?? mode !== 'free';
    if (want && mode !== 'free') {
      mode = 'free';
      // derive yaw/pitch from current camera
      const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
      free.yaw = e.y; free.pitch = e.x; free.speed = 0;
      if (!isTouch) el.requestPointerLock && el.requestPointerLock();
      el.style.cursor = 'crosshair';
      on.mode && on.mode('free');
      audio.blip(660, 0.1, 0.05);
    } else if (!want && mode === 'free') {
      if (document.pointerLockElement === el) document.exitPointerLock();
      exitFreeToOrbit();
    }
  }
  function exitFreeToOrbit() {
    // orbit whatever we're closest to (or system)
    let nearRec = null, nearD = Infinity;
    for (const rec of recs) {
      const d = camera.position.distanceTo(rec.worldPos) / Math.max(rec.dispR, 0.01);
      if (d < nearD) { nearD = d; nearRec = rec; }
    }
    if (nearRec && nearD < 60 && nearRec !== sunRec) {
      setLineHighlight(selected, false);
      selected = nearRec; setLineHighlight(selected, true);
      on.select && on.select(nearRec.b.id);
    }
    const tgt = followPos();
    _v1.copy(camera.position).sub(tgt);
    rig.radius = clamp(_v1.length(), minRadius(), maxRadius());
    rig.phi = Math.acos(clamp(_v1.y / (_v1.length() || 1), -1, 1));
    rig.theta = Math.atan2(_v1.z, _v1.x);
    // reseed the damper from the ACTUAL current pose so orbit mode glides in, never jumps
    smoothPos.copy(camera.position);
    camera.getWorldDirection(_v2);
    smoothTgt.copy(camera.position).addScaledVector(_v2, camera.position.distanceTo(tgt) || 1);
    smoothInit = true;
    mode = selected ? 'orbit' : 'system';
    el.style.cursor = 'grab';
    on.mode && on.mode(mode);
  }
  document.addEventListener('pointerlockchange', () => {
    if (mode === 'free' && document.pointerLockElement !== el && !isTouch) exitFreeToOrbit();
  });

  // keyboard
  const PLANET_KEYS = { 1: 'mercury', 2: 'venus', 3: 'earth', 4: 'mars', 5: 'jupiter', 6: 'saturn', 7: 'uranus', 8: 'neptune', 0: 'sun' };
  const visitOrder = recs.filter(r => r.b.type !== 'moon').map(r => r.b.id)
    .concat(recs.filter(r => r.b.type === 'moon').map(r => r.b.id));
  function onKeyDown(ev) {
    const k = ev.key.toLowerCase();
    if (mode === 'free') {
      if (['w', 'a', 's', 'd', 'q', 'e'].includes(k)) { free.keys[k] = true; ev.preventDefault(); return; }
      if (k === 'shift') { free.keys.shift = true; return; }
    }
    if (k === 'f') { toggleFree(); return; }
    if (k === 'escape') {
      if (mode === 'transit') skipTransit();
      else if (mode === 'free') toggleFree(false);
      else if (selected || focusRec) releaseSelection();
      return;
    }
    if (k === ' ') { paused = !paused; on.clock && on.clock(clockInfo()); ev.preventDefault(); return; }
    if (PLANET_KEYS[k] !== undefined && mode !== 'free') { select(PLANET_KEYS[k]); return; }
    if ((k === '[' || k === ']') && mode !== 'free') {
      const cur = selected ? visitOrder.indexOf(selected.b.id) : -1;
      const n = visitOrder.length;
      const next = k === ']' ? (cur + 1) % n : (cur - 1 + n) % n;
      select(visitOrder[next]);
    }
  }
  function onKeyUp(ev) {
    const k = ev.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'q', 'e'].includes(k)) free.keys[k] = false;
    if (k === 'shift') free.keys.shift = false;
  }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  // ——— labels update ———
  const _pv = new THREE.Vector3();
  function updateLabels() {
    const rect = { w: container.clientWidth, h: container.clientHeight };
    const cands = [];
    for (const rec of recs) {
      _pv.copy(rec.worldPos).project(camera);
      const s = rec.screen;
      s.vis = _pv.z < 1 && _pv.x > -1.15 && _pv.x < 1.15 && _pv.y > -1.15 && _pv.y < 1.15;
      s.x = (_pv.x * 0.5 + 0.5) * rect.w;
      s.y = (-_pv.y * 0.5 + 0.5) * rect.h;
      const dist = camera.position.distanceTo(rec.worldPos);
      const ang = rec.dispR / Math.max(dist, 1e-6);
      s.r = ang * rect.h * 0.9; // approx projected px radius
      s.ang = ang;
      if (s.vis) cands.push(rec);
    }
    // choose visible labels
    cands.sort((a, b) => b.screen.ang - a.screen.ang);
    let shown = 0;
    for (const rec of cands) {
      const s = rec.screen;
      const isSel = rec === selected, isHov = rec === hovered;
      const auto = labelsOn && s.ang > 0.02 && s.ang < 2.5 && shown < 10 && mode !== 'free';
      const freeNear = labelsOn && mode === 'free' && s.ang > 0.035 && shown < 6;
      const show = isSel || isHov || auto || freeNear;
      const elb = rec.labelEl;
      if (show) {
        shown++;
        elb.style.display = 'block';
        elb.style.transform = `translate(-50%,-100%) translate(${s.x.toFixed(1)}px,${(s.y - s.r - 10).toFixed(1)}px)`;
        rec.labelName.style.color = isSel || isHov ? ACCENT : '#F2F3F5';
        rec.labelLine.style.background = isSel || isHov ? ACCENT + '99' : 'rgba(242,243,245,0.4)';
      } else elb.style.display = 'none';
    }
    for (const rec of recs) if (!rec.screen.vis) rec.labelEl.style.display = 'none';
    // reticle
    if (selected && selected.screen.vis && (mode === 'orbit' || mode === 'transit')) {
      const s = selected.screen;
      const sz = Math.max(s.r * 2.3, 34);
      reticle.style.display = 'block';
      reticle.style.width = reticle.style.height = sz + 'px';
      reticle.style.left = (s.x - sz / 2) + 'px';
      reticle.style.top = (s.y - sz / 2) + 'px';
    } else reticle.style.display = 'none';
  }

  // ——— clock ———
  function fmtElapsed(days) {
    const y = Math.floor(days / 365.25);
    const d = Math.floor(days % 365.25);
    const h = Math.floor((days % 1) * 24);
    return (y > 0 ? y + 'Y ' : '') + String(d).padStart(3, '0') + 'D ' + String(h).padStart(2, '0') + 'H';
  }
  function clockInfo() { return { elapsed: 'T+ ' + fmtElapsed(simDays), paused, speedIdx, speedLabel: SPEEDS[speedIdx].label }; }

  // ——— resize ———
  function resize() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  // ——— main loop ———
  let last = performance.now(), disposed = false;
  let clockAcc = 0, hudAcc = 0;
  let prevRefR = null;
  function frame(now) {
    if (disposed) return;
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;

    if (!paused) simDays += dt * SPEEDS[speedIdx].dps;
    wallSec += dt;

    // scale animation (preserve framing)
    if (Math.abs(scaleT - scaleTarget) > 1e-4) {
      scaleT = lerp(scaleT, scaleTarget, 1 - Math.pow(0.06, dt));
      if (Math.abs(scaleT - scaleTarget) < 1e-3) scaleT = scaleTarget;
      rebuildHalleyLine(scaleT);
      asteroidBelt.material.uniforms.uScaleT.value = scaleT;
      kuiperBelt.material.uniforms.uScaleT.value = scaleT;
      const ref = camFocus() ? dispR(camFocus()) : systemRadius();
      if (prevRefR != null && prevRefR > 0) rig.radius *= ref / prevRefR;
      prevRefR = ref;
    } else prevRefR = camFocus() ? dispR(camFocus()) : systemRadius();

    updatePositions();

    asteroidBelt.material.uniforms.uDays.value = simDays;
    kuiperBelt.material.uniforms.uDays.value = simDays;

    if (mode === 'transit') updateTransit(dt);
    else if (mode === 'free') updateFree(dt);
    else applyRig(dt);

    // self-heal: a non-finite camera pose freezes the renderer — reset to a sane orbit
    if (!isFinite(camera.position.x) || !isFinite(camera.fov)) {
      camera.fov = 55; camera.updateProjectionMatrix();
      smoothInit = false;
      rig.theta = 0.9; rig.phi = 1.12;
      rig.radius = clamp(rig.radius, minRadius(), maxRadius());
      if (!isFinite(rig.radius)) rig.radius = selected ? selected.dispR * 4.2 : systemRadius();
      if (mode === 'transit') { transit.active = false; mode = selected ? 'orbit' : 'system'; on.mode && on.mode(mode); on.transit && on.transit(null); }
      if (mode === 'free') { mode = selected ? 'orbit' : 'system'; on.mode && on.mode(mode); }
      applyRig(0);
    }

    starObj.position.copy(camera.position);

    updateLabels();

    clockAcc += dt;
    if (clockAcc > 0.25) { clockAcc = 0; on.clock && on.clock(clockInfo()); }
    if (mode === 'free') {
      hudAcc += dt;
      if (hudAcc > 0.12) { hudAcc = 0; on.freeHud && on.freeHud({ vel: free.speed.toFixed(1) }); }
    }

    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  // orbit line master visibility
  function applyOrbitsVisible() {
    for (const rec of recs) {
      if (!rec.orbitLine) continue;
      if (rec.b.type === 'moon') continue; // handled by proximity in updatePositions
      rec.orbitLine.visible = orbitsOn;
    }
  }
  applyOrbitsVisible();

  // ——— api ———
  const api = {
    select: (id) => select(id),
    clearSelection: () => releaseSelection(),
    skipTransit,
    toggleFree,
    setPaused: (v) => { paused = v; on.clock && on.clock(clockInfo()); },
    setSpeedIdx: (i) => { speedIdx = clamp(i, 0, SPEEDS.length - 1); audio.blip(990, 0.04, 0.03); on.clock && on.clock(clockInfo()); },
    setOrbits: (v) => { orbitsOn = v; applyOrbitsVisible(); },
    setLabels: (v) => { labelsOn = v; },
    setSound: (v) => { audio.ensure(); audio.setEnabled(v); },
    setScale: (m) => { scaleTarget = m === 'true' ? 1 : 0; audio.blip(520, 0.14, 0.05); },
    setGlow: (v) => { glowMul = v; },
    setBeltDensity: (v) => applyDensity(v),
    setDrift: (v) => { driftSpeed = v; },
    dispose: () => {
      disposed = true;
      ro.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      renderer.dispose();
      container.innerHTML = '';
    },
  };
  api.debug = () => ({
    mode, fov: camera.fov, cam: camera.position.toArray().map((n) => +n.toFixed(3)),
    sel: selected && selected.b.id,
    dist: selected ? +camera.position.distanceTo(selected.worldPos).toFixed(4) : null,
    dispR: selected ? +selected.dispR.toFixed(4) : null,
    meshVisible: selected ? selected.mesh.visible : null,
    meshScale: selected ? selected.mesh.scale.toArray().map((n) => +n.toFixed(4)) : null,
    smoothPos: smoothPos.toArray().map((n) => +n.toFixed(3)),
    rigRadius: +rig.radius.toFixed(4),
  });
  window.__solsim = api;
  return api;
}
