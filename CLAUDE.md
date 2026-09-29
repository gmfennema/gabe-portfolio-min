# gabefen.com

A hand-written static site. No build step, no dependencies: `index.html` and
friends are served as they are. Shared styles and behavior live in `site.css`
and `site.js`. The homepage, `index.html`, is a 3D walk through the woods and
adds `woods.css`, `woods-path.js`, `woods-sound.js`, `woods-render.js`,
`woods-vista.js`, `woods.js` and a vendored copy of three.js.
GitHub Pages deploys `main` on push.

## Working on it

Serve the folder and open it — nothing to compile:

```
python3 -m http.server 8000
```

Posts are hand-authored HTML in `posts/`, listed in `posts/posts.json` and
`sitemap.xml`. Projects work the same way in `projects/`.

## Before you commit

Three small tools keep the things that are easy to forget honest. All of them
take `--check` and exit non-zero, so they can gate a deploy.

| Command | What it does |
| --- | --- |
| `python3 tools/version-assets.py` | Rewrites the `?v=` on shared and homepage asset links to the files' content hash. **Run this whenever any CSS or JS file changes** — otherwise browsers keep the copy they already have and the change never reaches anyone. New homepage scripts must be classic scripts linked from `index.html` (and listed in the tool), not ES-module imports, or they escape the versioning. |
| `python3 tools/size-images.py` | Stamps `width`/`height` on every `<img>` from the file on disk. Run after adding pictures: the field-note reader measures pages before images load, and unsized pictures make it lay out pages for a document that has none. |
| `tools/check-reader.sh` | Runs the reader's invariants in headless Chrome across every post at four screen sizes. Needs Chrome or Chromium (`CHROME=/path/to/chrome` to point at one). |

## The field-note reader

`setupNotebookPosts()` in `site.js` turns a post's `<article>` into a notebook.
The rules it lives by:

- **The article is the source of truth.** It stays in the page as the scroll
  view, the print layout and the fallback. The paginated spread is a
  presentation of it, built from clones.
- **Two views, and the reader picks.** Pages by default — two sheets on a
  desktop spread, one at a time on a phone — with a continuous ruled scroll
  a tap away on the toolbar toggle. The choice is kept under `notebook:view`
  for the whole notebook, not per note. Only a screen with no room for a page
  at all is forced to scroll. `data-mode` on `.post-reader` says which view is
  live; `data-fallback` says why, when pagination gave up.
- **One breakpoint, two places.** `READER_PHONE` in `site.js` and the
  `max-width: 720px` block in `site.css` both decide whether a spread is one
  sheet or two. They have to agree, or a turn moves the wrong distance.
- **A turn is animated, and the pages do not move.** `flipSheet()` builds a
  two-sided clone in `.reader-turn` — front the sheet that is leaving, back
  the page it lands as — and turns it right over while the track jumps,
  underneath it, to the destination. It finishes sitting exactly on what is
  already there, so taking it away is invisible. A spread hinges at the spine
  and the sheet crosses to the other leaf. A phone is one page wide and has no
  other leaf to land on, so `flipPage()` turns a single face about that same
  hinge on the left: going on, the sheet lifts by its right edge and swings
  towards the spine, uncovering the page it was lying on, and is edge-on and
  clipped away by the time it reaches it — the rest of the revolution happens
  off the book, as it does in a book held open at one page. Coming back is
  that same turn run backwards, easing included. The clone is `aria-hidden`,
  unselectable and gone inside a second; the real pages never leave the track.
  Reduced motion skips it.
- **The words change when the paper does.** The track jumps to the
  destination the instant a turn starts, so `flipSheet()` also pins a
  `.reader-hold` copy of the page the sheet is about to land on, as it was,
  underneath the sheet for the length of the turn. Without it the page under
  the turning sheet changes its text before any paper has crossed it, and the
  sheet arrives too late to look like it carried the words over. A phone needs
  the hold only on the way back, where the sheet comes down over the page
  being left; going on, the page the track has jumped to is exactly what
  should come out from under the sheet as it lifts.
- **The cover's stock follows the view, not the screen.** Kraft board in the
  page view at any width, because there is a book to have a cover; the site's
  own ground in the scroll view, where there is not. Both are keyed off
  `data-mode`.
- **Every page stays in the DOM**, in a scroll-snapping track, so find-in-page,
  select-all and translate see the whole note.
- **Nothing may go missing.** After building, the paginator compares the text
  of its pages against the article and throws if a character is lost; the
  reader then falls back to the scroll view rather than showing a note with a
  hole in it. `tests/reader-invariants.html` checks the same thing from
  outside, along with picture counts, clipping, and reachable controls.
- **Measure what will actually render.** Pages are measured with their final
  furniture (page number, running head) and with picture heights fixed in
  pixels, because a footer that grows or an image that loads after measuring
  pushes content under the page's clip, invisibly.

## The woods (the homepage)

`index.html` is the homepage: the welcome, navigation and four destinations, as
a first-person walk through a ponderosa and aspen forest to a signpost on the
brink of a deep valley, with a granite range across it. It is drawn with
three.js, vendored and pinned in `vendor/three-0.180.0/` — no CDN, no build —
and imported by relative path from `woods.js`, the only ES module. Everything
else (`woods-path.js`, `woods-sound.js`, `woods-render.js`, `woods-vista.js`)
is a classic script with a global, so `tools/version-assets.py` can version it.

- **One world, described once.** `woods-path.js` holds the trail spline
  (resampled by arc length), its elevation, the creek and bridge, the two forks
  along the rim, the terrain height function, the brink just behind the sign,
  every planting rule and the gait. `woods.js` only draws what it describes.
  Nothing is planted on the tread, in the creek, in the junction clearing, on
  the lip of the drop or in the arrival's view over it. `node tests/woods-world.cjs`
  checks that, plus even steps, feet on the ground, one creek crossing, smooth
  heading, the sign's framing at six screen shapes, and the gait.
- **Scroll is the walk.** The section is about eight screens tall around a
  sticky stage; scroll progress maps to distance along the trail, and the
  walker follows it on a critically damped spring so pace changes smoothly.
  "Take a walk" strolls; "Jump to the junction" uses a quintic shortcut; both
  give way to input. `?at=0.4` opens the walk that far on.
- **The gait follows speed, not playback.** `WoodsWorld.stride(speed)` blends a
  walk, a run and a glide by how fast the walker covers trail (the bands are
  set by how people scroll, not by how fast legs go). Cadence barely rises —
  the stride lengthens — so a fast scroll never looks like a walk on fast
  forward. `WoodsWorld.bob()` gives the head its path: a walk dips at each
  heel strike; a run sinks through the stance and flies between steps, the two
  halves meeting with matching slopes; a glide lifts off the tread and has no
  footfall at all, so a fling floats instead of jittering.
- **Keys.** ↑ walks on down the trail and ↓ walks back — the reverse of the
  page's own scroll, so they are intercepted — by scrolling, so scroll stays
  the one source of the walk. Holding either breaks into a run. ←/→ and drag
  look around; walking eases the head back to the trail.
- **The signs are real links.** The boards are drawn in 3D and four HTML
  anchors are laid over their projected outlines every frame at the junction.
  They stay hidden until arrival; the skip link and `#woods-junction` go
  straight there and focus the first sign.
- **One air.** `WoodsRender.atmosphere()` is the only model of the sky and
  haze: Rayleigh blue, a thin Mie haze that glows round the sun, valley mist,
  and a local haze among the trunks (carried in `scene.fog.near`). It replaces
  three's fog chunks, so every built-in material fogs through it, and the sky
  dome and far terrain call it directly. Air in the valley's shadow scatters
  less, so the shaded valley reads as depth rather than a white wash.
- **Developed like a photograph.** The frame renders in HDR (half float, MSAA)
  and `WoodsRender.darkroom()` develops it: a physically based bloom, AgX with a
  gentle look, lens falloff, a trace of chromatic aberration and grain (which
  also dithers the sky). Lighting is a low golden sun, soft shadows that widen
  with distance from their caster (PCSS patched into three's PCF path), and
  image-based light from a forest environment. Foliage scatters rather than
  mirrors, so its specular is suppressed.
- **The far country.** `woods-vista.js` is one heightfield on a polar grid
  centred on the junction — as fine near the walker as far away, measured in
  degrees — generated on the GPU at load. Sun visibility and sky visibility are
  baked once, since the sun never moves. Its edge is matched to the near
  terrain's own edge, which it samples all the way round `WoodsWorld.BOUNDS`.
  The great peaks are placed so they stand beside and above the signpost at
  arrival; the valley floor holds a river and a lake that mirror the peaks by
  marching the heightfield.
- **Passes.** The opaque woods draw first and mark the stencil; the far
  country (with its own near and far planes) draws only through the gaps;
  those gaps are emptied of depth again; then the woods' transparent and
  additive layer (haze shafts, dust, creek water) goes over everything. Any
  transparent or additive material is moved to that layer automatically.
- **Everything is made at load.** Bark (with normal maps), needles, leaves,
  ground and sign faces are painted on canvases; sound — wind, creek and
  birds, no footsteps — is synthesised by `woods-sound.js` with Web Audio and
  stays off until the visitor turns it on.
- **One wind.** Trees, grass and ferns sway in the vertex shader (`woodsSway`);
  `WoodsWorld.gust` is the same gust in JS, so the wind you hear swells with the
  gusts you see. Pause wind stills the water, dust, clouds and falling leaves.
- **Frames only when needed.** Instances are grouped in patches of a few dozen
  metres so frustum culling works, and the far terrain in patches too. Rock
  detail on the far peaks is only computed when they fill the view. Coarse
  pointers and small screens get fewer blades and trees, smaller shadows, no
  MSAA or soft shadows, and a coarser far country, and resolution drops when
  frames run slow. The loop idles once nothing moves.
- **Fallbacks.** Reduced motion stands the walker at the junction with nothing
  swaying. No WebGL, no JavaScript, or a module that never starts (a 15 second
  timer in the page head) shows a still landscape with the four signs as plain
  wooden links.

Run `tests/woods-invariants.html` in a visible browser tab to check desktop,
tablet, phone, landscape, and no-JS layouts, and inspect the trailhead, the
bridge, the ridge and the junction by eye. Shared field-note reader code is
independent of this scene.
