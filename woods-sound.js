/* The sound of the woods, synthesised: nothing to download and silent until
   the walker asks for it. Wind follows the same gusts the trees sway to,
   birds call from the ridge by day, owls, coyotes and (in the fall rut) elk
   by night, and the creek is loudest on the bridge. */
const WoodsSound = (() => {
  let ctx = null, master = null, reverb = null, noise = null, wind = null, rustle = null, creek = [];
  let enabled = false, birdTimer = 0, lastUpdate = 0, night = 0, month = 9;

  function noiseBuffer(seconds) {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate), data = buffer.getChannelData(0);
    // Gently pinked noise: warmer than white, closer to air moving through needles.
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = .99765 * b0 + white * .099; b1 = .963 * b1 + white * .2965; b2 = .57 * b2 + white * 1.0526;
      data[i] = (b0 + b1 + b2 + white * .1848) * .2;
    }
    return buffer;
  }
  function room() {
    const length = Math.floor(ctx.sampleRate * 2.8), ir = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = ir.getChannelData(c);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3.4);
    }
    const node = ctx.createConvolver();
    node.buffer = ir;
    return node;
  }
  function pan(value) {
    if (!ctx.createStereoPanner) return ctx.createGain();
    const node = ctx.createStereoPanner();
    node.pan.value = value;
    return node;
  }
  function bed(type, frequency, q) {
    const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    source.buffer = noise; source.loop = true;
    filter.type = type; filter.frequency.value = frequency; filter.Q.value = q;
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(master);
    source.start(0, Math.random() * noise.duration);
    return {filter, gain};
  }
  function setup() {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return false;
    ctx = new Context();
    master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    reverb = room();
    const wet = ctx.createGain(); wet.gain.value = .55;
    reverb.connect(wet).connect(master);
    noise = noiseBuffer(5);
    wind = bed('lowpass', 420, .5);
    rustle = bed('bandpass', 3200, .6);
    creek = [bed('bandpass', 650, 1.6), bed('bandpass', 1700, 2.4), bed('lowpass', 320, .6)];
    return true;
  }

  function tone(start, from, to, length, volume, out, type = 'sine') {
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(to, start + length);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + Math.min(.018, length * .3));
    gain.gain.exponentialRampToValueAtTime(.0004, start + length);
    osc.connect(gain).connect(out);
    osc.start(start);
    osc.stop(start + length + .03);
  }
  function knock(start, volume, out) {
    const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    source.buffer = noise;
    filter.type = 'bandpass'; filter.frequency.value = 1100; filter.Q.value = 3;
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(.0004, start + .035);
    source.connect(filter).connect(gain).connect(out);
    source.start(start, Math.random() * 4, .05);
  }
  // A voice with a pitch that moves through a list of [time, frequency] points.
  function glide(start, points, volume, out, {type = 'sine', attack = .03, release = .12, vibrato = 0, rate = 5.5, filter = 0} = {}) {
    const osc = ctx.createOscillator(), gain = ctx.createGain(), end = start + points[points.length - 1][0];
    osc.type = type;
    osc.frequency.setValueAtTime(points[0][1], start);
    for (const [t, f] of points.slice(1)) osc.frequency.linearRampToValueAtTime(f, start + t);
    if (vibrato) {
      const lfo = ctx.createOscillator(), depth = ctx.createGain();
      lfo.frequency.value = rate; depth.gain.value = vibrato;
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(start); lfo.stop(end + release + .05);
    }
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + attack);
    gain.gain.setValueAtTime(volume, Math.max(start + attack, end - release));
    gain.gain.linearRampToValueAtTime(0, end);
    let node = osc;
    if (filter) { const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = filter; f.Q.value = 1.2; node = osc.connect(f); }
    node.connect(gain).connect(out);
    osc.start(start); osc.stop(end + .05);
  }
  function rasp(start, length, centre, volume, out) {
    const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    source.buffer = noise;
    filter.type = 'bandpass'; filter.frequency.value = centre; filter.Q.value = 2.5;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + .012);
    gain.gain.exponentialRampToValueAtTime(.0004, start + length);
    source.connect(filter).connect(gain).connect(out);
    source.start(start, Math.random() * 4, length + .05);
  }
  // The night shift, and the loud ones of the day.
  const calls = {
    // Great horned owl: a soft, low hoo, h'HOO, hoo, hoo.
    owl: (t, out) => [[0, .32], [.62, .14], [.8, .5], [1.5, .34], [2.05, .38]].forEach(([at, len]) => glide(t + at, [[0, 310], [len, 290]], .9, out, {attack: .06, release: len * .6})),
    // Coyotes off in the valley: yips that break into a wavering howl.
    coyotes: (t, out) => {
      for (let v = 0; v < 3; v++) {
        const base = 520 + v * 140 + Math.random() * 80, at = t + v * .7 + Math.random() * .4;
        for (let y = 0; y < 4; y++) glide(at + y * .22, [[0, base], [.12, base * 1.6]], .25, out, {type: 'triangle', attack: .01, release: .06, filter: 1300});
        glide(at + 1, [[0, base * 1.1], [.5, base * 2.1], [1.6, base * 1.9], [2.2, base * 1.2]], .32, out, {type: 'triangle', attack: .15, release: .5, vibrato: 18, rate: 6.5, filter: 1400});
      }
    },
    // Common poorwill, calling its name at dusk: poor-WILL.
    poorwill: (t, out) => { for (let k = 0; k < 3; k++) { glide(t + k * 1.6, [[0, 1350], [.16, 1250]], .5, out); glide(t + k * 1.6 + .22, [[0, 1500], [.28, 1720]], .55, out); } },
    // A bull elk bugling in the rut: a grunt, a rising whistle held high, then chuckles.
    elk: (t, out) => {
      glide(t, [[0, 140], [.35, 190]], .5, out, {type: 'sawtooth', filter: 380});
      glide(t + .25, [[0, 620], [.6, 1650], [1.9, 1720], [2.4, 900]], .55, out, {attack: .2, release: .4, vibrato: 28, rate: 7});
      glide(t + .25, [[0, 1240], [.6, 3300], [1.9, 3440], [2.4, 1800]], .12, out, {attack: .2, release: .4, vibrato: 50, rate: 7});
      for (let k = 0; k < 4; k++) glide(t + 2.9 + k * .32, [[0, 170], [.14, 130]], .45, out, {type: 'sawtooth', filter: 300, attack: .01, release: .08});
    },
    // Common raven: a hollow croak or two from over the rim.
    raven: (t, out) => { for (let k = 0, n = 1 + Math.floor(Math.random() * 3); k < n; k++) { glide(t + k * .45, [[0, 420], [.22, 360]], .5, out, {type: 'sawtooth', filter: 900, attack: .02, release: .1, vibrato: 30, rate: 38}); } },
    // Steller's jay: a harsh shack-shack-shack.
    jay: (t, out) => { for (let k = 0; k < 4; k++) { rasp(t + k * .17, .1, 2600, .6, out); glide(t + k * .17, [[0, 1500], [.08, 1300]], .12, out, {type: 'sawtooth', filter: 2000, attack: .005, release: .04}); } },
  };
  const songs = [
    // Canyon wren: clear whistles tumbling down the scale and slowing.
    (t, out) => { let f = 4400, gap = .07; for (let i = 0; i < 12; i++) { tone(t, f, f * .9, .06, .5, out); t += gap; f *= .945; gap *= 1.07; } },
    // Mountain chickadee: fee-bee-bee.
    (t, out) => { tone(t, 3950, 3850, .3, .45, out); tone(t + .4, 3320, 3180, .2, .38, out); tone(t + .66, 3300, 3150, .2, .32, out); },
    // Dark-eyed junco: a dry, even trill.
    (t, out) => { for (let i = 0; i < 17; i++) tone(t + i * .056, 5300, 4200, .034, .32, out); },
    // A woodpecker drumming somewhere down the ridge.
    (t, out) => { let gap = .045; for (let i = 0; i < 14; i++) { knock(t, .5, out); t += gap; gap *= 1.035; } },
    // Pygmy nuthatch chatter.
    (t, out) => { for (let i = 0; i < 6; i++) tone(t + i * .14 + Math.random() * .03, 4700, 5600, .07, .3, out, 'triangle'); },
  ];
  function scheduleBird(delay) {
    clearTimeout(birdTimer);
    birdTimer = setTimeout(() => {
      if (!enabled) return;
      if (ctx.state !== 'running') return scheduleBird(3);
      const out = ctx.createGain(), air = ctx.createBiquadFilter(), place = pan(Math.random() * 1.6 - .8);
      out.gain.value = .045 + Math.random() * .08;
      air.type = 'lowpass'; air.frequency.value = 4800 + Math.random() * 4000;
      out.connect(air).connect(place);
      place.connect(master); place.connect(reverb);
      // Who calls depends on the hour and the season: elk bugle in September
      // and October, poorwills sing through the warm months.
      const rut = month === 8 || month === 9, warm = month >= 3 && month <= 9;
      let pool, gap;
      if (night > .6) {
        pool = [calls.owl, calls.owl, calls.coyotes, ...(warm ? [calls.poorwill, calls.poorwill] : []), ...(rut ? [calls.elk, calls.elk] : [])];
        out.gain.value *= .9; gap = 7 + Math.random() * 12;
      } else if (night > .2) {
        pool = [...songs.slice(0, 3), calls.raven, ...(warm ? [calls.poorwill] : []), ...(rut ? [calls.elk] : [])];
        gap = 4 + Math.random() * 8;
      } else {
        pool = [...songs, ...songs, calls.raven, calls.jay, ...(rut ? [calls.elk] : [])];
        gap = 2.5 + Math.random() * 6.5;
      }
      const call = pool[Math.floor(Math.random() * pool.length)];
      // The big voices are far off down the valley: quieter, duller and wetter.
      if (call === calls.elk || call === calls.coyotes) { out.gain.value *= .55; air.frequency.value = 2400; }
      call(ctx.currentTime + .05, out);
      setTimeout(() => place.disconnect(), 8000);
      scheduleBird(gap);
    }, delay * 1000);
  }

  return {
    get enabled() { return enabled; },
    enable() {
      if (!ctx && !setup()) return false;
      enabled = true;
      ctx.resume();
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(.9, ctx.currentTime, .7);
      scheduleBird(1.2);
      return true;
    },
    disable() {
      enabled = false;
      clearTimeout(birdTimer);
      if (!ctx) return;
      master.gain.setTargetAtTime(0, ctx.currentTime, .2);
      setTimeout(() => { if (!enabled) ctx.suspend(); }, 900);
    },
    // The hour: 0 by day to 1 at night, and the month (0–11), for who is calling.
    setHour(dark, monthIndex) { night = dark; month = monthIndex; },
    // A camera's shutter: two soft clicks a moment apart.
    shutter() {
      if (!enabled || !ctx) return;
      const t = ctx.currentTime + .01;
      knock(t, .9, master); knock(t + .07, .6, master);
    },
    pause() { if (ctx) ctx.suspend(); },
    resume() { if (ctx && enabled) ctx.resume(); },
    // gust 0–1 from the same wind as the trees, creek 0–1 by distance, canopy 0–1.
    update(gust, near, canopy) {
      if (!enabled) return;
      const t = ctx.currentTime;
      if (t - lastUpdate < .08) return;
      lastUpdate = t;
      wind.gain.gain.setTargetAtTime(.06 + gust * .2, t, .4);
      wind.filter.frequency.setTargetAtTime(240 + gust * 560, t, .6);
      rustle.gain.gain.setTargetAtTime((.004 + gust * .05) * canopy, t, .3);
      // Babble: the creek's resonances wander a little, faster than the wind.
      creek[0].gain.gain.setTargetAtTime(near * .13, t, .3);
      creek[1].gain.gain.setTargetAtTime(near * .06, t, .3);
      creek[2].gain.gain.setTargetAtTime(near * .16, t, .5);
      creek[0].filter.frequency.setTargetAtTime(480 + Math.random() * 520, t, .04);
      creek[1].filter.frequency.setTargetAtTime(1300 + Math.random() * 1100, t, .03);
    },
  };
})();
if (typeof module !== 'undefined') module.exports = WoodsSound;
