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

// True when any filter (not sort) is set away from its default.
function anyFilterActive() {
  const ageBtn = document.getElementById("ageRatingBtn");
  return (
    (typeof activeGenres !== "undefined" && activeGenres.length > 0) ||
    (typeof activePlatforms !== "undefined" && activePlatforms.length > 0) ||
    (typeof currentRating !== "undefined" && currentRating > 0) ||
    (typeof currentFromYear !== "undefined" && currentFromYear !== "Any") ||
    (typeof currentTillYear !== "undefined" && currentTillYear !== "Any") ||
    (ageBtn && ageBtn.textContent.trim() !== "Any") ||
    (typeof actorFilter !== "undefined" && actorFilter && actorFilter.getSelected().length > 0) ||
    (typeof directorFilter !== "undefined" && directorFilter && directorFilter.getSelected().length > 0)
  );
}

// Show the "Clear Filters" button only when at least one filter is active.
function updateClearFiltersVisibility() {
  if (!filtersReady) return;
  const btn = document.getElementById("filterClearBtn");
  if (btn) btn.style.display = anyFilterActive() ? "" : "none";
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

// Build cards for a list of movies, preload posters, then REPLACE the cards
// (leaving the sentinel in place).
async function renderMovieGrid(movies) {
  const grid = document.getElementById("movieGrid");
  if (!grid) return;

  if (!movies.length) {
    showGridMessage("No movies found.");
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
    else showGridMessage("No movies found. Try removing a filter.");
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

// Gather the live UI state into one query object for GET /api/movies/search.
// Genres are stored as names in the UI, so resolve them to ids here. Anything
// left at its default is omitted. (Providers aren't part of the search contract
// yet, so the "Where To Watch" filter isn't sent.)
function collectQuery() {
  const query = {};

  const searchEl = document.getElementById("movieSearch");
  const term = searchEl ? searchEl.value.trim() : "";
  if (term) {
    // A real text search hits the whole TMDB catalog — no quality guards, so
    // obscure / foreign titles the user is looking for aren't filtered out.
    query.q = term;
  } else {
    // Default feed (empty box): keep it to well-known English movies by
    // requiring a healthy vote count and an English language.
    query.minVotes = 500;
    query.language = "en";
  }

  const genreIds = activeGenres.map((n) => genreNameToId[n]).filter(Boolean);
  if (genreIds.length) query.genres = genreIds;

  if (currentFromYear !== "Any") query.yearFrom = currentFromYear;
  if (currentTillYear !== "Any") query.yearTo = currentTillYear;

  // Star rating is 1–10 in the UI, matching the backend's 0–10 scale.
  if (currentRating > 0) query.minRating = currentRating;

  // People filters: actors -> with_cast (one or more), director -> with_crew.
  const castIds = actorFilter ? actorFilter.getSelected().map((p) => p.id) : [];
  if (castIds.length) query.with_cast = castIds.join(",");

  const director = directorFilter ? directorFilter.getSelected()[0] : null;
  if (director) query.with_crew = director.id;

  query.sort = currentSortValue(); // always send a sort (default: popularity)

  return query;
}

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
  return `
    <article class="movie-card" data-id="${m.id ?? ""}" data-title="${title}" data-rating="${m.rating}" data-year="${m.releaseYear}" data-popularity="${m.popularity}" data-poster="${poster}">
      <img src="${poster}" alt="${title}" class="poster-img" loading="lazy" decoding="async">
      <div class="rating-badge">
        ${Number(m.rating).toFixed(1)}
        <img src="assets/images/icons/ratings-star.svg" alt="Rating" class="ratings-star-img">
      </div>
      <div class="card-overlay">
        <button class="icon-btn">
          <img src="assets/images/icons/eye-icon.svg" alt="Mark watched" class="ratings-star-img">
        </button>
        <button class="icon-btn">
          <img src="assets/images/icons/heart-icon.svg" alt="Like" class="ratings-star-img">
        </button>
        <button class="icon-btn">
          <img src="assets/images/icons/plus-icon.svg" alt="Add to collection" class="ratings-star-img">
        </button>
        <div class="movie-title-pill">${title} (${m.releaseYear})</div>
      </div>
    </article>`;
}

// ==========================================
// 2. MOBILE LAYOUT ADAPTATION
// ==========================================
(function () {
  const surprise = document.querySelector(".surprise-container");
  const controlsBar = document.querySelector(".controls-bar");
  const headerLeft = document.querySelector(".header-left-group");
  if (!surprise || !controlsBar || !headerLeft) return;

  const mq = window.matchMedia("(max-width: 1024px)");
  function place() {
    const target = mq.matches ? controlsBar : headerLeft;
    if (surprise.parentElement !== target) target.appendChild(surprise);
  }
  place();
  mq.addEventListener("change", place);
})();

// ==========================================
// 3. GLOBAL MENU TOGGLES
// ==========================================
const filterBtn = document.getElementById("filterToggleBtn");
const filterMenu = document.getElementById("filterMenu");
const sortCustomBtn = document.getElementById("sortCustomBtn");
const sortCustomMenu = document.getElementById("sortCustomMenu");
let allGenres = [],
  allAgeRatings = [],
  allPlatforms = [];
// Name -> TMDB id, so the filters can send ids while the UI shows names.
let genreNameToId = {},
  platformNameToId = {};

// Load the filter options once, then build the dropdowns that depend on them.
// Genres + providers come from the live backend (with ids for filtering);
// age-ratings still come from the static file because the backend has no
// endpoint for them yet. (Actors/directors don't read this file — they use the
// popular-people endpoint and DIRECTOR_DEFAULTS respectively.)
(async () => {
  try {
    const res = await fetch("data/filterData.json");
    if (res.ok) {
      const data = await res.json();
      allAgeRatings = data.ageRating || [];
      allGenres = data.genres || []; // fallback until the backend call returns
      allPlatforms = data.watchProviders || [];
    }
  } catch (err) {
    console.error("Could not load filter data:", err);
  }

  try {
    const genres = await MovieAPI.getGenres();
    if (genres.length) {
      allGenres = genres.map((g) => g.name);
      genreNameToId = Object.fromEntries(genres.map((g) => [g.name, g.id]));
    }
  } catch (err) {
    console.error("Could not load genres:", err);
  }

  try {
    const providers = await MovieAPI.getProviders();
    if (providers.length) {
      allPlatforms = providers.map((p) => p.name);
      platformNameToId = Object.fromEntries(
        providers.filter((p) => p.id).map((p) => [p.name, p.id]),
      );
    }
  } catch (err) {
    console.error("Could not load providers:", err);
  }

  if (genreList) {
    renderTags();
    renderDropdown();
  }
  if (platformList) {
    renderPlatforms();
    renderPlatformDropdown();
  }
  buildAgeRatings();
})();

function closeAllInnerDropdowns(exceptMenu = null) {
  document.querySelectorAll(".pill-dropdown").forEach((menu) => {
    if (menu !== exceptMenu) menu.classList.remove("show");
  });
}

// Main Filter Menu Toggle (Closes Sort By)
if (filterBtn && filterMenu) {
  filterBtn.addEventListener("click", function (event) {
    event.stopPropagation();
    if (sortCustomMenu) sortCustomMenu.classList.remove("show");
    filterMenu.classList.toggle("show");
  });
}

// Filter "Apply" button - closes the panel; the chosen filters stay selected.
const filterApplyBtn = document.getElementById("filterApplyBtn");
if (filterApplyBtn && filterMenu) {
  filterApplyBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeAllInnerDropdowns();
    filterMenu.classList.remove("show");
    // Text search + filters + sort all run together through one query now.
    runSearch();
  });
}

// "Clear Filters" — reset every filter row and the sort back to its default
// "Any" / "Popular" state. This ONLY clears the filter UI; it does NOT re-fetch
// the feed. The reset takes effect when the user presses "Apply", same as any
// other filter change. All the state it touches (activeGenres, activePlatforms,
// currentRating, the year vars, the person filters) lives at module scope and is
// initialised by the time this can fire.
const filterClearBtn = document.getElementById("filterClearBtn");
if (filterClearBtn) {
  filterClearBtn.addEventListener("click", (e) => {
    e.stopPropagation();

    // Genres + providers (platforms).
    activeGenres = [];
    if (genreList) {
      renderTags();
      renderDropdown();
    }
    activePlatforms = [];
    if (platformList) {
      renderPlatforms();
      renderPlatformDropdown();
    }

    // Actors (multi) + director (single).
    if (actorFilter) actorFilter.clear();
    if (directorFilter) directorFilter.clear();

    // Release year -> Any (and rebuild the constrained year menus).
    currentFromYear = "Any";
    currentTillYear = "Any";
    if (fromYearBtn) fromYearBtn.textContent = "Any";
    if (tillYearBtn) tillYearBtn.textContent = "Any";
    updateYearConstraints();

    // Star rating -> none.
    currentRating = 0;
    stars.forEach((s) => {
      s.src = BLANK_STAR_PATH;
    });

    // Age rating -> Any.
    if (ageRatingBtn) ageRatingBtn.textContent = "Any";

    // Sort -> default "Popular".
    const sortSelectedText = document.getElementById("sortSelectedText");
    if (sortSelectedText) sortSelectedText.textContent = "Popular";
    document.querySelectorAll(".sort-option").forEach((opt) => {
      opt.classList.toggle("selected", opt.textContent === "Popular This Week");
    });

    closeAllInnerDropdowns();
    updateClearFiltersVisibility(); // nothing active now -> hides itself
    // No runSearch() here on purpose — clearing just resets the controls; the
    // feed only changes when "Apply" is pressed.
  });
}

// Main Sort By Toggle (Closes Filter Menu)
if (sortCustomBtn && sortCustomMenu) {
  sortCustomBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (filterMenu) filterMenu.classList.remove("show");
    sortCustomMenu.classList.toggle("show");
  });
}

// Close everything if clicking off-screen
document.addEventListener("click", function (event) {
  if (
    filterMenu &&
    !filterMenu.contains(event.target) &&
    !filterBtn.contains(event.target)
  ) {
    filterMenu.classList.remove("show");
  }
  if (
    sortCustomMenu &&
    !sortCustomMenu.contains(event.target) &&
    !sortCustomBtn.contains(event.target)
  ) {
    sortCustomMenu.classList.remove("show");
  }
  closeAllInnerDropdowns();
});

// ==========================================
// 4. INVISIBLE KEYBOARD SEARCH
// ==========================================
let searchTimeout;
let typeString = "";

document.addEventListener("keydown", (e) => {
  // 1. Check if a dropdown is currently open
  const openMenu = document.querySelector(
    ".pill-dropdown.show, .sort-custom-menu.show",
  );
  if (!openMenu) return;

  // 2. Ignore if the user is typing in a real search bar
  if (e.target.tagName === "INPUT") return;

  // 3. Only accept single character letters/numbers
  if (e.key.length === 1) {
    typeString += e.key.toLowerCase();

    // Reset the typing string after 0.8 seconds of no typing
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      typeString = "";
    }, 800);

    // Find the matching option
    const options = Array.from(
      openMenu.querySelectorAll(".pill-option, .sort-option"),
    );
    const match = options.find((opt) =>
      opt.textContent.toLowerCase().startsWith(typeString),
    );

    if (match) {
      // Scroll to it and flash the background so the user sees it
      match.scrollIntoView({ block: "nearest", behavior: "smooth" });
      const originalBg = match.style.backgroundColor;
      match.style.backgroundColor = "rgba(255, 136, 179, 0.4)";
      setTimeout(() => {
        match.style.backgroundColor = originalBg;
      }, 300);
    }
  }
});

// ==========================================
// 5. HELPER FUNCTIONS
// ==========================================
function injectSearchBar(dropdownElement) {
  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.className = "dropdown-search";
  searchInput.placeholder = "Search...";
  searchInput.onclick = (e) => e.stopPropagation();
  searchInput.onkeydown = (e) => e.stopPropagation();

  // Live filter logic
  searchInput.oninput = (e) => {
    // Typing while scrolled down the list glides the dropdown back to the top.
    dropdownElement.scrollTo({ top: 0, behavior: "smooth" });
    const term = e.target.value.toLowerCase();
    dropdownElement.querySelectorAll(".pill-option").forEach((opt) => {
      opt.style.display = opt.textContent.toLowerCase().includes(term)
        ? "block"
        : "none";
    });
  };
  dropdownElement.appendChild(searchInput);
}

// ==========================================
// 6. FILTER: RELEASE YEAR
// ==========================================
const fromYearBtn = document.getElementById("fromYearBtn");
const tillYearBtn = document.getElementById("tillYearBtn");
const fromYearMenu = document.getElementById("fromYearMenu");
const tillYearMenu = document.getElementById("tillYearMenu");

let currentFromYear = "Any";
let currentTillYear = "Any";
const MIN_YEAR = 1900;
const MAX_YEAR = 2026;

function populateYearMenu(menuElement, btnElement, startYear, endYear, isFrom) {
  if (!menuElement) return;
  menuElement.innerHTML = "";

  let anyOpt = document.createElement("div");
  anyOpt.className = "pill-option";
  anyOpt.textContent = "Any";
  anyOpt.onclick = (e) => {
    e.stopPropagation();
    if (isFrom) {
      currentFromYear = "Any";
    } else {
      currentTillYear = "Any";
    }
    btnElement.textContent = "Any";
    menuElement.classList.remove("show");
    updateYearConstraints();
  };
  menuElement.appendChild(anyOpt);

  for (let y = endYear; y >= startYear; y--) {
    let opt = document.createElement("div");
    opt.className = "pill-option";
    opt.textContent = y;
    opt.onclick = (e) => {
      e.stopPropagation();
      if (isFrom) {
        currentFromYear = y;
      } else {
        currentTillYear = y;
      }
      btnElement.textContent = y;
      menuElement.classList.remove("show");
      updateYearConstraints();
    };
    menuElement.appendChild(opt);
  }
}

function updateYearConstraints() {
  const allowedMin =
    currentFromYear === "Any" ? MIN_YEAR : parseInt(currentFromYear);
  const allowedMax =
    currentTillYear === "Any" ? MAX_YEAR : parseInt(currentTillYear);
  populateYearMenu(tillYearMenu, tillYearBtn, allowedMin, MAX_YEAR, false);
  populateYearMenu(fromYearMenu, fromYearBtn, MIN_YEAR, allowedMax, true);
  updateClearFiltersVisibility();
}

if (fromYearBtn && tillYearBtn) {
  fromYearBtn.onclick = (e) => {
    e.stopPropagation();
    closeAllInnerDropdowns(fromYearMenu);
    fromYearMenu.classList.toggle("show");
  };
  tillYearBtn.onclick = (e) => {
    e.stopPropagation();
    closeAllInnerDropdowns(tillYearMenu);
    tillYearMenu.classList.toggle("show");
  };
  updateYearConstraints();
}

// ==========================================
// 7. FILTER: GENRES
// ==========================================
let activeGenres = [];

const genreList = document.getElementById("movieGenreList");
const genreDropdown = document.getElementById("movieGenreDropdown");
const addGenreBtn = document.getElementById("addGenreBtn");
const clearGenreBtn = document.getElementById("clearGenreBtn");

function renderTags() {
  genreList.innerHTML = "";
  activeGenres.slice(0, 2).forEach((genre) => {
    const pill = document.createElement("div");
    pill.className = "pill-item";
    pill.innerHTML = `${genre} <span class="pill-remove">×</span>`;
    pill.querySelector(".pill-remove").onclick = (e) => {
      e.stopPropagation();
      activeGenres = activeGenres.filter((i) => i !== genre);
      renderTags();
      renderDropdown();
    };
    genreList.appendChild(pill);
  });

  if (activeGenres.length > 2) {
    const hiddenGenres = activeGenres.slice(2);
    const overflow = document.createElement("div");
    overflow.className = "pill-overflow";
    overflow.innerHTML = `... <div class="pill-tooltip">${hiddenGenres.join(", ")}</div>`;
    genreList.appendChild(overflow);
  }

  if (clearGenreBtn)
    clearGenreBtn.style.display = activeGenres.length > 0 ? "block" : "none";
  if (addGenreBtn)
    addGenreBtn.style.display =
      activeGenres.length === allGenres.length ? "none" : "flex";
  genreDropdown.classList.remove("show");
  updateClearFiltersVisibility();
}

function renderDropdown() {
  genreDropdown.innerHTML = "";

  allGenres
    .filter((g) => !activeGenres.includes(g))
    .forEach((genre) => {
      const opt = document.createElement("div");
      opt.className = "pill-option";
      opt.textContent = genre;
      opt.onclick = (e) => {
        e.stopPropagation();
        activeGenres.unshift(genre);
        renderTags();
        renderDropdown();
        genreDropdown.classList.remove("show");
      };
      genreDropdown.appendChild(opt);
    });
}

if (addGenreBtn) {
  addGenreBtn.onclick = (e) => {
    e.stopPropagation();
    closeAllInnerDropdowns(genreDropdown);
    genreDropdown.classList.toggle("show");
  };
}
if (clearGenreBtn) {
  clearGenreBtn.onclick = (e) => {
    e.stopPropagation();
    activeGenres = [];
    renderTags();
    renderDropdown();
  };
}
// ==========================================
// 8. FILTER: RATING STARS
// ==========================================
const BLANK_STAR_PATH = "assets/images/icons/empty-star-icon.svg";
const FILLED_STAR_PATH = "assets/images/icons/ratings-star.svg";

const starContainer = document.getElementById("starRatingContainer");
const stars = document.querySelectorAll(".star");
let currentRating = 0;

if (starContainer) {
  starContainer.addEventListener("mouseover", (e) => {
    if (e.target.classList.contains("star")) {
      const hoverValue = parseInt(e.target.getAttribute("data-value"));
      stars.forEach((s) => {
        const starValue = parseInt(s.getAttribute("data-value"));
        s.src = starValue <= hoverValue ? FILLED_STAR_PATH : BLANK_STAR_PATH;
      });
    }
  });
  starContainer.addEventListener("mouseleave", () => {
    stars.forEach((s) => {
      const starValue = parseInt(s.getAttribute("data-value"));
      s.src = starValue <= currentRating ? FILLED_STAR_PATH : BLANK_STAR_PATH;
    });
  });
  stars.forEach((star) => {
    star.addEventListener("click", (e) => {
      currentRating = parseInt(e.target.getAttribute("data-value"));
      stars.forEach((s) => {
        const starValue = parseInt(s.getAttribute("data-value"));
        s.src = starValue <= currentRating ? FILLED_STAR_PATH : BLANK_STAR_PATH;
      });
      updateClearFiltersVisibility();
    });
  });
}

// ==========================================
// 9. FILTER: PEOPLE (ACTORS — multi / DIRECTOR — single)
// ==========================================
// Each dropdown behaves like the providers one: a search box pinned to the top
// and a list that starts with the most popular people. Typing live-searches the
// backend (GET /api/people/search); the list returns to "popular" when cleared.
// Actors allow multiple selections (sent as with_cast); director allows one
// (sent as with_crew). Their selections are read by collectQuery().
let actorFilter = null;
let directorFilter = null;
let popularPeople = null; // cached popular list, fetched once on first open

async function loadPopularPeople() {
  if (popularPeople) return popularPeople;
  try {
    popularPeople = await MovieAPI.getPopularPeople();
  } catch (err) {
    console.error("Could not load popular people:", err);
    popularPeople = []; // search still works even if there's no popular list
  }
  return popularPeople;
}

// TMDB's "popular people" list is almost all actors, so the Director row uses a
// curated preset instead of the popular endpoint (typing still live-searches).
const DIRECTOR_DEFAULTS = [
  { id: 488, name: "Steven Spielberg", department: "Directing" },
  { id: 525, name: "Christopher Nolan", department: "Directing" },
  { id: 1032, name: "Martin Scorsese", department: "Directing" },
  { id: 138, name: "Quentin Tarantino", department: "Directing" },
  { id: 111303, name: "Greta Gerwig", department: "Directing" },
  { id: 110816, name: "Denis Villeneuve", department: "Directing" },
  { id: 2710, name: "James Cameron", department: "Directing" },
  { id: 7467, name: "David Fincher", department: "Directing" },
  { id: 240, name: "Stanley Kubrick", department: "Directing" },
  { id: 21684, name: "Bong Joon-ho", department: "Directing" },
];

// Build one person filter. `multiple` = actors (many) vs director (one).
function setupPersonFilter({ listId, dropdownId, addBtnId, clearBtnId, multiple, loadDefaults }) {
  const listEl = document.getElementById(listId);
  const dropdownEl = document.getElementById(dropdownId);
  const addBtn = document.getElementById(addBtnId);
  const clearBtn = document.getElementById(clearBtnId);
  if (!listEl || !dropdownEl || !addBtn) return null;

  let selected = []; // [{ id, name, department }]
  let defaults = null; // this row's default list (popular actors / preset directors)
  let optionsWrap, searchInput, searchDebounce, searchSeq = 0;

  // The list shown before the user types — resolved once, then cached.
  async function ensureDefaults() {
    if (!defaults) {
      try {
        defaults = (await loadDefaults()) || [];
      } catch (err) {
        console.error("Could not load default people:", err);
        defaults = [];
      }
    }
    return defaults;
  }

  function renderPills() {
    listEl.innerHTML = "";
    selected.slice(0, 2).forEach((person) => {
      const pill = document.createElement("div");
      pill.className = "pill-item";
      const label = document.createElement("span");
      label.className = "pill-name";
      label.textContent = person.name;
      const remove = document.createElement("span");
      remove.className = "pill-remove";
      remove.textContent = "×";
      remove.onclick = (e) => {
        e.stopPropagation();
        selected = selected.filter((p) => p.id !== person.id);
        renderPills();
        // Like the other filters, the change applies when "Apply" is pressed.
      };
      pill.append(label, remove);
      // Black hover tooltip with the full name (matches the "..." overflow tip),
      // so a truncated actor name is always readable on hover.
      const tip = document.createElement("span");
      tip.className = "pill-tooltip";
      tip.textContent = person.name;
      pill.appendChild(tip);
      listEl.appendChild(pill);
    });

    if (selected.length > 2) {
      const overflow = document.createElement("div");
      overflow.className = "pill-overflow";
      overflow.append(document.createTextNode("... "));
      const tip = document.createElement("div");
      tip.className = "pill-tooltip";
      tip.textContent = selected.slice(2).map((p) => p.name).join(", ");
      overflow.appendChild(tip);
      listEl.appendChild(overflow);
    }

    if (clearBtn) clearBtn.style.display = selected.length ? "block" : "none";
    // Single-select (director): once chosen, hide "+" until it's cleared.
    addBtn.style.display = !multiple && selected.length >= 1 ? "none" : "flex";
    updateClearFiltersVisibility();
  }

  function renderOptions(people) {
    optionsWrap.innerHTML = "";
    const available = (people || []).filter(
      (p) => !selected.some((s) => s.id === p.id),
    );
    if (!available.length) {
      const empty = document.createElement("div");
      empty.className = "pill-option pill-option--empty";
      empty.textContent = "No people found";
      optionsWrap.appendChild(empty);
      return;
    }
    available.forEach((person) => {
      const opt = document.createElement("div");
      opt.className = "pill-option";
      opt.textContent = person.name;
      opt.onclick = (e) => {
        e.stopPropagation();
        // Newest first (LIFO): the most recently added actor shows leftmost.
        if (multiple) selected.unshift(person);
        else selected = [person];
        renderPills();
        dropdownEl.classList.remove("show");
        if (searchInput) searchInput.value = "";
        // Selection is staged; it applies when "Apply" is pressed.
      };
      optionsWrap.appendChild(opt);
    });
  }

  // Persistent shell: a search box on top + a results container below.
  function buildShell() {
    dropdownEl.innerHTML = "";
    searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.className = "dropdown-search";
    searchInput.placeholder = "Search...";
    searchInput.onclick = (e) => e.stopPropagation();
    searchInput.onkeydown = (e) => e.stopPropagation();
    searchInput.oninput = () => {
      // Typing while scrolled down the people list glides it back to the top.
      dropdownEl.scrollTo({ top: 0, behavior: "smooth" });
      const q = searchInput.value.trim();
      clearTimeout(searchDebounce);
      if (q.length < 2) {
        renderOptions(defaults); // back to this row's default list
        return;
      }
      searchDebounce = setTimeout(async () => {
        const seq = ++searchSeq;
        try {
          const people = await MovieAPI.searchPeople(q);
          if (seq === searchSeq) renderOptions(people); // ignore stale
        } catch (err) {
          console.error("Person search failed:", err);
          if (seq === searchSeq && window.toast) toast.error(err.message);
        }
      }, 300);
    };
    dropdownEl.appendChild(searchInput);
    optionsWrap = document.createElement("div");
    optionsWrap.className = "people-options";
    dropdownEl.appendChild(optionsWrap);
  }

  buildShell();

  addBtn.onclick = async (e) => {
    e.stopPropagation();
    closeAllInnerDropdowns(dropdownEl);
    const opening = !dropdownEl.classList.contains("show");
    dropdownEl.classList.toggle("show");
    if (opening) {
      await ensureDefaults();
      if (!searchInput.value.trim()) renderOptions(defaults);
      searchInput.focus();
    }
  };

  if (clearBtn) {
    clearBtn.onclick = (e) => {
      e.stopPropagation();
      selected = [];
      renderPills();
      // Cleared selection applies when "Apply" is pressed (like every filter).
    };
  }

  renderPills();
  // `clear()` resets the row without firing its own search — the global
  // "Clear Filters" button resets every row, then runs a single runSearch().
  return {
    getSelected: () => selected,
    clear: () => {
      selected = [];
      if (searchInput) searchInput.value = "";
      renderPills();
    },
  };
}

actorFilter = setupPersonFilter({
  listId: "actorList",
  dropdownId: "actorDropdown",
  addBtnId: "addActorBtn",
  clearBtnId: "clearActorBtn",
  multiple: true,
  // Popular list is mostly actors anyway — keep only the Acting department.
  loadDefaults: async () =>
    (await loadPopularPeople()).filter((p) => p.department === "Acting"),
});
directorFilter = setupPersonFilter({
  listId: "directorList",
  dropdownId: "directorDropdown",
  addBtnId: "addDirectorBtn",
  clearBtnId: "clearDirectorBtn",
  multiple: false,
  // Curated directors (no popular fetch); typing still live-searches.
  loadDefaults: async () => DIRECTOR_DEFAULTS,
});

// ==========================================
// 10. FILTER: AGE RATINGS
// ==========================================
const ageRatingBtn = document.getElementById("ageRatingBtn");
const ageRatingMenu = document.getElementById("ageRatingMenu");

function buildAgeRatings() {
  if (!ageRatingBtn || !ageRatingMenu) return;
  ageRatingMenu.innerHTML = "";
  allAgeRatings.forEach((age) => {
    const opt = document.createElement("div");
    opt.className = "pill-option";
    opt.textContent = age;
    opt.onclick = (e) => {
      e.stopPropagation();
      ageRatingBtn.textContent = age;
      ageRatingMenu.classList.remove("show");
      updateClearFiltersVisibility();
    };
    ageRatingMenu.appendChild(opt);
  });

  ageRatingBtn.onclick = (e) => {
    e.stopPropagation();
    closeAllInnerDropdowns(ageRatingMenu);
    ageRatingMenu.classList.toggle("show");
  };
}

// ==========================================
// 11. FILTER: PLATFORMS
// ==========================================
let activePlatforms = [];

const platformList = document.getElementById("platformList");
const platformDropdown = document.getElementById("platformDropdown");
const addPlatformBtn = document.getElementById("addPlatformBtn");
const clearPlatformBtn = document.getElementById("clearPlatformBtn");

function renderPlatforms() {
  platformList.innerHTML = "";
  activePlatforms.slice(0, 2).forEach((platform) => {
    const pill = document.createElement("div");
    pill.className = "pill-item";
    pill.innerHTML = `${platform} <span class="pill-remove">×</span>`;
    pill.querySelector(".pill-remove").onclick = (e) => {
      e.stopPropagation();
      activePlatforms = activePlatforms.filter((i) => i !== platform);
      renderPlatforms();
      renderPlatformDropdown();
    };
    platformList.appendChild(pill);
  });

  if (activePlatforms.length > 2) {
    const hidden = activePlatforms.slice(2);
    const overflow = document.createElement("div");
    overflow.className = "pill-overflow";
    overflow.innerHTML = `... <div class="pill-tooltip">${hidden.join(", ")}</div>`;
    platformList.appendChild(overflow);
  }

  if (clearPlatformBtn)
    clearPlatformBtn.style.display =
      activePlatforms.length > 0 ? "block" : "none";
  if (addPlatformBtn)
    addPlatformBtn.style.display =
      activePlatforms.length === allPlatforms.length ? "none" : "flex";
  platformDropdown.classList.remove("show");
  updateClearFiltersVisibility();
}

function renderPlatformDropdown() {
  // Rebuild from scratch and add a live filter box (like the person search),
  // so a long provider list can be narrowed down by typing.
  platformDropdown.innerHTML = "";
  injectSearchBar(platformDropdown);

  allPlatforms
    .filter((p) => !activePlatforms.includes(p))
    .forEach((platform) => {
      const opt = document.createElement("div");
      opt.className = "pill-option";
      opt.textContent = platform;
      opt.onclick = (e) => {
        e.stopPropagation();
        activePlatforms.unshift(platform);
        renderPlatforms();
        renderPlatformDropdown();
        platformDropdown.classList.remove("show");
      };
      platformDropdown.appendChild(opt);
    });
}

if (addPlatformBtn) {
  addPlatformBtn.onclick = (e) => {
    e.stopPropagation();
    closeAllInnerDropdowns(platformDropdown);
    platformDropdown.classList.toggle("show");
  };
}
if (clearPlatformBtn) {
  clearPlatformBtn.onclick = (e) => {
    e.stopPropagation();
    activePlatforms = [];
    renderPlatforms();
    renderPlatformDropdown();
  };
}
// ==========================================
// 12. SORTING (server-side)
// ==========================================
// The backend sorts natively; we just pass the chosen option as a `sort` query
// param and re-run the query. No client-side re-ordering of the grid.
const sortOptionsData = [
  { short: "Popular", long: "Popular This Week", sort: "popularity" },
  { short: "Rating ↓", long: "Rating (Best to Worst)", sort: "rating_desc" },
  { short: "Rating ↑", long: "Rating (Worst to Best)", sort: "rating_asc" },
  { short: "A ➔ Z", long: "Alphabetical (A-->Z)", sort: "title_asc" },
  { short: "Z ➔ A", long: "Alphabetical (Z-->A)", sort: "title_desc" },
  { short: "Newest", long: "Release Date (New to Old)", sort: "year_desc" },
  { short: "Oldest", long: "Release Date (Old to New)", sort: "year_asc" },
];

// The server `sort` value for the currently selected option (default popularity).
function currentSortValue() {
  const label = document.getElementById("sortSelectedText");
  const current = label ? label.textContent.trim() : "Popular";
  const option = sortOptionsData.find((o) => o.short === current);
  return option ? option.sort : "popularity";
}

if (sortCustomBtn && sortCustomMenu) {
  const sortSelectedText = document.getElementById("sortSelectedText");
  sortOptionsData.forEach((option) => {
    const div = document.createElement("div");
    div.className = "sort-option";
    div.textContent = option.long;
    if (option.short === sortSelectedText.textContent)
      div.classList.add("selected");

    div.onclick = (e) => {
      e.stopPropagation();
      sortSelectedText.textContent = option.short;
      document
        .querySelectorAll(".sort-option")
        .forEach((opt) => opt.classList.remove("selected"));
      div.classList.add("selected");
      sortCustomMenu.classList.remove("show");
      runSearch(); // re-fetch from the backend ordered by the new sort
      window.scrollTo({ top: 0, behavior: "smooth" }); // jump back to the new top
    };
    sortCustomMenu.appendChild(div);
  });
}

// All filter state + elements are wired now: enable the "Clear Filters" toggle
// and set its initial (hidden) state.
filtersReady = true;
updateClearFiltersVisibility();

// Refresh the button's visibility whenever the filter panel is opened.
if (filterBtn) {
  filterBtn.addEventListener("click", () => updateClearFiltersVisibility());
}

// ==========================================
// 13. CARD INTERACTIONS (LIKE / WATCHED)
// ==========================================
const movieGridEl = document.getElementById("movieGrid");
if (movieGridEl) {
  movieGridEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".icon-btn");
    if (!btn) {
      // A click anywhere else on a card opens its details page. The basic
      // fields are stashed so the details page can paint instantly while it
      // fetches the full record (overview, cast, trailer) in the background.
      const card = e.target.closest(".movie-card");
      if (!card || !card.dataset.id) return;
      sessionStorage.setItem(
        "mk:lastMovie",
        JSON.stringify({
          id: card.dataset.id,
          title: card.dataset.title,
          releaseYear: card.dataset.year,
          rating: card.dataset.rating,
          posterPath: card.dataset.poster,
        }),
      );
      window.location.href = `movie.html?id=${encodeURIComponent(card.dataset.id)}`;
      return;
    }
    e.stopPropagation();
    const label = btn.querySelector("img")?.alt || "";

    // Add to Collection / Like / Watched all require an account — block guests
    // with a toast before doing anything (shared guard from common.js).
    if (window.requireAuth && !window.requireAuth()) return;

    if (label === "Add to collection") {
      const card = btn.closest(".movie-card");
      const title = (card && card.dataset.title) || "This movie";
      const id = card && card.dataset.id ? card.dataset.id : null;
      if (window.CollectionModal) CollectionModal.open(id, title);
      else toast.soon("Coming Soon!");
      return;
    }

    const nowActive = btn.classList.toggle("active");
    const messages = {
      "Mark watched": [
        "Added to Already Watched",
        "Removed from Already Watched",
      ],
      Like: ["Added to Favorites", "Removed from Favorites"],
    };
    const [onMsg, offMsg] = messages[label] || ["Coming Soon!", "Coming Soon!"];
    toast[nowActive ? "success" : "info"](nowActive ? onMsg : offMsg);
  });
}

// ==========================================
// 14. AI MODE TOGGLE
// ==========================================
const aiModeBtn = document.querySelector(".ai-mode-btn");
const searchContainer = document.querySelector(".search-container");
const searchInput = document.getElementById("movieSearch");

function aiModeOn() {
  return !!(aiModeBtn && aiModeBtn.classList.contains("pressed"));
}

if (aiModeBtn && searchContainer && searchInput) {
  aiModeBtn.addEventListener("click", () => {
    aiModeBtn.classList.toggle("pressed");
    searchContainer.classList.toggle("ai-glow");
    if (aiModeOn()) {
      // AI mode is deliberate, not live: typing won't fire a (slow, costly) AI
      // call — the user submits with Enter. The hint reflects that.
      searchInput.placeholder = "Describe a movie, then press Enter…";
    } else {
      // Back to the normal catalog: restore the live feed for whatever's typed.
      searchInput.placeholder = "Search movies...";
      runSearch();
    }
  });
}

// ==========================================
// 14b. AI NATURAL-LANGUAGE SEARCH  (POST /api/ai/search)
// ==========================================
// Unlike the live catalog search, this is a single deliberate request (6–9s and
// a real API call), so it fires on Enter only. It takes over the feed: clear,
// show skeletons, then render the AI's picks with the SAME card builder. Setting
// feedDone stops infinite scroll from appending the popular feed underneath.
async function runAiSearch(query) {
  // Snapshot the current feed so a FAILED search can leave it on screen — a
  // rate-limit / error should just toast, not dump a wall of error text.
  const prev = feedMovies.slice();
  feedMovies = [];
  feedPage = 0;
  feedDone = true; // AI results are a fixed set — no paging beneath them
  feedLoading = false;
  const token = ++feedToken; // invalidate any in-flight catalog page load
  const grid = document.getElementById("movieGrid");
  if (grid) {
    clearGridCards();
    insertBeforeSentinel(fragmentFromHTML(movieSkeletonMarkup(10)));
  }

  try {
    const results = await MovieAPI.aiSearch(query);
    if (token !== feedToken) return; // a newer search superseded this one
    clearGridCards();
    if (!results.length) {
      if (prev.length) {
        feedMovies = prev;
        insertBeforeSentinel(fragmentFromHTML(prev.map(buildMovieCard).join("")));
        if (window.toast) toast.info("No matches — keeping your previous results.");
      } else {
        showGridMessage("The AI couldn’t find a match — try rephrasing.");
      }
      return;
    }
    feedMovies = results;
    insertBeforeSentinel(fragmentFromHTML(results.map(buildMovieCard).join("")));
  } catch (err) {
    if (token !== feedToken) return;
    // Only a short, friendly toast — never the raw upstream error. Keep the feed
    // as it was: restore the previous cards if we had any.
    if (window.toast) toast.error(aiSearchErrorMessage(err));
    clearGridCards();
    if (prev.length) {
      feedMovies = prev;
      insertBeforeSentinel(fragmentFromHTML(prev.map(buildMovieCard).join("")));
    } else {
      showGridMessage("Couldn’t run AI search right now. Please try again.");
    }
  }
}

// A SHORT, friendly message for a failed AI search — never the raw upstream error
// (Gemini's free-tier rate-limit replies are a huge wall of text).
function aiSearchErrorMessage(err) {
  switch (err && err.status) {
    case 400: return (err.message && err.message.length <= 100)
      ? err.message : "That search didn’t look right — try rephrasing it.";
    case 401: return "Please sign in to use AI search.";
    case 429:
    case 503: return "The AI is busy right now (free-tier rate limit). Give it a moment, then try again.";
    case 502: return "The AI had trouble responding. Try again.";
    case 504: return "The AI took too long to answer. Try again in a moment.";
    default:  return "Couldn’t run AI search right now. Please try again.";
  }
}

// ==========================================
// 15. LIVE TEXT SEARCH (debounced -> runSearch)
// ==========================================
// Typing just re-runs the consolidated query (text + filters + sort). An empty
// box is a valid query too — it returns the default feed. Out-of-order responses
// are handled by the feedToken guard inside loadFeedBatch().
if (searchInput) {
  let searchDebounce;
  searchInput.addEventListener("input", () => {
    // In AI mode typing is NOT live — the user submits with Enter (handled below),
    // so don't fire the debounced catalog search.
    if (aiModeOn()) return;
    // If the user scrolled down the feed and starts typing again, glide back to
    // the top so the fresh results aren't hidden below the fold.
    window.scrollTo({ top: 0, behavior: "smooth" });
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(runSearch, 300);
  });

  // Enter submits an AI search when AI mode is on. (In normal mode the live
  // input handler already covers it, so Enter is a harmless no-op there.)
  searchInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || !aiModeOn()) return;
    e.preventDefault();
    const q = searchInput.value.trim();
    if (!q) {
      if (window.toast) toast.info("Describe what you’re after, then press Enter.");
      return;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
    runAiSearch(q);
  });
}

// ==========================================
// 16. SURPRISE ME RANDOMIZER
// ==========================================
// Picks a random movie to take over the screen with one result. Rather than the
// generic /movies/random endpoint (which surfaced obscure / foreign titles), it
// draws from the SAME pool as the default feed — popular, well-voted, English
// movies — so the "surprise" is always a recognisable, normal pick. It grabs a
// random page from the top of that pool and chooses a movie from it at random.
const SURPRISE_PAGES = 50; // sample from roughly the top ~1000 popular movies

async function fetchSurpriseMovie() {
  const page = Math.floor(Math.random() * SURPRISE_PAGES) + 1;
  // Mirrors the empty-box default feed: popularity sort + quality guards.
  let results = await MovieAPI.searchMovies({
    sort: "popularity",
    minVotes: 500,
    language: "en",
    page,
  });
  // A high random page can fall past the result set on a thin catalog — retry
  // once from page 1 so the button still returns something popular.
  if (!results.length && page !== 1) {
    results = await MovieAPI.searchMovies({
      sort: "popularity",
      minVotes: 500,
      language: "en",
      page: 1,
    });
  }
  if (!results.length) return null;
  return results[Math.floor(Math.random() * results.length)];
}

document.addEventListener("DOMContentLoaded", () => {
  const diceOne = document.getElementById("diceOne");
  const diceTwo = document.getElementById("diceTwo");
  const movieSearchInput = document.getElementById("movieSearch");
  const surpriseTrigger = document.querySelector(".surprise-container");
  let surprising = false; // guard against double-clicks while a request is live

  function rollDice() {
    if (!diceOne || !diceTwo) return;
    diceOne.classList.remove("roll-left");
    diceTwo.classList.remove("roll-right");
    void diceOne.offsetWidth; // force a reflow so the animation replays
    diceOne.classList.add("roll-left");
    diceTwo.classList.add("roll-right");
  }

  if (surpriseTrigger) {
    surpriseTrigger.addEventListener("click", async (e) => {
      e.preventDefault();
      rollDice();
      if (surprising) return;
      surprising = true;

      try {
        const movie = await fetchSurpriseMovie();
        if (!movie || !movie.title) {
          if (window.toast) toast.info("Couldn't find a movie — try again!");
          return;
        }
        // Take over the grid with just this pick and pause pagination, and
        // reflect the result in the search bar (without re-triggering a search —
        // editing/clearing the box later runs a fresh query as usual).
        feedQuery = {};
        feedMovies = [movie];
        feedPage = 0;
        feedDone = true; // no more pages for a single random pick
        feedToken++; // abandon any in-flight page load
        if (movieSearchInput) movieSearchInput.value = movie.title;
        await renderMovieGrid([movie]);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (err) {
        console.error("Surprise Me failed:", err);
        if (window.toast) toast.error(err.message);
      } finally {
        surprising = false;
      }
    });
  }
});
