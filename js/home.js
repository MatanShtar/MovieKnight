// ==========================================
// 1. INITIALIZATION & FETCHING
// ==========================================
// Initial grid load and render
(async () => {
  const grid = document.getElementById("movieGrid");
  if (!grid) return;

  grid.innerHTML = movieSkeletonMarkup(10); // placeholder while we fetch + preload

  try {
    const res = await fetch("data/movies.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { movies } = await res.json();

    const html = movies.map(buildMovieCard).join("");
    await preloadImages(movies.map((m) => m.posterPath)); // wait for posters
    grid.innerHTML = html; // real cards now animate in (.movie-card entrance)
    applyActiveSort(); // order to match the current "Sort by" selection
  } catch (err) {
    console.error("Could not load movies:", err);
    grid.innerHTML = ""; // drop the skeletons rather than spin forever
  }
})();

// Generate skeleton placeholders
function movieSkeletonMarkup(n) {
  return `<article class="movie-card movie-card--skeleton" aria-hidden="true"></article>`.repeat(n);
}

function buildMovieCard(m) {
  return `
    <article class="movie-card" data-title="${m.title}" data-rating="${m.rating}" data-year="${m.releaseYear}" data-popularity="${m.popularity}" data-toast="soon:Coming Soon!">
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

// Load the filter options once, then build the dropdowns that depend on them.
(async () => {
  try {
    const res = await fetch("data/filterData.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    allGenres = data.genres;
    allActors = data.actors;
    allDirectors = data.directors;
    allAgeRatings = data.ageRating;
    allPlatforms = data.watchProviders;

    if (genreList) {
      renderTags();
      renderDropdown();
    }
    if (actorList) {
      renderActors();
      renderActorDropdown();
    }
    if (directorList) {
      renderDirector();
      renderDirectorDropdown();
    }
    if (platformList) {
      renderPlatforms();
      renderPlatformDropdown();
    }
    buildAgeRatings();
  } catch (err) {
    console.error("Could not load filter data:", err);
  }
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

// Filter "Apply" button — closes the panel; the chosen filters stay selected.
const filterApplyBtn = document.getElementById("filterApplyBtn");
if (filterApplyBtn && filterMenu) {
  filterApplyBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeAllInnerDropdowns();
    filterMenu.classList.remove("show");
    toast.soon("Coming Soon!"); // filtering isn't wired up yet
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
    });
  });
}

// ==========================================
// 9. FILTER: ACTORS
// ==========================================
let activeActors = [];

const actorList = document.getElementById("actorList");
const actorDropdown = document.getElementById("actorDropdown");
const addActorBtn = document.getElementById("addActorBtn");
const clearActorBtn = document.getElementById("clearActorBtn");

function renderActors() {
  actorList.innerHTML = "";
  activeActors.slice(0, 1).forEach((actor) => {
    const pill = document.createElement("div");
    pill.className = "pill-item";
    pill.innerHTML = `${actor} <span class="pill-remove">×</span>`;
    pill.querySelector(".pill-remove").onclick = (e) => {
      e.stopPropagation();
      activeActors = activeActors.filter((i) => i !== actor);
      renderActors();
      renderActorDropdown();
    };
    actorList.appendChild(pill);
  });

  if (activeActors.length > 1) {
    const hidden = activeActors.slice(1);
    const overflow = document.createElement("div");
    overflow.className = "pill-overflow";
    overflow.innerHTML = `... <div class="pill-tooltip">${hidden.join(", ")}</div>`;
    actorList.appendChild(overflow);
  }

  if (clearActorBtn)
    clearActorBtn.style.display = activeActors.length > 0 ? "block" : "none";
  if (addActorBtn)
    addActorBtn.style.display =
      activeActors.length === allActors.length ? "none" : "flex";
  actorDropdown.classList.remove("show");
}

function renderActorDropdown() {
  actorDropdown.innerHTML = "";
  injectSearchBar(actorDropdown);

  allActors
    .filter((a) => !activeActors.includes(a))
    .forEach((actor) => {
      const opt = document.createElement("div");
      opt.className = "pill-option";
      opt.textContent = actor;
      opt.onclick = (e) => {
        e.stopPropagation();
        activeActors.unshift(actor);
        renderActors();
        renderActorDropdown();
        actorDropdown.classList.remove("show");
      };
      actorDropdown.appendChild(opt);
    });
}

if (addActorBtn) {
  addActorBtn.onclick = (e) => {
    e.stopPropagation();
    closeAllInnerDropdowns(actorDropdown);
    actorDropdown.classList.toggle("show");
  };
}
if (clearActorBtn) {
  clearActorBtn.onclick = (e) => {
    e.stopPropagation();
    activeActors = [];
    renderActors();
    renderActorDropdown();
  };
}

// ==========================================
// 10. FILTER: DIRECTORS
// ==========================================
let activeDirector = null;

const directorList = document.getElementById("directorList");
const directorDropdown = document.getElementById("directorDropdown");
const addDirectorBtn = document.getElementById("addDirectorBtn");
const clearDirectorBtn = document.getElementById("clearDirectorBtn");

function renderDirector() {
  directorList.innerHTML = "";
  if (activeDirector) {
    const pill = document.createElement("div");
    pill.className = "pill-item";
    pill.innerHTML = `${activeDirector} <span class="pill-remove">×</span>`;
    pill.querySelector(".pill-remove").onclick = (e) => {
      e.stopPropagation();
      activeDirector = null;
      renderDirector();
      renderDirectorDropdown();
    };
    directorList.appendChild(pill);
  }

  if (clearDirectorBtn)
    clearDirectorBtn.style.display = activeDirector ? "block" : "none";
  if (addDirectorBtn)
    addDirectorBtn.style.display = activeDirector ? "none" : "flex";
  directorDropdown.classList.remove("show");
}

function renderDirectorDropdown() {
  directorDropdown.innerHTML = "";
  injectSearchBar(directorDropdown);

  allDirectors
    .filter((d) => d !== activeDirector)
    .forEach((director) => {
      const opt = document.createElement("div");
      opt.className = "pill-option";
      opt.textContent = director;
      opt.onclick = (e) => {
        e.stopPropagation();
        activeDirector = director;
        renderDirector();
        renderDirectorDropdown();
        directorDropdown.classList.remove("show");
      };
      directorDropdown.appendChild(opt);
    });
}

if (addDirectorBtn) {
  addDirectorBtn.onclick = (e) => {
    e.stopPropagation();
    closeAllInnerDropdowns(directorDropdown);
    directorDropdown.classList.toggle("show");
  };
}
if (clearDirectorBtn) {
  clearDirectorBtn.onclick = (e) => {
    e.stopPropagation();
    activeDirector = null;
    renderDirector();
    renderDirectorDropdown();
  };
}

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
}

function renderPlatformDropdown() {
 
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
// 13. SORTING LOGIC
// ==========================================
// Sorting configuration
const sortOptionsData = [
  { short: "Popular", long: "Popular This Week", key: "popularity", dir: "desc" },
  { short: "Rating ↓", long: "Rating (Best to Worst)", key: "rating", dir: "desc" },
  { short: "Rating ↑", long: "Rating (Worst to Best)", key: "rating", dir: "asc" },
  { short: "A ➔ Z", long: "Alphabetical (A-->Z)", key: "title", dir: "asc" },
  { short: "Z ➔ A", long: "Alphabetical (Z-->A)", key: "title", dir: "desc" },
  { short: "Newest", long: "Release Date (New to Old)", key: "year", dir: "desc" },
  { short: "Oldest", long: "Release Date (Old to New)", key: "year", dir: "asc" },
];

function sortMovieGrid({ key, dir }) {
  const grid = document.getElementById("movieGrid");
  if (!grid) return;
  const cards = [...grid.querySelectorAll(".movie-card:not(.movie-card--skeleton)")];
  if (!cards.length) return;

  const valueOf = (card) =>
    key === "title"
      ? (card.dataset.title || "").toLowerCase()
      : parseFloat(card.dataset[key]) || 0;

  cards
    .sort((a, b) => {
      const va = valueOf(a);
      const vb = valueOf(b);
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return dir === "asc" ? cmp : -cmp;
    })
    .forEach((card) => grid.appendChild(card)); // moving a node re-appends it in order
}

function applyActiveSort() {
  const label = document.getElementById("sortSelectedText");
  const current = label ? label.textContent.trim() : "";
  const option = sortOptionsData.find((o) => o.short === current);
  if (option) sortMovieGrid(option);
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
      sortMovieGrid(option);
    };
    sortCustomMenu.appendChild(div);
  });
}

// ==========================================
// 14. CARD INTERACTIONS (LIKE / WATCHED)
// ==========================================
const movieGridEl = document.getElementById("movieGrid");
if (movieGridEl) {
  movieGridEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".icon-btn");
    if (!btn) return;
    e.stopPropagation();
    const label = btn.querySelector("img")?.alt || "";

    if (label === "Add to collection") {
      toast.soon("Coming Soon!");
      return;
    }

    const nowActive = btn.classList.toggle("active");
    const messages = {
      "Mark watched": ["Added to Already Watched", "Removed from Already Watched"],
      "Like": ["Added to Favorites", "Removed from Favorites"],
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
// 16. LIVE TEXT SEARCH
// ==========================================
if (searchInput) {
  searchInput.addEventListener("input", (e) => {
    const searchTerm = e.target.value.trim().toLowerCase();
    const movieCards = document.querySelectorAll(".movie-card");

    if (searchTerm.length >= 2) {
      movieCards.forEach((card) => {
        const titleElement = card.querySelector(".movie-title-pill");
        const titleText = titleElement
          ? titleElement.textContent.toLowerCase()
          : "";
        card.style.display = titleText.includes(searchTerm) ? "flex" : "none";
      });
    } else {
      movieCards.forEach((card) => (card.style.display = "flex"));
    }
  });
}

// ==========================================
// 17. SURPRISE ME RANDOMIZER
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const diceOne = document.getElementById('diceOne');
    const diceTwo = document.getElementById('diceTwo');
    const movieSearchInput = document.getElementById('movieSearch');
    const surpriseTrigger = document.querySelector('.surprise-container');
    let lastRandomIndex = -1; // Remembers the last movie picked

    if (surpriseTrigger) {
        surpriseTrigger.addEventListener('click', (e) => {
            e.preventDefault();

            // --- 1. FIRE THE DUAL ANIMATION ---
            if (diceOne && diceTwo) {
                // Strip the animation classes
                diceOne.classList.remove('roll-left');
                diceTwo.classList.remove('roll-right');

                // force a reflow so the animation can replay from the start
                void diceOne.offsetWidth;
                
                // Add the specific tumble classes back
                diceOne.classList.add('roll-left');
                diceTwo.classList.add('roll-right');
            }

            // --- 2. RUN THE RANDOMIZER LOGIC ---
            if (movieSearchInput) {
                const titlePills = document.querySelectorAll(".movie-title-pill");
                
                if (titlePills.length > 0) {
                    let randomIndex;
                    if (titlePills.length > 1) {
                        do {
                            randomIndex = Math.floor(Math.random() * titlePills.length);
                        } while (randomIndex === lastRandomIndex);
                    } else {
                        randomIndex = 0;
                    }
                    
                    lastRandomIndex = randomIndex;
                    const randomTitle = titlePills[randomIndex].closest(".movie-card").dataset.title;
                    movieSearchInput.value = randomTitle;
                    movieSearchInput.dispatchEvent(new Event("input", { bubbles: true }));
                }
            }
        });
    }
});