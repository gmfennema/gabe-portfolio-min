/* A native-scroll camera, progressively enhanced over a complete static page. */
(() => {
  const home = document.querySelector('.trail-home');
  if (!home) return;
  home.classList.add('trail-ready');
  const walk = home.querySelector('.trail-walk');
  const stage = home.querySelector('.walk-stage');
  const intro = home.querySelector('.trail-intro');
  const thought = home.querySelector('.trail-thought');
  const shade = home.querySelector('.walk-shade');
  const stamp = home.querySelector('.trail-stamp');
  const progressBar = home.querySelector('.walk-progress span');
  const mile = home.querySelector('.mile-number');
  const mileCopy = home.querySelector('.mile-copy');
  const trace = home.querySelector('.trail-trace');
  const layers = Object.fromEntries([...home.querySelectorAll('[data-depth]')].map(el => [el.dataset.depth, el]));
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const shortScreen = window.matchMedia('(max-height: 580px)');
  let frame = 0;
  let active = false;
  let start = 0;
  let distance = 1;
  let currentMile = '';
  const clamp = value => Math.max(0, Math.min(1, value));
  const ease = value => { const t = clamp(value); return t * t * (3 - 2 * t); };

  function show(el, opacity) {
    el.style.opacity = opacity.toFixed(3);
    const hidden = opacity < .02;
    el.style.visibility = hidden ? 'hidden' : 'visible';
    el.inert = hidden;
  }

  function render() {
    frame = 0;
    if (!active) return;
    const p = clamp((window.scrollY - start) / distance);
    const forward = ease(p);
    show(intro, 1 - ease((p - .04) / .22));
    intro.style.transform = `translateY(${-p * 95}px)`;
    show(thought, ease((p - .24) / .21));
    thought.style.transform = `translateY(${(1 - ease((p - .24) / .3)) * 35}px)`;
    stamp.style.opacity = (1 - ease(p / .25)).toFixed(3);
    layers.sky.style.transform = `translateY(${-forward * 35}px)`;
    layers.far.style.transform = `translateY(${-forward * 38}px) scale(${1 + forward * .17})`;
    layers.ridge.style.transform = `translateY(${-forward * 25}px) scale(${1 + forward * .34})`;
    layers.wood.style.transform = `translateY(${forward * 18}px) scale(${1 + forward * .62})`;
    layers.meadow.style.transform = `translateY(${forward * 45}px) scale(${1 + forward * .72})`;
    layers['front-left'].style.transform = `translate(${-forward * 245}px, ${forward * 80}px) scale(${1 + forward * .8})`;
    layers['front-right'].style.transform = `translate(${forward * 245}px, ${forward * 80}px) scale(${1 + forward * .8})`;
    shade.style.opacity = ease((p - .12) / .26).toFixed(3);
    trace.style.strokeDashoffset = (1 - forward).toFixed(3);
    progressBar.style.transform = `scaleX(${p})`;
    const nextMile = p < .25 ? '00' : p < .85 ? '01' : '02';
    if (nextMile !== currentMile) {
      currentMile = nextMile;
      mile.textContent = nextMile;
      mileCopy.textContent = { '00': 'THE TRAILHEAD', '01': 'ALONG THE WAY', '02': 'THE JUNCTION' }[nextMile];
    }
  }

  function schedule() {
    if (active && !frame) frame = requestAnimationFrame(render);
  }

  function measure() {
    start = walk.getBoundingClientRect().top + window.scrollY;
    distance = Math.max(1, walk.offsetHeight - stage.offsetHeight);
    schedule();
  }

  function configure() {
    active = !motion.matches && !shortScreen.matches;
    home.classList.toggle('journey-motion', active);
    if (!active) {
      cancelAnimationFrame(frame);
      frame = 0;
      [intro, thought, shade, stamp, trace, progressBar, ...Object.values(layers)].forEach(el => el.removeAttribute('style'));
      intro.inert = false;
      thought.inert = false;
    }
    measure();
  }

  // Native links work without JS. In the pinned scene, this anchor needs its
  // story's scroll position, rather than the element's sticky screen position.
  home.querySelector('.walk-invitation').addEventListener('click', event => {
    if (!active || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const destination = start + distance * .53;
    window.scrollTo({ top: destination, behavior: 'smooth' });
  });
  function restoreStoryAnchor() {
    if (active && location.hash === '#along-the-way') window.scrollTo({ top: start + distance * .53, behavior: 'instant' });
  }
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', measure, { passive: true });
  window.addEventListener('pageshow', () => { measure(); restoreStoryAnchor(); });
  window.addEventListener('hashchange', restoreStoryAnchor);
  motion.addEventListener('change', configure);
  shortScreen.addEventListener('change', configure);
  configure();
  restoreStoryAnchor();

  // The highlighted route follows both a mouse and a keyboard focus.
  const junction = home.querySelector('.junction-map');
  const branches = [...junction.querySelectorAll('[data-branch]')];
  function highlight(name) {
    branches.forEach(branch => branch.classList.toggle('is-active', branch.dataset.branch === name));
  }
  junction.querySelectorAll('[data-trail]').forEach(sign => {
    sign.addEventListener('pointerenter', () => highlight(sign.dataset.trail));
    sign.addEventListener('focus', () => highlight(sign.dataset.trail));
    sign.addEventListener('pointerleave', () => highlight(document.activeElement?.dataset.trail));
    sign.addEventListener('blur', () => highlight(''));
  });
})();
