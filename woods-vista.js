/* The far country. Past the ridge the land falls away into a deep valley with
   a river and a lake, and across it a range of granite peaks holds the last of
   the snow. It is one heightfield on a polar grid centred on the junction, so
   it is as fine near the walker as far away when measured in degrees. The
   heights are generated on the GPU at load; shadows and sky light are baked
   once, since the sun never moves. woods.js draws it in its own pass, behind
   the forest, and the near terrain meets it along the edge of the woods.
   A classic script: woods.js hands it THREE and the shared atmosphere. */
const WoodsVista = (() => {
  const g = x => { const s = Number(x).toPrecision(9); return /[.eE]/.test(s) ? s : s + '.0'; };

  function build(THREE, renderer, {W, glsl, shared, low}) {
    const NU = low ? 512 : 1024, NV = low ? 384 : 768, BAKE = low ? 1 : 1.5;
    const R0 = 30, R1 = 70000, FLOOR = -620, WATER = FLOOR - 1.5;
    const B = W.BOUNDS;

    const POLAR = `
      const vec2 V_C = vec2(${g(W.J.x)}, ${g(W.J.z)});
      const float V_R0 = ${g(R0)}, V_L = ${g(Math.log(R1 / R0))}, V_JY = ${g(W.JY)};
      const float V_FLOOR = ${g(FLOOR)}, V_WATER = ${g(WATER)};
      vec2 vistaWorld(vec2 uv) {
        float th = (uv.x - .5) * 6.2831853, r = V_R0 * exp(uv.y * V_L);
        return V_C + vec2(sin(th), -cos(th)) * r;
      }
      vec2 vistaUv(vec2 p) {
        vec2 d = p - V_C;
        return vec2(atan(d.x, -d.y) / 6.2831853 + .5, log(max(length(d), 1e-3) / V_R0) / V_L);
      }
      vec3 vistaNormal(vec4 hm) { return vec3(hm.g, sqrt(max(1.0 - hm.g * hm.g - hm.b * hm.b, 0.0)), hm.b); }
      float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      // Value noise with its derivatives.
      vec3 noised(vec2 x) {
        vec2 p = floor(x), w = fract(x);
        vec2 u = w * w * w * (w * (w * 6.0 - 15.0) + 10.0), du = 30.0 * w * w * (w * (w - 2.0) + 1.0);
        float a = hash12(p), b = hash12(p + vec2(1, 0)), c = hash12(p + vec2(0, 1)), d = hash12(p + vec2(1, 1));
        float k1 = b - a, k2 = c - a, k4 = a - b - c + d;
        return vec3(-1.0 + 2.0 * (a + k1 * u.x + k2 * u.y + k4 * u.x * u.y), 2.0 * du * vec2(k1 + k4 * u.y, k2 + k4 * u.x));
      }
      const mat2 M2 = mat2(.8, -.6, .6, .8);`;

    // ---- The shape of the land.
    const HEIGHT = `
      uniform sampler2D tSeam; uniform vec4 uRect;
      // Detail is kept only down to the size of a texel, so the map never aliases.
      float octaves(float wavelength, float fp) { return clamp(log2(wavelength / (2.2 * fp)), 1.0, 12.0); }
      // Eroded fbm: detail fades on steep ground, as it does on real hills.
      float eroded(vec2 p, float oct) {
        float a = 0.0, b = .5; vec2 d = vec2(0.0);
        for (int i = 0; i < 12; i++) {
          float k = clamp(oct - float(i), 0.0, 1.0);
          if (k <= 0.0) break;
          vec3 n = noised(p);
          d += n.yz;
          a += b * n.x / (1.0 + dot(d, d)) * k;
          b *= .5; p = M2 * p * 2.03;
        }
        return a;
      }
      // Ridged multifractal: knife-edge crests that branch down into couloirs.
      float ridged(vec2 p, float oct) {
        float sum = 0.0, amp = .55, weight = 1.0;
        for (int i = 0; i < 12; i++) {
          float k = clamp(oct - float(i), 0.0, 1.0);
          if (k <= 0.0) break;
          float n = 1.0 - abs(noised(p).x);
          n *= n;
          sum += n * amp * weight * k;
          weight = clamp(n * 1.9, 0.0, 1.0);
          amp *= .5; p = M2 * p * 2.07;
        }
        return sum;
      }
      float smax(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return max(a, b) + h * h * k * .25; }
      // A great mountain's bulk: a long dome turned to its own axis. The ridged
      // noise it is multiplied by carves the arêtes, cirques and summits.
      float massif(vec2 p, vec2 c, float height, float radius, float turn) {
        vec2 q = (p - c) * mat2(cos(turn), -sin(turn), sin(turn), cos(turn)) * vec2(1.0, 1.35) / radius;
        return height * exp(-dot(q, q) * 2.4);
      }
      float macro(vec2 p, float fp) {
        float l = p.x - V_C.x, f = V_C.y - p.y, r = length(vec2(l, f));
        // Our ridge runs back into the forest as a wedge, and ends at the rim.
        float halfWidth = 290.0 + max(0.0, -f) * .9 + 70.0 * sin(f / 190.0 + 1.0);
        float edge = max(f - 58.0, abs(l) - halfWidth);
        float plateau = V_JY - 4.0 + eroded(p / 900.0 + 3.1, octaves(900.0, fp)) * 70.0 * smoothstep(220.0, 900.0, r);
        // The valley wall: steep off the rim, easing onto the floor, cut by gullies.
        float t = clamp(edge / 1550.0, 0.0, 1.0);
        float wall = mix(plateau, V_FLOOR + 6.0, 1.0 - pow(1.0 - t, 2.1));
        wall += eroded(p / 480.0 + 7.3, octaves(480.0, fp)) * 150.0 * smoothstep(0.0, 260.0, edge) * (1.0 - smoothstep(800.0, 1400.0, edge));
        // Across the valley: foothills, then the range, then far ranges in the haze.
        float axis = 2600.0 + 280.0 * sin(l / 2100.0 + .6) + 110.0 * sin(l / 760.0 + 2.2);
        float across = f - axis, far = across > 0.0 ? across - 620.0 : (-across - 620.0) * 1.35;
        // On our side the valley wall is the land; hills rise only well back from it.
        float nearSide = across > 0.0 ? 1.0 : .55 * smoothstep(1400.0, 3200.0, far);
        vec2 warp = p + 1100.0 * vec2(noised(p / 4600.0).x, noised(p / 4600.0 + 5.2).x);
        float crest = ridged(warp / 5600.0 + 11.0, octaves(5600.0, fp));
        float hills = eroded(p / 1700.0, octaves(1700.0, fp));
        float rise = smoothstep(-300.0, 9500.0, far);
        float base = V_FLOOR + 6.0 + 1250.0 * pow(rise, .9) * nearSide;
        float alpine = smoothstep(1400.0, 7000.0, far);
        float amp = (240.0 * smoothstep(-100.0, 900.0, far) + 1500.0 * alpine) * nearSide;
        float land = base + amp * mix(hills * .5 + .35, crest, alpine);
        // The great peaks, each placed so it shows beside or above the signpost.
        float peaks = 0.0;
        peaks = max(peaks, massif(warp, V_C + vec2(-1300.0, -6300.0), 3350.0, 3300.0, .35));
        peaks = max(peaks, massif(warp, V_C + vec2(-5300.0, -8300.0), 3050.0, 3000.0, .9));
        peaks = max(peaks, massif(warp, V_C + vec2(3700.0, -7100.0), 2850.0, 3000.0, .1));
        peaks = max(peaks, massif(warp, V_C + vec2(9200.0, -11200.0), 2950.0, 3700.0, .6));
        peaks = max(peaks, massif(warp, V_C + vec2(-10800.0, -10800.0), 2850.0, 3700.0, 1.2));
        peaks = max(peaks, massif(warp, V_C + vec2(1000.0, -19500.0), 3700.0, 6500.0, .5));
        peaks = max(peaks, massif(warp, V_C + vec2(-15500.0, -24000.0), 3300.0, 7000.0, .2));
        float sharp = ridged(warp / 2700.0 + 3.7, octaves(2700.0, fp)), jag = ridged(warp / 1150.0 - 2.1, octaves(1150.0, fp));
        // Smooth where two landforms meet, but never where both are just the floor.
        land = smax(land, V_FLOOR + peaks * (.36 + .8 * sharp + .32 * jag), max(160.0 * smoothstep(20.0, 400.0, peaks), 1.0));
        float h = smax(wall, land, max(90.0 * smoothstep(12.0, 220.0, min(wall, land) - V_FLOOR), 1.0));
        // The floor: meadows and braided gravel, a meandering river and a lake.
        float floorNoise = eroded(p / 260.0 + 1.7, octaves(260.0, fp)) * 5.0;
        h = max(h, V_FLOOR + 3.5 + floorNoise);
        float bend = axis + 170.0 * sin(l / 560.0 + 1.3) + 70.0 * sin(l / 230.0 + .4);
        float river = abs(f - bend) - (26.0 + 10.0 * sin(l / 900.0));
        vec2 lake = (vec2(l, f) - vec2(-900.0, axis + 60.0)) * mat2(.97, .24, -.24, .97) / vec2(1150.0, 380.0);
        float shore = min(river / 45.0, (length(lake) - 1.0) * 6.0);
        float low = smoothstep(V_FLOOR + 60.0, V_FLOOR + 22.0, h);
        h = mix(h, V_WATER - 5.0, (1.0 - smoothstep(0.0, 1.0, shore)) * low);
        // The earth curves away: far ranges settle a little behind the near ones.
        return h - r * r / 12.74e6;
      }
      // Seam heights come from the near terrain's own edge, so the two meet.
      float seam(vec2 c) {
        float Wd = uRect.z - uRect.x, Hd = uRect.w - uRect.y, P = 2.0 * (Wd + Hd);
        float dB = c.y - uRect.y, dT = uRect.w - c.y, dL = c.x - uRect.x, dR = uRect.z - c.x, m = min(min(dB, dT), min(dL, dR)), t;
        if (m == dB) t = c.x - uRect.x;
        else if (m == dR) t = Wd + c.y - uRect.y;
        else if (m == dT) t = Wd + Hd + uRect.z - c.x;
        else t = 2.0 * Wd + Hd + uRect.w - c.y;
        return texture2D(tSeam, vec2(t / P, .5)).r;
      }
      float vistaHeight(vec2 p, float fp) {
        vec2 c = clamp(p, uRect.xy, uRect.zw), d = max(uRect.xy - p, p - uRect.zw);
        float outside = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
        if (outside < 0.0) return seam(c) - 8.0 + outside * .05;
        float h = macro(p, fp);
        if (outside < 480.0) h += (seam(c) - macro(c, fp)) * (1.0 - smoothstep(0.0, 480.0, outside));
        return h;
      }`;

    const QUAD = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
    const canFloat = renderer.extensions.has('EXT_color_buffer_float') && renderer.extensions.has('OES_texture_float_linear');
    const heightTarget = new THREE.WebGLRenderTarget(NU, NV, {type: canFloat ? THREE.FloatType : THREE.HalfFloatType, format: THREE.RGBAFormat,
      depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping, generateMipmaps: false});
    const lightTarget = new THREE.WebGLRenderTarget(Math.round(NU * BAKE), Math.round(NV * BAKE), {type: THREE.HalfFloatType, format: THREE.RGBAFormat,
      depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping, generateMipmaps: false});

    // The near terrain's edge, walked all the way round, becomes the seam.
    const seamData = (() => {
      const N = 1024, Wd = B.x1 - B.x0, Hd = B.z1 - B.z0, P = 2 * (Wd + Hd), data = new Uint16Array(N * 4);
      for (let k = 0; k < N; k++) {
        let t = (k + .5) / N * P, x, z;
        if (t < Wd) { x = B.x0 + t; z = B.z0; }
        else if ((t -= Wd) < Hd) { x = B.x1; z = B.z0 + t; }
        else if ((t -= Hd) < Wd) { x = B.x1 - t; z = B.z1; }
        else { t -= Wd; x = B.x0; z = B.z1 - t; }
        data[k * 4] = THREE.DataUtils.toHalfFloat(W.height(x, z));
      }
      const texture = new THREE.DataTexture(data, N, 1, THREE.RGBAFormat, THREE.HalfFloatType);
      texture.wrapS = THREE.RepeatWrapping;
      texture.magFilter = texture.minFilter = THREE.LinearFilter;
      texture.needsUpdate = true;
      return texture;
    })();

    const generate = new THREE.ShaderMaterial({
      vertexShader: QUAD, depthTest: false, depthWrite: false,
      uniforms: {tSeam: {value: seamData}, uRect: {value: new THREE.Vector4(B.x0, B.z0, B.x1, B.z1)}, uSize: {value: new THREE.Vector2(NU, NV)}},
      fragmentShader: `${POLAR}${HEIGHT}
        uniform vec2 uSize; varying vec2 vUv;
        void main() {
          vec2 p = vistaWorld(vUv);
          float r = length(p - V_C), fp = max(6.2831853 * r / uSize.x, r * V_L / uSize.y);
          float e = max(fp * .5, 1.0), h = vistaHeight(p, fp);
          float hx = vistaHeight(p + vec2(e, 0.0), fp), hz = vistaHeight(p + vec2(0.0, e), fp);
          vec3 n = normalize(vec3(h - hx, e, h - hz));
          vec2 warp = p + 1100.0 * vec2(noised(p / 4600.0).x, noised(p / 4600.0 + 5.2).x);
          gl_FragColor = vec4(h, n.x, n.z, ridged(warp / 2700.0 + 3.7, octaves(2700.0, fp) - 1.0));
        }`,
    });

    // Sun visibility by marching the heightfield toward the sun; sky visibility
    // from the horizon in twelve directions. Both baked once.
    const bake = new THREE.ShaderMaterial({
      vertexShader: QUAD, depthTest: false, depthWrite: false,
      uniforms: {tHeight: {value: heightTarget.texture}, uSteps: {value: low ? 44 : 72}},
      fragmentShader: `${glsl}${POLAR}
        uniform sampler2D tHeight; uniform float uSteps; varying vec2 vUv;
        float heightAt(vec2 p) { return texture2D(tHeight, vistaUv(p)).r; }
        void main() {
          vec4 hm = texture2D(tHeight, vUv);
          vec2 p = vistaWorld(vUv);
          vec3 n = vistaNormal(hm), pos = vec3(p.x, hm.r, p.y) + n * 3.0;
          float vis = 1.0, t = 8.0;
          for (int i = 0; i < 96; i++) {
            if (float(i) >= uSteps) break;
            vec3 q = pos + W_SUN * t;
            if (q.y > 4900.0) break;
            vis = min(vis, 14.0 * (q.y - heightAt(q.xz)) / t);
            if (vis <= 0.0) break;
            t += max(8.0, t * .1);
          }
          vis = clamp(vis, 0.0, 1.0);
          float sky = 0.0;
          for (int k = 0; k < 12; k++) {
            float a = (float(k) + .5) * .5235988;
            vec2 dir = vec2(cos(a), sin(a));
            float horizon = -1.0;
            for (int j = 0; j < 6; j++) {
              float dist = 24.0 * pow(2.55, float(j));
              horizon = max(horizon, (heightAt(p + dir * dist) - hm.r) / dist);
            }
            sky += 1.0 - max(horizon / sqrt(1.0 + horizon * horizon), 0.0);
          }
          gl_FragColor = vec4(vis * vis * (3.0 - 2.0 * vis), sky / 12.0, 0.0, 1.0);
        }`,
    });

    // ---- How the land looks: granite, snow, dark forest, meadows, water.
    const SHADE = `
      uniform sampler2D tHeight, tLight; uniform float uDetail;
      const vec3 V_SKY = vec3(.16, .22, .33), V_BOUNCE = vec3(.045, .045, .038);
      float vistaSunlit;
      vec3 vistaShade(vec3 world, vec2 uv, float px) {
        vec4 hm = texture2D(tHeight, uv);
        vec2 lit = texture2D(tLight, uv).rg;
        vec3 N = vistaNormal(hm);
        vec2 q = world.xz;
        vec4 broad = texture2D(woodsNoise, q / 2300.0), mid = texture2D(woodsNoise, q / 410.0), fine = texture2D(woodsNoise, q / 60.0);
        float alt = world.y - V_JY, crest = hm.a, steep = 1.0 - smoothstep(.6, .9, N.y);
        // Couloirs: streaks running straight down the fall line, as water and
        // rockfall cut them. They darken bare rock and hold snow above the line.
        vec2 fall = normalize(N.xz + 1e-4), across = vec2(-fall.y, fall.x);
        vec2 rq = vec2(dot(q, across) / 46.0, dot(q, fall) / 520.0);
        float rill = texture2D(woodsNoise, rq * .09).b * .6 + texture2D(woodsNoise, rq * .23 + .4).g * .4;
        rill = smoothstep(.48, .72, rill) * steep;
        // Buttresses, cracks and ledges finer than the heightfield: ridged noise
        // with its own slopes, each octave dropped once it is smaller than a pixel.
        vec2 dh = vec2(0.0); float relief = 0.0, amp = 1.0, freq = 1.0 / 260.0, norm = 0.0; vec2 rp = q;
        for (int i = 0; i < 6; i++) {
          if (float(i) >= uDetail) break;
          float keep = 1.0 - smoothstep(.18, .45, px * freq);
          vec3 n = noised(rp * freq + float(i) * 7.31);
          relief += amp * (1.0 - abs(n.x)) * keep; norm += amp * keep;
          dh -= amp * sign(n.x) * n.yz * freq * keep;
          amp *= .52; freq *= 2.13;
        }
        relief = norm > 0.0 ? relief / norm : .5;
        float rough = mix(.35, 1.0, steep) * (1.0 - smoothstep(.85, .97, N.y) * .7);
        vec3 Nd = normalize(N + vec3(-dh.x, 0.0, -dh.y) * 64.0 * rough + vec3(across.x, 0.0, across.y) * (rill - .2) * .3 * steep);
        float wobble = (broad.r - .5) * 520.0 + (mid.g - .5) * 220.0;
        float sunward = dot(N, W_SUN);
        // Snow lies where it can settle: on ledges and benches, in couloirs, and
        // lowest on the faces the sun reaches least. Steep walls stay bare.
        float line = smoothstep(-60.0, 60.0, alt - 1520.0 - wobble + (.6 - sunward) * 420.0);
        float settle = smoothstep(.58, .74, Nd.y + (fine.b - .5) * .22) * (1.0 - crest * .3);
        float snow = line * max(settle, rill * .95 * smoothstep(-200.0, 200.0, alt - 1400.0 - wobble)) * smoothstep(.26, .42, N.y);
        float treeLine = 980.0 + wobble;
        float forest = (1.0 - smoothstep(treeLine - 90.0, treeLine + 70.0, alt)) * smoothstep(.6, .76, N.y + (mid.r - .5) * .34);
        float floorLand = smoothstep(V_FLOOR + 45.0, V_FLOOR + 12.0, world.y) * smoothstep(.9, .97, N.y);
        float meadow = floorLand * smoothstep(.4, .58, mid.r * .65 + fine.g * .35);
        float gravel = smoothstep(V_WATER + 3.0, V_WATER + .6, world.y);
        forest *= 1.0 - max(meadow, gravel);
        vec3 granite = mix(vec3(.2, .185, .165), vec3(.4, .36, .31), smoothstep(.25, .8, fine.r * .5 + mid.b * .5));
        vec3 rock = mix(granite, vec3(.085, .08, .075), smoothstep(.55, .78, mid.a) * .75 + rill * .35);
        rock *= mix(.8, 1.1, crest);
        vec3 talus = vec3(.27, .26, .245) * (.85 + .3 * fine.g);
        vec3 trees = vec3(.026, .038, .022) * (.5 + 1.0 * texture2D(woodsNoise, q / 16.0).r) * (.8 + .4 * mid.g);
        vec3 grass = mix(vec3(.16, .14, .06), vec3(.09, .1, .04), fine.g);
        vec3 albedo = mix(rock, talus, smoothstep(.6, .78, N.y) * (1.0 - steep) * .8);
        albedo = mix(albedo, trees, forest);
        albedo = mix(albedo, grass, meadow);
        albedo = mix(albedo, vec3(.21, .2, .18) * (.8 + .4 * fine.b), gravel);
        albedo = mix(albedo, vec3(.86, .87, .9) * (.94 + .08 * fine.r), snow);
        float sun = max(dot(Nd, W_SUN), 0.0);
        sun = mix(sun, clamp((dot(Nd, W_SUN) + .35) / 1.35, 0.0, 1.0) * .8, forest);
        float shadow = lit.r * woodsCloudShadow(world);
        vistaSunlit = mix(shadow, 1.0, smoothstep(V_FLOOR + 200.0, V_FLOOR + 1400.0, world.y) * .6 + .25);
        float cavity = mix(.55, 1.08, relief) * mix(1.0, .8, rill);
        vec3 skyLight = mix(V_BOUNCE, V_SKY, .5 + .5 * Nd.y) * lit.g * (1.0 - forest * .35) * cavity;
        shadow *= mix(.75, 1.0, relief);
        return albedo * (W_SUN_LIGHT / W_PI * sun * shadow + skyLight);
      }`;

    const scene = new THREE.Group();
    // Rock detail is only worth its cost where the far country fills the view.
    const local = {value: 0}, detail = {value: low ? 3 : 6};
    const terrainMaterial = new THREE.ShaderMaterial({
      uniforms: {tHeight: {value: heightTarget.texture}, tLight: {value: lightTarget.texture}, woodsNoise: shared.woodsNoise, woodsClock: shared.woodsClock, uLocal: local, uDetail: detail},
      vertexShader: `${POLAR}
        uniform sampler2D tHeight; varying vec3 vWorld; varying vec2 vUv;
        void main() {
          vUv = position.xy;
          vec2 p = vistaWorld(vUv);
          vWorld = vec3(p.x, texture2D(tHeight, vUv).r, p.y);
          gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
        }`,
      fragmentShader: `${glsl}${POLAR}${SHADE}
        uniform float uLocal; varying vec3 vWorld; varying vec2 vUv;
        void main() {
          vec3 color = vistaShade(vWorld, vUv, length(fwidth(vWorld.xz)));
          gl_FragColor = vec4(woodsAtmosphere(color, vWorld - cameraPosition, uLocal, vistaSunlit), 1.0);
        }`,
    });
    // The polar grid in patches, so what is behind the walker is culled.
    (() => {
      const CU = 16, CV = 4, du = NU / CU, dv = NV / CV, sphere = new THREE.Box3(), point = new THREE.Vector3();
      const world = (u, v) => { const th = (u - .5) * Math.PI * 2, r = R0 * Math.exp(v * Math.log(R1 / R0)); return [W.J.x + Math.sin(th) * r, W.J.z - Math.cos(th) * r]; };
      for (let cu = 0; cu < CU; cu++) for (let cv = 0; cv < CV; cv++) {
        const cols = du + 1, rows = dv + (cv < CV - 1 ? 1 : 0), pos = new Float32Array(cols * rows * 3), index = [];
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
          const k = (j * cols + i) * 3;
          pos[k] = (cu * du + i + .5) / NU; pos[k + 1] = (cv * dv + j + .5) / NV;
        }
        for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
          const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
          index.push(a, b, c, b, d, c);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geometry.setIndex(index);
        sphere.makeEmpty();
        for (let s = 0; s <= 4; s++) for (let t = 0; t <= 4; t++) {
          const [x, z] = world(pos[0] + (pos[(cols - 1) * 3] - pos[0]) * s / 4, pos[1] + (pos[((rows - 1) * cols) * 3 + 1] - pos[1]) * t / 4);
          sphere.expandByPoint(point.set(x, -1000, z)); sphere.expandByPoint(point.set(x, 4900, z));
        }
        geometry.boundingSphere = sphere.getBoundingSphere(new THREE.Sphere());
        geometry.boundingSphere.radius *= 1.08;
        const mesh = new THREE.Mesh(geometry, terrainMaterial);
        scene.add(mesh);
      }
    })();

    // The lake and river: sky and peaks mirrored, marched through the heightfield.
    const water = new THREE.Mesh(new THREE.PlaneGeometry(26000, 5200, 96, 24).rotateX(-Math.PI / 2).translate(W.J.x, WATER, W.J.z - 2600), new THREE.ShaderMaterial({
      uniforms: {tHeight: {value: heightTarget.texture}, tLight: {value: lightTarget.texture}, woodsNoise: shared.woodsNoise, woodsClock: shared.woodsClock, uLocal: local, uDetail: {value: 2}},
      // The water curves with the earth, as the land around it does.
      vertexShader: `${POLAR} varying vec3 vWorld; void main() { vec4 w = modelMatrix * vec4(position, 1.0); float r = length(w.xz - V_C); w.y -= r * r / 12.74e6; vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `${glsl}${POLAR}${SHADE}
        uniform float uLocal; varying vec3 vWorld;
        void main() {
          vec3 V = normalize(vWorld - cameraPosition);
          vec2 q = vWorld.xz;
          float a = texture2D(woodsNoise, q / 140.0 + vec2(woodsClock * .004, 0.0)).g - texture2D(woodsNoise, q / 90.0 - vec2(0.0, woodsClock * .003)).b;
          float b = texture2D(woodsNoise, q / 120.0 + vec2(0.0, woodsClock * .005)).r - texture2D(woodsNoise, q / 70.0 + .5).g;
          vec3 N = normalize(vec3(a * .05, 1.0, b * .05));
          vec3 R = reflect(V, N);
          R.y = max(R.y, .002);
          vec3 color = woodsClearSky(R, vWorld.y);
          // March the reflection out across the valley until it meets a mountain.
          vec3 pos = vWorld + R * 6.0; float t = 6.0;
          for (int i = 0; i < 64; i++) {
            vec3 s = pos + R * t;
            vec2 uv = vistaUv(s.xz);
            float h = texture2D(tHeight, uv).r;
            if (s.y < h) {
              vec3 hit = vec3(s.x, h, s.z);
              color = vistaShade(hit, uv, t * .004);
              vec3 T, inscatter = woodsScatter(R, t, vWorld.y, 0.0, T);
              color = color * T + inscatter;
              break;
            }
            if (s.y > 4900.0) break;
            t += max(10.0, t * .085);
          }
          float fresnel = .02 + .98 * pow(1.0 - max(dot(-V, N), 0.0), 5.0);
          vec3 depth = vec3(.006, .014, .016);
          color = mix(depth, color, clamp(fresnel * 1.6 + .25, 0.0, 1.0));
          vec2 wuv = vistaUv(vWorld.xz);
          float sunlit = mix(texture2D(tLight, wuv).r, 1.0, .25);
          gl_FragColor = vec4(woodsAtmosphere(color, vWorld - cameraPosition, uLocal, sunlit), 1.0);
        }`,
    }));
    water.renderOrder = 1;
    scene.add(water);

    // ---- Generation and baking, a strip at a time so no single draw stalls the GPU.
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quadScene = new THREE.Scene(), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    quad.frustumCulled = false;
    quadScene.add(quad);
    async function strips(material, target, count) {
      quad.material = material;
      const h = Math.ceil(target.height / count);
      for (let s = 0; s < count; s++) {
        target.scissor.set(0, s * h, target.width, h);
        target.scissorTest = true;
        renderer.setRenderTarget(target);
        renderer.render(quadScene, camera);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      target.scissorTest = false;
      renderer.setRenderTarget(null);
    }
    async function prepare() {
      await strips(generate, heightTarget, low ? 4 : 8);
      await strips(bake, lightTarget, low ? 6 : 16);
      generate.dispose(); bake.dispose();
    }

    return {group: scene, prepare, local, detail, full: low ? 3 : 6};
  }

  return {build};
})();
if (typeof module !== 'undefined') module.exports = WoodsVista;
