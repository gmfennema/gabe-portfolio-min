/* The sound of the woods, synthesised: nothing to download and silent until
   the walker asks for it. Wind follows the same gusts the trees sway to,
   birds call from the ridge, and the creek is loudest on the bridge. */
const WoodsSound = (() => {
  let ctx = null, master = null, reverb = null, noise = null, wind = null, rustle = null, creek = [];
  let enabled = false, birdTimer = 0, lastUpdate = 0;

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
      songs[Math.floor(Math.random() * songs.length)](ctx.currentTime + .05, out);
      setTimeout(() => place.disconnect(), 5000);
      scheduleBird(2.5 + Math.random() * 6.5);
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
