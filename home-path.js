/* A small perspective world shared by the road, scenery and signpost.
   Distances are world units; SVG artwork is projected from a walking camera. */
const TrailWorld = (() => {
  const JUNCTION = 100, SIGN_UNIT = .012, EYE = 1.8, NEAR = .3;
  const clamp = x => Math.max(0, Math.min(1, x));
  function center(z) {
    if (z <= 0 || z >= 88) return 0;
    return 5 * Math.sin(2 * Math.PI * z / 75) * Math.sin(Math.PI * z / 88) ** 2;
  }
  function slope(z) { return (center(z + .01) - center(z - .01)) / .02; }
  // Arc length makes equal scroll distances equal walking distances, including bends.
  const stations = [{z:0, s:0}];
  for (let z = .1; z <= 100.01; z += .1) {
    const last = stations[stations.length - 1];
    stations.push({z, s:last.s + Math.hypot(z - last.z, center(z) - center(last.z))});
  }
  function lengthAt(z) {
    const i = Math.min(stations.length - 2, Math.floor(z * 10));
    return stations[i].s + (stations[i + 1].s - stations[i].s) * (z * 10 - i);
  }
  function stationAt(s) {
    let lo = 0, hi = stations.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (stations[mid].s < s) lo = mid; else hi = mid; }
    const a = stations[lo], b = stations[hi];
    return a.z + (b.z - a.z) * (s - a.s) / (b.s - a.s);
  }
  function camera(progress, width, height) {
    const ppu = Math.max(width / 1440, height / 900);
    const vw = width / ppu, vh = height / ppu;
    const finalScale = Math.min(1.05, vw * .88 / 640, vh * .66 / 635);
    const focal = Math.min(720, vw * 1.35);
    const stop = JUNCTION - focal * SIGN_UNIT / finalScale;
    const s = clamp(progress) * lengthAt(stop);
    const z = stationAt(s), x = center(z);
    // Face the trail tangent. We turn because the route turns, not because of a zoom.
    const heading = Math.atan(slope(z));
    const base = 900 - vh * .4 + 635 * finalScale * .5;
    const horizon = base - EYE * finalScale / SIGN_UNIT;
    // Small, scroll-bound footfalls taper away at both ends; no idle animation.
    const envelope = Math.sin(Math.PI * clamp(progress)) ** 2;
    return {x,z,s,heading,focal, horizon:horizon + Math.sin(s * Math.PI / 1.7) * 1.1 * envelope,
      eye:EYE, sin:Math.sin(heading), cos:Math.cos(heading), vw,vh,stop};
  }
  function relative(point, cam) {
    const dx = point.x - cam.x, dz = point.z - cam.z;
    return {x:dx * cam.cos - dz * cam.sin, z:dx * cam.sin + dz * cam.cos, y:point.y || 0};
  }
  function projectRelative(p, cam) {
    const scale = cam.focal / p.z;
    return {x:720 + p.x * scale, y:cam.horizon + (cam.eye - p.y) * scale, scale, depth:p.z};
  }
  function project(point, cam) { return projectRelative(relative(point, cam), cam); }
  // Clip polygons against the camera's near plane; never fade or swap roads.
  function polygon(points, cam) {
    const input = points.map(p => relative(p, cam)), clipped = [];
    for (let i = 0; i < input.length; i++) {
      const a = input[i], b = input[(i + 1) % input.length];
      if (a.z >= NEAR) clipped.push(a);
      if ((a.z >= NEAR) !== (b.z >= NEAR)) {
        const t = (NEAR - a.z) / (b.z - a.z);
        clipped.push({x:a.x + (b.x - a.x) * t,z:NEAR,y:a.y + (b.y - a.y) * t});
      }
    }
    return clipped.length < 3 ? '' : clipped.map((p,i) => {
      const q = projectRelative(p,cam);
      return `${i ? 'L' : 'M'}${q.x.toFixed(2)} ${q.y.toFixed(2)}`;
    }).join('') + 'Z';
  }
  function ribbon(points, width) {
    const left = [], right = [];
    points.forEach((p,i) => {
      const a = points[Math.max(0,i-1)], b = points[Math.min(points.length-1,i+1)];
      const len = Math.hypot(b.x-a.x,b.z-a.z), nx=(b.z-a.z)/len, nz=-(b.x-a.x)/len;
      left.push({x:p.x-nx*width,z:p.z-nz*width});
      right.push({x:p.x+nx*width,z:p.z+nz*width});
    });
    return left.concat(right.reverse());
  }
  const route = Array.from({length:221},(_,i) => {const z=-10+i*.5; return {x:center(z),z};});
  const forks = [-1,1].map(side => Array.from({length:101},(_,i) => {
    const t=i/100;
    return {x:side*42*t*t,z:JUNCTION+56*t};
  }));
  const roads = [route,...forks];
  function road(cam, extra=0) {return roads.map(points => polygon(ribbon(points,1.08+extra),cam)).join('');}
  return {JUNCTION,SIGN_UNIT,NEAR,center,slope,camera,project,relative,polygon,road};
})();
if (typeof module !== 'undefined') module.exports = TrailWorld;
