# gabefen.com

A hand-written static site. No build step, no dependencies: `index.html` and
friends are served as they are. Shared styles and behavior live in `site.css`
and `site.js`. The homepage, `index.html`, is a static page: the header, a
hand-drawn landscape hero, three cards (Field Notes, Projects, Photography) and
a contact button, on the shared files alone. `woods.html` is a 3D walk through
the woods and adds `woods.css`, `woods-path.js`, `woods-sky.js`, `woods-sound.js`,
`woods-render.js`, `woods-vista.js`, `woods.js` and a vendored copy of three.js.
GitHub Pages deploys `main` on push.

## Working on it

Serve the folder and open it — nothing to compile:

```
python3 -m http.server 8000
```

Posts are hand-authored HTML in `posts/`, listed in `posts/posts.json` and
`sitemap.xml`. Projects work the same way in `projects/`. Every page carries
Open Graph and Twitter card tags with an absolute `og:url` and the shared card
image, `https://gabefen.com/assets/og-woods.jpg`; copy them into new pages. The
newest post and project also appear on the woods' trailside panels, read
straight from the two JSON files.

## Before you commit

Three small tools keep the things that are easy to forget honest. All of them
take `--check` and exit non-zero, so they can gate a deploy.

| Command | What it does |
| --- | --- |
| `python3 tools/version-assets.py` | Rewrites the `?v=` on shared and woods asset links to the files' content hash. **Run this whenever any CSS or JS file changes** — otherwise browsers keep the copy they already have and the change never reaches anyone. New woods scripts must be classic scripts linked from `woods.html` (and listed in the tool), not ES-module imports, or they escape the versioning. |
| `python3 tools/size-images.py` | Stamps `width`/`height` on every `<img>` from the file on disk. Run after adding pictures: an unsized picture holds no room until it loads, then shoves the text down under the reader — and moves the running head on with it. |
| `tools/check-reader.sh` | Runs the field-note invariants in headless Chrome across every post at five screen sizes. Needs Chrome or Chromium (`CHROME=/path/to/chrome` to point at one). |

## Field notes

A post is one column of prose set like a book page, under a running head. The
page itself is the reader: it scrolls, prints and reads the same with or
without JavaScript. Everything is in `site.css` (the `.note-*` rules) and
`setupNotes()` in `site.js`.

- **The skeleton.** Copy an existing post. `<body class="note-page">`, then
  `.note-shell` holding the shared `header.site`, a `main.note` and
  `footer.note-foot`. Inside `main.note`: `header.note-head` (`.note-kicker`
  reading "Field Note", `h1.note-title`, `.note-dek` — the page's meta
  description — and `.note-meta` with the `<time>`), then `article.note-body`
  with the prose, then `nav.note-after` with the link to all field notes.
  A title too long to stand at full size gets `note-title-long` as well.
- **Sections are headings.** A note is divided at its `h2`s, or at its `h3`s
  if it has no `h2`; `h3`s under `h2`s are sub-heads. The stylesheet numbers
  sections in Roman numerals with a CSS counter, and `setupNotes()` divides the
  running head and the contents at the same headings, giving each an id from
  its text. A note whose headings already carry numbers ("1. …", "Part 1 – …")
  gets `class="note-body self-numbered"` so they are not numbered twice.
- **What the script adds.** The running head (a `<details>`: the note's title,
  the section being read, a hairline that fills as the note is read, and the
  contents when opened), the contents list under the title once a note has two
  or more sections, the reading time, the note's number in the series and links
  to the notes either side of it — the last two read from `posts/posts.json`
  sorted by date. None of it is needed to read the note.
- **The running head follows scroll, not frames.** It measures straight from
  the scroll event (browsers already deliver it at most once a frame); a
  section is the one being read once its heading is within 260px of the top.
  Headings carry `scroll-margin-top` so a jump from the contents lands below
  the head, not under it.
- **Type.** Newsreader, self-hosted from `assets/fonts/` (latin, variable
  roman and italic; `OFL.txt` is its licence). Every post preloads the roman
  face, from the same URL the stylesheet uses. The measure is `--note-measure`
  (714px); one breakpoint, 720px, matching the site header's.
- **Pictures** are `<figure><img width height></figure>` and take their look
  from the stylesheet, not inline styles. Blockquote sources go in a `<footer>`
  inside the `<blockquote>`, with the work in `<cite>`.
- **Checked from outside.** `tests/reader-invariants.html` (run it with
  `tools/check-reader.sh`) loads every post at five screen sizes and checks the
  font, the measure, no sideways scroll, sized pictures, that every contents
  entry lands on its heading clear of the running head, that the head follows
  the reader and fills by the end, that it opens and closes, the series number
  and neighbours, and unique ids.

## The woods (`woods.html`)

`woods.html` (the homepage until the static one came back) is the welcome,
navigation and four destinations, as
a first-person walk through a ponderosa and aspen forest to a signpost on the
brink of a deep valley, with a granite range across it. It is drawn with
three.js, vendored and pinned in `vendor/three-0.180.0/` — no CDN, no build —
and imported by relative path from `woods.js`, the only ES module. Everything
else (`woods-path.js`, `woods-sky.js`, `woods-sound.js`, `woods-render.js`,
`woods-vista.js`) is a classic script with a global, so `tools/version-assets.py`
can version it.

- **One world, described once.** `woods-path.js` holds the trail spline
  (resampled by arc length), its elevation, the creek and bridge, the two forks
  along the rim, the terrain height function, the brink just behind the sign,
  every planting rule, the three wayside panels and the gait. `woods.js` only
  draws what it describes. Nothing is planted on the tread, in the creek, in
  the junction clearing, on the lip of the drop or in the arrival's view over
  it. `node tests/woods-world.cjs` checks that, plus even steps, feet on the
  ground, one creek crossing, smooth heading, the sign's framing at six screen
  shapes, the waysides' clearing and sight lines, and the gait.
- **Scroll is the walk.** The section is about eight screens tall around a
  sticky stage; scroll progress maps to distance along the trail, and the
  walker follows it on a critically damped spring so pace changes smoothly.
  "Take a walk" strolls; "Jump to the junction" uses a quintic shortcut; both
  give way to input. `?at=0.4` opens the walk that far on and `?look=-40,12`
  turns the head (degrees, left positive, then up). Leaving by a sign or a
  wayside keeps the spot in `sessionStorage` (`woods:spot`), so coming home in
  the same visit picks the walk up there; "Back to the trailhead" forgets it.
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
- **Arizona's own sky.** `woods-sky.js` places the sun and moon for Flagstaff
  at any moment (almanac formulas; `node tests/woods-sky.cjs` checks solstice
  and equinox noons, sunset, full and new moons, Polaris and the clock).
  Arizona keeps no daylight saving, so its clock is UTC−7 all year. The light
  is a set of looks keyed to the sun's height and blended between them; golden
  hour (15°) is the woods' original look, exactly. The page opens on now; the
  hour chip offers sunrise, midday, golden hour, dusk and night for today, kept
  for the visit under `woods:light`; `?light=dusk` or `?light=2026-10-10T22:30`
  (Arizona time) opens any moment. Left on now, the light follows the sun
  while the page is open. A change of light crossfades from the last frame.
- **One air.** `WoodsRender.atmosphere()` is the only model of the sky and
  haze: Rayleigh blue, a thin Mie haze that glows round the sun, valley mist,
  and a local haze among the trunks (carried in `scene.fog.near`). It replaces
  three's fog chunks, so every built-in material fogs through it, and the sky
  dome and far terrain call it directly. Air in the valley's shadow scatters
  less, so the shaded valley reads as depth rather than a white wash. The shape
  of the air is constant; everything the hour decides (key light, sky, haze,
  the glow round the real sun, stars, moon) is a uniform, and `air.share()`
  hands those uniforms to every material in both scenes, keeping each one's
  program cache key. `applyLight()` in `woods.js` is the one place that lights
  the woods for an hour: it also re-bakes the far country's sun, rebuilds the
  forest's environment light and sets the darkroom's look.
- **Night.** When the sun is down the moon is the key light, as bright as its
  phase allows; with no moon the woods are lit by the sky, the stars and the
  lamps. Stars are points (the brightest seventy where they really are, a few
  thousand faint ones), turned by the same heavens matrix as the Milky Way in
  the sky dome, and parked beyond the far range so it hides the ones behind
  it. The moon's disc is lit from where the sun really is, and under a dark
  sky a shooting star crosses ahead every minute or so. A headlamp follows
  the walker's gaze and a lantern hangs on the signpost; both are always in
  the scene and dark by day, so nightfall compiles nothing.
- **Developed like a photograph.** The frame renders in HDR (half float, MSAA)
  and `WoodsRender.darkroom()` develops it: a physically based bloom, AgX with a
  gentle look, lens falloff, a trace of chromatic aberration and grain (which
  also dithers the sky; at night the darks are tinted blue). Lighting is the
  hour's key light, soft shadows that widen
  with distance from their caster (PCSS patched into three's PCF path), and
  image-based light from a forest environment. Foliage scatters rather than
  mirrors, so its specular is suppressed.
- **The far country.** `woods-vista.js` is one heightfield on a polar grid
  centred on the junction — as fine near the walker as far away, measured in
  degrees — generated on the GPU at load. Sun visibility and sky visibility are
  baked then, and the sun's again (`vista.relight()`) whenever the hour moves
  it. Its edge is matched to the near
  terrain's own edge, which it samples all the way round `WoodsWorld.BOUNDS`.
  The great peaks are placed so they stand beside and above the signpost at
  arrival; the valley floor holds a river and a lake that mirror the peaks by
  marching the heightfield. Two ravens circle out over the valley by day.
- **Waysides.** Three low exhibit panels stand beside the trail at stops 01–03
  (`WoodsWorld.WAYSIDES`; the forest is planted exactly as before and then
  cleared round them). Their faces are painted at load from the site itself:
  the newest field note from `posts/posts.json`, a photograph (a different
  one each visit, from the 720 × 480 thumbnails in `assets/photos/trail/`),
  and the newest project from `projects/projects.json`, with the matching
  `assets/sketch-*.svg`. A real link hangs over each panel while it is near
  and in view. New photographs need a thumbnail:
  `convert photo.webp -resize 720x480^ -gravity center -extent 720x480 -quality 78 assets/photos/trail/photo.webp`
  and an entry in `PHOTOS` in `woods.js`.
- **The camera.** The camera button reads the frame straight after drawing it,
  prints it with a border and a caption (where, when, what light), and offers
  it to save or share, with a link back to the same spot, gaze and moment.
- **Passes.** The opaque woods draw first and mark the stencil; the far
  country (with its own near and far planes) draws only through the gaps;
  those gaps are emptied of depth again; then the woods' transparent and
  additive layer (haze shafts, dust, creek water) goes over everything. Any
  transparent or additive material is moved to that layer automatically.
- **Everything is made at load.** Bark (with normal maps), needles, leaves,
  ground and sign faces are painted on canvases; sound — wind, creek, birds by
  day, owls, coyotes and poorwills by night, elk bugling in the September and
  October rut, no footsteps — is synthesised by `woods-sound.js` with Web Audio
  and stays off until the visitor turns it on.
- **Seasons.** Aspens leaf out pale in May, stay green all summer, turn in
  September, blaze in October and stand bare from November to April; grass,
  shrubs and falling leaves follow. The month is Arizona's; `?month=6` previews
  another (0 is January).
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

The social card, `assets/og-woods.jpg`, is the junction at golden hour
(`woods.html?light=2026-10-04T17:05&look=0,4#woods-junction`, 1200 × 630 with the
interface hidden and the welcome laid over the sky). Re-render it if the
signpost or the range changes.

Run `node tests/woods-sky.cjs` and `node tests/woods-world.cjs` after changing
the sky or the world, and `tests/woods-invariants.html` in a visible browser tab to check desktop,
tablet, phone, landscape, and no-JS layouts, and inspect the trailhead, the
bridge, the ridge and the junction by eye. Shared field-note reader code is
independent of this scene.
