// --- HOME MOVIE GRID: SKELETON LOADER ---
// The movie cards are static HTML, so we show shimmer skeletons, preload the posters,
// then swap the real cards in (they fade up via the .movie-card entrance animation).
// Mirrors the profile collections loader for a consistent loading experience.
(function () {
  const grid = document.getElementById("movieGrid");
  if (!grid) return;

  const cards = Array.from(grid.querySelectorAll(".movie-card"));
  if (!cards.length) return;

  const posterSrcs = cards
    .map((c) => c.querySelector(".poster-img")?.getAttribute("src"))
    .filter(Boolean);
  const realHTML = grid.innerHTML;

  grid.innerHTML = movieSkeletonMarkup(cards.length);
  preloadImages(posterSrcs).then(() => {
    grid.innerHTML = realHTML; // real cards now animate in
  });
})();

function movieSkeletonMarkup(n) {
  return `<article class="movie-card movie-card--skeleton" aria-hidden="true"></article>`.repeat(n);
}

// --- GLOBAL MENU MANAGEMENT ---
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

// This function guarantees only one inner pill-dropdown is open at a time
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

// --- INVISIBLE KEYBOARD TYPING LOGIC ---
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

// --- HELPER: INJECT SEARCH BARS ---
function injectSearchBar(dropdownElement) {
  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.className = "dropdown-search";
  searchInput.placeholder = "Search...";

  // Stop the menu from closing when clicking the input
  searchInput.onclick = (e) => e.stopPropagation();
  // Stop invisible typing from activating while using this bar
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

// --- CUSTOM YEAR DROPDOWNS ---
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

// --- GENRES --- (allGenres is loaded from filterData.json at the top of the file)
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
// --- RATING STARS ---
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

// --- ACTORS --- (allActors is loaded from filterData.json)
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
// --- DIRECTORS --- (allDirectors is loaded from filterData.json)
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
// --- AGE RATINGS --- (allAgeRatings is loaded from filterData.json)
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

// --- PLATFORMS --- (allPlatforms is loaded from filterData.json)
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
// --- SORT BY DROPDOWN LOGIC ---
const sortOptionsData = [
  { short: "Popular", long: "Popular This Week" },
  { short: "Rating ↑", long: "Rating (Worst to Best)" },
  { short: "Rating ↓", long: "Rating (Best to Worst)" },
  { short: "A ➔ Z", long: "Alphabetical (A-->Z)" },
  { short: "Z ➔ A", long: "Alphabetical (Z-->A)" },
  { short: "Newest", long: "Release Date (New to Old)" },
  { short: "Oldest", long: "Release Date (Old to New)" },
];

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
    };
    sortCustomMenu.appendChild(div);
  });
}

// --- MOVIE POSTER OVERLAY BUTTONS ---
// Delegated to the grid so it keeps working after the skeleton -> real-cards re-render.
const movieGridEl = document.getElementById("movieGrid");
if (movieGridEl) {
  movieGridEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".icon-btn");
    if (!btn) return;
    e.stopPropagation();
    btn.classList.toggle("active");
  });
}

// --- AI MODE TOGGLE & SEARCH BAR GLOW ---
const aiModeBtn = document.querySelector(".ai-mode-btn");
const searchContainer = document.querySelector(".search-container");
const searchInput = document.getElementById("movieSearch");

if (aiModeBtn && searchContainer && searchInput) {
  aiModeBtn.addEventListener("click", () => {
    aiModeBtn.classList.toggle("pressed");
    searchContainer.classList.toggle("ai-glow");
    if (aiModeBtn.classList.contains("pressed")) {
      searchInput.placeholder = "Search movies with AI...";
    } else {
      searchInput.placeholder = "Search movies...";
    }
  });
}

// --- LIVE SEARCH LOGIC (DOM Filtering) ---
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

// --- SURPRISE ME RANDOMIZER & DUAL DICE ANIMATION ---
document.addEventListener('DOMContentLoaded', () => {
    const surpriseBtn = document.getElementById('surpriseMeBtn');
    const diceOne = document.getElementById('diceOne');
    const diceTwo = document.getElementById('diceTwo');
    const movieSearchInput = document.getElementById('movieSearch');
    let lastRandomIndex = -1; // Remembers the last movie picked

    if (surpriseBtn) {
        surpriseBtn.addEventListener('click', (e) => {
            e.preventDefault();

            // --- 1. FIRE THE DUAL ANIMATION ---
            if (diceOne && diceTwo) {
                // Strip the animation classes
                diceOne.classList.remove('roll-left');
                diceTwo.classList.remove('roll-right');

                // The magic reflow trick to reset the animation
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
                    const randomTitle = titlePills[randomIndex].textContent.trim();
                    
                    movieSearchInput.value = randomTitle;
                    movieSearchInput.dispatchEvent(new Event("input", { bubbles: true }));
                }
            }
        });
    }
});