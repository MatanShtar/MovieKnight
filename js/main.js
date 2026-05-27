// 1. Grab the button and the menu from the HTML
const filterBtn = document.getElementById('filterToggleBtn');
const filterMenu = document.getElementById('filterMenu');

filterBtn.addEventListener('click', function(event) {
    filterMenu.classList.toggle('show');
    event.stopPropagation(); 
});

document.addEventListener('click', function(event) {
    if (!filterMenu.contains(event.target) && !filterBtn.contains(event.target)) {
        filterMenu.classList.remove('show');
    }
});

// --- YEAR FILTERS ---
const fromYearDropdown = document.getElementById('fromYear');
const tillYearDropdown = document.getElementById('tillYear');
const currentYear = new Date().getFullYear();
const oldestYear = 1900; 

const fromYearSelect = document.getElementById('fromYear');
const tillYearSelect = document.getElementById('tillYear');
const MIN_YEAR = 1900;
const MAX_YEAR = 2026;

function populateDropdown(selectElement, startYear, endYear, currentValue) {
    selectElement.innerHTML = '';
    selectElement.add(new Option("Any", "Any"));
    for (let y = endYear; y >= startYear; y--) {
        selectElement.add(new Option(y, y));
    }
    if (currentValue !== "Any" && currentValue >= startYear && currentValue <= endYear) {
        selectElement.value = currentValue;
    } else {
        selectElement.value = "Any";
    }
}

function handleFromChange() {
    const fromVal = fromYearSelect.value;
    const currentTill = tillYearSelect.value;
    const allowedMin = fromVal === "Any" ? MIN_YEAR : parseInt(fromVal);
    populateDropdown(tillYearSelect, allowedMin, MAX_YEAR, currentTill);
}

function handleTillChange() {
    const tillVal = tillYearSelect.value;
    const currentFrom = fromYearSelect.value;
    const allowedMax = tillVal === "Any" ? MAX_YEAR : parseInt(tillVal);
    populateDropdown(fromYearSelect, MIN_YEAR, allowedMax, currentFrom);
}

if (fromYearSelect && tillYearSelect) {
    fromYearSelect.addEventListener('change', handleFromChange);
    tillYearSelect.addEventListener('change', handleTillChange);
    populateDropdown(fromYearSelect, MIN_YEAR, MAX_YEAR, "Any");
    populateDropdown(tillYearSelect, MIN_YEAR, MAX_YEAR, "Any");
}

// --- GENRES ---
const allGenres = ["Action", "Comedy", "Crime", "Drama", "Horror", "Sci-Fi", "Thriller"];
let activeGenres = []; 

const genreList = document.getElementById('movieGenreList');
const genreDropdown = document.getElementById('movieGenreDropdown');
const addBtn = document.getElementById('addGenreBtn');
const clearGenreBtn = document.getElementById('clearGenreBtn'); // NEW

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
    
    // NEW: Logic to show/hide Clear and + buttons
    if (clearGenreBtn) clearGenreBtn.style.display = activeGenres.length > 0 ? 'block' : 'none';
    if (addBtn) addBtn.style.display = activeGenres.length === allGenres.length ? 'none' : 'flex';
    
    // NEW: Bug Fix - force dropdown to close when manipulating pills
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

if(addBtn) {
    addBtn.onclick = (e) => {
        e.stopPropagation();
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

document.addEventListener('click', () => {
    genreDropdown.classList.remove('show');
});

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
const clearActorBtn = document.getElementById('clearActorBtn'); // NEW

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
        actorDropdown.classList.toggle('show');
    };
    document.addEventListener('click', () => actorDropdown.classList.remove('show'));
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
const clearDirectorBtn = document.getElementById('clearDirectorBtn'); // NEW

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
    if (addDirectorBtn) addDirectorBtn.style.display = activeDirector ? 'none' : 'flex'; // Hides + when a director is picked
    directorDropdown.classList.remove('show');
}

function renderDirectorDropdown() {
    directorDropdown.innerHTML = '';
    
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
        directorDropdown.classList.toggle('show');
    };
    document.addEventListener('click', () => directorDropdown.classList.remove('show'));
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


// --- PLATFORMS ---
const allPlatforms = ["Netflix", "Hulu", "Max", "Disney+", "Amazon Prime", "Apple TV+"];
let activePlatforms = [];

const platformList = document.getElementById('platformList');
const platformDropdown = document.getElementById('platformDropdown');
const addPlatformBtn = document.getElementById('addPlatformBtn');
const clearPlatformBtn = document.getElementById('clearPlatformBtn'); // NEW

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
        platformDropdown.classList.toggle('show');
    };
    document.addEventListener('click', () => platformDropdown.classList.remove('show'));
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