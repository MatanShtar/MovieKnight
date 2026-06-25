// ==========================================
// 2. GENERIC UI BUILDERS (GENRES & PROVIDERS)
// ==========================================

// A wheel needs at least two slices to be worth spinning, so the picker won't build
// one from fewer than this many movies (after filtering).
const MIN_WHEEL_MOVIES = 2;

// Roll a numeric pill to `to` like a physical odometer/tumbler: a vertical strip of
// every integer between the old and new value slides through the pill — UP for an
// increase, DOWN for a decrease — accelerating to a motion-blur in the middle
// (easeInOut + a blur that peaks mid-roll) before settling crisply on the target.
// Cancels any in-flight roll; a repeat of the same target is a no-op; honours
// reduced-motion (snaps instantly).
function animateCount(el, to) {
    if (!el) return;
    to = Number(to) || 0;
    if (el._countTarget === to && el._countRaf) return; // already rolling to this

    const parsed = parseInt(el.textContent, 10);
    const from = (el._countCurrent != null) ? el._countCurrent
               : (Number.isFinite(parsed) ? parsed : to);
    el._countTarget = to;
    if (el._countRaf) { cancelAnimationFrame(el._countRaf); el._countRaf = null; }

    const reduce = window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || from === to) {
        el._countCurrent = to;
        el.textContent = String(to);
        return;
    }

    // Build the tumbler: one cell per integer in [lo..hi], each as tall as the pill.
    const lo = Math.min(from, to), hi = Math.max(from, to);
    const H = el.clientHeight || 43;
    const track = document.createElement('span');
    track.className = 'count-roll';
    for (let n = lo; n <= hi; n++) {
        const cell = document.createElement('span');
        cell.className = 'count-cell';
        cell.style.height = H + 'px';
        cell.textContent = String(n);
        track.appendChild(cell);
    }
    el.style.position = 'relative';   // make the pill the clip/anchor for the roll
    el.style.overflow = 'hidden';
    el.textContent = '';
    el.appendChild(track);

    // Translate from the row showing `from` to the row showing `to`. from<to → the
    // strip moves up; from>to → it moves down.
    const yFrom = -(from - lo) * H;
    const yTo = -(to - lo) * H;
    const dist = Math.abs(to - from);
    const duration = Math.min(850, 300 + dist * 55);
    const blurMax = Math.min(6, 1 + dist * 0.6);
    const t0 = performance.now();
    // easeInOutCubic — slow start, fast (blurred) middle, slow settle.
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    const tick = (now) => {
        const p = Math.min(1, (now - t0) / duration);
        const e = ease(p);
        track.style.transform = `translateY(${yFrom + (yTo - yFrom) * e}px)`;
        track.style.filter = `blur(${(blurMax * Math.sin(Math.PI * p)).toFixed(2)}px)`;
        el._countCurrent = Math.round(from + (to - from) * e);
        if (p < 1) {
            el._countRaf = requestAnimationFrame(tick);
        } else {
            el._countRaf = null;
            el._countCurrent = to;
            el.textContent = String(to);       // settle on a crisp, un-blurred number
        }
    };
    el._countRaf = requestAnimationFrame(tick);
}

// Point the hub's "Back" at the collection it plays from (collection.html?id=<id>),
// resolved from ?collection= or the remembered active collection. Removing data-back
// opts this link out of smartBack's history.back(), which is what could otherwise
// send the user back down into a game. With no collection in context we leave the
// static href/data-back as-is.
function wireHubBack() {
    const back = document.querySelector('.back-btn');
    if (!back) return;
    const id = window.ActiveCollection && ActiveCollection.getId();
    if (!id) return;
    back.setAttribute('href', `collection.html?id=${encodeURIComponent(id)}`);
    back.removeAttribute('data-back');
}

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
        { id: 9648, name: "Mystery", available: true },
        // The remaining TMDB genres, so even this OFFLINE fallback covers all 19 —
        // a movie tagged only History/Music/War/TV Movie still has a button to match.
        { id: 36, name: "History", available: true },
        { id: 10402, name: "Music", available: true },
        { id: 10752, name: "War", available: true },
        { id: 10770, name: "TV Movie", available: true }
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

    // The hub is the middle of the tree: collection → picker (hub) → game. Its Back
    // must go UP to the collection — NOT history.back(), which is unreliable here: a
    // game's "Play Again" pushes a fresh picker entry on top of the game, so the
    // hub's history.back() would drop the user back INSIDE that game. Point Back
    // straight at the collection and strip data-back so the global smartBack handler
    // doesn't hijack it with history.back(). Falls back to the static href when there
    // is no collection in context (a direct visit without one).
    wireHubBack();

    // Resolved up-front: refreshGenerateState() runs while genres render (below),
    // which is before section D — so this must exist before then (no TDZ).
    const generateBtn = document.getElementById('generateBtn');
    const wheelError = document.getElementById('wheelError');
    // The "Movies on the Wheel" count row — on mobile it sits just above the fixed
    // action bar, so when the inline error appears we raise this row (CSS) to make
    // room for the error pill between it and the GENERATE button.
    const wheelRandom = document.querySelector('.picker-panel[data-panel="wheel"] .cb-random');

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

    // --- Smart Filter facets (per collection) -------------------------------------
    // GET /api/collections/:id/wheel/filters → the genre + provider ids that ACTUALLY
    // appear in this collection's movies. null until loaded → everything is treated as
    // available (graceful). Once loaded, options not present are grayed out + disabled
    // (never hidden), and providers are sorted available-first. We re-render both
    // menus when the facets arrive.
    let availableGenres = null;    // Set<number> | null
    let availableProviders = null; // Set<number> | null
    let lastGenreList = dataConfig.genres;        // most recent list rendered (for re-render)
    let lastProviderList = dataConfig.providers;
    const genreOff = new Set();    // available genre ids the user switched OFF (survives re-render)

    // An option is "available" when the facets aren't loaded yet (null), it has no id
    // to test (the offline fallback list), or its id is in the collection's facet set.
    const genreIsAvailable = (id) =>
        availableGenres == null || !id || availableGenres.has(Number(id));
    const providerIsAvailable = (p) =>
        availableProviders == null || p.id == null || availableProviders.has(Number(p.id));

    (function loadWheelFilters() {
        const cid = window.ActiveCollection && ActiveCollection.getId();
        if (!cid || !MovieAPI.getWheelFilters) return;
        MovieAPI.getWheelFilters(cid)
            .then(({ availableGenres: ag, availableProviders: ap }) => {
                availableGenres = new Set(ag);
                availableProviders = new Set(ap);
                renderGenres(lastGenreList);       // repaint with the gray-out state
                renderProviders(lastProviderList); // repaint sorted + grayed + "Any"
                refreshGenerateState();
            })
            .catch((err) => console.error("Could not load wheel filters:", err));
    })();

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

    if (genreGrid) {
        renderGenres(dataConfig.genres); // show fallback immediately
        // Then replace with live genres from the backend when they arrive.
        MovieAPI.getGenres()
            .then(genres => {
                if (genres.length) {
                    renderGenres(genres.map(g => ({ id: g.id, name: g.name })));
                }
            })
            .catch(err => console.error("Could not load genres:", err));
    }

    // Render the genre toggles. Smart Filter: a genre NOT present in this collection
    // (per availableGenres) is grayed out + disabled (kept visible, not removed) and
    // forced OFF. Available genres default ON; the user's OFF toggles persist across
    // re-renders via `genreOff`, so a late facet/live-genre repaint doesn't reset them.
    function renderGenres(genres) {
        lastGenreList = genres; // remember so the facet load can repaint this same list
        genreGrid.innerHTML = genres.map(genre => {
            const id = Number(genre.id) || 0;
            const avail = genreIsAvailable(id);
            const off = !avail || (id && genreOff.has(id)); // unavailable => always off
            const classes = ['genre-btn'];
            if (off) classes.push('dashed');
            if (!avail) classes.push('genre-btn--unavailable');
            const idAttr = genre.id ? ` data-genre-id="${genre.id}"` : "";
            const aria = avail ? "" : ' aria-disabled="true"';
            // We ALWAYS put a "+" inside the icon; CSS rotates it to an "x" when dashed.
            return `
                <div class="${classes.join(' ')}"${idAttr} data-genre-name="${genre.name}"${aria}>
                    ${genre.name}
                    <div class="genre-icon">
                        <img src="assets/images/icons/genre-x-icon.svg" alt="toggle">
                    </div>
                </div>
            `;
        }).join("");

        genreGrid.querySelectorAll('.genre-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                // Unavailable genres are disabled — ignore clicks on them.
                if (this.classList.contains('genre-btn--unavailable')) return;
                const id = Number(this.dataset.genreId);
                const isCurrentlyActive = !this.classList.contains('dashed');
                // Block unchecking the last remaining active (available) genre.
                if (isCurrentlyActive && activeGenreButtons().length <= 1) {
                    if (window.toast) toast.info("Keep at least one genre selected.");
                    return;
                }
                this.classList.toggle('dashed');
                const nowHidden = this.classList.contains('dashed');
                if (id) { nowHidden ? genreOff.add(id) : genreOff.delete(id); }
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

    // Reset the provider filter back to "Any" (= nothing ticked): uncheck everything,
    // clear the search box, and re-show every provider row.
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
        // Nothing ticked = "Any" (no provider constraint).
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

    // Render the provider list with the Smart Filter sort + gray-out: providers
    // present in THIS collection (availableProviders) are sorted to the TOP; the rest
    // are pushed to the BOTTOM and rendered disabled + grayed (kept visible, not
    // hidden). No "Any" row — nothing ticked simply means "Any" (no constraint).
    function renderProviders(providers) {
        lastProviderList = providers; // remember so the facet load can repaint this list

        // Preserve any providers already ticked across a re-render (the fallback paints
        // first, then the live list / facet repaint replace it). Track by name so it
        // survives the no-id fallback → live swap.
        const checkedNames = new Set(
            [...providerList.querySelectorAll('.provider-checkbox:checked')]
                .map((cb) => cb.closest('.provider-item')?.querySelector('.provider-name')?.textContent)
                .filter(Boolean)
        );

        // Stable sort: available providers first, unavailable last.
        const ordered = providers
            .map((p, i) => ({ p, i, avail: providerIsAvailable(p) }))
            .sort((a, b) => (a.avail === b.avail ? a.i - b.i : (a.avail ? -1 : 1)));

        providerList.innerHTML = ordered.map(({ p, avail }, index) => {
            const checked = checkedNames.has(p.name) ? " checked" : "";
            const cls = avail ? "provider-item" : "provider-item provider-item--unavailable";
            const disabled = avail ? "" : " disabled";
            const idAttr = p.id ? ` data-provider-id="${p.id}"` : "";
            const aria = avail ? "" : ' aria-disabled="true"';
            return `
            <label class="${cls}"${aria}>
                <img src="${p.logo}" alt="${p.name}" class="provider-logo" onerror="this.style.display='none'">
                <span class="provider-name">${p.name}</span>
                <input type="checkbox" class="provider-checkbox" id="prov_${index}"${idAttr}${checked}${disabled}>
                <div class="custom-check"></div>
            </label>`;
        }).join("");

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

        // How many of the collection's movies survive the current filters — shown in
        // the "Movies on the Wheel" pill and reused for the validation below.
        const matched = selectedCollection ? filteredWheelMovies().length : 0;
        const countPill = document.getElementById('wheelMovieCount');
        if (countPill) animateCount(countPill, matched);

        let invalid = false;
        let msg = "";

        if (!selectedCollection) {
            invalid = true;
            msg = collectionError; // "Open a collection…" / load error (empty while loading)
        } else if (activeGenreButtons().length < 1) {
            invalid = true;
            msg = "Select at least one genre.";
        } else if (matched === 0) {
            invalid = true;
            // A provider filter is the usual culprit: provider_ids is US-flatrate
            // only, so movies that don't stream there are correctly excluded.
            msg = selectedProviderIds().length
                ? "None of your movies stream on the selected providers."
                : "No movies in this collection match your filters.";
        } else if (matched < MIN_WHEEL_MOVIES) {
            invalid = true;
            msg = "A wheel needs at least 2 movies — add more or loosen your filters.";
        }

        if (wheelError) {
            wheelError.textContent = msg;
            wheelError.classList.toggle("show", !!msg);
        }
        // Raise the "Movies on the Wheel" count (mobile) so the error pill has room
        // between it and the button instead of covering it. CSS handles the slide.
        if (wheelRandom) wheelRandom.classList.toggle("cb-random--raised", !!msg);
        generateBtn.disabled = invalid;
        generateBtn.classList.toggle('generate-wheel-btn--disabled', invalid);
    }

    if (generateBtn) {
        generateBtn.addEventListener('click', () => {
            if (generateBtn.disabled) {
                if (window.toast) toast.error("Pick a collection and at least one genre to build a wheel.");
                return;
            }

            // The wheel pool is the chosen collection filtered CLIENT-SIDE by the
            // selected genres/providers (each movie carries genre_ids/provider_ids in
            // the collection payload — no server endpoint). Enforce the ≥2 minimum
            // here too, in case filters narrow the pool below what a wheel can spin.
            const wheelMovies = filteredWheelMovies();
            if (!selectedCollection || wheelMovies.length < MIN_WHEEL_MOVIES) {
                if (window.toast) {
                    toast.error(wheelMovies.length === 1
                        ? "A wheel needs at least 2 movies — add more or loosen your filters."
                        : "No movies match — adjust your filters.");
                }
                refreshGenerateState();
                return;
            }

            // Hand the already-filtered movie titles to wheel.html (matching the
            // sessionStorage hand-off the games use).
            sessionStorage.setItem('mk:wheelGame', JSON.stringify({
                movies: wheelMovies.map((m) => m.title),
            }));

            if (pickerTabs) pickerTabs.classList.add('collapsing');

            // Carry the collection id so the wheel page can load/save its
            // server-backed wheel (GET/PUT /api/collections/:id/wheel).
            const wheelUrl = selectedCollection && selectedCollection.id != null
                ? `wheel.html?collection=${encodeURIComponent(selectedCollection.id)}`
                : 'wheel.html';

            let navigated = false;
            const go = () => {
                if (navigated) return;
                navigated = true;
                window.location.href = wheelUrl;
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
            // AI features are logged-in only: a guest gets the same "must be logged
            // in" toast as the heart/eye actions (requireAuth shows it), and we stop.
            if (window.requireAuth && !requireAuth()) return;

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

            // Daily AI quota spent? Stop before navigating (the backend would 429
            // anyway) — instant feedback from the cached count. Limit/message come
            // from the backend, never hard-coded here.
            if (window.MovieAPI && MovieAPI.aiActionsRemaining() <= 0) {
                if (window.toast) toast.warn(MovieAPI.aiLimitReachedMessage());
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
