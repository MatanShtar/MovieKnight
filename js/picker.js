// ==========================================
// 2. GENERIC UI BUILDERS (GENRES & PROVIDERS)
// ==========================================

// FALLBACK DATA: used only if the backend's /genres or /providers calls fail,
// so the picker still renders something offline. Live data comes from MovieAPI.
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
        renderGenres(dataConfig.genres); // show fallback immediately
        // Then replace with live genres from the backend when they arrive.
        MovieAPI.getGenres()
            .then(genres => {
                if (genres.length) {
                    renderGenres(genres.map(g => ({ name: g.name, available: true })));
                }
            })
            .catch(err => console.error("Could not load genres:", err));
    }

    function renderGenres(genres) {
        // Generate the HTML. We ALWAYS put a "+" inside the icon now. CSS handles the rotation to "x".
        genreGrid.innerHTML = genres.map(genre => {
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
        renderProviders(dataConfig.providers); // show fallback immediately
        // Then replace with live watch providers from the backend.
        MovieAPI.getProviders()
            .then(providers => {
                if (providers.length) renderProviders(providers);
            })
            .catch(err => console.error("Could not load providers:", err));

        // Generic Live Search Logic (attached once; it reads the list live).
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

    function renderProviders(providers) {
        // Build the HTML list
        providerList.innerHTML = providers.map((p, index) => `
            <label class="provider-item">
                <img src="${p.logo}" alt="${p.name}" class="provider-logo" onerror="this.style.display='none'">
                <span class="provider-name">${p.name}</span>
                <input type="checkbox" class="provider-checkbox" id="prov_${index}">
                <div class="custom-check"></div>
            </label>
        `).join("");
    }

    // --- C. Tab switching: show the panel for the clicked game option. ---
    const pickerTabs = document.getElementById('pickerTabs');
    const panels = document.querySelectorAll('.picker-panel');

    if (pickerTabs) {
        pickerTabs.addEventListener('click', (e) => {
            const tab = e.target.closest('.tab-btn');
            if (!tab) return;

            pickerTabs.querySelectorAll('.tab-btn')
                .forEach(t => t.classList.toggle('active', t === tab));
            panels.forEach(p =>
                p.classList.toggle('active', p.dataset.panel === tab.dataset.panel));
        });
    }

    // --- D. Generate Wheel: collapse the other two options so "Spin the Wheel"
    //        stretches to fill the bar, then navigate to wheel.html. ---
    const generateBtn = document.getElementById('generateBtn');

    if (generateBtn) {
        generateBtn.addEventListener('click', () => {
            if (pickerTabs) pickerTabs.classList.add('collapsing');

            let navigated = false;
            const go = () => {
                if (navigated) return;
                navigated = true;
                window.location.href = 'wheel.html';
            };
            // Navigate once the tabs finish collapsing (with a safety fallback).
            if (pickerTabs) {
                pickerTabs.addEventListener('transitionend', (e) => {
                    if (e.propertyName === 'flex-grow' || e.propertyName === 'flex-basis') go();
                });
            }
            setTimeout(go, 650);
        });
    }

    // --- E. AI suggestion-count stepper (placeholder control). ---
    const stepper = document.getElementById('suggestionStepper');
    if (stepper) {
        stepper.addEventListener('click', (e) => {
            const step = e.target.closest('.step');
            if (!step) return;
            stepper.querySelectorAll('.step')
                .forEach(s => s.classList.toggle('active', s === step));
        });
    }

    // --- F. AI "Send": no LLM yet, so just acknowledge it's coming. ---
    const aiSendBtn = document.getElementById('aiSendBtn');
    if (aiSendBtn) {
        aiSendBtn.addEventListener('click', () => {
            if (window.toast) toast.soon('AI picks — Coming Soon!');
        });
    }
});