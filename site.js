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
    const blocks = [...content.children].map((block) => block.cloneNode(true));
    const reader = el("section", "post-reader");
    reader.setAttribute("aria-label", "Paginated field note reader");

    const toolbar = el("div", "reader-toolbar");
    const readerLabel = el("span", "reader-label", "From the notebook");
    const status = el("span", "reader-status");
    const progress = el("span", "reader-progress");
    progress.setAttribute("aria-hidden", "true");
    toolbar.append(readerLabel, status, progress);

    const stage = el("div", "reader-stage");
    stage.setAttribute("aria-live", "polite");
    const pageHost = el("div", "reader-pages");
    const spine = el("div", "reader-spine");
    spine.setAttribute("aria-hidden", "true");
    spine.append(el("span", "reader-staple"), el("span", "reader-staple"), el("span", "reader-staple"));
    stage.append(pageHost, spine);

    const pager = el("div", "reader-pager");
    const previous = el("button", "reader-button reader-prev", "← Previous page");
    previous.type = "button";
    const next = el("button", "reader-button reader-next", "Next page →");
    next.type = "button";
    const hint = el("span", "reader-hint", "Tap a page edge or use the arrow keys");
    pager.append(previous, hint, next);

    reader.append(toolbar, stage, pager);
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
      const body = el("div", "reader-page-body post-content");
      page.append(header, body, createPageNumber());
      return { page, body };
    };

    const sectionOf = (block) => /^(H2|H3)$/.test(block.tagName) ? block.textContent.trim() : null;

    const buildPages = () => {
      const measureHost = el("div", "reader-measure");
      stage.appendChild(measureHost);
      const desktop = window.matchMedia("(min-width: 721px)").matches;
      const pageWidth = Math.max(260, stage.clientWidth / (desktop ? 2 : 1));
      const pages = [coverPage];
      let runningSection = "";
      let current = createArticlePage();
      current.page.style.width = `${pageWidth}px`;
      measureHost.appendChild(current.page);

      const stampSection = (pageRecord, section) => {
        const target = $(".reader-running-section", pageRecord.page);
        if (target) target.textContent = section;
      };

      const finishCurrent = () => {
        if (current.body.children.length) pages.push(current.page);
        current = createArticlePage();
        current.page.style.width = `${pageWidth}px`;
        stampSection(current, runningSection);
        measureHost.replaceChildren(current.page);
      };

      const overflowing = () => current.body.scrollHeight > current.body.clientHeight + 1;

      // Plain paragraphs can run on across pages at sentence boundaries, like handwriting would.
      const sentencesOf = (block) => {
        if (block.tagName !== "P" || block.children.length) return null;
        const sentences = block.textContent.match(/[^.!?]+[.!?]+["”’)\]]*\s*|[^.!?]+$/g);
        return sentences && sentences.length > 1 ? sentences : null;
      };

      const appendParagraphAcrossPages = (block, sentences) => {
        let rest = sentences;
        while (rest.length) {
          const paragraph = block.cloneNode(false);
          current.body.appendChild(paragraph);
          let taken = 0;
          for (const sentence of rest) {
            paragraph.textContent += sentence;
            taken += 1;
            if (overflowing()) {
              taken -= 1;
              paragraph.textContent = rest.slice(0, taken).join("");
              break;
            }
          }
          if (taken === 0) {
            paragraph.remove();
            if (!current.body.children.length) {
              // Nothing else on the page and still no room: keep the paragraph whole rather than loop.
              current.body.appendChild(block.cloneNode(true));
              return;
            }
            finishCurrent();
            continue;
          }
          rest = rest.slice(taken);
          if (rest.length) {
            paragraph.classList.add("runs-on");
            finishCurrent();
          }
        }
      };

      // Lists start on the current page and run on across the fold; ordered lists keep their numbering.
      const appendListAcrossPages = (block) => {
        const total = block.children.length;
        const firstNumber = Number(block.getAttribute("start")) || 1;
        let items = [...block.children];
        while (items.length) {
          const list = block.cloneNode(false);
          if (block.tagName === "OL" && items.length !== total) list.start = firstNumber + (total - items.length);
          current.body.appendChild(list);
          let taken = 0;
          for (const item of items) {
            const copy = item.cloneNode(true);
            list.appendChild(copy);
            if (overflowing()) {
              copy.remove();
              break;
            }
            taken += 1;
          }
          if (taken === 0) {
            if (current.body.children.length > 1) {
              list.remove();
              finishCurrent();
              continue;
            }
            // An item taller than an empty page: place it anyway rather than loop.
            list.appendChild(items[0].cloneNode(true));
            taken = 1;
          }
          items = items.slice(taken);
          if (items.length) {
            list.classList.add("runs-on");
            finishCurrent();
          }
        }
      };

      blocks.forEach((block, index) => {
        const isHeading = /^(H2|H3)$/.test(block.tagName);
        const nextBlock = blocks[index + 1];
        const candidate = block.cloneNode(true);

        if (isHeading && current.body.children.length && nextBlock) {
          // Keep a heading with at least the opening of its first paragraph.
          const nextSentences = sentencesOf(nextBlock);
          const nextCandidate = nextBlock.cloneNode(!nextSentences);
          if (nextSentences) nextCandidate.textContent = nextSentences.slice(0, 2).join("");
          current.body.append(candidate, nextCandidate);
          const headingNeedsRoom = overflowing();
          candidate.remove();
          nextCandidate.remove();
          if (headingNeedsRoom) finishCurrent();
        }

        const contentBlock = block.cloneNode(true);
        current.body.appendChild(contentBlock);
        if (overflowing()) {
          contentBlock.remove();
          const sentences = sentencesOf(block);
          if (sentences) {
            appendParagraphAcrossPages(block, sentences);
          } else if (/^(UL|OL)$/.test(block.tagName) && block.children.length > 1) {
            appendListAcrossPages(block);
          } else {
            if (current.body.children.length) finishCurrent();
            current.body.appendChild(block.cloneNode(true));
          }
        }

        const section = sectionOf(block);
        if (section) {
          runningSection = section;
          // A heading that opens a page names that page; otherwise the page keeps the section it started in.
          const opener = current.body.firstElementChild;
          if (opener && sectionOf(opener) === section) stampSection(current, section);
        }
      });
      if (current.body.children.length) pages.push(current.page);
      measureHost.remove();

      pages.forEach((page, index) => {
        const pageNumber = $(".reader-page-number", page);
        if (pageNumber) pageNumber.textContent = index === 0 ? "" : String(index + 1);
      });
      return pages;
    };

    let pages = [];
    let activePage = 0;
    let resizeTimer;

    const isDesktop = () => window.matchMedia("(min-width: 721px)").matches;
    const visibleCount = () => isDesktop() ? 2 : 1;
    const headingPages = new Map();

    const indexHeadings = () => {
      headingPages.clear();
      pages.forEach((page, index) => {
        $$("[id]", page).forEach((element) => headingPages.set(element.id, index));
      });
      outlineLinks.forEach((link) => {
        const pageIndex = headingPages.get(link.hash.slice(1));
        const pageLabel = $(".outline-page", link);
        if (pageLabel) pageLabel.textContent = pageIndex === undefined ? "" : String(pageIndex + 1);
      });
    };

    const renderPages = (direction = "next") => {
      if (!pages.length) return;
      const count = visibleCount();
      activePage = Math.min(Math.max(0, activePage), Math.max(0, pages.length - count));
      pageHost.classList.remove("turn-next", "turn-prev");
      void pageHost.offsetWidth;
      pageHost.classList.add(direction === "prev" ? "turn-prev" : "turn-next");
      pageHost.replaceChildren(...pages.slice(activePage, activePage + count));
      const endPage = Math.min(activePage + count, pages.length);
      status.textContent = count === 1
        ? `Page ${activePage + 1} of ${pages.length}`
        : `Pages ${activePage + 1}–${endPage} of ${pages.length}`;
      progress.style.setProperty("--reader-progress", `${(endPage / pages.length) * 100}%`);
      previous.disabled = activePage === 0;
      next.disabled = endPage >= pages.length;
      reader.classList.toggle("at-cover", activePage === 0);
      reader.classList.toggle("at-end", endPage >= pages.length);
    };

    const goToHeading = (headingId) => {
      const targetPage = headingPages.get(headingId);
      if (targetPage === undefined) return;
      const previousPage = activePage;
      activePage = Math.min(targetPage, Math.max(0, pages.length - visibleCount()));
      renderPages(activePage < previousPage ? "prev" : "next");
      history.replaceState(null, "", `${location.pathname}${location.search}#${headingId}`);
    };

    outlineLinks.forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        goToHeading(link.hash.slice(1));
      });
    });

    const turn = (direction) => {
      const step = visibleCount();
      activePage += direction * step;
      renderPages(direction < 0 ? "prev" : "next");
    };

    previous.addEventListener("click", () => turn(-1));
    next.addEventListener("click", () => turn(1));
    stage.addEventListener("click", (event) => {
      if (event.target.closest("a, button")) return;
      const bounds = stage.getBoundingClientRect();
      if (event.clientX < bounds.left + bounds.width * .3) turn(-1);
      if (event.clientX > bounds.left + bounds.width * .7) turn(1);
    });
    document.addEventListener("keydown", (event) => {
      if (!reader.isConnected || event.target.closest("input, textarea, select, button, a")) return;
      if (event.key === "ArrowLeft") turn(-1);
      if (event.key === "ArrowRight") turn(1);
    });
    window.addEventListener("resize", () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        pages = buildPages();
        indexHeadings();
        renderPages();
      }, 160);
    });

    pages = buildPages();
    indexHeadings();
    const initialHeading = decodeURIComponent(location.hash.slice(1));
    if (initialHeading && headingPages.has(initialHeading)) activePage = headingPages.get(initialHeading);
    grid.remove();
    renderPages();

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

  renderProjects();
  renderFieldNotes();
  setupUseCaseSwitcher();
  setupNotebookPosts();
  setupPhotoLightbox();
})();
