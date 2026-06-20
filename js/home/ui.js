// home/ui.js — page chrome around the feed: mobile layout adaptation, the global
// filter/sort menu toggles + filter-option loading, the invisible keyboard
// "type-to-jump" search inside open dropdowns, and the injectSearchBar helper.
// Split out of the former monolithic js/home.js (behaviour unchanged). Loaded
// AFTER home/feed.js and BEFORE home/filters.js (which reads filterBtn /
// sortCustomBtn / sortCustomMenu and the all*/...NameToId state declared here).

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
