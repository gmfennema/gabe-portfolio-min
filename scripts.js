// Theme: auto/light/dark
const switchEl = document.querySelector('.switch');
const modes = ['auto','light','dark'];
function apply(mode){
  if(mode==='auto'){ document.documentElement.removeAttribute('data-theme'); }
  else{ document.documentElement.setAttribute('data-theme', mode); }
  localStorage.setItem('theme-mode', mode);
  switchEl.dataset.mode = mode;
}
function init(){
  const m = localStorage.getItem('theme-mode') || 'auto';
  apply(m);
}
switchEl.addEventListener('click', ()=>{
  const m = localStorage.getItem('theme-mode') || 'auto';
  const next = modes[(modes.indexOf(m)+1)%modes.length];
  apply(next);
});
init();

// Active nav
const here = location.pathname.split('/').pop() || 'index.html';
document.querySelectorAll('.nav a').forEach(a=>{
  const href = a.getAttribute('href');
  const isPosts = location.pathname.includes('/posts/');
  const isProjects = location.pathname.includes('/projects/');
  const isRecs = here==='reading.html' || here==='recommendations.html';
  const hrefFile = href.split('/').pop();
  if(
    (isPosts && hrefFile==='writing.html') ||
    (isProjects && hrefFile==='projects.html') ||
    (isRecs && hrefFile==='recommendations.html') ||
    hrefFile===here
  ){
    a.classList.add('active');
  }
});

// Mobile hamburger menu
(function(){
  const header = document.querySelector('header.site');
  const nav = document.querySelector('header.site .nav');
  if(!header || !nav) return;
  if(header.querySelector('.menu-btn')) return; // already injected

  const btn = document.createElement('button');
  btn.className = 'menu-btn';
  btn.setAttribute('aria-label', 'Toggle menu');
  btn.setAttribute('aria-expanded', 'false');
  const icon = document.createElement('span');
  icon.className = 'menu-icon';
  btn.appendChild(icon);

  const toggle = header.querySelector('.toggle');
  if(toggle){
    header.insertBefore(btn, toggle);
  }else{
    header.appendChild(btn);
  }

  function closeMenu(){
    header.classList.remove('menu-open');
    btn.setAttribute('aria-expanded', 'false');
  }
  function openMenu(){
    header.classList.add('menu-open');
    btn.setAttribute('aria-expanded', 'true');
  }
  btn.addEventListener('click', ()=>{
    const isOpen = header.classList.contains('menu-open');
    if(isOpen) closeMenu(); else openMenu();
  });
  // Close on nav link click (mobile)
  nav.addEventListener('click', (e)=>{
    const t = e.target;
    if(t && t.tagName==='A') closeMenu();
  });
  // Reset on resize to desktop
  const mq = window.matchMedia('(min-width: 721px)');
  function handleMq(e){ if(e.matches) closeMenu(); }
  if(mq.addEventListener) mq.addEventListener('change', handleMq); else mq.addListener(handleMq);
})();

// Auto-populate Writing page from posts manifest
(async function(){
  const root = document.getElementById('writing-root');
  if(!root) return;
  try{
    const res = await fetch('posts/posts.json', {cache:'no-store'});
    if(!res.ok) throw new Error('Failed to load posts');
    const posts = await res.json();
    // sort by date desc
    posts.sort((a,b)=> new Date(b.date) - new Date(a.date));
    // group by year
    const byYear = posts.reduce((acc, p)=>{
      const y = new Date(p.date).getFullYear();
      (acc[y]||(acc[y]=[])).push(p);
      return acc;
    },{});
    const years = Object.keys(byYear).sort((a,b)=> Number(b)-Number(a));
    root.innerHTML = '';
    years.forEach(y=>{
      const yearEl = document.createElement('div');
      yearEl.className = 'year';
      yearEl.textContent = y;
      const ul = document.createElement('ul');
      ul.className = 'postlist';
      byYear[y].forEach(p=>{
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = p.path;
        a.textContent = p.title;
        const span = document.createElement('span');
        span.className = 'date';
        span.textContent = new Date(p.date).toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'});
        li.appendChild(a); li.appendChild(span);
        ul.appendChild(li);
      });
      root.appendChild(yearEl);
      root.appendChild(ul);
    });
  }catch(err){
    root.innerHTML = '<p class="center-sub">No posts yet. Add HTML files under <code>posts/</code>.</p>'
  }
})();

// Auto-populate Projects page from projects manifest
(async function(){
  const root = document.getElementById('projects-root');
  if(!root) return;
  try{
    const res = await fetch('projects/projects.json', {cache:'no-store'});
    if(!res.ok) throw new Error('Failed to load projects');
    const projects = await res.json();
    // sort by date desc if provided
    projects.sort((a,b)=> new Date(b.date||0) - new Date(a.date||0));
    root.innerHTML = '';
    projects.forEach(p=>{
      const card = document.createElement('div');
      card.className = 'project-card';

      const content = document.createElement('div');
      content.className = 'project-content';
      const title = document.createElement('a');
      title.className = 'project-title';
      title.href = p.path;
      title.textContent = p.title;
      const summary = document.createElement('p');
      summary.className = 'project-summary';
      summary.textContent = p.summary || '';

      content.appendChild(title);
      content.appendChild(summary);

      if(p.links && Array.isArray(p.links) && p.links.length){
        const links = document.createElement('div');
        links.className = 'project-links';
        p.links.forEach(l=>{
          const a = document.createElement('a');
          a.className = 'badge';
          a.href = l.url;
          a.target = '_blank';
          a.rel = 'noopener';
          a.textContent = l.label || 'Link';
          links.appendChild(a);
        });
        content.appendChild(links);
      }
      card.appendChild(content);
      root.appendChild(card);
    });
  }catch(err){
    root.innerHTML = '<p class="center-sub">No projects yet. Add HTML files under <code>projects/</code> and list them in <code>projects/projects.json</code>.</p>'
  }
})();

// Home: latest posts (from posts manifest)
// Home: three-column highlight (latest writing, recommendation, project)
(async function(){
  const grid = document.getElementById('home-cards');
  if(!grid) return;

  function createCard({eyebrow, titleText, href, summary, actions}){
    const card = document.createElement('div');
    card.className = 'home-card';
    const eye = document.createElement('div'); eye.className = 'eyebrow'; eye.textContent = eyebrow;
    const h3 = document.createElement('h3');
    const a = document.createElement('a'); a.href = href || '#'; a.textContent = titleText || 'Untitled';
    h3.appendChild(a);
    const p = document.createElement('p'); p.textContent = summary || '';
    card.appendChild(eye); card.appendChild(h3); card.appendChild(p);
    if(actions && actions.length){
      const row = document.createElement('div'); row.className = 'actions';
      actions.forEach(act=>{
        const b = document.createElement('a'); b.className = 'badge'; b.href = act.href; b.textContent = act.label; if(act.newTab){ b.target = '_blank'; b.rel = 'noopener'; }
        row.appendChild(b);
      });
      card.appendChild(row);
    }
    return card;
  }

  try{
    // fetch all in parallel
    const [postsRes, recsRes, projRes] = await Promise.all([
      fetch('posts/posts.json', {cache:'no-store'}),
      fetch('recommendations/recommendations.json', {cache:'no-store'}),
      fetch('projects/projects.json', {cache:'no-store'})
    ]);
    const [posts, recs, projects] = await Promise.all([
      postsRes.ok ? postsRes.json() : [],
      recsRes.ok ? recsRes.json() : [],
      projRes.ok ? projRes.json() : []
    ]);

    // latest post
    if(Array.isArray(posts) && posts.length){
      posts.sort((a,b)=> new Date(b.date) - new Date(a.date));
      const p = posts[0];
      grid.appendChild(createCard({
        eyebrow: 'Latest Writing',
        titleText: p.title,
        href: p.path,
        summary: p.summary,
        actions: [{label:'All writing', href:'writing.html'}]
      }));
    }

    // latest recommendation
    if(Array.isArray(recs) && recs.length){
      recs.sort((a,b)=> new Date(b.date||0) - new Date(a.date||0));
      const r = recs[0];
      const title = r.title + (r.author ? ` — ${r.author}` : '');
      const summary = r.note || '';
      grid.appendChild(createCard({
        eyebrow: 'Latest Recommendation',
        titleText: title,
        href: r.url || 'recommendations.html',
        summary,
        actions: [{label:'All recs', href:'recommendations.html'}]
      }));
    }

    // latest project
    if(Array.isArray(projects) && projects.length){
      projects.sort((a,b)=> new Date(b.date||0) - new Date(a.date||0));
      const pr = projects[0];
      const actions = [{label:'All projects', href:'projects.html'}];
      if(pr.links && pr.links[0]) actions.unshift({label: pr.links[0].label || 'View', href: pr.links[0].url, newTab: true});
      grid.appendChild(createCard({
        eyebrow: 'Latest Project',
        titleText: pr.title,
        href: pr.path,
        summary: pr.summary,
        actions
      }));
    }
  }catch(err){
    grid.innerHTML = '<p class="center-sub">Could not load latest items.</p>';
  }
})();

  // Auto-populate Recommendations from manifest
  (async function(){
    const root = document.getElementById('recs-root');
    if(!root) return;
    try{
      const res = await fetch('recommendations/recommendations.json', {cache:'no-store'});
      if(!res.ok) throw new Error('Failed to load recommendations');
      const items = await res.json();
      // newest first if date provided
      items.sort((a,b)=> new Date(b.date||0) - new Date(a.date||0));

      const head = document.createElement('div');
      head.className = 'recs-head';
      head.innerHTML = '<div>TYPE</div><div>TITLE · BY/WHERE</div><div style="text-align:right">RATING</div>';
      root.appendChild(head);

      items.forEach(it=>{
        const item = document.createElement('div');
        item.className = 'recs-item';
        const row = document.createElement('div');
        row.className = 'recs-row';

        const type = document.createElement('div');
        type.className = 'recs-type';
        type.textContent = (it.type||'').toUpperCase();

        const main = document.createElement('div');
        const title = document.createElement('p');
        title.className = 'recs-title';
        const a = document.createElement('a');
        a.href = it.url || '#';
        if(it.url) { a.target = '_blank'; a.rel = 'noopener'; }
        a.textContent = it.title || 'Untitled';
        title.appendChild(a);
        const meta = document.createElement('div');
        meta.className = 'recs-meta';
        const by = [it.author, it.source].filter(Boolean).join(' — ');
        const when = it.date ? new Date(it.date).toLocaleDateString(undefined, {year:'numeric', month:'short'}) : '';
        meta.textContent = [by, when].filter(Boolean).join(' · ');
        main.appendChild(title);
        if(meta.textContent) main.appendChild(meta);

        const rating = document.createElement('div');
        rating.className = 'recs-rating';
        rating.setAttribute('aria-label','Rating');
        const max = 5;
        const raw = Number(it.rating||0);
        const value = Math.max(0, Math.min(max, Math.round(raw*2)/2)); // nearest 0.5
        for(let i=1;i<=max;i++){
          const span = document.createElement('span');
          let cls = 'star';
          if(i <= Math.floor(value)) cls += ' filled';
          else if(i - 0.5 === value) cls += ' half';
          span.className = cls;
          rating.appendChild(span);
        }

        row.appendChild(type);
        row.appendChild(main);
        row.appendChild(rating);
        item.appendChild(row);

        if(it.note){
          const note = document.createElement('p');
          note.className = 'recs-note';
          note.textContent = it.note;
          item.appendChild(note);
        }

        root.appendChild(item);
      });
    }catch(err){
      root.innerHTML = '<p class="center-sub">No recommendations yet. Add JSON entries under <code>recommendations/recommendations.json</code>.</p>'
    }
  })();