/* Checks for the sky over the woods, without a browser: node tests/woods-sky.cjs */
const assert = require('node:assert/strict');
const S = require('../woods-sky.js');

const az = date => new Date(date + '-07:00');     // Arizona clock time
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// The sun: highest at the June solstice, lower at the equinox, and setting on time.
const summer = S.moments(az('2026-06-21T12:00'));
assert(Math.abs(S.elevation(S.positions(summer.midday).sun) - (90 - S.LAT + 23.44)) < .6, 'the solstice sun stands 78° up at noon');
const autumn = S.moments(az('2026-09-23T12:00'));
assert(Math.abs(S.elevation(S.positions(autumn.midday).sun) - (90 - S.LAT)) < .8, 'the equinox sun stands 55° up at noon');
const noonSun = S.positions(summer.midday).sun;
assert(noonSun[2] > 0 && Math.abs(noonSun[0]) < .02, 'at noon the sun is due south, behind the walker');
const sunset = S.positions(az('2026-10-04T18:02')).sun;
assert(Math.abs(S.elevation(sunset)) < 1.5, `Flagstaff's sun sets (the true horizon) about 6:02 pm on 4 October (${S.elevation(sunset).toFixed(2)}°)`);
assert(sunset[0] < -.9, 'it sets in the west, to the walker’s left');
const morning = S.positions(az('2026-10-04T09:00')).sun;
assert(morning[0] > .5 && morning[1] > 0, 'the morning sun is in the east, to the right');

// The moon: full and new on the right dates, and its light follows its phase.
for (const day of ['2026-09-26', '2026-10-26', '2026-11-24']) assert(S.positions(az(day + 'T12:00')).lit > .97, `full moon on ${day}`);
for (const day of ['2026-10-10', '2026-11-09']) assert(S.positions(az(day + 'T12:00')).lit < .03, `new moon on ${day}`);
const full = S.light(az('2026-10-26T23:30')), dark = S.light(az('2026-10-10T23:30'));
assert(full.moonUp > .9 && full.keyLight[2] > full.keyLight[0], 'a full moon at midnight is the key light, and it is cool');
assert(dark.keyLight.every(v => v < .02), 'a moonless night has no key light');
assert(full.stars < dark.stars, 'moonlight washes out some of the stars');

// The heavens: Polaris stands over the north at the latitude's height, whenever you look.
for (const time of ['2026-10-04T20:00', '2027-01-15T03:30', '2026-07-01T23:00']) {
  const p = S.positions(az(time)), f = p.frame;
  const polaris = S.celestial(2.530, 89.264);
  const v = [0, 1, 2].map(r => f[r] * polaris[0] + f[3 + r] * polaris[1] + f[6 + r] * polaris[2]);
  assert(Math.abs(S.elevation(v) - S.LAT) < 1.1 && v[2] < -.75, `Polaris is due north at ${S.LAT}° (${time})`);
  const cols = [f.slice(0, 3), f.slice(3, 6), f.slice(6, 9)];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) assert(Math.abs(dot(cols[i], cols[j]) - (i === j ? 1 : 0)) < 1e-9, 'the sky turns as a rigid sphere');
}

// The light: each named moment looks like itself, and the day blends smoothly.
const now = az('2026-10-04T12:00'), m = S.moments(now);
assert(m.dawn < m.midday && m.midday < m.golden && m.golden < m.dusk && m.dusk < m.night, 'the moments run in order');
const golden = S.at('golden', now), dusk = S.at('dusk', now), night = S.at('night', now), midday = S.at('midday', now);
assert(golden.phase === 'Golden hour' && Math.abs(golden.elevation - 10) < .5, 'golden hour is the sun ten degrees up in the west');
assert(dusk.phase === 'Dusk' && dusk.lamp > .3 && dusk.stars < .3, 'dusk is blue, the lamps are lit and the first stars are faint');
assert(night.phase === 'Night' && night.stars > .5 && night.lamp === 1, 'night has stars and lamps');
assert(midday.keyLight[0] > golden.keyLight[0] * .9 && midday.keyLight[2] > golden.keyLight[2], 'midday light is whiter than golden hour');
for (let e = -20; e <= 70; e += .5) {
  const a = S.blend(e), b = S.blend(e + .5);
  assert(Math.abs(a.exposure - b.exposure) < .06 && Math.abs(a.power - b.power) < 1.1, `the light changes smoothly through ${e}°`);
}
const look = S.blend(15);
assert(look.power === 10.5 && look.exposure === 1.15 && look.sky[0] === 1.45, 'golden hour keeps the woods’ original look');
assert.equal(S.clock(az('2026-10-04T16:05')).text, '4:05 pm', 'Arizona’s clock reads true');
assert.equal(S.clock(new Date('2026-07-04T19:30:00Z')).text, '12:30 pm', 'and keeps no daylight saving');

console.log('PASS: sun and moon in their places, true phases, Polaris in the north, Arizona time, and light that follows the sun');
