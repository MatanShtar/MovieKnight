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

const fromYearDropdown = document.getElementById('fromYear');
const tillYearDropdown = document.getElementById('tillYear');


const currentYear = new Date().getFullYear();
const oldestYear = 1900; 

// 3. Loop backwards from the current year down to the oldest year
for (let year = currentYear; year >= oldestYear; year--) {
    
    // Create an option for the "From" menu
    let fromOption = document.createElement('option');
    fromOption.value = year;
    fromOption.textContent = year;
    fromYearDropdown.appendChild(fromOption);
    
    // Create an exact copy of that option for the "Till" menu
    let tillOption = document.createElement('option');
    tillOption.value = year;
    tillOption.textContent = year;
    tillYearDropdown.appendChild(tillOption);
}

const allGenres = ["Action", "Comedy", "Crime", "Drama", "Horror", "Sci-Fi", "Thriller"];
let activeGenres = []; // This array acts as our state

// 2. Elements
const genreList = document.getElementById('movieGenreList');
const genreDropdown = document.getElementById('movieGenreDropdown');
const addBtn = document.getElementById('addGenreBtn');

// 3. Render Logic
function renderTags() {
    genreList.innerHTML = ''; // Wipe UI

    // A. Draw pills (LIFO: Newest first)
    // activeGenres is updated via unshift(), so slice(0, 2) is always the newest 2
    activeGenres.slice(0, 2).forEach(genre => {
        const pill = document.createElement('div');
        pill.className = 'movie-genre-pill';
        pill.innerHTML = `${genre} <span class="tag-remove" style="cursor:pointer">×</span>`;
        
        pill.querySelector('.tag-remove').onclick = (e) => {
            e.stopPropagation();
            activeGenres = activeGenres.filter(i => i !== genre);
            renderTags();
            renderDropdown();
        };
        genreList.appendChild(pill);
    });

    // B. Draw Dots (if we have more than 2)
    if (activeGenres.length > 2) {
        const hiddenGenres = activeGenres.slice(2);
        const overflow = document.createElement('div');
        overflow.className = 'movie-genre-overflow';
        // Add the tooltip as a child so hover works correctly
        overflow.innerHTML = `... <div class="movie-genre-tooltip">${hiddenGenres.join(', ')}</div>`;
        genreList.appendChild(overflow);
    }
}

// 4. Dropdown Logic
function renderDropdown() {
    genreDropdown.innerHTML = '';
    allGenres.filter(g => !activeGenres.includes(g)).forEach(genre => {
        const opt = document.createElement('div');
        opt.className = 'movie-genre-option';
        opt.textContent = genre;
        
        opt.onclick = (e) => {
            e.stopPropagation();
            // LIFO: Add to the FRONT of the array
            activeGenres.unshift(genre); 
            renderTags();
            renderDropdown();
            genreDropdown.classList.remove('show');
        };
        genreDropdown.appendChild(opt);
    });
}

// 5. Interactions
addBtn.onclick = (e) => {
    e.stopPropagation();
    genreDropdown.classList.toggle('show');
};

document.addEventListener('click', () => {
    genreDropdown.classList.remove('show');
});

// Initial Run
renderTags();
renderDropdown();