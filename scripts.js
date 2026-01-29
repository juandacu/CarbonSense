// Year
document.querySelectorAll("[data-year]").forEach(el => el.textContent = new Date().getFullYear());
// Robust JSON fetch with retries, base-aware URL resolution, and abort support
async function fetchJSON(rel, { tries = 3, signal } = {}) {
  const url = new URL(rel, document.baseURI).toString();
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        cache: 'no-store',
        headers: { 'accept': 'application/json' },
        signal
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.json();
    } catch (err) {
      // If the page is unloading or the request was explicitly aborted, stop immediately
      if (signal?.aborted) throw err;
      lastErr = err;
      // Backoff before retrying
      await new Promise(r => setTimeout(r, 200 * (i + 1) * (i + 1)));
    }
  }
  throw lastErr;
}

// Resolve any relative path against the current <base>
function absUrl(rel){ return new URL(rel, document.baseURI).toString(); }

// -------- Article release helpers (live vs coming soon) --------
function articleGoLiveDate(a){
  if (!a) return null;
  const raw = a.goLive || a.go_live || a.publishAt || a.publish_at || a.date;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d) ? null : d;
}

function isArticleLive(a){
  const d = articleGoLiveDate(a);
  if (!d) return true; // if no date, treat as live
  const today = new Date();
  today.setHours(0,0,0,0);
  d.setHours(0,0,0,0);
  return d <= today;
}

function comingSoonText(a){
  const d = articleGoLiveDate(a);
  if (!d) return "Coming soon";
  return "Coming soon (" + d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }) + ")";
}


// Normalize an article record from JSON
function normalizeArticle(a){
  if (!a) return {
    title: "Untitled",
    deck: "",
    author: "Carbon Sense",
    authors: [],
    tag: "",
    dateISO: "",
    dateTxt: "",
    href: "",
    image: absUrl("assets/placeholders/article.jpg"),
    live: true,
    comingSoon: ""
  };

  const title  = a.title || "Untitled";
  const deck   = a.deck  || a.excerpt || "";

  // NEW: normalize authors into an array (supports `authors: [...]` and legacy `author`)
  const authors =
    Array.isArray(a.authors) && a.authors.length
      ? a.authors
          .map(p => (p && typeof p === "object")
            ? { name: (p.name || p.full || "").trim(), url: p.url }
            : { name: String(p).trim() }
          )
          .filter(p => p.name)
      : (a.author && typeof a.author === "object" && (a.author.name || a.author.full))
        ? [{ name: (a.author.name || a.author.full || "").trim(), url: a.author.url }]
        : (typeof a.author === "string" && a.author.trim())
          ? [{ name: a.author.trim() }]
          : [];

  // NEW: keep existing `author` string that your card template expects
  const author = (authors.length ? authors.map(p => p.name).join(", ") : "Carbon Sense");

  const tag    = (a.tags && a.tags[0]) || a.tag || "";

  const href   = a.href || a.url || a.path || "";
  const image  = a.image || (a.hero && a.hero.image) || "";

  const dLive  = articleGoLiveDate(a);
  const live   = isArticleLive(a);

  const dateISO = dLive ? dLive.toISOString().slice(0,10) : "";
  const dateTxt = dLive ? dLive.toLocaleDateString(undefined, { day:"2-digit", month:"short", year:"numeric" }) : "";

  return {
    title,
    deck,
    author,
    authors, // NEW: preserve for any renderer that uses it
    tag,
    dateISO,
    dateTxt,
    // only keep real link if live
    href: live && href ? absUrl(href) : "",
    image: image ? absUrl(image) : absUrl("assets/placeholders/article.jpg"),
    live,
    comingSoon: live ? "" : comingSoonText(a)
  };
}


// tiny image retry (handles occasional aborts on GitHub Pages)
function imgWithRetry(src, tries=2){
  const s = JSON.stringify({src, tries}); // for data-* attr
  return `<img class="article-thumb" loading="lazy" decoding="async" data-img='${s}' src="${src}" alt="">`;
}
document.addEventListener("error", (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement)) return;
  const meta = img.dataset.img && JSON.parse(img.dataset.img);
  if (!meta) { img.src = absUrl("assets/placeholders/article.jpg"); return; }
  if (meta.tries > 0){
    meta.tries -= 1;
    img.dataset.img = JSON.stringify(meta);
    // short backoff then retry
    setTimeout(()=>{ img.src = meta.src + (meta.src.includes("?") ? "&r=" : "?r=") + Date.now(); }, 120);
  } else {
    img.src = absUrl("assets/placeholders/article.jpg");
  }
}, true);


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

// Load Articles (robust + base-aware)
(async function(){
  const grid = document.getElementById("articles-grid");
  if (!grid) return;

  try {
    const raw  = await fetchJSON("data/articles.json", { tries: 3 });
    const list = (Array.isArray(raw) ? raw : raw.articles || []).map(normalizeArticle);

    grid.innerHTML = list.map(a => {
      const locked  = !a.live;
      const overlay = locked
        ? `<div class="article-lock-overlay">${escapeHtml(a.comingSoon || "Coming soon")}</div>`
        : "";
      const maybeLinkStart = a.href
        ? `<a class="cover" href="${a.href}" aria-label="Read ${escapeHtml(a.title)}"></a>`
        : "";
    
      return `
        <article class="article-card${locked ? " is-locked" : ""}">
          ${imgWithRetry(a.image)}
          <div class="article-body">
            <h3>${escapeHtml(a.title)}</h3>
            <p class="article-deck">${escapeHtml(a.deck)}</p>
          </div>
          <div class="article-meta">
            <div class="meta-left">
              <span class="byline">${escapeHtml(a.author)}</span>
            </div>
            <div class="meta-right">
              ${a.tag ? `<span class="tag">${escapeHtml(a.tag)}</span>` : ""}
              ${a.dateISO ? `<time datetime="${a.dateISO}">${escapeHtml(a.dateTxt)}</time>` : ""}
            </div>
          </div>
          ${maybeLinkStart}
          ${overlay}
        </article>`;
    }).join("");
    

  } catch (e) {
    console.error("Articles load error:", e);
    grid.innerHTML = `<div class="muted">Failed to load articles.</div>`;
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
// Render a DOCX inline (no content changes)
function renderDocx(targetSelector, docxUrl, statusSelector){
  const target = document.querySelector(targetSelector);
  const status = statusSelector ? document.querySelector(statusSelector) : null;
  if (!target || !window.mammoth) {
    return Promise.reject(new Error("renderDocx: missing target or mammoth"));
  }

  status && (status.textContent = "Loading document…");

  return fetch(docxUrl, { cache: "no-store" })
    .then(r => {
      if (!r.ok) throw new Error("HTTP " + r.status + " " + docxUrl);
      return r.arrayBuffer();
    })
    .then(buf => window.mammoth.convertToHtml(
      { arrayBuffer: buf },
      {
        styleMap: [
          // Existing
          "p[style-name='Red emphasis'] => p.red-emphasis:fresh",

          // Quotes (EN + ES)
          "p[style-name='Quote'] => blockquote:fresh",
          "p[style-name='Intense Quote'] => blockquote:fresh",
          "p[style-name='Cita'] => blockquote:fresh",
          "p[style-name='Cita intensa'] => blockquote:fresh",

          // Subtitle (EN + ES)
          "p[style-name='Subtitle'] => p.subtitle:fresh",
          "p[style-name='Subtítulo'] => p.subtitle:fresh"
        ]
      }
    ))
    .then(result => {
      target.innerHTML = result.value;
      injectDocxEmbeds(target);
      fixDocxAnchors && fixDocxAnchors(target);
      status && (status.textContent = "");
      return target;
    })
    .catch(err => {
      status && (status.textContent = "Could not display the document.");
      console.error("DOCX render error:", err);
      throw err;
    });
}

/**
 * Build a sticky "On this page" table of contents from headings inside
 * the rendered Mammoth article.
 */
function buildDocxToc(rootSelector, tocSelector) {
  const root = document.querySelector(rootSelector);
  const toc  = document.querySelector(tocSelector);
  if (!root || !toc) return;

  // Pick which headings you want in the TOC
  const headings = root.querySelectorAll("h1, h2, h3");
  if (!headings.length) {
    toc.style.display = "none";
    return;
  }

  let counter = 0;
  const items = [];

  headings.forEach(h => {
    const level = Number(h.tagName[1]); // 1, 2, 3
    const text  = (h.textContent || "").trim();
    if (!text) return;

    // Ensure each heading has an id
    let id = h.id;
    if (!id) {
      id = "sec-" + (++counter);
      h.id = id;
    }

    items.push({ id, level, text });
  });

  if (!items.length) {
    toc.style.display = "none";
    return;
  }

  // Build DOM
  toc.innerHTML = "";

  const title = document.createElement("div");
  title.className = "toc-title";
  title.textContent = "On this page";
  toc.appendChild(title);

  const list = document.createElement("ul");
  list.className = "toc-list";

  items.forEach(item => {
    const li = document.createElement("li");
    li.className = "toc-item toc-l" + item.level;

    const a = document.createElement("a");
    a.href = "#" + item.id;
    a.textContent = item.text;

    li.appendChild(a);
    list.appendChild(li);
  });

  toc.appendChild(list);
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

// --- POPUP CAROUSEL (fade only the grid/link area) ---
(function(){
  const pop   = document.getElementById('hero-pop');
  const link  = document.getElementById('hero-pop-link');      // the grid is now the <a>
  if (!pop || !link) return;

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
    link.setAttribute('href', a.href || a.url || a.path || '#');
    el.tag.textContent    = (a.tags && a.tags[0]) || a.tag || 'Article';
    el.date.textContent   = a.date ? new Date(a.date).toLocaleDateString(undefined,{month:'short', day:'2-digit', year:'numeric'}) : '';
    el.author.textContent = (a.author && (a.author.name || a.author)) || '';
    el.title.textContent  = a.title || 'Untitled';
    el.deck.textContent   = a.deck || a.excerpt || a.summary || '';

    const src = a.image || a.thumb || a.thumbnail || '';
    if (src){ el.thumb.src = src; el.thumb.alt = `Thumbnail for ${a.title || 'article'}`; el.thumb.style.display=''; }
    else    { el.thumb.removeAttribute('src'); el.thumb.alt=''; el.thumb.style.display='none'; }
  }

  async function swapSmooth(a){
    link.classList.add('swap-out');     // fade only the grid area
    await sleep(180);
    write(a);
    void link.offsetWidth;              // reflow
    link.classList.remove('swap-out');
  }

  function startRotation(list, everyMs = 7000){
    if (!list.length) return;
    write(list[0]);
    let i = 0;
    setInterval(() => {
      i = (i + 1) % list.length;
      swapSmooth(list[i]);
    }, everyMs);
  }

  fetch('data/articles.json?v=' + Date.now())
    .then(r => r.json())
    .then(raw => Array.isArray(raw) ? raw : (raw.articles || []))
    .then(items => items
      .filter(a => a && (a.title || a.name))
      .sort((a,b) => new Date(b.date||0) - new Date(a.date||0))
      .slice(0, 6))
    .then(startRotation)
    .catch(console.error);
})();

// RECENT ARTICLES: single source of truth for open/close + auto-open
(function(){
  const pop    = document.getElementById('hero-pop');
  const toggle = document.getElementById('hp-toggle');
  if (!pop || !toggle) return;

  // start collapsed so the pill is visible
  pop.classList.add('is-collapsed');
  toggle.setAttribute('aria-expanded','false');

  // auto-open after 3s, once
  let autoTimer = setTimeout(() => openPop(true), 1000);

  function openPop(withAnim){
    pop.classList.remove('is-collapsed');
    if (withAnim){
      pop.classList.add('opening');                 // CSS handles the smooth scale/fade
      setTimeout(() => pop.classList.remove('opening'), 500);
    }
    toggle.setAttribute('aria-expanded','true');
  }
  function closePop(){
    pop.classList.add('is-collapsed');
    toggle.setAttribute('aria-expanded','false');
  }
  function togglePop(e){
    e.preventDefault();
    e.stopPropagation();                             // never bubble into the article link
    if (pop.classList.contains('is-collapsed')) openPop(true);
    else closePop();
    if (autoTimer){ clearTimeout(autoTimer); autoTimer = null; }
  }

  // click/keyboard on the pill
  toggle.addEventListener('click', togglePop);
  toggle.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') togglePop(e);
  });

  // clicks inside the popup card should NOT close it
  const card = document.getElementById('hero-pop-link');
  if (card){
    card.addEventListener('click', e => {
      // if the grid is collapsed, ignore card clicks (it’s hidden)
      if (pop.classList.contains('is-collapsed')) { e.preventDefault(); e.stopPropagation(); }
    });
  }
})();

// Home: Recent Articles carousel under hero
(function homeRecentArticles(){
  const track = document.getElementById('home-articles-track');
  if (!track) return;

  const url = 'data/articles.json?v=' + Date.now();

  fetch(url, { cache: 'no-store' })
    .then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(raw => {
      const items = Array.isArray(raw) ? raw : (raw.articles || raw || []);

      // Normalize all articles (this includes live status + comingSoon)
      const normalized = items.map(normalizeArticle);

      // ------------------------------
      // NEW SORTING LOGIC:
      // 1. Live articles first (live = true)
      // 2. Within each group, newest first
      // ------------------------------
      normalized.sort((a, b) => {
        // Live articles come before locked ones
        if (a.live !== b.live) return a.live ? -1 : 1;
        // Inside each group: newest → oldest
        return new Date(b.dateISO || 0) - new Date(a.dateISO || 0);
      });

      // Show first 6 (including locked, but with the sorted order)
      const articles = normalized.slice(0, 6);

      if (!articles.length) {
        track.innerHTML = '<p class="muted">No articles yet.</p>';
        return;
      }

      track.innerHTML = articles.map(a => {
        const locked = !a.live;
        return `
          <article class="home-article${locked ? ' is-locked' : ''}">
            <a class="home-article-link"
               href="${locked ? '#' : a.href}"
               ${locked ? 'aria-disabled="true" tabindex="-1"' : ''}>
              <img class="home-article-thumb" src="${a.image}" alt="">
              <div class="home-article-body">
                <div class="home-article-meta">
                  ${a.tag ? `<span class="tag">${escapeHtml(a.tag)}</span>` : ""}
                  ${a.dateTxt ? `<span class="muted small">${escapeHtml(a.dateTxt)}</span>` : ""}
                </div>
                <h3 class="home-article-title">${escapeHtml(a.title)}</h3>
                <p class="home-article-deck">${escapeHtml(a.deck)}</p>
              </div>
            </a>
            ${locked ? `<div class="article-lock-overlay">${escapeHtml(a.comingSoon)}</div>` : ""}
          </article>
        `;
      }).join("");

      // Optional auto-scroll  
      const cards = Array.from(track.children);
      if (cards.length <= 1) return;

      let i = 0;
      function scrollNext(){
        i = (i + 1) % cards.length;
        const card = cards[i];
        track.scrollTo({
          left: card.offsetLeft - track.offsetLeft,
          behavior: 'smooth'
        });
      }
      setInterval(scrollNext, 7000);
    })
    .catch(err => {
      console.error('Home recent articles error:', err);
      track.innerHTML = '<p class="muted">Failed to load recent articles.</p>';
    });
})();

document.addEventListener("DOMContentLoaded", function () {
  const shareButtons = document.querySelector("[data-share-buttons]");
  if (!shareButtons) return;

  const titleEl = document.querySelector("[data-article-title]");
  const rawTitle = titleEl ? titleEl.textContent.trim() : document.title;
  const pageUrl = window.location.href;
  const encodedUrl = encodeURIComponent(pageUrl);
  const encodedTitle = encodeURIComponent(rawTitle + " – via Carbon Sense");
  const statusEl = document.querySelector("[data-share-status]");

  function setStatus(msg) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    if (!msg) return;
    window.setTimeout(() => {
      if (statusEl.textContent === msg) statusEl.textContent = "";
    }, 3000);
  }

  shareButtons.addEventListener("click", function (event) {
    const btn = event.target.closest("[data-network]");
    if (!btn) return;
    event.preventDefault();

    const network = btn.dataset.network;
    let shareUrl = null;

    switch (network) {
      case "linkedin":
        // LinkedIn only supports URL param
        shareUrl =
          "https://www.linkedin.com/shareArticle?mini=true&url=" + encodedUrl;
        window.open(shareUrl, "_blank", "noopener");
        break;

      case "x":
        // X/Twitter share
        shareUrl =
          "https://x.com/intent/post?text=" +
          encodedTitle +
          "&url=" +
          encodedUrl;
        window.open(shareUrl, "_blank", "noopener");
        break;

      case "whatsapp":
        // WhatsApp share
        shareUrl =
          "https://api.whatsapp.com/send?text=" +
          encodeURIComponent(rawTitle + " – " + pageUrl);
        window.open(shareUrl, "_blank", "noopener");
        break;

      case "substack":
        // Best you can do: copy link so it can be pasted into a Substack post
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard
            .writeText(pageUrl)
            .then(() =>
              setStatus("Link copied. Paste it into your Substack post.")
            )
            .catch(() => setStatus("Could not copy link."));
        } else {
          setStatus("Copy the link from your browser address bar.");
        }
        break;

      default:
        break;
    }
  });
});
// === TOC sticky fallback with bottom clamp ===
(function tocStickyFallbackClamped(){
  const toc = document.getElementById("article-toc");
  const layout = document.querySelector(".article-layout");
  const articleSection = document.querySelector(".article-section");
  if (!toc || !layout || !articleSection) return;

  const mq = window.matchMedia("(max-width: 900px)");

  let anchorTop = null;
  let anchorLeft = null;
  let anchorWidth = null;

  function isDesktopGrid(){
    if (mq.matches) return false;
    return getComputedStyle(layout).display === "grid";
  }

  function clearState(){
    toc.classList.remove("toc-fixed", "toc-bottom");
    toc.style.left = "";
    toc.style.width = "";
  }

  function measureAnchor(){
    clearState(); // ensure we measure in normal flow
    const r = toc.getBoundingClientRect();
    anchorTop = r.top + window.scrollY;
    anchorLeft = r.left;
    anchorWidth = r.width;
  }

  function onScroll(){
    if (!isDesktopGrid()){
      clearState();
      return;
    }

    if (anchorTop == null) measureAnchor();

    const headerH =
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 72;
    const stickTop = headerH + 18;

    // Bounds of the ARTICLE SECTION only (so we don't overlap newsletter/footer)
    const sectionTop = articleSection.getBoundingClientRect().top + window.scrollY;
    const sectionBottom = sectionTop + articleSection.offsetHeight;

    const tocH = toc.getBoundingClientRect().height || 0;

    const shouldStick = window.scrollY + stickTop >= anchorTop;
    if (!shouldStick){
      clearState();
      return;
    }

    const maxFixedScrollY = sectionBottom - tocH - stickTop;

if (window.scrollY >= maxFixedScrollY){
  toc.classList.remove("toc-fixed");
  toc.classList.add("toc-bottom");

  // keep identical width when parked at the bottom
  toc.style.left = "0px";
  toc.style.width = anchorWidth + "px";
  return;
}


    toc.classList.remove("toc-bottom");
    toc.classList.add("toc-fixed");
    toc.style.left = anchorLeft + "px";
    toc.style.width = anchorWidth + "px";
  }

  function onResize(){
    anchorTop = null;
    anchorLeft = null;
    anchorWidth = null;
    onScroll();
  }

  window.addEventListener("load", () => {
    measureAnchor();
    onScroll();
    setTimeout(() => { measureAnchor(); onScroll(); }, 250);
    setTimeout(() => { measureAnchor(); onScroll(); }, 900);
  });

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize);
  if (mq.addEventListener) mq.addEventListener("change", onResize);
  else mq.addListener(onResize);

  measureAnchor();
  onScroll();
})();

