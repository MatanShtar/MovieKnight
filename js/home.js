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

// Show a friendly full-width message in place of the card grid.
function showGridMessage(text) {
  const grid = document.getElementById("movieGrid");
  if (grid) grid.innerHTML = `<p class="grid-message">${text}</p>`;
}

// Build cards for a list of movies, preload posters, then REPLACE the grid.
async function renderMovieGrid(movies) {
  const grid = document.getElementById("movieGrid");
  if (!grid) return;

  if (!movies.length) {
    showGridMessage("No movies found.");
    return;
  }

  const html = movies.map(buildMovieCard).join("");
  await preloadImages(movies.map((m) => m.posterPath)); // wait for posters
  grid.innerHTML = html; // real cards now animate in (.movie-card entrance)
  // No client-side re-ordering — the backend already returns them sorted.
}

// Append cards for newly loaded movies without disturbing what's already shown.
// If loading skeletons are currently pinned to the bottom, the real cards are
// inserted ABOVE them (not after) so that clearing the skeletons afterwards
// doesn't yank the freshly-added cards upward — that shift was the "jump".
function appendMovieCards(movies) {
  const grid = document.getElementById("movieGrid");
  if (!grid || !movies.length) return;
  const html = movies.map(buildMovieCard).join("");
  const firstSkeleton = grid.querySelector(".feed-skeleton");
  if (firstSkeleton) firstSkeleton.insertAdjacentHTML("beforebegin", html);
  else grid.insertAdjacentHTML("beforeend", html);
}

// Load the next page for the current query and append it. `token` ties the
// request to the query that started it; if a newer query begins while this is
// in flight, the stale result is dropped instead of polluting the grid.
async function loadFeedPage(token = feedToken) {
  if (token !== feedToken || feedLoading || feedDone) return;
  feedLoading = true;
  const page = feedPage + 1;
  const grid = document.getElementById("movieGrid");

  // While the next page is in flight, show skeletons at the bottom so the area
  // isn't blank during the round-trip.
  if (page > 1 && grid) {
    grid.insertAdjacentHTML(
      "beforeend",
      '<article class="movie-card movie-card--skeleton feed-skeleton" aria-hidden="true"></article>'.repeat(10),
    );
  }

  let results;
  try {
    results = await MovieAPI.searchMovies({ ...feedQuery, page });
  } catch (err) {
    console.error("Could not load movies:", err);
    if (token === feedToken) {
      feedDone = true; // stop hammering the server on error
      if (grid) grid.querySelectorAll(".feed-skeleton").forEach((el) => el.remove());
      if (feedPage === 0) {
        showGridMessage("Couldn't load movies. Please try again later.");
        if (window.toast) toast.error(err.message);
      }
    }
    feedLoading = false;
    return;
  }

  // A newer query superseded this one while it was fetching — drop the result.
  if (token !== feedToken) return;

  const seen = new Set(feedMovies.map((m) => m.title.toLowerCase()));
  const fresh = results.filter((m) => {
    const k = m.title.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  if (!fresh.length) {
    feedDone = true; // no new movies -> end of results
    // Nothing loaded for this query at all (e.g. an over-constrained filter set):
    // replace the initial skeletons with a clear "no results" message instead of
    // leaving the skeleton placeholders spinning forever.
    if (feedPage === 0) showGridMessage("No movies found. Try removing a filter.");
  } else {
    feedMovies.push(...fresh);
    feedPage = page;
    if (page === 1) await renderMovieGrid(feedMovies);
    else appendMovieCards(fresh); // real cards go in before the skeletons clear
  }

  // Clear the loading skeletons once the real cards are in.
  if (grid) grid.querySelectorAll(".feed-skeleton").forEach((el) => el.remove());
  feedLoading = false;

  // Keep loading until the page is actually tall enough to scroll, then stop
  // until the user scrolls down again.
  if (!feedDone && feedNearBottom()) loadFeedPage(token);
}

// True when the bottom sentinel is near the viewport bottom. Kept fairly small
// so the loading skeletons are actually on-screen while the next page loads,
// rather than being prefetched and swapped out far below the fold.
function feedNearBottom() {
  const sentinel = document.getElementById("gridSentinel");
  if (!sentinel) return false;
  return sentinel.getBoundingClientRect().top <= window.innerHeight + 300;
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
  const token = ++feedToken; // invalidate any in-flight page load
  const grid = document.getElementById("movieGrid");
  if (grid) grid.innerHTML = movieSkeletonMarkup(10);
  loadFeedPage(token);
}

// Gather the live UI state into one query object and run it.
function runSearch() {
  applyQuery(collectQuery());
}

// Load more whenever the user nears the bottom. A bottom sentinel marks where
// the grid ends; we check its position on scroll/resize (an IntersectionObserver
// won't re-fire while it stays on-screen, which stalls short pages).
function setupInfiniteScroll() {
  const grid = document.getElementById("movieGrid");
  if (!grid || !grid.parentElement) return;
  if (!document.getElementById("gridSentinel")) {
    const sentinel = document.createElement("div");
    sentinel.id = "gridSentinel";
    grid.parentElement.appendChild(sentinel);
  }
  const onView = () => {
    if (feedNearBottom()) loadFeedPage();
  };
  window.addEventListener("scroll", onView, { passive: true });
  window.addEventListener("resize", onView);
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
  return `
    <article class="movie-card" data-id="${m.id ?? ""}" data-title="${m.title}" data-rating="${m.rating}" data-year="${m.releaseYear}" data-popularity="${m.popularity}" data-poster="${m.posterPath}">
      <img src="${m.posterPath}" alt="${m.title}" class="poster-img">
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
        <div class="movie-title-pill">${m.title} (${m.releaseYear})</div>
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
  allActors = [],
  allDirectors = [],
  allAgeRatings = [],
  allPlatforms = [];
// Name -> TMDB id, so the filters can send ids while the UI shows names.
let genreNameToId = {},
  platformNameToId = {};

// Load the filter options once, then build the dropdowns that depend on them.
// Genres + providers come from the live backend (with ids for filtering);
// actors / directors / age-ratings still come from the static file because
// the backend has no endpoints for them yet.
(async () => {
  try {
    const res = await fetch("data/filterData.json");
    if (res.ok) {
      const data = await res.json();
      allActors = data.actors || [];
      allDirectors = data.directors || [];
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
// "Any" / "Popular" state, then run one fresh search. All the state it touches
// (activeGenres, activePlatforms, currentRating, the year vars, the person
// filters) lives at module scope and is initialised by the time this can fire.
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
    runSearch();
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
// 11. FILTER: AGE RATINGS
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
// 12. FILTER: PLATFORMS
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
// 13. SORTING (server-side)
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
// 14. CARD INTERACTIONS (LIKE / WATCHED)
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

    if (label === "Add to collection") {
      const card = btn.closest(".movie-card");
      const title = (card && card.dataset.title) || "This movie";
      if (window.CollectionModal) CollectionModal.open(title);
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
// 15. AI MODE TOGGLE
// ==========================================
const aiModeBtn = document.querySelector(".ai-mode-btn");
const searchContainer = document.querySelector(".search-container");
const searchInput = document.getElementById("movieSearch");

if (aiModeBtn && searchContainer && searchInput) {
  aiModeBtn.addEventListener("click", () => {
    aiModeBtn.classList.toggle("pressed");
    searchContainer.classList.toggle("ai-glow");
    if (aiModeBtn.classList.contains("pressed")) {
      searchInput.placeholder = "Search movies with AI...";
      toast.soon("AI Mode - Coming Soon!");
    } else {
      searchInput.placeholder = "Search movies...";
    }
  });
}

// ==========================================
// 16. LIVE TEXT SEARCH (debounced -> runSearch)
// ==========================================
// Typing just re-runs the consolidated query (text + filters + sort). An empty
// box is a valid query too — it returns the default feed. Out-of-order responses
// are handled by the feedToken guard inside loadFeedPage().
if (searchInput) {
  let searchDebounce;
  searchInput.addEventListener("input", () => {
    // If the user scrolled down the feed and starts typing again, glide back to
    // the top so the fresh results aren't hidden below the fold.
    window.scrollTo({ top: 0, behavior: "smooth" });
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(runSearch, 300);
  });
}

// ==========================================
// 17. SURPRISE ME RANDOMIZER
// ==========================================
// Instead of picking from the movies already loaded in the grid, this asks the
// backend for a genuinely random movie (GET /movies/random) and takes over the
// screen with that single result — also filling the search bar with its title.
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
        const movie = await MovieAPI.getRandomMovie();
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
