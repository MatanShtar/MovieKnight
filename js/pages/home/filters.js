// load after home/feed.js (runSearch / updateClearFiltersVisibility), before home/ui.js / home/main.js

function collectQuery() {
  const searchEl = document.getElementById("movieSearch");
  const term = searchEl ? searchEl.value.trim() : "";
  if (term) {
    // text search is pure relevance: backend ignores sort and filters, controls dimmed to match
    return { q: term };
  }

  const query = { minVotes: 500, language: "en" };

  const genreIds = activeGenres.map((n) => genreNameToId[n]).filter(Boolean);
  if (genreIds.length) query.genres = genreIds;

  if (currentFromYear !== "Any") query.yearFrom = currentFromYear;
  if (currentTillYear !== "Any") query.yearTo = currentTillYear;

  if (currentRating > 0) query.minRating = currentRating;

  const castIds = actorFilter ? actorFilter.getSelected().map((p) => p.id) : [];
  if (castIds.length) query.with_cast = castIds.join(",");

  const director = directorFilter ? directorFilter.getSelected()[0] : null;
  if (director) query.with_crew = director.id;

  const ageBtn = document.getElementById("ageRatingBtn");
  const cert = ageBtn ? ageBtn.textContent.trim() : "";
  if (cert && cert !== "Any") query.certification = cert;

  const providerIds = activePlatforms
    .map((name) => platformNameToId[name])
    .filter((id) => id != null);
  if (providerIds.length) query.providers = providerIds;

  query.sort = currentSortValue();

  return query;
}

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

// actors multi-select (with_cast), director single (with_crew)
let actorFilter = null;
let directorFilter = null;
let popularPeople = null;

async function loadPopularPeople() {
  if (popularPeople) return popularPeople;
  try {
    popularPeople = await MovieAPI.getPopularPeople();
  } catch (err) {
    console.error("Could not load popular people:", err);
    popularPeople = [];
  }
  return popularPeople;
}

// multiple = actors (many) vs director (one)
function setupPersonFilter({ listId, dropdownId, addBtnId, clearBtnId, multiple, loadDefaults }) {
  const listEl = document.getElementById(listId);
  const dropdownEl = document.getElementById(dropdownId);
  const addBtn = document.getElementById(addBtnId);
  const clearBtn = document.getElementById(clearBtnId);
  if (!listEl || !dropdownEl || !addBtn) return null;

  let selected = [];
  let defaults = null;
  let optionsWrap, searchInput, searchDebounce, searchSeq = 0;

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
      };
      pill.append(label, remove);
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
    // director is single-select: once chosen, hide "+" until cleared
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
        if (multiple) selected.unshift(person);
        else selected = [person];
        renderPills();
        dropdownEl.classList.remove("show");
        if (searchInput) searchInput.value = "";
      };
      optionsWrap.appendChild(opt);
    });
  }

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
        renderOptions(defaults);
        // scroll after re-render, else the reflow cancels it
        dropdownEl.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      dropdownEl.scrollTo({ top: 0, behavior: "smooth" });
      searchDebounce = setTimeout(async () => {
        const seq = ++searchSeq;
        try {
          const people = await MovieAPI.searchPeople(q);
          if (seq === searchSeq) { // ignore stale responses
            renderOptions(people);
            dropdownEl.scrollTo({ top: 0, behavior: "smooth" });
          }
        } catch (err) {
          console.error("Person search failed:", err);
          if (seq === searchSeq && window.toast) toast.error(err.message);
        }
      }, 300);
    };
    dropdownEl.appendChild(searchInput);
    attachClearButton(searchInput);
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
    };
  }

  renderPills();
  // clear() resets the row without firing a search; the caller runs runSearch once
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
  loadDefaults: async () =>
    (await loadPopularPeople()).filter((p) => p.department === "Acting"),
});
directorFilter = setupPersonFilter({
  listId: "directorList",
  dropdownId: "directorDropdown",
  addBtnId: "addDirectorBtn",
  clearBtnId: "clearDirectorBtn",
  multiple: false,
  loadDefaults: async () => directorDefaults,
});

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
  platformDropdown.innerHTML = "";

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.className = "dropdown-search";
  searchInput.placeholder = "Search providers...";
  searchInput.onclick = (e) => e.stopPropagation();
  searchInput.onkeydown = (e) => e.stopPropagation();
  platformDropdown.appendChild(searchInput);
  attachClearButton(searchInput);

  const popularSet = new Set(popularPlatforms);
  const optionEls = [];
  allPlatforms
    .filter((p) => !activePlatforms.includes(p))
    .forEach((platform) => {
      const opt = document.createElement("div");
      opt.className = "pill-option";
      opt.textContent = platform;
      // non-popular providers stay hidden until a search matches them
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
    // scroll after re-filter, else the reflow cancels it
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
// sort = backend value; short on button, long in menu. "popularity" = all-time
// most-rated (vote_count.desc), "trending" = most-popular-now (popularity.desc)
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

let currentSort = "popularity";
function currentSortValue() {
  return currentSort;
}

function renderSortButtonLabel() {
  const label = document.getElementById("sortSelectedText");
  if (!label) return;
  const opt = sortOptionsData.find((o) => o.sort === currentSort) || sortOptionsData[0];
  label.textContent = opt.short;
}

// select a sort without firing a search
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
    div.textContent = option.long;
    div.onclick = (e) => {
      e.stopPropagation();
      selectSort(option.sort);
      sortCustomMenu.classList.remove("show");
      runSearch();
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    sortCustomMenu.appendChild(div);
  });
  selectSort("popularity");
}

// includeSort true also resets the sort; does not re-fetch, the caller runs the search
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

  if (includeSort) selectSort("popularity");

  closeAllInnerDropdowns();
  updateClearFiltersVisibility();
}

filtersReady = true;
updateClearFiltersVisibility();

if (filterBtn) {
  filterBtn.addEventListener("click", () => updateClearFiltersVisibility());
}
