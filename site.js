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

      const featureWrap = document.createElement("div");
      featureWrap.className = "field-notes";

      posts.slice(0, 2).forEach((post) => {
        const link = document.createElement("a");
        link.className = "note-card";
        link.href = post.path;

        const art = document.createElement("div");
        art.className = "note-illustration";
        const image = document.createElement("img");
        image.src = noteIllustration(post.title);
        image.alt = "";
        art.appendChild(image);

        const copy = document.createElement("div");
        copy.className = "note-copy";
        const date = document.createElement("time");
        date.className = "note-date";
        date.dateTime = post.date;
        date.textContent = formatDate(post.date);
        const title = document.createElement("h2");
        title.textContent = post.title;
        const summary = document.createElement("p");
        summary.textContent = post.summary || "";
        const action = document.createElement("span");
        action.className = "read-note";
        action.textContent = "Read note →";
        copy.append(date, title, summary, action);

        link.append(art, copy);
        featureWrap.appendChild(link);
      });

      const archive = document.createElement("section");
      archive.className = "notes-archive";
      const heading = document.createElement("h2");
      heading.textContent = "More from the notebook";
      archive.appendChild(heading);

      posts.slice(2).forEach((post) => {
        const link = document.createElement("a");
        link.className = "archive-row";
        link.href = post.path;
        const title = document.createElement("strong");
        title.textContent = post.title;
        const date = document.createElement("time");
        date.dateTime = post.date;
        date.textContent = formatDate(post.date);
        link.append(title, date);
        archive.appendChild(link);
      });

      root.replaceChildren(featureWrap, archive);
    } catch (error) {
      root.innerHTML = "<p>Field notes could not be loaded right now.</p>";
    }
  }

  renderProjects();
  renderFieldNotes();
})();
