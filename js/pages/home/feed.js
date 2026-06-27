// loaded FIRST of the home/* scripts.

let feedMovies = [];
let feedQuery = {};
let feedPage = 0;
let feedLoading = false;
let feedDone = false;
let feedToken = 0;     // bumped on every new query so stale fetches are ignored
let feedDupeStreak = 0;
let feedObserver = null;

const PAGES_PER_BATCH = 2;
const PRELOAD_MARGIN_PX = 1000;

// filter state read here is declared further down, so early calls must no-op
let filtersReady = false;

// Release Year counts once whether one or both bounds are set.
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

function anyFilterActive() {
  return activeFilterCount() > 0;
}

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

// persistent sentinel: inserts go before it, it's never removed, so the
// observer attached to it stays valid for the life of the page.
function getSentinel() {
  return document.getElementById("infinite-scroll-sentinel");
}

// never remove the sentinel
function clearGridCards() {
  const grid = document.getElementById("movieGrid");
  if (!grid) return;
  grid
    .querySelectorAll(".movie-card, .grid-message")
    .forEach((el) => el.remove());
}

function insertBeforeSentinel(node) {
  const grid = document.getElementById("movieGrid");
  if (!grid) return;
  const sentinel = getSentinel();
  if (sentinel) grid.insertBefore(node, sentinel);
  else grid.appendChild(node);
}

function fragmentFromHTML(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  return tpl.content;
}

function showGridMessage(text) {
  if (!document.getElementById("movieGrid")) return;
  clearGridCards();
  const p = document.createElement("p");
  p.className = "grid-message";
  p.textContent = text;
  insertBeforeSentinel(p);
}

// "Clear Filters" shows only when filters are the likely culprit; a text search
// ignores filters, so clearing them there would change nothing.
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
      resetAllFilters({ includeSort: false });
      runSearch();
    });
    wrap.appendChild(btn);
  }

  insertBeforeSentinel(wrap);
}

async function renderMovieGrid(movies) {
  const grid = document.getElementById("movieGrid");
  if (!grid) return;

  if (!movies.length) {
    showEmptyState();
    return;
  }

  // preload posters so the whole batch paints at once
  await preloadImages(movies.map((m) => m.posterPath));
  clearGridCards();
  insertBeforeSentinel(fragmentFromHTML(movies.map(buildMovieCard).join("")));
}

// insert real cards ABOVE the in-flight skeletons, so clearing the skeletons
// afterwards doesn't yank the new cards upward
function appendMovieCards(movies) {
  const grid = document.getElementById("movieGrid");
  if (!grid || !movies.length) return;
  const fragment = fragmentFromHTML(movies.map(buildMovieCard).join(""));
  const firstSkeleton = grid.querySelector(".feed-skeleton");
  if (firstSkeleton) grid.insertBefore(fragment, firstSkeleton);
  else insertBeforeSentinel(fragment);
}

// `token` ties the request to the query that started it; a newer query bumps
// feedToken and any stale in-flight result is dropped. feedLoading is the
// concurrency guard so repeated observer triggers can't launch overlapping fetches.
async function loadFeedBatch(token = feedToken) {
  if (token !== feedToken || feedLoading || feedDone) return;
  feedLoading = true;

  const grid = document.getElementById("movieGrid");
  const firstLoad = feedPage === 0;

  // skeletons during the round-trip so the area isn't blank (after page 1)
  if (!firstLoad && grid) {
    insertBeforeSentinel(
      fragmentFromHTML(
        '<article class="movie-card movie-card--skeleton feed-skeleton" aria-hidden="true"></article>'.repeat(10),
      ),
    );
  }

  const collected = [];
  try {
    for (let i = 0; i < PAGES_PER_BATCH && !feedDone; i++) {
      const page = feedPage + 1;
      const results = await MovieAPI.searchMovies({ ...feedQuery, page });

      if (token !== feedToken) return; // newer query superseded mid-batch

      // empty page = paged past the last result
      if (!results.length) {
        feedDone = true;
        break;
      }

      // de-dupe by id, not title: distinct movies (original vs same-named
      // remake) share a title but differ by id; keying on title would hide one.
      // entries without an id are always kept.
      const seen = new Set(
        [...feedMovies, ...collected]
          .map((m) => m.id)
          .filter((id) => id != null),
      );
      const fresh = results.filter((m) => {
        if (m.id == null) return true;
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });

      // advance even on a fully-duplicate page so it isn't re-requested forever
      feedPage = page;
      if (fresh.length) {
        collected.push(...fresh);
        feedDupeStreak = 0;
      } else {
        feedDupeStreak++;
      }

      // hard page cap, plus bail-out if a backend ignoring `page` loops duplicates
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

  if (token !== feedToken) return; // newer query superseded while fetching

  feedMovies.push(...collected);
  if (firstLoad) {
    if (collected.length) await renderMovieGrid(feedMovies);
    else showEmptyState();
  } else if (collected.length) {
    appendMovieCards(collected);
  }

  if (grid) grid.querySelectorAll(".feed-skeleton").forEach((el) => el.remove());
  feedLoading = false;

  // keep loading until the page is tall enough to stop tripping the threshold,
  // or we only got duplicates and need more pages to surface new movies
  if (!feedDone && (collected.length === 0 || feedNearBottom())) {
    loadFeedBatch(token);
  }
}

// true while the sentinel is within the pre-load margin. the observer can't
// re-fire while the sentinel stays continuously intersecting (page too short to
// scroll), so the fill-loop uses this to keep pulling until it's pushed past.
function feedNearBottom() {
  const sentinel = getSentinel();
  if (!sentinel) return false;
  return (
    sentinel.getBoundingClientRect().top <=
    window.innerHeight + PRELOAD_MARGIN_PX
  );
}

// fresh query from page 1; search box, filters Apply, and sort all flow here.
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
    clearGridCards();
    insertBeforeSentinel(fragmentFromHTML(movieSkeletonMarkup(10)));
  }
  loadFeedBatch(token);
}

function runSearch() {
  applyQuery(collectQuery());
}

// sole pagination driver: a tall bottom rootMargin fires the next batch early.
// no scroll listener; feedLoading makes repeated callbacks harmless.
function setupInfiniteScroll() {
  const sentinel = getSentinel();
  if (!sentinel || !("IntersectionObserver" in window)) return;

  feedObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) loadFeedBatch();
    },
    // grow the observed area downward so the sentinel "enters" early
    { root: null, rootMargin: `0px 0px ${PRELOAD_MARGIN_PX}px 0px`, threshold: 0 },
  );
  feedObserver.observe(sentinel);
}

// pass the initial query directly (not collectQuery) so this runs before the
// filter/sort state below is initialised, avoiding a TDZ error. matches the
// empty-box branch of collectQuery().
setupInfiniteScroll();
applyQuery({ sort: "popularity", minVotes: 500, language: "en" });

// heart = Favorites, eye = Already Watched. add/remove lives in library-buttons.js;
// here, a synchronously-readable library copy (so buildMovieCard can paint at
// build time) plus the per-card painters.
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
// paint hearts/eyes for cards built before the library loaded
function markLibraryButtons(root = document) {
  if (!library) return;
  root.querySelectorAll(".movie-card").forEach((card) => {
    const id = Number(card.dataset.id);
    if (library.favorites) paintLibBtn(libBtn(card, "favorites"), "favorites", library.favorites.ids.has(id));
    if (library.watched) paintLibBtn(libBtn(card, "watched"), "watched", library.watched.ids.has(id));
  });
}
LibraryButtons.load().then((lib) => {
  if (!lib) return;
  library = lib;
  markLibraryButtons();
});

function movieSkeletonMarkup(n) {
  return `<article class="movie-card movie-card--skeleton" aria-hidden="true"></article>`.repeat(
    n,
  );
}

function buildMovieCard(m) {
  // escape before injecting into attributes: a title with a double-quote would
  // break data-title/alt and corrupt the value flowing to the movie page.
  const title = escapeHtml(m.title);
  const poster = escapeHtml(m.posterPath);
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
