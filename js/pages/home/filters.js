// home/filters.js — every filter row (release year, genres, rating stars,
// people, age ratings, platforms) plus server-side sorting, and the
// collectQuery() that reads all of this UI state into one search query.
// Split out of the former monolithic js/home.js (behaviour unchanged). Loaded
// AFTER home/feed.js (it uses runSearch / updateClearFiltersVisibility, which
// are declared there) and BEFORE home/ui.js / home/main.js.

// Gather the live UI state into one query object for GET /api/movies/search.
// Genres are stored as names in the UI, so resolve them to ids here. Age ratings
// map to the backend's `certification` param and platforms to `providers` (TMDB
// provider ids). Anything left at its default ("Any" / empty) is omitted.
function collectQuery() {
  const searchEl = document.getElementById("movieSearch");
  const term = searchEl ? searchEl.value.trim() : "";
  if (term) {
    // A real text search is PURE relevance: the backend ignores sort and EVERY
    // filter for a text query (so the original ranks above its sequels and typos
    // are tolerated). Send ONLY the query — adding filters/sort would have no
    // effect, and the controls are dimmed to match (see updateSearchModeUI).
    return { q: term };
  }

  // Default / Browse feed (empty box): keep it to well-known English movies by
  // requiring a healthy vote count and an English language, then layer on the
  // chosen sort + every active filter.
  const query = { minVotes: 500, language: "en" };

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

  // Age rating -> certification. The button's text is the chosen TMDB cert;
  // "Any" (or empty) means no certification filter.
  const ageBtn = document.getElementById("ageRatingBtn");
  const cert = ageBtn ? ageBtn.textContent.trim() : "";
  if (cert && cert !== "Any") query.certification = cert;

  // Platforms -> providers. Resolve the selected provider names to TMDB ids;
  // searchMovies() joins them into a comma list (OR semantics).
  const providerIds = activePlatforms
    .map((name) => platformNameToId[name])
    .filter((id) => id != null);
  if (providerIds.length) query.providers = providerIds;

  query.sort = currentSortValue(); // always send a sort (default: popularity)

  return query;
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
// The preset now lives in data/filterMenuData.json and is loaded into
// `directorDefaults` by home/ui.js.

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
      const q = searchInput.value.trim();
      clearTimeout(searchDebounce);
      if (q.length < 2) {
        renderOptions(defaults); // back to this row's default list
        // Scroll the list back to the top AFTER re-rendering, so the reflow can't
        // interrupt the scroll (a scroll fired before the render would be cancelled).
        dropdownEl.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      // Glide back to the top as soon as the user starts typing (before the
      // debounced results land), then again once they render.
      dropdownEl.scrollTo({ top: 0, behavior: "smooth" });
      searchDebounce = setTimeout(async () => {
        const seq = ++searchSeq;
        try {
          const people = await MovieAPI.searchPeople(q);
          if (seq === searchSeq) {
            renderOptions(people); // ignore stale
            dropdownEl.scrollTo({ top: 0, behavior: "smooth" });
          }
        } catch (err) {
          console.error("Person search failed:", err);
          if (seq === searchSeq && window.toast) toast.error(err.message);
        }
      }, 300);
    };
    dropdownEl.appendChild(searchInput);
    attachClearButton(searchInput); // inline "X" — clears + re-runs the search
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
  // Curated directors from filterMenuData.json (no popular fetch); typing still
  // live-searches. Resolved lazily so it picks up the loaded preset.
  loadDefaults: async () => directorDefaults,
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
  // Rebuild from scratch. The dropdown shows the POPULAR providers by default and
  // reveals the rest of the catalogue only when the user searches — "popular by
  // default, search for the rest".
  platformDropdown.innerHTML = "";

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.className = "dropdown-search";
  searchInput.placeholder = "Search providers...";
  searchInput.onclick = (e) => e.stopPropagation();
  searchInput.onkeydown = (e) => e.stopPropagation();
  platformDropdown.appendChild(searchInput);
  attachClearButton(searchInput); // inline "X" — clears + re-runs the search

  const popularSet = new Set(popularPlatforms);
  const optionEls = [];
  allPlatforms
    .filter((p) => !activePlatforms.includes(p))
    .forEach((platform) => {
      const opt = document.createElement("div");
      opt.className = "pill-option";
      opt.textContent = platform;
      // Non-popular providers stay hidden until a search matches them.
      if (!popularSet.has(platform)) opt.style.display = "none";
      opt.onclick = (e) => {
        e.stopPropagation();
        activePlatforms.unshift(platform);
        renderPlatforms();
        renderPlatformDropdown();
        platformDropdown.classList.remove("show");
      };
      platformDropdown.appendChild(opt);
      optionEls.push(opt);
    });

  searchInput.oninput = () => {
    const term = searchInput.value.trim().toLowerCase();
    optionEls.forEach((opt) => {
      const show = term
        ? opt.textContent.toLowerCase().includes(term)
        : popularSet.has(opt.textContent); // empty box -> popular only
      opt.style.display = show ? "block" : "none";
    });
    // Glide back to the top AFTER re-filtering, so the reflow from showing/hiding
    // options can't interrupt the scroll.
    platformDropdown.scrollTo({ top: 0, behavior: "smooth" });
  };
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
//
// `sort` is the value the backend uses; the labels are display-only. The two
// popularity feeds are genuinely different lists: "popularity" = all-time
// most-rated (vote_count.desc — the timeless classics), "trending" = TMDB's
// most-popular-right-now (popularity.desc). The compact `short` label is what the
// button shows ("Top" / "Trending"); the descriptive `long` label is what the
// dropdown menu shows ("Popular All-Time" / "Popular This Week").
const sortOptionsData = [
  { short: "Top", long: "Popular All-Time", sort: "popularity" },
  { short: "Trending", long: "Popular This Week", sort: "trending" },
  { short: "Rating ↓", long: "Rating (Best to Worst)", sort: "rating_desc" },
  { short: "Rating ↑", long: "Rating (Worst to Best)", sort: "rating_asc" },
  { short: "A ➔ Z", long: "Alphabetical (A-->Z)", sort: "title_asc" },
  { short: "Z ➔ A", long: "Alphabetical (Z-->A)", sort: "title_desc" },
  { short: "Newest", long: "Release Date (New to Old)", sort: "year_desc" },
  { short: "Oldest", long: "Release Date (Old to New)", sort: "year_asc" },
];

// The currently selected server `sort` value (default popularity = all-time).
// Tracked explicitly because the button shows the short label while the menu
// shows the long one, so it can't be reverse-engineered from the button text.
let currentSort = "popularity";
function currentSortValue() {
  return currentSort;
}

// The button always shows the compact `short` label (e.g. "Top", "Trending",
// "Rating ↓"); the full descriptive name lives in the dropdown menu.
function renderSortButtonLabel() {
  const label = document.getElementById("sortSelectedText");
  if (!label) return;
  const opt = sortOptionsData.find((o) => o.sort === currentSort) || sortOptionsData[0];
  label.textContent = opt.short;
}

// Select a sort WITHOUT firing a search (the caller decides). Updates the tracked
// value, the menu's highlighted row, and the button label.
function selectSort(value) {
  const opt = sortOptionsData.find((o) => o.sort === value) || sortOptionsData[0];
  currentSort = opt.sort;
  document.querySelectorAll(".sort-option").forEach((el) => {
    el.classList.toggle("selected", el.dataset.sort === currentSort);
  });
  renderSortButtonLabel();
}

if (sortCustomBtn && sortCustomMenu) {
  sortOptionsData.forEach((option) => {
    const div = document.createElement("div");
    div.className = "sort-option";
    div.dataset.sort = option.sort;
    div.textContent = option.long; // the menu always shows the full label
    div.onclick = (e) => {
      e.stopPropagation();
      selectSort(option.sort);
      sortCustomMenu.classList.remove("show");
      runSearch(); // re-fetch from the backend ordered by the new sort
      window.scrollTo({ top: 0, behavior: "smooth" }); // jump back to the new top
    };
    sortCustomMenu.appendChild(div);
  });
  selectSort("popularity"); // initial highlight + button label
}

// Reset every filter row to its default. Used by the filter panel's "Clear"
// (includeSort: true → also reset the sort) and the empty-results "Clear Filters"
// button (includeSort: false → leave the chosen sort alone). Does NOT re-fetch —
// the caller runs the search when it wants the change to take effect.
function resetAllFilters({ includeSort = false } = {}) {
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
  if (actorFilter) actorFilter.clear();
  if (directorFilter) directorFilter.clear();

  currentFromYear = "Any";
  currentTillYear = "Any";
  if (fromYearBtn) fromYearBtn.textContent = "Any";
  if (tillYearBtn) tillYearBtn.textContent = "Any";
  updateYearConstraints();

  currentRating = 0;
  stars.forEach((s) => {
    s.src = BLANK_STAR_PATH;
  });

  if (ageRatingBtn) ageRatingBtn.textContent = "Any";

  if (includeSort) selectSort("popularity"); // default = all-time most popular

  closeAllInnerDropdowns();
  updateClearFiltersVisibility();
}

// All filter state + elements are wired now: enable the "Clear Filters" toggle
// and set its initial (hidden) state.
filtersReady = true;
updateClearFiltersVisibility();

// Refresh the button's visibility whenever the filter panel is opened.
if (filterBtn) {
  filterBtn.addEventListener("click", () => updateClearFiltersVisibility());
}
