// loaded AFTER home/feed.js and BEFORE home/filters.js (which reads filterBtn /
// sortCustomBtn / sortCustomMenu and the state here).

// move "Surprise Me" between header and controls bar by viewport
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

const filterBtn = document.getElementById("filterToggleBtn");
const filterMenu = document.getElementById("filterMenu");
const sortCustomBtn = document.getElementById("sortCustomBtn");
const sortCustomMenu = document.getElementById("sortCustomMenu");
let allGenres = [],
  allAgeRatings = [],
  allPlatforms = [];
// name -> id, so filters send ids while the UI shows names
let genreNameToId = {},
  platformNameToId = {};
let popularPlatforms = [];
let directorDefaults = [];

// genres + full provider catalogue from the backend; certifications, popular
// providers and the director preset from filterMenuData.json.
(async () => {
  try {
    const res = await fetch("data/filterMenuData.json");
    if (res.ok) {
      const data = await res.json();
      allAgeRatings = data.certifications || [];
      // director preset for the People filter (person ids for with_crew)
      directorDefaults = (data.directors || []).map((d) => ({
        id: d.id,
        name: d.name,
        department: d.department || "Directing",
      }));
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

  // append the rest of the provider catalogue for the platform search; popular stay first
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

if (filterBtn && filterMenu) {
  filterBtn.addEventListener("click", function (event) {
    event.stopPropagation();
    if (sortCustomMenu) sortCustomMenu.classList.remove("show");
    filterMenu.classList.toggle("show");
  });
}

const filterApplyBtn = document.getElementById("filterApplyBtn");
if (filterApplyBtn && filterMenu) {
  filterApplyBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeAllInnerDropdowns();
    filterMenu.classList.remove("show");
    runSearch();
  });
}

// resets the filter UI only; takes effect on Apply, like any filter change
const filterClearBtn = document.getElementById("filterClearBtn");
if (filterClearBtn) {
  filterClearBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    resetAllFilters({ includeSort: true });
  });
}

if (sortCustomBtn && sortCustomMenu) {
  sortCustomBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (filterMenu) filterMenu.classList.remove("show");
    sortCustomMenu.classList.toggle("show");
  });
}

// close menus on outside click
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

// type-to-jump inside an open dropdown (no visible search box)
let searchTimeout;
let typeString = "";

document.addEventListener("keydown", (e) => {
  const openMenu = document.querySelector(
    ".pill-dropdown.show, .sort-custom-menu.show",
  );
  if (!openMenu) return;
  if (e.target.tagName === "INPUT") return; // a real search bar is focused
  if (e.key.length === 1) {
    // fresh burst glides the list back to the top so typing starts from the top
    if (typeString === "") openMenu.scrollTo({ top: 0, behavior: "smooth" });

    typeString += e.key.toLowerCase();

    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      typeString = "";
    }, 800);

    const options = Array.from(
      openMenu.querySelectorAll(".pill-option, .sort-option"),
    );
    const match = options.find((opt) =>
      opt.textContent.toLowerCase().startsWith(typeString),
    );

    if (match) {
      // scroll to the match and flash it
      match.scrollIntoView({ block: "nearest", behavior: "smooth" });
      const originalBg = match.style.backgroundColor;
      match.style.backgroundColor = "rgba(255, 136, 179, 0.4)";
      setTimeout(() => {
        match.style.backgroundColor = originalBg;
      }, 300);
    }
  }
});

// inline "X" clear button shown only when the box has text; clicking it clears,
// refocuses, and by default dispatches `input` so the live handler fires.
function attachClearButton(input, onClear) {
  if (!input || input.dataset.clearBtnAttached) return null;
  input.dataset.clearBtnAttached = "1";

  // wrap so the "X" can be absolutely positioned at the input's right edge
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
  // catch programmatic fills (Surprise Me sets value + dispatches `change`)
  input.addEventListener("change", sync);
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

// text search is pure relevance (backend ignores sort + filters), so disable
// the Filters and Sort controls while one is active.
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
    // close open panels so a disabled control can't leave one hanging
    if (filterMenu) filterMenu.classList.remove("show");
    if (sortCustomMenu) sortCustomMenu.classList.remove("show");
    closeAllInnerDropdowns();
  }
}

attachClearButton(document.getElementById("movieSearch"));
updateSearchModeUI();

function injectSearchBar(dropdownElement) {
  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.className = "dropdown-search";
  searchInput.placeholder = "Search...";
  searchInput.onclick = (e) => e.stopPropagation();
  searchInput.onkeydown = (e) => e.stopPropagation();

  searchInput.oninput = (e) => {
    dropdownElement.scrollTo({ top: 0, behavior: "smooth" });
    const term = e.target.value.toLowerCase();
    dropdownElement.querySelectorAll(".pill-option").forEach((opt) => {
      opt.style.display = opt.textContent.toLowerCase().includes(term)
        ? "block"
        : "none";
    });
  };
  dropdownElement.appendChild(searchInput);
  attachClearButton(searchInput);
}
