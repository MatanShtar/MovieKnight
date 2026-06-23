// home/feed.js — the movie feed: init, fetching, render, infinite-scroll, the
// default-list (Favorites/Watched) membership glue, and buildMovieCard.
// Split out of the former monolithic js/home.js (behaviour unchanged). Loaded
// FIRST of the home/* scripts. Depends on common.js (escapeHtml / preloadImages)
// and api.js (MovieAPI) + library-buttons.js (LibraryButtons), all loaded earlier.

// ==========================================
// 1. INITIALIZATION & FETCHING
// ==========================================
// --- Feed state. The home feed pages through TMDB on scroll (20/page), so you
// can browse thousands of movies without loading them all at once. ---
let feedMovies = [];   // everything loaded for the current query so far
let feedQuery = {};    // { q, genres, yearFrom, yearTo, minRating, sort }
let feedPage = 0;      // highest page loaded so far
let feedLoading = false;
let feedDone = false;  // no more pages for this query
let feedToken = 0;     // bumped on every new query so stale fetches are ignored
let feedDupeStreak = 0; // consecutive pages that added no new (post-dedup) movies
let feedObserver = null; // IntersectionObserver that pre-loads near the bottom

// Each scroll trigger fetches this many TMDB pages back-to-back (20 movies each)
// and appends them in one DOM write, so fast scrolling can't out-run the data.
const PAGES_PER_BATCH = 2;
// Pre-load distance: start fetching while the user is still this far (≈1–2 screen
// heights) from the bottom, instead of waiting until they hit it.
const PRELOAD_MARGIN_PX = 1000;

// Guards the "Clear Filters" visibility check: the filter state vars/elements it
// reads are declared further down, so the early (init-time) calls from render
// helpers must no-op until everything is wired. Flipped true at end of init.
let filtersReady = false;

// How many filter categories are active (not sort). Release Year counts once
// whether one or both bounds are set; each other category (genres, platforms,
// rating, age rating, actor, director) counts once when set away from default.
function activeFilterCount() {
  const ageBtn = document.getElementById("ageRatingBtn");
  let n = 0;
  if (typeof activeGenres !== "undefined" && activeGenres.length > 0) n++;
  if (typeof activePlatforms !== "undefined" && activePlatforms.length > 0) n++;
  if (typeof currentRating !== "undefined" && currentRating > 0) n++;
  if (
    (typeof currentFromYear !== "undefined" && currentFromYear !== "Any") ||
    (typeof currentTillYear !== "undefined" && currentTillYear !== "Any")
  ) {
    n++;
  }
  if (ageBtn && ageBtn.textContent.trim() !== "Any") n++;
  if (typeof actorFilter !== "undefined" && actorFilter && actorFilter.getSelected().length > 0) n++;
  if (typeof directorFilter !== "undefined" && directorFilter && directorFilter.getSelected().length > 0) n++;
  return n;
}

// True when any filter (not sort) is set away from its default.
function anyFilterActive() {
  return activeFilterCount() > 0;
}

// Show the "Clear Filters" button + the numeric badge on the Filters button only
// when at least one filter is active; the badge shows the active-filter count.
function updateClearFiltersVisibility() {
  if (!filtersReady) return;
  const count = activeFilterCount();
  const btn = document.getElementById("filterClearBtn");
  if (btn) btn.style.display = count > 0 ? "" : "none";
  const badge = document.getElementById("filterCountBadge");
  if (badge) {
    badge.textContent = String(count);
    badge.hidden = count < 1;
  }
}

// The persistent infinite-scroll sentinel (lives in index.html as the grid's
// last child). All card/skeleton/message inserts go BEFORE it, and it is never
// removed, so the IntersectionObserver attached to it stays valid for the life
// of the page.
function getSentinel() {
  return document.getElementById("infinite-scroll-sentinel");
}

// Remove only the cards / skeletons / message — never the sentinel.
function clearGridCards() {
  const grid = document.getElementById("movieGrid");
  if (!grid) return;
  grid
    .querySelectorAll(".movie-card, .grid-message")
    .forEach((el) => el.remove());
}

// Insert a DocumentFragment (or node) just before the sentinel.
function insertBeforeSentinel(node) {
  const grid = document.getElementById("movieGrid");
  if (!grid) return;
  const sentinel = getSentinel();
  if (sentinel) grid.insertBefore(node, sentinel);
  else grid.appendChild(node);
}

// Build a DocumentFragment from an HTML string (off-DOM, one parse).
function fragmentFromHTML(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  return tpl.content;
}

// Show a friendly full-width message in place of the card grid.
function showGridMessage(text) {
  if (!document.getElementById("movieGrid")) return;
  clearGridCards();
  const p = document.createElement("p");
  p.className = "grid-message";
  p.textContent = text;
  insertBeforeSentinel(p);
}

// The "no results" empty state. When filters are the likely culprit (the Browse
// feed has at least one active filter), render a one-click "Clear Filters" button
// beside the message that resets every filter and re-runs the search — leaving the
// text query intact. A text search ignores filters entirely, so the button is
// hidden there (clearing filters wouldn't change a thing).
function showEmptyState() {
  if (!document.getElementById("movieGrid")) return;
  clearGridCards();

  const wrap = document.createElement("div");
  wrap.className = "grid-message grid-empty";

  const isTextSearch = !!(feedQuery && feedQuery.q);
  const canClear = !isTextSearch && anyFilterActive();

  const p = document.createElement("p");
  p.className = "grid-empty-text";
  p.textContent = canClear
    ? "No movies found, try clearing some filters."
    : "No movies found.";
  wrap.appendChild(p);

  if (canClear) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "grid-clear-filters-btn";
    btn.textContent = "Clear Filters";
    btn.addEventListener("click", () => {
      resetAllFilters({ includeSort: false }); // filters only — keep the sort
      runSearch();
    });
    wrap.appendChild(btn);
  }

  insertBeforeSentinel(wrap);
}

// Build cards for a list of movies, preload posters, then REPLACE the cards
// (leaving the sentinel in place).
async function renderMovieGrid(movies) {
  const grid = document.getElementById("movieGrid");
  if (!grid) return;

  if (!movies.length) {
    showEmptyState();
    return;
  }

  await preloadImages(movies.map((m) => m.posterPath)); // wait for posters
  clearGridCards();
  insertBeforeSentinel(fragmentFromHTML(movies.map(buildMovieCard).join("")));
  // No client-side re-ordering — the backend already returns them sorted.
}

// Append cards for newly loaded movies without disturbing what's already shown.
// If loading skeletons are currently pinned to the bottom, the real cards are
// inserted ABOVE them (not after) so that clearing the skeletons afterwards
// doesn't yank the freshly-added cards upward — that shift was the "jump".
function appendMovieCards(movies) {
  const grid = document.getElementById("movieGrid");
  if (!grid || !movies.length) return;
  // Build the whole batch off-DOM in a DocumentFragment, then insert it in a
  // single operation — one layout/paint instead of one per card.
  const fragment = fragmentFromHTML(movies.map(buildMovieCard).join(""));
  // Insert ahead of the in-flight skeletons if present, otherwise just before
  // the sentinel — always below the current viewport, so scroll anchoring keeps
  // the view from jumping.
  const firstSkeleton = grid.querySelector(".feed-skeleton");
  if (firstSkeleton) grid.insertBefore(fragment, firstSkeleton);
  else insertBeforeSentinel(fragment);
}

// Load the next BATCH (PAGES_PER_BATCH pages) for the current query and append
// it in one DOM write. `token` ties the request to the query that started it; if
// a newer query begins while this is in flight, the stale result is dropped
// instead of polluting the grid.
//
// `feedLoading` is the strict concurrency guard: it's flipped true up-front and
// checked at the very top, so aggressive scrolling that fires the observer /
// scroll handler many times can never launch two overlapping fetches (or fetch
// the same pages twice) — extra triggers no-op until the in-flight batch lands.
async function loadFeedBatch(token = feedToken) {
  if (token !== feedToken || feedLoading || feedDone) return;
  feedLoading = true;

  const grid = document.getElementById("movieGrid");
  const firstLoad = feedPage === 0;

  // While the batch is in flight, show skeletons just before the sentinel (after
  // page 1) so the area isn't blank during the round-trip.
  if (!firstLoad && grid) {
    insertBeforeSentinel(
      fragmentFromHTML(
        '<article class="movie-card movie-card--skeleton feed-skeleton" aria-hidden="true"></article>'.repeat(10),
      ),
    );
  }

  // Fetch the pages of this batch sequentially, accumulating de-duped movies.
  const collected = [];
  try {
    for (let i = 0; i < PAGES_PER_BATCH && !feedDone; i++) {
      const page = feedPage + 1;
      const results = await MovieAPI.searchMovies({ ...feedQuery, page });

      // A newer query superseded this one mid-batch — drop everything.
      if (token !== feedToken) return;

      // Empty page = we've paged past the last result: the true end of the feed.
      if (!results.length) {
        feedDone = true;
        break;
      }

      const seen = new Set(
        [...feedMovies, ...collected].map((m) => m.title.toLowerCase()),
      );
      const fresh = results.filter((m) => {
        const k = m.title.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

      // Advance whether or not anything was fresh, so a fully-duplicate page is
      // skipped rather than re-requested forever.
      feedPage = page;
      if (fresh.length) {
        collected.push(...fresh);
        feedDupeStreak = 0;
      } else {
        feedDupeStreak++;
      }

      // Safety stops: TMDB caps discover/search at page 500, and a backend that
      // ignores `page` would otherwise feed duplicates indefinitely.
      if (page >= 500 || feedDupeStreak >= 5) {
        feedDone = true;
        break;
      }
    }
  } catch (err) {
    console.error("Could not load movies:", err);
    if (token === feedToken) {
      feedDone = true; // stop hammering the server on error
      if (grid) grid.querySelectorAll(".feed-skeleton").forEach((el) => el.remove());
      if (firstLoad) {
        showGridMessage("Couldn't load movies. Please try again later.");
        if (window.toast) toast.error(err.message);
      }
    }
    feedLoading = false;
    return;
  }

  // A newer query superseded this one while it was fetching — drop the result.
  if (token !== feedToken) return;

  // Commit the whole batch to the grid in a single append.
  feedMovies.push(...collected);
  if (firstLoad) {
    if (collected.length) await renderMovieGrid(feedMovies);
    else showEmptyState();
  } else if (collected.length) {
    appendMovieCards(collected); // real cards go in before the skeletons clear
  }

  // Clear the loading skeletons once the real cards are in.
  if (grid) grid.querySelectorAll(".feed-skeleton").forEach((el) => el.remove());
  feedLoading = false;

  // Keep loading until the page is tall enough that the threshold is no longer
  // tripped (or we only got duplicates and need more pages to surface new
  // movies), then wait for the user to scroll again.
  if (!feedDone && (collected.length === 0 || feedNearBottom())) {
    loadFeedBatch(token);
  }
}

// A one-shot geometric check (NOT a scroll listener) used only by the post-batch
// fill-loop: true while the sentinel is still within the pre-load margin of the
// viewport bottom. The observer can't re-fire on its own when the sentinel stays
// continuously intersecting (e.g. a page too short to scroll), so this lets the
// loader keep pulling pages until the sentinel is pushed out past the margin.
function feedNearBottom() {
  const sentinel = getSentinel();
  if (!sentinel) return false;
  return (
    sentinel.getBoundingClientRect().top <=
    window.innerHeight + PRELOAD_MARGIN_PX
  );
}

// Start a fresh query from page 1, then keep paginating on scroll. Everything
// flows through here — the search box, the filters Apply button, and the sort
// dropdown all end up calling runSearch().
function applyQuery(query) {
  feedQuery = query;
  feedMovies = [];
  feedPage = 0;
  feedDone = false;
  feedLoading = false;
  feedDupeStreak = 0;
  const token = ++feedToken; // invalidate any in-flight page load
  const grid = document.getElementById("movieGrid");
  if (grid) {
    clearGridCards(); // drop old cards but keep the sentinel + observer intact
    insertBeforeSentinel(fragmentFromHTML(movieSkeletonMarkup(10)));
  }
  loadFeedBatch(token);
}

// Gather the live UI state into one query object and run it.
function runSearch() {
  applyQuery(collectQuery());
}

// Load more BEFORE the user reaches the bottom. A bottom sentinel marks where
// the grid ends; an IntersectionObserver with a tall bottom rootMargin fires the
// next batch ~1–2 screens early (the pre-load threshold). This is the SOLE driver
// — there is no window scroll listener — and the feedLoading guard makes repeated
// observer callbacks during fast scrolling harmless. The post-batch fill-loop
// (via feedNearBottom) covers the one case the observer can't: a page too short
// to scroll, where the sentinel stays continuously intersecting.
function setupInfiniteScroll() {
  const sentinel = getSentinel(); // permanent element from index.html
  if (!sentinel || !("IntersectionObserver" in window)) return;

  feedObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) loadFeedBatch();
    },
    // Grow the observed area downward so the sentinel "enters" the viewport a
    // full 1000px (PRELOAD_MARGIN_PX) before it is actually visible.
    { root: null, rootMargin: `0px 0px ${PRELOAD_MARGIN_PX}px 0px`, threshold: 0 },
  );
  feedObserver.observe(sentinel);
}

// Sentinel must exist before the first load so its fill-loop can chain.
// Initial load is the default popular feed; we pass the query directly (rather
// than via collectQuery) so this can run before the filter/sort state further
// down is initialised — avoiding a temporal-dead-zone error.
setupInfiniteScroll();
// Matches the empty-box branch of collectQuery(): the first feed is the
// popular, well-known English catalog (vote-count floor + English language).
applyQuery({ sort: "popularity", minVotes: 500, language: "en" });

// ==========================================
// DEFAULT-LIST MEMBERSHIP (heart = Favorites, eye = Already Watched)
// ==========================================
// Shared add/remove + toast logic lives in js/library-buttons.js. Here we keep
// only the home-feed glue: a synchronously-readable copy of the loaded library
// (so buildMovieCard can paint cards at build time) and the per-card painters.
let library = null;

function libBtn(card, which) {
  const alt = which === "favorites" ? "Like" : "Mark watched";
  const img = card.querySelector(`.icon-btn img[alt="${alt}"]`);
  return img ? img.closest(".icon-btn") : null;
}
function paintLibBtn(btn, which, on) {
  if (!btn) return;
  btn.classList.toggle("active", !!on);
  btn.title = LibraryButtons.title(which, on);
}
// Mark every card's heart/eye from the loaded library (for cards built before it).
function markLibraryButtons(root = document) {
  if (!library) return;
  root.querySelectorAll(".movie-card").forEach((card) => {
    const id = Number(card.dataset.id);
    if (library.favorites) paintLibBtn(libBtn(card, "favorites"), "favorites", library.favorites.ids.has(id));
    if (library.watched) paintLibBtn(libBtn(card, "watched"), "watched", library.watched.ids.has(id));
  });
}
// Load the library once (logged-in only), then paint any cards already on screen.
LibraryButtons.load().then((lib) => {
  if (!lib) return;
  library = lib;
  markLibraryButtons();
});

// Generate skeleton placeholders
function movieSkeletonMarkup(n) {
  return `<article class="movie-card movie-card--skeleton" aria-hidden="true"></article>`.repeat(
    n,
  );
}

function buildMovieCard(m) {
  // Escape TMDB-supplied strings before they go into attributes / markup —
  // a title containing a double-quote would otherwise break data-title / alt
  // (and that corrupted value then flows into sessionStorage -> the movie page).
  const title = escapeHtml(m.title);
  const poster = escapeHtml(m.posterPath);
  // Heart = Favorites, eye = Already Watched — pressed if the movie is in them.
  const mid = Number(m.id);
  const favOn = !!(library && library.favorites && library.favorites.ids.has(mid));
  const watchedOn = !!(library && library.watched && library.watched.ids.has(mid));
  return `
    <article class="movie-card" data-id="${m.id ?? ""}" data-title="${title}" data-rating="${m.rating}" data-year="${m.releaseYear}" data-popularity="${m.popularity}" data-poster="${poster}">
      <img src="${poster}" alt="${title}" class="poster-img" loading="lazy" decoding="async">
      <div class="rating-badge">
        ${Number(m.rating).toFixed(1)}
        <img src="assets/images/icons/ratings-star.svg" alt="Rating" class="ratings-star-img">
      </div>
      <div class="card-overlay">
        <button class="icon-btn${watchedOn ? " active" : ""}" title="${escapeHtml(LibraryButtons.title("watched", watchedOn))}">
          <img src="assets/images/icons/eye-icon.svg" alt="Mark watched" class="ratings-star-img">
        </button>
        <button class="icon-btn${favOn ? " active" : ""}" title="${escapeHtml(LibraryButtons.title("favorites", favOn))}">
          <img src="assets/images/icons/heart-icon.svg" alt="Like" class="ratings-star-img">
        </button>
        <button class="icon-btn">
          <img src="assets/images/icons/plus-icon.svg" alt="Add to collection" class="ratings-star-img">
        </button>
        <div class="movie-title-pill">${title} (${m.releaseYear})</div>
      </div>
    </article>`;
}
