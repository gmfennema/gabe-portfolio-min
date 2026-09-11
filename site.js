(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  $$("[data-year]").forEach((el) => {
    el.textContent = new Date().getFullYear();
  });

  const header = $("header.site");
  const nav = header ? $(".nav", header) : null;

  if (header && nav) {
    const currentFile = location.pathname.split("/").pop() || "index.html";
    const inPosts = location.pathname.includes("/posts/");
    const inProjects = location.pathname.includes("/projects/");

    $$(".nav a", header).forEach((link) => {
      const hrefFile = (link.getAttribute("href") || "").split("/").pop();
      const isActive =
        hrefFile === currentFile ||
        (inPosts && hrefFile === "field-notes.html") ||
        (inProjects && hrefFile === "projects.html");
      if (isActive) link.classList.add("active");
    });

    if (!$(".menu-btn", header)) {
      const button = document.createElement("button");
      button.className = "menu-btn";
      button.type = "button";
      button.setAttribute("aria-label", "Toggle navigation");
      button.setAttribute("aria-expanded", "false");
      button.innerHTML = '<span class="menu-icon" aria-hidden="true"></span>';
      header.appendChild(button);

      const close = () => {
        header.classList.remove("menu-open");
        button.setAttribute("aria-expanded", "false");
      };

      button.addEventListener("click", () => {
        const open = header.classList.toggle("menu-open");
        button.setAttribute("aria-expanded", String(open));
      });
      nav.addEventListener("click", (event) => {
        if (event.target.closest("a")) close();
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") close();
      });
      window.matchMedia("(min-width: 721px)").addEventListener?.("change", close);
    }
  }

  const isExternal = (url = "") => /^https?:\/\//i.test(url);

  function appendLinkGroup(parent, links = [], className) {
    if (!Array.isArray(links) || !links.length) return;
    const group = document.createElement("div");
    group.className = className;
    links.forEach((item) => {
      const link = document.createElement("a");
      link.className = "badge";
      link.href = item.url;
      link.textContent = item.label || "Open";
      if (isExternal(item.url)) {
        link.target = "_blank";
        link.rel = "noopener";
      }
      group.appendChild(link);
    });
    parent.appendChild(group);
  }

  const STATUS_LABEL = { active: "Active", periodic: "Periodic", standing: "Unmaintained" };

  function projectYear(project) {
    return project.date ? new Date(`${project.date}T12:00:00`).getFullYear() : "";
  }

  function statusPill(project) {
    const pill = document.createElement("span");
    pill.className = `status-pill status-${project.status || "active"}`;
    pill.textContent = STATUS_LABEL[project.status] || STATUS_LABEL.active;
    return pill;
  }

  function projectLink(project, item, className) {
    const link = document.createElement("a");
    link.className = className;
    link.href = item.url;
    link.textContent = item.label || "Open";
    if (isExternal(item.url)) {
      link.target = "_blank";
      link.rel = "noopener";
    }
    return link;
  }

  async function renderProjects() {
    const pinnedRoot = $("#pinned-root");
    const activeRoot = $("#active-root");
    const periodicRoot = $("#periodic-root");
    const standingRoot = $("#standing-root");
    if (!pinnedRoot && !activeRoot && !periodicRoot && !standingRoot) return;

    try {
      const response = await fetch("projects/projects.json", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load projects");
      const projects = await response.json();
      projects.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

      // Pinned cards
      if (pinnedRoot) {
        pinnedRoot.replaceChildren();
        projects.filter((project) => project.featured).slice(0, 3).forEach((project) => {
          const card = document.createElement("article");
          card.className = "pinned-card";

          const top = document.createElement("div");
          top.className = "pinned-top";
          const kind = document.createElement("span");
          kind.className = "project-kind";
          kind.textContent = project.kind || "Project";
          top.append(kind, statusPill(project));

          const title = document.createElement("a");
          title.className = "pinned-title";
          title.href = project.path;
          title.textContent = project.title;
          if (isExternal(project.path)) { title.target = "_blank"; title.rel = "noopener"; }

          const summary = document.createElement("p");
          summary.className = "pinned-summary";
          summary.textContent = project.summary || "";

          const actions = document.createElement("div");
          actions.className = "pinned-actions";
          (project.links || []).forEach((item, index) => {
            actions.appendChild(projectLink(project, item, index === 0 ? "trail-button pinned-primary" : "badge"));
          });

          card.append(top, title, summary, actions);
          pinnedRoot.appendChild(card);
        });
      }

      // Register rows
      const renderRegister = (root, status) => {
        if (!root) return;
        root.replaceChildren();
        const rows = projects.filter((project) => (project.status || "active") === status);
        if (!rows.length) {
          const empty = document.createElement("p");
          empty.className = "register-empty";
          empty.textContent = "Nothing here yet.";
          root.appendChild(empty);
          return;
        }
        rows.forEach((project) => {
          const row = document.createElement("article");
          row.className = "register-row";

          const mark = document.createElement("span");
          mark.className = `register-mark status-${status}`;
          mark.setAttribute("aria-hidden", "true");

          const copy = document.createElement("div");
          copy.className = "register-copy";
          const title = document.createElement("a");
          title.className = "register-title";
          title.href = project.path;
          title.textContent = project.title;
          if (isExternal(project.path)) { title.target = "_blank"; title.rel = "noopener"; }
          const summary = document.createElement("p");
          summary.className = "register-summary";
          summary.textContent = project.summary || "";
          copy.append(title, summary);

          const kind = document.createElement("span");
          kind.className = "register-kind";
          kind.textContent = project.kind || "Project";

          const year = document.createElement("span");
          year.className = "register-year";
          year.textContent = projectYear(project);

          const action = document.createElement("div");
          action.className = "register-action";
          const primary = (project.links || [])[0];
          if (primary) action.appendChild(projectLink(project, primary, "badge"));

          row.append(mark, copy, kind, year, action);
          root.appendChild(row);
        });
      };
      renderRegister(activeRoot, "active");
      renderRegister(periodicRoot, "periodic");
      renderRegister(standingRoot, "standing");
    } catch (error) {
      [pinnedRoot, activeRoot, periodicRoot, standingRoot].forEach((root) => {
        if (root) root.innerHTML = "<p>Projects could not be loaded right now.</p>";
      });
    }
  }

  function noteIllustration(title) {
    if (/investments/i.test(title)) return "assets/sketch-coffee.svg";
    if (/magic circles/i.test(title)) return "assets/sketch-circles.svg";
    if (/episodic epics/i.test(title)) return "assets/sketch-mountain.svg";
    return "assets/sketch-notebook.svg";
  }

  function formatDate(value) {
    return new Date(value + "T12:00:00").toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }

  async function renderFieldNotes() {
    const root = $("#field-notes-root") || $("#writing-root");
    if (!root) return;

    try {
      const response = await fetch("posts/posts.json", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load field notes");
      const posts = await response.json();
      posts.sort((a, b) => new Date(b.date) - new Date(a.date));

      const index = document.createElement("div");
      index.className = "field-notes-index";

      const featured = document.createElement("section");
      featured.className = "featured-notes";
      featured.setAttribute("aria-labelledby", "featured-notes-heading");
      const featuredHeading = document.createElement("h2");
      featuredHeading.id = "featured-notes-heading";
      featuredHeading.textContent = "Featured notes";
      featured.appendChild(featuredHeading);

      const featureGrid = document.createElement("div");
      featureGrid.className = "note-feature-grid";
      const chronological = [...posts].sort((a, b) => new Date(a.date) - new Date(b.date));
      posts.slice(0, 3).forEach((post) => {
        const link = document.createElement("a");
        link.className = "note-book";
        link.href = post.path;
        const number = chronological.indexOf(post) + 1;

        const cover = document.createElement("span");
        cover.className = "note-book-cover";
        const spine = document.createElement("span");
        spine.className = "note-book-spine";
        spine.setAttribute("aria-hidden", "true");
        spine.append(
          Object.assign(document.createElement("span"), { className: "note-book-staple" }),
          Object.assign(document.createElement("span"), { className: "note-book-staple" }),
          Object.assign(document.createElement("span"), { className: "note-book-staple" })
        );
        const emblem = document.createElement("img");
        emblem.className = "note-book-emblem";
        emblem.src = noteIllustration(post.title);
        emblem.alt = "";
        const title = document.createElement("h3");
        title.className = "note-book-title";
        if (post.title.length > 34) title.classList.add("note-book-title-long");
        title.textContent = post.title;
        const stamp = document.createElement("span");
        stamp.className = "note-book-stamp";
        const date = document.createElement("time");
        date.dateTime = post.date;
        date.textContent = new Date(`${post.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        stamp.append(`Field Note No. ${String(number).padStart(2, "0")} / `, date);
        cover.append(spine, emblem, title, stamp);

        const summary = document.createElement("span");
        summary.className = "note-book-band";
        summary.textContent = post.summary || "";

        link.append(cover, summary);
        featureGrid.appendChild(link);
      });
      featured.appendChild(featureGrid);

      const archive = document.createElement("section");
      archive.className = "notes-archive";
      archive.setAttribute("aria-labelledby", "notes-archive-heading");
      const archiveHeading = document.createElement("h2");
      archiveHeading.id = "notes-archive-heading";
      archiveHeading.textContent = "Browse by year";
      archive.appendChild(archiveHeading);

      const years = posts.reduce((groups, post) => {
        const year = new Date(`${post.date}T12:00:00`).getFullYear();
        if (!groups[year]) groups[year] = [];
        groups[year].push(post);
        return groups;
      }, {});

      Object.keys(years).sort((a, b) => b - a).forEach((year) => {
        const yearSection = document.createElement("section");
        yearSection.className = "archive-year";
        yearSection.setAttribute("aria-labelledby", `year-${year}`);
        const yearHeading = document.createElement("h3");
        yearHeading.id = `year-${year}`;
        yearHeading.textContent = year;
        yearSection.appendChild(yearHeading);

        const yearList = document.createElement("div");
        yearList.className = "archive-year-list";
        years[year].forEach((post) => {
          const link = document.createElement("a");
          link.className = "archive-row";
          link.href = post.path;
          const copy = document.createElement("span");
          copy.className = "archive-row-copy";
          const title = document.createElement("strong");
          title.textContent = post.title;
          const summary = document.createElement("span");
          summary.textContent = post.summary || "";
          copy.append(title, summary);
          const date = document.createElement("time");
          date.dateTime = post.date;
          date.textContent = formatDate(post.date);
          const arrow = document.createElement("span");
          arrow.className = "archive-arrow";
          arrow.setAttribute("aria-hidden", "true");
          arrow.textContent = "→";
          link.append(copy, date, arrow);
          yearList.appendChild(link);
        });
        yearSection.appendChild(yearList);
        archive.appendChild(yearSection);
      });

      index.append(featured, archive);
      root.replaceChildren(index);
    } catch (error) {
      root.innerHTML = "<p>Field notes could not be loaded right now.</p>";
    }
  }

  /* =========================================================
     Field-note reader

     A note is written once, as an ordinary <article>. The reader is a
     presentation of it: a paginated spread when there is room for one,
     a continuous ruled scroll otherwise. The article itself stays in
     the document as the scroll view, the print layout and the fallback,
     so a paginator that goes wrong costs a reader nothing.
     ========================================================= */

  const READER_FIGURE_MIN = 170; // a picture squeezed below this belongs overleaf
  const READER_FIGURE_SLACK = 8; // room for a picture that settles a hair taller
  const READER_FIGURE_PADDING = 12; // the mount around a picture, top and bottom
  const READER_FIGURE_MARGINS = 32; // the air a figure keeps above and below it
  const READER_FIGURE_MAX = 320; // ...and never grows past the design's cap
  const READER_RESUME_DAYS = 14; // how long a reader's place in a note is kept
  const READER_RESUME_PAGES = 6; // short notes are not worth resuming into
  const READER_MIN_PAGE = 460;   // a spread shorter than this stops being comfortable
  const READER_KEEP_PAGE = 420;  // ...but once open, a spread is not yanked away
  const READER_MAX_PAGE = 780;
  const READER_BREATHING_ROOM = 26;
  // A phone shows one sheet rather than two, so it needs far less height to
  // hold a page worth reading. Below this there is no note left on the sheet.
  const READER_PHONE = 720;      // the width the stylesheet switches to one page at
  const READER_MIN_PHONE_PAGE = 300;
  const READER_FLIP_MS = 620;    // how long a sheet takes to turn right over

  const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const readerStore = {
    get(key) {
      try { return window.localStorage.getItem(key); } catch { return null; }
    },
    set(key, value) {
      try { window.localStorage.setItem(key, value); } catch { /* private mode */ }
    }
  };

  /* ---- Cutting a block without losing its markup ---- */

  function textNodesOf(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) nodes.push(node);
    return nodes;
  }

  function locateOffset(nodes, offset) {
    let remaining = offset;
    for (const node of nodes) {
      if (remaining <= node.length) return { node, offset: remaining };
      remaining -= node.length;
    }
    const last = nodes[nodes.length - 1];
    return last ? { node: last, offset: last.length } : null;
  }

  // A copy of `block` holding characters [start, end) of its text, with any
  // inline markup spanning the cut kept intact on both sides.
  function sliceBlock(block, start, end) {
    const nodes = textNodesOf(block);
    const from = locateOffset(nodes, start);
    const to = locateOffset(nodes, end);
    if (!from || !to) return block.cloneNode(true);
    const range = document.createRange();
    range.setStart(from.node, from.offset);
    range.setEnd(to.node, to.offset);
    const clone = block.cloneNode(false);
    clone.appendChild(range.cloneContents());
    return clone;
  }

  // Paragraphs of plain prose can be cut anywhere. Anything holding a
  // replaced element is moved whole, so a cut can never drop a picture.
  const isSplittable = (block) =>
    block.tagName === "P" &&
    block.textContent.trim().length > 120 &&
    !block.querySelector("img, svg, video, iframe, object, canvas, pre");

  /* ---- The pagination engine ----
     `makePage()` hands back a fresh, correctly sized page to fill;
     `fits(body)` reports whether what is in it still fits the sheet. */
  function paginateBlocks(blocks, makePage, fits) {
    const pages = [];
    let current = makePage();
    const overflowing = () => !fits(current.body);

    const flush = () => {
      if (current.body.children.length) pages.push(current);
      current = makePage();
    };

    // Fill the page with as much of `block` as fits, breaking on a word.
    const runOn = (block) => {
      const text = block.textContent;
      const total = text.length;
      let start = 0;
      let guard = 0;
      while (start < total && guard++ < 200) {
        let low = 1;
        let high = total - start;
        let fitLength = 0;
        while (low <= high) {
          const mid = Math.floor((low + high) / 2);
          const candidate = sliceBlock(block, start, start + mid);
          current.body.appendChild(candidate);
          const roomLeft = !overflowing();
          candidate.remove();
          if (roomLeft) { fitLength = mid; low = mid + 1; } else { high = mid - 1; }
        }

        if (fitLength && fitLength < total - start) {
          const wordBreak = text.lastIndexOf(" ", start + fitLength);
          if (wordBreak > start) fitLength = wordBreak - start;
        }

        if (fitLength <= 0) {
          if (current.body.children.length) { flush(); continue; }
          // Taller than an empty page: let the page scroll rather than clip it.
          current.body.appendChild(sliceBlock(block, start, total));
          current.body.classList.add("is-overflowing");
          return;
        }

        const piece = sliceBlock(block, start, start + fitLength);
        if (start > 0) piece.classList.add("runs-in");
        let next = start + fitLength;
        while (next < total && /\s/.test(text[next])) next += 1;
        if (next < total) piece.classList.add("runs-on");
        current.body.appendChild(piece);
        start = next;
        if (start < total) flush();
      }
    };

    // A picture too tall for the room left is sized down to fill it, the way a
    // magazine would, rather than leaving half a page blank behind it.
    const fitFigure = (block) => {
      const last = current.body.lastElementChild;
      if (!last) return false;
      const probe = block.cloneNode(true);
      const image = probe.tagName === "IMG" ? probe : probe.querySelector("img");
      if (!image || probe.querySelectorAll("img").length > 1) return false;

      // Work the size out in one step from the room actually left on the page.
      // (Re-measuring inside a loop is unreliable here: the measuring page is
      // hidden, and its layout does not always settle between reads.)
      const style = window.getComputedStyle(current.body);
      const limit = current.body.getBoundingClientRect().bottom - parseFloat(style.paddingBottom);
      const used = last.getBoundingClientRect().bottom;
      const natural = parseFloat(image.style.height) || READER_FIGURE_MAX;
      const target = Math.floor(limit - used - READER_FIGURE_MARGINS - READER_FIGURE_SLACK);
      if (target < READER_FIGURE_MIN) return false;

      image.style.height = `${Math.min(natural, target)}px`;
      current.body.appendChild(probe);
      if (fits(current.body)) return true;
      probe.remove();
      return false;
    };

    // Lists start where they start and run on across the fold, numbering intact.
    const runOnList = (block) => {
      const total = block.children.length;
      const firstNumber = Number(block.getAttribute("start")) || 1;
      let items = [...block.children];
      let guard = 0;
      while (items.length && guard++ < 200) {
        const list = block.cloneNode(false);
        if (block.tagName === "OL" && items.length !== total) list.start = firstNumber + (total - items.length);
        current.body.appendChild(list);
        let taken = 0;
        for (const item of items) {
          const copy = item.cloneNode(true);
          list.appendChild(copy);
          if (overflowing()) { copy.remove(); break; }
          taken += 1;
        }
        if (taken === 0) {
          if (current.body.children.length > 1) { list.remove(); flush(); continue; }
          list.appendChild(items[0].cloneNode(true));
          current.body.classList.add("is-overflowing");
          taken = 1;
        }
        items = items.slice(taken);
        if (items.length) { list.classList.add("runs-on"); flush(); }
      }
    };

    blocks.forEach((block, index) => {
      const isHeading = /^(H2|H3)$/.test(block.tagName);
      const nextBlock = blocks[index + 1];

      // A heading never ends a page alone: it travels with the opening of
      // whatever it introduces.
      if (isHeading && current.body.children.length && nextBlock) {
        const probeHeading = block.cloneNode(true);
        const probeNext = nextBlock.cloneNode(true);
        current.body.append(probeHeading, probeNext);
        const cramped = overflowing() && !fitsPartially(current.body, probeNext, fits);
        probeHeading.remove();
        probeNext.remove();
        if (cramped) flush();
      }

      const candidate = block.cloneNode(true);
      current.body.appendChild(candidate);
      if (!overflowing()) return;

      candidate.remove();
      if (isSplittable(block)) runOn(block);
      else if (/^(UL|OL)$/.test(block.tagName) && block.children.length > 1) runOnList(block);
      else if (fitFigure(block)) { /* the picture shrank into the room that was left */ }
      else {
        if (current.body.children.length) flush();
        current.body.appendChild(block.cloneNode(true));
        if (overflowing()) current.body.classList.add("is-overflowing");
      }
    });

    if (current.body.children.length) pages.push(current);
    return pages;
  }

  // True when at least the first couple of lines of `probe` share the page,
  // which is enough to keep a heading company.
  function fitsPartially(body, probe, fits) {
    if (fits(body)) return true;
    const text = probe.textContent;
    if (!text || probe.tagName !== "P") return false;
    const stub = sliceBlock(probe, 0, Math.min(text.length, 120));
    probe.replaceWith(stub);
    const roomLeft = fits(body);
    stub.replaceWith(probe);
    return roomLeft;
  }

  function setupNotebookPosts() {
    const hero = $(".post-hero");
    const grid = $(".post-grid");
    const content = $(".post-content");
    const meta = $(".post-meta");
    const dateMeta = $("meta[name='post:date']");
    if (!hero || !grid || !content || !meta || !dateMeta) return;
    if (hero.parentElement?.classList.contains("post-reader")) return;

    const title = $(".post-title", hero);
    if (!title) return;
    const noteTitle = title.textContent.trim();
    const assetPrefix = location.pathname.includes("/posts/") ? "../" : "";
    const wordCount = content.textContent.trim().split(/\s+/).filter(Boolean).length;
    const minutes = Math.max(1, Math.round(wordCount / 220));
    const storeKey = `notebook:${location.pathname}`;

    const el = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    };

    /* ---- Inside cover (page 1) ---- */
    hero.replaceChildren();
    hero.classList.add("cover-inside");

    const cover = el("div", "cover-print");
    title.className = "post-title cover-title";
    if (noteTitle.length > 44) title.classList.add("cover-title-long");
    const stamp = el("p", "cover-stamp");
    const stampNumber = el("span", "cover-stamp-number", "Field note");
    const stampDate = el("time", "cover-stamp-date", formatDate(dateMeta.content));
    stampDate.dateTime = dateMeta.content;
    stamp.append(stampNumber, document.createTextNode(" / "), stampDate);
    const stampMeta = el("p", "cover-stamp", `${minutes}-Minute Read`);
    const emblem = el("img", "cover-emblem");
    emblem.src = `${assetPrefix}${noteIllustration(noteTitle)}`;
    emblem.alt = "";
    emblem.width = 132;
    emblem.height = 100;
    cover.append(emblem, title, stamp, stampMeta);
    const bandNumber = stampNumber;

    const headings = $$("h2", content).length ? $$("h2", content) : $$("h3", content);
    const outlineLinks = [];
    let outline = null;
    if (headings.length) {
      outline = el("nav", "post-outline");
      outline.setAttribute("aria-label", "In this note");
      outline.appendChild(el("strong", null, "In this note"));
      const list = el("ol", "outline-list");
      headings.forEach((heading, index) => {
        if (!heading.id) heading.id = `note-section-${index + 1}`;
        const item = el("li");
        const link = el("a", "outline-link");
        link.href = `#${heading.id}`;
        link.append(
          el("span", "outline-text", heading.textContent.replace(/^\d+\.\s*/, "")),
          el("span", "outline-leader"),
          el("span", "outline-page")
        );
        item.appendChild(link);
        list.appendChild(item);
        outlineLinks.push(link);
      });
      outline.appendChild(list);
    }

    hero.append(cover);
    if (outline) hero.appendChild(outline);
    meta.hidden = true;
    hero.appendChild(meta);

    /* ---- Reader shell ---- */
    const sourceBlocks = [...content.children];
    const sourceText = content.textContent.replace(/\s+/g, "");
    const reader = el("section", "post-reader");
    reader.dataset.mode = "loading";

    const toolbar = el("div", "reader-toolbar");
    const readerLabel = el("span", "reader-label", "From the notebook");
    const status = el("span", "reader-status");
    const progress = el("span", "reader-progress");
    progress.setAttribute("aria-hidden", "true");
    const viewToggle = el("button", "reader-view", "Scroll view");
    viewToggle.type = "button";
    toolbar.append(readerLabel, progress, status, viewToggle);

    const stage = el("div", "reader-stage");
    const track = el("div", "reader-track");
    track.tabIndex = 0;
    track.setAttribute("role", "group");
    track.setAttribute("aria-label", `${noteTitle}, pages`);
    const spine = el("div", "reader-spine");
    spine.setAttribute("aria-hidden", "true");
    spine.append(el("span", "reader-staple"), el("span", "reader-staple"), el("span", "reader-staple"));
    const skeleton = el("div", "reader-skeleton");
    skeleton.setAttribute("aria-hidden", "true");
    // Where a turning sheet lives. It carries the perspective and clips to the
    // book, so a page lifting off it is bounded by the covers rather than
    // rising over the toolbar.
    const turnLayer = el("div", "reader-turn");
    turnLayer.setAttribute("aria-hidden", "true");
    stage.append(track, spine, skeleton, turnLayer);

    const pager = el("div", "reader-pager");
    const previous = el("button", "reader-button reader-prev", "← Previous page");
    previous.type = "button";
    const next = el("button", "reader-button reader-next", "Next page →");
    next.type = "button";
    const hint = el("span", "reader-hint", "Tap a page edge or use the arrow keys");
    if (readerStore.get("notebook:hinted")) hint.hidden = true;
    const restart = el("button", "reader-restart", "Start from the beginning");
    restart.type = "button";
    restart.hidden = true;
    const middle = el("span", "reader-pager-middle");
    middle.append(hint, restart);
    pager.append(previous, middle, next);

    const announcer = el("p", "visually-hidden");
    announcer.setAttribute("aria-live", "polite");

    // The article itself becomes the scroll view: one ruled sheet, in order.
    const continuous = el("div", "reader-continuous");
    const continuousHead = el("p", "continuous-head", noteTitle);
    continuousHead.setAttribute("aria-hidden", "true");
    content.classList.add("notebook-prose");
    continuous.append(continuousHead, content);

    reader.append(toolbar, stage, pager, continuous, announcer);
    hero.before(reader);

    const createPageNumber = () => {
      const footer = el("footer", "reader-page-footer");
      footer.setAttribute("aria-hidden", "true");
      footer.appendChild(el("span", "reader-page-number"));
      return footer;
    };

    const coverPage = el("article", "reader-page reader-cover-page");
    coverPage.append(hero, createPageNumber());

    const createArticlePage = () => {
      const page = el("article", "reader-page reader-article-page");
      const header = el("header", "reader-page-header");
      header.setAttribute("aria-hidden", "true");
      header.append(el("span", "reader-running-title", noteTitle), el("span", "reader-running-section"));
      const body = el("div", "reader-page-body post-content notebook-prose");
      page.append(header, body, createPageNumber());
      return { page, body };
    };

    const sectionOf = (block) => /^(H2|H3)$/.test(block.tagName) ? block.textContent.trim() : null;

    /* ---- Sizing: the spread and its controls have to fit the screen ---- */
    // How much height a spread could have and still leave its controls on
    // screen. Measured off the reader and its toolbar rather than the stage,
    // because the stage is hidden in the scroll view and would measure as
    // nothing — which is how a reader ends up flipping between the two.
    const boxHeight = (node, side) => {
      const style = window.getComputedStyle(node);
      return (node.offsetHeight || 0) + parseFloat(style[side] || 0);
    };
    const measureRoom = () => {
      const readerTop = reader.getBoundingClientRect().top + window.scrollY;
      const toolbarBox = boxHeight(toolbar, "marginBottom");
      const pagerBox = (pager.offsetHeight || 42) + parseFloat(window.getComputedStyle(pager).marginTop || 0);
      return window.innerHeight - readerTop - toolbarBox - pagerBox - READER_BREATHING_ROOM;
    };

    // A phone turns one sheet at a time; anything wider opens a two-page
    // spread. This is the same breakpoint the stylesheet lays the pages out
    // at, and the two have to agree or a turn moves the wrong distance.
    const onePage = () => window.matchMedia(`(max-width: ${READER_PHONE}px)`).matches;
    const columns = () => (onePage() ? 1 : 2);
    const pageFloor = () => {
      if (onePage()) return READER_MIN_PHONE_PAGE;
      // Hysteresis: a spread needs real room to open, and a little less to
      // stay, so a few pixels of layout drift cannot flip the view back and
      // forth.
      return reader.dataset.mode === "spread" ? READER_KEEP_PAGE : READER_MIN_PAGE;
    };
    const canSpread = () => measureRoom() >= pageFloor();

    // Which view a reader last chose, kept for the notebook as a whole: a
    // preference for scrolling is about how someone reads, not about one note.
    const preferredMode = () => {
      if (!canSpread()) return "continuous";
      return readerStore.get("notebook:view") === "scroll" ? "continuous" : "spread";
    };

    /* ---- Building the pages ---- */
    let pages = [];
    const headingPages = new Map();

    const buildPages = () => {
      const height = Math.max(pageFloor(), Math.min(READER_MAX_PAGE, Math.round(measureRoom())));
      reader.style.setProperty("--reader-page-height", `${height}px`);

      const measureHost = el("div", "reader-measure");
      stage.appendChild(measureHost);
      const pageWidth = Math.max(260, stage.clientWidth / columns());
      let runningSection = "";
      let blockIndex = 0;

      const makePage = () => {
        const record = createArticlePage();
        record.page.style.width = `${pageWidth}px`;
        record.page.style.height = `${height}px`;
        $(".reader-running-section", record.page).textContent = runningSection || noteTitle;
        // Measure against the furniture the finished page will carry: an empty
        // page number collapses its footer, and the page would then be measured
        // taller than it ends up being.
        $(".reader-page-number", record.page).textContent = "00";
        measureHost.replaceChildren(record.page);
        return record;
      };
      // "Fits" means no content sits below the page's content box. scrollHeight
      // answers a subtly different question — it counts trailing padding and
      // margins — and pages built against it come out a little too full.
      const fits = (body) => {
        const last = body.lastElementChild;
        if (!last) return true;
        const style = window.getComputedStyle(body);
        const limit = body.getBoundingClientRect().bottom - parseFloat(style.paddingBottom);
        return last.getBoundingClientRect().bottom <= limit + 1;
      };

      // Blocks are tagged so a rebuild can put the reader back where it was,
      // and stripped of ids so the page copies never collide with the article.
      const gauge = createArticlePage();
      gauge.page.style.width = `${pageWidth}px`;
      gauge.page.style.height = `${height}px`;
      measureHost.replaceChildren(gauge.page);
      const columnWidth = gauge.body.clientWidth
        - parseFloat(window.getComputedStyle(gauge.body).paddingLeft)
        - parseFloat(window.getComputedStyle(gauge.body).paddingRight);

      const blocks = sourceBlocks.map((block) => {
        const copy = block.cloneNode(true);
        copy.dataset.block = String(blockIndex++);
        if (copy.id) { copy.dataset.srcId = copy.id; copy.removeAttribute("id"); }
        $$("[id]", copy).forEach((node) => node.removeAttribute("id"));
        $$("img", copy).forEach((image) => {
          const intrinsicWidth = Number(image.getAttribute("width"));
          const intrinsicHeight = Number(image.getAttribute("height"));
          if (!intrinsicWidth || !intrinsicHeight) return;
          const drawn = (columnWidth - READER_FIGURE_PADDING) * (intrinsicHeight / intrinsicWidth);
          image.style.height = `${Math.round(Math.min(READER_FIGURE_MAX, drawn + READER_FIGURE_PADDING))}px`;
        });
        return copy;
      });

      const records = paginateBlocks(blocks, makePage, fits);
      measureHost.remove();

      // Running heads follow the section a page opens in.
      records.forEach((record) => {
        const opener = record.body.firstElementChild;
        const section = opener && sectionOf(opener);
        if (section) runningSection = section;
        $(".reader-running-section", record.page).textContent = runningSection;
        record.page.style.width = "";
        record.page.style.height = "";
      });

      const built = [coverPage, ...records.map((record) => record.page)];
      built.forEach((page, index) => {
        const pageNumber = $(".reader-page-number", page);
        if (pageNumber) pageNumber.textContent = index === 0 ? "" : String(index + 1);
      });

      // Nothing may go missing between the article and its pages.
      const pagedText = records.map((record) => record.body.textContent).join("").replace(/\s+/g, "");
      if (pagedText !== sourceText) {
        throw new Error(`Reader dropped content (${sourceText.length - pagedText.length} characters)`);
      }

      return built;
    };

    const indexHeadings = () => {
      headingPages.clear();
      pages.forEach((page, index) => {
        $$("[data-src-id]", page).forEach((node) => {
          if (!headingPages.has(node.dataset.srcId)) headingPages.set(node.dataset.srcId, index);
        });
        const opener = $(".reader-page-body", page)?.firstElementChild;
        if (opener?.dataset.srcId && !headingPages.has(opener.dataset.srcId)) {
          headingPages.set(opener.dataset.srcId, index);
        }
      });
      outlineLinks.forEach((link) => {
        const pageIndex = headingPages.get(link.hash.slice(1));
        const pageLabel = $(".outline-page", link);
        if (pageLabel) pageLabel.textContent = pageIndex === undefined ? "" : String(pageIndex + 1);
      });
    };

    /* ---- Paging ---- */
    const spreadWidth = () => track.clientWidth || 1;
    const currentSpread = () => Math.round(track.scrollLeft / spreadWidth());
    const currentPage = () => Math.min(pages.length - 1, currentSpread() * columns());

    const scrollToPage = (index, smooth = true) => {
      const spread = Math.floor(Math.max(0, Math.min(index, pages.length - 1)) / columns());
      track.scrollTo({
        left: spread * spreadWidth(),
        behavior: smooth && !reducedMotion() ? "smooth" : "auto"
      });
    };

    // `assume` lets a turn update the chrome at once instead of waiting for the
    // scroll to settle, so the controls never lag behind the page on screen.
    const syncChrome = (assume) => {
      if (reader.dataset.mode !== "spread" || !pages.length) return;
      const first = assume === undefined ? currentPage() : Math.max(0, Math.min(assume, pages.length - 1));
      const last = Math.min(first + columns(), pages.length);
      const label = columns() === 1
        ? `Page ${first + 1} of ${pages.length}`
        : `Pages ${first + 1}–${last} of ${pages.length}`;
      status.textContent = label;
      progress.style.setProperty("--reader-progress", `${(last / pages.length) * 100}%`);
      previous.disabled = first === 0;
      next.disabled = last >= pages.length;
      reader.classList.toggle("at-cover", first === 0);
      reader.classList.toggle("at-end", last >= pages.length);
      const anchor = $(".reader-page-body [data-block]", pages[first]);
      if (anchor) readerStore.set(storeKey, JSON.stringify({ block: Number(anchor.dataset.block), at: Date.now() }));
      if (first === 0) restart.hidden = true;
      const hash = `#p${first + 1}`;
      if (location.hash !== hash) history.replaceState(null, "", `${location.pathname}${location.search}${hash}`);
      announcer.textContent = label;
    };

    /* ---- The page turn ----
       A clone of the sheet that is leaving turns right over — a full half
       revolution, front face to back face — while the track jumps, instantly
       and underneath it, to the pages being turned to. The sheet's back is
       the page it lands as, so when the turn finishes the clone sits exactly
       on top of what is already there and can be taken away unseen. The real
       pages never move, so find-in-page and select-all keep seeing the whole
       note mid-turn. */
    const canAnimate = typeof Element.prototype.animate === "function";
    let leaf = null;
    let leafAnimation = null;

    const clearLeaf = () => {
      if (leafAnimation) { leafAnimation.onfinish = null; leafAnimation.cancel(); }
      leafAnimation = null;
      leaf = null;
      turnLayer.replaceChildren();
    };

    // A copy of a page, with the ids stripped so it cannot collide with the
    // article it came from.
    const pageCopy = (page) => {
      const copy = page.cloneNode(true);
      copy.removeAttribute("id");
      $$("[id]", copy).forEach((node) => node.removeAttribute("id"));
      return copy;
    };

    // One side of the turning sheet.
    const leafFace = (page, side) => {
      const face = el("div", `reader-leaf-face reader-leaf-${side}`);
      face.append(pageCopy(page), el("span", "reader-leaf-shade"));
      return face;
    };

    // The page the sheet is about to land on, held as it was. The track jumps
    // to the destination the moment a turn starts, so without this the words
    // underneath change before any paper has moved over them — and the sheet
    // arrives too late to look like it carried them.
    const heldPage = (page, side) => {
      const hold = el("div", `reader-hold reader-hold-${side}`);
      hold.append(pageCopy(page));
      return hold;
    };

    const flipSheet = (from, to, direction) => {
      if (!canAnimate || reducedMotion() || !stage.clientWidth) return false;
      // Turning forward on a spread, the sheet that leaves is the right-hand
      // page and it lands as the left-hand page of the spread being turned
      // to; turning back, the mirror of that. On a phone a spread is one page
      // wide, so the sheet on screen turns over to become the next one.
      const wide = columns() === 2;
      const front = pages[direction > 0 && wide ? from + 1 : from];
      const back = pages[direction > 0 || !wide ? to : to + 1];
      // What the sheet comes down on: the other leaf of the spread it is
      // leaving, or on a phone the page it is lifting off.
      const under = pages[wide && direction < 0 ? from + 1 : from];
      if (!front || !back) return false;
      clearLeaf();

      const side = wide && direction < 0 ? "right" : "left";
      leaf = el("div", `reader-leaf reader-leaf-${direction > 0 ? "forward" : "backward"}`);
      leaf.setAttribute("aria-hidden", "true");
      leaf.append(leafFace(front, "front"), leafFace(back, "reverse"));
      // The held page goes down first, so the sheet turns over the top of it.
      turnLayer.append(heldPage(under, side), leaf);

      const angle = direction > 0 ? -180 : 180;
      const timing = { duration: READER_FLIP_MS, easing: "cubic-bezier(.42, .02, .34, 1)" };
      // A sheet is darkest edge-on, halfway through, so each face reaches its
      // shade at the fold: the one turning away darkens into it, the one
      // arriving lightens out of it as it comes to rest.
      $(".reader-leaf-front .reader-leaf-shade", leaf).animate(
        [{ opacity: 0 }, { opacity: .55, offset: .5 }, { opacity: .55 }],
        { ...timing, fill: "forwards" }
      );
      $(".reader-leaf-reverse .reader-leaf-shade", leaf).animate(
        [{ opacity: .55 }, { opacity: .55, offset: .5 }, { opacity: 0 }],
        { ...timing, fill: "forwards" }
      );
      leafAnimation = leaf.animate(
        [{ transform: "rotateY(0deg)" }, { transform: `rotateY(${angle}deg)` }],
        { ...timing, fill: "forwards" }
      );
      leafAnimation.onfinish = clearLeaf;
      return true;
    };

    const turn = (direction) => {
      const from = currentPage();
      const target = Math.max(0, Math.min(from + direction * columns(), pages.length - 1));
      if (target === from) return;
      // With a sheet turning over the top, the page beneath has to be there
      // already — a smooth scroll would slide it in behind the animation.
      const turning = flipSheet(from, target, direction);
      scrollToPage(target, !turning);
      syncChrome(target);
      readerStore.set("notebook:hinted", "1");
      hint.hidden = true;
    };

    const readMark = () => {
      try {
        const saved = JSON.parse(readerStore.get(storeKey) || "null");
        if (!saved || typeof saved.block !== "number") return null;
        const age = Date.now() - (saved.at || 0);
        return age < READER_RESUME_DAYS * 86400000 ? saved.block : null;
      } catch {
        return null;
      }
    };

    const pageOfBlock = (blockIndex) => {
      const found = pages.findIndex((page) =>
        [...$$("[data-block]", page)].some((node) => Number(node.dataset.block) === blockIndex));
      return found === -1 ? 0 : found;
    };

    const firstVisibleBlock = () => {
      const page = pages[currentPage()];
      const node = page && $(".reader-page-body [data-block]", page);
      return node ? Number(node.dataset.block) : 0;
    };

    /* ---- Mode switching ---- */
    const setMode = (mode, { restoreBlock } = {}) => {
      reader.dataset.mode = mode;
      viewToggle.hidden = mode === "continuous" && !canSpread();
      viewToggle.textContent = mode === "spread" ? "Scroll view" : "Page view";
      viewToggle.setAttribute("aria-pressed", String(mode === "continuous"));
      if (mode === "spread") {
        skeleton.hidden = true;
        if (restoreBlock !== undefined) scrollToPage(pageOfBlock(restoreBlock), false);
        syncChrome();
      } else {
        status.textContent = `${minutes}-minute read`;
        progress.style.setProperty("--reader-progress", "0%");
      }
    };

    // Last line of defence: a page that ends up taller than it measured scrolls
    // instead of clipping, so a reader can always reach every word.
    const verifyPages = () => {
      let strained = 0;
      pages.forEach((page) => {
        const body = $(".reader-page-body", page);
        const last = body && body.lastElementChild;
        if (!last) return;
        const limit = body.getBoundingClientRect().bottom
          - parseFloat(window.getComputedStyle(body).paddingBottom);
        const over = last.getBoundingClientRect().bottom > limit + 1;
        body.classList.toggle("is-overflowing", over);
        if (over) strained += 1;
      });
      reader.dataset.strained = String(strained);
    };

    const mountSpread = (restoreBlock) => {
      clearLeaf();
      pages = buildPages();
      // The cover goes back to being page one.
      // A two-page spread is always two sheets: an odd note ends on a blank
      // right page. A phone turns one sheet at a time and needs no filler.
      const mounted = columns() === 2 && pages.length % 2
        ? [...pages, el("article", "reader-page reader-blank-page")]
        : pages;
      track.replaceChildren(...mounted);
      indexHeadings();
      setMode("spread", { restoreBlock });
      verifyPages();
      // And again once the spread has settled, in case anything landed taller.
      window.clearTimeout(verifyTimer);
      verifyTimer = window.setTimeout(verifyPages, 300);
      $$(".reader-page-body img", track).forEach((image) => {
        if (image.complete) return;
        image.addEventListener("load", () => {
          window.clearTimeout(verifyTimer);
          verifyTimer = window.setTimeout(verifyPages, 120);
        }, { once: true });
      });
    };
    let verifyTimer;

    const goContinuous = (reason) => {
      if (reason) reader.dataset.fallback = reason;
      clearLeaf();
      track.replaceChildren();
      pages = [];
      skeleton.hidden = true;
      // The cover carries the note's title, date and contents, so it leads the
      // scroll view too rather than living only inside the spread.
      continuous.before(coverPage);
      setMode("continuous");
    };

    const render = (restoreBlock) => {
      const mode = preferredMode();
      if (mode === "spread") {
        try {
          mountSpread(restoreBlock);
          return;
        } catch (error) {
          console.error("Field-note reader fell back to the scroll view.", error);
          goContinuous("paginate-failed");
          return;
        }
      }
      goContinuous();
    };

    /* ---- Wiring ---- */
    previous.addEventListener("click", () => turn(-1));
    next.addEventListener("click", () => turn(1));
    restart.addEventListener("click", () => {
      restart.hidden = true;
      scrollToPage(0);
      syncChrome(0);
    });

    viewToggle.addEventListener("click", () => {
      const goingToScroll = reader.dataset.mode === "spread";
      readerStore.set("notebook:view", goingToScroll ? "scroll" : "spread");
      if (goingToScroll) {
        const block = firstVisibleBlock();
        goContinuous();
        const target = content.children[block];
        target?.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
      } else {
        render();
        track.focus({ preventScroll: true });
      }
    });

    // A click on the outer third of the spread turns the page, unless the
    // reader is in the middle of selecting a quote.
    stage.addEventListener("click", (event) => {
      if (reader.dataset.mode !== "spread") return;
      if (event.target.closest("a, button")) return;
      if (!window.getSelection()?.isCollapsed) return;
      const bounds = stage.getBoundingClientRect();
      if (event.clientX < bounds.left + bounds.width * .28) turn(-1);
      else if (event.clientX > bounds.left + bounds.width * .72) turn(1);
    });

    let readerInView = false;
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entries) => {
        readerInView = entries.some((entry) => entry.isIntersecting);
      }, { threshold: .35 }).observe(stage);
    }

    document.addEventListener("keydown", (event) => {
      if (reader.dataset.mode !== "spread" || !reader.isConnected) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.target.closest("input, textarea, select, [contenteditable]")) return;
      const focused = stage.contains(document.activeElement);
      if (!focused && !readerInView) return;
      const anywhere = {
        ArrowLeft: () => turn(-1),
        ArrowRight: () => turn(1),
        PageUp: () => turn(-1),
        PageDown: () => turn(1)
      };
      const whenFocused = {
        Home: () => scrollToPage(0),
        End: () => scrollToPage(pages.length - 1),
        " ": () => turn(event.shiftKey ? -1 : 1)
      };
      const action = anywhere[event.key] || (focused ? whenFocused[event.key] : null);
      if (!action) return;
      event.preventDefault();
      action();
    });

    // Swiping and trackpad scrolling settle on their own; the chrome catches up
    // once the movement stops rather than on every frame of it.
    let scrollSettle;
    track.addEventListener("scroll", () => {
      window.clearTimeout(scrollSettle);
      scrollSettle = window.setTimeout(() => syncChrome(), 60);
    }, { passive: true });

    outlineLinks.forEach((link) => {
      link.addEventListener("click", (event) => {
        const headingId = link.hash.slice(1);
        if (reader.dataset.mode === "spread") {
          const target = headingPages.get(headingId);
          if (target === undefined) return;
          event.preventDefault();
          scrollToPage(target);
          syncChrome(target);
          history.pushState(null, "", `${location.pathname}${location.search}#${headingId}`);
        }
      });
    });

    window.addEventListener("popstate", () => {
      if (reader.dataset.mode !== "spread") return;
      const target = location.hash.slice(1);
      const pageMatch = /^p(\d+)$/.exec(target);
      if (pageMatch) scrollToPage(Number(pageMatch[1]) - 1);
      else if (headingPages.has(target)) scrollToPage(headingPages.get(target));
    });

    // Only a change in the space available warrants re-paginating; the reader
    // keeps the paragraph it was on.
    let lastSize = "";
    let resizeTimer;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        const size = `${stage.clientWidth}x${Math.round(measureRoom())}x${window.innerWidth}`;
        if (size === lastSize) return;
        lastSize = size;
        // Nothing to restore when the reader is already at the front of the
        // note: block 0 sits on page two, and restoring it would turn past
        // the cover.
        const block = reader.dataset.mode === "spread" && currentPage() > 0
          ? firstVisibleBlock()
          : undefined;
        render(block);
      }, 180);
    };
    if ("ResizeObserver" in window) new ResizeObserver(onResize).observe(document.body);
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);

    /* ---- First paint ---- */
    grid.remove();
    const start = () => {
      const hashTarget = decodeURIComponent(location.hash.slice(1));
      lastSize = `${stage.clientWidth}x${Math.round(measureRoom())}x${window.innerWidth}`;
      render();

      if (reader.dataset.mode === "spread") {
        const pageMatch = /^p(\d+)$/.exec(hashTarget);
        if (pageMatch) scrollToPage(Number(pageMatch[1]) - 1, false);
        else if (headingPages.has(hashTarget)) scrollToPage(headingPages.get(hashTarget), false);
        else {
          // Long notes remember where a reader stopped; short ones are not worth
          // interrupting, and the reader can always go back to page one.
          const saved = readMark();
          if (saved !== null && pages.length > READER_RESUME_PAGES) {
            const resumePage = pageOfBlock(saved);
            if (resumePage > 0) {
              scrollToPage(resumePage, false);
              restart.hidden = false;
            }
          }
        }
        syncChrome();
        // The browser may have jumped to a heading mid-spread; show the whole book.
        if (hashTarget) reader.scrollIntoView({ block: "start", behavior: "auto" });
      } else if (hashTarget && !/^p\d+$/.test(hashTarget)) {
        document.getElementById(hashTarget)?.scrollIntoView({ block: "start", behavior: "auto" });
      }
    };

    let started = false;
    const startOnce = () => {
      if (started) return;
      started = true;
      start();
    };
    // If measuring stalls (fonts that never resolve, a thrown promise), the
    // scroll view takes over rather than leaving a blank sheet.
    const safety = window.setTimeout(() => {
      if (!started) { started = true; goContinuous("slow-start"); }
    }, 1200);
    const finishStart = () => { window.clearTimeout(safety); startOnce(); };
    if (document.fonts?.ready) document.fonts.ready.then(finishStart, finishStart);
    else finishStart();

    /* ---- Place this note in the series and link its neighbours ---- */
    const currentFile = location.pathname.split("/").pop();
    fetch(`${assetPrefix}posts/posts.json`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((posts) => {
        posts.sort((a, b) => new Date(a.date) - new Date(b.date));
        const position = posts.findIndex((post) => post.path.split("/").pop() === currentFile);
        if (position === -1) return;
        bandNumber.textContent = `Field Note No. ${String(position + 1).padStart(2, "0")}`;
        readerLabel.textContent = `From the notebook · Note ${position + 1} of ${posts.length}`;

        const nav = el("nav", "reader-note-nav");
        nav.setAttribute("aria-label", "Other field notes");
        const makeLink = (post, direction) => {
          const link = el("a", `note-nav-link note-nav-${direction}`);
          link.href = `${assetPrefix}${post.path}`;
          link.append(
            el("span", "note-nav-kicker", direction === "prev" ? "← Earlier note" : "Later note →"),
            el("span", "note-nav-title", post.title)
          );
          return link;
        };
        const earlier = posts[position - 1];
        const later = posts[position + 1];
        nav.appendChild(earlier ? makeLink(earlier, "prev") : el("span", "note-nav-empty", "This is the first note"));
        nav.appendChild(later ? makeLink(later, "next") : el("span", "note-nav-empty", "This is the latest note"));
        reader.appendChild(nav);
      })
      .catch(() => {});
  }

  function setupPhotoLightbox() {
    const dialog = $("#photo-lightbox");
    const triggers = $$(".photo-trigger");
    if (!dialog || !triggers.length || typeof dialog.showModal !== "function") return;

    const image = $(".lightbox-image", dialog);
    const caption = $(".lightbox-caption", dialog);
    const count = $(".lightbox-count", dialog);
    const closeButton = $(".lightbox-close", dialog);
    const previousButton = $(".lightbox-prev", dialog);
    const nextButton = $(".lightbox-next", dialog);
    let activeIndex = 0;
    let returnFocus = null;

    const showPhoto = (index) => {
      activeIndex = (index + triggers.length) % triggers.length;
      const trigger = triggers[activeIndex];
      const sourceImage = $("img", trigger);
      image.src = sourceImage.currentSrc || sourceImage.src;
      image.alt = sourceImage.alt;
      caption.textContent = trigger.dataset.caption || sourceImage.alt;
      count.textContent = `${activeIndex + 1} / ${triggers.length}`;
      previousButton.disabled = triggers.length < 2;
      nextButton.disabled = triggers.length < 2;
    };

    const closeLightbox = () => {
      if (dialog.open) dialog.close();
    };

    triggers.forEach((trigger, index) => {
      trigger.addEventListener("click", () => {
        returnFocus = trigger;
        showPhoto(index);
        dialog.showModal();
        closeButton.focus();
        document.body.classList.add("lightbox-open");
      });
    });

    closeButton.addEventListener("click", closeLightbox);
    previousButton.addEventListener("click", () => showPhoto(activeIndex - 1));
    nextButton.addEventListener("click", () => showPhoto(activeIndex + 1));

    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeLightbox();
    });

    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeLightbox();
    });

    dialog.addEventListener("close", () => {
      document.body.classList.remove("lightbox-open");
      returnFocus?.focus();
      returnFocus = null;
    });

    document.addEventListener("keydown", (event) => {
      if (!dialog.open) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        showPhoto(activeIndex - 1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        showPhoto(activeIndex + 1);
      }
    });
  }

  function setupUseCaseSwitcher() {
    $$(".pp-uses-switch").forEach((root) => setupSwitcher(root));
  }

  function setupSwitcher(root) {
    const tabs = $$(".pp-use", root);
    const panes = $$(".pp-use-pane", root);
    if (!tabs.length || !panes.length) return;

    const activate = (tab) => {
      tabs.forEach((other) => {
        const active = other === tab;
        other.classList.toggle("is-active", active);
        other.setAttribute("aria-selected", String(active));
        other.tabIndex = active ? 0 : -1;
      });
      panes.forEach((pane) => {
        const active = pane.id === tab.getAttribute("aria-controls");
        pane.hidden = !active;
        pane.classList.toggle("is-active", active);
      });
    };

    tabs.forEach((tab, index) => {
      tab.addEventListener("mouseenter", () => activate(tab));
      tab.addEventListener("focus", () => activate(tab));
      tab.addEventListener("click", () => activate(tab));
      tab.addEventListener("keydown", (event) => {
        const step = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0;
        if (!step) return;
        event.preventDefault();
        const next = tabs[(index + step + tabs.length) % tabs.length];
        next.focus();
      });
    });
  }

  /* ---- Living header scenes: inline the SVG art so CSS can animate it ---- */
  const SCENE_ART = {
    "masthead-field-notes": "assets/header-field-notes.svg?v=2",
    "masthead-projects": "assets/header-projects.svg?v=2",
    "masthead-photography": "assets/header-photography.svg?v=2",
  };
  const prefersStill = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  async function inlineScene(section, url, replaceNode, label) {
    if (!section || !url || !("fetch" in window)) return;
    try {
      const response = await fetch(url);
      if (!response.ok) return;
      const markup = await response.text();
      const doc = new DOMParser().parseFromString(markup, "image/svg+xml");
      const source = doc.documentElement;
      if (!source || source.nodeName !== "svg") return;
      const svg = document.importNode(source, true);
      svg.classList.add("scene-art");
      svg.setAttribute("focusable", "false");
      if (label) {
        svg.setAttribute("role", "img");
        svg.setAttribute("aria-label", label);
      } else {
        svg.setAttribute("aria-hidden", "true");
        svg.removeAttribute("role");
      }
      svg.removeAttribute("aria-labelledby");
      if (replaceNode) {
        svg.classList.add(...replaceNode.classList);
        replaceNode.replaceWith(svg);
      } else {
        section.prepend(svg);
      }
      section.classList.add("has-scene");
      watchScene(svg);
    } catch (error) {
      /* The CSS background stays in place, so a failed fetch costs nothing. */
    }
  }

  function watchScene(svg) {
    if (!("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => svg.classList.toggle("scene-paused", !entry.isIntersecting));
    }, { threshold: 0.02 });
    io.observe(svg);
  }

  function setupScenes() {
    if (prefersStill()) return;
    $$(".page-masthead").forEach((section) => {
      const key = [...section.classList].find((name) => SCENE_ART[name]);
      inlineScene(section, key ? SCENE_ART[key] : "assets/site-landscape.svg?v=3");
    });
    const heroArt = $(".home-hero .home-landscape");
    if (heroArt) inlineScene(heroArt.parentElement, heroArt.getAttribute("src"), heroArt, heroArt.alt);
  }

  /* ---- Scroll reveals for cards, rows, and notes (including ones rendered later) ---- */
  function setupReveals() {
    const selector = ".section-heading, .pinned-card, .register-row, .note-book, .notes-archive li, .photo-item, .service-card, .logos";
    if (!("IntersectionObserver" in window) || prefersStill()) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -6% 0px", threshold: 0.06 });

    const seen = new WeakSet();
    const scan = () => {
      $$(selector).forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        const parent = el.parentElement;
        const index = parent ? [...parent.children].indexOf(el) : 0;
        el.style.setProperty("--reveal-i", Math.min(index, 7));
        el.classList.add("reveal");
        io.observe(el);
      });
    };
    scan();
    const main = $("main");
    if (main && "MutationObserver" in window) {
      new MutationObserver(scan).observe(main, { childList: true, subtree: true });
    }
  }

  /* ---- Photos fade in as they finish loading ---- */
  function setupPhotoFades() {
    $$(".photo-trigger img").forEach((img) => {
      const done = () => img.classList.add("is-loaded");
      if (img.complete && img.naturalWidth) done();
      else {
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
      }
    });
  }

  renderProjects();
  renderFieldNotes();
  setupUseCaseSwitcher();
  setupNotebookPosts();
  setupPhotoLightbox();
  setupScenes();
  setupReveals();
  setupPhotoFades();
})();
