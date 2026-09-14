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
  const world = TrailWorld;
  const objectLayer = home.querySelector('.walking-objects');
  const signHome = sign.parentNode;
  const signNext = sign.nextSibling;
  const floor = home.querySelector('.world-floor');
  const road = home.querySelector('.world-road');
  const roadEdge = home.querySelector('.world-road-edge');
  const objects = [];
  const trees = [];
  let visibleTrees = [];
  const groundDetails = [];
  const svg = (tag, attrs, parent) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([key,value]) => el.setAttribute(key,value));
    parent.appendChild(el);
    return el;
  };
  // Fixed landmarks, planted once. They pass the walker and stay behind them.
  for (let i=0; i<42; i++) {
    const z=8+i*3.5;
    for (const side of [-1,1]) {
      for (let row=0; row<2; row++) {
        const seed=Math.sin(i*17.3+side*6+row*13)*.5+.5;
        const x=world.center(z)+side*(4.5+seed*2+row*9);
        // Camera placement and wind deformation have separate coordinate spaces.
        const el=svg('g',{'class':'walking-tree',fill:row ? '#52715a' : '#355940','aria-hidden':'true'},objectLayer);
        const bend=svg('g',{},el);
        svg('path',{d:'M-3 0 0-142 4 0Z',fill:'#394536'},bend);
        svg('path',{d:'M-15-81-41-36-22-42-53-5 0-18 51-5 23-43 39-36 16-83 0-98Z'},bend);
        svg('path',{d:'M0-94V-23M0-94 16-70M-2-78-25-50M0-51 26-29',fill:'none',stroke:'#e4e3bc','stroke-width':'1.2',opacity:'.2'},bend);
        const crown=svg('g',{},bend);
        svg('path',{d:'M0-155-16-112-8-114-29-77-15-81 0-87 16-83 30-76 9-116 18-110Z'},crown);
        svg('path',{d:'M0-138V-87M0-113-13-94',fill:'none',stroke:'#e4e3bc','stroke-width':'1.2',opacity:'.2'},crown);
        const tree={el,bend,crown,x,z:z+side*.7,height:5.3+seed*3.7,phase:seed*6.28,flex:.7+seed*.5};
        objects.push(tree);
        trees.push(tree);
      }
    }
  }
  for (let i=0; i<120; i++) {
    const z=2+i*.83, x=world.center(z)+Math.sin(i*9.4)*.86;
    const el=svg('ellipse',{rx:'.07',ry:'.028'},home.querySelector('.world-gravel'));
    groundDetails.push({el,x,z});
  }
  const patches=[];
  for (let i=0;i<22;i++) {
    const z=i*7, side=i%2 ? 1 : -1, x=world.center(z)+side*6;
    const points=Array.from({length:18},(_,j) => {const t=j*Math.PI/9;return {x:x+Math.cos(t)*4,z:z+Math.sin(t)*5};});
    patches.push({el:svg('path',{},home.querySelector('.world-clearings')),points});
  }
  objects.push({el:sign,x:0,z:world.JUNCTION,sign:true});
  let objectOrder='';
  function drawWorld(p) {
    const cam=world.camera(p,stage.clientWidth,stage.clientHeight);
    visibleTrees=[];
    floor.setAttribute('d',`M-400 ${cam.horizon}H1840V1200H-400Z`);
    roadEdge.setAttribute('d',world.road(cam,.045));
    road.setAttribute('d',world.road(cam));
    patches.forEach(patch => patch.el.setAttribute('d',world.polygon(patch.points,cam)));
    groundDetails.forEach(item => {
      const q=world.project(item,cam);
      item.el.style.display=q.depth>world.NEAR ? '' : 'none';
      if (q.depth>world.NEAR) item.el.setAttribute('transform',`translate(${q.x} ${q.y}) scale(${q.scale})`);
    });
    const sorted=objects.map((item,id) => {
      const q=world.project(item,cam);
      const scale=q.scale*(item.sign ? world.SIGN_UNIT : item.height/155);
      item.el.style.display=q.depth>world.NEAR ? '' : 'none';
      if (q.depth>world.NEAR) {
        item.el.style.transform=`translate(${q.x}px, ${q.y}px) scale(${scale})`;
        if (!item.sign) item.el.style.opacity=String(Math.max(.55,1-q.depth/310));
        if (!item.sign && q.x+65*scale>720-cam.vw/2 && q.x-65*scale<720+cam.vw/2 && q.y-165*scale<900) visibleTrees.push(item);
      }
      return {item,id,depth:q.depth};
    }).sort((a,b)=>b.depth-a.depth);
    const order=sorted.map(o=>o.id).join(',');
    if (order!==objectOrder) { sorted.forEach(o=>objectLayer.appendChild(o.item.el)); objectOrder=order; }
    // The horizon panorama rotates with our heading, at a much greater distance.
    for (const name of ['sky','far','ridge']) {
      const factor={sky:.55,far:.8,ridge:1}[name];
      layers[name].style.transform=`translate(${-Math.tan(cam.heading)*cam.focal*factor}px, ${cam.horizon-655}px)`;
    }
  }
  const layers = Object.fromEntries([...home.querySelectorAll('[data-depth]')].map(el => [el.dataset.depth, el]));
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const shortScreen = window.matchMedia('(max-height: 580px)');
  const windButton = home.querySelector('.wind-toggle');
  let windPaused = false;
  let stageVisible = true;
  let windFrame = 0;
  let windTime = 0;
  let windLast = 0;
  // Shared world-space gusts travel through neighboring trees. Individual
  // branch frequencies keep the forest from moving like a synchronized loop.
  function animateWind(now) {
    windFrame = 0;
    if (windLast) windTime += Math.min(now-windLast,64)/1000;
    windLast = now;
    visibleTrees.forEach(tree => {
      const t=windTime-tree.x*.12-tree.z*.035;
      const gust=Math.pow(.5+.5*Math.sin(t*.62),3);
      const breeze=.22+gust*1.35+Math.sin(t*1.17+tree.phase)*.3;
      const bend=breeze*tree.flex;
      const flutter=Math.sin(t*2.7+tree.phase)*(.12+gust*.22);
      tree.bend.setAttribute('transform',`skewX(${(-bend).toFixed(3)})`);
      tree.crown.setAttribute('transform',`rotate(${(bend*.55+flutter).toFixed(3)} 0 -87)`);
    });
    windFrame=requestAnimationFrame(animateWind);
  }
  function configureWind() {
    cancelAnimationFrame(windFrame);
    windFrame=0;
    windLast=0;
    windButton.hidden=!active;
    if (!active || windPaused) trees.forEach(tree => {
      tree.bend.removeAttribute('transform');
      tree.crown.removeAttribute('transform');
    });
    if (active && !windPaused && stageVisible && !document.hidden) windFrame=requestAnimationFrame(animateWind);
  }
  windButton.addEventListener('click', () => {
    windPaused=!windPaused;
    windButton.textContent=windPaused ? 'Resume wind' : 'Pause wind';
    configureWind();
  });
  new IntersectionObserver(entries => {
    stageVisible=entries[0].isIntersecting;
    configureWind();
  }).observe(stage);
  document.addEventListener('visibilitychange', configureWind);
  let frame = 0;
  let active = false;
  let start = 0;
  let distance = 1;
  let previousStop = '';
  let previousReady = null;
  let focusOnArrival = false;
  let journeyFrame = 0;
  function cancelJourney() {
    if (!journeyFrame) return;
    cancelAnimationFrame(journeyFrame);
    journeyFrame = 0;
    focusOnArrival = false;
  }
  function walkToJunction() {
    cancelAnimationFrame(journeyFrame);
    const from = window.scrollY;
    const remaining = Math.min(1, Math.abs(start + distance - from) / distance);
    const duration = 1800 + 3000 * Math.sqrt(remaining);
    const began = performance.now();
    function advance(now) {
      const t = Math.min(1, (now - began) / duration);
      // Quintic easing has zero velocity and acceleration at both ends.
      const eased = t * t * t * (10 + t * (-15 + 6 * t));
      window.scrollTo({top:from + (start + distance - from) * eased, behavior:'instant'});
      schedule();
      journeyFrame = t < 1 ? requestAnimationFrame(advance) : 0;
    }
    journeyFrame = requestAnimationFrame(advance);
  }
  // A guided walk is optional: any deliberate input immediately hands control back.
  window.addEventListener('wheel', cancelJourney, {passive:true});
  window.addEventListener('touchstart', cancelJourney, {passive:true});
  window.addEventListener('pointerdown', cancelJourney, {passive:true});
  window.addEventListener('keydown', event => {
    if (['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' ','Escape','Tab'].includes(event.key)) cancelJourney();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelJourney(); });
  const clamp = value => Math.max(0, Math.min(1, value));
  const ease = value => { const t = clamp(value); return t * t * (3 - 2 * t); };

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
    const travel = clamp(p / .94);
    drawWorld(travel);
    show(intro, 1 - ease((p - .025) / .2));
    intro.style.transform = `translateY(${-Math.min(p, .3) * 180}px)`;
    show(arrival, ease((p - .8) / .14));
    colophon.style.opacity = ease((p - .82) / .12).toFixed(3);
    progressBar.style.transform = `scaleX(${travel})`;
    enableSigns(p >= .94);
    const stop = p < .23 ? '00' : p < .94 ? '01' : '02';
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
    schedule();
  }

  function configure() {
    active = !motion.matches && !shortScreen.matches;
    home.classList.toggle('journey-motion', active);
    if (active) { objectLayer.appendChild(sign); objectOrder=''; }
    else signHome.insertBefore(sign,signNext);
    if (!active) {
      cancelJourney();
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
    configureWind();
  }

  home.querySelectorAll('a[href="#trail-junction"]').forEach(link => {
    link.addEventListener('click', event => {
      if (!active || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      focusOnArrival = event.detail === 0 || link.classList.contains('trail-skip');
      history.replaceState(null, '', '#trail-junction');
      walkToJunction();
    });
  });
  home.querySelector('.trail-return').addEventListener('click', event => {
    if (!active || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    cancelJourney();
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
