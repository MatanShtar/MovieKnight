// ==========================================
// 2. GENERIC UI BUILDERS (GENRES & PROVIDERS)
// ==========================================

// DUMMY DATA: Replace this later with a fetch from your movies.json
const dataConfig = {
    genres: [
        { name: "Action", available: true },
        { name: "Comedy", available: true },
        { name: "Drama", available: true },
        { name: "Horror", available: true },
        { name: "Sci-Fi", available: true },
        { name: "Fantasy", available: true },
        { name: "Thriller", available: true },
        { name: "Romance", available: true },
        { name: "Documentary", available: true }, 
        { name: "Animation", available: true },
        { name: "Adventure", available: true },
        { name: "Crime", available: true },
        { name: "Family", available: true },
        { name: "Western", available: true },
        { name: "Mystery", available: true }      
    ],
    // Providers you want to display
    providers: [   
        { name: "Netflix", logo: "assets/images/icons/netflix-icon.svg" },
        { name: "Amazon Prime Video", logo: "assets/images/icons/amazon-icon.svg" },
        { name: "Disney+", logo: "assets/images/icons/disney-icon.svg" },
        { name: "Apple TV", logo: "assets/images/icons/apple-icon.svg" },
        { name: "Paramount+", logo: "assets/images/icons/paramount-icon.svg" },
        { name: "HBO Max", logo: "assets/images/icons/hbo-icon.svg" },
        { name: "Hulu", logo: "assets/images/icons/hulu-icon.svg" }
    ]
};

document.addEventListener('DOMContentLoaded', () => {
    
    // --- A. Render Genres ---
    const genreGrid = document.getElementById('genreGrid');
    if (genreGrid) {
        // Generate the HTML. We ALWAYS put a "+" inside the icon now. CSS handles the rotation to "x".
        genreGrid.innerHTML = dataConfig.genres.map(genre => {
            const cssClass = genre.available ? "genre-btn" : "genre-btn dashed";
            return `
                <div class="${cssClass}">
                    ${genre.name}
                    <div class="genre-icon">
                        <img src="assets/images/icons/genre-x-icon.svg" alt="toggle">
                    </div>
                </div>
            `;
        }).join("");
        // Generic toggle logic: Just toggle the class. The CSS handles the rotation and color fading!
        genreGrid.querySelectorAll('.genre-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                this.classList.toggle('dashed');
            });
        });
    }

    // --- B. Render Providers ---
    const providerList = document.getElementById('providerList');
    const providerSearch = document.getElementById('providerSearch');

    if (providerList) {
        // Build the HTML list
        providerList.innerHTML = dataConfig.providers.map((p, index) => `
            <label class="provider-item">
                <img src="${p.logo}" alt="${p.name}" class="provider-logo" onerror="this.style.display='none'">
                <span class="provider-name">${p.name}</span>
                <input type="checkbox" class="provider-checkbox" id="prov_${index}">
                <div class="custom-check"></div>
            </label>
        `).join("");

        // Generic Live Search Logic
        if (providerSearch) {
            providerSearch.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase();
                const items = providerList.querySelectorAll('.provider-item');
                
                items.forEach(item => {
                    const name = item.querySelector('.provider-name').textContent.toLowerCase();
                    // Show if it matches, hide if it doesn't
                    item.style.display = name.includes(searchTerm) ? "flex" : "none";
                });
            });
        }
    }
});