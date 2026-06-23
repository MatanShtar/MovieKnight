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
// The curated "popular" providers shown by default (the rest are revealed by the
// platform search), plus the director preset — both read from filterMenuData.json
// and consumed by home/filters.js.
let popularPlatforms = [];
let directorDefaults = [];

// Load the static filter-menu data once, then build the dropdowns that depend on
// it. Genres come from the live backend (with ids for filtering). Age-rating
// certifications + the popular providers + the director preset come from
// data/filterMenuData.json; the full provider catalogue is appended from the
// backend so the platform search can reach beyond the popular few.
(async () => {
  try {
    const res = await fetch("data/filterMenuData.json");
    if (res.ok) {
      const data = await res.json();
      // TMDB certifications (G / PG / PG-13 / R / …) used by the age-rating filter.
      allAgeRatings = data.certifications || [];
      // Director preset for the People filter (TMDB person ids for with_crew).
      directorDefaults = (data.directors || []).map((d) => ({
        id: d.id,
        name: d.name,
        department: d.department || "Directing",
      }));
      // Popular providers (TMDB provider ids for the `providers` query param).
      const providers = data.providers || [];
      popularPlatforms = providers.map((p) => p.name);
      allPlatforms = providers.map((p) => p.name);
      providers.forEach((p) => {
        if (p.id != null) platformNameToId[p.name] = p.id;
      });
    }
  } catch (err) {
    console.error("Could not load filter menu data:", err);
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

  // Append the rest of the backend's provider catalogue (anything not already in
  // the popular list) so the platform search can find it; popular stays first.
  try {
    const providers = await MovieAPI.getProviders();
    providers.forEach((p) => {
      if (!p.name) return;
      if (p.id != null && platformNameToId[p.name] == null)
        platformNameToId[p.name] = p.id;
      if (!allPlatforms.includes(p.name)) allPlatforms.push(p.name);
    });
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
    // Reset every filter row AND the sort back to its default (resetAllFilters
    // lives in home/filters.js and owns all the filter/sort state).
    // No runSearch() here on purpose — clearing just resets the controls; the
    // feed only changes when "Apply" is pressed.
    resetAllFilters({ includeSort: true });
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
    // Starting a fresh typing burst while scrolled down the list glides the
    // dropdown back to the top first (matches the scroll-to-top the search-box
    // dropdowns do on input), so typing always begins from the top.
    if (typeString === "") openMenu.scrollTo({ top: 0, behavior: "smooth" });

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
// Add an inline "X" clear button to a text input. The "X" shows only when the
// box has text; clicking it clears the box, refocuses it, and re-runs the same
// handler an empty box would (by default it dispatches a real `input` event, so
// whatever live handler is bound to the input fires exactly as if the user had
// deleted the text). Accessible: type=button (never submits) + aria-label.
function attachClearButton(input, onClear) {
  if (!input || input.dataset.clearBtnAttached) return null;
  input.dataset.clearBtnAttached = "1";

  // Wrap the input so the "X" can be absolutely positioned at its right edge.
  const wrap = document.createElement("span");
  wrap.className = "input-clear-wrap";
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "input-clear-btn";
  btn.setAttribute("aria-label", "Clear");
  btn.textContent = "×";
  btn.hidden = true;
  wrap.appendChild(btn);

  const sync = () => {
    btn.hidden = !input.value;
  };
  input.addEventListener("input", sync);
  sync();

  btn.addEventListener("click", () => {
    input.value = "";
    sync();
    input.focus();
    if (onClear) onClear();
    else input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return btn;
}

// Reflect "is the user running a text search?" in the controls bar. A text search
// is pure relevance — the backend ignores sort + every filter — so the Filters
// and Sort controls are disabled (and a hover tooltip explains why), instead of
// letting the user's selections appear silently ignored mid-search.
function updateSearchModeUI() {
  const searchEl = document.getElementById("movieSearch");
  const searching = !!(searchEl && searchEl.value.trim());

  const bar = document.querySelector(".controls-bar");
  if (bar) bar.classList.toggle("controls-bar--searching", searching);

  [filterBtn, sortCustomBtn].forEach((b) => {
    if (!b) return;
    b.disabled = searching;
    b.setAttribute("aria-disabled", String(searching));
  });

  if (searching) {
    // Close anything open so a disabled control can't leave a panel hanging.
    if (filterMenu) filterMenu.classList.remove("show");
    if (sortCustomMenu) sortCustomMenu.classList.remove("show");
    closeAllInnerDropdowns();
  }
}

// The homepage search bar gets the same inline "X". Clearing it dispatches an
// `input` event so home/main.js's live-search handler runs exactly as if the box
// had been emptied by hand (re-running the feed + refreshing the search-mode UI).
attachClearButton(document.getElementById("movieSearch"));
updateSearchModeUI();

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
  attachClearButton(searchInput); // inline "X" — clears + re-runs the filter
}
