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

  async function renderProjects() {
    const projectsRoot = $("#projects-root");
    const featuredRoot = $("#featured-projects-root");
    if (!projectsRoot) return;

    try {
      const response = await fetch("projects/projects.json", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load projects");
      const projects = await response.json();
      projects.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

      projectsRoot.replaceChildren();
      featuredRoot?.replaceChildren();

      projects.filter((project) => project.featured).slice(0, 4).forEach((project) => {
        const card = document.createElement("article");
        card.className = "featured-card";
        const content = document.createElement("div");
        content.className = "featured-content";

        const badge = document.createElement("span");
        badge.className = "featured-badge";
        badge.textContent = "Featured";

        const title = document.createElement("a");
        title.className = "featured-title";
        title.href = project.path;
        title.textContent = project.title;

        const summary = document.createElement("p");
        summary.className = "featured-summary";
        summary.textContent = project.summary || "";

        content.append(badge, title, summary);
        appendLinkGroup(content, project.links, "featured-links");
        card.appendChild(content);
        featuredRoot?.appendChild(card);
      });

      projects.forEach((project) => {
        const card = document.createElement("article");
        card.className = "project-card";

        const title = document.createElement("a");
        title.className = "project-title";
        title.href = project.path;
        title.textContent = project.title;

        const summary = document.createElement("p");
        summary.className = "project-summary";
        summary.textContent = project.summary || "";

        card.append(title, summary);
        appendLinkGroup(card, project.links, "project-links");
        projectsRoot.appendChild(card);
      });
    } catch (error) {
      projectsRoot.innerHTML = "<p>Projects could not be loaded right now.</p>";
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
      posts.slice(0, 3).forEach((post) => {
        const link = document.createElement("a");
        link.className = "note-feature-card";
        link.href = post.path;

        const art = document.createElement("div");
        art.className = "note-feature-art";
        const image = document.createElement("img");
        image.src = noteIllustration(post.title);
        image.alt = "";
        art.appendChild(image);

        const copy = document.createElement("div");
        copy.className = "note-feature-copy";
        const date = document.createElement("time");
        date.className = "note-date";
        date.dateTime = post.date;
        date.textContent = formatDate(post.date);
        const title = document.createElement("h3");
        title.textContent = post.title;
        const summary = document.createElement("p");
        summary.textContent = post.summary || "";
        const action = document.createElement("span");
        action.className = "read-note";
        action.textContent = "Read note →";
        copy.append(date, title, summary, action);

        link.append(art, copy);
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

    const kicker = document.createElement("span");
    kicker.className = "notebook-kicker";
    kicker.textContent = "Field note";

    const date = document.createElement("time");
    date.className = "notebook-date";
    date.dateTime = dateMeta.content;
    date.textContent = formatDate(dateMeta.content);

    const description = $("meta[name='description']");
    const summary = document.createElement("p");
    summary.className = "notebook-summary";
    summary.textContent = description?.content || "A note from the notebook.";

    const readingTime = document.createElement("span");
    readingTime.className = "notebook-reading-time";
    const wordCount = content.textContent.trim().split(/\s+/).filter(Boolean).length;
    readingTime.textContent = `${Math.max(1, Math.round(wordCount / 220))} min read`;

    title.before(kicker, date);
    title.after(summary, readingTime);

    const illustration = document.createElement("img");
    illustration.className = "notebook-illustration";
    const assetPrefix = location.pathname.includes("/posts/") ? "../" : "";
    illustration.src = `${assetPrefix}${noteIllustration(title.textContent)}`;
    illustration.alt = "";
    hero.appendChild(illustration);

    const headings = $$("h2", content);
    if (headings.length) {
      const outline = document.createElement("nav");
      outline.className = "post-outline";
      outline.setAttribute("aria-label", "In this note");
      const outlineLabel = document.createElement("strong");
      outlineLabel.textContent = "In this note";
      outline.appendChild(outlineLabel);

      headings.forEach((heading, index) => {
        if (!heading.id) heading.id = `note-section-${index + 1}`;
        const link = document.createElement("a");
        link.href = `#${heading.id}`;
        link.textContent = heading.textContent.replace(/^\d+\.\s*/, "");
        outline.appendChild(link);
      });
      hero.appendChild(outline);
    }

    hero.appendChild(meta);

    const blocks = [...content.children].map((block) => block.cloneNode(true));
    const reader = document.createElement("section");
    reader.className = "post-reader";
    reader.setAttribute("aria-label", "Paginated field note reader");

    const toolbar = document.createElement("div");
    toolbar.className = "reader-toolbar";
    const readerLabel = document.createElement("span");
    readerLabel.className = "reader-label";
    readerLabel.textContent = "Field note reader";
    const status = document.createElement("span");
    status.className = "reader-status";
    const progress = document.createElement("span");
    progress.className = "reader-progress";
    progress.setAttribute("aria-hidden", "true");
    toolbar.append(readerLabel, status, progress);

    const stage = document.createElement("div");
    stage.className = "reader-stage";
    stage.setAttribute("aria-live", "polite");
    const pageHost = document.createElement("div");
    pageHost.className = "reader-pages";
    stage.appendChild(pageHost);

    const pager = document.createElement("div");
    pager.className = "reader-pager";
    const previous = document.createElement("button");
    previous.className = "reader-button reader-prev";
    previous.type = "button";
    previous.textContent = "← Previous page";
    const next = document.createElement("button");
    next.className = "reader-button reader-next";
    next.type = "button";
    next.textContent = "Next page →";
    pager.append(previous, next);

    reader.append(toolbar, stage, pager);
    hero.before(reader);

    const coverPage = document.createElement("article");
    coverPage.className = "reader-page reader-cover-page";

    const createReaderFooter = () => {
      const footer = document.createElement("footer");
      footer.className = "reader-page-footer";
      const pageLabel = document.createElement("span");
      pageLabel.className = "reader-page-label";
      pageLabel.textContent = title.textContent;
      const pageNumber = document.createElement("span");
      pageNumber.className = "reader-page-number";
      footer.append(pageLabel, pageNumber);
      return footer;
    };
    coverPage.append(hero, createReaderFooter());

    const createArticlePage = () => {
      const page = document.createElement("article");
      page.className = "reader-page reader-article-page";
      const header = document.createElement("header");
      header.className = "reader-page-header";
      header.textContent = title.textContent;
      const body = document.createElement("div");
      body.className = "reader-page-body post-content";
      page.append(header, body, createReaderFooter());
      return { page, body };
    };

    const buildPages = () => {
      const measureHost = document.createElement("div");
      measureHost.className = "reader-measure";
      stage.appendChild(measureHost);
      const desktop = window.matchMedia("(min-width: 721px)").matches;
      const gap = desktop ? 18 : 0;
      const pageWidth = Math.max(260, (stage.clientWidth - gap) / (desktop ? 2 : 1));
      const pages = [coverPage];
      let current = createArticlePage();
      current.page.style.width = `${pageWidth}px`;
      measureHost.appendChild(current.page);

      const finishCurrent = () => {
        if (current.body.children.length) pages.push(current.page);
        current = createArticlePage();
        current.page.style.width = `${pageWidth}px`;
        measureHost.replaceChildren(current.page);
      };

      const appendListAcrossPages = (block) => {
        let list = block.cloneNode(false);
        current.body.appendChild(list);
        [...block.children].forEach((item) => {
          const itemCopy = item.cloneNode(true);
          list.appendChild(itemCopy);
          if (current.body.scrollHeight > current.body.clientHeight + 1 && list.children.length > 1) {
            itemCopy.remove();
            finishCurrent();
            list = block.cloneNode(false);
            current.body.appendChild(list);
            list.appendChild(item.cloneNode(true));
          }
        });
      };

      blocks.forEach((block, index) => {
        const isHeading = /^(H2|H3)$/.test(block.tagName);
        const nextBlock = blocks[index + 1];
        const candidate = block.cloneNode(true);

        if (isHeading && current.body.children.length && nextBlock) {
          const nextCandidate = nextBlock.cloneNode(true);
          current.body.append(candidate, nextCandidate);
          const headingNeedsRoom = current.body.scrollHeight > current.body.clientHeight + 1;
          candidate.remove();
          nextCandidate.remove();
          if (headingNeedsRoom) finishCurrent();
        }

        const contentBlock = block.cloneNode(true);
        current.body.appendChild(contentBlock);
        if (current.body.scrollHeight > current.body.clientHeight + 1) {
          contentBlock.remove();
          if (current.body.children.length) finishCurrent();
          if (/^(UL|OL)$/.test(block.tagName) && block.children.length > 1) {
            appendListAcrossPages(block);
          } else {
            current.body.appendChild(block.cloneNode(true));
          }
        }
      });
      if (current.body.children.length) pages.push(current.page);
      measureHost.remove();

      pages.forEach((page, index) => {
        const pageNumber = $(".reader-page-number", page);
        if (pageNumber) pageNumber.textContent = `${index + 1} / ${pages.length}`;
      });
      return pages;
    };

    let pages = [];
    let activePage = 0;
    let resizeTimer;

    const isDesktop = () => window.matchMedia("(min-width: 721px)").matches;
    const visibleCount = () => isDesktop() ? 2 : 1;
    const headingPages = new Map();

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
    };

    const goToHeading = (headingId) => {
      const targetPage = headingPages.get(headingId);
      if (targetPage === undefined) return;
      const previousPage = activePage;
      activePage = Math.min(targetPage, Math.max(0, pages.length - visibleCount()));
      renderPages(activePage < previousPage ? "prev" : "next");
      history.replaceState(null, "", `${location.pathname}${location.search}#${headingId}`);
    };

    $$(".post-outline a", coverPage).forEach((link) => {
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
        renderPages();
      }, 160);
    });

    pages = buildPages();
    pages.forEach((page, index) => {
      $$('[id]', page).forEach((element) => headingPages.set(element.id, index));
    });
    const initialHeading = decodeURIComponent(location.hash.slice(1));
    if (initialHeading && headingPages.has(initialHeading)) activePage = headingPages.get(initialHeading);
    grid.remove();
    renderPages();

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

  renderProjects();
  renderFieldNotes();
  setupNotebookPosts();
  setupPhotoLightbox();
})();
