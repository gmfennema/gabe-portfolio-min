# gabefen.com

A hand-written static site. No build step, no dependencies: `index.html` and
friends are served as they are, with one stylesheet (`site.css`) and one script
(`site.js`). GitHub Pages deploys `main` on push.

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
| `python3 tools/version-assets.py` | Rewrites the `?v=` on `site.css`/`site.js` links to the files' content hash. **Run this whenever either file changes** — otherwise browsers keep the copy they already have and the change never reaches anyone. |
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
- **A turn is animated, and the pages do not move.** `flipSheet()` clones the
  sheet that is leaving into `.reader-turn` and swings it around the spine
  while the track jumps, underneath it, to the destination. The clone is
  `aria-hidden`, unselectable and gone in under half a second; the real pages
  never leave the track. Reduced motion skips the flip and scrolls instead.
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
