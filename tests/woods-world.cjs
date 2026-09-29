/* Geometry checks for the 3D woods, without a browser: node tests/woods-world.cjs */
const assert = require('node:assert/strict');
const W = require('../woods-path.js');

// The tread: equal steps are equal distances, and the ground under the feet is the tread.
let previous = W.trail(0);
for (let d = .25; d <= W.JUNCTION; d += .25) {
  const t = W.trail(d);
  assert(Math.abs(Math.hypot(t.x - previous.x, t.z - previous.z) - .25) < .01, `steps stay even at d=${d}`);
  assert(Math.abs(Math.hypot(t.tx, t.tz) - 1) < 1e-9, 'tangent is a unit vector');
  const onBridge = Math.abs(d - W.CREEK) < W.BRIDGE + .2;
  if (!onBridge) assert(Math.abs(W.height(t.x, t.z) - W.rise(d)) < .02, `feet stay on the ground at d=${d.toFixed(2)}`);
  previous = t;
}
assert(Math.hypot(W.trail(W.JUNCTION).x - W.J.x, W.trail(W.JUNCTION).z - W.J.z) < 1e-6, 'the trail ends at the signpost');

// The creek crosses exactly once, under the bridge, and the bridge ends rest on its banks.
let crossings = 0;
for (let d = W.BEGIN + 1; d < W.JUNCTION; d += .25) {
  const a = W.trail(d), near = W.creekDistance(a.x, a.z);
  if (near < 1) crossings += W.creekDistance(W.trail(d + .25).x, W.trail(d + .25).z) >= near && W.creekDistance(W.trail(d - .25).x, W.trail(d - .25).z) > near ? 1 : 0;
}
assert.equal(crossings, 1, 'one creek crossing');
const middle = W.trail(W.CREEK);
assert(W.creekDistance(middle.x, middle.z) < .3, 'the bridge is centred on the creek');
assert(W.DECK - W.height(middle.x, middle.z) > 1, 'the bed is well below the deck');
for (const end of [-1, 1]) {
  const t = W.trail(W.CREEK + end * W.BRIDGE);
  assert(Math.abs(W.height(t.x, t.z) - W.DECK) < .12, 'each end of the bridge meets its bank');
}
for (let i = 0; i < W.creekLine.xs.length; i++) assert(W.J.z - W.creekLine.zs[i] < 8, 'the creek never runs out over the valley');

// Planting keeps the walk clear.
const forest = W.plant();
for (const tree of forest.trees) {
  const s = W.site(tree.x, tree.z);
  assert(s.path > 1.3, `no tree on the trail (${tree.kind} at ${s.path.toFixed(2)} m)`);
  assert(s.creek > 3, 'no tree in the creek');
  assert(s.jd > 6.9, 'the junction clearing is open');
  if (tree.height > 5) assert(s.path > 1.9, 'big trunks keep a stride off the tread');
}
for (const list of ['rocks', 'ferns', 'shrubs']) for (const item of forest[list]) assert(W.site(item.x, item.z).path > .9, `no ${list} on the trail`);
for (const blade of W.grass(3000)) assert(W.site(blade.x, blade.z).path > .75, 'no grass on the tread');
for (const log of forest.logs) {
  for (let k = -.5; k <= .5; k += .05) {
    const x = log.x + log.ax * log.length * k, z = log.z + log.az * log.length * k, s = W.site(x, z);
    if (s.creek > 4.3) assert(s.path > log.radius + .6, 'fallen logs lie beside the trail, not across it');
  }
}
assert(forest.trees.length > 1200 && forest.trees.length < 4000, `a forest of manageable size (${forest.trees.length})`);

// The walker: always on the tread at eye height, never turning abruptly, and every screen frames the sign.
function project(pose, point, fov, aspect) {
  const dx = point.x - pose.x, dy = point.y - pose.y, dz = point.z - pose.z;
  const cy = Math.cos(pose.yaw), sy = Math.sin(pose.yaw), cp = Math.cos(pose.pitch), sp = Math.sin(pose.pitch);
  const x1 = dx * cy - dz * sy, z1 = dx * sy + dz * cy;          // undo yaw
  const y2 = dy * cp + z1 * sp, z2 = z1 * cp - dy * sp;           // undo pitch
  const f = 1 / Math.tan(fov * W.DEG / 2);
  return {x: .5 + x1 / -z2 * f / aspect / 2, y: .5 - y2 / -z2 * f / 2, depth: -z2};
}
for (const aspect of [390 / 844, 320 / 740, 768 / 1024, 1366 / 900, 1920 / 1080, 844 / 390]) {
  const a = W.arrival(aspect);
  let before = W.pose(0, aspect);
  for (let i = 1; i <= 400; i++) {
    const d = a.d * i / 400, pose = W.pose(d, aspect);
    assert(Math.abs(pose.y - (W.rise(d) + W.EYE)) < 1e-9, 'eyes at walking height');
    let turn = Math.abs(pose.yaw - before.yaw); if (turn > Math.PI) turn = 2 * Math.PI - turn;
    assert(turn < .04, `no sudden turns (d=${d.toFixed(1)}, ${turn.toFixed(3)})`);
    // The trail a few steps ahead stays in view.
    const ahead = W.trail(Math.min(d + 4, W.JUNCTION)), view = project(pose, {x: ahead.x, y: W.rise(Math.min(d + 4, W.JUNCTION)), z: ahead.z}, a.fov, aspect);
    if (d < a.d - 6) assert(view.x > .1 && view.x < .9 && view.depth > 0, `the path ahead stays on screen (d=${d.toFixed(1)}, x=${view.x.toFixed(2)})`);
    before = pose;
  }
  const end = W.pose(a.d, aspect);
  for (const x of [-W.SIGN.width / 2, W.SIGN.width / 2]) for (const y of [W.SIGN.bottom, W.SIGN.top]) {
    const q = project(end, {x: W.SIGN.x + x, y: W.JY + y, z: W.SIGN.z + .12}, a.fov, aspect);
    assert(q.x > .08 && q.x < .92, `sign fits across at aspect ${aspect.toFixed(2)} (${q.x.toFixed(2)})`);
    assert(q.y > .26 && q.y < .9, `sign sits under the arrival title at aspect ${aspect.toFixed(2)} (${q.y.toFixed(2)})`);
  }
  // Over the ridge, nothing tall stands between the walker and the peaks.
  for (const tree of forest.trees) {
    const q = project(end, {x: tree.x, y: tree.y + tree.height, z: tree.z}, a.fov, aspect);
    if (q.depth > 12 && q.x > .3 && q.x < .7) assert(q.y > .45, `the view to the peaks stays open (tree at ${tree.x.toFixed(1)}, ${tree.z.toFixed(1)})`);
  }
}
// A tree beside the trail is approached, then passed and left behind.
const a = W.arrival(1.5), mark = W.trail(40), tree = {x: mark.x - mark.tz * 3, y: W.rise(40) + 2, z: mark.z + mark.tx * 3};
assert(project(W.pose(30, 1.5), tree, a.fov, 1.5).depth > 0, 'a trailside tree starts ahead');
assert(project(W.pose(50, 1.5), tree, a.fov, 1.5).depth < 0, 'and ends up behind');
// The gait: a walk, then a run with a real bound in it, then a glide. Going
// faster lengthens the stride instead of playing the same walk faster, and a
// fling floats rather than jittering.
const still = W.stride(0);
assert(still.walk === 0 && still.run === 0 && still.float === 0, 'standing still has no gait');
assert(W.stride(2.8).walk > .95, 'an easy scroll walks');
assert(W.stride(10).run > .95, 'a brisk scroll runs');
assert(W.stride(30).float === 1 && W.stride(30).walk === 0 && W.stride(30).run === 0, 'a fling glides');
for (let v = 0; v <= 80; v += .25) {
  const g = W.stride(v);
  assert(g.cadence <= 3.1, `cadence stays a runner's, never a sped-up walk (${v} m/s: ${g.cadence.toFixed(2)} steps/s)`);
  assert(Math.abs(g.walk + g.run + g.float - W.smooth(.2, 1.1, v) * (1 - g.float) - g.float) < 1e-9, 'the gaits hand over without a gap');
}
assert(W.stride(12).cadence / W.stride(2.8).cadence < 1.6, 'running four times as fast takes well under twice the steps');
let rise = 0, fall = 0, last = W.bob(0, W.stride(10));
for (let t = .001; t <= 4; t += .001) {
  const run = W.bob(t, W.stride(10)), walk = W.bob(t, W.stride(2.8)), glide = W.bob(t, W.stride(40));
  assert(Math.abs(run.y - last.y) < .0015, 'the running bound is smooth, with no jolt at landing');
  rise = Math.max(rise, run.y); fall = Math.min(fall, run.y);
  assert(walk.y <= 1e-9 && walk.y >= -.031, 'a walk dips at each heel strike and no more');
  assert(glide.y === 0 && glide.x === 0 && glide.roll === 0, 'a glide carries no footfall at all');
  last = run;
}
assert(rise > .03 && fall < -.03, `a run leaves the ground and sinks into each landing (${fall.toFixed(3)} to ${rise.toFixed(3)} m)`);
assert(W.bob(0, W.stride(40)).lift > .4, 'a glide lifts the walker off the tread');

console.log(`PASS: even tread, one creek crossing and a bridge on its banks, ${forest.trees.length} trees clear of the walk, smooth heading, framed arrival and an open view, and a walk that runs and glides`);
