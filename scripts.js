// Year
document.querySelectorAll("[data-year]").forEach(el => el.textContent = new Date().getFullYear());

// Header behavior: transparent over hero, solid when scrolled
(function(){
  const header = document.querySelector("[data-header]");
  if (!header) return;
  const transparent = header.classList.contains("transparent");
  const onScroll = () => {
    if (!transparent) return;
    const scrolled = window.scrollY > 24;
    header.classList.toggle("solid", scrolled);
    header.classList.toggle("transparent", !scrolled);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
})();

// Mobile menu
(function(){
  const btn = document.querySelector("[data-menu-btn]");
  const nav = document.querySelector("[data-nav]");
  if (!btn || !nav) return;
  btn.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    btn.setAttribute("aria-expanded", String(open));
  });
})();

// Scroll reveal (subtle fade on scroll)
(function(){
  const items = document.querySelectorAll("[data-animate]");
  if (!items.length) return;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) e.target.classList.add("in");
  }, { rootMargin: "0px 0px -10% 0px", threshold: 0.1 });
  items.forEach(el => io.observe(el));
})();

// Load Articles
(async function(){
  const grid = document.getElementById("articles-grid");
  if (!grid) return;
  try {
    const res = await fetch("data/articles.json", { cache: "no-store" });
    const items = await res.json();
    grid.innerHTML = items.map(renderCard).join("");
  } catch (e) {
    grid.innerHTML = `<div class="muted">Failed to load articles.</div>`;
  }
})();

// Load News
(async function(){
  const grid = document.getElementById("news-grid");
  if (!grid) return;
  try {
    const res = await fetch("data/news.json", { cache: "no-store" });
    const items = await res.json();
    grid.innerHTML = items.map(renderCard).join("");
  } catch (e) {
    grid.innerHTML = `<div class="muted">Failed to load news.</div>`;
  }
})();

function renderCard(item){
  const date = item.date ? `<time class="muted" datetime="${item.date}">${new Date(item.date).toDateString()}</time>` : "";
  return `
    <a class="card hover" href="${item.url || '#'}" ${item.url ? '' : 'aria-disabled="true"'} >
      <h3>${escapeHtml(item.title || "Untitled")}</h3>
      <p>${escapeHtml(item.excerpt || "")}</p>
      ${date}
    </a>
  `;
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// Contact form (client-side submit simulation)
(function(){
  const form = document.getElementById("contact-form");
  if (!form) return;
  const status = document.getElementById("form-status");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());

    // simple validation
    if (!data.name || !data.email || !data.message) {
      status.textContent = "Please fill all fields.";
      return;
    }

    // simulate submit; replace with fetch('YOUR_ENDPOINT', {method:'POST', body: JSON.stringify(data)})
    await new Promise(r => setTimeout(r, 600));
    status.textContent = "Message sent (simulation). Replace with your backend endpoint.";
    form.reset();
  });
})();

// Render a DOCX inline (no content changes)
function renderDocx(targetSelector, docxUrl, statusSelector){
  const target = document.querySelector(targetSelector);
  const status = statusSelector ? document.querySelector(statusSelector) : null;
  if (!target || !window.mammoth) return Promise.reject(new Error("renderDocx: missing target or mammoth"));

  status && (status.textContent = "Loading document…");

  // RETURN the chain
  return fetch(docxUrl, { cache: "no-store" })
    .then(r => { if (!r.ok) throw new Error("HTTP " + r.status + " " + docxUrl); return r.arrayBuffer(); })
    .then(buf => window.mammoth.convertToHtml({ arrayBuffer: buf }))
    .then(result => {
      target.innerHTML = result.value;
      injectDocxEmbeds(target);
      status && (status.textContent = "");
      return target; // resolve after content is in the DOM
    })
    .catch(err => {
      status && (status.textContent = "Could not display the document.");
      console.error("DOCX render error:", err);
      throw err;
    });
}


function setReadingTime(rootSelector, outSelector){
  var root = document.querySelector(rootSelector);
  var out  = document.querySelector(outSelector);
  if (!root || !out) return;

  var text = (root.textContent || "").trim();
  var words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  var minutes = Math.max(1, Math.round(words / 225)); // ~225 wpm

  out.textContent = minutes + " min read";
}
    
// Replace [ SANKEY PLOT ] and [ MAP PLOT ] placeholders with iframes
function injectDocxEmbeds(root){
  if (!root) return;
  var EMBEDS = {
    "[ SANKEY PLOT]": "../climate_finance_sankey.html",
    "[ SANKEY PLOT ]": "../climate_finance_sankey.html",
    "[MAP PLOT]": "../climate_finance_map.html",
    "[ MAP PLOT ]": "../climate_finance_map.html"
  };
  Array.from(root.querySelectorAll("p, div, li")).forEach(function(el){
    var key = el.textContent.trim().toUpperCase();
    if (EMBEDS[key]) {
      var iframe = document.createElement("iframe");
      iframe.className = "plot-embed";
      iframe.title = key.includes("SANKEY") ? "Climate finance Sankey" : "Climate finance map";
      iframe.src = EMBEDS[key];
      iframe.style.width = "100%";   // full width of the article column
      iframe.style.border = "0";
      iframe.setAttribute("scrolling", "yes");
      // no fixed height; the child posts its height
      el.replaceWith(iframe);
    }
  });
}

 // Auto-resize incoming plot iframes
window.addEventListener("message", function (e) {
    // tighten this if you serve from your domain: if (e.origin !== location.origin) return;
    var data = e.data || {};
    if (data.type !== "plot-size") return;
  
    // find the iframe that sent this message
    document.querySelectorAll("iframe.plot-embed").forEach(function (ifr) {
      try {
        if (ifr.contentWindow === e.source) {
          ifr.style.height = (data.height|0) + "px";
        }
      } catch (_) {}
    });
  });

// Add body padding only after we scroll past the hero
(function(){
  var header = document.querySelector("[data-header]");
  var hero   = document.querySelector(".page-hero");
  if (!header) return;

  function tick(){
    var h = header.offsetHeight || 64;
    // when we've scrolled past the hero, add padding so content isn't covered
    if (hero && window.scrollY >= (hero.offsetHeight - h)) {
      document.body.classList.add("header-fixed-space");
    } else {
      document.body.classList.remove("header-fixed-space");
    }
  }
  addEventListener("scroll", tick, { passive:true });
  addEventListener("resize", tick);
  tick();
})();

(function(){
  var header = document.querySelector("[data-header]");
  var hero   = document.querySelector(".page-hero");
  if (!header) return;

  // 1) Toggle .scrolled after 24px
  function onScroll(){
    if (window.scrollY > 24) header.classList.add("scrolled");
    else header.classList.remove("scrolled");
  }
  addEventListener("scroll", onScroll, { passive:true });
  onScroll();

  // 2) Make header transparent over a dark hero, solid elsewhere
  if ("IntersectionObserver" in window && hero){
    var io = new IntersectionObserver(function(entries){
      var e = entries[0];
      if (e && e.isIntersecting) {
        header.classList.remove("solid");
        header.classList.add("transparent");
      } else {
        header.classList.remove("transparent");
        header.classList.add("solid");
      }
    }, { rootMargin: "-64px 0px 0px 0px", threshold: 0.01 });
    io.observe(hero);
  } else {
    // Fallback: solid after first viewport
    addEventListener("scroll", function(){
      if (window.scrollY > (hero?.offsetHeight || 300) - 64)
        header.classList.add("solid");
      else header.classList.remove("solid");
    }, { passive:true });
  }
})();
(function heroCarousel(){
  const carousels = document.querySelectorAll('.hero-carousel');
  carousels.forEach(($c) => {
    const slides = Array.from($c.querySelectorAll('.slide'));
    if (!slides.length) return;

    const frame = $c.closest('.hero-media-frame');
    const captionEl = frame ? frame.querySelector('.hc-caption') : null;

    let idx = slides.findIndex(s => s.classList.contains('is-active'));
    if (idx < 0) idx = 0;

    let timer = null;

    function captionFor(s){
      return s.dataset.caption || '';
    }

    function pauseIfVideo(s){
      const v = s.querySelector('video');
      if (v) { v.pause(); v.currentTime = 0; v.onended = null; }
    }

    function activate(n){
      // deactivate current
      slides.forEach((s,i)=>{
        if (i !== n) s.classList.remove('is-active');
      });
      pauseIfVideo(slides[idx]);

      // activate new
      slides[n].classList.add('is-active');
      if (captionEl) captionEl.textContent = captionFor(slides[n]);

      scheduleNext(n);
      idx = n;
    }

    function scheduleNext(n){
      clearTimeout(timer);

      const s = slides[n];
      const v = s.querySelector('video');

      // preferred: explicit per-slide duration
      let ms = parseInt(s.dataset.duration || '', 10);

      if (v){
        v.muted = true; v.playsInline = true;
        // if no explicit duration, try video duration; fallback 6000
        const useDuration = () => {
          if (!ms){
            const d = Number.isFinite(v.duration) && v.duration > 0 ? v.duration*1000 : 6000;
            ms = Math.min(Math.max(d, 3000), 15000);
          }
          // also advance on ended to avoid stalling
          v.onended = () => { clearTimeout(timer); next(); };
          v.play().catch(()=>{ /* ignore autoplay block */});
          timer = setTimeout(next, ms);
        };
        if (Number.isFinite(v.duration) && v.duration > 0) useDuration();
        else v.onloadedmetadata = useDuration;
      } else {
        if (!ms) ms = 5200;
        timer = setTimeout(next, ms);
      }
    }

    function next(){
      activate((idx + 1) % slides.length);
    }

    // init
    activate(idx);
  });
})();
// ARTICLES: load JSON -> cards
(async function loadArticles(){
  const grid = document.getElementById('articles-grid');
  if (!grid) return;

  try {
    const url = './data/articles.json?v=' + Date.now();
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const data = await res.json();
    

    const html = data.articles.map(a => {
      const thumb = a.image || 'assets/placeholders/article.jpg';
      const authorImg = (a.author && a.author.avatar) || 'assets/placeholders/author.png';
      const authorName = (a.author && a.author.name) || 'Carbon-Sense';
      const date = new Date(a.date).toDateString();
      const tag = (a.tags && a.tags[0]) ? `<span class="tag">${a.tags[0]}</span>` : '';
      const read = a.readTime ? `${a.readTime} min` : '';

      return `
        <article class="article-card">
          <img class="article-thumb" src="${thumb}" alt="">
          <div class="article-body">
            <h3>${a.title}</h3>
            <p class="article-deck">${a.deck || ''}</p>
          </div>
          <div class="article-meta">
            <div class="meta-left">
              <img src="${authorImg}" alt="">
              <span class="byline">${authorName}</span>
            </div>
            <div class="meta-right">
              ${tag}
              <span>${read}</span>
              <span aria-hidden="true">•</span>
              <time datetime="${a.date}">${date}</time>
            </div>
          </div>
          <a class="cover" href="${a.href || '#'}">Read</a>
        </article>`;
    }).join('');

    grid.innerHTML = html;
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    grid.innerHTML = `<p class="muted">Couldn’t load articles. ${msg}</p>`;
    console.error('Articles load error:', e);
  }
  
  
})();

// Keep DOCX footnote links on the same page
// Keep DOCX footnotes local even with <base href=…>
function fixDocxAnchors(root){
  if (!root) return;

  // polyfill CSS.escape if missing
  if (!window.CSS || !CSS.escape){
    window.CSS = window.CSS || {};
    CSS.escape = CSS.escape || (s => String(s).replace(/[^a-zA-Z0-9_\-]/g, "\\$&"));
  }

  const pagePath = location.pathname + (location.search || "");

  root.querySelectorAll('a[href^="#"]').forEach(a => {
    const raw = a.getAttribute('href');
    if (!raw || raw === '#') return;
    const id = raw.slice(1);

    // 1) Rewrite href so it points to THIS article, not the site root
    a.setAttribute('href', pagePath + '#' + id);

    // 2) Intercept click before navigation and scroll locally
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const sel = '#' + CSS.escape(id) + ', [name="' + id + '"]';
      const target = root.querySelector(sel);
      if (target){
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.replaceState(null, '', '#' + id);
      }
    }, { capture: true });
  });
}
// -------------------------------------------
// Hero "recent articles" rotator
// -------------------------------------------
// === POPUP CAROUSEL (articles) — smooth fade swap ===
(function(){
  const pop  = document.getElementById('hero-pop');
  if (!pop) return;

  const card = document.getElementById('hero-pop-link');

  // fields inside the card
  const el = {
    tag:    document.getElementById('hp-tag'),
    date:   document.getElementById('hp-date'),
    author: document.getElementById('hp-author'),
    thumb:  document.getElementById('hp-thumb'),
    title:  document.getElementById('hp-title'),
    deck:   document.getElementById('hp-deck'),
  };

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function write(a){
    // link
    card.setAttribute('href', a.href || a.url || a.path || '#');

    // header row
    el.tag.textContent = (a.tags && a.tags[0]) || a.tag || 'Article';
    el.date.textContent = a.date
      ? new Date(a.date).toLocaleDateString(undefined,{month:'short', day:'2-digit', year:'numeric'})
      : '';
    el.author.textContent = (a.author && (a.author.name || a.author)) || '';

    // text
    el.title.textContent = a.title || 'Untitled';
    el.deck.textContent  = a.deck || a.excerpt || a.summary || '';

    // thumb (hide if missing)
    const src = a.image || a.thumb || a.thumbnail || '';
    if (src){
      el.thumb.src = src;
      el.thumb.alt = `Thumbnail for ${a.title || 'article'}`;
      el.thumb.style.display = '';
    } else {
      el.thumb.removeAttribute('src');
      el.thumb.alt = '';
      el.thumb.style.display = 'none';
    }
  }

  async function swapSmooth(a){
    // fade out
    pop.classList.remove('hero-pop--show');
    await sleep(250);            // match your CSS transition (~0.45s total)
    // write new content
    write(a);
    // force reflow so the next class toggle animates
    void card.offsetWidth;
    // fade in
    pop.classList.add('hero-pop--show');
  }

  function startRotation(list, everyMs = 7000){
    if (!list.length) return;
    // first render immediately, then animate future swaps
    write(list[0]);
    pop.classList.add('hero-pop--show');

    let i = 0;
    setInterval(() => {
      i = (i + 1) % list.length;
      swapSmooth(list[i]);
    }, everyMs);
  }

  // load data and kick off
  fetch('data/articles.json?v=' + Date.now(), { cache: 'no-store' })
    .then(r => r.json())
    .then(raw => Array.isArray(raw) ? raw : (raw.articles || []))
    .then(items =>
      items
        .filter(a => a && (a.title || a.name))
        .sort((a,b) => new Date(b.date||0) - new Date(a.date||0))
        .slice(0, 6)
    )
    .then(startRotation)
    .catch(console.error);
})();

// --- Open/close behavior for the RECENT ARTICLES pill, with auto-open ---
(function(){
  const pop    = document.getElementById('hero-pop');
  const toggle = document.getElementById('hp-toggle'); // the pill/button
  if (!pop || !toggle) return;

  let hasOpenedOnce = false;
  let autoTimer = null;

  function openPop(){
    pop.classList.add('hero-pop--show');
    pop.classList.remove('is-collapsed');
    toggle.setAttribute('aria-expanded', 'true');
    hasOpenedOnce = true;
  }
  function closePop(){
    pop.classList.add('is-collapsed');
    toggle.setAttribute('aria-expanded', 'false');
  }
  function togglePop(e){
    if (e){ e.preventDefault(); e.stopPropagation(); }
    // ensure pop container is visible, then toggle collapsed state
    pop.classList.add('hero-pop--show');
    const collapsed = pop.classList.toggle('is-collapsed');
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    hasOpenedOnce = true;
    // once user interacted, cancel any pending auto-open
    if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
  }

  // Click/keyboard on the pill
  toggle.addEventListener('click', togglePop);
  toggle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') togglePop(e);
  });

  // Close if user clicks outside the card (optional; keep if you want)
  document.addEventListener('click', (e) => {
    if (!pop.contains(e.target) && !toggle.contains(e.target)) closePop();
  });

  // Auto-open 3s after landing, unless the user interacts first
  function scheduleAutoOpen(){
    // respect reduced motion
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;
    autoTimer = setTimeout(() => {
      if (!hasOpenedOnce) openPop();
      autoTimer = null;
    }, 3000);
  }
  // cancel auto-open on any interaction
  ['scroll','keydown','pointerdown','touchstart','wheel'].forEach(ev =>
    window.addEventListener(ev, () => {
      if (autoTimer){ clearTimeout(autoTimer); autoTimer = null; }
    }, { once:true, passive:true })
  );

  // Start collapsed, then schedule auto-open
  pop.classList.add('is-collapsed');
  pop.classList.add('hero-pop--show');   // container present so animation can run
  toggle.setAttribute('aria-expanded', 'false');
  scheduleAutoOpen();
})();

