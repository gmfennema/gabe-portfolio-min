/* One trail through one forest, measured in metres. y is up and the walk
   heads toward -z. woods.js draws this world and tests/woods-world.cjs checks
   it, so the trail, the creek, the planting and the arrival framing can never
   disagree about where anything is. */
const WoodsWorld = (() => {
  const DEG = Math.PI / 180, EYE = 1.65, STEP = .74, TREAD = .62;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const mix = (a, b, t) => a + (b - a) * t;

  // The same forest grows on every visit.
  function random(seed) {
    return () => {
      seed = seed + 0x6d2b79f5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hash(x, z, seed) {
    let h = Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(seed, 1442695041) | 0;
    h = Math.imul(h ^ h >>> 13, 1274126177);
    return ((h ^ h >>> 16) >>> 0) / 4294967296;
  }
  function noise(x, z, seed = 0) {
    const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
    const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    const a = hash(ix, iz, seed), b = hash(ix + 1, iz, seed), c = hash(ix, iz + 1, seed), d = hash(ix + 1, iz + 1, seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, z, octaves = 4, seed = 0) {
    let sum = 0, amp = .5, total = 0;
    for (let i = 0; i < octaves; i++) {
      sum += noise(x, z, seed + i * 31) * amp; total += amp;
      x = x * 2.07 + 17.3; z = z * 2.07 - 9.1; amp *= .5;
    }
    return sum / total;
  }

  // ---- The trail: a spline, resampled so equal steps are equal distances.
  const CONTROL = [[0,95],[0,60],[0,28],[0,0],[2.6,-15],[-2,-30],[-8.5,-44],[-6.5,-58],[.5,-71],[7,-85],[5.5,-99],[.4,-111],[0,-123],[0,-150]];
  const TRAILHEAD = 3, JUNCTION_POINT = 12;
  function catmull(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    return [0, 1].map(k => .5 * (2 * p1[k] + (p2[k] - p0[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t3));
  }
  function resample(points, target) {
    const cum = [0];
    for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
    const total = cum[cum.length - 1], count = Math.max(1, Math.round(total / target)), spacing = total / count;
    const xs = new Float64Array(count + 1), zs = new Float64Array(count + 1);
    for (let k = 0, j = 0; k <= count; k++) {
      const s = k * spacing;
      while (j < cum.length - 2 && cum[j + 1] < s) j++;
      const t = clamp((s - cum[j]) / (cum[j + 1] - cum[j] || 1));
      xs[k] = mix(points[j][0], points[j + 1][0], t);
      zs[k] = mix(points[j][1], points[j + 1][1], t);
    }
    return {xs, zs, spacing, total, cum};
  }
  const dense = [];
  let startIndex = 0;
  for (let i = 1; i < CONTROL.length - 2; i++) {
    if (i === TRAILHEAD) startIndex = dense.length;
    for (let k = 0; k < 64; k++) dense.push(catmull(CONTROL[i - 1], CONTROL[i], CONTROL[i + 1], CONTROL[i + 2], k / 64));
  }
  dense.push(CONTROL[JUNCTION_POINT]);
  const path = resample(dense, .25);
  const BEGIN = -path.cum[startIndex];          // d of the far end behind the trailhead
  const JUNCTION = path.total + BEGIN;          // d of the signpost
  const J = {x: CONTROL[JUNCTION_POINT][0], z: CONTROL[JUNCTION_POINT][1]};

  function trail(d) {
    const last = path.xs.length - 1;
    const f = clamp((d - BEGIN) / path.spacing, 0, last - 1e-9), i = Math.floor(f), t = f - i;
    const a = Math.max(0, i - 2), b = Math.min(last, i + 3);
    let tx = path.xs[b] - path.xs[a], tz = path.zs[b] - path.zs[a];
    const len = Math.hypot(tx, tz) || 1;
    return {x: mix(path.xs[i], path.xs[i + 1], t), z: mix(path.zs[i], path.zs[i + 1], t), tx: tx / len, tz: tz / len};
  }

  // Coarse scan, then an exact search near the best sample. The trail never
  // doubles back, so the nearest stretch is always the one the scan finds.
  function nearest(line, x, z, stride) {
    const {xs, zs} = line, last = xs.length - 1;
    let best = 0, bestD = Infinity;
    for (let i = 0; i <= last; i += stride) { const dd = (xs[i] - x) ** 2 + (zs[i] - z) ** 2; if (dd < bestD) { bestD = dd; best = i; } }
    if ((xs[last] - x) ** 2 + (zs[last] - z) ** 2 < bestD) best = last;
    const lo = Math.max(0, best - stride), hi = Math.min(last, best + stride);
    let bi = lo, bt = 0; bestD = Infinity;
    for (let i = lo; i < hi; i++) {
      const ex = xs[i + 1] - xs[i], ez = zs[i + 1] - zs[i];
      const t = clamp(((x - xs[i]) * ex + (z - zs[i]) * ez) / (ex * ex + ez * ez));
      const dd = (x - xs[i] - ex * t) ** 2 + (z - zs[i] - ez * t) ** 2;
      if (dd < bestD) { bestD = dd; bi = i; bt = t; }
    }
    const ex = xs[bi + 1] - xs[bi], ez = zs[bi + 1] - zs[bi];
    return {i: bi + bt, dist: Math.sqrt(bestD), side: Math.sign(ex * (z - zs[bi]) - ez * (x - xs[bi])) || 1};
  }
  function nearestTrail(x, z) {
    const n = nearest(path, x, z, 16);
    return {d: BEGIN + n.i * path.spacing, dist: n.dist, side: n.side};
  }

  // Elevation along the tread: a rise into the woods, down to the creek,
  // level across the bridge, then up onto the ridge where the sign stands.
  function monotone(keys) {
    const n = keys.length, xs = keys.map(k => k[0]), ys = keys.map(k => k[1]), h = [], s = [], m = [];
    for (let i = 0; i < n - 1; i++) { h[i] = xs[i + 1] - xs[i]; s[i] = (ys[i + 1] - ys[i]) / h[i]; }
    m[0] = s[0]; m[n - 1] = s[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = s[i - 1] * s[i] <= 0 ? 0 : (s[i - 1] + s[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (!s[i]) { m[i] = m[i + 1] = 0; continue; }
      const a = m[i] / s[i], b = m[i + 1] / s[i], r = a * a + b * b;
      if (r > 9) { const k = 3 / Math.sqrt(r); m[i] = k * a * s[i]; m[i + 1] = k * b * s[i]; }
    }
    return x => {
      if (x <= xs[0]) return ys[0];
      if (x >= xs[n - 1]) return ys[n - 1];
      let i = 0; while (x > xs[i + 1]) i++;
      const t = (x - xs[i]) / h[i], t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (3 * t2 - 2 * t3) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1];
    };
  }
  const CREEK = 68, BRIDGE = 5.3;
  const rise = monotone([[BEGIN - 1, 0], [0, 0], [17, .9], [34, 1.5], [52, .3], [CREEK - 6.2, -.9], [CREEK + 6.2, -.9], [CREEK + 17, .2], [JUNCTION - 28, 2.3], [JUNCTION - 9, 3.1], [JUNCTION + 80, 3.1]]);
  const DECK = rise(CREEK), WATER = DECK - .95, JY = rise(JUNCTION);

  // ---- The creek crosses square to the trail, then wanders off both ways.
  const crossing = trail(CREEK);
  const creekLine = resample(Array.from({length: 331}, (_, k) => {
    const u = k - 130;
    // It bends away from the ridge at both ends, so its water never hangs over the valley.
    const bend = (4.2 * Math.sin(u / 13 + .5) + 2 * Math.sin(u / 5.7 + 2)) * smooth(7, 22, Math.abs(u)) - .0009 * u * u;
    return [crossing.x - crossing.tz * u + crossing.tx * bend, crossing.z + crossing.tx * u + crossing.tz * bend];
  }), 1);
  const creekDistance = (x, z) => nearest(creekLine, x, z, 8).dist;

  // ---- Two trails leave the junction, left and right along the ridge.
  const forks = [[[-5, -6], [-31, -11]], [[5.5, -5], [29, -17]]].map(([c, e]) => resample(Array.from({length: 61}, (_, k) => {
    const t = k / 60, b = 2 * t * (1 - t), q = t * t;
    return [J.x + b * c[0] + q * e[0], J.z + b * c[1] + q * e[1]];
  }), .5));
  function forkDistance(x, z) { return Math.min(...forks.map(f => nearest(f, x, z, 4).dist)); }

  // Everything that decides what may grow somewhere, measured once.
  function site(x, z) {
    const t = nearestTrail(x, z);
    const fork = forkDistance(x, z);
    const onTrail = t.d <= JUNCTION + .01 ? t.dist : Infinity;
    const jd = Math.hypot(x - J.x, z - J.z);
    return {d: t.d, side: t.side, trail: t.dist, fork, path: Math.min(onTrail, fork), creek: creekDistance(x, z),
      jd, beyond: J.z - z, meadow: meadow(x, z, jd)};
  }
  function meadow(x, z, jd = Math.hypot(x - J.x, z - J.z)) {
    const start = 1 - smooth(8, 25, Math.hypot(x, (z - 7) * .8));
    const over = smooth(-4, 12, J.z - z), clearing = 1 - smooth(9 + over * 6, 19 + over * 10, jd);
    return Math.max(start, clearing, smooth(.64, .76, fbm(x * .04 + 3, z * .04 + 8, 3, 44)) * .8);
  }

  // ---- Ground: the tread sits in a gentle hollow between rolling hills.
  function height(x, z, s = null) {
    const t = s || site(x, z), tread = rise(t.d);
    const away = smooth(2.5, 36, t.trail) * smooth(5, 34, t.creek);
    let h = tread + (fbm(x * .017, z * .017, 4, 3) - .47) * 17 * away;
    h += (fbm(x * .11, z * .11, 3, 8) - .5) * 1.2 * smooth(1, 6, t.trail);
    // A flat meadow at the trailhead and a level clearing around the sign.
    h = mix(h, tread + (fbm(x * .1, z * .1, 2, 5) - .5) * .5, 1 - smooth(14, 30, Math.hypot(x, z - 5)));
    h = mix(h, JY + (fbm(x * .13, z * .13, 2, 12) - .5) * .4, 1 - smooth(12, 27, t.jd));
    // The tread itself is exact: the walker's feet are always on it.
    h = mix(tread, h, smooth(.9, 3.5, t.trail));
    if (t.creek < 9) {
      const bank = WATER - .4 + (DECK - WATER + .4) * smooth(1.2, 4.3, t.creek);
      h = mix(bank, h, smooth(4.3, 9, t.creek));
    }
    // Past the clearing the ridge falls away into a wide valley and the peaks beyond.
    return h - smooth(13, 75, t.beyond) * 32;
  }

  // ---- The walker. Distances are along the tread, so scroll maps to steps.
  const SIGN = {width: 1.78, bottom: 1.1, top: 2.48, x: J.x, z: J.z};
  function lens(aspect) {
    // Upright phones keep about 40° across; wide screens keep a natural 56° tall view.
    return clamp(2 * Math.atan(Math.tan(20 * DEG) / aspect) / DEG, 56, 76);
  }
  function arrival(aspect) {
    const fov = lens(aspect), tv = Math.tan(fov * DEG / 2), th = tv * aspect;
    // The boards' faces stand a hand's width in front of the post.
    const byWidth = SIGN.width / 2 / (.72 * th) + .12;
    const byHeight = (SIGN.top - SIGN.bottom) / (2 * tv * .44) + .12;
    const stop = Math.max(3, byWidth, byHeight);
    // Aim a little above the boards so they sit under the arrival title.
    const target = JY + (SIGN.top + SIGN.bottom) / 2 + 2 * stop * tv * .075;
    return {fov, stop, d: JUNCTION - stop, target};
  }
  function pose(d, aspect) {
    const a = arrival(aspect), here = trail(d), y = rise(d) + EYE;
    const lookD = Math.min(d + 6.5, JUNCTION), ahead = trail(lookD);
    // Eyes on the tread while walking, lifting to the trees at the trailhead.
    const drop = mix(.12, .8, smooth(1, 14, d));
    let tx = ahead.x, ty = rise(lookD) + EYE - drop, tz = ahead.z;
    const w = smooth(a.d - 18, a.d, d);
    tx = mix(tx, SIGN.x, w); ty = mix(ty, a.target, w); tz = mix(tz, SIGN.z, w);
    const dx = tx - here.x, dy = ty - y, dz = tz - here.z;
    return {x: here.x, y, z: here.z, yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)), fov: a.fov};
  }

  // ---- Planting. Every rule that keeps the walk clear lives here.
  const BOUNDS = {x0: -150, x1: 150, z0: -340, z1: 80};
  const FIELD = {x0: -64, x1: 64, z0: -176, z1: 72, cell: .5};
  function inView(s, x) {
    // The arrival looks over the ridge to the peaks: keep that window open.
    return s.beyond > 6 && s.beyond < 100 && Math.abs(x - J.x) < 4 + s.beyond * .8;
  }
  function plant() {
    const rand = random(1847), trees = [], shrubs = [], rocks = [], ferns = [];
    const cell = 4.5;
    for (let gx = BOUNDS.x0 + 4; gx < BOUNDS.x1 - 4; gx += cell) {
      for (let gz = BOUNDS.z0 + 4; gz < BOUNDS.z1 - 4; gz += cell) {
        const x = gx + rand() * cell, z = gz + rand() * cell, roll = rand(), s = site(x, z);
        const clear = 1.95 + rand() * rand() * 5;
        // Past the ridge the slope drops out of sight; trees down there would only
        // show as hazy crowns brighter than the peaks behind them.
        if (s.trail > 86 || s.beyond > 24) continue;
        if (s.path < clear || s.creek < 4.1 || s.jd < 12.5 || inView(s, x)) continue;
        if (roll > .82 - s.meadow * .74 - (1 - smooth(12, 24, s.jd)) * .7) continue;
        const aspen = smooth(.56, .68, fbm(x * .026 + 40, z * .026 - 13, 3, 31)) + smooth(12, 16, s.jd) * (1 - smooth(22, 36, s.jd)) * .75 + (1 - smooth(4, 24, s.creek)) * .2;
        const firChance = .18 + (1 - smooth(4, 30, s.creek)) * .45;
        const pick = rand();
        const kind = pick < aspen * .85 ? 'aspen' : pick < aspen * .85 + firChance ? 'fir' : 'pine';
        const grow = rand();
        const tall = {pine: 17 + grow * 11, fir: 9 + grow * 12, aspen: 10 + grow * 7}[kind];
        trees.push({kind, x, z, y: height(x, z, s) - .12, height: tall, girth: .85 + rand() * .35, turn: rand() * Math.PI * 2, tint: rand()});
      }
    }
    // Saplings and understory fill the eye-level layer between the trunks.
    for (let i = 0; i < 2600; i++) {
      const x = mix(FIELD.x0 + 4, FIELD.x1 - 4, rand()), z = mix(FIELD.z0 + 4, FIELD.z1 - 4, rand()), s = site(x, z), roll = rand();
      if (s.path < 1.35 || s.creek < 3.4 || s.jd < 7 || inView(s, x) || s.trail > 60) continue;
      if (roll < .1 * (1 - s.meadow)) trees.push({kind: 'fir', x, z, y: height(x, z, s) - .05, height: 1.2 + rand() * 3.6, girth: 1.1, turn: rand() * 6.28, tint: rand()});
      else if (roll < .26) shrubs.push({x, z, y: height(x, z, s) - .05, size: .55 + rand() * .75, turn: rand() * 6.28, tint: rand()});
    }
    for (let i = 0; i < 1400; i++) {
      const x = mix(FIELD.x0 + 3, FIELD.x1 - 3, rand()), z = mix(FIELD.z0 + 3, FIELD.z1 - 3, rand()), s = site(x, z);
      if (s.path < 1.05 || s.creek < 1.8 || s.jd < 2.2 || inView(s, x) && s.beyond > 14) continue;
      const near = (1 - smooth(1.2, 5, s.path)) * .35 + (1 - smooth(1.5, 4, s.creek)) * .5;
      if (rand() > .16 + near) continue;
      const big = rand() < .06;
      rocks.push({x, z, y: height(x, z, s), size: big ? 1 + rand() * 1.4 : .14 + rand() * rand() * .6, turn: rand() * 6.28, tilt: rand(), shape: Math.floor(rand() * 3)});
    }
    for (let i = 0; i < 5200; i++) {
      const x = mix(FIELD.x0 + 3, FIELD.x1 - 3, rand()), z = mix(FIELD.z0 + 3, FIELD.z1 - 3, rand()), s = site(x, z);
      if (s.path < .95 || s.creek < 2.8 || s.jd < 3 || s.trail > 45) continue;
      const wet = 1 - smooth(3, 16, s.creek), patch = smooth(.52, .66, fbm(x * .07 - 20, z * .07, 3, 71));
      if (rand() > (wet * .85 + patch * .7 + .04) * (1 - s.meadow * .8)) continue;
      ferns.push({x, z, y: height(x, z, s) - .03, size: .7 + rand() * .6, turn: rand() * 6.28, tint: rand()});
    }
    return {trees, shrubs, rocks, ferns, logs: logs(), stumps: stumps(rand)};
  }
  function lay(d, side, offset, angle, length, radius) {
    const t = trail(d), cx = t.x - t.tz * side * offset, cz = t.z + t.tx * side * offset;
    const c = Math.cos(angle), s = Math.sin(angle);
    const ax = t.tx * c - t.tz * s, az = t.tz * c + t.tx * s;
    return {x: cx, z: cz, ax, az, length, radius, y: height(cx, cz) + radius * .55};
  }
  function logs() {
    const list = [lay(23, 1, 4.4, .75, 7, .3), lay(47, -1, 2.9, .12, 6.2, .26), lay(101, 1, 4.6, -.62, 8.5, .34), lay(38, -1, 6, 1.9, 9, .38)];
    // An old fallen tree bridges the creek upstream of the footbridge.
    const u = 15, cx = crossing.x - crossing.tz * u, cz = crossing.z + crossing.tx * u;
    list.push({x: cx, z: cz, ax: crossing.tx, az: crossing.tz, length: 10, radius: .32, y: DECK + .05});
    return list;
  }
  function stumps(rand) {
    return [[14, 1, 2.8], [31, -1, 3.2], [58, 1, 3.5], [84, -1, 2.6], [112, 1, 3.1], [9, -1, 5]].map(([d, side, off]) => {
      const t = trail(d), x = t.x - t.tz * side * off, z = t.z + t.tx * side * off;
      return {x, z, y: height(x, z) - .05, radius: .28 + rand() * .2, height: .35 + rand() * .45, turn: rand() * 6.28};
    });
  }
  function grass(count, seed = 9) {
    const rand = random(seed), out = [];
    for (let tries = 0; out.length < count && tries < count * 14; tries++) {
      // Most blades line the walk; meadows fill in at the trailhead and junction.
      const d = mix(-22, JUNCTION + 16, rand()), t = trail(d), lateral = (rand() - .5) * 2 * (rand() < .5 ? 5 : 26);
      const x = t.x - t.tz * lateral + (rand() - .5) * 3, z = t.z + t.tx * lateral + (rand() - .5) * 3;
      if (x < FIELD.x0 || x > FIELD.x1 || z < FIELD.z0 || z > FIELD.z1) continue;
      const s = site(x, z);
      if (s.path < .78 || s.creek < 2.7 || Math.hypot(x - SIGN.x, z - SIGN.z) < .5) continue;
      const edge = smooth(.78, 1.3, s.path) * (1 - smooth(1.6, 3.4, s.path));
      const chance = Math.max(s.meadow, edge * .75, .16 * smooth(.45, .7, fbm(x * .09, z * .09, 2, 90)));
      if (rand() > chance) continue;
      out.push({x, z, y: height(x, z, s), size: .38 + rand() * .42 + s.meadow * .12, turn: rand() * 6.28, tint: rand()});
    }
    return out;
  }

  // Wind is shared with the shaders so the sound of a gust matches the sway.
  function gust(x, z, time) {
    const g = .5 + .5 * Math.sin(time * .62 - x * .12 - z * .035);
    return g * g * g;
  }

  return {DEG, EYE, STEP, TREAD, BEGIN, JUNCTION, CREEK, BRIDGE, DECK, WATER, JY, J, SIGN, BOUNDS, FIELD,
    clamp, smooth, mix, random, hash, noise, fbm, trail, rise, nearestTrail, creekDistance, forkDistance, site, meadow,
    height, lens, arrival, pose, inView, plant, grass, gust, creekLine, forks, crossing};
})();
if (typeof module !== 'undefined') module.exports = WoodsWorld;
