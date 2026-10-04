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
    ? {dpr: 1.35, shadow: 1536, shadowReach: 34, grass: 5000, grid: 1.6, motes: 220, rays: 16, bark: 256, samples: 0, bloom: 5}
    : {dpr: 1.6, shadow: 4096, shadowReach: 50, grass: 11000, grid: 1.25, motes: 480, rays: 28, bark: 512, samples: (devicePixelRatio || 1) > 1.3 ? 2 : 4, bloom: 6};

  // The frame is rendered in HDR and developed by WoodsRender's darkroom, which
  // does its own antialiasing, tone curve and output encoding.
  const renderer = new THREE.WebGLRenderer({canvas, antialias: false, powerPreference: 'high-performance'});
  let pixelRatio = Math.min(devicePixelRatio || 1, Q.dpr);
  renderer.setPixelRatio(pixelRatio);
  renderer.autoClear = false;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  // ---- Light: Arizona's own, for the moment asked for (?light=dusk, or a
  // choice kept for the visit), otherwise for right now. Golden hour puts the
  // sun low over the left shoulder; at night the moon, if it is up, takes over.
  const query = new URLSearchParams(location.search);
  const remembered = (() => { try { return sessionStorage.getItem('woods:light'); } catch { return null; } })();
  let hour = WoodsSky.at(query.get('light') || remembered || 'now');
  const SUN = new THREE.Vector3(...hour.key);
  const air = WoodsRender.atmosphere({
    sun: hour.key, sunLight: hour.keyLight,
    rayBeta: [5.8e-6 * 1.35, 13.5e-6 * 1.35, 33.1e-6 * 1.35], rayH: 8000,
    hazeBeta: 1.3e-5, hazeH: 1500, mistBeta: 5e-5, mistBase: -620, mistH: 260,
    skyLight: hour.sky, hazeLight: hour.haze, mieG: .78, mieGain: .1, cloudBase: 2900,
  });
  air.uniforms.W_SUN.value = SUN;
  WoodsRender.installFog(THREE, air.glsl);
  const scene = new THREE.Scene(), far = new THREE.Scene();
  // Built-in materials take their air from the fog chunk; fog.near is the haze among the trunks.
  scene.fog = new THREE.Fog(0xffffff, 0, 1);
  const camera = new THREE.PerspectiveCamera(56, 1, .08, 900), farCamera = new THREE.PerspectiveCamera(56, 1, 20, 90000);
  camera.rotation.order = 'YXZ';
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  const SHADOW = Q.shadowReach;
  // Soft shadows that widen with distance from their caster, where the GPU can afford them.
  if (!LOW && WoodsRender.installSoftShadows(THREE, {range: 219, span: 2 * SHADOW, spread: .011, search: .9, blockers: 12, samples: 20})) renderer.shadowMap.type = THREE.PCFShadowMap;
  sun.castShadow = true;
  sun.shadow.mapSize.set(Q.shadow, Q.shadow);
  Object.assign(sun.shadow.camera, {left: -SHADOW, right: SHADOW, top: SHADOW, bottom: -SHADOW, near: 1, far: 220});
  sun.shadow.bias = -.0003;
  sun.shadow.normalBias = .04;
  sun.shadow.radius = 2;
  // Open ground sees the whole sky; under the crowns the environment does the work.
  const openSky = new THREE.HemisphereLight('#a9c3e6', '#6b5a3c', 0);
  // After dark the walker carries a headlamp, and a lantern hangs at the
  // signpost. They join the scene only once the light goes, so daytime frames
  // never pay for them; the change compiles behind the crossfade.
  const headlamp = new THREE.SpotLight('#ffeedd', 0, 40, .56, .7, 2);
  const lantern = new THREE.PointLight('#ffb15c', 0, 14, 2);
  scene.add(sun, sun.target, openSky);

  const rnd = W.random(20260923), R = (a, b) => a + (b - a) * rnd(), pick = list => list[Math.floor(rnd() * list.length)];
  const UP = new THREE.Vector3(0, 1, 0);

  // ---- Wind, shared by every swaying thing and by the sound of it.
  const shared = {uTime: {value: 0}, uWindAmp: {value: 1}, uWindDir: {value: new THREE.Vector2(.88, .47)}, uSunDir: {value: SUN},
    uSunColor: {value: new THREE.Color()}, woodsNoise: {value: null}, woodsClock: {value: 0}};
  // The glint of the key light on moving water.
  const glint = {value: new THREE.Color()};
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
    const {bend = 0, flutter = 0, sprite = false, glow = 0, upright = false, char = 0} = options;
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, shared);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          ${WIND}
          ${sprite ? 'attribute vec4 aSprite;' : ''}
          varying vec3 vWorld; varying vec2 vRoot;`)
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
          vWorld = wp.xyz;
          vRoot = vec2(position.y * span, woodsHash(origin));`)
        .replace('#include <worldpos_vertex>', 'vec4 worldPosition = wp;');
      // Old ponderosas carry the black of past ground fires a metre or two up the trunk.
      if (char) shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vRoot;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          float scorch = .5 + vRoot.y * 1.9 + .35 * sin(vMapUv.x * 18.85 + vRoot.y * 40.0) + .18 * sin(vMapUv.x * 50.3 + vMapUv.y * 3.0);
          diffuseColor.rgb *= mix(1.0, .14, (1.0 - smoothstep(scorch - .25, scorch + .35, vRoot.x)) * ${f(char)} * step(.3, vRoot.y));`);
      // Blades and fronds are lit like the ground they grow from, on both faces.
      if (upright) shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);');
      if (glow) shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uSunDir; uniform vec3 uSunColor; varying vec3 vWorld;')
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
          ${sprite ? `// A clump turned away from the eye shows its shaded underside, however
          // brightly its far face is lit; the crown in front of it shades it too.
          float away = smoothstep(-.1, .75, -dot(normal, normalize(vViewPosition)));
          reflectedLight.directDiffuse *= 1.0 - away * .82;
          reflectedLight.indirectDiffuse *= 1.0 - away * .35;` : ''}
          // Needles, leaves and blades scatter light; they barely mirror the sky.
          reflectedLight.directSpecular *= .25;
          reflectedLight.indirectSpecular *= .08;
          // Light through leaves: foliage between the eye and the sun glows, green.
          float back = pow(max(dot(normalize(vWorld - cameraPosition), uSunDir), 0.0), 6.0);
          reflectedLight.indirectDiffuse += diffuseColor.rgb * diffuseColor.rgb * 2.2 * uSunColor * (back * ${f(glow)} + ${f(glow * .06)});`);
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
  shared.woodsNoise.value = noiseTexture;

  // ---- Bark, grown from height fields so each has a normal map to match.
  // Periodic value noise, for textures that wrap round a trunk without a seam.
  function tileNoise(x, y, px, py, seed) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const h = (i, j) => W.hash(((i % px) + px) % px, ((j % py) + py) % py, seed);
    const a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), d = h(ix + 1, iy + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function tileFbm(x, y, px, py, octaves, seed) {
    let sum = 0, amp = .5, total = 0;
    for (let i = 0; i < octaves; i++) { sum += tileNoise(x, y, px, py, seed + i * 17) * amp; total += amp; x *= 2; y *= 2; px *= 2; py *= 2; amp *= .5; }
    return sum / total;
  }
  // Worley cells on a wrapping grid, stretched along the trunk: distance to the
  // nearest seed and to the next, and a value for the cell that won.
  function cells(cols, rows, stretch, seed) {
    const r = W.random(seed), pts = Array.from({length: cols * rows}, () => [r(), r(), r()]);
    return (x, y) => {
      const gx = Math.floor(x), gy = Math.floor(y);
      let d1 = 9, d2 = 9, id = 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const i = gx + ox, j = gy + oy, p = pts[(((j % rows) + rows) % rows) * cols + (((i % cols) + cols) % cols)];
        const dx = i + p[0] - x, dy = (j + p[1] - y) * stretch, dd = dx * dx + dy * dy;
        if (dd < d1) { d2 = d1; d1 = dd; id = p[2]; } else if (dd < d2) d2 = dd;
      }
      return [Math.sqrt(d1), Math.sqrt(d2), id];
    };
  }
  // A height field becomes a tangent-space normal map.
  function normalMap(heights, w, h, strength) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d'), image = g.createImageData(w, h), px = image.data, at = (i, j) => heights[((j + h) % h) * w + ((i + w) % w)];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength, l = Math.hypot(dx, dy, 1), k = (y * w + x) * 4;
      px[k] = (-dx / l * .5 + .5) * 255; px[k + 1] = (dy / l * .5 + .5) * 255; px[k + 2] = (.5 / l + .5) * 255; px[k + 3] = 255;
    }
    g.putImageData(image, 0, 0);
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(maxAniso, 8);
    return texture;
  }
  // shade(u, v) gives [r, g, b, height] for a texel; u runs round the trunk, v up it.
  function bark(w, h, relief, shade) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d'), image = g.createImageData(w, h), px = image.data, heights = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const out = shade(x / w, y / h), k = (y * w + x) * 4;
      px[k] = out[0]; px[k + 1] = out[1]; px[k + 2] = out[2]; px[k + 3] = 255;
      heights[y * w + x] = out[3];
    }
    g.putImageData(image, 0, 0);
    const map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = Math.min(maxAniso, 8);
    return {map, normal: normalMap(heights, w, h, relief)};
  }
  const BW = Q.bark, BH = Q.bark * 2;
  // Ponderosa: long cinnamon plates, each built of thin flakes like a jigsaw,
  // split by black fissures that wander rather than run straight.
  const pineBark = (() => {
    const plates = cells(8, 17, .45, 11), flakes = cells(28, 56, .75, 12);
    return bark(BW, BH, BW / 80, (u, v) => {
      const warp = tileFbm(u * 8, v * 16, 8, 16, 2, 3) - .5;
      const x = (((u + warp * .06) % 1) + 1) % 1, y = (((v + warp * .035) % 1) + 1) % 1;
      const [a1, a2, id] = plates(x * 8, y * 17), edge = a2 - a1;
      const width = .035 + .075 * tileNoise(u * 16, v * 32, 16, 32, 5);
      const fissure = (1 - W.smooth(width * .2, width, edge)) * (.62 + .38 * tileNoise(u * 24, v * 48, 24, 48, 8));
      const [f1, f2] = flakes(u * 28, v * 56), seam = W.smooth(0, .12, f2 - f1);
      const grain = tileFbm(u * 48, v * 96, 48, 96, 2, 6), grey = W.smooth(.35, .95, id) * .7;
      const tone = (.8 + .28 * id) * (.72 + .36 * grain) * (.76 + .24 * seam) * (.66 + .34 * W.smooth(0, .25, edge));
      const r = W.mix(150, 122, grey) * tone, gg = W.mix(92, 104, grey) * tone, b = W.mix(60, 88, grey) * tone;
      return [W.mix(r, 38, fissure), W.mix(gg, 29, fissure), W.mix(b, 22, fissure), (1 - fissure) * (.6 + .25 * W.smooth(0, .3, edge) + .15 * seam)];
    });
  })();
  // Fir: grey-brown corky ridges running up the trunk, furrowed and cross-cracked.
  const firBark = bark(BW, BH, BW / 110, (u, v) => {
    const warp = tileFbm(u * 4, v * 5, 4, 5, 2, 21) * 1.6;
    const ridge = W.smooth(.36, .62, tileFbm(u * 12 + warp, v * 3, 12, 3, 4, 22));
    const crack = W.smooth(.66, .86, tileFbm(u * 7, v * 30, 7, 30, 2, 23)) * ridge, fleck = tileNoise(u * 60, v * 120, 60, 120, 24);
    const tone = (.72 + .3 * fleck) * (.55 + .45 * ridge) * (1 - crack * .45);
    return [W.mix(44, 124, ridge) * tone + 10, W.mix(36, 108, ridge) * tone + 8, W.mix(30, 94, ridge) * tone + 7, ridge * .8 - crack * .35 + fleck * .08];
  });
  // Aspen: chalky white with lenticels, a greener cast in the light, and the
  // dark eyes where branches once grew.
  const aspenBark = (() => {
    const eyes = Array.from({length: 7}, () => [rnd(), rnd(), R(.04, .09), R(.012, .022)]);
    return bark(BW, BH, BW / 160, (u, v) => {
      const chalk = tileFbm(u * 6, v * 12, 6, 12, 3, 31), dash = W.smooth(.72, .82, tileFbm(u * 40, v * 180, 40, 180, 2, 32));
      let eye = 0;
      for (const [ex, ey, ew, eh] of eyes) {
        let dx = Math.abs(u - ex); dx = Math.min(dx, 1 - dx);
        let dy = Math.abs(v - ey); dy = Math.min(dy, 1 - dy);
        const d = (dx / ew) ** 2 + ((dy + dx * dx * 1.8) / eh) ** 2;
        eye = Math.max(eye, 1 - W.smooth(.55, 1, d));
      }
      const dark = Math.max(dash * .75, eye);
      const tone = .86 + .18 * chalk;
      return [W.mix(232 * tone, 44, dark), W.mix(229 * tone, 41, dark), W.mix(212 * tone, 36, dark), .6 - dark * .5 + chalk * .1];
    });
  })();

  // Foliage sprites: each clump of a crown is a camera-facing card of these.
  // Fir sprays: twigs thick with short needles set all round them, so a spray
  // reads as a dense bottlebrush rather than a flat fern, darkest at its heart.
  const firSprite = paint(256, 256, g => {
    g.lineCap = 'round';
    const twigs = [];
    for (let b = 0; b < 12; b++) {
      const side = rnd() < .5 ? -1 : 1, len = R(60, 120);
      let x = 128 - side * R(0, 26), y = 128 + R(-50, 40), dir = side > 0 ? R(-.4, .25) : Math.PI + R(-.25, .4);
      const droop = R(.1, .45), path = [];
      for (let k = 0, steps = Math.round(len / 3); k < steps; k++) { dir += side * droop / steps; x += Math.cos(dir) * 3; y += Math.sin(dir) * 3; path.push([x, y, dir, k / steps]); }
      twigs.push(path);
      for (let k = 7; k < path.length; k += 6 + Math.floor(rnd() * 5)) {
        const [bx, by, bd] = path[k], twig = bd + (rnd() < .5 ? -1 : 1) * R(.5, .9), tl = R(12, 30), sub = [];
        for (let q = 0; q < tl / 3; q++) sub.push([bx + Math.cos(twig) * q * 3, by + Math.sin(twig) * q * 3, twig, .5 + q / tl * 1.5]);
        twigs.push(sub);
      }
    }
    const tones = ['#101b10', '#152414', '#1b2e18', '#22391d', '#2b4524', '#36532b', '#466536'];
    tones.forEach((tone, layer) => {
      g.strokeStyle = tone;
      for (const path of twigs) for (const [x, y, dir, t] of path) {
        if (rnd() > .55 + layer * .05) continue;
        for (let n = 0; n < 3; n++) {
          const a = dir + (rnd() < .5 ? -1 : 1) * R(.35, 1.4), len = R(4, 10) * (1.1 - Math.min(t, 1) * .35);
          g.lineWidth = R(.9, 1.6);
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len + 1.2); g.stroke();
        }
      }
    });
  });
  const pineSprite = paint(256, 256, g => {
    g.lineCap = 'round';
    // Fascicles of long needles on a few twigs: dark in the heart of the tuft, lighter at the tips.
    const tufts = Array.from({length: 6}, () => [128 + R(-58, 58), 128 + R(-54, 46), R(0, 6.283)]);
    g.strokeStyle = '#3a2b1e'; g.lineWidth = 3.4;
    for (const [x, y] of tufts) { g.beginPath(); g.moveTo(128 + R(-18, 18), 206); g.quadraticCurveTo(128 + R(-10, 10), y + 26, x, y); g.stroke(); }
    ['#0e1709', '#13200d', '#192a11', '#203417', '#293f1c', '#344b23', '#435a2c'].forEach((tone, layer) => {
      g.strokeStyle = tone;
      for (const [x, y, turn] of tufts) for (let k = 0; k < 17; k++) {
        const a = turn + R(-2.7, 2.7), len = R(24, 54) * (1 - layer * .045), bend = R(-.35, .35);
        g.lineWidth = R(.8, 1.5);
        g.beginPath(); g.moveTo(x, y);
        g.quadraticCurveTo(x + Math.cos(a + bend) * len * .55, y + Math.sin(a + bend) * len * .55, x + Math.cos(a) * len, y + Math.sin(a) * len + len * .14);
        g.stroke();
      }
    });
  });
  // A leaf with a short point and a slim stalk, shaded across its blade.
  function leaf(g, x, y, size, turn, tone, warm, stalk = true) {
    g.save(); g.translate(x, y); g.rotate(turn);
    const s = size, light = g.createLinearGradient(-s, -s, s, s);
    light.addColorStop(0, `rgb(${tone | 0}, ${tone * .95 | 0}, ${tone * warm | 0})`);
    light.addColorStop(1, `rgb(${tone * .66 | 0}, ${tone * .62 | 0}, ${tone * warm * .6 | 0})`);
    g.fillStyle = light;
    g.beginPath(); g.moveTo(s * 1.2, 0);
    g.bezierCurveTo(s * .8, s * .78, -s * .25, s * 1.02, -s * .82, s * .42);
    g.bezierCurveTo(-s * 1.06, 0, -s * 1.06, 0, -s * .82, -s * .42);
    g.bezierCurveTo(-s * .25, -s * 1.02, s * .8, -s * .78, s * 1.2, 0);
    g.fill();
    g.strokeStyle = 'rgba(60,52,28,.28)'; g.lineWidth = .7;
    g.beginPath(); g.moveTo(-s * .8, 0); g.lineTo(s * 1.05, 0); g.stroke();
    if (stalk) { g.strokeStyle = 'rgba(96,82,48,.85)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-s * .85, 0); g.lineTo(-s * 1.6, R(-2, 2)); g.stroke(); }
    g.restore();
  }
  // Aspen: round quaking leaves, overlapping, lit and shaded across the clump.
  const leafSprite = paint(256, 256, g => {
    const leaves = Array.from({length: 150}, () => {
      const r = Math.sqrt(rnd()) * 104, a = R(0, 6.283);
      return {x: 128 + Math.cos(a) * r, y: 128 + Math.sin(a) * r * .92, size: R(6.5, 11.5), turn: R(0, 6.283), light: rnd() * .7 + (1 - r / 104) * .3};
    }).sort((a, b) => a.light - b.light);
    for (const l of leaves) leaf(g, l.x, l.y, l.size, l.turn, W.mix(110, 255, l.light), .6);
  });
  // Understory shrubs: small leaves crowded along twigs, dark between.
  const shrubSprite = paint(256, 256, g => {
    g.lineCap = 'round';
    const twigs = Array.from({length: 13}, () => [128 + R(-24, 24), 168 + R(-16, 30), -Math.PI / 2 + R(-1.3, 1.3), R(56, 112)]);
    for (const [x, y, a, len] of twigs) { g.strokeStyle = 'rgba(64,46,32,.95)'; g.lineWidth = R(1.1, 2); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke(); }
    const leaves = [];
    for (const [x, y, a, len] of twigs) for (let k = 0; k < 17; k++) {
      const t = R(.2, 1.05);
      leaves.push({x: x + Math.cos(a) * len * t + R(-9, 9), y: y + Math.sin(a) * len * t + R(-9, 9), size: R(3.6, 6.8), turn: a + R(-1.5, 1.5), light: rnd() * .75 + t * .25});
    }
    leaves.sort((a, b) => a.light - b.light);
    for (const l of leaves) leaf(g, l.x, l.y, l.size, l.turn, W.mix(80, 235, l.light), .55, false);
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
    const geometry = new THREE.IcosahedronGeometry(1, 2), p = geometry.attributes.position, v = new THREE.Vector3(), flat = new THREE.Vector3(.6, .3, .74);
    const keys = [];
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize();
      keys.push(`${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`);
      // Weathered boulders: broad lumps, a few flatter fracture faces, a buried base.
      const k = .72 + .5 * W.fbm(v.x * 1.5 + seed * 3, v.y * 1.5 + v.z * 1.3 - seed, 4, seed) - .32 * Math.max(0, v.dot(flat) - .55);
      v.multiplyScalar(k); v.y *= .62;
      if (v.y < -.12) v.y = -.12 + (v.y + .12) * .3;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    geometry.computeVertexNormals();
    // The icosphere's triangles are separate; average their normals where they
    // meet so the stone is shaded round instead of cut into facets.
    const n = geometry.attributes.normal, sum = new Map();
    keys.forEach((key, i) => { const s = sum.get(key) || [0, 0, 0]; s[0] += n.getX(i); s[1] += n.getY(i); s[2] += n.getZ(i); sum.set(key, s); });
    keys.forEach((key, i) => { const s = sum.get(key), l = Math.hypot(...s) || 1; n.setXYZ(i, s[0] / l, s[1] / l, s[2] / l); });
    const colors = [];
    for (let i = 0; i < p.count; i++) {
      const grain = .82 + .3 * W.fbm(p.getX(i) * 4 + seed, p.getZ(i) * 4 + p.getY(i) * 3, 2, 40 + seed);
      const moss = W.smooth(.55, .85, n.getY(i)) * W.smooth(.45, .62, W.fbm(p.getX(i) * 3, p.getZ(i) * 3, 2, 50 + seed));
      colors.push(W.mix(.2 * grain, .075, moss), W.mix(.19 * grain, .1, moss), W.mix(.175 * grain, .04, moss));
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
  const barkMaterial = (bark, bend, char = 0) => sway(new THREE.MeshStandardMaterial({map: bark.map, normalMap: bark.normal, normalScale: new THREE.Vector2(1.4, 1.4), vertexColors: true, roughness: .93}), {bend, char});
  const leafMaterial = (map, bend, glow, flutter = .035) => sway(new THREE.MeshStandardMaterial({map, vertexColors: true, alphaTest: .5, roughness: .8, alphaToCoverage: Q.samples > 0}), {bend, flutter, sprite: true, glow});
  const leafDepth = (map, bend, flutter = .035) => sway(new THREE.MeshDepthMaterial({depthPacking: THREE.RGBADepthPacking, map, alphaTest: .5}), {bend, flutter, sprite: true});
  const hex = list => list.map(c => new THREE.Color(c));
  // ---- The season, from Arizona's calendar. Aspens leaf out pale in May, are
  // green all summer, turn through September, blaze gold and orange in
  // October, drop the last leaves in November and stand bare all winter.
  const GREEN = ['#6c8a3c', '#5f7d36', '#73903f', '#668a3a', '#7a9444'], BARE = ['#7a6a48', '#6e5f40', '#857252', '#6a5a3c', '#8a7650'];
  const SEASON = [
    null, null, null, null,
    {aspens: ['#cfe58a', '#bfdc7a', '#d8eb98', '#b2d06e'], fall: 0, grass: ['#b9c27a', '#a6b66a', '#c4c98a', '#9fae62', '#cfd49a'], shrubs: GREEN},
    {aspens: ['#8fbb5c', '#7fae50', '#9cc566', '#86b356', '#a3c86e'], fall: 0, grass: ['#a9b56b', '#98a85e', '#b7bd78', '#8f9f58', '#c2c486'], shrubs: GREEN},
    {aspens: ['#8fbb5c', '#7fae50', '#9cc566', '#86b356', '#a3c86e'], fall: 0, grass: null, shrubs: GREEN},
    {aspens: ['#94bb5a', '#86b050', '#a6c766', '#b6c35e', '#9ab958'], fall: .05, grass: null, shrubs: GREEN},
    // Late September: most aspens have turned, a few are still holding green.
    {aspens: ['#ffc84f', '#ffd35e', '#f7b53f', '#fae17a', '#e8d86a', '#c9d46c', '#a8c15f', '#f59a3d'], fall: .7, grass: null},
    {aspens: ['#ffc84f', '#ffd35e', '#f7b53f', '#fae17a', '#f59a3d', '#ffb347', '#e98a35', '#f2c650'], fall: 1, grass: null},
    {aspens: null, fall: .25, grass: ['#c9b27e', '#b8a172', '#a99467', '#d2bf92', '#bfa676'], shrubs: BARE},
    null,
  ].map(season => season || {aspens: null, fall: 0, grass: ['#c4ad7c', '#b39d70', '#a38f66', '#ccb88c', '#b9a274'], shrubs: BARE})[
    // ?month=6 previews another season (0 is January).
    query.has('month') ? W.clamp(Math.round(+query.get('month')) || 0, 0, 11) : WoodsSky.clock(new Date()).month];
  const SPECIES = {
    pine: {shape: pineTree(), bark: pineBark, leaves: pineSprite, bend: .011, glow: .5, tints: hex(['#ffffff', '#f2f5e6', '#e7ecd9', '#fbf5e4', '#dfe6cf'])},
    fir: {shape: firTree(false), bark: firBark, leaves: firSprite, bend: .012, glow: .22, tints: hex(['#ffffff', '#e8efe1', '#dce6d6', '#f1f2e4'])},
    young: {shape: firTree(true), bark: firBark, leaves: firSprite, bend: .02, glow: .22, tints: hex(['#ffffff', '#e6f0de', '#f4f4e2'])},
    aspen: {shape: aspenTree(), bark: aspenBark, leaves: leafSprite, bend: .014, glow: .7, tints: hex(SEASON.aspens || ['#000'])},
  };
  for (const [name, kind] of Object.entries(SPECIES)) {
    // In winter the aspens stand bare: white trunks and nothing else.
    if (name === 'aspen' && !SEASON.aspens) { patches(forest.trees.filter(t => t.height >= 5 && t.kind === 'aspen'), kind.shape.wood, barkMaterial(kind.bark, kind.bend), t => place(t, t.height * t.girth, t.height, t.height * t.girth), {}); continue; }
    const trees = forest.trees.filter(t => (t.height < 5 ? 'young' : t.kind) === name);
    const transform = t => place(t, t.height * (name === 'young' ? 1.35 : t.girth), t.height, t.height * (name === 'young' ? 1.35 : t.girth));
    patches(trees, kind.shape.wood, barkMaterial(kind.bark, kind.bend, name === 'pine' ? 1 : 0), transform, {});
    patches(trees, kind.shape.crown, leafMaterial(kind.leaves, kind.bend, kind.glow), transform,
      {depth: leafDepth(kind.leaves, kind.bend), color: (t, c) => c.copy(kind.tints[Math.floor(t.tint * kind.tints.length)])});
  }
  const shrubTints = hex(SEASON.shrubs || ['#6c8a3c', '#7a8d42', '#8e8a3e', '#a17a3a', '#5f7d36']);
  patches(forest.shrubs, shrubShape(), leafMaterial(shrubSprite, .03, .45, .05), s => place(s, s.size * 1.5, s.size, s.size * 1.5),
    {depth: leafDepth(shrubSprite, .03, .05), color: (s, c) => c.copy(shrubTints[Math.floor(s.tint * shrubTints.length)])});

  const grass = W.grass(Q.grass);
  const grassTints = hex(SEASON.grass || ['#d6c07e', '#c8ad69', '#b9ab66', '#a6a35d', '#dccb8e']), wetGrass = new THREE.Color('#93a857');
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
  // Granite, speckled and crazed, with crusts of pale lichen on the tops.
  const rockMaterial = new THREE.MeshStandardMaterial({vertexColors: true, roughness: .88});
  rockMaterial.onBeforeCompile = shader => {
    shader.uniforms.uNoise = {value: noiseTexture};
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vStone; varying vec3 vStoneNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvStone = position * vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz)); vStoneNormal = objectNormal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uNoise; varying vec3 vStone; varying vec3 vStoneNormal;
        vec3 stone(float scale) {
          vec3 w = abs(normalize(vStoneNormal)); w = pow(w, vec3(4.0)); w /= w.x + w.y + w.z;
          vec3 p = vStone * scale;
          return texture2D(uNoise, p.yz).rgb * w.x + texture2D(uNoise, p.xz).rgb * w.y + texture2D(uNoise, p.xy).rgb * w.z;
        }
        float stoneBump;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 s1 = stone(.9), s2 = stone(3.6), s3 = stone(13.0);
        float lichen = smoothstep(.56, .7, s1.r * .55 + s2.g * .45) * smoothstep(.1, .7, normalize(vStoneNormal).y);
        diffuseColor.rgb *= (.72 + .55 * s2.b) * (.82 + .36 * s3.r);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.34, .35, .25) * (.8 + .4 * s3.g), lichen * .75);
        stoneBump = s2.r * .5 + s3.b * .5 - smoothstep(.62, .7, s2.g) * .4;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition), r1 = cross(sy, normal), r2 = cross(normal, sx);
          float det = dot(sx, r1) * faceDirection;
          vec2 dh = vec2(dFdx(stoneBump), dFdy(stoneBump)) * .035;
          normal = normalize(abs(det) * normal - sign(det) * (dh.x * r1 + dh.y * r2));
        }`);
  };
  [0, 1, 2].forEach(shape => {
    patches(rocks.filter(r => r.shape === shape), rockShape(shape * 7 + 3), rockMaterial,
      r => place(r, r.size * (1 + r.tilt * .35), r.size * (.75 + r.tilt * .3), r.size * (1.25 - r.tilt * .3), (r.tilt - .5) * .25, (r.tilt - .5) * .2, -r.size * .22), {cell: 40});
  });

  // Logs, stumps and the footbridge share a unit cylinder, scaled per piece.
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 10, 1);
  const logBark = pineBark.map.clone(), logRelief = pineBark.normal.clone();
  logBark.repeat.set(1, 2.4); logRelief.repeat.set(1, 2.4);
  const woodMaterials = [new THREE.MeshStandardMaterial({map: logBark, normalMap: logRelief, color: '#8a7c6c', roughness: .95}), new THREE.MeshStandardMaterial({map: endGrain, roughness: .9}), new THREE.MeshStandardMaterial({map: endGrain, roughness: .9})];
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
      uniforms: {...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uNoise: {value: noiseTexture}, uTime: flowTime, uSunDir: {value: SUN}, uSunColor: glint,
        uSky: {value: new THREE.Color('#9eb0aa')}, uDeep: {value: new THREE.Color('#141a13')}, uShallow: {value: new THREE.Color('#353b2b')}},
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
          vec3 normal = normalize(vec3((a - .5) * .32, 1.0, (b - .5) * .32));
          vec3 view = normalize(cameraPosition - vWorld);
          float fresnel = pow(1.0 - max(dot(normal, view), 0.0), 3.0);
          float middle = 1.0 - abs(vUv.y - .5) * 2.0;
          vec3 color = mix(uShallow, uDeep, smoothstep(.1, .8, middle));
          // The sky mirrored through the gap in the crowns above the creek.
          vec3 sky = uSky * .35;
          #ifdef USE_FOG
            sky = woodsClearSky(reflect(-view, normal), 2.0) * .22;
          #endif
          color = mix(color, sky, .05 + .45 * fresnel);
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
  const lanternGlass = new THREE.MeshStandardMaterial({color: '#3a3226', emissive: '#ffb15c', emissiveIntensity: 0, roughness: .25, transparent: false});
  (() => {
    const {L, H, tip, depth, bevel} = BOARD;
    const postMaterial = new THREE.MeshStandardMaterial({map: planks, color: '#8f7a5a', roughness: .9});
    const post = new THREE.Mesh(new THREE.BoxGeometry(.15, 2.85, .15), postMaterial);
    post.position.set(W.SIGN.x, W.JY + 1.3, W.SIGN.z);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(.125, .12, 4), postMaterial);
    cap.position.set(W.SIGN.x, W.JY + 2.78, W.SIGN.z); cap.rotation.y = Math.PI / 4;
    for (const mesh of [post, cap]) { mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh); }
    // A tin lantern on an iron arm above the boards, lit once the light goes.
    const iron = new THREE.MeshStandardMaterial({color: '#2b2722', roughness: .55, metalness: .6});
    const hang = new THREE.Vector3(W.SIGN.x + .25, W.JY + 2.6, W.SIGN.z + .06);
    const lamp = new THREE.Group();
    const add = (geometry, material, x, y, z) => { const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.castShadow = true; lamp.add(mesh); return mesh; };
    add(new THREE.BoxGeometry(.2, .018, .018), iron, -.12, .135, 0);
    add(new THREE.CylinderGeometry(.004, .004, .045, 4), iron, 0, .1, 0);
    add(new THREE.BoxGeometry(.095, .012, .095), iron, 0, -.072, 0);
    add(new THREE.ConeGeometry(.07, .05, 4), iron, 0, .085, 0).rotation.y = Math.PI / 4;
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) add(new THREE.BoxGeometry(.01, .13, .01), iron, x * .041, 0, z * .041);
    add(new THREE.BoxGeometry(.078, .124, .078), lanternGlass, 0, 0, 0).castShadow = false;
    lamp.position.copy(hang);
    scene.add(lamp);
    lantern.position.copy(hang).add(new THREE.Vector3(0, -.01, .02));
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

  // ---- Wayside exhibits. Three low panels beside the trail, painted from the
  // site itself: the newest field note, one of the photographs (a different
  // one each visit), and the newest project. Each has a real link that hangs
  // over it as the walker comes up the trail.
  const PHOTOS = [['glacier', 'Glacier National Park, Montana'], ['glacier_2', 'Glacier National Park, Montana'], ['grand_tetons', 'Grand Teton National Park, Wyoming'],
    ['colchuck', 'Colchuck Lake, Washington'], ['post_falls_idaho', 'Post Falls, Idaho'], ['yeallowstone_1', 'Yellowstone National Park'], ['yellowstone_2', 'Yellowstone National Park'],
    ['Sedona_az_1', 'Sedona, Arizona'], ['sedona_az_2', 'Sedona, Arizona'], ['netherlands', 'Netherlands countryside'], ['rotterdam', 'Rotterdam, Netherlands']];
  const SKETCHES = [[/gain train/i, 'train'], [/momento/i, 'momento'], [/firevin/i, 'firevin'], [/dynamics/i, 'dynamics'], [/investments/i, 'coffee'], [/magic circles/i, 'circles'], [/episodic/i, 'mountain']];
  const sketchFor = (title, fallback) => `assets/sketch-${(SKETCHES.find(([pattern]) => pattern.test(title)) || [0, fallback])[1]}.svg`;
  const PANEL = {w: 1.04, h: .68, tilt: -.42, top: 1.02};
  const waysides = W.WAYSIDES.map((spot, i) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 670;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(maxAniso, 16);
    const group = new THREE.Group();
    group.position.set(spot.x, spot.y, spot.z);
    group.rotation.y = spot.turn;
    const wood = new THREE.MeshStandardMaterial({map: planks, color: '#6f5a40', roughness: .9});
    for (const x of [-.44, .44]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(.09, PANEL.top + .1, .09), wood);
      post.position.set(x, (PANEL.top + .1) / 2 - .1, -.05);
      post.castShadow = post.receiveShadow = true;
      group.add(post);
    }
    // The panel hinges back from its top edge so its face looks up at the walker.
    const hinge = new THREE.Group();
    hinge.position.set(0, PANEL.top, 0);
    hinge.rotation.x = PANEL.tilt;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(PANEL.w + .08, PANEL.h + .08, .05), new THREE.MeshStandardMaterial({color: '#3d3024', roughness: .8}));
    frame.position.set(0, -PANEL.h / 2 - .02, -.03);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(PANEL.w, PANEL.h), new THREE.MeshStandardMaterial({map: texture, roughness: .55}));
    face.position.set(0, -PANEL.h / 2 - .02, .0);
    frame.castShadow = frame.receiveShadow = face.receiveShadow = true;
    hinge.add(frame, face);
    group.add(hinge);
    scene.add(group);
    return {spot, canvas, texture, group, anchor: new THREE.Vector3(spot.x, spot.y + PANEL.top + .34, spot.z), link: null, stop: ['01', '02', '03'][i]};
  });
  function wrapText(g, text, width, lines) {
    const words = String(text).split(/\s+/), out = [];
    let line = '';
    for (const word of words) {
      const next = line ? line + ' ' + word : word;
      if (g.measureText(next).width > width && line) { out.push(line); line = word; } else line = next;
    }
    if (line) out.push(line);
    if (out.length > lines) { out.length = lines; out[lines - 1] = out[lines - 1].replace(/[,.;:]?\s*\S*$/, '') + '…'; }
    return out;
  }
  const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif', SANS = '"Avenir Next", Avenir, "Segoe UI", Helvetica, Arial, sans-serif';
  function paintWayside(item, {kind, title, lines = [], when = '', image = null, photo = false, foot}) {
    const g = item.canvas.getContext('2d'), w = item.canvas.width, h = item.canvas.height;
    // Porcelain-enamel stock: warm cream with a little mottling, like a park sign that has seen weather.
    g.fillStyle = '#eee4cc'; g.fillRect(0, 0, w, h);
    // Its own random numbers, so the panels never shift the rest of the forest's.
    const m = W.random(77 + waysides.indexOf(item)), M = (a, b) => a + (b - a) * m();
    for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(${m() < .5 ? '120,96,60' : '255,250,235'},${M(.02, .06)})`; g.fillRect(M(0, w), M(0, h), M(2, 9), M(2, 9)); }
    g.fillStyle = '#3b2f23'; g.fillRect(0, 0, w, 86);
    g.fillStyle = '#efdcae'; g.font = `600 30px ${SANS}`; g.textBaseline = 'middle';
    g.fillText(kind.toUpperCase().split('').join(String.fromCharCode(8202)), 40, 45);
    g.textAlign = 'right'; g.fillStyle = 'rgba(239,220,174,.75)'; g.font = `500 24px ${SANS}`;
    g.fillText(`TRAIL STOP ${item.stop}`, w - 40, 45);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    if (photo && image) {
      const top = 108, bottom = h - 92, ratio = image.width / image.height, boxW = w - 80, boxH = bottom - top;
      let dw = boxW, dh = dw / ratio;
      if (dh < boxH) { dh = boxH; dw = dh * ratio; }
      g.save(); g.beginPath(); g.rect(40, top, boxW, boxH); g.clip();
      g.drawImage(image, 40 + (boxW - dw) / 2, top + (boxH - dh) / 2, dw, dh);
      g.restore();
      g.strokeStyle = '#3b2f23'; g.lineWidth = 3; g.strokeRect(40, top, boxW, boxH);
      g.fillStyle = '#26342e'; g.font = `400 40px ${SERIF}`; g.fillText(title, 40, h - 36);
    } else {
      const textWidth = image ? 560 : w - 80;
      g.fillStyle = '#26342e'; g.font = `400 62px ${SERIF}`;
      const head = wrapText(g, title, textWidth, 3);
      head.forEach((line, k) => g.fillText(line, 40, 170 + k * 68));
      let y = 170 + head.length * 68 + 6;
      if (when) { g.fillStyle = '#9a5a2e'; g.font = `600 22px ${SANS}`; g.fillText(when.toUpperCase(), 42, y); y += 46; }
      g.fillStyle = '#3e4943'; g.font = `400 29px ${SANS}`;
      wrapText(g, lines.join(' '), textWidth, Math.max(1, Math.floor((h - 110 - y) / 40))).forEach((line, k) => g.fillText(line, 42, y + k * 40));
      if (image) {
        const size = 330, x = w - size - 50, top = 130;
        g.fillStyle = 'rgba(255,252,242,.7)'; g.beginPath(); g.arc(x + size / 2, top + size / 2, size / 2 + 12, 0, 6.283); g.fill();
        g.drawImage(image, x, top + (size - size * image.height / image.width) / 2, size, size * image.height / image.width);
      }
    }
    g.fillStyle = '#3b2f23'; g.fillRect(40, h - 20, w - 80, 3);
    if (foot && !photo) { g.fillStyle = '#677069'; g.font = `600 21px ${SANS}`; g.fillText(foot.toUpperCase(), 42, h - 40); }
    item.texture.needsUpdate = true;
  }
  // The links that hang over the panels, created once the site's data is in.
  const waysideNav = $('.woods-waysides');
  function hangLink(item, {href, kind, title, go}) {
    const link = document.createElement('a'), label = document.createElement('span'), name = document.createElement('strong'), cue = document.createElement('span');
    link.className = 'woods-wayside';
    link.href = href;
    link.tabIndex = -1;
    label.className = 'woods-wayside-kind'; label.textContent = kind;
    name.textContent = title;
    cue.className = 'woods-wayside-go'; cue.textContent = go + ' →';
    link.append(label, name, cue);
    link.style.visibility = 'hidden';
    waysideNav.append(link);
    item.link = link;
  }
  const loadImage = src => new Promise(resolve => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => resolve(null); image.src = src; });
  const latest = list => list.filter(x => x.date).sort((a, b) => b.date.localeCompare(a.date))[0];
  const month = date => new Date(date + 'T12:00:00').toLocaleDateString('en-US', {month: 'long', year: 'numeric'});
  waysides.forEach((item, i) => paintWayside(item, {kind: ['Field note', 'The scenic route', 'Lately building'][i], title: '', foot: ''}));
  (async () => {
    const [posts, projects] = await Promise.all(['posts/posts.json', 'projects/projects.json'].map(url => fetch(url).then(r => r.ok ? r.json() : []).catch(() => [])));
    const note = latest(posts), project = latest(projects.filter(p => p.path && !/^https?:/.test(p.path))) || latest(projects);
    const [shot, caption] = PHOTOS[Math.floor(Math.random() * PHOTOS.length)];
    const [noteSketch, photo, projectSketch] = await Promise.all([note && loadImage(sketchFor(note.title, 'notebook')), loadImage(`assets/photos/trail/${shot}.webp`), project && loadImage(sketchFor(project.title, 'mountain'))]);
    if (note) {
      paintWayside(waysides[0], {kind: 'Field note', title: note.title, when: month(note.date), lines: [note.summary], image: noteSketch, foot: 'More field notes at the signpost'});
      hangLink(waysides[0], {href: note.path, kind: 'Field note', title: note.title, go: 'Read the note'});
    }
    paintWayside(waysides[1], {kind: 'The scenic route', title: caption, image: photo, photo: true});
    hangLink(waysides[1], {href: 'photography.html', kind: 'Photograph', title: caption, go: 'See the photographs'});
    if (project) {
      paintWayside(waysides[2], {kind: 'Lately building', title: project.title, when: project.kind, lines: [project.summary], image: projectSketch, foot: 'Every project is down the left fork'});
      hangLink(waysides[2], {href: project.path, kind: 'Lately building', title: project.title, go: 'See the project'});
    }
    wake();
  })();

  // ---- Far away: the valley and the range, and the sky over them, in their own pass.
  const vista = WoodsVista.build(THREE, renderer, {W, air, shared, low: LOW});
  const skyDome = WoodsRender.skyDome(THREE, air, shared);
  const starfield = WoodsRender.stars(THREE, air, WoodsSky.STARS, {clock: shared.woodsClock, count: LOW ? 1600 : 2600, pixelRatio: Math.min(devicePixelRatio || 1, 2)});
  far.add(skyDome, vista.group, starfield);
  // Light from the forest itself: sky through the gaps, crowns all round, litter
  // below. It is rebuilt whenever the hour changes.
  const forestLight = scale => WoodsRender.environment(THREE, renderer, air, shared, {gapLow: .1, gapHigh: .72, crowns: [.016, .024, .013], crownSun: .006, floor: [.04, .032, .022]}, scale);
  scene.environmentIntensity = 1;
  const darkroom = WoodsRender.darkroom(THREE, renderer, {samples: Q.samples, levels: Q.bloom, look: {exposure: 1.15, bloom: .045, vignette: .24, aberration: .0016, grain: .016, saturation: 1.2, contrast: 1.1}});

  // ---- Shafts of low sun slanting through the trunks.
  const shaftUniforms = {uSunDir: {value: SUN}, uColor: {value: new THREE.Color('#ffdcaa')}, uStrength: {value: .11}};
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
      uniforms: shaftUniforms,
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
  const moteUniforms = {uCenter: {value: new THREE.Vector3()}, uTime: {value: 0}, uSunDir: {value: SUN}, uMap: {value: moteSprite}, uScale: {value: 400},
    uStrength: {value: 1}, uLamp: {value: 0}, uForward: {value: new THREE.Vector3(0, 0, -1)}};
  const motes = new THREE.Points((() => {
    const g = new THREE.BufferGeometry(), p = new Float32Array(Q.motes * 3);
    for (let i = 0; i < p.length; i++) p[i] = rnd();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    return g;
  })(), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: moteUniforms,
    vertexShader: `uniform vec3 uCenter, uSunDir, uForward; uniform float uTime, uScale, uStrength, uLamp; varying float vAlpha;
      void main() {
        vec3 box = vec3(28.0, 7.0, 28.0);
        vec3 p = position * box + vec3(sin(uTime * .13 + position.y * 40.0) * .8, uTime * .06 + sin(uTime * .21 + position.x * 30.0) * .4, cos(uTime * .11 + position.z * 30.0) * .8);
        p = uCenter + mod(p - uCenter + box * .5, box) - box * .5;
        p.y = uCenter.y - 1.2 + mod(p.y - uCenter.y + 1.2, box.y);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        vec3 offset = p - uCenter;
        float edge = 1.0 - smoothstep(.34, .5, max(abs(offset.x), abs(offset.z)) / box.x);
        float lit = pow(max(dot(normalize(p - cameraPosition), uSunDir), 0.0), 3.0);
        // By night, only the dust in the beam of the headlamp shows.
        vec3 toward = p - cameraPosition;
        float beam = smoothstep(.86, .97, dot(normalize(toward), uForward)) * (1.0 - smoothstep(3.0, 14.0, length(toward))) * uLamp;
        vAlpha = edge * smoothstep(1.5, 4.0, -mv.z) * ((.03 + lit * .45) * uStrength + beam * .5) * (.5 + .5 * sin(uTime * .8 + position.z * 60.0));
        gl_PointSize = min(5.0, uScale * .018 / -mv.z);
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
  const leafUniforms = {uCenter: {value: new THREE.Vector3()}, uTime: {value: 0}, uAmount: {value: 0}, uWind: shared.uWindDir, uSunDir: {value: SUN}, uLight: {value: 1}};
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
      fragmentShader: `uniform float uLight; varying vec2 vCorner; varying float vShade, vKeep;
        void main() {
          if (vKeep < .5 || dot(vCorner, vCorner) > 1.0) discard;
          gl_FragColor = vec4(vec3(1.0, .72, .22) * vShade * 1.1 * uLight, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  })();

  // ---- A pair of ravens working the updraft off the rim, by day. They circle
  // out over the valley, banking into the turn, and now and then beat their
  // wings a few times before settling back into a glide.
  const ravens = (() => {
    const black = new THREE.MeshStandardMaterial({color: '#0c0c0e', roughness: .5, metalness: .15, side: THREE.DoubleSide});
    const panel = (points) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
      g.setIndex(points.length === 4 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2]);
      g.computeVertexNormals();
      return g;
    };
    const flock = [0, 1].map(k => {
      const bird = new THREE.Group(), wings = [];
      const body = new THREE.Mesh(new THREE.SphereGeometry(.1, 8, 6), black);
      body.scale.set(.85, .75, 3.1);
      const head = new THREE.Mesh(new THREE.SphereGeometry(.065, 8, 6), black);
      head.position.set(0, .02, -.34);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(.026, .11, 5).rotateX(-Math.PI / 2), black);
      beak.position.set(0, .01, -.43);
      // The raven's wedge of a tail, longest in the middle.
      const tail = new THREE.Mesh(panel([[-.05, 0, .25], [.05, 0, .25], [.13, 0, .5], [-.13, 0, .5]]), black);
      const tip = new THREE.Mesh(panel([[-.13, 0, .5], [.13, 0, .5], [0, 0, .58]]), black);
      bird.add(body, head, beak, tail, tip);
      for (const side of [-1, 1]) {
        const shoulder = new THREE.Group(), hand = new THREE.Group();
        shoulder.position.set(side * .06, .02, -.06);
        shoulder.add(new THREE.Mesh(panel([[0, 0, -.12], [side * .42, 0, -.1], [side * .42, 0, .15], [0, 0, .16]]), black));
        hand.position.set(side * .42, 0, 0);
        // Fingered primaries at the tip.
        hand.add(new THREE.Mesh(panel([[0, 0, -.1], [side * .3, 0, -.05], [side * .36, 0, .06], [0, 0, .15]]), black));
        for (let f = 0; f < 4; f++) hand.add(new THREE.Mesh(panel([[side * .28, 0, -.06 + f * .03], [side * (.42 + f * .01), 0, -.04 + f * .035], [side * .3, 0, -.03 + f * .035]]), black));
        shoulder.add(hand);
        bird.add(shoulder);
        wings.push({shoulder, hand, side});
      }
      bird.scale.setScalar(1.45);
      bird.userData = {wings, phase: k * 2.2, radius: 34 + k * 8, lift: 17 + k * 4, beat: 0, burst: 4 + k * 3};
      scene.add(bird);
      return bird;
    });
    const centre = new THREE.Vector3(W.J.x + 4, W.JY, W.J.z - 84), next = new THREE.Vector3();
    return {
      flock,
      set visible(on) { flock.forEach(bird => { bird.visible = on; }); },
      update(time, dt) {
        for (const bird of flock) {
          const u = bird.userData, place = t => next.set(centre.x + Math.cos(t * .11 + u.phase) * u.radius, centre.y + u.lift + 4 * Math.sin(t * .23 + u.phase * 3), centre.z + Math.sin(t * .11 + u.phase) * u.radius * .7);
          bird.position.copy(place(time));
          place(time + .5);
          bird.lookAt(next.x * 2 - bird.position.x, next.y * 2 - bird.position.y, next.z * 2 - bird.position.z);
          bird.rotateZ(-.32);
          // A few wingbeats every so often, then a long glide on raised wings.
          u.burst -= dt;
          if (u.burst < 0) { u.beat = 3.2 + Math.random() * 1.5; u.burst = 6 + Math.random() * 9; }
          u.beat = Math.max(0, u.beat - dt);
          const flap = u.beat > 0 ? Math.sin(time * 9 + u.phase) * W.smooth(0, .5, u.beat) : 0;
          for (const w of u.wings) {
            w.shoulder.rotation.z = w.side * (.14 + flap * .55);
            w.hand.rotation.z = w.side * (.06 + flap * .35);
          }
        }
      },
    };
  })();

  // ===================================================================
  // The hour. Everything that depends on where the light comes from is set
  // here, so the woods can be lit for any moment without being rebuilt.
  const shadowRight = new THREE.Vector3(), shadowUp = new THREE.Vector3();
  const luma = c => c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
  let environmentMap = null, openScale = 1;
  function applyLight(next) {
    hour = next;
    SUN.set(...next.key);
    shadowRight.crossVectors(UP, SUN).normalize(); shadowUp.crossVectors(SUN, shadowRight);
    const U = air.uniforms, k = next.keyLight, power = Math.max(...k), after = 1 - W.smooth(-1, 3, next.elevation);
    U.W_SUN_LIGHT.value = k.slice();
    U.W_SKY_LIGHT.value = next.sky.slice();
    U.W_HAZE_LIGHT.value = next.haze.slice();
    U.W_GLOW_DIR.value = next.sun.slice();
    U.W_GLOW.value = next.glow.slice();
    U.W_AFTER.value = next.glow.map(v => v * after);
    U.W_HALO.value = next.keyIsMoon ? 1 : 0;
    U.W_STARS.value = next.stars;
    U.W_MOON.value = next.moon.slice();
    U.W_MOON_LIGHT.value = [1, .97, .92].map(v => v * W.mix(.9, 3.2, next.night) * next.moonUp);
    U.W_HEAVENS.value = next.frame.slice();
    sun.color.setRGB(...(power > 0 ? k.map(v => v / power) : [1, 1, 1]));
    sun.intensity = power;
    shared.uSunColor.value.setRGB(...k.map(v => v / Math.PI));
    glint.value.setRGB(...k.map(v => v / 10.5));
    const tint = power > 0 ? k.map(v => v / power) : [1, 1, 1];
    shaftUniforms.uColor.value.setRGB(1, Math.sqrt(tint[1]), Math.pow(tint[2], .6));
    shaftUniforms.uStrength.value = next.shafts;
    moteUniforms.uStrength.value = next.motes;
    moteUniforms.uLamp.value = next.lamp * next.night;
    leafUniforms.uLight.value = W.clamp(luma(k) / 6.31 * .8 + luma(next.sky) / 1.45 * .2, 0, 1.4);
    const look = darkroom.look;
    look.uExposure.value = next.look.exposure;
    look.uSaturation.value = next.look.saturation;
    look.uContrast.value = next.look.contrast;
    look.uTint.value.set(...next.look.tint);
    lantern.intensity = next.lamp * .9;
    // Lamps in the scene only when they are lit: returns whether that changed.
    const lamps = next.lamp > 0, changed = lamps !== (lantern.parent === scene);
    if (changed && lamps) scene.add(headlamp, headlamp.target, lantern);
    else if (changed) scene.remove(headlamp, headlamp.target, lantern);
    lanternGlass.emissiveIntensity = next.lamp * 9;
    openScale = next.env;
    const previous = environmentMap;
    environmentMap = scene.environment = forestLight(next.env);
    if (previous) previous.dispose();
    root.dataset.light = next.night > .5 ? 'night' : next.elevation < 4 ? 'twilight' : 'day';
    WoodsSound.setHour(next.night, next.month);
    ravens.visible = next.elevation > -3;
    starfield.visible = next.stars > 0;
    return changed;
  }

  // ===================================================================
  // The walk. Scroll is the only thing that moves the walker forward.
  let width = 1, height = 1, aspect = 1, framing = W.arrival(1), start = 0, distance = 1;
  let walking = false, still = false, d = 0, velocity = 0, speed = 0, stride = 0, first = true, windOn = true, windClock = 0, arrived = null, stop = '';
  let dragYaw = 0, dragPitch = 0, lookYaw = 0, lookPitch = 0, hoverX = 0, hoverY = 0, turning = 0, dragging = null, looked = false, clock = 0, heading = null, lean = 0;
  let push = 0, held = 0, pushSpeed = 0, carry = 0, lens = 56;
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

  const focus = new THREE.Vector3(), forward = new THREE.Vector3(), meteor = {wait: 12, length: .7};
  function update(dt) {
    // ↑ and ↓ walk on and back by scrolling, so scroll stays the one source of the walk.
    held = push ? held + dt : 0;
    const goal = push * (held < 1.4 ? 2.8 : W.mix(2.8, 10.5, W.smooth(1.4, 4.4, held)));
    pushSpeed += (goal - pushSpeed) * (1 - Math.exp(-dt / (push ? .45 : .22)));
    if (walking && Math.abs(pushSpeed) > .02) {
      carry += pushSpeed * dt * distance / framing.d;
      const whole = Math.trunc(carry);
      if (whole) { scrollTo({top: scrollY + whole, behavior: 'instant'}); carry -= whole; }
    } else { pushSpeed = push ? pushSpeed : 0; carry = 0; }

    const p = progress(), target = W.mix(0, framing.d, p);
    if (first) { d = target; velocity = 0; first = false; }
    // A critically damped follow: the walker picks up and sheds pace smoothly
    // however the page is scrolled, so the gait below reads true speeds.
    const spring = 5.2, e = Math.exp(-spring * dt), offset = d - target, carryOn = (velocity + spring * offset) * dt;
    d = target + (offset + carryOn) * e;
    velocity = (velocity - spring * carryOn) * e;
    if (Math.abs(target - d) < 1e-4 && Math.abs(velocity) < 1e-3) { d = target; velocity = 0; }
    speed += (Math.abs(velocity) - speed) * (1 - Math.exp(-dt / .3));
    clock += dt;

    // Gait: a walk, a bounding run, then a glide once the walker is flung faster
    // than feet could carry them. Cadence barely rises; the stride lengthens.
    const pose = W.pose(d, aspect), gait = W.stride(still ? 0 : speed);
    stride += gait.cadence * dt * W.smooth(0, .8, speed);
    const body = W.bob(stride, gait), moving = gait.walk + gait.run;
    const glide = gait.float * .05 * Math.sin(clock * .8), bank = gait.float * .014 * Math.sin(clock * .53 + 1);
    const dip = body.y + body.lift + glide, lateral = body.x;
    const breathe = still ? 0 : .0035 * Math.sin(clock * 1.6) * (1 - moving) * (1 - gait.float);

    // Looking around: drag and arrow keys add to the heading, a walk eases it back.
    dragYaw += turning * 1.5 * dt;
    const settle = Math.exp(-dt * 1.1 * W.smooth(.5, 2, speed));
    dragYaw *= settle; dragPitch *= settle;
    dragYaw = W.clamp(dragYaw, -2.4, 2.4); dragPitch = W.clamp(dragPitch, -.55, .5);
    const follow = 1 - Math.exp(-dt / .16);
    lookYaw += (dragYaw - hoverX * .07 - lookYaw) * follow;
    lookPitch += (dragPitch - hoverY * .045 - lookPitch) * follow;

    // Lean a little into the bends, as anyone walking a curving path does; a
    // glide banks through them like a bird.
    if (heading !== null && dt) {
      let turn = pose.yaw - heading;
      if (turn > Math.PI) turn -= 2 * Math.PI; else if (turn < -Math.PI) turn += 2 * Math.PI;
      const into = W.clamp(turn / dt * .05, -.025, .025) * (moving + gait.float * 2.2);
      lean += (into - lean) * (1 - Math.exp(-dt / .5));
    }
    heading = pose.yaw;
    const cosY = Math.cos(pose.yaw), sinY = Math.sin(pose.yaw), surge = body.surge;
    camera.position.set(pose.x + cosY * lateral - sinY * surge, pose.y + dip, pose.z - sinY * lateral - cosY * surge);
    camera.rotation.set(pose.pitch + lookPitch + breathe + body.pitch + gait.float * .045, pose.yaw + lookYaw, body.roll + lean + bank);
    // A run widens the view a touch and a glide more, as speed does to the eye.
    const wide = W.lens(aspect) + gait.run * 3 + gait.float * 7;
    if (Math.abs(wide - lens) > .01) { lens = wide; camera.fov = farCamera.fov = lens; camera.updateProjectionMatrix(); farCamera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    farCamera.position.copy(camera.position);
    farCamera.quaternion.copy(camera.quaternion);
    skyDome.position.copy(camera.position);

    // Among the trunks the air holds a little haze; out in the open it clears.
    const open = Math.max(W.meadow(camera.position.x, camera.position.z), 1 - W.smooth(8, 26, Math.hypot(camera.position.x - W.J.x, camera.position.z - W.J.z)));
    scene.fog.near = vista.local.value = W.mix(.0019, .0002, open);
    vista.detail.value = W.mix(1, vista.full, W.smooth(framing.d - 70, framing.d - 30, d));
    openSky.intensity = W.mix(.15, .75, open) * openScale;
    // The headlamp rides a little below the eyes and looks where they do, dipped toward the tread.
    camera.getWorldDirection(forward);
    moteUniforms.uForward.value.copy(forward);
    headlamp.position.copy(camera.position).addScaledVector(UP, -.08);
    headlamp.target.position.copy(camera.position).addScaledVector(forward, 7).addScaledVector(UP, -2);
    // At the signpost the lantern does the work, so the beam is dipped.
    headlamp.intensity = hour.lamp * 18 * W.mix(1, .3, W.smooth(framing.d - 14, framing.d, d));

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
    shared.uTime.value = shared.woodsClock.value = windClock;
    moteUniforms.uCenter.value.copy(camera.position);
    motes.visible = leaves.visible = !still;
    if (ambient) leafUniforms.uTime.value += dt * shared.uWindAmp.value;
    if (ambient) ravens.update(windClock, dt * shared.uWindAmp.value);
    // Under a dark sky, a shooting star every minute or so, somewhere ahead.
    const M = air.uniforms;
    if (M.W_METEOR_T.value >= 0) { M.W_METEOR_T.value += dt / meteor.length; if (M.W_METEOR_T.value >= 1) M.W_METEOR_T.value = -1; }
    else if (ambient && hour.stars > .5 && (meteor.wait -= dt) < 0) {
      meteor.wait = 25 + Math.random() * 60; meteor.length = .5 + Math.random() * .5;
      const az = pose.yaw + lookYaw + (Math.random() - .5) * 1.4, el = .45 + Math.random() * .5, turn = (Math.random() - .5) * 2.4, reach = .2 + Math.random() * .15;
      const at = (a, e) => [-Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
      M.W_METEOR_A.value = at(az, el);
      M.W_METEOR_B.value = at(az + Math.sin(turn) * reach, el - Math.abs(Math.cos(turn)) * reach);
      M.W_METEOR_T.value = 0;
    }
    leafUniforms.uCenter.value.copy(camera.position);
    leafUniforms.uAmount.value += ((aspenNear(camera.position.x, camera.position.z) * .9 + .05) * SEASON.fall - leafUniforms.uAmount.value) * (1 - Math.exp(-dt / 2));
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
    const busy = Math.abs(target - d) > 1e-3 || speed > .02 || Math.abs(dragYaw - hoverX * .07 - lookYaw) > 1e-4 || Math.abs(dragPitch - hoverY * .045 - lookPitch) > 1e-4 || turning || push || pushSpeed;
    return busy || glowing || journey || (ambient && !still) || moving > .01;
  }

  const corner = new THREE.Vector3(), ahead = new THREE.Vector3();
  // The wayside links hang over their panels while the walker is near enough
  // to read them, and fade as the panel is passed.
  function placeWaysides() {
    for (const item of waysides) {
      const link = item.link;
      if (!link) continue;
      const far = camera.position.distanceTo(item.anchor);
      corner.copy(item.anchor).project(camera);
      const facing = ahead.copy(item.anchor).sub(camera.position).dot(forward) > 0;
      const x = (corner.x * .5 + .5) * width, y = (.5 - corner.y * .5) * height;
      const inside = facing && corner.z < 1 && x > 4 && x < width - 4 && y > 70 && y < height - 60;
      const opacity = inside && !still ? W.smooth(17, 12, far) * W.smooth(2.4, 4.2, far) : 0;
      show(link, opacity);
      link.tabIndex = opacity > .5 ? 0 : -1;
      if (opacity > 0) {
        // Near the edge of the screen the tag stays on it, and its stem leans to the panel.
        const half = (link.offsetWidth || 200) / 2, left = W.clamp(x, half + 12, width - half - 12);
        link.style.transform = `translate(${left.toFixed(1)}px, ${y.toFixed(1)}px)`;
        link.style.setProperty('--stem', `${(x - left).toFixed(1)}px`);
      }
    }
  }
  function placeLinks() {
    placeWaysides();
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
    draw();
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
  // The solid woods first, each pixel they cover marked in the stencil. The
  // far country is drawn only through the gaps that are left, with its own near
  // and far planes, so neither pass loses depth precision and nothing hidden
  // behind a trunk is shaded. The gaps are then emptied of depth again, and the
  // haze, light and water of the woods go over everything.
  const LAYER_AIR = 1;
  const resetScene = new THREE.Scene(), resetCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const reset = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 1.0, 1.0); }', fragmentShader: 'void main() { gl_FragColor = vec4(0.0); }',
    colorWrite: false, depthWrite: true, depthFunc: THREE.AlwaysDepth, stencilWrite: true, stencilFunc: THREE.EqualStencilFunc, stencilRef: 0,
  }));
  reset.frustumCulled = false;
  resetScene.add(reset);
  scene.traverse(object => {
    if (!object.material) return;
    const materials = [].concat(object.material);
    if (materials.some(m => m.transparent || m.blending !== THREE.NormalBlending)) { object.layers.set(LAYER_AIR); return; }
    for (const m of materials) Object.assign(m, {stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp});
  });
  far.traverse(object => {
    if (object.material) for (const m of [].concat(object.material)) Object.assign(m, {stencilWrite: true, stencilRef: 0, stencilFunc: THREE.EqualStencilFunc});
  });
  // Every material breathes the same air, so the hour reaches all of them.
  for (const group of [scene, far]) group.traverse(object => { if (object.material) for (const m of [].concat(object.material)) air.share(m); });
  sun.layers.enableAll(); openSky.layers.enableAll(); headlamp.layers.enableAll(); lantern.layers.enableAll();
  renderer.shadowMap.autoUpdate = false;
  function draw() {
    darkroom.render(() => {
      renderer.shadowMap.needsUpdate = true;
      camera.layers.set(0);
      renderer.render(scene, camera);
      renderer.render(far, farCamera);
      renderer.render(resetScene, resetCamera);
      camera.layers.set(LAYER_AIR);
      renderer.render(scene, camera);
      camera.layers.set(0);
    });
  }
  function resize() {
    width = stage.clientWidth; height = stage.clientHeight; aspect = width / height;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    darkroom.setSize(Math.round(width * pixelRatio), Math.round(height * pixelRatio));
    camera.aspect = farCamera.aspect = aspect;
    camera.fov = farCamera.fov = lens = W.lens(aspect);
    camera.updateProjectionMatrix();
    farCamera.updateProjectionMatrix();
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
    if (event.target.closest('a, button, .woods-hours') || !event.isPrimary) return;
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
  // ← → look around. ↑ walks on down the trail and ↓ walks back the way you
  // came — the reverse of what the page would scroll — and holding either
  // long enough breaks into a run.
  addEventListener('keydown', event => {
    if (typing() || event.metaKey || event.ctrlKey || event.altKey || event.target.closest?.('.woods-hours, .woods-print')) return;
    if (event.key === 'ArrowLeft') { turning = 1; looked = true; wake(); }
    if (event.key === 'ArrowRight') { turning = -1; looked = true; wake(); }
    if (walking && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      const way = event.key === 'ArrowUp' ? 1 : -1;
      if (push !== way) { push = way; held = 0; }
      cancelJourney();
      wake();
    }
  });
  addEventListener('keyup', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') turning = 0;
    if ((event.key === 'ArrowUp' && push === 1) || (event.key === 'ArrowDown' && push === -1)) push = 0;
  });
  addEventListener('blur', () => { turning = 0; push = 0; release(); });

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

  // ---- The hour: Arizona's light right now, or a moment of today picked from
  // the clock. A change of light is a crossfade from the frame as it was.
  const clockButton = $('.woods-clock'), hoursPanel = $('.woods-hours'), hoursList = $('.woods-hours-list'), localTime = $('.woods-local');
  const veil = document.createElement('canvas');
  veil.className = 'woods-veil';
  veil.setAttribute('aria-hidden', 'true');
  canvas.after(veil);
  let choice = hour.name;
  function describe() {
    const time = choice === 'now' ? WoodsSky.clock(new Date()).text : hour.time;
    clockButton.querySelector('.woods-toggle-label').textContent = hour.phase;
    clockButton.querySelector('.woods-clock-time').textContent = time;
    clockButton.dataset.phase = hour.night > .5 ? 'night' : hour.elevation < 4 ? 'twilight' : 'day';
    clockButton.setAttribute('aria-label', `Light: ${hour.phase}, ${time} in Arizona. Choose another hour`);
    localTime.textContent = choice === 'now' ? ` · ${time}` : ` · ${hour.phase.toLowerCase()}`;
  }
  function fillHours() {
    const today = WoodsSky.moments(new Date());
    hoursList.replaceChildren(...Object.entries(WoodsSky.NAMES).map(([key, label]) => {
      const button = document.createElement('button'), name = document.createElement('span'), time = document.createElement('span');
      button.type = 'button';
      button.dataset.light = key;
      button.setAttribute('aria-pressed', String(key === choice));
      name.textContent = label;
      time.className = 'woods-hours-time';
      time.textContent = WoodsSky.clock(key === 'now' ? new Date() : today[key]).text;
      button.append(name, time);
      return button;
    }));
  }
  function showHours(open) {
    if (open) fillHours();
    hoursPanel.hidden = !open;
    clockButton.setAttribute('aria-expanded', String(open));
    if (open) (hoursList.querySelector('[aria-pressed="true"]') || hoursList.firstElementChild).focus();
  }
  let relighting = Promise.resolve();
  function setLight(name, {slow = false} = {}) {
    choice = name;
    try { name === 'now' ? sessionStorage.removeItem('woods:light') : sessionStorage.setItem('woods:light', name); } catch { /* private mode */ }
    relighting = relighting.then(async () => {
      // Hold the frame as it was while the light changes underneath it.
      if (ready) {
        draw();
        veil.width = canvas.width; veil.height = canvas.height;
        veil.getContext('2d').drawImage(canvas, 0, 0);
        veil.style.transition = 'none';
        veil.style.opacity = '1';
        void veil.offsetWidth;
      }
      const relit = applyLight(WoodsSky.at(name));
      describe();
      await vista.relight();
      // Lamps lit or put out change the shaders: compile them while the veil holds the old frame.
      if (relit && renderer.compileAsync) await renderer.compileAsync(scene, camera);
      if (!ready) return;
      last = 0;
      frame(performance.now());
      veil.style.transition = `opacity ${slow ? 4 : 1.3}s ease`;
      veil.style.opacity = '0';
    }).catch(error => { veil.style.opacity = '0'; console.warn('The light could not be changed.', error); });
    return relighting;
  }
  clockButton.hidden = false;
  describe();
  clockButton.addEventListener('click', () => showHours(hoursPanel.hidden));
  hoursList.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    showHours(false);
    clockButton.focus();
    setLight(button.dataset.light);
  });
  hoursPanel.addEventListener('keydown', event => {
    const items = [...hoursList.children], i = items.indexOf(document.activeElement);
    if (event.key === 'Escape') { showHours(false); clockButton.focus(); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); items[(i + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus(); }
  });
  document.addEventListener('pointerdown', event => { if (!hoursPanel.hidden && !event.target.closest('.woods-hour')) showHours(false); });
  // Left on now, the woods keep Arizona's time: the clock ticks and the light
  // follows the sun. Deep in the night nothing changes but the turning sky and
  // the moon, so then a quarter of an hour goes by between changes.
  let relitAt = Date.now();
  setInterval(() => {
    if (choice !== 'now' || document.hidden) return;
    const next = WoodsSky.at('now'), moved = Math.abs(next.elevation - hour.elevation) > 1.5 && Math.max(next.elevation, hour.elevation) > -19;
    if (moved || next.phase !== hour.phase || Date.now() - relitAt > 900000) { relitAt = Date.now(); setLight('now', {slow: true}); }
    else describe();
  }, 60000);

  // ---- The camera. A frame of the woods, printed with a border and a caption,
  // to keep or share, and a link that brings anyone back to the same spot,
  // looking the same way, in the same light.
  const cameraButton = $('.woods-camera'), flash = $('.woods-flash'), print = $('.woods-print');
  const printImage = $('.woods-print-image'), saveLink = $('.woods-print-save'), shareButton = $('.woods-print-share'), linkButton = $('.woods-print-link'), printStatus = $('.woods-print-status');
  let printBlob = null, printUrl = '';
  const arizonaStamp = date => new Date(date.getTime() - 7 * 3600000).toISOString().slice(0, 16);
  function spotLink() {
    const url = new URL(location.pathname, location.href);
    if (!still) url.searchParams.set('at', progress().toFixed(3));
    // A head barely turned (the mouse resting off-centre) is just looking ahead.
    const yaw = Math.round(lookYaw / W.DEG), pitch = Math.round(lookPitch / W.DEG);
    if (Math.abs(yaw) > 2 || Math.abs(pitch) > 2) url.searchParams.set('look', `${yaw},${pitch}`);
    url.searchParams.set('light', arizonaStamp(hour.date));
    return url.href;
  }
  function develop() {
    // Read the frame straight after drawing it, before the page composites it away.
    draw();
    const shot = document.createElement('canvas'), w = canvas.width, h = canvas.height;
    // Crop to a print's proportions: 3:2 across, or 4:5 on a tall screen.
    const ratio = w >= h ? 3 / 2 : 4 / 5, cw = Math.min(w, h * ratio), ch = cw / ratio;
    const scale = Math.min(1, 1800 / Math.max(cw, ch)), pw = Math.round(cw * scale), ph = Math.round(ch * scale);
    const border = Math.round(pw * .045), band = Math.round(pw * (ratio > 1 ? .11 : .16));
    shot.width = pw + border * 2; shot.height = ph + border + band;
    const g = shot.getContext('2d');
    g.fillStyle = '#f6f0e4'; g.fillRect(0, 0, shot.width, shot.height);
    g.drawImage(canvas, (w - cw) / 2, (h - ch) / 2, cw, ch, border, border, pw, ph);
    g.strokeStyle = 'rgba(38,52,46,.18)'; g.lineWidth = 2; g.strokeRect(border, border, pw, ph);
    const [, words] = stopFor(d), place = still ? 'The junction' : words.charAt(0) + words.slice(1).toLowerCase();
    const size = Math.round(band * .3), base = border + ph + band * .58;
    g.fillStyle = '#26342e'; g.font = `italic 400 ${size}px ${SERIF}`;
    g.fillText(`${place}, ${hour.time.replace(' ', '\u2009')}`, border, base);
    g.fillStyle = '#677069'; g.font = `600 ${Math.round(size * .5)}px ${SANS}`;
    g.fillText(`${hour.phase.toUpperCase()} · FLAGSTAFF, ARIZONA`, border, base + size * .85);
    g.textAlign = 'right'; g.fillStyle = '#b46635'; g.font = `400 ${Math.round(size * .78)}px ${SERIF}`;
    g.fillText('gabefen.com', border + pw, base);
    return shot;
  }
  cameraButton.hidden = false;
  cameraButton.addEventListener('click', () => {
    const shot = develop();
    WoodsSound.shutter();
    flash.classList.remove('is-firing'); void flash.offsetWidth; flash.classList.add('is-firing');
    shot.toBlob(blob => {
      if (!blob) return;
      printBlob = blob;
      if (printUrl) URL.revokeObjectURL(printUrl);
      printUrl = URL.createObjectURL(blob);
      printImage.src = printUrl;
      printImage.alt = `A photograph of the woods: ${stopFor(d)[1].toLowerCase()}, ${hour.phase.toLowerCase()}`;
      saveLink.href = printUrl;
      saveLink.download = `gabefen-woods-${stopFor(d)[1].toLowerCase().replace(/[^a-z]+/g, '-')}.jpg`;
      const file = new File([blob], saveLink.download, {type: 'image/jpeg'});
      shareButton.hidden = !(navigator.canShare && navigator.canShare({files: [file]}));
      printStatus.textContent = '';
      print.classList.remove('is-developing'); void print.offsetWidth; print.classList.add('is-developing');
      if (!print.open) print.showModal();
    }, 'image/jpeg', .9);
  });
  shareButton.addEventListener('click', async () => {
    try { await navigator.share({files: [new File([printBlob], saveLink.download, {type: 'image/jpeg'})], title: 'From the woods at gabefen.com', url: spotLink()}); } catch { /* cancelled */ }
  });
  linkButton.addEventListener('click', async () => {
    const link = spotLink();
    try { await navigator.clipboard.writeText(link); printStatus.textContent = 'Link copied. It opens right here, in this light.'; }
    catch { printStatus.textContent = link; }
  });
  $('.woods-print-close').addEventListener('click', () => print.close());
  print.addEventListener('click', event => { if (event.target === print) print.close(); });

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
    windButton.setAttribute('aria-pressed', String(!windOn));
    windButton.title = windOn ? 'Pause wind' : 'Resume wind';
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
    if (still) { cancelJourney(); push = 0; }
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

  // Leaving by a sign or a wayside remembers where the walker stood, so coming
  // back to the homepage in the same visit picks the walk up there instead of
  // starting again at the trailhead. Going back to the trailhead forgets it.
  const remember = value => { try { value === null ? sessionStorage.removeItem('woods:spot') : sessionStorage.setItem('woods:spot', value); } catch { /* private mode */ } };
  home.addEventListener('click', event => {
    if (event.target.closest('.woods-sign, .woods-wayside')) remember(still ? '1' : progress().toFixed(3));
    if (event.target.closest('.woods-return')) remember(null);
  });
  const resume = (() => { try { return parseFloat(sessionStorage.getItem('woods:spot')); } catch { return NaN; } })();

  configure();
  // ?at=0.4 opens the walk that far along the trail, for sharing a spot.
  const at = query.has('at') ? parseFloat(query.get('at')) : resume;
  if (walking && at >= 0 && at <= 1 && location.hash !== '#woods-junction') scrollTo({top: start + distance * at, behavior: 'instant'});
  // ?look=-40,12 turns the head that many degrees (left positive) and lifts it.
  const gaze = (query.get('look') || '').split(',').map(Number);
  if (gaze.length === 2 && gaze.every(Number.isFinite)) {
    lookYaw = dragYaw = W.clamp(gaze[0] * W.DEG, -2.4, 2.4);
    lookPitch = dragPitch = W.clamp(gaze[1] * W.DEG, -.55, .5);
    looked = true;
  }
  applyLight(hour);
  update(1 / 60);
  await vista.prepare();
  if (renderer.compileAsync) { await renderer.compileAsync(far, farCamera); await renderer.compileAsync(scene, camera); }
  ready = true;
  first = true;
  frame(performance.now());
  root.classList.remove('woods-failed');
  root.classList.add('woods-live');
  wake();
}
