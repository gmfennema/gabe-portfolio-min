/* Geometry checks run without a browser: node tests/trail-world.cjs. */
const assert = require('node:assert/strict');
const world = require('../home-path.js');
for (const [w,h] of [[1366,900],[768,1024],[390,844],[320,740]]) {
  let previous, minHeading=1, maxHeading=-1;
  for (let i=0;i<=300;i++) {
    const cam=world.camera(i/300,w,h);
    assert(Math.abs(cam.x-world.center(cam.z))<1e-8,'walker stays on the centerline');
    if (previous) {
      assert(cam.z>previous.z,'walk always advances');
      assert(Math.abs((cam.s-previous.s)-world.camera(1,w,h).s/300)<1e-8,'scroll follows arc length');
      assert(Math.abs(cam.heading-previous.heading)<.04,'turns stay continuous');
    }
    minHeading=Math.min(minHeading,cam.heading); maxHeading=Math.max(maxHeading,cam.heading);
    // A point on the route one step ahead stays in the middle of the view.
    const ahead=world.project({x:world.center(cam.z+.5),z:cam.z+.5},cam);
    assert(Math.abs(ahead.x-720)<12,'the path stays under the walker through bends');
    assert(ahead.y>900,'near trail extends below the viewport');
    const road=world.road(cam);
    assert(road.startsWith('M')&&!/NaN|Infinity/.test(road),'clipped road remains drawable');
    const pole=world.project({x:0,z:100},cam);
    assert(pole.depth>world.NEAR,'junction stays in front of the walker');
    previous=cam;
  }
  assert(minHeading<-.1&&maxHeading>.1,'camera actually turns both ways');
  const end=world.camera(1,w,h), pole=world.project({x:0,z:100},end);
  assert(Math.abs(pole.x-720)<.1,'arrival faces the same junction');
  assert(pole.scale*world.SIGN_UNIT*640<=end.vw*.89,'sign fits at the end');
  // One fixed tree first approaches, then passes behind the walker.
  const tree={x:world.center(40)+5,z:40};
  assert(world.relative(tree,world.camera(.2,w,h)).z>0);
  assert(world.relative(tree,world.camera(.7,w,h)).z<0);
}
console.log('PASS: continuous centerline, distance, turns, clipping, passing landmarks and responsive arrival');
