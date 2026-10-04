/* The sky over the woods is Arizona's own. The sun, the moon and the stars
   stand where they really are over Flagstaff at the moment asked for, and the
   light of the woods follows the sun's height: golden in the late afternoon,
   blue after sunset, moonlit or starlit at night. Arizona keeps no daylight
   saving, so its clock is always seven hours behind UTC.
   The scene's north is -z and east is +x: the walk heads north to the rim.
   A classic script so tests/woods-sky.cjs can check it in Node. */
const WoodsSky = (() => {
  const DEG = Math.PI / 180, LAT = 35.2, LON = -111.65, ZONE = -7;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const mix = (a, b, t) => a + (b - a) * t;
  const wrap = x => ((x % 360) + 360) % 360;
  const julian = date => date.getTime() / 86400000 + 2440587.5;

  // ---- Where things are. Low-precision almanac formulas, good to a fraction
  // of a degree, which is far finer than anyone can tell from a forest.
  function sunEquatorial(jd) {
    const n = jd - 2451545, L = wrap(280.46 + .9856474 * n), g = wrap(357.528 + .9856003 * n) * DEG;
    const lambda = (L + 1.915 * Math.sin(g) + .02 * Math.sin(2 * g)) * DEG, eps = (23.439 - 4e-7 * n) * DEG;
    return {ra: wrap(Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) / DEG), dec: Math.asin(Math.sin(eps) * Math.sin(lambda)) / DEG};
  }
  function moonEquatorial(jd) {
    const d = jd - 2451545, r = x => wrap(x) * DEG;
    const Lp = r(218.316 + 13.176396 * d), Mp = r(134.963 + 13.064993 * d), F = r(93.272 + 13.22935 * d);
    const D = r(297.85 + 12.190749 * d), M = r(357.529 + .98560028 * d);
    const lambda = Lp + (6.289 * Math.sin(Mp) - 1.274 * Math.sin(Mp - 2 * D) + .658 * Math.sin(2 * D) + .214 * Math.sin(2 * Mp) - .186 * Math.sin(M) - .114 * Math.sin(2 * F)) * DEG;
    const beta = (5.128 * Math.sin(F) + .281 * Math.sin(Mp + F) + .278 * Math.sin(Mp - F)) * DEG, eps = 23.439 * DEG;
    const ra = Math.atan2(Math.sin(lambda) * Math.cos(eps) - Math.tan(beta) * Math.sin(eps), Math.cos(lambda));
    const dec = Math.asin(Math.sin(beta) * Math.cos(eps) + Math.cos(beta) * Math.sin(eps) * Math.sin(lambda));
    return {ra: wrap(ra / DEG), dec: dec / DEG};
  }
  // Right ascension and declination to a direction in the scene.
  function horizontal(ra, dec, jd) {
    const gmst = wrap(280.46061837 + 360.98564736629 * (jd - 2451545));
    const ha = (gmst + LON - ra) * DEG, d = dec * DEG, lat = LAT * DEG;
    const alt = Math.asin(Math.sin(lat) * Math.sin(d) + Math.cos(lat) * Math.cos(d) * Math.cos(ha));
    const az = Math.atan2(-Math.cos(d) * Math.sin(ha), Math.sin(d) * Math.cos(lat) - Math.cos(d) * Math.cos(ha) * Math.sin(lat));
    return [Math.sin(az) * Math.cos(alt), Math.sin(alt), -Math.cos(az) * Math.cos(alt)];
  }
  // The rotation from the celestial sphere to the scene, column-major, so a
  // shader can turn a direction in the sky back into the stars behind it.
  function heavens(jd) {
    return [...horizontal(0, 0, jd), ...horizontal(90, 0, jd), ...horizontal(0, 90, jd)];
  }
  const elevation = v => Math.asin(clamp(v[1], -1, 1)) / DEG;
  function positions(date) {
    const jd = julian(date), s = sunEquatorial(jd), m = moonEquatorial(jd);
    const sun = horizontal(s.ra, s.dec, jd), moon = horizontal(m.ra, m.dec, jd);
    // The moon is close enough to sit a degree lower than its geocentric place.
    const lift = Math.cos(Math.asin(moon[1])) * .95 * DEG, up = Math.asin(moon[1]) - lift, flat = Math.hypot(moon[0], moon[2]) || 1;
    moon[0] *= Math.cos(up) / flat; moon[2] *= Math.cos(up) / flat; moon[1] = Math.sin(up);
    const lit = (1 - (sun[0] * moon[0] + sun[1] * moon[1] + sun[2] * moon[2])) / 2;
    return {jd, sun, moon, lit, frame: heavens(jd)};
  }

  // ---- Arizona's clock.
  function clock(date) {
    const local = new Date(date.getTime() + ZONE * 3600000);
    const h = local.getUTCHours(), m = local.getUTCMinutes();
    return {hours: h + m / 60, text: `${(h + 11) % 12 + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`,
      day: Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - ZONE * 3600000, month: local.getUTCMonth()};
  }
  // The day's moments, found by watching the sun cross the heights that make them.
  function moments(date) {
    const midnight = clock(date).day, samples = [];
    for (let k = 0; k <= 720; k++) { const t = new Date(midnight + k * 120000); samples.push({t, e: elevation(positions(t).sun)}); }
    const crossing = (height, rising) => {
      for (let k = 1; k < samples.length; k++) {
        const a = samples[k - 1], b = samples[k];
        if (rising ? a.e < height && b.e >= height : a.e > height && b.e <= height) return new Date(a.t.getTime() + (b.t - a.t) * (height - a.e) / (b.e - a.e));
      }
      return null;
    };
    const noon = samples.reduce((best, s) => s.e > best.e ? s : best).t;
    // The night ahead, at the hour the moon rides highest, if it rises at all.
    let night = null, best = -Infinity;
    for (let k = 0; k <= 160; k++) {
      const t = new Date(noon.getTime() + (5 + k * .1) * 3600000), p = positions(t);
      if (elevation(p.sun) > -18) continue;
      const score = elevation(p.moon) * (.3 + p.lit);
      if (score > best) { best = score; night = t; }
    }
    if (best < 4) night = new Date(midnight + 22.5 * 3600000);
    return {
      dawn: crossing(2, true) || new Date(midnight + 6.5 * 3600000),
      midday: noon,
      golden: crossing(10, false) || new Date(midnight + 17 * 3600000),
      dusk: crossing(-4.5, false) || new Date(midnight + 19 * 3600000),
      night,
    };
  }
  const NAMES = {now: 'Now', dawn: 'Sunrise', midday: 'Midday', golden: 'Golden hour', dusk: 'Dusk', night: 'Night'};

  // ---- The light, as the sun's height sets it. Each key is a look; heights
  // between keys blend them. Colours are linear; skyLight lights the blue of
  // the air, hazeLight its dust, glow the brightness round the sun; env scales
  // the forest's own light, lamp lights the lanterns, stars come out at -6°.
  const KEYS = [
    {e: -18, sun: [1, 1, 1], power: 0, sky: [.006, .009, .018], haze: [.004, .005, .009], glow: [0, 0, 0], env: .008,
      exposure: 1.9, saturation: .62, contrast: 1.04, tint: [.84, .93, 1.14], shafts: 0, lamp: 1},
    {e: -9, sun: [1, 1, 1], power: 0, sky: [.04, .05, .095], haze: [.022, .022, .036], glow: [.22, .08, .05], env: .03,
      exposure: 1.75, saturation: .8, contrast: 1.04, tint: [.9, .95, 1.1], shafts: 0, lamp: 1},
    {e: -4, sun: [1, 1, 1], power: 0, sky: [.24, .26, .4], haze: [.15, .11, .13], glow: [1.1, .42, .2], env: .14,
      exposure: 1.5, saturation: 1, contrast: 1.06, tint: [.95, .97, 1.05], shafts: 0, lamp: .65},
    {e: -.8, sun: [1, .3, .08], power: 0, sky: [.62, .62, .72], haze: [.38, .27, .25], glow: [3.2, 1.2, .38], env: .42,
      exposure: 1.32, saturation: 1.12, contrast: 1.08, tint: [1, 1, 1], shafts: 0, lamp: 0},
    {e: 4, sun: [1, .36, .11], power: 6.5, sky: [1.05, 1.02, 1.04], haze: [.5, .43, .42], glow: null, env: .78,
      exposure: 1.22, saturation: 1.2, contrast: 1.1, tint: [1, 1, 1], shafts: .13, lamp: 0},
    {e: 15, sun: [1, .521, .216], power: 10.5, sky: [1.45, 1.45, 1.45], haze: [.56, .59, .64], glow: null, env: 1,
      exposure: 1.15, saturation: 1.2, contrast: 1.1, tint: [1, 1, 1], shafts: .11, lamp: 0},
    {e: 32, sun: [1, .72, .5], power: 12, sky: [1.6, 1.6, 1.6], haze: [.6, .63, .68], glow: null, env: 1.08,
      exposure: 1.05, saturation: 1.14, contrast: 1.09, tint: [1, 1, 1], shafts: .07, lamp: 0},
    {e: 60, sun: [1, .84, .68], power: 13, sky: [1.7, 1.7, 1.72], haze: [.5, .55, .63], glow: null, env: 1.12,
      exposure: 1, saturation: 1.16, contrast: 1.09, tint: [1, 1, 1], shafts: .045, lamp: 0},
  ];
  for (const key of KEYS) key.glow = key.glow || key.sun.map(v => v * key.power);
  function blend(e) {
    let i = 0;
    while (i < KEYS.length - 2 && e > KEYS[i + 1].e) i++;
    const a = KEYS[i], b = KEYS[i + 1], t = smooth(0, 1, clamp((e - a.e) / (b.e - a.e)));
    const out = {};
    for (const key of Object.keys(a)) {
      if (key === 'e') continue;
      const x = a[key], y = b[key];
      out[key] = Array.isArray(x) ? x.map((v, k) => mix(v, y[k], t)) : mix(x, y, t);
    }
    return out;
  }

  // Everything the woods need to light themselves for one moment.
  function light(date, name = 'now') {
    const p = positions(date), e = elevation(p.sun), moonUp = smooth(-1, 9, elevation(p.moon));
    const look = blend(e);
    // By day the sun is the key light. When it is down the moon takes over,
    // as bright as its phase allows; with no moon the key goes dark and the
    // woods are lit by the sky, the stars and the lamps.
    const day = smooth(-1.2, .6, e), moonPower = 1.1 * Math.pow(p.lit, 1.5) * moonUp * (1 - smooth(-6, -1, e));
    const useMoon = day < .5 && moonPower > .02;
    const key = day >= .5 || !useMoon ? p.sun.slice() : p.moon.slice();
    if (key[1] < .08) { const f = Math.hypot(key[0], key[2]) || 1, y = .08; key[0] *= Math.sqrt(1 - y * y) / f; key[2] *= Math.sqrt(1 - y * y) / f; key[1] = y; }
    const moonColor = [.55, .66, .92];
    const color = useMoon ? moonColor : look.sun, power = useMoon ? moonPower : look.power * day;
    // Moonlight blues the night sky a little; the glow round the moon is its own.
    const moonSky = moonPower * .045;
    const sky = look.sky.map((v, k) => v + moonSky * moonColor[k]);
    const keyLight = color.map(v => v * power);
    // By day the glow is the sun's own light; after sunset it is the afterglow.
    const glow = look.glow.map((v, k) => v + (useMoon ? keyLight[k] * .5 : 0));
    const c = clock(date);
    const rising = positions(new Date(date.getTime() + 600000)).sun[1] > p.sun[1];
    let phase;
    if (e < -9) phase = 'Night';
    else if (e < -.8) phase = rising ? 'Dawn' : 'Dusk';
    else if (e < 6) phase = rising ? 'Sunrise' : 'Sunset';
    else if (e < 20) phase = rising ? 'Morning light' : 'Golden hour';
    else phase = c.hours < 11 ? 'Morning' : c.hours < 13.5 ? 'Midday' : 'Afternoon';
    return {
      name, date, time: c.text, phase, month: c.month, elevation: e,
      key, keyLight, keyIsMoon: useMoon, sun: p.sun, moon: p.moon, moonLit: p.lit, moonUp, frame: p.frame,
      sky, haze: look.haze.map((v, k) => v + moonSky * moonColor[k] * .6), glow, env: look.env + moonPower * .05,
      look: {exposure: look.exposure, saturation: look.saturation, contrast: look.contrast, tint: look.tint},
      shafts: look.shafts * day, motes: smooth(-2, 6, e), stars: smooth(-5, -13, e) * (1 - moonPower * .25),
      lamp: look.lamp, night: 1 - smooth(-9, -2, e),
    };
  }
  // A named moment of today, or any moment at all: 2026-10-10T22:30 is read on Arizona's clock.
  function at(name, now = new Date()) {
    const moment = /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(name || '') ? Date.parse(/(Z|[+-]\d\d:?\d\d)$/.test(name) ? name : name + '-07:00') : NaN;
    if (!isNaN(moment)) return light(new Date(moment), 'moment');
    if (!name || name === 'now' || !NAMES[name]) return light(now, 'now');
    return light(moments(now)[name], name);
  }

  // ---- The brightest stars, J2000: right ascension in hours, declination,
  // magnitude and colour index. Walking north, the Dipper, Polaris and
  // Cassiopeia hang over the range.
  const STARS = [
    [2.530, 89.264, 1.98, .6], [11.062, 61.751, 1.79, 1.07], [11.031, 56.383, 2.37, .03], [11.897, 53.695, 2.44, .04], [12.257, 57.033, 3.31, .08],
    [12.9, 55.96, 1.77, -.02], [13.399, 54.925, 2.27, .02], [13.792, 49.313, 1.86, -.1], [14.845, 74.156, 2.08, 1.47], [15.345, 71.834, 3.05, .05],
    [.675, 56.537, 2.24, 1.17], [.153, 59.15, 2.28, .34], [.945, 60.717, 2.15, -.15], [1.43, 60.235, 2.66, .13], [1.907, 63.67, 3.35, -.15],
    [18.616, 38.784, .03, 0], [20.69, 45.28, 1.25, .09], [20.37, 40.257, 2.23, .67], [20.77, 33.97, 2.48, 1.03], [19.75, 45.131, 2.87, -.03],
    [19.512, 27.96, 3.05, 1.09], [19.846, 8.868, .77, .22], [5.278, 45.998, .08, .8], [14.261, 19.182, -.05, 1.23], [6.752, -16.716, -1.46, 0],
    [5.919, 7.407, .5, 1.85], [5.242, -8.202, .13, -.03], [5.419, 6.35, 1.64, -.22], [5.679, -1.943, 1.77, -.21], [5.604, -1.202, 1.69, -.18],
    [5.533, -.299, 2.23, -.22], [5.796, -9.67, 2.09, -.18], [4.599, 16.509, .85, 1.54], [7.655, 5.225, .34, .42], [7.755, 28.026, 1.14, 1],
    [7.577, 31.888, 1.58, .03], [10.14, 11.967, 1.35, -.11], [13.42, -11.161, 1.04, -.23], [16.49, -26.432, 1.06, 1.83], [22.961, -29.622, 1.16, .09],
    [3.405, 49.861, 1.79, .48], [3.136, 40.956, 2.12, -.05], [.14, 29.091, 2.06, -.11], [1.162, 35.621, 2.05, 1.58], [2.065, 42.33, 2.1, 1.37],
    [23.079, 15.205, 2.49, -.04], [23.063, 28.083, 2.42, 1.67], [.221, 15.184, 2.83, -.23], [17.943, 51.489, 2.23, 1.52], [17.507, 52.301, 2.79, .98],
    [21.31, 62.586, 2.45, .22], [2.12, 23.462, 2, 1.15], [11.818, 14.572, 2.14, .09], [15.578, 26.715, 2.22, -.02], [17.582, 12.56, 2.08, .15],
    [3.791, 24.105, 2.87, -.09], [3.819, 24.053, 3.62, -.07], [3.749, 24.113, 3.7, -.11], [3.763, 24.368, 3.87, -.07], [3.772, 23.948, 4.18, -.06],
    [3.753, 24.467, 4.29, -.11], [18.921, -26.297, 2.05, -.13], [18.403, -34.385, 1.85, -.03], [21.736, 9.875, 2.38, 1.52], [5.992, 44.947, 1.9, .08],
    [5.438, 28.608, 1.65, -.13], [6.628, 16.399, 1.93, 0], [6.977, -28.972, 1.5, -.21], [6.378, -17.956, 1.98, -.24], [10.333, 19.842, 2.08, 1.15],
    [12.934, 38.318, 2.89, -.12], [14.75, 27.074, 2.37, .97],
  ];
  // A unit vector on the celestial sphere for a right ascension (hours) and declination.
  const celestial = (raHours, dec) => {
    const a = raHours * 15 * DEG, d = dec * DEG;
    return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
  };
  // The galaxy's own pole and centre, for drawing the Milky Way where it lies.
  const GALAXY = {pole: celestial(192.85948 / 15, 27.12825), centre: celestial(266.405 / 15, -28.936)};

  return {LAT, LON, NAMES, julian, positions, horizontal, elevation, clock, moments, light, at, blend, STARS, celestial, GALAXY};
})();
if (typeof module !== 'undefined') module.exports = WoodsSky;
// Before the forest is drawn, let the page know what light to expect, so the
// backdrop it shows while loading is already the right time of day.
if (typeof document !== 'undefined' && document.querySelector('.woods-home')) {
  let kept = null;
  try { kept = sessionStorage.getItem('woods:light'); } catch { /* private mode */ }
  const light = WoodsSky.at(new URLSearchParams(location.search).get('light') || kept || 'now');
  document.documentElement.dataset.light = light.night > .5 ? 'night' : light.elevation < 4 ? 'twilight' : 'day';
}
