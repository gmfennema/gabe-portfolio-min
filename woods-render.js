/* Light, air and film for the woods. One atmosphere colours the sky, hazes
   the forest and blues the far peaks, so near and far always agree. Each
   frame is then developed like a photograph: rendered in HDR, given a soft
   bloom, a filmic curve, a little lens falloff and grain.
   A classic script: woods.js hands it THREE so the page stays build-free. */
const WoodsRender = (() => {
  const g = x => {
    const s = Number(x).toPrecision(8);
    return /[.eE]/.test(s) ? s : s + '.0';
  };
  const v3 = a => `vec3(${g(a[0])}, ${g(a[1])}, ${g(a[2])})`;
  // The galactic pole and centre on the celestial sphere (RA 192.86°, Dec 27.13°; RA 266.41°, Dec −28.94°).
  const celestial = (ra, dec) => { const a = ra * Math.PI / 180, d = dec * Math.PI / 180; return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)]; };
  const GALAXY_POLE = celestial(192.85948, 27.12825), GALAXY_CENTRE = celestial(266.405, -28.936);

  // ---- The air. Distances in metres, heights in world y, radiance linear HDR.
  // Rayleigh scattering blues the far ranges, a thinner haze of dust and pollen
  // whitens them and glows around the sun, a mist settles in the valley, and
  // a local haze among the trunks gives the forest its depth.
  // The shape of the air is fixed; its light is not. Everything the hour
  // decides is a uniform, shared by every material that breathes this air, so
  // the woods can go from noon to starlight without compiling a shader.
  function atmosphere(c) {
    const vec = (a = [0, 0, 0]) => ({value: a.slice()});
    const uniforms = {
      W_SUN: vec(c.sun), W_SUN_LIGHT: vec(c.sunLight), W_SKY_LIGHT: vec(c.skyLight), W_HAZE_LIGHT: vec(c.hazeLight),
      W_GLOW_DIR: vec(c.sun), W_GLOW: vec(c.sunLight), W_HALO: {value: 0}, W_AFTER: vec(), W_COVER: {value: .5},
      W_STARS: {value: 0}, W_MOON: vec([0, -1, 0]), W_MOON_LIGHT: vec(), W_HEAVENS: {value: [1, 0, 0, 0, 1, 0, 0, 0, 1]},
      W_METEOR_A: vec([0, 1, 0]), W_METEOR_B: vec([1, 0, 0]), W_METEOR_T: {value: -1},
    };
    const glsl = `
      #ifndef WOODS_ATMOSPHERE
      #define WOODS_ATMOSPHERE
      const float W_PI = 3.14159265;
      const vec3 W_RAY_BETA = ${v3(c.rayBeta)};
      const float W_RAY_H = ${g(c.rayH)};
      const float W_HAZE_BETA = ${g(c.hazeBeta)};
      const float W_HAZE_H = ${g(c.hazeH)};
      const float W_MIST_BETA = ${g(c.mistBeta)};
      const float W_MIST_BASE = ${g(c.mistBase)};
      const float W_MIST_H = ${g(c.mistH)};
      const float W_MIE_G = ${g(c.mieG)};
      const float W_MIE_GAIN = ${g(c.mieGain)};
      const float W_CLOUD_BASE = ${g(c.cloudBase)};
      // The key light (the sun, or the moon at night), the sky and the haze it
      // lights, and the glow round the real sun, which lingers after it sets.
      uniform vec3 W_SUN, W_SUN_LIGHT, W_SKY_LIGHT, W_HAZE_LIGHT, W_GLOW_DIR, W_GLOW, W_AFTER;
      uniform float W_HALO, W_COVER;
      uniform sampler2D woodsNoise;
      uniform float woodsClock;

      // Optical depth of an exponential layer along a ray, integrated exactly.
      float woodsLayer(float base, float H, float y0, float dy, float dist) {
        float k = clamp(dist * dy / H, -60.0, 60.0);
        float f = abs(k) > 1e-4 ? (1.0 - exp(-k)) / k : 1.0 - .5 * k;
        return dist * exp(clamp((base - y0) / H, -60.0, 60.0)) * f;
      }
      float woodsPhase(float mu) {
        float gg = W_MIE_G * W_MIE_G;
        return (1.0 - gg) / (4.0 * W_PI * pow(max(1.0 + gg - 2.0 * W_MIE_G * mu, 1e-4), 1.5));
      }
      // sunlit is how much of the ray's air the key light reaches; air in shadow
      // only scatters the dimmer light of the sky.
      vec3 woodsScatter(vec3 dir, float dist, float y0, float local, out vec3 T, float sunlit) {
        vec3 odR = W_RAY_BETA * woodsLayer(0.0, W_RAY_H, y0, dir.y, dist);
        float odM = W_HAZE_BETA * woodsLayer(0.0, W_HAZE_H, y0, dir.y, dist)
                  + W_MIST_BETA * woodsLayer(W_MIST_BASE, W_MIST_H, y0, dir.y, dist)
                  + local * min(dist, 150.0);
        T = exp(-(odR + odM));
        float mu = dot(dir, W_SUN);
        float shade = mix(.3, 1.0, sunlit);
        vec3 lightR = W_SKY_LIGHT * (.75 * (1.0 + mu * mu)) * shade;
        vec3 lightM = W_HAZE_LIGHT * mix(.55, 1.0, sunlit) + W_GLOW * woodsPhase(dot(dir, W_GLOW_DIR)) * W_MIE_GAIN * sunlit;
        if (W_HALO > 0.0) lightM += W_SUN_LIGHT * woodsPhase(mu) * W_MIE_GAIN * W_HALO * sunlit;
        return (odR * lightR + odM * lightM) / max(odR + odM, vec3(1e-9)) * (1.0 - T);
      }
      vec3 woodsScatter(vec3 dir, float dist, float y0, float local, out vec3 T) { return woodsScatter(dir, dist, y0, local, T, 1.0); }
      vec3 woodsAtmosphere(vec3 color, vec3 ray, float local, float sunlit) {
        float dist = length(ray);
        vec3 T, dir = ray / max(dist, 1e-3);
        vec3 inscatter = woodsScatter(dir, dist, cameraPosition.y, local, T, sunlit);
        return color * T + inscatter;
      }
      vec3 woodsAtmosphere(vec3 color, vec3 ray, float local) { return woodsAtmosphere(color, ray, local, 1.0); }
      // The clear sky is the same air seen all the way out.
      vec3 woodsClearSky(vec3 dir, float y0) {
        vec3 T;
        return woodsScatter(normalize(vec3(dir.x, max(dir.y, .0), dir.z)), 4e5, y0, 0.0, T);
      }
      // Fair-weather cumulus on one layer. The terrain samples the same field
      // along the sun, so every cloud in the sky has its shadow on the land.
      float woodsCloud(vec2 km) {
        vec2 p = km + vec2(woodsClock * .006, woodsClock * .0024);
        float n = texture2D(woodsNoise, p * .045).r * .5 + texture2D(woodsNoise, p * .13 + .31).g * .32 + texture2D(woodsNoise, p * .41 + .67).b * .18;
        float band = .6 + .4 * texture2D(woodsNoise, p * .011 + .17).r;
        return smoothstep(.55, .78, n * band + .06 + (W_COVER - .5) * .42);
      }
      float woodsCloudShadow(vec3 world) {
        vec3 hit = world + W_SUN * max(W_CLOUD_BASE - world.y, 0.0) / max(W_SUN.y, .05);
        return 1.0 - .72 * woodsCloud(hit.xz * .001);
      }
      #endif`;
    // Hand a material the shared air. Its own patch runs first, and its program
    // keeps its own cache key, so no two materials end up sharing a shader.
    function share(material) {
      if (material.userData.woodsAir) return material;
      const own = material.onBeforeCompile, key = material.customProgramCacheKey();
      material.onBeforeCompile = (shader, renderer) => { own.call(material, shader, renderer); Object.assign(shader.uniforms, uniforms); };
      material.customProgramCacheKey = () => key;
      material.userData.woodsAir = true;
      return material;
    }
    return {glsl, uniforms, share};
  }

  // Every built-in material fogs through the same air. The ray to the camera is
  // rebuilt from the view-space position so no material needs its own varying.
  // fogNear carries the local forest haze and is updated as the walker moves.
  function installFog(THREE, glsl) {
    const C = THREE.ShaderChunk;
    C.fog_pars_vertex = '#ifdef USE_FOG\n varying vec3 vFogRay;\n#endif';
    C.fog_vertex = '#ifdef USE_FOG\n vFogRay = (vec4(mvPosition.xyz, 0.0) * viewMatrix).xyz;\n#endif';
    C.fog_pars_fragment = `#ifdef USE_FOG\n uniform vec3 fogColor; uniform float fogNear; uniform float fogFar; varying vec3 vFogRay;\n${glsl}\n#endif`;
    C.fog_fragment = '#ifdef USE_FOG\n gl_FragColor.rgb = woodsAtmosphere(gl_FragColor.rgb, vFogRay, fogNear);\n#endif';
  }

  // Sun shadows that behave like the sun's: sharp where a trunk meets the
  // ground, widening with distance from whatever casts them, so the shadow of
  // a crown fifty metres up is a soft dapple rather than a black cut-out.
  // Percentage-closer soft shadows, patched into three's PCF path.
  function installSoftShadows(THREE, {range, span, spread, search, blockers = 16, samples = 28}) {
    const C = THREE.ShaderChunk, chunk = C.shadowmap_pars_fragment;
    const start = chunk.indexOf('#if defined( SHADOWMAP_TYPE_PCF )'), end = chunk.indexOf('#elif defined( SHADOWMAP_TYPE_PCF_SOFT )');
    const define = chunk.indexOf('float getShadow(');
    if (start < 0 || end < start || define < 0) return false;
    const pcss = `
      vec2 woodsDisk(int i, int n, float turn) { float r = sqrt((float(i) + .5) / float(n)), a = float(i) * 2.39996 + turn; return r * vec2(cos(a), sin(a)); }
      float woodsSoftShadow(sampler2D map, vec4 coord, vec2 size) {
        float turn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715)))) * 6.2831853;
        float reach = ${g(search / span)}, found = 0.0, depth = 0.0;
        for (int i = 0; i < ${blockers}; i++) {
          float z = unpackRGBAToDepth(texture2D(map, coord.xy + woodsDisk(i, ${blockers}, turn) * reach));
          if (z < coord.z) { depth += z; found += 1.0; }
        }
        if (found < .5) return 1.0;
        depth /= found;
        float penumbra = clamp((coord.z - depth) * ${g(range * spread / span)}, 1.2 / size.x, reach);
        float lit = 0.0;
        for (int i = 0; i < ${samples}; i++) lit += texture2DCompare(map, coord.xy + woodsDisk(i, ${samples}, turn + 1.7) * penumbra, coord.z);
        return lit / ${g(samples)};
      }
      `;
    C.shadowmap_pars_fragment = chunk.slice(0, define) + pcss + chunk.slice(define, start) +
      '#if defined( SHADOWMAP_TYPE_PCF )\n shadow = woodsSoftShadow( shadowMap, shadowCoord, shadowMapSize );\n' + chunk.slice(end);
    return true;
  }

  // ---- The night sky. The heavens matrix turns the celestial sphere into the
  // scene for the hour, so the Milky Way, the stars and the moon stand where
  // they really do over Flagstaff, the first Dark Sky City.
  const NIGHT = `
    uniform float W_STARS, W_METEOR_T; uniform vec3 W_MOON, W_MOON_LIGHT, W_METEOR_A, W_METEOR_B; uniform mat3 W_HEAVENS;
    vec3 woodsNight(vec3 d) {
      vec3 night = vec3(0.0);
      float clear = smoothstep(-.02, .22, d.y);
      // The moon, a little larger than life, lit from where the sun really is.
      float R = .0068, m = dot(d, W_MOON);
      if (m > .9998 && dot(W_MOON_LIGHT, vec3(1.0)) > 0.0) {
        vec3 U = normalize(cross(W_MOON, vec3(0.0, 1.0, 0.0))), V = cross(U, W_MOON);
        vec2 q = vec2(dot(d, U), dot(d, V)) / R;
        float r2 = dot(q, q), edge = fwidth(r2) + 1e-4;
        if (r2 < 1.0 + edge) {
          vec3 n = q.x * U + q.y * V - sqrt(max(1.0 - r2, 0.0)) * W_MOON;
          float lit = smoothstep(-.04, .12, dot(n, W_GLOW_DIR));
          float maria = smoothstep(.42, .62, texture2D(woodsNoise, q * .23 + vec2(.31, .17)).r * .6 + texture2D(woodsNoise, q * .6 + .5).g * .4);
          float albedo = mix(.95, .55, maria) * (.88 + .12 * sqrt(max(1.0 - r2, 0.0)));
          night += W_MOON_LIGHT * albedo * (lit + .015) * (1.0 - smoothstep(1.0 - edge, 1.0 + edge, r2)) * smoothstep(-.01, .01, d.y);
        }
      }
      if (W_STARS <= 0.0) return night;
      // Now and then a shooting star: a short streak along a great circle,
      // brightest at its head, gone in under a second.
      if (W_METEOR_T > 0.0 && W_METEOR_T < 1.0) {
        vec3 axis = normalize(cross(W_METEOR_A, W_METEOR_B));
        float off = dot(d, axis), span = acos(clamp(dot(W_METEOR_A, W_METEOR_B), -1.0, 1.0));
        vec3 plane = normalize(d - axis * off);
        float along = atan(dot(cross(W_METEOR_A, plane), axis), dot(W_METEOR_A, plane));
        float head = W_METEOR_T * span, tail = head - .4 * span, pixel = length(fwidth(d)) + 1e-5;
        float trail = clamp((along - tail) / max(head - tail, 1e-4), 0.0, 1.0) * step(along, head) * step(tail, along);
        night += vec3(1.0, .96, .88) * trail * trail * exp(-off * off / (pixel * pixel * 1.4)) * sin(3.14159 * W_METEOR_T) * 2.2 * W_STARS * clear;
      }
      // The Milky Way: a band round the galaxy's own equator, brightest toward
      // Sagittarius, broken by the dust of the Great Rift.
      vec3 e = transpose(W_HEAVENS) * d;
      const vec3 POLE = ${v3(GALAXY_POLE)}, CENTRE = ${v3(GALAXY_CENTRE)};
      vec3 Y = cross(POLE, CENTRE);
      float b = dot(e, POLE), l = atan(dot(e, Y), dot(e, CENTRE));
      vec2 gal = vec2(l / 6.2831853 * 6.0, b * 2.2);
      float clumps = texture2D(woodsNoise, gal * vec2(1.0, 1.0) + .37).g * .6 + texture2D(woodsNoise, gal * 3.0).b * .4;
      float band = exp(-b * b / .022) * (.4 + .9 * clumps * clumps) + exp(-b * b / .1) * .2;
      float bulge = exp(-l * l / .55) * exp(-b * b / .05);
      float rift = smoothstep(.0, .09, abs(b + .02 + .04 * (texture2D(woodsNoise, gal * 2.0 + .7).r - .5)));
      rift = mix(1.0, rift, smoothstep(1.2, .2, abs(l + .3)) * .85);
      float glow = (band + bulge * 1.4) * rift;
      vec3 milk = mix(vec3(.62, .7, 1.0), vec3(1.0, .86, .7), smoothstep(.0, 1.0, bulge * 2.0));
      // Unresolved stars give the band its grain: star clouds within star clouds.
      float grain = (.6 + .8 * texture2D(woodsNoise, gal * 9.0 + .2).r) * (.7 + .6 * texture2D(woodsNoise, gal * 23.0 + .6).g);
      night += milk * glow * grain * grain * .04 * W_STARS * clear;
      return night;
    }`;

  function skyDome(THREE, air, shared) {
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {...air.uniforms, woodsNoise: shared.woodsNoise, woodsClock: shared.woodsClock},
      vertexShader: 'varying vec3 vDir; void main() { vDir = (modelMatrix * vec4(position, 0.0)).xyz; gl_Position = (projectionMatrix * modelViewMatrix * vec4(position, 1.0)).xyww; }',
      fragmentShader: `${air.glsl}
        ${NIGHT}
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          vec3 sky = woodsClearSky(d, cameraPosition.y);
          float mu = dot(d, W_SUN);
          // The sun's disc, bright enough to bloom; at night, the moon in its phase.
          sky += W_GLOW * 5.0 * smoothstep(.99994, .99998, dot(d, W_GLOW_DIR)) * smoothstep(-.01, .01, d.y) * (1.0 - W_HALO);
          sky += woodsNight(d);
          if (d.y > .004) {
            float t = (W_CLOUD_BASE - cameraPosition.y) / d.y;
            vec2 km = (cameraPosition.xz + d.xz * t) * .001;
            float c = woodsCloud(km);
            if (c > .001) {
              // Denser toward the sun means the near side is in the cloud's own shade.
              float toward = woodsCloud(km + W_SUN.xz * .35);
              float lit = clamp(1.0 - (toward - c) * 2.2, .18, 1.0);
              float silver = pow(max(mu, 0.0), 12.0) * (1.0 - c) * 3.0;
              vec3 cloud = W_SUN_LIGHT * (.085 * lit + .03 * silver) + W_SKY_LIGHT * .16;
              // After sunset the undersides catch the last of the light, most toward the west.
              cloud += W_AFTER * (.012 + .07 * pow(max(dot(d, normalize(W_GLOW_DIR + vec3(0.0, .25, 0.0))), 0.0), 3.0));
              vec3 T; vec3 air = woodsScatter(d, t, cameraPosition.y, 0.0, T);
              sky = mix(sky, cloud * T + air, c * smoothstep(.004, .05, d.y));
            }
          }
          gl_FragColor = vec4(sky, 1.0);
        }`,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), material);
    dome.scale.setScalar(70000);
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    return dome;
  }

  // The stars themselves are points, so each is a crisp pinprick whatever the
  // screen: the named bright ones where they belong, and a few thousand faint
  // ones scattered evenly, all turned by the same heavens matrix. They sit
  // past the far mountains, so the range hides the ones behind it.
  function stars(THREE, air, catalogue, {clock, count = 2600, pixelRatio = 1} = {}) {
    const rand = (seed => () => { seed = seed + 0x6d2b79f5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; })(4242);
    const pos = [], info = [];
    const colour = bv => bv < 0 ? [.78, .85, 1] : bv < .5 ? [1, .97, .94] : bv < 1.1 ? [1, .88, .72] : [1, .74, .52];
    for (const [ra, dec, mag, bv] of catalogue) {
      const a = ra * 15 * Math.PI / 180, d = dec * Math.PI / 180;
      pos.push(Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d));
      info.push(mag, ...colour(bv));
    }
    for (let i = 0; i < count; i++) {
      const z = rand() * 2 - 1, a = rand() * Math.PI * 2, r = Math.sqrt(1 - z * z);
      pos.push(r * Math.cos(a), r * Math.sin(a), z);
      // Faint stars far outnumber bright ones.
      info.push(3.4 + 3.1 * Math.pow(rand(), .45), ...colour(rand() * 1.6 - .25));
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geometry.setAttribute('aStar', new THREE.Float32BufferAttribute(info, 4));
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {...air.uniforms, woodsClock: clock || {value: 0}, uPixel: {value: pixelRatio}},
      vertexShader: `uniform mat3 W_HEAVENS; uniform float W_STARS, woodsClock, uPixel; attribute vec4 aStar; varying vec3 vColor;
        void main() {
          vec3 dir = normalize(W_HEAVENS * position);
          // Brightness eases off more gently than magnitudes do, as a dark-adapted eye's does.
          float mag = aStar.x, flux = pow(10.0, -.27 * (mag - 1.5));
          // Low stars dim and redden through more air, and twinkle more.
          float air = smoothstep(-.01, .3, dir.y), seed = fract(sin(dot(position, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          float twinkle = 1.0 + (.18 + .5 * (1.0 - air)) * sin(woodsClock * (5.0 + seed * 9.0) + seed * 40.0) * step(mag, 3.2);
          vColor = aStar.yzw * mix(vec3(1.0, .7, .5), vec3(1.0), air) * min(flux, 5.0) * 2.4 * W_STARS * air * twinkle;
          gl_PointSize = clamp(1.4 + (3.6 - mag) * .55, 1.15, 4.2) * uPixel;
          gl_Position = projectionMatrix * viewMatrix * vec4(cameraPosition + dir * 85000.0, 1.0);
        }`,
      fragmentShader: `varying vec3 vColor;
        void main() { vec2 c = gl_PointCoord - .5; float r = dot(c, c) * 4.0; gl_FragColor = vec4(vColor * exp(-r * 3.0) * (1.0 - smoothstep(.75, 1.0, r)), 1.0); }`,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.renderOrder = 2;
    return points;
  }

  // Image-based light for the forest: sky through the gaps overhead, crowns and
  // trunks all round, sunlit litter underfoot. Built once, as a PMREM.
  function environment(THREE, renderer, air, shared, look, scale = 1) {
    const scene = new THREE.Scene();
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: {...air.uniforms, woodsNoise: shared.woodsNoise, woodsClock: {value: 0}, uScale: {value: scale}},
      vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `${air.glsl}
        uniform float uScale;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          vec3 sky = woodsClearSky(d, 2.0);
          float open = mix(${g(look.gapLow)}, ${g(look.gapHigh)}, smoothstep(.15, .95, d.y));
          vec3 across = normalize(vec3(d.x, 0.0, d.z) + 1e-5), sunFlat = normalize(vec3(W_SUN.x, 0.0, W_SUN.z));
          float sunSide = max(dot(across, sunFlat), 0.0);
          vec3 crowns = ${v3(look.crowns)} * uScale + W_SUN_LIGHT * ${g(look.crownSun)} * sunSide * sunSide;
          vec3 litter = ${v3(look.floor)} * uScale;
          vec3 color = d.y > 0.0 ? mix(crowns, sky, open) : mix(litter, crowns, smoothstep(-.3, 0.0, d.y));
          gl_FragColor = vec4(color, 1.0);
        }`,
    });
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), material));
    const pmrem = new THREE.PMREMGenerator(renderer);
    const target = pmrem.fromScene(scene, 0, .1, 100);
    pmrem.dispose();
    material.dispose();
    return target.texture;
  }

  // ---- The darkroom.
  const QUAD = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const DOWN = `
    uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uPrefilter; varying vec2 vUv;
    vec3 s(vec2 o) { return texture2D(tSrc, vUv + o * uTexel).rgb; }
    float karis(vec3 c) { return 1.0 / (1.0 + dot(c, vec3(.2126, .7152, .0722)) * .5); }
    void main() {
      vec3 a = s(vec2(-2, 2)), b = s(vec2(0, 2)), c = s(vec2(2, 2)), d = s(vec2(-2, 0)), e = s(vec2(0)), f = s(vec2(2, 0));
      vec3 g = s(vec2(-2, -2)), h = s(vec2(0, -2)), i = s(vec2(2, -2)), j = s(vec2(-1, 1)), k = s(vec2(1, 1)), l = s(vec2(-1, -1)), m = s(vec2(1, -1));
      vec3 color;
      if (uPrefilter > .5) {
        // A Karis average on the first step keeps lone bright texels from sparkling.
        vec3 g0 = (j + k + l + m) * .25, g1 = (a + b + d + e) * .25, g2 = (b + c + e + f) * .25, g3 = (d + e + g + h) * .25, g4 = (e + f + h + i) * .25;
        float w0 = karis(g0) * .5, w1 = karis(g1) * .125, w2 = karis(g2) * .125, w3 = karis(g3) * .125, w4 = karis(g4) * .125;
        color = (g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4) / (w0 + w1 + w2 + w3 + w4);
      } else color = e * .125 + (a + c + g + i) * .03125 + (b + d + f + h) * .0625 + (j + k + l + m) * .125;
      gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
    }`;
  const UP = `
    uniform sampler2D tSmall, tBase; uniform vec2 uTexel; varying vec2 vUv;
    void main() {
      vec2 o = uTexel;
      vec3 c = texture2D(tSmall, vUv).rgb * 4.0
        + (texture2D(tSmall, vUv + vec2(o.x, 0)).rgb + texture2D(tSmall, vUv - vec2(o.x, 0)).rgb + texture2D(tSmall, vUv + vec2(0, o.y)).rgb + texture2D(tSmall, vUv - vec2(0, o.y)).rgb) * 2.0
        + texture2D(tSmall, vUv + o).rgb + texture2D(tSmall, vUv - o).rgb + texture2D(tSmall, vUv + vec2(o.x, -o.y)).rgb + texture2D(tSmall, vUv + vec2(-o.x, o.y)).rgb;
      gl_FragColor = vec4(texture2D(tBase, vUv).rgb + c / 16.0, 1.0);
    }`;
  // AgX, with a gentle "punchy" look, then a touch of warmth in the highlights
  // and cool in the shadows, as a print would have.
  const DEVELOP = `
    uniform sampler2D tColor, tBloom; uniform vec2 uAspect; uniform float uExposure, uBloom, uLevels, uVignette, uAberration, uGrain, uSeed, uSaturation, uContrast; uniform vec3 uTint;
    varying vec2 vUv;
    vec3 agx(vec3 color) {
      const mat3 toRec2020 = mat3(vec3(.6274, .0691, .0164), vec3(.3293, .9195, .0880), vec3(.0433, .0113, .8956));
      const mat3 fromRec2020 = mat3(vec3(1.6605, -.1246, -.0182), vec3(-.5876, 1.1329, -.1006), vec3(-.0728, -.0083, 1.1187));
      const mat3 inset = mat3(vec3(.856627153315983, .137318972929847, .11189821299995), vec3(.0951212405381588, .761241990602591, .0767994186031903), vec3(.0482516061458583, .101439036467562, .811302368396859));
      const mat3 outset = mat3(vec3(1.1271005818144368, -.1413297634984383, -.14132976349843826), vec3(-.11060664309660323, 1.157823702216272, -.11060664309660294), vec3(-.016493938717834573, -.016493938717834257, 1.2519364065950405));
      color = inset * (toRec2020 * color);
      color = clamp((log2(max(color, 1e-10)) + 12.47393) / 16.5, 0.0, 1.0);
      vec3 x2 = color * color, x4 = x2 * x2;
      color = 15.5 * x4 * x2 - 40.14 * x4 * color + 31.96 * x4 - 6.868 * x2 * color + .4298 * x2 + .1191 * color - .00232;
      float luma = dot(color, vec3(.2126, .7152, .0722));
      color = pow(max(color, 0.0), vec3(uContrast));
      color = luma + uSaturation * (color - luma);
      color = outset * color;
      color = pow(max(color, 0.0), vec3(2.2));
      return clamp(fromRec2020 * color, 0.0, 1.0);
    }
    float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main() {
      vec2 c = vUv - .5, ca = c * uAspect;
      float r2 = dot(ca, ca);
      vec2 shift = c * uAberration * r2;
      vec3 color = vec3(texture2D(tColor, vUv - shift).r, texture2D(tColor, vUv).g, texture2D(tColor, vUv + shift).b);
      color = mix(color, texture2D(tBloom, vUv).rgb / uLevels, uBloom);
      color *= uExposure * (1.0 - uVignette * r2 * (1.0 + r2));
      color = agx(color);
      float luma = dot(color, vec3(.2126, .7152, .0722));
      color *= mix(vec3(.985, 1.0, 1.03), vec3(1.03, 1.0, .965), smoothstep(.1, .7, luma));
      // Night film: the dark is blue, as eyes see it once the light has gone.
      color = clamp(color * mix(uTint, vec3(1.0), smoothstep(.25, .8, luma)), 0.0, 1.0);
      gl_FragColor = vec4(color, 1.0);
      #include <colorspace_fragment>
      // Fine grain, which also dithers away banding in the sky.
      float n = hash(gl_FragCoord.xy + uSeed * 61.0) + hash(gl_FragCoord.yx * 1.37 + uSeed * 17.0) - 1.0;
      gl_FragColor.rgb += n * uGrain * (.6 + .4 * (1.0 - luma));
    }`;

  function darkroom(THREE, renderer, {samples = 0, levels = 6, look = {}} = {}) {
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const scene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    quad.frustumCulled = false;
    scene.add(quad);
    const options = {type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false};
    const main = new THREE.WebGLRenderTarget(1, 1, {...options, depthBuffer: true, stencilBuffer: true, samples});
    // Only colour is ever read back, and the scenes are drawn in several passes.
    main.resolveDepthBuffer = main.resolveStencilBuffer = false;
    const down = Array.from({length: levels}, () => new THREE.WebGLRenderTarget(1, 1, options));
    const up = Array.from({length: levels - 1}, () => new THREE.WebGLRenderTarget(1, 1, options));
    const shader = (fragmentShader, uniforms) => new THREE.ShaderMaterial({vertexShader: QUAD, fragmentShader, uniforms, depthTest: false, depthWrite: false});
    const downMaterial = shader(DOWN, {tSrc: {value: null}, uTexel: {value: new THREE.Vector2()}, uPrefilter: {value: 0}});
    const upMaterial = shader(UP, {tSmall: {value: null}, tBase: {value: null}, uTexel: {value: new THREE.Vector2()}});
    const develop = shader(DEVELOP, {
      tColor: {value: main.texture}, tBloom: {value: null}, uAspect: {value: new THREE.Vector2(1, 1)}, uLevels: {value: levels},
      uExposure: {value: look.exposure ?? 1}, uBloom: {value: look.bloom ?? .04}, uVignette: {value: look.vignette ?? .22},
      uAberration: {value: look.aberration ?? .0018}, uGrain: {value: look.grain ?? .018}, uSeed: {value: 0},
      uSaturation: {value: look.saturation ?? 1.1}, uContrast: {value: look.contrast ?? 1.08}, uTint: {value: new THREE.Vector3(1, 1, 1)},
    });
    function pass(material, target) {
      quad.material = material;
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
    }
    return {
      target: main,
      look: develop.uniforms,
      setSize(w, h) {
        main.setSize(w, h);
        let bw = w, bh = h;
        down.forEach((rt, i) => { bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1); rt.setSize(bw, bh); if (up[i]) up[i].setSize(bw, bh); });
        develop.uniforms.uAspect.value.set(w / h, 1);
      },
      // draw() renders the scenes into the HDR target; this develops the print.
      render(draw) {
        renderer.setRenderTarget(main);
        renderer.clear();
        draw();
        let source = main;
        down.forEach((rt, i) => {
          downMaterial.uniforms.tSrc.value = source.texture;
          downMaterial.uniforms.uTexel.value.set(1 / source.width, 1 / source.height);
          downMaterial.uniforms.uPrefilter.value = i ? 0 : 1;
          pass(downMaterial, rt);
          source = rt;
        });
        for (let i = levels - 2; i >= 0; i--) {
          const small = i === levels - 2 ? down[levels - 1] : up[i + 1];
          upMaterial.uniforms.tSmall.value = small.texture;
          upMaterial.uniforms.tBase.value = down[i].texture;
          upMaterial.uniforms.uTexel.value.set(1 / small.width, 1 / small.height);
          pass(upMaterial, up[i]);
        }
        develop.uniforms.tBloom.value = up[0].texture;
        develop.uniforms.uSeed.value = (develop.uniforms.uSeed.value + .6180339) % 1;
        pass(develop, null);
      },
    };
  }

  return {atmosphere, installFog, installSoftShadows, skyDome, stars, environment, darkroom};
})();
if (typeof module !== 'undefined') module.exports = WoodsRender;
