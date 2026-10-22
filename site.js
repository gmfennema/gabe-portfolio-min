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
     Field notes

     A note is an ordinary <article> on a page of its own, and it stays
     that way: one column of prose that scrolls, prints and reads the
     same with or without this script. What the script adds is the
     furniture a reader leans on: a running head that names the section
     being read and how far through the note they are, a contents list,
     the reading time, and the note's place among the others.
     ========================================================= */

  const NOTE_WORDS_PER_MINUTE = 220;

  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const roman = (n) => [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]].reduce((out, [value, glyph]) => {
    while (n >= value) { out += glyph; n -= value; }
    return out;
  }, "");

  const slug = (text) => text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  // A note is divided at its h2s, or at its h3s when it never uses an h2.
  // The stylesheet numbers the same headings, so the numerals agree, unless
  // the note is .self-numbered: its headings already say "1." or "Part 1".
  function noteSections(body) {
    const h2s = $$(":scope > h2", body);
    return h2s.length ? h2s : $$(":scope > h3", body);
  }

  function setupNotes() {
    const note = $("main.note");
    const head = note && $(".note-head", note);
    const body = note && $(".note-body", note);
    if (!head || !body) return;

    const title = ($(".note-title", head)?.textContent || document.title).trim();
    const words = body.textContent.trim().split(/\s+/).filter(Boolean).length;
    const meta = $(".note-meta", head);
    if (meta) {
      const dot = make("span", "note-dot", "·");
      dot.setAttribute("aria-hidden", "true");
      meta.append(dot, `${Math.max(1, Math.round(words / NOTE_WORDS_PER_MINUTE))} min read`);
    }

    const ownNumbers = body.classList.contains("self-numbered");
    const sections = noteSections(body).map((heading, index) => {
      if (!heading.id) {
        const base = slug(heading.textContent) || `section-${index + 1}`;
        let id = base;
        for (let n = 2; document.getElementById(id); n += 1) id = `${base}-${n}`;
        heading.id = id;
      }
      return { heading, number: ownNumbers ? "" : roman(index + 1), name: heading.textContent.trim() };
    });

    const contentsList = () => {
      const list = make("ol");
      sections.forEach((section) => {
        const link = make("a");
        link.href = `#${section.heading.id}`;
        if (section.number) {
          const number = make("span", "note-num", section.number);
          number.setAttribute("aria-hidden", "true");
          link.appendChild(number);
        }
        link.appendChild(make("span", "note-entry", section.name));
        const item = make("li");
        item.appendChild(link);
        list.appendChild(item);
      });
      return list;
    };

    // Contents, under the title. One section is not worth a list.
    if (sections.length > 1) {
      const contents = make("nav", ownNumbers ? "note-contents is-self-numbered" : "note-contents");
      contents.setAttribute("aria-labelledby", "note-contents-label");
      const label = make("p", "note-contents-label", "Contents");
      label.id = "note-contents-label";
      contents.append(label, contentsList());
      body.before(contents);
    }

    /* ---- The running head ---- */
    const hasMenu = sections.length > 0;
    const bar = make(hasMenu ? "details" : "div", "note-bar");
    const line = make(hasMenu ? "summary" : "div", "note-bar-line");
    const barTitle = make("span", "note-bar-title", title);
    line.appendChild(barTitle);
    const barNumber = make("span", "note-num");
    const barName = make("span", "note-bar-name");
    if (hasMenu) {
      const where = make("span", "note-bar-section");
      barNumber.setAttribute("aria-hidden", "true");
      if (!ownNumbers) where.appendChild(barNumber);
      where.appendChild(barName);
      const chevron = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      chevron.setAttribute("class", "note-bar-chevron");
      chevron.setAttribute("viewBox", "0 0 12 12");
      chevron.setAttribute("aria-hidden", "true");
      chevron.innerHTML = '<path d="M3 4.5 6 7.5 9 4.5"/>';
      line.append(where, chevron);
    } else {
      bar.classList.add("is-plain");
    }
    const track = make("span", "note-progress");
    track.setAttribute("aria-hidden", "true");
    const fill = make("span");
    track.appendChild(fill);
    line.appendChild(track);
    bar.appendChild(line);

    let menuLinks = [];
    if (hasMenu) {
      const menu = make("div", "note-bar-menu");
      const list = contentsList();
      menu.appendChild(list);
      bar.appendChild(menu);
      menuLinks = $$("a", list);

      const close = () => { bar.open = false; };
      list.addEventListener("click", (event) => { if (event.target.closest("a")) close(); });
      document.addEventListener("click", (event) => { if (bar.open && !bar.contains(event.target)) close(); });
      bar.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && bar.open) { close(); line.focus(); }
      });
    }
    note.prepend(bar);

    /* ---- Where the reader is ---- */
    // Browsers already deliver scroll at most once a frame, so this measures
    // straight from the event rather than waiting on another frame.
    let current = -1;
    const measure = () => {
      const view = window.innerHeight;
      // A heading this close to the top is the section being read.
      const reading = Math.min(view * 0.35, 260);
      let index = 0;
      sections.forEach((section, i) => {
        if (section.heading.getBoundingClientRect().top <= reading) index = i;
      });
      const box = body.getBoundingClientRect();
      // A short note on a tall screen may run out of page before its top
      // passes the top of the window, so the foot of the page counts as read.
      const atFoot = view + window.scrollY >= document.documentElement.scrollHeight - 2;
      const progress = atFoot ? 1 : Math.min(1, Math.max(0, -box.top / Math.max(1, box.height - view)));
      fill.style.transform = `scaleX(${progress.toFixed(4)})`;

      if (!hasMenu || index === current) return;
      current = index;
      const section = sections[index];
      barNumber.textContent = section.number;
      barName.textContent = section.name;
      line.setAttribute("aria-label", `Contents. Reading ${section.name}`);
      menuLinks.forEach((link, i) => {
        if (i === index) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      });
    };
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    measure();

    /* ---- The note's place in the series, and its neighbours ---- */
    const kicker = $(".note-kicker", head);
    const after = $(".note-after", note);
    // Pages also answer without their .html, so compare names without it.
    const fileName = (path) => path.split("/").pop().replace(/\.html$/, "");
    const currentFile = fileName(location.pathname);
    fetch("posts.json", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((posts) => {
        posts.sort((a, b) => new Date(a.date) - new Date(b.date));
        const position = posts.findIndex((post) => fileName(post.path) === currentFile);
        if (position === -1) return;
        if (kicker) kicker.textContent = `Field Note No. ${String(position + 1).padStart(2, "0")}`;
        if (!after) return;

        const neighbour = (post, label, className) => {
          const link = make("a", `note-neighbour ${className}`);
          link.href = post.path.split("/").pop();
          link.append(make("span", "note-neighbour-label", label), make("span", "note-neighbour-title", post.title));
          return link;
        };
        const earlier = posts[position - 1];
        const later = posts[position + 1];
        if (earlier) after.prepend(neighbour(earlier, "Previously", "is-earlier"));
        if (later) after.append(neighbour(later, "Next", "is-later"));
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
  setupNotes();
  setupPhotoLightbox();
  setupScenes();
  setupReveals();
  setupPhotoFades();
})();
