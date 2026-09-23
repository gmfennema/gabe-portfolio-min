/* A first-person walk through the woods, drawn with three.js.
   WoodsWorld (woods-path.js) decides where everything is. This file paints
   it, walks the camera along the trail as the page scrolls, and keeps the
   four signs as real links laid exactly over the boards. */
import * as THREE from './vendor/three-0.180.0/three.module.min.js';

const W = WoodsWorld;
const root = document.documentElement;
const home = document.querySelector('.woods-home');

if (home) start().catch(error => {
  root.classList.remove('woods-live', 'woods-walking', 'woods-still', 'at-junction');
  root.classList.add('woods-failed');
  console.warn('The woods could not be drawn, so the still trail is showing instead.', error);
});

async function start() {
  // Let the welcome paint before the forest grows.
  await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
  const $ = selector => home.querySelector(selector);
  const stage = $('.woods-stage'), walk = $('.woods-walk'), canvas = $('.woods-canvas');
  const intro = $('.woods-intro'), arrivalCopy = $('.woods-arrival'), hint = $('.woods-hint');
  const links = [...home.querySelectorAll('.woods-sign')];
  const soundButton = $('.woods-sound'), windButton = $('.woods-wind');
  const mile = $('.woods-mile-number'), mileCopy = $('.woods-mile-copy'), progressBar = $('.woods-progress span');

  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const LOW = !fine || Math.min(screen.width, screen.height) < 700 || (navigator.hardwareConcurrency || 8) <= 4;
  const Q = LOW
    ? {dpr: 1.35, shadow: 1024, grass: 5000, grid: 1.6, motes: 220, rays: 16, bark: 128, aa: false}
    : {dpr: 1.75, shadow: 2048, grass: 11000, grid: 1.25, motes: 480, rays: 28, bark: 256, aa: true};

  const renderer = new THREE.WebGLRenderer({canvas, antialias: Q.aa, powerPreference: 'high-performance'});
  let pixelRatio = Math.min(devicePixelRatio || 1, Q.dpr);
  renderer.setPixelRatio(pixelRatio);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  // ---- Light: late afternoon, the sun low over the left shoulder.
  const HAZE = new THREE.Color('#dcd2b2');
  const SUN = new THREE.Vector3(-.84, .38, .1).normalize();
  const SUN_COLOR = new THREE.Color('#ffd6a0');
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(HAZE, .0118);
  renderer.setClearColor(HAZE);
  const camera = new THREE.PerspectiveCamera(56, 1, .08, 5200);
  camera.rotation.order = 'YXZ';
  const sun = new THREE.DirectionalLight(SUN_COLOR, 3.1);
  const SHADOW = 36;
  sun.castShadow = true;
  sun.shadow.mapSize.set(Q.shadow, Q.shadow);
  Object.assign(sun.shadow.camera, {left: -SHADOW, right: SHADOW, top: SHADOW, bottom: -SHADOW, near: 1, far: 190});
  sun.shadow.bias = -.0004;
  sun.shadow.normalBias = .05;
  scene.add(sun, sun.target, new THREE.HemisphereLight('#cbdbe2', '#5d5436', 1.35));

  const rnd = W.random(20260923), R = (a, b) => a + (b - a) * rnd(), pick = list => list[Math.floor(rnd() * list.length)];
  const UP = new THREE.Vector3(0, 1, 0);

  // ---- Wind, shared by every swaying thing and by the sound of it.
  const shared = {uTime: {value: 0}, uWindAmp: {value: 1}, uWindDir: {value: new THREE.Vector2(.88, .47)}, uSunDir: {value: SUN}, uSunColor: {value: SUN_COLOR}};
  const f = x => Number(x).toFixed(4);
  const WIND = `
    uniform float uTime; uniform float uWindAmp; uniform vec2 uWindDir;
    float woodsHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float woodsGust(vec2 p) { float g = .5 + .5 * sin(uTime * .62 - p.x * .12 - p.y * .035); return g * g * g; }
    vec2 woodsSway(vec2 p) {
      return uWindDir * (.22 + woodsGust(p) * 1.35 + sin(uTime * 1.17 + woodsHash(p) * 6.2831) * .3) * uWindAmp;
    }`;
  // Bend grows with height (geometry is built one unit tall), applied in world
  // space after instancing so every tree leans the same way in a gust.
  function sway(material, options = {}) {
    const {bend = 0, flutter = 0, sprite = false, glow = 0, upright = false} = options;
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, shared);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          ${WIND}
          ${sprite ? 'attribute vec4 aSprite;' : ''}
          varying vec3 vWorld;`)
        .replace('#include <project_vertex>', `
          vec4 wp = vec4(transformed, 1.0);
          vec2 origin = vec2(0.0);
          float span = 1.0, girth = 1.0;
          #ifdef USE_INSTANCING
            wp = instanceMatrix * wp;
            origin = instanceMatrix[3].xz;
            span = length(instanceMatrix[1].xyz);
            girth = length(instanceMatrix[0].xyz);
          #endif
          wp = modelMatrix * wp;
          float lift = clamp(position.y, 0.0, 1.0);
          float phase = woodsHash(origin) * 6.2831 + lift * 2.0${sprite ? ' + aSprite.w' : ''};
          wp.xz += woodsSway(origin) * (${f(bend)} * lift * lift * span + ${f(flutter)} * lift * sin(uTime * 2.9 + phase));
          vec4 mvPosition = viewMatrix * wp;
          ${sprite ? `float sc = cos(aSprite.w), ss = sin(aSprite.w);
          mvPosition.xy += mat2(sc, ss, -ss, sc) * aSprite.xy * aSprite.z * girth;` : ''}
          gl_Position = projectionMatrix * mvPosition;
          vWorld = wp.xyz;`)
        .replace('#include <worldpos_vertex>', 'vec4 worldPosition = wp;');
      // Blades and fronds are lit like the ground they grow from, on both faces.
      if (upright) shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);');
      if (glow) shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uSunDir; uniform vec3 uSunColor; varying vec3 vWorld;')
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
          // Light through leaves: foliage between the eye and the sun glows.
          float back = pow(max(dot(normalize(vWorld - cameraPosition), uSunDir), 0.0), 4.0);
          reflectedLight.indirectDiffuse += diffuseColor.rgb * uSunColor * (back * ${f(glow)} + ${f(glow * .1)});`);
    };
    material.customProgramCacheKey = () => 'woods' + JSON.stringify(options);
    return material;
  }

  // ---- Everything is painted here, at load, so there is nothing to download.
  function paint(w, h, draw, {wrap = false, srgb = true, aniso = 8} = {}) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const texture = new THREE.CanvasTexture(c);
    if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
    if (wrap) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(maxAniso, aniso);
    return texture;
  }
  // Draw near an edge twice so tiling textures have no seams.
  function tiled(size, x, y, pad, fn) {
    for (const ox of [0, -size, size]) for (const oy of [0, -size, size]) {
      const px = x + ox, py = y + oy;
      if (px > -pad && px < size + pad && py > -pad && py < size + pad) fn(px, py);
    }
  }
  function blotches(g, s, count, colors, r0, r1) {
    for (let i = 0; i < count; i++) {
      const x = R(0, s), y = R(0, s), r = R(r0, r1), color = pick(colors);
      tiled(s, x, y, r, (px, py) => {
        const gradient = g.createRadialGradient(px, py, 0, px, py, r);
        gradient.addColorStop(0, color); gradient.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gradient; g.fillRect(px - r, py - r, r * 2, r * 2);
      });
    }
  }
  function strokes(g, s, count, colors, length, width, angle = () => R(0, Math.PI * 2)) {
    g.lineCap = 'round';
    for (let i = 0; i < count; i++) {
      const x = R(0, s), y = R(0, s), a = angle(), len = R(...length);
      g.strokeStyle = pick(colors); g.lineWidth = R(...width);
      tiled(s, x, y, len + 2, (px, py) => { g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len); g.stroke(); });
    }
  }
  const duff = paint(512, 512, (g, s) => {
    g.fillStyle = '#5b4a33'; g.fillRect(0, 0, s, s);
    blotches(g, s, 80, ['rgba(38,28,18,.3)', 'rgba(126,100,64,.25)', 'rgba(86,82,48,.22)', 'rgba(70,52,34,.3)'], 20, 80);
    strokes(g, s, 2600, ['#4a3a27', '#5f4a31', '#6e5636', '#3c3122'], [8, 22], [.8, 1.6]);
    strokes(g, s, 2400, ['#8b6b43', '#a3804d', '#b08a55', '#94774a', '#c29a62'], [8, 24], [.8, 1.5]);
    strokes(g, s, 60, ['#3a2e20', '#4d3b28'], [24, 60], [2, 3.5]);
    for (let i = 0; i < 260; i++) { g.fillStyle = pick(['#5d6a35', '#6f7a3c', '#4f5a2d']); const x = R(0, s), y = R(0, s); tiled(s, x, y, 3, (px, py) => g.fillRect(px, py, 2, 2)); }
  }, {wrap: true, aniso: 16});
  const dirt = paint(512, 512, (g, s) => {
    g.fillStyle = '#a08764'; g.fillRect(0, 0, s, s);
    blotches(g, s, 70, ['rgba(120,92,60,.35)', 'rgba(196,170,128,.3)', 'rgba(140,110,70,.3)', 'rgba(90,72,50,.2)'], 16, 70);
    for (let i = 0; i < 11000; i++) { g.fillStyle = pick(['rgba(70,54,38,.5)', 'rgba(215,196,160,.45)', 'rgba(130,104,74,.5)']); g.fillRect(R(0, s), R(0, s), R(1, 2.4), R(1, 2.4)); }
    for (let i = 0; i < 280; i++) {
      const x = R(0, s), y = R(0, s), r = R(1.5, 4.5), a = R(0, 3);
      tiled(s, x, y, 6, (px, py) => {
        g.fillStyle = pick(['#8d8272', '#a39681', '#766b5b', '#b7a88f']); g.beginPath(); g.ellipse(px, py, r, r * .75, a, 0, 6.283); g.fill();
        g.fillStyle = 'rgba(255,245,220,.35)'; g.beginPath(); g.arc(px - r * .3, py - r * .3, r * .35, 0, 6.283); g.fill();
      });
    }
    strokes(g, s, 260, ['#7d6240', '#9b7b4c', '#5e4a31'], [8, 18], [.8, 1.3]);
  }, {wrap: true, aniso: 16});
  const meadowGround = paint(512, 512, (g, s) => {
    g.fillStyle = '#7a7043'; g.fillRect(0, 0, s, s);
    blotches(g, s, 60, ['rgba(160,140,80,.3)', 'rgba(80,90,44,.3)', 'rgba(110,90,56,.3)'], 20, 70);
    strokes(g, s, 3800, ['#a39a5c', '#6b6a3a', '#c2b079', '#8a8448', '#5d6134'], [5, 14], [1, 1.8], () => -Math.PI / 2 + R(-.7, .7));
  }, {wrap: true, aniso: 16});

  // Periodic value noise in three bands, for breaking up tiling in shaders.
  const noiseTexture = (() => {
    const s = 256, data = new Uint8Array(s * s * 4);
    const band = (x, y, periods, seed) => {
      let sum = 0, amp = 1, total = 0;
      for (const p of periods) {
        const fx = x / s * p, fy = y / s * p, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
        const u = tx * tx * (3 - 2 * tx), v = ty * ty * (3 - 2 * ty);
        const h = (a, b) => W.hash(a % p, b % p, seed + p);
        const top = W.mix(h(ix, iy), h(ix + 1, iy), u), bottom = W.mix(h(ix, iy + 1), h(ix + 1, iy + 1), u);
        sum += W.mix(top, bottom, v) * amp; total += amp; amp *= .55;
      }
      return sum / total;
    };
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const k = (y * s + x) * 4;
      data[k] = band(x, y, [4, 8, 16, 32], 1) * 255;
      data[k + 1] = band(x, y, [16, 32, 64], 2) * 255;
      data[k + 2] = band(x, y, [64, 128], 3) * 255;
      data[k + 3] = 255;
    }
    const texture = new THREE.DataTexture(data, s, s);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    return texture;
  })();

  // Ponderosa bark: orange plates split by dark fissures, like jigsaw pieces.
  const pineBark = paint(Q.bark, Q.bark * 2, (g, w, h) => {
    const cols = 8, rows = 19, cw = w / cols, ch = h / rows, palette = [[160, 98, 58], [180, 116, 70], [142, 88, 54], [190, 132, 84], [128, 80, 50], [170, 108, 66]];
    const cells = Array.from({length: cols * rows}, () => [R(.12, .88), R(.12, .88), pick(palette), R(.84, 1.08)]);
    const image = g.createImageData(w, h), px = image.data, scale = 256 / w;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const gx = Math.floor(x / cw), gy = Math.floor(y / ch);
      let d1 = Infinity, d2 = Infinity, near = cells[0];
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const i = (gx + ox + cols) % cols, j = (gy + oy + rows) % rows, c = cells[j * cols + i];
        const dx = (gx + ox + c[0]) * cw - x, dy = (gy + oy + c[1]) * ch - y, dd = dx * dx + dy * dy * .45;
        if (dd < d1) { d2 = d1; d1 = dd; near = c; } else if (dd < d2) d2 = dd;
      }
      const edge = (Math.sqrt(d2) - Math.sqrt(d1)) * scale, bevel = W.smooth(.8, 5, edge);
      const flake = .84 + .26 * W.hash(x >> 1, y >> 2, 7), k = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) px[k + c] = W.mix([44, 30, 21][c], near[2][c] * near[3] * flake, bevel);
      px[k + 3] = 255;
    }
    g.putImageData(image, 0, 0);
  }, {wrap: true});
  const firBark = paint(Q.bark, Q.bark * 2, (g, w, h) => {
    g.fillStyle = '#5c5249'; g.fillRect(0, 0, w, h);
    g.lineCap = 'round';
    for (let i = 0; i < 220; i++) {
      const x = R(0, w), y = R(0, h), len = R(.1, .45) * h, dark = rnd() < .6;
      g.strokeStyle = dark ? `rgba(34,28,24,${R(.4, .8)})` : `rgba(130,118,104,${R(.3, .6)})`;
      g.lineWidth = R(1, dark ? 4 : 2) * w / 256;
      for (const ox of [0, -w, w]) for (const oy of [0, -h, h]) {
        g.beginPath(); g.moveTo(x + ox, y + oy);
        g.bezierCurveTo(x + ox + R(-6, 6), y + oy + len * .33, x + ox + R(-6, 6), y + oy + len * .66, x + ox + R(-4, 4), y + oy + len);
        g.stroke();
      }
    }
  }, {wrap: true});
  const aspenBark = paint(Q.bark, Q.bark * 2, (g, w, h) => {
    g.fillStyle = '#e8e4d4'; g.fillRect(0, 0, w, h);
    const k = w / 256;
    for (let i = 0; i < 40; i++) {
      const x = R(0, w), y = R(0, h), rw = R(10, 40) * k, rh = R(40, 140) * k;
      g.fillStyle = pick(['rgba(200,204,186,.5)', 'rgba(236,234,222,.6)', 'rgba(180,186,168,.35)']);
      for (const ox of [0, -w, w]) for (const oy of [0, -h, h]) g.fillRect(x + ox, y + oy, rw, rh);
    }
    g.lineCap = 'round';
    for (let i = 0; i < 320; i++) {
      const x = R(0, w), y = R(0, h), len = R(3, 12) * k;
      g.strokeStyle = `rgba(90,86,74,${R(.35, .8)})`; g.lineWidth = R(1, 2) * k;
      for (const ox of [0, -w, w]) for (const oy of [0, -h, h]) { g.beginPath(); g.moveTo(x + ox, y + oy); g.lineTo(x + ox + len, y + oy + R(-.6, .6)); g.stroke(); }
    }
    // The dark "eyes" where branches once grew.
    for (let i = 0; i < 6; i++) {
      const x = R(0, w), y = R(0, h), ew = R(22, 46) * k, eh = R(6, 12) * k;
      g.fillStyle = '#2d2a25';
      for (const ox of [0, -w, w]) for (const oy of [0, -h, h]) {
        g.beginPath(); g.moveTo(x + ox - ew, y + oy); g.quadraticCurveTo(x + ox, y + oy - eh * 1.8, x + ox + ew, y + oy); g.quadraticCurveTo(x + ox, y + oy + eh * .9, x + ox - ew, y + oy); g.fill();
      }
    }
  }, {wrap: true});

  // Foliage sprites: each clump of a crown is a camera-facing card of these.
  const firSprite = paint(256, 256, g => {
    g.lineCap = 'round';
    const tones = ['#1b2c1a', '#243a23', '#2f4a2b', '#3b5a33', '#4b6c3c', '#5e8047', '#779a55'];
    // Flat sprays of needles along drooping twigs, stacked darkest first.
    tones.forEach((tone, layer) => {
      for (let b = 0; b < 5; b++) {
        const side = rnd() < .5 ? -1 : 1, len = R(70, 118) * (1 - layer * .035), droop = R(.15, .5);
        let x = 128 - side * R(0, 30), y = 128 + R(-44, 36), dir = side > 0 ? R(-.35, .2) : Math.PI + R(-.2, .35);
        const steps = Math.round(len / 3.5);
        for (let k = 0; k < steps; k++) {
          const t = k / steps;
          dir += side * droop / steps; x += Math.cos(dir) * 3.5; y += Math.sin(dir) * 3.5;
          g.strokeStyle = t > .7 && layer < tones.length - 1 ? tones[layer + 1] : tone;
          const needle = (13 - t * 6) * R(.75, 1.2);
          for (const turn of [-1, 1]) {
            g.lineWidth = R(1.1, 1.9);
            const a = dir + turn * R(.5, 1.05) + R(-.1, .1);
            g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * needle, y + Math.sin(a) * needle + needle * .25); g.stroke();
          }
          // Side twigs make the spray broad rather than a single frond.
          if (k % 7 === 3 && t < .7) {
            const twig = dir + (rnd() < .5 ? -1 : 1) * R(.5, .8), tl = R(14, 26);
            for (let q = 1; q < tl / 3; q++) {
              const qx = x + Math.cos(twig) * q * 3, qy = y + Math.sin(twig) * q * 3;
              for (const turn of [-1, 1]) { const a = twig + turn * .8; g.beginPath(); g.moveTo(qx, qy); g.lineTo(qx + Math.cos(a) * 8, qy + Math.sin(a) * 8 + 2); g.stroke(); }
            }
          }
        }
      }
    });
  });
  const pineSprite = paint(256, 256, g => {
    g.lineCap = 'round';
    const tufts = Array.from({length: 7}, () => [128 + R(-62, 62), 128 + R(-58, 52)]);
    g.strokeStyle = '#4e3b28'; g.lineWidth = 4;
    for (const [x, y] of tufts) { g.beginPath(); g.moveTo(128 + R(-20, 20), 200); g.quadraticCurveTo(128, y + 20, x, y); g.stroke(); }
    for (const tone of ['#2a4224', '#37552e', '#466836', '#587b40', '#6e8f4c', '#88a45d']) {
      g.strokeStyle = tone;
      for (const [x, y] of tufts) for (let k = 0; k < 14; k++) {
        const a = R(0, 6.283), len = R(26, 56);
        g.lineWidth = R(1.1, 1.9);
        g.beginPath(); g.moveTo(x, y);
        g.quadraticCurveTo(x + Math.cos(a) * len * .5, y + Math.sin(a) * len * .5 - 5, x + Math.cos(a) * len, y + Math.sin(a) * len + len * .14);
        g.stroke();
      }
    }
  });
  const leafSprite = paint(256, 256, g => {
    const leaves = Array.from({length: 110}, () => {
      const r = Math.sqrt(rnd()) * 102, a = R(0, 6.283);
      return {x: 128 + Math.cos(a) * r, y: 128 + Math.sin(a) * r * .92, size: R(8, 13), turn: R(0, 6.283), light: rnd()};
    }).sort((a, b) => a.light - b.light);
    for (const leaf of leaves) {
      g.save(); g.translate(leaf.x, leaf.y); g.rotate(leaf.turn);
      const tone = Math.round(W.mix(150, 255, leaf.light));
      g.fillStyle = `rgb(${tone}, ${Math.round(tone * .93)}, ${Math.round(tone * .6)})`;
      g.beginPath(); g.ellipse(0, 0, leaf.size, leaf.size * .8, 0, 0, 6.283); g.fill();
      g.strokeStyle = 'rgba(96,84,40,.55)'; g.lineWidth = 1; g.stroke();
      g.beginPath(); g.moveTo(leaf.size * .9, 0); g.lineTo(leaf.size * 1.6, 0); g.strokeStyle = '#7a6a3a'; g.stroke();
      g.restore();
    }
  });
  const frondSprite = paint(128, 512, g => {
    g.lineCap = 'round';
    g.strokeStyle = '#586934'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(64, 510); g.quadraticCurveTo(58, 260, 64, 6); g.stroke();
    for (let i = 0; i < 32; i++) {
      const t = i / 32, y = 500 - t * 488, side = i % 2 ? 1 : -1;
      const len = 58 * Math.pow(Math.sin(Math.PI * (.1 + t * .9)), .75) * (1 - t * .25);
      g.fillStyle = pick(['#4d6b33', '#5e7d3c', '#6f8f45', '#86a453']);
      for (let k = 0; k < len / 5; k++) {
        const u = k / (len / 5);
        g.beginPath(); g.ellipse(64 + side * (4 + u * len), y - u * len * .35, 4.4 * (1 - u * .45), 2.8, side * -.5, 0, 6.283); g.fill();
      }
    }
  });
  const moteSprite = paint(64, 64, g => {
    const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)'); gradient.addColorStop(.35, 'rgba(255,255,255,.45)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gradient; g.fillRect(0, 0, 64, 64);
  }, {srgb: false});
  const endGrain = paint(256, 256, g => {
    g.fillStyle = '#c9a877'; g.fillRect(0, 0, 256, 256);
    for (let r = 124; r > 4; r -= R(4, 9)) { g.strokeStyle = `rgba(110,74,40,${R(.25, .55)})`; g.lineWidth = R(1, 3); g.beginPath(); g.arc(128 + R(-3, 3), 128 + R(-3, 3), r, 0, 6.283); g.stroke(); }
    g.strokeStyle = '#4a3423'; g.lineWidth = 14; g.beginPath(); g.arc(128, 128, 124, 0, 6.283); g.stroke();
    strokes(g, 256, 8, ['rgba(60,40,24,.5)'], [30, 90], [1, 2]);
  });
  const planks = paint(512, 128, (g, w, h) => {
    g.fillStyle = '#7d705e'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = rnd() < .5 ? `rgba(48,40,32,${R(.15, .4)})` : `rgba(190,176,150,${R(.12, .3)})`;
      g.lineWidth = R(1, 3);
      const y0 = R(0, h), amp = R(1, 5), freq = R(.01, .03), phase = R(0, 6);
      g.beginPath();
      for (let x = 0; x <= w; x += 8) { const y = y0 + Math.sin(x * freq + phase) * amp; x ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    }
  }, {wrap: true});

  // ---- The ground: one mesh, coloured per pixel from a field of distances.
  const field = (() => {
    const F = W.FIELD, w = Math.round((F.x1 - F.x0) / F.cell), h = Math.round((F.z1 - F.z0) / F.cell);
    const data = new Uint8Array(w * h * 4);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = (j * w + i) * 4;
      if (!i || !j || i === w - 1 || j === h - 1) { data[k] = 255; continue; }
      const x = F.x0 + (i + .5) * F.cell, z = F.z0 + (j + .5) * F.cell, t = W.nearestTrail(x, z);
      const trail = t.d <= W.JUNCTION ? t.dist : Math.hypot(x - W.J.x, z - W.J.z);
      data[k] = Math.min(255, Math.min(trail, W.forkDistance(x, z)) / 8 * 255);
      data[k + 1] = W.meadow(x, z) * 255;
      data[k + 3] = (1 - W.smooth(2.4, 7.5, W.creekDistance(x, z))) * 255;
    }
    const texture = new THREE.DataTexture(data, w, h);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    // Shade the floor under every crown and boulder so nothing floats.
    function stamp(x, z, reach, strength) {
      const ci = (x - F.x0) / F.cell - .5, cj = (z - F.z0) / F.cell - .5, r = Math.ceil(reach / F.cell);
      for (let j = Math.max(1, Math.floor(cj - r)); j <= Math.min(h - 2, Math.ceil(cj + r)); j++) {
        for (let i = Math.max(1, Math.floor(ci - r)); i <= Math.min(w - 2, Math.ceil(ci + r)); i++) {
          const dist = Math.hypot(i - ci, j - cj) * F.cell, k = (j * w + i) * 4 + 2;
          const v = strength * Math.pow(1 - W.smooth(0, reach, dist), 1.4) * 255;
          if (v > data[k]) data[k] = v;
        }
      }
    }
    return {texture, stamp, rect: new THREE.Vector4(F.x0, F.z0, 1 / (F.x1 - F.x0), 1 / (F.z1 - F.z0))};
  })();

  const forest = W.plant();
  // Phones keep the trees that can be seen through the haze and drop the rest.
  if (LOW) forest.trees = forest.trees.filter(t => W.nearestTrail(t.x, t.z).dist < 62);
  for (const t of forest.trees) field.stamp(t.x, t.z, t.height < 5 ? 1.1 : {pine: 2.6, fir: 3.2, aspen: 1.9}[t.kind], t.height < 5 ? .35 : .7);
  for (const s of forest.shrubs) field.stamp(s.x, s.z, s.size * 1.4, .45);
  for (const r of forest.rocks) if (r.size > .8) field.stamp(r.x, r.z, r.size * 1.5, .5);
  for (const l of forest.logs) field.stamp(l.x, l.z, l.length * .45, .3);
  field.texture.needsUpdate = true;

  function terrain() {
    const B = W.BOUNDS, nx = Math.round((B.x1 - B.x0) / Q.grid), nz = Math.round((B.z1 - B.z0) / Q.grid);
    const geometry = new THREE.PlaneGeometry(B.x1 - B.x0, B.z1 - B.z0, nx, nz);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate((B.x0 + B.x1) / 2, 0, (B.z0 + B.z1) / 2);
    const p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, W.height(p.getX(i), p.getZ(i)));
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({roughness: 1, metalness: 0});
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, {uField: {value: field.texture}, uRect: {value: field.rect}, uDuff: {value: duff}, uDirt: {value: dirt},
        uMeadow: {value: meadowGround}, uNoise: {value: noiseTexture}, uWater: {value: W.WATER}});
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWorld;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorld = (modelMatrix * vec4(position, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform sampler2D uField, uDuff, uDirt, uMeadow, uNoise; uniform vec4 uRect; uniform float uWater; varying vec3 vWorld;`)
        .replace('#include <map_fragment>', `
          vec4 site = texture2D(uField, (vWorld.xz - uRect.xy) * uRect.zw);
          vec3 broad = texture2D(uNoise, vWorld.xz * .021).rgb, fine = texture2D(uNoise, vWorld.xz * .19).rgb;
          vec3 floorColor = mix(texture2D(uDuff, vWorld.xz * .41).rgb, texture2D(uDuff, vWorld.xz * .093 + .37).rgb, .4) * (.78 + broad.r * .44);
          vec3 grass = texture2D(uMeadow, vWorld.xz * .33).rgb * (.84 + broad.g * .3);
          vec3 color = mix(floorColor, grass, smoothstep(.3, .75, site.g + (broad.b - .5) * .5));
          float path = site.r * 8.0 + (fine.g - .5) * .6 + (broad.r - .5) * .25;
          vec3 tread = texture2D(uDirt, vWorld.xz * .44).rgb * (.9 + fine.r * .22);
          tread *= mix(1.1, .92, smoothstep(.1, .55, path));
          color = mix(color, tread, 1.0 - smoothstep(.42, .92, path));
          color *= mix(vec3(1.0), vec3(.6, .66, .54), site.a * .8);
          color = mix(color, vec3(.2, .21, .18) * (.75 + fine.b * .5), 1.0 - smoothstep(uWater + .05, uWater + .5, vWorld.y));
          color *= 1.0 - site.b * .5;
          diffuseColor.rgb *= color;`);
    };
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  terrain();

  // ---- Shapes are built one unit tall; instances scale them into trees.
  class Shape {
    constructor(sprite) { this.p = []; this.n = []; this.c = []; this.u = []; this.i = []; this.s = sprite ? [] : null; }
    vertex(x, y, z, n, shade, u, v, s) {
      this.p.push(x, y, z); this.n.push(...n); this.c.push(shade, shade, shade); this.u.push(u, v);
      if (this.s) this.s.push(...(s || [0, 0, 0, 0]));
      return this.p.length / 3 - 1;
    }
    sprite(x, y, z, size, n, shade, spin = Math.PI) {
      const turn = R(-spin, spin), flip = rnd() < .5, base = this.p.length / 3;
      for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) this.vertex(x, y, z, n, shade, (flip ? -cx : cx) * .5 + .5, cy * .5 + .5, [cx, cy, size, turn]);
      this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    // A tapered tube along any axis, used for trunks, limbs and snags.
    tube(a, b, r0, r1, sides, shade0, shade1, repeat, stops = [0, 1], flare = 0) {
      const axis = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), length = axis.length();
      axis.normalize();
      const e1 = new THREE.Vector3().crossVectors(axis, Math.abs(axis.y) > .9 ? new THREE.Vector3(1, 0, 0) : UP).normalize();
      const e2 = new THREE.Vector3().crossVectors(e1, axis), base = this.p.length / 3;
      for (const t of stops) {
        const radius = W.mix(r0, r1, t) * (1 + flare * (1 - W.smooth(0, .03, t)) ** 2), shade = W.mix(shade0, shade1, W.smooth(0, .35, t));
        for (let s = 0; s <= sides; s++) {
          const angle = s / sides * Math.PI * 2, c = Math.cos(angle) * radius, d = Math.sin(angle) * radius;
          this.vertex(a[0] + axis.x * length * t + e1.x * c + e2.x * d, a[1] + axis.y * length * t + e1.y * c + e2.y * d, a[2] + axis.z * length * t + e1.z * c + e2.z * d,
            [0, 0, 0], shade, s / sides, t * length * repeat);
        }
      }
      for (let r = 0; r < stops.length - 1; r++) for (let s = 0; s < sides; s++) {
        const i = base + r * (sides + 1) + s, j = i + sides + 1;
        this.i.push(i, j, i + 1, j, j + 1, i + 1);
      }
    }
    geometry(normals = false, radius = .8) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
      if (this.s) g.setAttribute('aSprite', new THREE.Float32BufferAttribute(this.s, 4));
      g.setIndex(this.i);
      if (normals) g.computeVertexNormals();
      // Cards and sway reach past the vertices; keep culling generous.
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, .5, 0), radius);
      return g;
    }
  }
  const out = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
  function trunk(shape, radius, top, sides, repeat, dark) {
    // Root flare, then an even taper, with a little lean so no two stand alike.
    const lean = [R(-.012, .012), R(-.012, .012)];
    shape.tube([0, -.02, 0], [lean[0], top, lean[1]], radius, radius * .2, sides, dark, 1, repeat / (2 * Math.PI * radius) / 2, [0, .008, .022, .05, .12, .25, .4, .55, .7, .85, 1], .55);
  }
  function firTree(young) {
    const wood = new Shape(false), crown = new Shape(true);
    trunk(wood, .014, .93, 7, 1, .6);
    const base = young ? .05 : .15, widthAt = y => .21 * Math.pow(Math.max(0, 1 - (y - base) / (1.03 - base)), .92);
    for (let y = base; y < .985; y += .034) {
      const reach = widthAt(y), count = Math.max(3, Math.round(reach * 56)), turn = R(0, 6.283);
      for (let k = 0; k < count; k++) {
        const a = turn + k / count * 6.283 + R(-.2, .2), r = reach * R(.45, .92);
        const shade = (.55 + .45 * r / Math.max(reach, .001)) * (.72 + .28 * y) * R(.86, 1.06);
        crown.sprite(Math.cos(a) * r, y - r * .2, Math.sin(a) * r, .032 + reach * .33, out(Math.cos(a), .5, Math.sin(a)), shade, .5);
      }
    }
    crown.sprite(0, 1, 0, .035, [0, 1, 0], 1);
    // A dark core cone so the crown reads as a solid tree, not a cloud of cards.
    const coreR = widthAt(base) * .55, sides = 7, apex = crown.vertex(0, .96, 0, [0, 1, 0], .42, .5, .5);
    const ring = [];
    for (let s = 0; s < sides; s++) { const a = s / sides * 6.283; ring.push(crown.vertex(Math.cos(a) * coreR, base, Math.sin(a) * coreR, out(Math.cos(a), .4, Math.sin(a)), .38, .5, .5)); }
    for (let s = 0; s < sides; s++) crown.i.push(ring[s], apex, ring[(s + 1) % sides]);
    return {wood: wood.geometry(true), crown: crown.geometry(false)};
  }
  function pineTree() {
    const wood = new Shape(false), crown = new Shape(true);
    trunk(wood, .0165, .96, 8, 1, .62);
    // Dead lower limbs are part of what makes a ponderosa look like one.
    for (let i = 0; i < 8; i++) {
      const y = R(.28, .54), a = R(0, 6.283), len = R(.02, .05);
      wood.tube([0, y, 0], [Math.cos(a) * len, y - len * .3, Math.sin(a) * len], .0022, .0006, 3, .8, .8, .5);
    }
    for (let i = 0; i < 11; i++) {
      const y = R(.56, .96), a = R(0, 6.283), reach = .16 * Math.pow(Math.sin(Math.PI * Math.min(1, (y - .5) / .52)), .6) * R(.6, 1.05);
      const cx = Math.cos(a) * reach, cz = Math.sin(a) * reach, cy = y + reach * .22;
      wood.tube([0, y - .02, 0], [cx * .85, cy - .01, cz * .85], .0045, .0015, 4, .9, .9, .6);
      const count = 5 + Math.floor(rnd() * 3);
      for (let k = 0; k < count; k++) {
        const x = cx + R(-.045, .045), yy = cy + R(-.02, .03), z = cz + R(-.045, .045);
        crown.sprite(x, yy, z, R(.042, .062), out(x, (yy - .75) * 1.2 + .35, z), R(.74, 1.04) * (.82 + .18 * (yy - .5) / .5));
      }
    }
    for (let k = 0; k < 4; k++) crown.sprite(R(-.03, .03), R(.97, 1.02), R(-.03, .03), .045, [0, 1, 0], 1);
    return {wood: wood.geometry(true), crown: crown.geometry(false)};
  }
  function aspenTree() {
    const wood = new Shape(false), crown = new Shape(true);
    trunk(wood, .011, .92, 7, 1, .45);
    for (let i = 0; i < 5; i++) {
      const y = R(.5, .8), a = R(0, 6.283), len = R(.04, .08);
      wood.tube([0, y, 0], [Math.cos(a) * len, y + len * .8, Math.sin(a) * len], .003, .001, 3, .9, .9, .5);
    }
    for (let i = 0; i < 62; i++) {
      const y = R(.42, 1), reach = .12 * Math.pow(Math.sin(Math.PI * Math.min(1, (y - .38) / .64)), .8), a = R(0, 6.283), r = reach * Math.sqrt(rnd());
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      crown.sprite(x, y, z, R(.034, .05), out(x, (y - .7) + .3, z), R(.7, 1.05) * (.8 + .2 * r / Math.max(reach, .001)));
    }
    return {wood: wood.geometry(true), crown: crown.geometry(false)};
  }
  function shrubShape() {
    const crown = new Shape(true);
    for (let i = 0; i < 14; i++) {
      const a = R(0, 6.283), r = R(0, .5), y = R(.2, .85) * (1 - r * .6);
      crown.sprite(Math.cos(a) * r, y, Math.sin(a) * r, R(.22, .3), out(Math.cos(a) * r, y - .2, Math.sin(a) * r), R(.65, 1));
    }
    return crown.geometry(false, 1.1);
  }
  function grassShape() {
    const shape = new Shape(false);
    for (let b = 0; b < 9; b++) {
      const a = R(0, 6.283), r = R(0, .11), bx = Math.cos(a) * r, bz = Math.sin(a) * r;
      const lean = R(.18, .55), dir = a + R(-.7, .7), dx = Math.cos(dir), dz = Math.sin(dir);
      const tall = R(.45, 1), width = R(.009, .016), base = shape.p.length / 3;
      for (let k = 0; k <= 3; k++) {
        const t = k / 3, y = t * tall, off = lean * t * t * tall, w = width * (1 - t * .9), cx = bx + dx * off, cz = bz + dz * off, shade = .36 + t * .64;
        shape.vertex(cx + dz * w, y, cz - dx * w, [0, 1, 0], shade, 0, t);
        shape.vertex(cx - dz * w, y, cz + dx * w, [0, 1, 0], shade, 1, t);
        if (k < 3) { const v = base + k * 2; shape.i.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
      }
    }
    return shape.geometry(false, .8);
  }
  function fernShape() {
    const shape = new Shape(false), fronds = 7;
    for (let k = 0; k < fronds; k++) {
      const a = k / fronds * 6.283 + R(-.25, .25), len = R(.75, 1), dx = Math.cos(a), dz = Math.sin(a), base = shape.p.length / 3;
      for (let s = 0; s <= 5; s++) {
        const t = s / 5, reach = len * t * .9, y = len * (1.15 * t - .85 * t * t), w = (.13 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05 + .05)), .6) + .02) * len;
        shape.vertex(dx * reach - dz * w, y, dz * reach + dx * w, [0, 1, 0], .7 + t * .3, 0, t);
        shape.vertex(dx * reach + dz * w, y, dz * reach - dx * w, [0, 1, 0], .7 + t * .3, 1, t);
        if (s < 5) { const v = base + s * 2; shape.i.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
      }
    }
    return shape.geometry(false, 1.1);
  }
  function rockShape(seed) {
    const geometry = new THREE.IcosahedronGeometry(1, 2), p = geometry.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize();
      const k = .7 + .55 * W.fbm(v.x * 1.6 + seed * 3, v.y * 1.6 + v.z * 1.3 - seed, 3, seed);
      v.multiplyScalar(k); v.y *= .62;
      if (v.y < -.12) v.y = -.12 + (v.y + .12) * .3;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    geometry.computeVertexNormals();
    const n = geometry.attributes.normal, colors = [];
    for (let i = 0; i < p.count; i++) {
      const grain = .82 + .3 * W.fbm(p.getX(i) * 4 + seed, p.getZ(i) * 4 + p.getY(i) * 3, 2, 40 + seed);
      const moss = W.smooth(.55, .85, n.getY(i)) * W.smooth(.4, .6, W.fbm(p.getX(i) * 3, p.getZ(i) * 3, 2, 50 + seed));
      colors.push(W.mix(.2 * grain, .085, moss), W.mix(.19 * grain, .11, moss), W.mix(.17 * grain, .045, moss));
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.3);
    return geometry;
  }

  // ---- Planting: instanced in patches so the camera only draws what it faces.
  const matrix = new THREE.Matrix4(), quat = new THREE.Quaternion(), euler = new THREE.Euler(), vec = new THREE.Vector3(), scale = new THREE.Vector3(), tint = new THREE.Color();
  function place(item, sx, sy, sz, tiltX = 0, tiltZ = 0, lift = 0) {
    euler.set(tiltX, item.turn || 0, tiltZ, 'YXZ');
    return matrix.compose(vec.set(item.x, item.y + lift, item.z), quat.setFromEuler(euler), scale.set(sx, sy, sz));
  }
  function patches(items, geometry, material, transform, {cell = 48, cast = true, receive = true, depth = null, color = null} = {}) {
    const groups = new Map();
    for (const item of items) {
      const key = Math.floor(item.x / cell) + ',' + Math.floor(item.z / cell);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    for (const list of groups.values()) {
      const mesh = new THREE.InstancedMesh(geometry, material, list.length);
      list.forEach((item, i) => {
        mesh.setMatrixAt(i, transform(item));
        if (color) mesh.setColorAt(i, color(item, tint));
      });
      mesh.castShadow = cast; mesh.receiveShadow = receive;
      if (depth) mesh.customDepthMaterial = depth;
      mesh.computeBoundingSphere();
      scene.add(mesh);
    }
  }
  const barkMaterial = (map, bend) => sway(new THREE.MeshStandardMaterial({map, vertexColors: true, roughness: .95}), {bend});
  const leafMaterial = (map, bend, glow, flutter = .035) => sway(new THREE.MeshStandardMaterial({map, vertexColors: true, alphaTest: .5, roughness: .8, alphaToCoverage: Q.aa}), {bend, flutter, sprite: true, glow});
  const leafDepth = (map, bend, flutter = .035) => sway(new THREE.MeshDepthMaterial({depthPacking: THREE.RGBADepthPacking, map, alphaTest: .5}), {bend, flutter, sprite: true});
  const hex = list => list.map(c => new THREE.Color(c));
  const SPECIES = {
    pine: {shape: pineTree(), bark: pineBark, leaves: pineSprite, bend: .011, glow: .28, tints: hex(['#ffffff', '#f2f5e6', '#e7ecd9', '#fbf5e4', '#dfe6cf'])},
    fir: {shape: firTree(false), bark: firBark, leaves: firSprite, bend: .012, glow: .22, tints: hex(['#ffffff', '#e8efe1', '#dce6d6', '#f1f2e4'])},
    young: {shape: firTree(true), bark: firBark, leaves: firSprite, bend: .02, glow: .22, tints: hex(['#ffffff', '#e6f0de', '#f4f4e2'])},
    // Late September: most aspens have turned, a few are still holding green.
    aspen: {shape: aspenTree(), bark: aspenBark, leaves: leafSprite, bend: .014, glow: .7,
      tints: hex(['#ffc84f', '#ffd35e', '#f7b53f', '#fae17a', '#e8d86a', '#c9d46c', '#a8c15f', '#f59a3d'])},
  };
  for (const [name, kind] of Object.entries(SPECIES)) {
    const trees = forest.trees.filter(t => (t.height < 5 ? 'young' : t.kind) === name);
    const transform = t => place(t, t.height * (name === 'young' ? 1.35 : t.girth), t.height, t.height * (name === 'young' ? 1.35 : t.girth));
    patches(trees, kind.shape.wood, barkMaterial(kind.bark, kind.bend), transform, {});
    patches(trees, kind.shape.crown, leafMaterial(kind.leaves, kind.bend, kind.glow), transform,
      {depth: leafDepth(kind.leaves, kind.bend), color: (t, c) => c.copy(kind.tints[Math.floor(t.tint * kind.tints.length)])});
  }
  const shrubTints = hex(['#6c8a3c', '#7a8d42', '#8e8a3e', '#a17a3a', '#5f7d36']);
  patches(forest.shrubs, shrubShape(), leafMaterial(leafSprite, .03, .45, .05), s => place(s, s.size * 1.5, s.size, s.size * 1.5),
    {depth: leafDepth(leafSprite, .03, .05), color: (s, c) => c.copy(shrubTints[Math.floor(s.tint * shrubTints.length)])});

  const grass = W.grass(Q.grass);
  const grassTints = hex(['#d6c07e', '#c8ad69', '#b9ab66', '#a6a35d', '#dccb8e']), wetGrass = new THREE.Color('#93a857');
  patches(grass, grassShape(), sway(new THREE.MeshStandardMaterial({vertexColors: true, side: THREE.DoubleSide, roughness: .9}), {bend: .17, flutter: .05, glow: .4, upright: true}),
    g => place(g, g.size * 1.2, g.size * (.7 + g.tint * .45), g.size * 1.2), {cell: 32, cast: false,
      color: (g, c) => c.copy(grassTints[Math.floor(g.tint * grassTints.length)]).lerp(wetGrass, 1 - W.smooth(3, 13, W.creekDistance(g.x, g.z)))});
  const fernTints = hex(['#ffffff', '#f0f6e4', '#e9e2b6', '#d9b879', '#c99a5c']);
  patches(forest.ferns, fernShape(), sway(new THREE.MeshStandardMaterial({map: frondSprite, alphaTest: .5, vertexColors: true, side: THREE.DoubleSide, roughness: .85}), {bend: .06, flutter: .04, glow: .35, upright: true}),
    fern => place(fern, fern.size, fern.size * .9, fern.size), {cell: 32, cast: false, color: (fern, c) => c.copy(fernTints[Math.floor(fern.tint * fernTints.length)])});

  // Rocks: scattered stones, a few boulders, cobbles in the creek, a cairn at the sign.
  const rocks = forest.rocks.slice();
  const creek = W.creekLine;
  for (let i = 0; i < creek.xs.length; i += 1) {
    const x = creek.xs[i], z = creek.zs[i];
    if (Math.hypot(x - W.crossing.x, z - W.crossing.z) > 55) continue;
    for (let k = 0; k < 2; k++) {
      const sx = x + R(-2.2, 2.2), sz = z + R(-2.2, 2.2);
      rocks.push({x: sx, z: sz, y: W.height(sx, sz), size: R(.12, .38), turn: R(0, 6.28), tilt: rnd(), shape: Math.floor(rnd() * 3)});
    }
  }
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * 6.283 + R(-.3, .3), r = R(.22, .4), x = W.SIGN.x + Math.cos(a) * r, z = W.SIGN.z + Math.sin(a) * r;
    rocks.push({x, z, y: W.JY, size: R(.13, .22), turn: R(0, 6.28), tilt: rnd(), shape: i % 3});
  }
  const rockMaterial = new THREE.MeshStandardMaterial({vertexColors: true, roughness: .92, flatShading: true});
  [0, 1, 2].forEach(shape => {
    patches(rocks.filter(r => r.shape === shape), rockShape(shape * 7 + 3), rockMaterial,
      r => place(r, r.size * (1 + r.tilt * .35), r.size * (.75 + r.tilt * .3), r.size * (1.25 - r.tilt * .3), (r.tilt - .5) * .25, (r.tilt - .5) * .2, -r.size * .22), {cell: 40});
  });

  // Logs, stumps and the footbridge share a unit cylinder, scaled per piece.
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 10, 1);
  const logBark = pineBark.clone(); logBark.repeat.set(1, 2.4);
  const woodMaterials = [new THREE.MeshStandardMaterial({map: logBark, color: '#9a8c7a', roughness: .95}), new THREE.MeshStandardMaterial({map: endGrain, roughness: .9}), new THREE.MeshStandardMaterial({map: endGrain, roughness: .9})];
  function beam(a, b, radius, list) {
    const dir = new THREE.Vector3().subVectors(b, a), length = dir.length();
    list.push(new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(.5), new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()), new THREE.Vector3(radius, length, radius)));
  }
  function instanced(geometry, material, matrices, cast = true) {
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.castShadow = cast; mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    scene.add(mesh);
    return mesh;
  }
  const logs = [];
  for (const log of forest.logs) {
    const half = new THREE.Vector3(log.ax * log.length / 2, 0, log.az * log.length / 2), center = new THREE.Vector3(log.x, log.y, log.z);
    beam(center.clone().sub(half), center.clone().add(half), log.radius, logs);
  }
  for (const s of forest.stumps) logs.push(new THREE.Matrix4().compose(new THREE.Vector3(s.x, s.y + s.height / 2, s.z), quat.setFromAxisAngle(UP, s.turn).clone(), new THREE.Vector3(s.radius, s.height, s.radius)));
  instanced(cylinder, woodMaterials, logs);

  // The footbridge follows the trail's own curve, plank by plank.
  (() => {
    const deck = [], beams = [], posts = [], rails = [], plankBox = new THREE.BoxGeometry(1.36, .055, .2), postBox = new THREE.BoxGeometry(.1, 1.3, .1);
    const plankMaterial = new THREE.MeshStandardMaterial({map: planks, roughness: .9}), railMaterial = new THREE.MeshStandardMaterial({map: planks, color: '#9b8f7f', roughness: .9});
    const at = (d, lateral, y) => { const t = W.trail(d); return new THREE.Vector3(t.x - t.tz * lateral, y, t.z + t.tx * lateral); };
    for (let d = W.CREEK - W.BRIDGE; d <= W.CREEK + W.BRIDGE + 1e-6; d += .226) {
      const t = W.trail(d);
      euler.set(R(-.01, .01), Math.atan2(-t.tx, -t.tz) + R(-.025, .025), R(-.014, .014), 'YXZ');
      deck.push(new THREE.Matrix4().compose(new THREE.Vector3(t.x, W.DECK - .03 + R(-.006, .006), t.z), new THREE.Quaternion().setFromEuler(euler), new THREE.Vector3(R(.96, 1.04), 1, 1)));
    }
    for (const side of [-1, 1]) {
      for (let d = W.CREEK - W.BRIDGE - .5; d < W.CREEK + W.BRIDGE + .4; d += 1.1) beam(at(d, side * .48, W.DECK - .17), at(Math.min(d + 1.1, W.CREEK + W.BRIDGE + .5), side * .48, W.DECK - .17), .12, beams);
      let previous = null;
      for (let d = W.CREEK - W.BRIDGE + .15; d <= W.CREEK + W.BRIDGE; d += W.BRIDGE * 2 / 6) {
        const foot = at(d, side * .74, 0), t = W.trail(d);
        posts.push(new THREE.Matrix4().compose(new THREE.Vector3(foot.x, W.DECK + .3, foot.z), quat.setFromAxisAngle(UP, Math.atan2(-t.tx, -t.tz)).clone(), new THREE.Vector3(1, 1, 1)));
        const top = new THREE.Vector3(foot.x, W.DECK + .9, foot.z);
        if (previous) beam(previous, top, .045, rails);
        previous = top;
      }
    }
    instanced(plankBox, plankMaterial, deck);
    instanced(cylinder, woodMaterials[0], beams);
    instanced(postBox, railMaterial, posts);
    instanced(cylinder, railMaterial, rails);
  })();

  // ---- The creek: a ribbon of water that reflects the sky and flows downhill.
  const flowTime = {value: 0};
  (() => {
    const pos = [], uv = [], idx = [];
    let travelled = 0;
    for (let i = 0; i < creek.xs.length; i++) {
      const x = creek.xs[i], z = creek.zs[i];
      const a = Math.max(0, i - 1), b = Math.min(creek.xs.length - 1, i + 1);
      let tx = creek.xs[b] - creek.xs[a], tz = creek.zs[b] - creek.zs[a];
      const len = Math.hypot(tx, tz); tx /= len; tz /= len;
      if (i) travelled += Math.hypot(x - creek.xs[i - 1], z - creek.zs[i - 1]);
      pos.push(x - tz * 3, W.WATER, z + tx * 3, x + tz * 3, W.WATER, z - tx * 3);
      uv.push(travelled / 5, 0, travelled / 5, 1);
      if (i) { const v = (i - 1) * 2; idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3); }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(idx);
    const material = new THREE.ShaderMaterial({
      fog: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: {...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uNoise: {value: noiseTexture}, uTime: flowTime, uSunDir: {value: SUN}, uSunColor: {value: SUN_COLOR},
        uSky: {value: new THREE.Color('#9eb0aa')}, uDeep: {value: new THREE.Color('#273226')}, uShallow: {value: new THREE.Color('#5d6549')}},
      vertexShader: `varying vec2 vUv; varying vec3 vWorld;
        #include <fog_pars_vertex>
        void main() { vUv = uv; vec4 world = modelMatrix * vec4(position, 1.0); vWorld = world.xyz; vec4 mvPosition = viewMatrix * world; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
        }`,
      fragmentShader: `uniform sampler2D uNoise; uniform float uTime; uniform vec3 uSunDir, uSunColor, uSky, uDeep, uShallow; varying vec2 vUv; varying vec3 vWorld;
        #include <fog_pars_fragment>
        void main() {
          vec2 flow = vec2(vUv.x - uTime * .32, vUv.y * .7);
          float a = texture2D(uNoise, flow * vec2(.6, .5)).g, b = texture2D(uNoise, flow * vec2(1.7, 1.1) + vec2(uTime * .05, .31)).b;
          vec3 normal = normalize(vec3((a - .5) * .9, 1.0, (b - .5) * .9));
          vec3 view = normalize(cameraPosition - vWorld);
          float fresnel = pow(1.0 - max(dot(normal, view), 0.0), 3.0);
          float middle = 1.0 - abs(vUv.y - .5) * 2.0;
          vec3 color = mix(uShallow, uDeep, smoothstep(.1, .8, middle));
          color = mix(color, uSky, .12 + .5 * fresnel);
          color += uSunColor * pow(max(dot(reflect(-view, normal), uSunDir), 0.0), 70.0) * 1.6;
          color += smoothstep(.72, .82, b) * smoothstep(.2, .9, middle) * .06;
          gl_FragColor = vec4(color, .82 + fresnel * .15);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    scene.add(new THREE.Mesh(geometry, material));
  })();

  // ---- The signpost at the junction: four boards, each a real link.
  const SIGNS = [
    {title: 'Projects', sub: 'Things I’ve built', left: true, y: 2.33, icon: 'm-24 16 20-37 15 24 9-15 19 29H-24M-11-8l7-13 7 13'},
    {title: 'Field Notes', sub: 'Thoughts along the way', left: false, y: 1.97, icon: 'M-20-24h35l6 5v42h-41ZM-11-24v47M-5-11h17M-5-2h17M-5 7h12'},
    {title: 'Photography', sub: 'The scenic route', left: true, y: 1.61, icon: 'M-25-13h13l5-9H9l5 9h13v35h-52ZM13 4a13 13 0 1 1-26 0 13 13 0 1 1 26 0M17-5h4'},
    {title: 'Let’s Connect', sub: 'Good work starts with a conversation', left: false, y: 1.25, icon: 'M-25-16h50v36h-50Zm0 0L0 4l25-20M-25 20-8 3M25 20 8 3'},
  ];
  const BOARD = {L: .89, H: .15, tip: .17, depth: .04, bevel: .006};
  const boardOutline = (L, H, tip, left) => left ? [[-L, 0], [-L + tip, H], [L, H], [L, -H], [-L + tip, -H]] : [[-L, H], [L - tip, H], [L, 0], [L - tip, -H], [-L, -H]];
  function boardTexture(sign) {
    const w = 1536, h = 264, {L, H, tip, bevel} = BOARD, EL = L + bevel, EH = H + bevel;
    const X = x => (x + EL) / (2 * EL) * w, Y = y => (1 - (y + EH) / (2 * EH)) * h;
    return paint(w, h, g => {
      const wood = g.createLinearGradient(0, 0, 0, h);
      wood.addColorStop(0, '#6f5f3d'); wood.addColorStop(1, '#4a4a31');
      g.fillStyle = wood; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 48; i++) {
        g.strokeStyle = rnd() < .6 ? `rgba(222,199,154,${R(.05, .13)})` : `rgba(28,24,14,${R(.08, .2)})`;
        g.lineWidth = R(1, 3.5);
        const y0 = R(0, h), amp = R(2, 9), freq = R(.003, .011), phase = R(0, 6);
        g.beginPath();
        for (let x = 0; x <= w; x += 12) { const y = y0 + Math.sin(x * freq + phase) * amp; x ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke();
      }
      const inset = boardOutline(L - .026, H - .026, tip - .006, sign.left);
      g.strokeStyle = 'rgba(214,192,136,.8)'; g.lineWidth = 3.5; g.lineJoin = 'round';
      g.beginPath(); inset.forEach(([x, y], i) => i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))); g.closePath(); g.stroke();
      const ax = X(-L + .27), dir = sign.left ? -1 : 1;
      g.strokeStyle = '#e8d3a2'; g.lineWidth = 7; g.lineCap = 'round';
      g.beginPath(); g.moveTo(ax - 42 * dir, h / 2); g.lineTo(ax + 42 * dir, h / 2); g.moveTo(ax + 42 * dir, h / 2); g.lineTo(ax + 24 * dir, h / 2 - 18); g.moveTo(ax + 42 * dir, h / 2); g.lineTo(ax + 24 * dir, h / 2 + 18); g.stroke();
      const tx = X(-L + .42);
      g.font = '400 116px "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';
      g.fillStyle = 'rgba(18,14,6,.55)'; g.fillText(sign.title, tx + 3, 146);
      g.fillStyle = '#fbebc6'; g.fillText(sign.title, tx, 142);
      g.font = '500 44px "Avenir Next", Avenir, "Segoe UI", Helvetica, Arial, sans-serif';
      g.fillStyle = '#e3d6b4'; g.fillText(sign.sub, tx + 4, 212);
      g.save(); g.translate(X(L - (sign.left ? .16 : .3)), h / 2); g.scale(2.5, 2.5);
      g.strokeStyle = '#e4cfa0'; g.lineWidth = 2.2; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(new Path2D(sign.icon));
      g.restore();
      g.fillStyle = '#b6a16e';
      for (const [x, y] of [[X(-L + (sign.left ? .22 : .07)), 40], [X(L - (sign.left ? .07 : .22)), h - 40]]) { g.beginPath(); g.arc(x, y, 7, 0, 6.283); g.fill(); }
    }, {aniso: 16});
  }
  const boards = [];
  (() => {
    const {L, H, tip, depth, bevel} = BOARD;
    const postMaterial = new THREE.MeshStandardMaterial({map: planks, color: '#8f7a5a', roughness: .9});
    const post = new THREE.Mesh(new THREE.BoxGeometry(.15, 2.85, .15), postMaterial);
    post.position.set(W.SIGN.x, W.JY + 1.3, W.SIGN.z);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(.125, .12, 4), postMaterial);
    cap.position.set(W.SIGN.x, W.JY + 2.78, W.SIGN.z); cap.rotation.y = Math.PI / 4;
    for (const mesh of [post, cap]) { mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh); }
    const edge = new THREE.MeshStandardMaterial({color: '#5d4f33', roughness: .85});
    SIGNS.forEach(sign => {
      const shape = new THREE.Shape(boardOutline(L, H, tip, sign.left).map(([x, y]) => new THREE.Vector2(x, y)));
      const geometry = new THREE.ExtrudeGeometry(shape, {depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1});
      // Map the painted face across the board's full outline.
      const p = geometry.attributes.position, uv = geometry.attributes.uv;
      for (let i = 0; i < geometry.groups[0].count; i++) uv.setXY(i, (p.getX(i) + L + bevel) / (2 * (L + bevel)), (p.getY(i) + H + bevel) / (2 * (H + bevel)));
      const face = new THREE.MeshStandardMaterial({map: boardTexture(sign), roughness: .78, emissive: new THREE.Color('#ffc978'), emissiveIntensity: 0});
      const board = new THREE.Mesh(geometry, [face, edge]);
      board.position.set(W.SIGN.x, W.JY + sign.y, W.SIGN.z + .08);
      board.rotation.set(0, R(-.05, .05), R(-.016, .016));
      board.castShadow = board.receiveShadow = true;
      board.userData = {face, glow: 0, goal: 0, rest: board.position.z, outline: [[-L - bevel, -H - bevel], [L + bevel, -H - bevel], [L + bevel, H + bevel], [-L - bevel, H + bevel]], front: depth + bevel};
      scene.add(board);
      boards.push(board);
    });
  })();

  // ---- Far away: three ranges of peaks in the haze beyond the ridge.
  (() => {
    const bump = (a, at, width, height) => height * Math.exp(-(((a - at) / width) ** 2));
    const ranges = [
      {radius: 1500, color: '#8e9fa7', haze: .42, top: a => 70 + bump(a, .42, .19, 340) + bump(a, .68, .08, 150) + bump(a, -.62, .26, 120) + (W.fbm(a * 9 + 3, 1.7, 5, 61) - .5) * 110},
      {radius: 960, color: '#6a7f7c', haze: .32, top: a => 30 + 95 * W.fbm(a * 4 + 11, 3.1, 4, 62) + bump(a, -.3, .3, 70) + bump(a, .95, .25, 60)},
      {radius: 580, color: '#4b6154', haze: .2, top: a => 8 + 52 * W.fbm(a * 6 - 4, 5.3, 4, 63)},
    ];
    for (const range of ranges) {
      const pos = [], col = [], idx = [], steps = 260, base = new THREE.Color(range.color), top = new THREE.Color(), low = new THREE.Color();
      for (let i = 0; i <= steps; i++) {
        const a = -1.75 + 3.5 * i / steps, y = -40 + range.top(a), slope = (range.top(a + .004) - range.top(a - .004)) / .008;
        const x = W.J.x + Math.sin(a) * range.radius, z = W.J.z - Math.cos(a) * range.radius;
        // Faces turned toward the low sun on the left catch a little light.
        top.copy(base).multiplyScalar(1 + W.clamp(slope / range.radius * 3.5, -.16, .2)).lerp(HAZE, range.haze);
        low.copy(base).lerp(HAZE, Math.min(1, range.haze + .42));
        pos.push(x, y, z, x, -140, z);
        col.push(top.r, top.g, top.b, low.r, low.g, low.b);
        if (i) { const v = (i - 1) * 2; idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geometry.setIndex(idx);
      scene.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({vertexColors: true, fog: false, side: THREE.DoubleSide})));
    }
  })();

  // ---- Sky: a warm haze at the horizon, high cloud, the sun low on the left.
  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(4600, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {uSun: {value: SUN}, uZenith: {value: new THREE.Color('#7aa2c4')}, uHorizon: {value: HAZE}, uGlow: {value: new THREE.Color('#ffcf8f')}, uNoise: {value: noiseTexture}, uTime: shared.uTime},
    vertexShader: 'varying vec3 vDir; void main() { vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
    fragmentShader: `uniform vec3 uSun, uZenith, uHorizon, uGlow; uniform sampler2D uNoise; uniform float uTime; varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0), s = max(dot(d, uSun), 0.0), above = smoothstep(-.01, .14, d.y);
        vec3 color = mix(uHorizon, uZenith, pow(smoothstep(0.0, .8, h), .7));
        color += uGlow * (pow(s, 7.0) * .38 + pow(s, 60.0) * .7) * above;
        vec2 cloudUv = d.xz / (d.y + .2) * .11 + vec2(uTime * .0012, 0.0);
        float cloud = texture2D(uNoise, cloudUv).r * .62 + texture2D(uNoise, cloudUv * 2.9).g * .38;
        cloud = smoothstep(.56, .8, cloud) * smoothstep(.04, .32, d.y);
        color = mix(color, mix(vec3(1.0, .97, .91), uGlow * 1.3, pow(s, 3.0) * .7), cloud * .5);
        color = mix(color, vec3(1.0, .93, .78) * 7.0, smoothstep(.99955, .99975, s) * above);
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  skyDome.renderOrder = -10;
  skyDome.frustumCulled = false;
  scene.add(skyDome);

  // ---- Shafts of low sun slanting through the trunks.
  (() => {
    const pos = [], shape = [], idx = [];
    for (let i = 0; i < Q.rays; i++) {
      const d = R(12, W.JUNCTION - 26), t = W.trail(d), lateral = R(-11, 11);
      const x = t.x - t.tz * lateral, z = t.z + t.tx * lateral, y = W.height(x, z) - .5, width = R(.5, 1.8), length = R(24, 40);
      for (const [side, along] of [[-1, 0], [1, 0], [1, 1], [-1, 1]]) { pos.push(x, y, z); shape.push(side, along, width, length); }
      const v = i * 4; idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geometry.setAttribute('aRay', new THREE.Float32BufferAttribute(shape, 4));
    geometry.setIndex(idx);
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: {uSunDir: {value: SUN}, uColor: {value: new THREE.Color('#ffdcaa')}, uStrength: {value: .11}},
      vertexShader: `attribute vec4 aRay; uniform vec3 uSunDir; varying float vSide, vAlong, vFade;
        void main() {
          vec3 p = position + uSunDir * aRay.y * aRay.w;
          vec3 toEye = cameraPosition - p;
          vec3 side = normalize(cross(uSunDir, toEye));
          p += side * aRay.x * aRay.z * (1.0 + aRay.y * .7);
          float dist = length(cameraPosition - p);
          float facing = pow(max(dot(normalize(p - cameraPosition), uSunDir), 0.0), 2.0);
          vFade = smoothstep(4.0, 12.0, dist) * (1.0 - smoothstep(40.0, 85.0, dist)) * (.35 + facing * 1.3);
          vSide = aRay.x; vAlong = aRay.y;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `uniform vec3 uColor; uniform float uStrength; varying float vSide, vAlong, vFade;
        void main() {
          float across = 1.0 - abs(vSide);
          float light = across * across * smoothstep(0.0, .22, vAlong) * (1.0 - smoothstep(.5, 1.0, vAlong)) * vFade;
          gl_FragColor = vec4(uColor * light * uStrength, 1.0);
        }`,
    });
    const shafts = new THREE.Mesh(geometry, material);
    shafts.frustumCulled = false;
    shafts.renderOrder = 5;
    scene.add(shafts);
  })();

  // ---- Dust and pollen drifting in the light, always around the walker.
  const moteUniforms = {uCenter: {value: new THREE.Vector3()}, uTime: {value: 0}, uSunDir: {value: SUN}, uMap: {value: moteSprite}, uScale: {value: 400}};
  const motes = new THREE.Points((() => {
    const g = new THREE.BufferGeometry(), p = new Float32Array(Q.motes * 3);
    for (let i = 0; i < p.length; i++) p[i] = rnd();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    return g;
  })(), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: moteUniforms,
    vertexShader: `uniform vec3 uCenter, uSunDir; uniform float uTime, uScale; varying float vAlpha;
      void main() {
        vec3 box = vec3(28.0, 7.0, 28.0);
        vec3 p = position * box + vec3(sin(uTime * .13 + position.y * 40.0) * .8, uTime * .06 + sin(uTime * .21 + position.x * 30.0) * .4, cos(uTime * .11 + position.z * 30.0) * .8);
        p = uCenter + mod(p - uCenter + box * .5, box) - box * .5;
        p.y = uCenter.y - 1.2 + mod(p.y - uCenter.y + 1.2, box.y);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        vec3 offset = p - uCenter;
        float edge = 1.0 - smoothstep(.34, .5, max(abs(offset.x), abs(offset.z)) / box.x);
        float lit = pow(max(dot(normalize(p - cameraPosition), uSunDir), 0.0), 3.0);
        vAlpha = edge * smoothstep(.8, 2.5, -mv.z) * (.06 + lit * .8) * (.5 + .5 * sin(uTime * .8 + position.z * 60.0));
        gl_PointSize = min(14.0, uScale * .045 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform sampler2D uMap; varying float vAlpha;
      void main() { gl_FragColor = vec4(vec3(1.0, .9, .72) * texture2D(uMap, gl_PointCoord).r * vAlpha, 1.0); }`,
  }));
  motes.frustumCulled = false;
  motes.renderOrder = 6;
  scene.add(motes);

  // ---- Aspen leaves let go in the gusts, wherever there are aspens to drop them.
  const aspenNear = (() => {
    const cell = 10, grid = new Map(), key = (i, j) => i + ',' + j;
    for (const t of forest.trees) if (t.kind === 'aspen') { const k = key(Math.floor(t.x / cell), Math.floor(t.z / cell)); grid.set(k, (grid.get(k) || 0) + 1); }
    return (x, z) => {
      let n = 0;
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) n += grid.get(key(Math.floor(x / cell) + i, Math.floor(z / cell) + j)) || 0;
      return W.smooth(0, 7, n);
    };
  })();
  const leafUniforms = {uCenter: {value: new THREE.Vector3()}, uTime: {value: 0}, uAmount: {value: 0}, uWind: shared.uWindDir, uSunDir: {value: SUN}};
  const leaves = (() => {
    const count = LOW ? 40 : 80, seed = [], corner = [], idx = [];
    for (let i = 0; i < count; i++) {
      const s = [rnd(), rnd(), rnd(), rnd()];
      for (const c of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { seed.push(...s); corner.push(...c); }
      idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Array(count * 12).fill(0), 3));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 4));
    g.setAttribute('aCorner', new THREE.Float32BufferAttribute(corner, 2));
    g.setIndex(idx);
    const mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      side: THREE.DoubleSide, uniforms: leafUniforms,
      vertexShader: `attribute vec4 aSeed; attribute vec2 aCorner; uniform vec3 uCenter, uSunDir; uniform float uTime, uAmount; uniform vec2 uWind;
        varying vec2 vCorner; varying float vShade, vKeep;
        void main() {
          vec3 box = vec3(16.0, 8.0, 16.0);
          float t = uTime + aSeed.w * 40.0;
          vec3 p = aSeed.xyz * box;
          p.y -= t * (.5 + aSeed.w * .3);
          p.xz += uWind * t * .55 + vec2(sin(t * 1.3 + aSeed.w * 9.0), cos(t * 1.1 + aSeed.w * 7.0)) * .4;
          p.xz = uCenter.xz + mod(p.xz - uCenter.xz + box.xz * .5, box.xz) - box.xz * .5;
          p.y = uCenter.y - 1.7 + mod(p.y, box.y);
          // Each leaf tumbles about its own wandering axis as it falls.
          float a = t * (2.0 + aSeed.w * 3.0), b = t * 1.7 + aSeed.w * 5.0;
          vec3 u = normalize(vec3(cos(a), sin(a) * .6, sin(a))), v = normalize(cross(u, vec3(sin(b), cos(b), .3)));
          vec3 world = p + (u * aCorner.x * .036 + v * aCorner.y * .028);
          vShade = .45 + .55 * abs(dot(cross(u, v), uSunDir));
          vCorner = aCorner;
          vec2 offset = abs(p.xz - uCenter.xz) / (box.xz * .5);
          vKeep = step(aSeed.w, uAmount) * (1.0 - smoothstep(.75, 1.0, max(offset.x, offset.y)));
          gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
        }`,
      fragmentShader: `varying vec2 vCorner; varying float vShade, vKeep;
        void main() {
          if (vKeep < .5 || dot(vCorner, vCorner) > 1.0) discard;
          gl_FragColor = vec4(vec3(1.0, .72, .22) * vShade * 1.1, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  })();

  // ===================================================================
  // The walk. Scroll is the only thing that moves the walker forward.
  let width = 1, height = 1, aspect = 1, framing = W.arrival(1), start = 0, distance = 1;
  let walking = false, still = false, d = 0, speed = 0, footfall = 0, first = true, windOn = true, windClock = 0, arrived = null, stop = '';
  let dragYaw = 0, dragPitch = 0, lookYaw = 0, lookPitch = 0, hoverX = 0, hoverY = 0, turning = 0, dragging = null, looked = false, clock = 0, heading = null, lean = 0;
  const progress = () => still ? 1 : W.clamp((scrollY - start) / distance);
  const ease = x => { const t = W.clamp(x); return t * t * (3 - 2 * t); };

  function show(el, opacity) {
    const value = opacity.toFixed(3);
    if (el.style.opacity === value) return;
    el.style.opacity = value;
    const hidden = opacity < .02;
    el.style.visibility = hidden ? 'hidden' : 'visible';
    el.inert = hidden;
  }
  function setArrived(value) {
    if (value === arrived) return;
    arrived = value;
    root.classList.toggle('at-junction', value);
    links.forEach(link => link.setAttribute('tabindex', value ? '0' : '-1'));
  }
  function stopFor(at) {
    if (at < 9) return ['00', 'THE TRAILHEAD'];
    if (at < W.CREEK - 13) return ['01', 'INTO THE WOODS'];
    if (at < W.CREEK + 9) return ['02', 'CROSSING THE CREEK'];
    if (at < framing.d - 2.5) return ['03', 'UP TO THE RIDGE'];
    return ['04', 'CHOOSE YOUR TRAIL'];
  }

  const shadowRight = new THREE.Vector3().crossVectors(UP, SUN).normalize(), shadowUp = new THREE.Vector3().crossVectors(SUN, shadowRight), focus = new THREE.Vector3();
  function update(dt) {
    const p = progress(), target = W.mix(0, framing.d, p);
    if (first) { d = target; first = false; }
    const before = d;
    d += (target - d) * (1 - Math.exp(-dt / .42));
    if (Math.abs(target - d) < 1e-4) d = target;
    const pace = dt ? Math.abs(d - before) / dt : 0;
    speed += (pace - speed) * (1 - Math.exp(-dt / .22));
    clock += dt;

    // Gait: a dip at each heel strike, a sway from foot to foot, fading when
    // standing still or when a fast scroll turns the walk into a glide.
    const pose = W.pose(d, aspect), gait = still ? 0 : W.smooth(.12, 1.1, speed) * (1 - W.smooth(6, 13, speed));
    const phase = d / W.STEP * Math.PI * 2;
    const dip = -.028 * gait * (1 + Math.cos(phase)) / 2, lateral = .016 * gait * Math.sin(phase / 2);
    const breathe = still ? 0 : .0035 * Math.sin(clock * 1.6) * (1 - gait);
    const step = Math.floor(d / W.STEP);
    if (step !== footfall) {
      if (gait > .2 && Math.abs(step - footfall) < 3) WoodsSound.step(Math.abs(d - W.CREEK) < W.BRIDGE ? 'wood' : 'dirt', Math.min(1, .45 + gait * .55));
      footfall = step;
    }

    // Looking around: drag and arrow keys add to the heading, a walk eases it back.
    dragYaw += turning * 1.5 * dt;
    const settle = Math.exp(-dt * 1.1 * W.smooth(.5, 2, speed));
    dragYaw *= settle; dragPitch *= settle;
    dragYaw = W.clamp(dragYaw, -2.4, 2.4); dragPitch = W.clamp(dragPitch, -.55, .5);
    const follow = 1 - Math.exp(-dt / .16);
    lookYaw += (dragYaw - hoverX * .07 - lookYaw) * follow;
    lookPitch += (dragPitch - hoverY * .045 - lookPitch) * follow;

    // Lean a little into the bends, as anyone walking a curving path does.
    if (heading !== null && dt) {
      let turn = pose.yaw - heading;
      if (turn > Math.PI) turn -= 2 * Math.PI; else if (turn < -Math.PI) turn += 2 * Math.PI;
      lean += (W.clamp(turn / dt * .05, -.025, .025) * gait - lean) * (1 - Math.exp(-dt / .5));
    }
    heading = pose.yaw;
    const cosY = Math.cos(pose.yaw), sinY = Math.sin(pose.yaw);
    camera.position.set(pose.x + cosY * lateral, pose.y + dip, pose.z - sinY * lateral);
    camera.rotation.set(pose.pitch + lookPitch + breathe, pose.yaw + lookYaw, lateral * .22 + lean);
    skyDome.position.copy(camera.position);

    // The sun's shadow box travels ahead of the walker, snapped to its texels
    // so shadow edges hold still instead of crawling with every step.
    focus.set(camera.position.x - Math.sin(pose.yaw + lookYaw) * 13, camera.position.y, camera.position.z - Math.cos(pose.yaw + lookYaw) * 13);
    const texel = 2 * SHADOW / Q.shadow, a = focus.dot(shadowRight), b = focus.dot(shadowUp);
    focus.addScaledVector(shadowRight, Math.round(a / texel) * texel - a).addScaledVector(shadowUp, Math.round(b / texel) * texel - b);
    sun.target.position.copy(focus);
    sun.position.copy(focus).addScaledVector(SUN, 95);

    // Wind eases in and out rather than stopping dead.
    shared.uWindAmp.value += ((windOn && !still ? 1 : 0) - shared.uWindAmp.value) * (1 - Math.exp(-dt / .7));
    const ambient = shared.uWindAmp.value > .002;
    if (ambient) { windClock += dt; flowTime.value += dt * shared.uWindAmp.value; moteUniforms.uTime.value += dt * shared.uWindAmp.value; }
    shared.uTime.value = windClock;
    moteUniforms.uCenter.value.copy(camera.position);
    motes.visible = leaves.visible = !still;
    if (ambient) leafUniforms.uTime.value += dt * shared.uWindAmp.value;
    leafUniforms.uCenter.value.copy(camera.position);
    leafUniforms.uAmount.value += (aspenNear(camera.position.x, camera.position.z) * .9 + .05 - leafUniforms.uAmount.value) * (1 - Math.exp(-dt / 2));
    WoodsSound.update(W.gust(camera.position.x, camera.position.z, windClock) * shared.uWindAmp.value,
      1 - W.smooth(3, 36, W.creekDistance(camera.position.x, camera.position.z)), 1 - W.meadow(camera.position.x, camera.position.z) * .7);

    // The words on screen follow the walk.
    show(intro, still ? 1 : 1 - ease((d - 1.2) / 8));
    show(arrivalCopy, still ? 0 : ease((d - (framing.d - 13)) / 9));
    show(hint, still || looked ? 0 : (1 - ease((d - .5) / 4)) * ease(clock / 1.5 - .4));
    progressBar.style.transform = `scaleX(${(d / framing.d).toFixed(4)})`;
    const [number, words] = stopFor(d);
    if (number !== stop) { stop = number; mile.textContent = number; mileCopy.textContent = words; }
    setArrived(still || (p > .985 && Math.abs(d - framing.d) < .4));

    let glowing = false;
    for (const board of boards) {
      const u = board.userData;
      u.glow += (u.goal - u.glow) * (still ? 1 : 1 - Math.exp(-dt / .09));
      if (Math.abs(u.goal - u.glow) > .002) glowing = true;
      u.face.emissiveIntensity = u.glow * .3;
      board.position.z = u.rest + u.glow * .025;
    }
    const moving = Math.abs(target - d) > 1e-3 || speed > .02 || Math.abs(dragYaw - hoverX * .07 - lookYaw) > 1e-4 || Math.abs(dragPitch - hoverY * .045 - lookPitch) > 1e-4 || turning;
    return moving || glowing || journey || (ambient && !still) || gait > .01;
  }

  const corner = new THREE.Vector3();
  function placeLinks() {
    if (!arrived) return;
    boards.forEach((board, i) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, behind = false;
      for (const [cx, cy] of board.userData.outline) {
        corner.set(cx, cy, board.userData.front).applyMatrix4(board.matrixWorld).project(camera);
        if (corner.z > 1) behind = true;
        const sx = (corner.x * .5 + .5) * width, sy = (.5 - corner.y * .5) * height;
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
      }
      const style = links[i].style;
      style.transform = behind ? 'translate(-9999px, 0)' : `translate(${x0.toFixed(1)}px, ${y0.toFixed(1)}px)`;
      style.width = `${(x1 - x0).toFixed(1)}px`;
      style.height = `${(y1 - y0).toFixed(1)}px`;
    });
  }
  links.forEach((link, i) => {
    const on = () => { boards[i].userData.goal = 1; wake(); }, off = () => { boards[i].userData.goal = 0; wake(); };
    link.addEventListener('pointerenter', on); link.addEventListener('pointerleave', off);
    link.addEventListener('focus', on); link.addEventListener('blur', off);
  });

  // ---- Frames: continuous while anything moves, idle otherwise.
  let raf = 0, last = 0, slow = 0, quick = 0, settled = 0, ready = false;
  function wake() { if (ready && !raf && !document.hidden) raf = requestAnimationFrame(frame); }
  function frame(now) {
    raf = 0;
    const dt = last ? Math.min(.1, (now - last) / 1000) : 1 / 60;
    last = now;
    const busy = update(dt);
    renderer.render(scene, camera);
    placeLinks();
    adapt(dt);
    if (busy) wake(); else last = 0;
  }
  // Keep the walk smooth on slower machines by trading resolution for frames.
  function adapt(dt) {
    settled += dt;
    if (settled < 2.5 || !last) return;
    if (dt > .028) { slow += dt; quick = 0; } else if (dt < .0145) { quick += dt; slow = Math.max(0, slow - dt); } else slow = Math.max(0, slow - dt * .25);
    const cap = Math.min(devicePixelRatio || 1, Q.dpr);
    if (slow > 1.2 && pixelRatio > .6) { pixelRatio = Math.max(.6, pixelRatio * .84); slow = 0; resize(); }
    else if (quick > 6 && pixelRatio < cap) { pixelRatio = Math.min(cap, pixelRatio * 1.1); quick = 0; resize(); }
  }
  function resize() {
    width = stage.clientWidth; height = stage.clientHeight; aspect = width / height;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    camera.aspect = aspect;
    camera.fov = W.lens(aspect);
    camera.updateProjectionMatrix();
    framing = W.arrival(aspect);
    moteUniforms.uScale.value = height * pixelRatio;
  }
  function measure() {
    resize();
    start = walk.getBoundingClientRect().top + scrollY;
    distance = Math.max(1, walk.offsetHeight - stage.offsetHeight);
    wake();
  }
  let resizing = 0;
  addEventListener('resize', () => { cancelAnimationFrame(resizing); resizing = requestAnimationFrame(measure); }, {passive: true});
  addEventListener('scroll', wake, {passive: true});

  // ---- Looking around with a drag, a swipe sideways, or the arrow keys.
  stage.addEventListener('pointerdown', event => {
    if (event.target.closest('a, button') || !event.isPrimary) return;
    cancelJourney();
    dragging = {id: event.pointerId, x: event.clientX, y: event.clientY, mouse: event.pointerType === 'mouse'};
    if (dragging.mouse) { event.preventDefault(); stage.setPointerCapture(event.pointerId); stage.classList.add('is-dragging'); }
  });
  stage.addEventListener('pointermove', event => {
    if (fine && event.pointerType === 'mouse') { hoverX = event.clientX / width - .5; hoverY = event.clientY / height - .5; wake(); }
    if (!dragging || event.pointerId !== dragging.id) return;
    const dx = event.clientX - dragging.x, dy = event.clientY - dragging.y;
    dragging.x = event.clientX; dragging.y = event.clientY;
    const turn = (camera.fov * THREE.MathUtils.DEG2RAD) / height;
    dragYaw += dx * turn * 1.1;
    if (dragging.mouse) dragPitch += dy * turn;
    if (Math.abs(dx) + Math.abs(dy) > 2) looked = true;
    wake();
  });
  const release = () => { dragging = null; stage.classList.remove('is-dragging'); };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);
  stage.addEventListener('pointerleave', event => { if (event.pointerType === 'mouse') { hoverX = hoverY = 0; wake(); } });
  const typing = () => document.activeElement && /input|textarea|select/i.test(document.activeElement.tagName);
  addEventListener('keydown', event => {
    if (typing() || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'ArrowLeft') { turning = 1; looked = true; wake(); }
    if (event.key === 'ArrowRight') { turning = -1; looked = true; wake(); }
  });
  addEventListener('keyup', event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') turning = 0; });
  addEventListener('blur', () => { turning = 0; release(); });

  // ---- Guided walks: optional, and any deliberate input hands control back.
  let journey = 0, focusOnArrival = false;
  function cancelJourney() {
    if (!journey) return;
    cancelAnimationFrame(journey);
    journey = 0;
    focusOnArrival = false;
  }
  const quintic = t => t * t * t * (10 + t * (-15 + 6 * t));
  function travel(to, duration, profile) {
    cancelAnimationFrame(journey);
    const from = scrollY, began = performance.now();
    const advance = now => {
      const t = Math.min(1, (now - began) / duration);
      scrollTo({top: from + (to - from) * profile(t, duration / 1000), behavior: 'instant'});
      wake();
      journey = t < 1 ? requestAnimationFrame(advance) : 0;
      if (!journey && focusOnArrival) { focusOnArrival = false; arriveNow(true); }
    };
    journey = requestAnimationFrame(advance);
  }
  // Walking pace: ease in over two strides, hold an easy hike, ease to a stop.
  function stroll(t, total) {
    const time = t * total, rampIn = Math.min(2.2, total * .3), rampOut = Math.min(3, total * .3), v = 1 / (total - rampIn / 2 - rampOut / 2);
    if (time < rampIn) return .5 * v * time * time / rampIn;
    if (time < total - rampOut) return v * (time - rampIn / 2);
    const left = total - time;
    return 1 - .5 * v * left * left / rampOut;
  }
  const end = () => start + distance;
  function arriveNow(focusSign) {
    if (walking) scrollTo({top: end(), behavior: 'instant'});
    first = true;
    last = 0;
    frame(performance.now());
    if (focusSign) links[0].focus({preventScroll: true});
  }
  addEventListener('wheel', cancelJourney, {passive: true});
  addEventListener('touchstart', cancelJourney, {passive: true});
  addEventListener('keydown', event => {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Escape', 'Tab'].includes(event.key)) cancelJourney();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelJourney(); WoodsSound.pause(); cancelAnimationFrame(raf); raf = 0; last = 0; }
    else { WoodsSound.resume(); wake(); }
  });
  const modified = event => event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
  home.querySelectorAll('a[href="#woods-junction"]').forEach(link => link.addEventListener('click', event => {
    if (modified(event)) return;
    event.preventDefault();
    history.replaceState(null, '', '#woods-junction');
    if (!walking || link.classList.contains('woods-skip')) return arriveNow(true);
    focusOnArrival = event.detail === 0;
    const remaining = (1 - progress()) * framing.d;
    if (link.classList.contains('woods-begin')) travel(end(), (3 + remaining / 3.2) * 1000, stroll);
    else travel(end(), (1.8 + 3 * Math.sqrt(W.clamp(remaining / framing.d))) * 1000, quintic);
  }));
  $('.woods-return').addEventListener('click', event => {
    if (modified(event) || !walking) return;
    event.preventDefault();
    focusOnArrival = false;
    history.replaceState(null, '', location.pathname + location.search);
    travel(start, 2600, quintic);
    home.querySelector('.brand a').focus({preventScroll: true});
  });

  // ---- Sound and wind controls.
  soundButton.hidden = false;
  soundButton.addEventListener('click', () => {
    const on = !WoodsSound.enabled;
    if (on && !WoodsSound.enable()) return;
    if (!on) WoodsSound.disable();
    soundButton.setAttribute('aria-pressed', String(on));
    soundButton.querySelector('.woods-toggle-label').textContent = on ? 'Sound on' : 'Sound off';
  });
  windButton.addEventListener('click', () => {
    windOn = !windOn;
    windButton.querySelector('.woods-toggle-label').textContent = windOn ? 'Pause wind' : 'Resume wind';
    wake();
  });

  // Reduced motion stands the walker at the junction; otherwise scroll walks.
  function configure() {
    still = motion.matches;
    walking = !still;
    root.classList.toggle('woods-still', still);
    root.classList.toggle('woods-walking', walking);
    windButton.hidden = still;
    stage.classList.toggle('woods-look', fine);
    if (still) cancelJourney();
    arrived = null;
    first = true;
    measure();
    if (walking && location.hash === '#woods-junction') scrollTo({top: end(), behavior: 'instant'});
  }
  motion.addEventListener('change', configure);
  addEventListener('pageshow', () => { measure(); if (walking && location.hash === '#woods-junction') scrollTo({top: end(), behavior: 'instant'}); });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    root.classList.remove('woods-live', 'woods-walking', 'woods-still', 'at-junction');
    root.classList.add('woods-failed');
  });

  configure();
  // ?at=0.4 opens the walk that far along the trail, for sharing a spot.
  const at = parseFloat(new URLSearchParams(location.search).get('at'));
  if (walking && at >= 0 && at <= 1 && location.hash !== '#woods-junction') scrollTo({top: start + distance * at, behavior: 'instant'});
  update(1 / 60);
  if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
  ready = true;
  first = true;
  frame(performance.now());
  root.classList.remove('woods-failed');
  root.classList.add('woods-live');
  wake();
}
