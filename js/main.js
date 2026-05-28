// --- GLOBAL MENU MANAGEMENT ---
const filterBtn = document.getElementById('filterToggleBtn');
const filterMenu = document.getElementById('filterMenu');
const sortCustomBtn = document.getElementById('sortCustomBtn');
const sortCustomMenu = document.getElementById('sortCustomMenu');

// This function guarantees only one inner pill-dropdown is open at a time
function closeAllInnerDropdowns(exceptMenu = null) {
    document.querySelectorAll('.pill-dropdown').forEach(menu => {
        if (menu !== exceptMenu) menu.classList.remove('show');
    });
}

// Main Filter Menu Toggle (Closes Sort By)
if (filterBtn && filterMenu) {
    filterBtn.addEventListener('click', function(event) {
        event.stopPropagation();
        if (sortCustomMenu) sortCustomMenu.classList.remove('show');
        filterMenu.classList.toggle('show');
    });
}

// Main Sort By Toggle (Closes Filter Menu)
if (sortCustomBtn && sortCustomMenu) {
    sortCustomBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (filterMenu) filterMenu.classList.remove('show');
        sortCustomMenu.classList.toggle('show');
    });
}

// Close everything if clicking off-screen
document.addEventListener('click', function(event) {
    if (filterMenu && !filterMenu.contains(event.target) && !filterBtn.contains(event.target)) {
        filterMenu.classList.remove('show');
    }
    if (sortCustomMenu && !sortCustomMenu.contains(event.target) && !sortCustomBtn.contains(event.target)) {
        sortCustomMenu.classList.remove('show');
    }
    closeAllInnerDropdowns();
});


// --- INVISIBLE KEYBOARD TYPING LOGIC ---
let searchTimeout;
let typeString = "";

document.addEventListener('keydown', (e) => {
    // 1. Check if a dropdown is currently open
    const openMenu = document.querySelector('.pill-dropdown.show, .sort-custom-menu.show');
    if (!openMenu) return;

    // 2. Ignore if the user is typing in a real search bar
    if (e.target.tagName === 'INPUT') return;

    // 3. Only accept single character letters/numbers
    if (e.key.length === 1) {
        typeString += e.key.toLowerCase();
        
        // Reset the typing string after 0.8 seconds of no typing
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => { typeString = ""; }, 800);

        // Find the matching option
        const options = Array.from(openMenu.querySelectorAll('.pill-option, .sort-option'));
        const match = options.find(opt => opt.textContent.toLowerCase().startsWith(typeString));

        if (match) {
            // Scroll to it and flash the background so the user sees it
            match.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            const originalBg = match.style.backgroundColor;
            match.style.backgroundColor = 'rgba(255, 136, 179, 0.4)';
            setTimeout(() => { match.style.backgroundColor = originalBg; }, 300);
        }
    }
});


// --- HELPER: INJECT SEARCH BARS ---
function injectSearchBar(dropdownElement) {
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'dropdown-search';
    searchInput.placeholder = 'Search...';
    
    // Stop the menu from closing when clicking the input
    searchInput.onclick = (e) => e.stopPropagation(); 
    // Stop invisible typing from activating while using this bar
    searchInput.onkeydown = (e) => e.stopPropagation(); 
    
    // Live filter logic
    searchInput.oninput = (e) => {
        const term = e.target.value.toLowerCase();
        dropdownElement.querySelectorAll('.pill-option').forEach(opt => {
            opt.style.display = opt.textContent.toLowerCase().includes(term) ? 'block' : 'none';
        });
    };
    dropdownElement.appendChild(searchInput);
}


// --- CUSTOM YEAR DROPDOWNS ---
const fromYearBtn = document.getElementById('fromYearBtn');
const tillYearBtn = document.getElementById('tillYearBtn');
const fromYearMenu = document.getElementById('fromYearMenu');
const tillYearMenu = document.getElementById('tillYearMenu');

let currentFromYear = "Any";
let currentTillYear = "Any";
const MIN_YEAR = 1900;
const MAX_YEAR = 2026;

function populateYearMenu(menuElement, btnElement, startYear, endYear, isFrom) {
    if (!menuElement) return;
    menuElement.innerHTML = ''; 

    let anyOpt = document.createElement('div');
    anyOpt.className = 'pill-option';
    anyOpt.textContent = 'Any';
    anyOpt.onclick = (e) => {
        e.stopPropagation();
        if (isFrom) { currentFromYear = "Any"; } else { currentTillYear = "Any"; }
        btnElement.textContent = 'Any';
        menuElement.classList.remove('show');
        updateYearConstraints();
    };
    menuElement.appendChild(anyOpt);

    for (let y = endYear; y >= startYear; y--) {
        let opt = document.createElement('div');
        opt.className = 'pill-option';
        opt.textContent = y;
        opt.onclick = (e) => {
            e.stopPropagation();
            if (isFrom) { currentFromYear = y; } else { currentTillYear = y; }
            btnElement.textContent = y;
            menuElement.classList.remove('show');
            updateYearConstraints();
        };
        menuElement.appendChild(opt);
    }
}

function updateYearConstraints() {
    const allowedMin = currentFromYear === "Any" ? MIN_YEAR : parseInt(currentFromYear);
    const allowedMax = currentTillYear === "Any" ? MAX_YEAR : parseInt(currentTillYear);
    populateYearMenu(tillYearMenu, tillYearBtn, allowedMin, MAX_YEAR, false);
    populateYearMenu(fromYearMenu, fromYearBtn, MIN_YEAR, allowedMax, true);
}

if (fromYearBtn && tillYearBtn) {
    fromYearBtn.onclick = (e) => { 
        e.stopPropagation(); 
        closeAllInnerDropdowns(fromYearMenu);
        fromYearMenu.classList.toggle('show'); 
    };
    tillYearBtn.onclick = (e) => { 
        e.stopPropagation(); 
        closeAllInnerDropdowns(tillYearMenu);
        tillYearMenu.classList.toggle('show'); 
    };
    updateYearConstraints(); 
}


// --- GENRES ---
const allGenres = ["Action", "Comedy", "Crime", "Drama", "Horror", "Sci-Fi", "Thriller"];
let activeGenres = []; 

const genreList = document.getElementById('movieGenreList');
const genreDropdown = document.getElementById('movieGenreDropdown');
const addGenreBtn = document.getElementById('addGenreBtn');
const clearGenreBtn = document.getElementById('clearGenreBtn'); 

function renderTags() {
    genreList.innerHTML = ''; 
    activeGenres.slice(0, 2).forEach(genre => {
        const pill = document.createElement('div');
        pill.className = 'pill-item';
        pill.innerHTML = `${genre} <span class="pill-remove">×</span>`;
        pill.querySelector('.pill-remove').onclick = (e) => { 
            e.stopPropagation();
            activeGenres = activeGenres.filter(i => i !== genre);
            renderTags();
            renderDropdown();
        };
        genreList.appendChild(pill);
    });

    if (activeGenres.length > 2) {
        const hiddenGenres = activeGenres.slice(2);
        const overflow = document.createElement('div');
        overflow.className = 'pill-overflow';
        overflow.innerHTML = `... <div class="pill-tooltip">${hiddenGenres.join(', ')}</div>`; 
        genreList.appendChild(overflow);
    }
    
    if (clearGenreBtn) clearGenreBtn.style.display = activeGenres.length > 0 ? 'block' : 'none';
    if (addGenreBtn) addGenreBtn.style.display = activeGenres.length === allGenres.length ? 'none' : 'flex';
    genreDropdown.classList.remove('show');
}

function renderDropdown() {
    genreDropdown.innerHTML = '';

    allGenres.filter(g => !activeGenres.includes(g)).forEach(genre => {
        const opt = document.createElement('div');
        opt.className = 'pill-option';
        opt.textContent = genre;
        opt.onclick = (e) => {
            e.stopPropagation();
            activeGenres.unshift(genre); 
            renderTags();
            renderDropdown();
            genreDropdown.classList.remove('show');
        };
        genreDropdown.appendChild(opt);
    });
}

if(addGenreBtn) {
    addGenreBtn.onclick = (e) => {
        e.stopPropagation();
        closeAllInnerDropdowns(genreDropdown);
        genreDropdown.classList.toggle('show');
    };
}
if(clearGenreBtn) {
    clearGenreBtn.onclick = (e) => {
        e.stopPropagation();
        activeGenres = [];
        renderTags();
        renderDropdown();
    };
}
renderTags();
renderDropdown();


// --- RATING STARS ---
const BLANK_STAR_PATH = 'assets/images/empty-star-icon.svg'; 
const FILLED_STAR_PATH = 'assets/images/ratings-star.svg';

const starContainer = document.getElementById('starRatingContainer');
const stars = document.querySelectorAll('.star');
let currentRating = 0; 

if(starContainer) {
    starContainer.addEventListener('mouseover', (e) => {
        if (e.target.classList.contains('star')) {
            const hoverValue = parseInt(e.target.getAttribute('data-value'));
            stars.forEach(s => {
                const starValue = parseInt(s.getAttribute('data-value'));
                s.src = starValue <= hoverValue ? FILLED_STAR_PATH : BLANK_STAR_PATH;
            });
        }
    });
    starContainer.addEventListener('mouseleave', () => {
        stars.forEach(s => {
            const starValue = parseInt(s.getAttribute('data-value'));
            s.src = starValue <= currentRating ? FILLED_STAR_PATH : BLANK_STAR_PATH;
        });
    });
    stars.forEach(star => {
        star.addEventListener('click', (e) => {
            currentRating = parseInt(e.target.getAttribute('data-value'));
            stars.forEach(s => {
                const starValue = parseInt(s.getAttribute('data-value'));
                s.src = starValue <= currentRating ? FILLED_STAR_PATH : BLANK_STAR_PATH;
            });
        });
    });
}


// --- ACTORS ---
const allActors = ["Leonardo DiCaprio", "Brad Pitt", "Margot Robbie", "Denzel Washington", "Meryl Streep", "Christian Bale", "Tom Hanks"];
let activeActors = [];

const actorList = document.getElementById('actorList');
const actorDropdown = document.getElementById('actorDropdown');
const addActorBtn = document.getElementById('addActorBtn');
const clearActorBtn = document.getElementById('clearActorBtn'); 

function renderActors() {
    actorList.innerHTML = '';
    activeActors.slice(0, 1).forEach(actor => {
        const pill = document.createElement('div');
        pill.className = 'pill-item'; 
        pill.innerHTML = `${actor} <span class="pill-remove">×</span>`; 
        pill.querySelector('.pill-remove').onclick = (e) => { 
            e.stopPropagation();
            activeActors = activeActors.filter(i => i !== actor);
            renderActors();
            renderActorDropdown();
        };
        actorList.appendChild(pill);
    });

    if (activeActors.length > 1) {
        const hidden = activeActors.slice(1);
        const overflow = document.createElement('div');
        overflow.className = 'pill-overflow';
        overflow.innerHTML = `... <div class="pill-tooltip">${hidden.join(', ')}</div>`; 
        actorList.appendChild(overflow);
    }
    
    if (clearActorBtn) clearActorBtn.style.display = activeActors.length > 0 ? 'block' : 'none';
    if (addActorBtn) addActorBtn.style.display = activeActors.length === allActors.length ? 'none' : 'flex';
    actorDropdown.classList.remove('show');
}

function renderActorDropdown() {
    actorDropdown.innerHTML = '';
    injectSearchBar(actorDropdown); 

    allActors.filter(a => !activeActors.includes(a)).forEach(actor => {
        const opt = document.createElement('div');
        opt.className = 'pill-option'; 
        opt.textContent = actor;
        opt.onclick = (e) => {
            e.stopPropagation();
            activeActors.unshift(actor); 
            renderActors();
            renderActorDropdown();
            actorDropdown.classList.remove('show');
        };
        actorDropdown.appendChild(opt);
    });
}

if(addActorBtn) {
    addActorBtn.onclick = (e) => {
        e.stopPropagation();
        closeAllInnerDropdowns(actorDropdown);
        actorDropdown.classList.toggle('show');
    };
}
if(clearActorBtn) {
    clearActorBtn.onclick = (e) => {
        e.stopPropagation();
        activeActors = [];
        renderActors();
        renderActorDropdown();
    };
}
renderActors();
renderActorDropdown();


// --- DIRECTORS ---
const allDirectors = ["Christopher Nolan", "Quentin Tarantino", "Martin Scorsese", "Steven Spielberg", "Greta Gerwig"];
let activeDirector = null; 

const directorList = document.getElementById('directorList');
const directorDropdown = document.getElementById('directorDropdown');
const addDirectorBtn = document.getElementById('addDirectorBtn');
const clearDirectorBtn = document.getElementById('clearDirectorBtn'); 

function renderDirector() {
    directorList.innerHTML = '';
    if (activeDirector) {
        const pill = document.createElement('div');
        pill.className = 'pill-item';
        pill.innerHTML = `${activeDirector} <span class="pill-remove">×</span>`; 
        pill.querySelector('.pill-remove').onclick = (e) => { 
            e.stopPropagation();
            activeDirector = null; 
            renderDirector();
            renderDirectorDropdown();
        };
        directorList.appendChild(pill);
    }
    
    if (clearDirectorBtn) clearDirectorBtn.style.display = activeDirector ? 'block' : 'none';
    if (addDirectorBtn) addDirectorBtn.style.display = activeDirector ? 'none' : 'flex'; 
    directorDropdown.classList.remove('show');
}

function renderDirectorDropdown() {
    directorDropdown.innerHTML = '';
    injectSearchBar(directorDropdown); 

    allDirectors.filter(d => d !== activeDirector).forEach(director => {
        const opt = document.createElement('div');
        opt.className = 'pill-option';
        opt.textContent = director;
        opt.onclick = (e) => {
            e.stopPropagation();
            activeDirector = director; 
            renderDirector();
            renderDirectorDropdown();
            directorDropdown.classList.remove('show');
        };
        directorDropdown.appendChild(opt);
    });
}

if(addDirectorBtn) {
    addDirectorBtn.onclick = (e) => {
        e.stopPropagation();
        closeAllInnerDropdowns(directorDropdown);
        directorDropdown.classList.toggle('show');
    };
}
if(clearDirectorBtn) {
    clearDirectorBtn.onclick = (e) => {
        e.stopPropagation();
        activeDirector = null;
        renderDirector();
        renderDirectorDropdown();
    };
}
renderDirector();
renderDirectorDropdown();


// --- AGE RATINGS ---
const allAgeRatings = ["Any", "G", "PG", "PG-13", "R", "NC-17"];
const ageRatingBtn = document.getElementById('ageRatingBtn');
const ageRatingMenu = document.getElementById('ageRatingMenu');

if (ageRatingBtn && ageRatingMenu) {
    allAgeRatings.forEach(age => {
        const opt = document.createElement('div');
        opt.className = 'pill-option'; 
        opt.textContent = age;
        opt.onclick = (e) => {
            e.stopPropagation();
            ageRatingBtn.textContent = age; 
            ageRatingMenu.classList.remove('show');
        };
        ageRatingMenu.appendChild(opt);
    });

    ageRatingBtn.onclick = (e) => {
        e.stopPropagation();
        closeAllInnerDropdowns(ageRatingMenu);
        ageRatingMenu.classList.toggle('show');
    };
}


// --- PLATFORMS ---
const allPlatforms = ["Netflix", "Hulu", "Max", "Disney+", "Amazon Prime", "Apple TV+"];
let activePlatforms = [];

const platformList = document.getElementById('platformList');
const platformDropdown = document.getElementById('platformDropdown');
const addPlatformBtn = document.getElementById('addPlatformBtn');
const clearPlatformBtn = document.getElementById('clearPlatformBtn'); 

function renderPlatforms() {
    platformList.innerHTML = '';
    activePlatforms.slice(0, 2).forEach(platform => {
        const pill = document.createElement('div');
        pill.className = 'pill-item';
        pill.innerHTML = `${platform} <span class="pill-remove">×</span>`; 
        pill.querySelector('.pill-remove').onclick = (e) => { 
            e.stopPropagation();
            activePlatforms = activePlatforms.filter(i => i !== platform);
            renderPlatforms();
            renderPlatformDropdown();
        };
        platformList.appendChild(pill);
    });

    if (activePlatforms.length > 2) {
        const hidden = activePlatforms.slice(2);
        const overflow = document.createElement('div');
        overflow.className = 'pill-overflow';
        overflow.innerHTML = `... <div class="pill-tooltip">${hidden.join(', ')}</div>`; 
        platformList.appendChild(overflow);
    }
    
    if (clearPlatformBtn) clearPlatformBtn.style.display = activePlatforms.length > 0 ? 'block' : 'none';
    if (addPlatformBtn) addPlatformBtn.style.display = activePlatforms.length === allPlatforms.length ? 'none' : 'flex';
    platformDropdown.classList.remove('show');
}

function renderPlatformDropdown() {
    platformDropdown.innerHTML = '';
    injectSearchBar(platformDropdown);
    
    allPlatforms.filter(p => !activePlatforms.includes(p)).forEach(platform => {
        const opt = document.createElement('div');
        opt.className = 'pill-option';
        opt.textContent = platform;
        opt.onclick = (e) => {
            e.stopPropagation();
            activePlatforms.unshift(platform); 
            renderPlatforms();
            renderPlatformDropdown();
            platformDropdown.classList.remove('show');
        };
        platformDropdown.appendChild(opt);
    });
}

if(addPlatformBtn) {
    addPlatformBtn.onclick = (e) => {
        e.stopPropagation();
        closeAllInnerDropdowns(platformDropdown);
        platformDropdown.classList.toggle('show');
    };
}
if(clearPlatformBtn) {
    clearPlatformBtn.onclick = (e) => {
        e.stopPropagation();
        activePlatforms = [];
        renderPlatforms();
        renderPlatformDropdown();
    };
}
renderPlatforms();
renderPlatformDropdown();


// --- SORT BY DROPDOWN LOGIC ---
const sortOptionsData = [
    { short: "Popular", long: "Popular This Week" },
    { short: "Rating ↑", long: "Rating (Worst to Best)" },
    { short: "Rating ↓", long: "Rating (Best to Worst)" },
    { short: "A ➔ Z", long: "Alphabetical (A-->Z)" },
    { short: "Z ➔ A", long: "Alphabetical (Z-->A)" },
    { short: "Newest", long: "Release Date (New to Old)" },
    { short: "Oldest", long: "Release Date (Old to New)" }
];

if(sortCustomBtn && sortCustomMenu) {
    const sortSelectedText = document.getElementById('sortSelectedText');
    sortOptionsData.forEach(option => {
        const div = document.createElement('div');
        div.className = 'sort-option';
        div.textContent = option.long; 
        if (option.short === sortSelectedText.textContent) div.classList.add('selected');
        
        div.onclick = (e) => {
            e.stopPropagation();
            sortSelectedText.textContent = option.short; 
            document.querySelectorAll('.sort-option').forEach(opt => opt.classList.remove('selected'));
            div.classList.add('selected');
            sortCustomMenu.classList.remove('show');
        };
        sortCustomMenu.appendChild(div);
    });
}


// --- MOVIE POSTER OVERLAY BUTTONS ---
document.querySelectorAll('.icon-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation(); 
        btn.classList.toggle('active'); 
    });
});


// --- AI MODE TOGGLE & SEARCH BAR GLOW ---
const aiModeBtn = document.querySelector('.ai-mode-btn');
const searchContainer = document.querySelector('.search-container');
const searchInput = document.getElementById('movieSearch');

if(aiModeBtn && searchContainer && searchInput) {
    aiModeBtn.addEventListener('click', () => {
        aiModeBtn.classList.toggle('pressed');
        searchContainer.classList.toggle('ai-glow');
        if (aiModeBtn.classList.contains('pressed')) {
            searchInput.placeholder = "Search movies with AI...";
        } else {
            searchInput.placeholder = "Search movies...";
        }
    });
}


// --- LIVE SEARCH LOGIC (DOM Filtering) ---
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.trim().toLowerCase();
        const movieCards = document.querySelectorAll('.movie-card');

        if (searchTerm.length >= 2) {
            movieCards.forEach(card => {
                const titleElement = card.querySelector('.movie-title-pill');
                const titleText = titleElement ? titleElement.textContent.toLowerCase() : '';
                card.style.display = titleText.includes(searchTerm) ? 'flex' : 'none'; 
            });
        } else {
            movieCards.forEach(card => card.style.display = 'flex');
        }
    });
}

// --- AUTHENTICATION & POST-LOGIN UI (Home Page) ---

const loginBtn = document.getElementById('loginBtn');
const userProfileDisplay = document.getElementById('userProfileDisplay');
const displayUsername = document.getElementById('displayUsername');
const sidebarSettings = document.getElementById('sidebarSettings');
const settingsToggleBtn = document.getElementById('settingsToggleBtn');
const settingsSubmenu = document.getElementById('settingsSubmenu');

// 1. Check LocalStorage for a logged-in user
const currentUser = JSON.parse(localStorage.getItem('currentUser'));

if (currentUser) {
    // User IS logged in: Swap UI
    if (loginBtn) loginBtn.style.display = 'none';
    if (userProfileDisplay) userProfileDisplay.style.display = 'flex';
    if (sidebarSettings) sidebarSettings.style.display = 'flex';
    if (displayUsername) displayUsername.textContent = currentUser.username;
    
    // Setup Settings Dropdown Toggle
    if (settingsToggleBtn && settingsSubmenu) {
        settingsToggleBtn.addEventListener('click', (e) => {
            e.preventDefault(); // Stops the page from jumping
            settingsSubmenu.classList.toggle('show');
        });
    }
} else {
    // User IS NOT logged in: Ensure default state
    if (loginBtn) loginBtn.style.display = 'flex';
    if (userProfileDisplay) userProfileDisplay.style.display = 'none';
    if (sidebarSettings) sidebarSettings.style.display = 'none';
}

// --- SURPRISE ME RANDOMIZER ---
const surpriseBtn = document.querySelector('.surprise-btn');
const movieSearchInput = document.getElementById('movieSearch');
let lastRandomIndex = -1; // This remembers the last movie picked

if (surpriseBtn && movieSearchInput) {
    surpriseBtn.addEventListener('click', () => {
        const titlePills = document.querySelectorAll('.movie-title-pill');
        
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
            movieSearchInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    });
}

// Unique variable names prevent 'already declared' crashes!
const toggleBtn_UI = document.getElementById('settingsToggleBtn');
const submenu_UI = document.getElementById('settingsSubmenu');
const container_UI = document.getElementById('sidebarSettings'); 

if (toggleBtn_UI && container_UI && submenu_UI) {
    toggleBtn_UI.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // This single toggle controls the background and the sliding animation
        container_UI.classList.toggle('open');
        
        // Rotate the arrow icon
        const arrow = toggleBtn_UI.querySelector('.settings-arrow');
        if (arrow) {
            arrow.style.transform = container_UI.classList.contains('open') ? 'rotate(180deg)' : 'rotate(0deg)';
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const headerProfileBtn = document.getElementById('headerProfileBtn');
    const headerDropdown = document.getElementById('headerDropdown');

    if (headerProfileBtn && headerDropdown) {
        // Toggle the menu when clicking the profile picture
        headerProfileBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation(); 
            headerDropdown.classList.toggle('show');
        });

        // Close the menu if you click anywhere else on the screen
        document.addEventListener('click', (e) => {
            if (!headerDropdown.contains(e.target) && e.target !== headerProfileBtn) {
                headerDropdown.classList.remove('show');
            }
        });
    }
});

// --- AUTHENTICATION STATE CHECK (Run this when index.html loads) ---
document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('loginBtn');
    const userProfileDisplay = document.getElementById('userProfileDisplay');
    const displayUsername = document.getElementById('displayUsername');

    // 1. Check the browser's memory for a logged-in user
    const savedUser = localStorage.getItem('movieKnightUser');

    if (savedUser && loginBtn && userProfileDisplay) {
        // --- LOGGED IN STATE ---
        // Hide the Login button, show the Profile display
        loginBtn.style.display = 'none';
        userProfileDisplay.style.display = 'flex';
        
        // Update the name dynamically
        if (displayUsername) {
            displayUsername.textContent = savedUser;
        }
    } else if (loginBtn && userProfileDisplay) {
        // --- GUEST STATE ---
        // Show the Login button, hide the Profile display
        loginBtn.style.display = 'flex'; // Or 'block', depending on your CSS
        userProfileDisplay.style.display = 'none';
    }
});