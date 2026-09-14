/* The signpost belongs to the SVG world from the first frame to the last. */
(() => {
  const home = document.querySelector('.trail-home');
  if (!home) return;
  home.classList.add('trail-ready');
  const walk = home.querySelector('.trail-walk');
  const stage = home.querySelector('.walk-stage');
  const intro = home.querySelector('.trail-intro');
  const arrival = home.querySelector('.arrival-copy');
  const sign = home.querySelector('.junction-sign');
  const signs = [...sign.querySelectorAll('.sign-link')];
  const progressBar = home.querySelector('.walk-progress span');
  const mile = home.querySelector('.mile-number');
  const mileCopy = home.querySelector('.mile-copy');
  const colophon = home.querySelector('.scene-colophon');
  const layers = Object.fromEntries([...home.querySelectorAll('[data-depth]')].map(el => [el.dataset.depth, el]));
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const shortScreen = window.matchMedia('(max-height: 580px)');
  let frame = 0;
  let active = false;
  let start = 0;
  let distance = 1;
  let finalScale = .9;
  let finalBase = 840;
  let previousStop = '';
  let previousReady = null;
  let focusOnArrival = false;
  const clamp = value => Math.max(0, Math.min(1, value));
  const ease = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;

  function show(el, opacity) {
    el.style.opacity = opacity.toFixed(3);
    const hidden = opacity < .02;
    el.style.visibility = hidden ? 'hidden' : 'visible';
    el.inert = hidden;
  }

  function enableSigns(ready) {
    if (ready === previousReady) return;
    previousReady = ready;
    home.classList.toggle('at-junction', ready);
    // Tiny distant signs are scenery; a skip link always brings them close.
    // SVG links do not consistently inherit HTML inert across browsers.
    sign.setAttribute('aria-hidden', String(!ready));
    signs.forEach(link => link.setAttribute('tabindex', ready ? '0' : '-1'));
  }

  function render() {
    frame = 0;
    if (!active) return;
    const p = clamp((window.scrollY - start) / distance);
    const travel = ease(p / .9);
    const scale = .065 * Math.pow(finalScale / .065, travel);
    show(intro, 1 - ease((p - .025) / .2));
    intro.style.transform = `translateY(${-Math.min(p, .3) * 180}px)`;
    // Mountains remain in view while nearby trees move past the camera.
    layers.sky.style.transform = `translateY(${-travel * 50}px)`;
    layers.far.style.transform = `translateY(${-travel * 60}px) scale(${1 + travel * .13})`;
    layers.ridge.style.transform = `translateY(${-travel * 38}px) scale(${1 + travel * .3})`;
    layers.wood.style.transform = `translateY(${travel * 5}px) scale(${1 + travel * .85})`;
    layers.meadow.style.transform = `translateY(${travel * 70}px) scale(${1 + travel * 1.2})`;
    layers['front-left'].style.transform = `translate(${-travel * 370}px, ${travel * 100}px) scale(${1 + travel * .65})`;
    layers['front-right'].style.transform = `translate(${travel * 370}px, ${travel * 100}px) scale(${1 + travel * .65})`;
    sign.style.transform = `translate(${lerp(775, 720, travel)}px, ${lerp(698, finalBase, travel)}px) scale(${scale})`;
    show(arrival, ease((p - .7) / .18));
    colophon.style.opacity = ease((p - .82) / .12).toFixed(3);
    progressBar.style.transform = `scaleX(${clamp(p / .9)})`;
    enableSigns(p >= .87);
    const stop = p < .23 ? '00' : p < .87 ? '01' : '02';
    if (stop !== previousStop) {
      previousStop = stop;
      mile.textContent = stop;
      mileCopy.textContent = {'00':'THE TRAILHEAD','01':'APPROACHING THE JUNCTION','02':'CHOOSE YOUR TRAIL'}[stop];
    }
    if (focusOnArrival && p >= .995) {
      focusOnArrival = false;
      signs[0].focus({preventScroll:true});
    }
  }

  function schedule() {
    if (active && !frame) frame = requestAnimationFrame(render);
  }

  function measure() {
    start = walk.getBoundingClientRect().top + window.scrollY;
    distance = Math.max(1, walk.offsetHeight - stage.offsetHeight);
    // SVG uses xMidYMax slice. Fit the *same* sign into its visible camera
    // window, instead of swapping in a different mobile/desktop drawing.
    const pixelsPerUnit = Math.max(stage.clientWidth / 1440, stage.clientHeight / 900);
    const visibleWidth = stage.clientWidth / pixelsPerUnit;
    const visibleHeight = stage.clientHeight / pixelsPerUnit;
    finalScale = Math.min(1.05, visibleWidth * .88 / 640, visibleHeight * .66 / 635);
    const signHeight = 635 * finalScale * pixelsPerUnit;
    const basePixels = stage.clientHeight * .6 + signHeight * .5;
    finalBase = 900 - (stage.clientHeight - basePixels) / pixelsPerUnit;
    schedule();
  }

  function configure() {
    active = !motion.matches && !shortScreen.matches;
    home.classList.toggle('journey-motion', active);
    if (!active) {
      cancelAnimationFrame(frame);
      frame = 0;
      focusOnArrival = false;
      [intro, arrival, sign, colophon, progressBar, ...Object.values(layers)].forEach(el => el.removeAttribute('style'));
      intro.inert = false;
      arrival.inert = false;
      enableSigns(true);
    }
    measure();
    // Set the opening immediately; do not flash the large fallback sign.
    if (active) { cancelAnimationFrame(frame); render(); }
  }

  home.querySelectorAll('a[href="#trail-junction"]').forEach(link => {
    link.addEventListener('click', event => {
      if (!active || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      focusOnArrival = event.detail === 0 || link.classList.contains('trail-skip');
      history.replaceState(null, '', '#trail-junction');
      window.scrollTo({top:start + distance, behavior:'smooth'});
      schedule();
    });
  });
  home.querySelector('.trail-return').addEventListener('click', event => {
    if (!active || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    focusOnArrival = false;
    history.replaceState(null, '', location.pathname + location.search);
    window.scrollTo({top:0, behavior:'smooth'});
    // The focus target stays available when the sign shrinks back away.
    home.querySelector('.brand a').focus({preventScroll:true});
  });
  function restoreAnchor() {
    if (active && location.hash === '#trail-junction') window.scrollTo({top:start + distance, behavior:'instant'});
  }
  window.addEventListener('scroll', schedule, {passive:true});
  window.addEventListener('resize', measure, {passive:true});
  window.addEventListener('pageshow', () => { measure(); restoreAnchor(); });
  window.addEventListener('hashchange', restoreAnchor);
  motion.addEventListener('change', configure);
  shortScreen.addEventListener('change', configure);
  configure();
  restoreAnchor();
})();
