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
    const wheelError = document.getElementById('wheelError');

    // The collection this picker plays from — chosen on the collection page, which
    // links here as picker.html?collection=<id>. Null until it loads (or if the
    // page was opened without one), which keeps "Generate Wheel" disabled.
    let selectedCollection = null;
    let collectionError = "";   // why there's no collection (missing / load failed)

    // --- load the collection the user came here to play (no dropdown) ---
    if (window.ActiveCollection) {
        ActiveCollection.load()
            .then((collection) => {
                if (collection) selectedCollection = collection;
                else collectionError = "Open a collection to spin its wheel.";
                refreshGenerateState();
            })
            .catch((err) => {
                collectionError = err.message || "Couldn't load the collection.";
                if (window.toast) toast.error(collectionError);
                refreshGenerateState();
            });
    }

    // The genre ids currently switched ON (a non-dashed genre button).
    function activeGenreIds() {
        return activeGenreButtons()
            .map((b) => Number(b.dataset.genreId))
            .filter(Boolean);
    }

    // The genre NAMES currently switched ON (lower-cased). Our backend stores a
    // movie's genres as names, so name-matching is what actually filters.
    function activeGenreNames() {
        return activeGenreButtons()
            .map((b) => (b.dataset.genreName || "").toLowerCase())
            .filter(Boolean);
    }

    // The provider ids currently ticked. Read live from the DOM (the providerList
    // const is assigned later in section B, so we can't close over it here).
    function selectedProviderIds() {
        const list = document.getElementById('providerList');
        if (!list) return [];
        return [...list.querySelectorAll('.provider-checkbox:checked')]
            .map((cb) => Number(cb.dataset.providerId))
            .filter(Boolean);
    }

    // A movie passes the filters when at least one of its genres is still ON
    // (matched by id OR name, since a movie may carry either), and — if any
    // providers are ticked — it offers one of them. A movie that carries no
    // genre data at all is never excluded, so the wheel can't empty by accident.
    function movieMatchesFilters(m, genreIds, genreNames, providerIds) {
        const mgIds = m.genreIds || [];
        const mgNames = (m.genres || []).map((n) => String(n).toLowerCase());
        const hasGenreData = mgIds.length || mgNames.length;
        const okGenre =
            !hasGenreData ||
            (!genreIds.length && !genreNames.length) ||
            mgIds.some((id) => genreIds.includes(id)) ||
            mgNames.some((n) => genreNames.includes(n));

        // STRICT provider filter: with nothing selected, every movie passes; once
        // a provider is picked, a movie must list that provider to stay. Movies with
        // no provider data (not on a US streaming service, or added before the
        // backend began hydrating facets) are intentionally excluded — no safety net.
        const mp = m.providerIds || [];
        const okProvider =
            !providerIds.length || mp.some((id) => providerIds.includes(id));
        return okGenre && okProvider;
    }

    // The chosen collection's movies that survive the current genre/provider filter.
    function filteredWheelMovies() {
        if (!selectedCollection || !Array.isArray(selectedCollection.movies)) return [];
        const gids = activeGenreIds();
        const gnames = activeGenreNames();
        const pids = selectedProviderIds();
        return selectedCollection.movies.filter((m) =>
            movieMatchesFilters(m, gids, gnames, pids),
        );
    }

    // --- A. Render Genres ---
    // A genre is "selected" when its button is NOT dashed. We need at least one
    // genre selected at all times, so unchecking the very last one is blocked.
    const genreGrid = document.getElementById('genreGrid');

    function activeGenreButtons() {
        if (!genreGrid) return [];
        return [...genreGrid.querySelectorAll('.genre-btn:not(.dashed)')];
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
        // The chip itself is a read-only summary — not clickable.
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
            refreshGenerateState();
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

        // Keep the "Any" / selected label in sync as providers are toggled, and
        // re-validate the wheel (a provider filter can empty the chosen pool).
        providerList.addEventListener('change', (e) => {
            if (e.target.classList.contains('provider-checkbox')) {
                refreshProviderSelectionLabel();
                refreshGenerateState();
            }
        });

        // Generic Live Search Logic (attached once; it reads the list live).
        if (providerSearch) {
            providerSearch.addEventListener('input', (e) => {
                // Smart scroll: typing should bring the results back to the top.
                // The provider list is its own scroll container (overflow-y:auto),
                // so glide IT to the top — and the page too if it's scrolled.
                providerList.scrollTo({ top: 0, behavior: 'smooth' });
                if (window.scrollY > 0) {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
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
        // Preserve any providers the user has already ticked across a re-render.
        // The fallback list paints first, then the live list from the backend
        // replaces it — without this, that late swap rebuilds the checkboxes from
        // scratch and silently wipes the current selection (the summary "…" then
        // drops back to "Any"). Re-check by name after rebuilding.
        const checkedNames = new Set(
            [...providerList.querySelectorAll('.provider-checkbox:checked')]
                .map((cb) => cb.closest('.provider-item')?.querySelector('.provider-name')?.textContent)
                .filter(Boolean)
        );
        providerList.innerHTML = providers.map((p, index) => `
            <label class="provider-item">
                <img src="${p.logo}" alt="${p.name}" class="provider-logo" onerror="this.style.display='none'">
                <span class="provider-name">${p.name}</span>
                <input type="checkbox" class="provider-checkbox" id="prov_${index}"${p.id ? ` data-provider-id="${p.id}"` : ""}${checkedNames.has(p.name) ? " checked" : ""}>
                <div class="custom-check"></div>
            </label>
        `).join("");
        refreshProviderSelectionLabel();
    }

    // --- C. Tab switching: show the panel for the clicked game option. ---
    const pickerTabs = document.getElementById('pickerTabs');
    const panels = document.querySelectorAll('.picker-panel');

    function activatePanel(name) {
        const tab = pickerTabs?.querySelector(`.tab-btn[data-panel="${name}"]`);
        if (!tab) return;
        pickerTabs.querySelectorAll('.tab-btn')
            .forEach(t => t.classList.toggle('active', t === tab));
        panels.forEach(p =>
            p.classList.toggle('active', p.dataset.panel === name));
    }

    if (pickerTabs) {
        pickerTabs.addEventListener('click', (e) => {
            const tab = e.target.closest('.tab-btn');
            if (!tab) return;
            activatePanel(tab.dataset.panel);
        });

        // Deep-link to a specific game option, e.g. picker.html?panel=chopping
        const wanted = new URLSearchParams(location.search).get('panel');
        if (wanted) activatePanel(wanted);

        // Reset the tab bar on every (re)entry. When START / GENERATE / SEND run,
        // they add `.collapsing` to slide the two other options shut before
        // navigating away. Returning here — via Back or a game's "Play Again",
        // especially from the bfcache, which restores the DOM exactly as it was
        // left — would otherwise keep that class, leaving the bar stuck on the
        // last-played game with the other two collapsed. Strip it so all three
        // options are visible and clickable again, and re-assert the active panel.
        const resetTabs = () => {
            pickerTabs.classList.remove('collapsing');
            const panel = new URLSearchParams(location.search).get('panel');
            activatePanel(panel || 'wheel');
        };
        window.addEventListener('pageshow', resetTabs);
    }

    // --- D. Generate Wheel: validate, then collapse the other two options so
    //        "Spin the Wheel" stretches to fill the bar, then go to wheel.html. ---

    // Validate the wheel can actually be built and reflect why it can't in the
    // inline error above the button (and by dimming it). In order of precedence:
    // no collection chosen → no genres selected → nothing left after filtering.
    function refreshGenerateState() {
        if (!generateBtn) return;
        let invalid = false;
        let msg = "";

        if (!selectedCollection) {
            invalid = true;
            msg = collectionError; // "Open a collection…" / load error (empty while loading)
        } else if (activeGenreButtons().length < 1) {
            invalid = true;
            msg = "Select at least one genre.";
        } else if (filteredWheelMovies().length === 0) {
            invalid = true;
            msg = "No movies in this collection match your filters.";
        }

        if (wheelError) {
            wheelError.textContent = msg;
            wheelError.classList.toggle("show", !!msg);
        }
        generateBtn.disabled = invalid;
        generateBtn.classList.toggle('generate-wheel-btn--disabled', invalid);
    }

    if (generateBtn) {
        generateBtn.addEventListener('click', () => {
            if (generateBtn.disabled) {
                if (window.toast) toast.error("Pick a collection and at least one genre to build a wheel.");
                return;
            }
            const wheelMovies = filteredWheelMovies();
            if (!selectedCollection || !wheelMovies.length) {
                if (window.toast) toast.error("No movies match — adjust your filters.");
                return;
            }

            // Hand the already-filtered movie titles to wheel.html (matching the
            // sessionStorage hand-off the games use).
            sessionStorage.setItem('mk:wheelGame', JSON.stringify({
                movies: wheelMovies.map((m) => m.title),
            }));

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

    // --- E. AI suggestion-count slider — the SAME liquid 1/2/3 control the
    //        Chopping Block uses for "Eliminations Per Player", so the two read
    //        identically. It reuses chopping.css's .cb-slider styles and the
    //        #cb-goo gooey filter that chopping.js injects on this page (the
    //        Chopping setup panel lives here too). Mirrors chopping.js's
    //        renderSlider / positionSlider. ---
    const aiCountSlider = document.getElementById('aiCountSlider');
    let suggestionCount = 3; // default — matches the seeded "3"

    // Tapering chain of red blobs: a lead circle + trailing drops that lag slightly
    // so a value change stretches into a comet the goo filter fuses into one stream.
    const AI_BLOB_SIZES = [21, 19, 17, 15, 13, 11];

    function renderCountSlider() {
        if (!aiCountSlider) return;
        const blobs = AI_BLOB_SIZES.map((s, i) =>
            `<span class="cb-slider-blob" style="width:${s}px;height:${s}px;top:${(25 - s) / 2}px;transition-delay:${i * 0.018}s"></span>`
        ).join('');
        aiCountSlider.innerHTML = `
            <div class="cb-slider-track"></div>
            <div class="cb-slider-liquid">${blobs}</div>
            ${[1, 2, 3].map(v => `
                <button class="cb-slider-dot" data-value="${v}" aria-label="${v} suggestion${v === 1 ? '' : 's'}">
                    <span class="cb-slider-num">${v}</span>
                </button>
            `).join('')}
        `;
        positionCountSlider();
    }

    function positionCountSlider() {
        if (!aiCountSlider) return;
        const frac = (suggestionCount - 1) / 2;   // 0 | 0.5 | 1
        aiCountSlider.querySelectorAll('.cb-slider-dot').forEach(dot =>
            dot.classList.toggle('active', Number(dot.dataset.value) === suggestionCount));
        aiCountSlider.querySelectorAll('.cb-slider-blob').forEach(blob => {
            const s = parseFloat(blob.style.width); // keep every blob centred on the dot
            blob.style.left = `calc((100% - 25px) * ${frac} + ${(25 - s) / 2}px)`;
        });
    }

    if (aiCountSlider) {
        renderCountSlider();
        aiCountSlider.addEventListener('click', (e) => {
            const dot = e.target.closest('.cb-slider-dot');
            if (!dot) return;
            suggestionCount = Number(dot.dataset.value);
            positionCountSlider();
        });
    }

    // The suggestion count currently chosen on the slider (1–3, default 3).
    function selectedSuggestionCount() {
        return suggestionCount;
    }

    // --- F. AI "Send": hand the chosen collection + prompt + count to the
    //        AI Suggestions results page, collapsing the tabs first so the lone
    //        "LET AI CHOOSE" bar fills the width — the exact same "load" motion
    //        Generate Wheel uses before navigating to wheel.html. ---
    const aiSendBtn = document.getElementById('aiSendBtn');
    const aiPrompt = document.getElementById('aiPrompt');
    if (aiSendBtn) {
        aiSendBtn.addEventListener('click', () => {
            // The AI picker runs over the collection the user came here with —
            // same source as the wheel. Without one there's nothing to pick from.
            if (!selectedCollection) {
                if (window.toast) toast.error(collectionError || "Open a collection to let AI choose from it.");
                return;
            }

            // A prompt is required — don't navigate / "send" on an empty box.
            const promptText = aiPrompt ? aiPrompt.value.trim() : "";
            if (!promptText) {
                if (window.toast) toast.error("You must enter a prompt.");
                if (aiPrompt) aiPrompt.focus();
                return;
            }

            sessionStorage.setItem('mk:aiGame', JSON.stringify({
                collectionId: selectedCollection.id,
                collectionName: selectedCollection.name || "",
                prompt: promptText,
                count: selectedSuggestionCount(),
                // A fresh token per SEND: the results page generates new picks for a
                // new SEND, but reuses them when you navigate back (e.g. after Info).
                token: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            }));

            // Rewrite THIS picker entry to the AI tab before pushing the results
            // page. That way a later Back from the results (history.back) returns
            // here to the AI tab — not the default Wheel — without anyone having to
            // PUSH a fresh picker entry (which is what created the Back loop between
            // the picker and the results page).
            try {
                history.replaceState(history.state, '',
                    `picker.html?panel=ai&collection=${encodeURIComponent(selectedCollection.id)}`);
            } catch (_) { /* non-critical */ }

            if (pickerTabs) pickerTabs.classList.add('collapsing');

            let navigated = false;
            const go = () => {
                if (navigated) return;
                navigated = true;
                window.location.href = 'ai-suggestions.html';
            };
            if (pickerTabs) {
                pickerTabs.addEventListener('transitionend', (e) => {
                    if (e.propertyName === 'flex-grow' || e.propertyName === 'flex-basis') go();
                });
            }
            setTimeout(go, 650);
        });
    }

    // Enter in the prompt sends, just like clicking SEND (Shift+Enter still adds a
    // newline for a multi-line prompt).
    if (aiPrompt && aiSendBtn) {
        aiPrompt.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                aiSendBtn.click();
            }
        });
    }
});
