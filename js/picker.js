// ==========================================
// 2. GENERIC UI BUILDERS (GENRES & PROVIDERS)
// ==========================================

// FALLBACK DATA: used only if the backend's /genres or /providers calls fail,
// so the picker still renders something offline. Live data comes from MovieAPI.
const dataConfig = {
    genres: [
        { id: 28, name: "Action", available: true },
        { id: 35, name: "Comedy", available: true },
        { id: 18, name: "Drama", available: true },
        { id: 27, name: "Horror", available: true },
        { id: 878, name: "Sci-Fi", available: true },
        { id: 14, name: "Fantasy", available: true },
        { id: 53, name: "Thriller", available: true },
        { id: 10749, name: "Romance", available: true },
        { id: 99, name: "Documentary", available: true },
        { id: 16, name: "Animation", available: true },
        { id: 12, name: "Adventure", available: true },
        { id: 80, name: "Crime", available: true },
        { id: 10751, name: "Family", available: true },
        { id: 37, name: "Western", available: true },
        { id: 9648, name: "Mystery", available: true }
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

    // Resolved up-front: refreshGenerateState() runs while genres render (below),
    // which is before section D — so this must exist before then (no TDZ).
    const generateBtn = document.getElementById('generateBtn');

    // --- A. Render Genres ---
    // A genre is "selected" when its button is NOT dashed. We need at least one
    // genre selected at all times, so unchecking the very last one is blocked.
    const genreGrid = document.getElementById('genreGrid');

    function activeGenreButtons() {
        if (!genreGrid) return [];
        return [...genreGrid.querySelectorAll('.genre-btn:not(.dashed)')];
    }

    // The genre ids currently selected (only live/backend genres carry ids;
    // fallback ids are best-effort so offline still behaves sensibly).
    function activeGenreIds() {
        return activeGenreButtons()
            .map((btn) => Number(btn.dataset.genreId))
            .filter((id) => !Number.isNaN(id) && id > 0);
    }

    // Faithful to the requirement: when a genre is switched off, hide any movie
    // elements on the page tagged with that genre id. The picker itself shows no
    // movie list, so this is a no-op here, but it correctly drives any movie grid
    // that opts in via data-genre-ids (kept generic on purpose).
    function applyGenreVisibility(genreId, hidden) {
        document
            .querySelectorAll(`[data-genre-ids~="${genreId}"]`)
            .forEach((el) => {
                el.style.display = hidden ? "none" : "";
            });
    }

    if (genreGrid) {
        renderGenres(dataConfig.genres); // show fallback immediately
        // Then replace with live genres from the backend when they arrive.
        MovieAPI.getGenres()
            .then(genres => {
                if (genres.length) {
                    renderGenres(genres.map(g => ({ id: g.id, name: g.name, available: true })));
                }
            })
            .catch(err => console.error("Could not load genres:", err));
    }

    function renderGenres(genres) {
        // We ALWAYS put a "+" inside the icon; CSS rotates it to an "x" when dashed.
        genreGrid.innerHTML = genres.map(genre => {
            const cssClass = genre.available ? "genre-btn" : "genre-btn dashed";
            const idAttr = genre.id ? ` data-genre-id="${genre.id}"` : "";
            return `
                <div class="${cssClass}"${idAttr} data-genre-name="${genre.name}">
                    ${genre.name}
                    <div class="genre-icon">
                        <img src="assets/images/icons/genre-x-icon.svg" alt="toggle">
                    </div>
                </div>
            `;
        }).join("");

        genreGrid.querySelectorAll('.genre-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                const isCurrentlyActive = !this.classList.contains('dashed');
                // Block unchecking the last remaining active genre.
                if (isCurrentlyActive && activeGenreButtons().length <= 1) {
                    if (window.toast) toast.info("Keep at least one genre selected.");
                    return;
                }
                this.classList.toggle('dashed');
                const nowHidden = this.classList.contains('dashed');
                const id = Number(this.dataset.genreId);
                if (id) applyGenreVisibility(id, nowHidden);
                refreshGenerateState();
            });
        });

        refreshGenerateState();
    }

    // --- B. Render Providers ---
    const providerList = document.getElementById('providerList');
    const providerSearch = document.getElementById('providerSearch');
    const providerSelectionLabel = document.getElementById('providerSelection');
    const providerSelectionTooltip = document.getElementById('providerSelectionTooltip');
    const clearProvidersBtn = document.getElementById('clearProvidersBtn');

    // Reflect the provider selection in the heading. With nothing checked the
    // filter means "any provider", so the UI says exactly that.
    function refreshProviderSelectionLabel() {
        if (!providerSelectionLabel || !providerList) return;
        const checked = [...providerList.querySelectorAll('.provider-checkbox:checked')]
            .map((cb) => cb.closest('.provider-item')?.querySelector('.provider-name')?.textContent)
            .filter(Boolean);
        const text = checked.length ? checked.join(", ") : "Any";
        providerSelectionLabel.textContent = text;
        // The chip ellipsis-truncates a long list; the tooltip shows it all on hover.
        if (providerSelectionTooltip) {
            providerSelectionTooltip.textContent = checked.length
                ? `Selected: ${text}`
                : "Any provider";
        }
        // "Clear" only makes sense when at least one provider is picked.
        if (clearProvidersBtn) clearProvidersBtn.hidden = checked.length === 0;
    }

    // Reset the provider filter back to "Any": uncheck everything, clear the
    // search box, and re-show every provider row.
    if (clearProvidersBtn && providerList) {
        clearProvidersBtn.addEventListener('click', () => {
            providerList.querySelectorAll('.provider-checkbox:checked')
                .forEach((cb) => { cb.checked = false; });
            if (providerSearch) providerSearch.value = "";
            providerList.querySelectorAll('.provider-item')
                .forEach((item) => { item.style.display = "flex"; });
            refreshProviderSelectionLabel();
        });
    }

    if (providerList) {
        renderProviders(dataConfig.providers); // show fallback immediately
        // Then replace with live watch providers from the backend.
        MovieAPI.getProviders()
            .then(providers => {
                if (providers.length) renderProviders(providers);
            })
            .catch(err => console.error("Could not load providers:", err));

        // Keep the "Any" / selected label in sync as providers are toggled.
        providerList.addEventListener('change', (e) => {
            if (e.target.classList.contains('provider-checkbox')) {
                refreshProviderSelectionLabel();
            }
        });

        // Generic Live Search Logic (attached once; it reads the list live).
        if (providerSearch) {
            providerSearch.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase();
                const items = providerList.querySelectorAll('.provider-item');

                items.forEach(item => {
                    const name = item.querySelector('.provider-name').textContent.toLowerCase();
                    item.style.display = name.includes(searchTerm) ? "flex" : "none";
                });
            });
        }
    }

    function renderProviders(providers) {
        providerList.innerHTML = providers.map((p, index) => `
            <label class="provider-item">
                <img src="${p.logo}" alt="${p.name}" class="provider-logo" onerror="this.style.display='none'">
                <span class="provider-name">${p.name}</span>
                <input type="checkbox" class="provider-checkbox" id="prov_${index}"${p.id ? ` data-provider-id="${p.id}"` : ""}>
                <div class="custom-check"></div>
            </label>
        `).join("");
        refreshProviderSelectionLabel();
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

    // --- D. Generate Wheel: validate, then collapse the other two options so
    //        "Spin the Wheel" stretches to fill the bar, then go to wheel.html. ---

    // Edge-case safeguard: a wheel needs at least one genre to draw from. If the
    // selection can't produce a usable wheel, the button is greyed out + inert.
    function refreshGenerateState() {
        if (!generateBtn) return;
        const tooFew = activeGenreButtons().length < 1;
        generateBtn.disabled = tooFew;
        generateBtn.classList.toggle('generate-wheel-btn--disabled', tooFew);
    }

    if (generateBtn) {
        generateBtn.addEventListener('click', () => {
            if (generateBtn.disabled || activeGenreButtons().length < 1) {
                if (window.toast) toast.error("Pick at least one genre to build a wheel.");
                return;
            }

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
