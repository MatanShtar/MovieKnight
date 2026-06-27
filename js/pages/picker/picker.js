const MIN_WHEEL_MOVIES = 2;

// odometer roll: vertical strip of every integer between old and new slides through,
// blurring mid-roll. cancels in-flight roll, snaps on reduced-motion.
function animateCount(el, to) {
    if (!el) return;
    to = Number(to) || 0;
    if (el._countTarget === to && el._countRaf) return;

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
    el.style.position = 'relative';
    el.style.overflow = 'hidden';
    el.textContent = '';
    el.appendChild(track);

    const yFrom = -(from - lo) * H;
    const yTo = -(to - lo) * H;
    const dist = Math.abs(to - from);
    const duration = Math.min(850, 300 + dist * 55);
    const blurMax = Math.min(6, 1 + dist * 0.6);
    const t0 = performance.now();
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
            el.textContent = String(to);
        }
    };
    el._countRaf = requestAnimationFrame(tick);
}

// point the hub Back at the collection it plays from. removing data-back opts out of
// smartBack's history.back(), which could send the user back down into a game.
function wireHubBack() {
    const back = document.querySelector('.back-btn');
    if (!back) return;
    const id = window.ActiveCollection && ActiveCollection.getId();
    if (!id) return;
    back.setAttribute('href', `collection.html?id=${encodeURIComponent(id)}`);
    back.removeAttribute('data-back');
}

// offline fallback if /genres or /providers fail; live data comes from MovieAPI.
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
        { id: 36, name: "History", available: true },
        { id: 10402, name: "Music", available: true },
        { id: 10752, name: "War", available: true },
        { id: 10770, name: "TV Movie", available: true }
    ],
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

    wireHubBack();

    // declared before genres render, since refreshGenerateState() runs during that
    const generateBtn = document.getElementById('generateBtn');
    const wheelError = document.getElementById('wheelError');
    const wheelRandom = document.querySelector('.picker-panel[data-panel="wheel"] .cb-random');

    let selectedCollection = null;
    let collectionError = "";

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

    // facets = the genre/provider ids that actually appear in this collection's
    // movies. null until loaded => everything treated available; once loaded, absent
    // options are grayed + disabled (never hidden).
    let availableGenres = null;    // Set<number> | null
    let availableProviders = null; // Set<number> | null
    let lastGenreList = dataConfig.genres;
    let lastProviderList = dataConfig.providers;
    const genreOff = new Set();    // available genre ids the user switched OFF (survives re-render)

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
                renderGenres(lastGenreList);
                renderProviders(lastProviderList);
                refreshGenerateState();
            })
            .catch((err) => console.error("Could not load wheel filters:", err));
    })();

    function activeGenreIds() {
        return activeGenreButtons()
            .map((b) => Number(b.dataset.genreId))
            .filter(Boolean);
    }

    // backend stores a movie's genres as names, so name-matching is what filters
    function activeGenreNames() {
        return activeGenreButtons()
            .map((b) => (b.dataset.genreName || "").toLowerCase())
            .filter(Boolean);
    }

    // read live from DOM; the providerList const is assigned later
    function selectedProviderIds() {
        const list = document.getElementById('providerList');
        if (!list) return [];
        return [...list.querySelectorAll('.provider-checkbox:checked')]
            .map((cb) => Number(cb.dataset.providerId))
            .filter(Boolean);
    }

    // pass = a genre still ON (matched by id or name), and if providers ticked it
    // offers one. movies with no genre data at all are never excluded.
    function movieMatchesFilters(m, genreIds, genreNames, providerIds) {
        const mgIds = m.genreIds || [];
        const mgNames = (m.genres || []).map((n) => String(n).toLowerCase());
        const hasGenreData = mgIds.length || mgNames.length;
        const okGenre =
            !hasGenreData ||
            (!genreIds.length && !genreNames.length) ||
            mgIds.some((id) => genreIds.includes(id)) ||
            mgNames.some((n) => genreNames.includes(n));

        // strict: with a provider picked, a movie must list it to stay. movies with
        // no provider data are intentionally excluded, no safety net.
        const mp = m.providerIds || [];
        const okProvider =
            !providerIds.length || mp.some((id) => providerIds.includes(id));
        return okGenre && okProvider;
    }

    function filteredWheelMovies() {
        if (!selectedCollection || !Array.isArray(selectedCollection.movies)) return [];
        const gids = activeGenreIds();
        const gnames = activeGenreNames();
        const pids = selectedProviderIds();
        return selectedCollection.movies.filter((m) =>
            movieMatchesFilters(m, gids, gnames, pids),
        );
    }

    // a genre is selected when its button is NOT dashed
    const genreGrid = document.getElementById('genreGrid');

    function activeGenreButtons() {
        if (!genreGrid) return [];
        return [...genreGrid.querySelectorAll('.genre-btn:not(.dashed)')];
    }

    if (genreGrid) {
        renderGenres(dataConfig.genres);
        MovieAPI.getGenres()
            .then(genres => {
                if (genres.length) {
                    renderGenres(genres.map(g => ({ id: g.id, name: g.name })));
                }
            })
            .catch(err => console.error("Could not load genres:", err));
    }

    // genres absent from the collection are grayed + disabled and forced OFF.
    // user OFF toggles persist across re-renders via genreOff.
    function renderGenres(genres) {
        lastGenreList = genres;
        genreGrid.innerHTML = genres.map(genre => {
            const id = Number(genre.id) || 0;
            const avail = genreIsAvailable(id);
            const off = !avail || (id && genreOff.has(id));
            const classes = ['genre-btn'];
            if (off) classes.push('dashed');
            if (!avail) classes.push('genre-btn--unavailable');
            const idAttr = genre.id ? ` data-genre-id="${genre.id}"` : "";
            const aria = avail ? "" : ' aria-disabled="true"';
            // icon holds a "+"; CSS rotates it to an "x" when dashed
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
                if (this.classList.contains('genre-btn--unavailable')) return;
                const id = Number(this.dataset.genreId);
                const isCurrentlyActive = !this.classList.contains('dashed');
                // block unchecking the last active genre
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

    const providerList = document.getElementById('providerList');
    const providerSearch = document.getElementById('providerSearch');
    const providerSelectionLabel = document.getElementById('providerSelection');
    const providerSelectionTooltip = document.getElementById('providerSelectionTooltip');
    const clearProvidersBtn = document.getElementById('clearProvidersBtn');

    function refreshProviderSelectionLabel() {
        if (!providerSelectionLabel || !providerList) return;
        const checked = [...providerList.querySelectorAll('.provider-checkbox:checked')]
            .map((cb) => cb.closest('.provider-item')?.querySelector('.provider-name')?.textContent)
            .filter(Boolean);
        const text = checked.length ? checked.join(", ") : "Any";
        providerSelectionLabel.textContent = text;
        if (providerSelectionTooltip) {
            providerSelectionTooltip.textContent = checked.length
                ? `Selected: ${text}`
                : "Any provider";
        }
        if (clearProvidersBtn) clearProvidersBtn.hidden = checked.length === 0;
    }

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
        renderProviders(dataConfig.providers);
        MovieAPI.getProviders()
            .then(providers => {
                if (providers.length) renderProviders(providers);
            })
            .catch(err => console.error("Could not load providers:", err));

        // re-validate on toggle, a provider filter can empty the pool
        providerList.addEventListener('change', (e) => {
            if (e.target.classList.contains('provider-checkbox')) {
                refreshProviderSelectionLabel();
                refreshGenerateState();
            }
        });

        if (providerSearch) {
            providerSearch.addEventListener('input', (e) => {
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

    // providers present in this collection sort to top; the rest go bottom, disabled
    // + grayed (kept visible).
    function renderProviders(providers) {
        lastProviderList = providers;

        // preserve ticked providers across re-render, by name so it survives the
        // no-id fallback -> live swap
        const checkedNames = new Set(
            [...providerList.querySelectorAll('.provider-checkbox:checked')]
                .map((cb) => cb.closest('.provider-item')?.querySelector('.provider-name')?.textContent)
                .filter(Boolean)
        );

        // stable sort: available first, unavailable last
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

        // deep-link, e.g. picker.html?panel=chopping
        const wanted = new URLSearchParams(location.search).get('panel');
        if (wanted) activatePanel(wanted);

        // START/GENERATE/SEND add .collapsing before navigating; returning here
        // (esp. from bfcache) would keep it and leave the bar stuck. strip + reassert.
        const resetTabs = () => {
            pickerTabs.classList.remove('collapsing');
            const panel = new URLSearchParams(location.search).get('panel');
            activatePanel(panel || 'wheel');
        };
        window.addEventListener('pageshow', resetTabs);
    }

    // validate the wheel can be built; reflect why not in the inline error + button.
    // precedence: no collection -> no genres -> nothing left after filtering.
    function refreshGenerateState() {
        if (!generateBtn) return;

        const matched = selectedCollection ? filteredWheelMovies().length : 0;
        const countPill = document.getElementById('wheelMovieCount');
        if (countPill) animateCount(countPill, matched);

        let invalid = false;
        let msg = "";

        if (!selectedCollection) {
            invalid = true;
            msg = collectionError;
        } else if (activeGenreButtons().length < 1) {
            invalid = true;
            msg = "Select at least one genre.";
        } else if (matched === 0) {
            invalid = true;
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

            // filtered client-side; re-enforce the >=2 minimum after filters
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

            sessionStorage.setItem('mk:wheelGame', JSON.stringify({
                movies: wheelMovies.map((m) => m.title),
            }));

            if (pickerTabs) pickerTabs.classList.add('collapsing');

            // carry the collection id so wheel.html can load/save its server-backed wheel
            const wheelUrl = selectedCollection && selectedCollection.id != null
                ? `wheel.html?collection=${encodeURIComponent(selectedCollection.id)}`
                : 'wheel.html';

            let navigated = false;
            const go = () => {
                if (navigated) return;
                navigated = true;
                window.location.href = wheelUrl;
            };
            // navigate once tabs finish collapsing, with a safety fallback
            if (pickerTabs) {
                pickerTabs.addEventListener('transitionend', (e) => {
                    if (e.propertyName === 'flex-grow' || e.propertyName === 'flex-basis') go();
                });
            }
            setTimeout(go, 650);
        });
    }

    // same liquid 1/2/3 slider the Chopping Block uses (chopping.css .cb-slider +
    // #cb-goo filter). mirrors chopping.js renderSlider/positionSlider.
    const aiCountSlider = document.getElementById('aiCountSlider');
    let suggestionCount = 3;

    // tapering blob chain: lead circle + trailing drops that lag (transition-delay)
    // so a change stretches into a comet the goo filter fuses into one
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
        const frac = (suggestionCount - 1) / 2;
        aiCountSlider.querySelectorAll('.cb-slider-dot').forEach(dot =>
            dot.classList.toggle('active', Number(dot.dataset.value) === suggestionCount));
        aiCountSlider.querySelectorAll('.cb-slider-blob').forEach(blob => {
            const s = parseFloat(blob.style.width);
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

    function selectedSuggestionCount() {
        return suggestionCount;
    }

    const aiSendBtn = document.getElementById('aiSendBtn');
    const aiPrompt = document.getElementById('aiPrompt');
    if (aiSendBtn) {
        aiSendBtn.addEventListener('click', () => {
            // AI is logged-in only
            if (window.requireAuth && !requireAuth()) return;

            if (!selectedCollection) {
                if (window.toast) toast.error(collectionError || "Open a collection to let AI choose from it.");
                return;
            }

            const promptText = aiPrompt ? aiPrompt.value.trim() : "";
            if (!promptText) {
                if (window.toast) toast.error("You must enter a prompt.");
                if (aiPrompt) aiPrompt.focus();
                return;
            }

            // daily quota spent? stop before navigating; backend would 429 anyway
            if (window.MovieAPI && MovieAPI.aiActionsRemaining() <= 0) {
                if (window.toast) toast.warn(MovieAPI.aiLimitReachedMessage());
                return;
            }

            sessionStorage.setItem('mk:aiGame', JSON.stringify({
                collectionId: selectedCollection.id,
                collectionName: selectedCollection.name || "",
                prompt: promptText,
                count: selectedSuggestionCount(),
                // fresh token per SEND: results page makes new picks for a new SEND,
                // reuses them when you navigate back
                token: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            }));

            // rewrite this entry (don't push) so a later Back returns here to the AI tab
            try {
                history.replaceState(history.state, '',
                    `picker.html?panel=ai&collection=${encodeURIComponent(selectedCollection.id)}`);
            } catch (_) {}

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

    // Enter sends; Shift+Enter still adds a newline
    if (aiPrompt && aiSendBtn) {
        aiPrompt.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                aiSendBtn.click();
            }
        });
    }
});
