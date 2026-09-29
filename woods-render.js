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

  // ---- The air. Distances in metres, heights in world y, radiance linear HDR.
  // Rayleigh scattering blues the far ranges, a thinner haze of dust and pollen
  // whitens them and glows around the sun, a mist settles in the valley, and
  // a local haze among the trunks gives the forest its depth.
  function atmosphere(c) {
    return `
      #ifndef WOODS_ATMOSPHERE
      #define WOODS_ATMOSPHERE
      const float W_PI = 3.14159265;
      const vec3 W_SUN = ${v3(c.sun)};
      const vec3 W_SUN_LIGHT = ${v3(c.sunLight)};
      const vec3 W_RAY_BETA = ${v3(c.rayBeta)};
      const float W_RAY_H = ${g(c.rayH)};
      const float W_HAZE_BETA = ${g(c.hazeBeta)};
      const float W_HAZE_H = ${g(c.hazeH)};
      const float W_MIST_BETA = ${g(c.mistBeta)};
      const float W_MIST_BASE = ${g(c.mistBase)};
      const float W_MIST_H = ${g(c.mistH)};
      const vec3 W_SKY_LIGHT = ${v3(c.skyLight)};
      const vec3 W_HAZE_LIGHT = ${v3(c.hazeLight)};
      const float W_MIE_G = ${g(c.mieG)};
      const float W_MIE_GAIN = ${g(c.mieGain)};
      const float W_CLOUD_BASE = ${g(c.cloudBase)};
      uniform sampler2D woodsNoise;
      uniform float woodsClock;

      // Optical depth of an exponential layer along a ray, integrated exactly.
      float woodsLayer(float base, float H, float y0, float dy, float dist) {
        float k = clamp(dist * dy / H, -60.0, 60.0);
        float f = abs(k) > 1e-4 ? (1.0 - exp(-k)) / k : 1.0 - .5 * k;
        return dist * exp(clamp((base - y0) / H, -60.0, 60.0)) * f;
      }
      // sunlit is how much of the ray's air the sun reaches; air in shadow only
      // scatters the dimmer light of the sky.
      vec3 woodsScatter(vec3 dir, float dist, float y0, float local, out vec3 T, float sunlit) {
        vec3 odR = W_RAY_BETA * woodsLayer(0.0, W_RAY_H, y0, dir.y, dist);
        float odM = W_HAZE_BETA * woodsLayer(0.0, W_HAZE_H, y0, dir.y, dist)
                  + W_MIST_BETA * woodsLayer(W_MIST_BASE, W_MIST_H, y0, dir.y, dist)
                  + local * min(dist, 150.0);
        T = exp(-(odR + odM));
        float mu = dot(dir, W_SUN);
        float gg = W_MIE_G * W_MIE_G;
        float hg = (1.0 - gg) / (4.0 * W_PI * pow(max(1.0 + gg - 2.0 * W_MIE_G * mu, 1e-4), 1.5));
        float shade = mix(.3, 1.0, sunlit);
        vec3 lightR = W_SKY_LIGHT * (.75 * (1.0 + mu * mu)) * shade;
        vec3 lightM = W_HAZE_LIGHT * mix(.55, 1.0, sunlit) + W_SUN_LIGHT * hg * W_MIE_GAIN * sunlit;
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
        return smoothstep(.55, .78, n * band + .06);
      }
      float woodsCloudShadow(vec3 world) {
        vec3 hit = world + W_SUN * max(W_CLOUD_BASE - world.y, 0.0) / max(W_SUN.y, .05);
        return 1.0 - .72 * woodsCloud(hit.xz * .001);
      }
      #endif`;
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

  function skyDome(THREE, glsl, shared) {
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {woodsNoise: shared.woodsNoise, woodsClock: shared.woodsClock},
      vertexShader: 'varying vec3 vDir; void main() { vDir = (modelMatrix * vec4(position, 0.0)).xyz; gl_Position = (projectionMatrix * modelViewMatrix * vec4(position, 1.0)).xyww; }',
      fragmentShader: `${glsl}
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          vec3 sky = woodsClearSky(d, cameraPosition.y);
          float mu = dot(d, W_SUN);
          // The sun's disc, bright enough to bloom.
          sky += W_SUN_LIGHT * 5.0 * smoothstep(.99994, .99998, mu) * smoothstep(-.01, .01, d.y);
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

  // Image-based light for the forest: sky through the gaps overhead, crowns and
  // trunks all round, sunlit litter underfoot. Built once, as a PMREM.
  function environment(THREE, renderer, glsl, shared, look) {
    const scene = new THREE.Scene();
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: {woodsNoise: shared.woodsNoise, woodsClock: {value: 0}},
      vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `${glsl}
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          vec3 sky = woodsClearSky(d, 2.0);
          float open = mix(${g(look.gapLow)}, ${g(look.gapHigh)}, smoothstep(.15, .95, d.y));
          vec3 across = normalize(vec3(d.x, 0.0, d.z) + 1e-5), sunFlat = normalize(vec3(W_SUN.x, 0.0, W_SUN.z));
          float sunSide = max(dot(across, sunFlat), 0.0);
          vec3 crowns = ${v3(look.crowns)} + W_SUN_LIGHT * ${g(look.crownSun)} * sunSide * sunSide;
          vec3 litter = ${v3(look.floor)};
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
    uniform sampler2D tColor, tBloom; uniform vec2 uAspect; uniform float uExposure, uBloom, uLevels, uVignette, uAberration, uGrain, uSeed, uSaturation, uContrast;
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
      uSaturation: {value: look.saturation ?? 1.1}, uContrast: {value: look.contrast ?? 1.08},
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

  return {atmosphere, installFog, installSoftShadows, skyDome, environment, darkroom};
})();
if (typeof module !== 'undefined') module.exports = WoodsRender;
