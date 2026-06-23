// chopping.js — The Chopping Block game feature.
//
// One file drives two screens, picked by which DOM is present on load:
//   • picker.html   → the "Chopping Block" SETUP panel (players, eliminations,
//                     live math, validation) and the START hand-off.
//   • chopping.html → the GAME screen: a 3D coverflow carousel (Bootstrap
//                     carousel shell + custom depth), turn order, elimination
//                     with a "ping-pong graveyard", and the winner overlay.
//
// Collections are now live: the setup screen (picker.html) lets the user choose
// one of their real collections and passes the chosen collectionId to the game
// screen (chopping.html) through sessionStorage. The game screen fetches the
// collection's movies from GET /api/collections/:id on load.

const CHOPPING_CONFIG_KEY = "choppingBlockConfig";
// A game needs at least this many movies to be meaningful (one winner + ≥1 chop).
const MIN_COLLECTION_SIZE = 2;
const POSTER_FALLBACK = "assets/images/poster-placeholder.svg";

// ==========================================
// 1. SHARED HELPERS
// ==========================================
function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => (
        { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
}

// At/below this width the game screen uses a native CSS scroll-snap strip instead
// of the JS-driven 3D coverflow (must match the @media breakpoint in chopping.css).
// 1024px is the app-wide "mobile" cutoff, so tablets get the swipe strip too.
const cbMobileMq = window.matchMedia("(max-width: 1024px)");
const cbIsMobile = () => cbMobileMq.matches;

// Fisher–Yates shuffle (returns a new array).
function shuffle(list) {
    const pool = list.slice();
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool;
}

document.addEventListener("DOMContentLoaded", () => {
    if (document.getElementById("cbSetup")) initSetup();
    if (document.getElementById("cbGame")) initGame();
});

// ==========================================
// 2. SETUP SCREEN  (picker.html → chopping panel)
// ==========================================
function initSetup() {
    // How many player tags we show before collapsing the rest into a "+N …" chip.
    // Desktop fits 8 (2 columns × 4 rows; the chip takes the 8th). Phones are far
    // narrower, so a lower threshold keeps the pills from pushing the page wider
    // than the screen (the bug: adding players forced horizontal scrolling).
    const maxTagSlots = () => (cbIsMobile() ? 4 : 8);

    // --- state ---
    // A fresh session starts with exactly one player: the signed-in user,
    // pre-filled with their full name (falls back to their username, then a
    // generic label for guests). `currentUser` is the cached user from common.js.
    const cu = (typeof currentUser !== "undefined" && currentUser) || null;
    const players = [(cu && (cu.name || cu.username)) || "Player 1"];
    let eliminations = 2;             // 1 | 2 | 3
    let selectedCollection = null;    // the real collection chosen to play from
    let overflowOpen = false;         // is the "+N" overflow dropdown open?

    // --- elements ---
    const input = document.getElementById("cbPlayerInput");
    const addBtn = document.getElementById("cbAddPlayerBtn");
    const tagsEl = document.getElementById("cbPlayerTags");
    const slider = document.getElementById("cbSlider");
    const totalPlayersEl = document.getElementById("cbTotalPlayers");
    const totalMoviesEl = document.getElementById("cbTotalMovies");
    const randomOrderEl = document.getElementById("cbRandomOrder");
    const errorEl = document.getElementById("cbError");
    const startBtn = document.getElementById("cbStartBtn");

    // SVG "gooey" filter (metaballs): blur + alpha-threshold so the slider's red
    // blobs merge into one another with a liquid neck as they travel.
    if (!document.getElementById("cb-goo")) {
        document.body.insertAdjacentHTML("beforeend",
            `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
                <filter id="cb-goo">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="b"/>
                    <feColorMatrix in="b" mode="matrix"
                        values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"/>
                </filter>
            </defs></svg>`);
    }

    // --- the collection to play from (no dropdown): comes from the collection
    //     page via picker.html?collection=<id>, loaded once and shared. ---
    let collectionError = "";
    if (window.ActiveCollection) {
        ActiveCollection.load()
            .then((collection) => {
                if (collection) selectedCollection = collection;
                else collectionError = "Open a collection to play.";
                refresh();
            })
            .catch((err) => {
                collectionError = err.message || "Couldn't load the collection.";
                refresh();
            });
    }

    // How many movies the chosen collection holds (0 until one is picked).
    const collectionSize = () =>
        selectedCollection && Array.isArray(selectedCollection.movies)
            ? selectedCollection.movies.length
            : 0;

    // (Players * Eliminations) + 1
    const totalMovies = () => players.length * eliminations + 1;

    // --- player tags: 2-column fill, with a "+N …" overflow chip + tooltip ---
    function tagHtml(name, i) {
        return `
            <span class="cb-tag" data-index="${i}">
                <span class="cb-tag-name">${escapeHtml(name)}</span>
                <button class="cb-tag-remove" data-index="${i}" aria-label="Remove ${escapeHtml(name)}">
                    <img src="assets/images/icons/genre-x-icon.svg" alt="">
                </button>
            </span>`;
    }

    function renderTags(enteringIndex = -1) {
        const slots = maxTagSlots();
        let visible, hidden = [];
        if (players.length <= slots) {
            visible = players.map((n, i) => [n, i]);
        } else {
            visible = players.slice(0, slots - 1).map((n, i) => [n, i]);
            // Keep each hidden player's REAL index so the dropdown ✕ removes the right one.
            hidden = players.slice(slots - 1).map((n, i) => [n, i + (slots - 1)]);
        }

        let html = visible.map(([n, i]) => tagHtml(n, i)).join("");
        if (hidden.length) {
            // A click-to-open dropdown (same dark box as the picker's provider list) of
            // the players past the visible slots, each with an inline ✕ to remove them.
            const rows = hidden.map(([n, i]) => `
                <div class="cb-overflow-item">
                    <span class="cb-overflow-name" title="${escapeHtml(n)}">${escapeHtml(n)}</span>
                    <button class="cb-tag-remove cb-overflow-x" data-index="${i}" aria-label="Remove ${escapeHtml(n)}">
                        <img src="assets/images/icons/genre-x-icon.svg" alt="">
                    </button>
                </div>`).join("");
            html += `
                <span class="cb-tag cb-tag-more" id="cbMoreChip" tabindex="0" role="button"
                      aria-haspopup="true" aria-expanded="${overflowOpen ? "true" : "false"}"
                      aria-label="${hidden.length} more players">
                    +${hidden.length} more &hellip;
                    <svg class="cb-more-caret" viewBox="0 0 24 24" aria-hidden="true">
                        <polyline points="6 9 12 15 18 9" fill="none" stroke="currentColor"
                                  stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <div class="cb-overflow-box"${overflowOpen ? "" : " hidden"} role="menu">
                        <div class="cb-overflow-list">${rows}</div>
                    </div>
                </span>`;
        } else {
            overflowOpen = false; // nothing left to overflow → keep state clean
        }
        tagsEl.innerHTML = html;

        if (enteringIndex >= 0) {
            const tag = tagsEl.querySelector(`.cb-tag[data-index="${enteringIndex}"]`);
            if (tag) {
                tag.classList.add("is-entering");
                tag.addEventListener("animationend",
                    () => tag.classList.remove("is-entering"), { once: true });
            }
        }
    }

    // Open/close the overflow dropdown (no re-render — just toggle its visibility).
    function toggleOverflow(force) {
        overflowOpen = (force === undefined) ? !overflowOpen : force;
        const chip = document.getElementById("cbMoreChip");
        if (!chip) return;
        const box = chip.querySelector(".cb-overflow-box");
        if (box) box.hidden = !overflowOpen;
        chip.setAttribute("aria-expanded", overflowOpen ? "true" : "false");
    }

    function addPlayer(name) {
        name = (name || "").trim();
        if (!name) return;
        if (name.length > 20) name = name.slice(0, 20);
        if (players.some(p => p.toLowerCase() === name.toLowerCase())) {
            if (window.toast) toast.info(`"${name}" is already playing.`);
            return;
        }
        players.push(name);
        renderTags(players.length - 1);
        input.value = "";
        input.focus();
        refresh();
    }

    function removePlayer(index) {
        const tag = tagsEl.querySelector(`.cb-tag[data-index="${index}"]`);
        if (tag) {
            tag.classList.add("is-leaving");
            // commit after the brief shrink so the grid reflows smoothly
            setTimeout(() => { players.splice(index, 1); renderTags(); refresh(); }, 180);
        } else {
            players.splice(index, 1); renderTags(); refresh();
        }
    }

    // --- the 1/2/3 slider: grey track, a red fill that grows between the
    //     circles (smooth width transition), and a thumb over the active dot ---
    // The red liquid is a short chain of tapering blobs (a lead circle + trailing
    // drops). Each lags the one before it slightly, so on a value change they spread
    // into a comet that the goo filter fuses into one continuous, stretching stream —
    // the red appears to flow from one circle into the next, then pool into a circle.
    const BLOB_SIZES = [21, 19, 17, 15, 13, 11];

    function renderSlider() {
        const blobs = BLOB_SIZES.map((s, i) =>
            `<span class="cb-slider-blob" style="width:${s}px;height:${s}px;top:${(25 - s) / 2}px;transition-delay:${i * 0.018}s"></span>`
        ).join("");
        slider.innerHTML = `
            <div class="cb-slider-track"></div>
            <div class="cb-slider-liquid">${blobs}</div>
            ${[1, 2, 3].map(v => `
                <button class="cb-slider-dot" data-value="${v}" aria-label="${v} per player">
                    <span class="cb-slider-num">${v}</span>
                </button>
            `).join("")}
        `;
        positionSlider();
    }

    function positionSlider() {
        const frac = (eliminations - 1) / 2;   // 0 | 0.5 | 1
        slider.querySelectorAll(".cb-slider-dot").forEach(dot =>
            dot.classList.toggle("active", Number(dot.dataset.value) === eliminations));
        slider.querySelectorAll(".cb-slider-blob").forEach(blob => {
            const s = parseFloat(blob.style.width);          // keep every blob centred on the dot
            blob.style.left = `calc((100% - 25px) * ${frac} + ${(25 - s) / 2}px)`;
        });
    }

    // Briefly pop a value pill when its number changes.
    function bump(el, value) {
        if (el.textContent === String(value)) return;
        el.textContent = value;
        el.classList.remove("bump");
        void el.offsetWidth;          // restart the transition
        el.classList.add("bump");
        setTimeout(() => el.classList.remove("bump"), 220);
    }

    // --- recompute live numbers + validity + the (unified, inline) error ---
    function refresh() {
        bump(totalPlayersEl, players.length);
        const movies = totalMovies();
        // "Random Movies Selected" gets the odometer roll (shared from picker.js); no
        // box-grow pop. Fall back to the plain bump if that helper isn't loaded.
        if (typeof animateCount === 'function') animateCount(totalMoviesEl, movies);
        else bump(totalMoviesEl, movies);

        const noCollection = !selectedCollection;
        const collSize = collectionSize();
        const tooSmall = !noCollection && collSize < MIN_COLLECTION_SIZE;
        const noPlayers = players.length < 1;                 // single player is allowed
        const notEnoughMovies = !noCollection && !tooSmall && movies > collSize;
        const invalid = noCollection || tooSmall || noPlayers || notEnoughMovies;

        let msg = "";
        if (noCollection) msg = collectionError; // "Open a collection…" / load error (empty while loading)
        else if (tooSmall) msg = `This collection has only ${collSize} movie${collSize === 1 ? "" : "s"} — add more to play.`;
        else if (noPlayers) msg = "Add at least one player to start.";
        else if (notEnoughMovies) msg = `Not enough movies — this collection has ${collSize}.`;
        errorEl.textContent = msg;
        errorEl.classList.toggle("show", !!msg);

        startBtn.disabled = invalid;
        startBtn.classList.toggle("generate-wheel-btn--disabled", invalid);
    }

    // --- wire it up ---
    renderTags();
    renderSlider();
    refresh();

    // The "+N …" overflow threshold differs between desktop and mobile, so
    // re-collapse/expand the tag list when the viewport crosses that breakpoint.
    cbMobileMq.addEventListener("change", () => renderTags());

    addBtn.addEventListener("click", () => addPlayer(input.value));
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); addPlayer(input.value); }
    });

    tagsEl.addEventListener("click", (e) => {
        const btn = e.target.closest(".cb-tag-remove");
        if (btn) { removePlayer(Number(btn.dataset.index)); return; }
        // Click the "+N" chip (but not inside its open dropdown) → toggle the dropdown.
        const chip = e.target.closest(".cb-tag-more");
        if (chip && !e.target.closest(".cb-overflow-box")) toggleOverflow();
    });

    // Click anywhere outside the chip/dropdown closes it.
    document.addEventListener("click", (e) => {
        if (overflowOpen && !e.target.closest("#cbMoreChip")) toggleOverflow(false);
    });

    slider.addEventListener("click", (e) => {
        const dot = e.target.closest(".cb-slider-dot");
        if (!dot) return;
        eliminations = Number(dot.dataset.value);
        positionSlider();
        refresh();
    });

    startBtn.addEventListener("click", () => {
        if (startBtn.disabled) return;   // the inline error already explains why
        sessionStorage.setItem(CHOPPING_CONFIG_KEY, JSON.stringify({
            players: players.slice(),
            eliminations,
            totalMovies: totalMovies(),
            randomOrder: !!(randomOrderEl && randomOrderEl.checked),
            collectionId: selectedCollection.id,
            collectionName: selectedCollection.name,
        }));

        // Rewrite THIS picker entry to the Chopping tab before navigating to the
        // game, so a later Back (history.back) from the game returns here to the
        // Chopping Block tab — not the default Wheel tab. Mirrors the AI flow.
        try {
            history.replaceState(history.state, "",
                `picker.html?panel=chopping&collection=${encodeURIComponent(selectedCollection.id)}`);
        } catch (_) { /* non-critical */ }

        // Same tab-collapse hand-off the "Generate Wheel" button uses.
        const tabs = document.getElementById("pickerTabs");
        if (tabs) tabs.classList.add("collapsing");
        let went = false;
        const go = () => { if (!went) { went = true; window.location.href = "chopping.html"; } };
        if (tabs) tabs.addEventListener("transitionend", (e) => {
            if (e.propertyName === "flex-grow" || e.propertyName === "flex-basis") go();
        });
        setTimeout(go, 650);
    });
}

// ==========================================
// 3. GAME SCREEN  (chopping.html) — coverflow + ping-pong graveyard
// ==========================================
function initGame() {
    // Read the setup handed over from the picker.
    let config;
    try { config = JSON.parse(sessionStorage.getItem(CHOPPING_CONFIG_KEY)); }
    catch { config = null; }

    // No collection means there's nothing to play (e.g. a direct visit) — guide
    // the user back to the picker rather than showing an empty board.
    if (!config || !config.collectionId) {
        showGameMessage("No game in progress",
            "Start a game from the picker to play The Chopping Block.", true);
        return;
    }
    if (!Array.isArray(config.players) || config.players.length < 1) {
        config.players = ["Niv", "Matan"];
    }

    // Point the top "Back" at the hub's Chopping tab for THIS collection. smartBack
    // still prefers history.back() (returning to the hub with setup intact); this is
    // just the fallback target for a direct visit, kept logical with the collection.
    const back = document.querySelector('.back-btn');
    if (back && config.collectionId != null) {
        const url = `picker.html?panel=chopping&collection=${encodeURIComponent(config.collectionId)}`;
        back.setAttribute('href', url);
        back.setAttribute('data-back', url);
    }

    // Fetch the real collection + its movies (login-gated). Spinner while we wait,
    // then either start the game or show a clear error.
    showGameLoading();
    MovieAPI.getCollection(config.collectionId)
        .then((collection) => {
            clearGameStatus();
            const list = (collection && collection.movies) || [];
            if (list.length < MIN_COLLECTION_SIZE) {
                showGameMessage("This collection is too small",
                    `It needs at least ${MIN_COLLECTION_SIZE} movies to play. Add a few more, then try again.`,
                    true);
                return;
            }
            runGame(config, list);
        })
        .catch((err) => {
            clearGameStatus();
            // No/expired token → login (gracefully, like the rest of the app).
            if (err.status === 401) { window.location.replace("login.html"); return; }
            if (err.status === 404) {
                showGameMessage("Collection not found",
                    "It may have been deleted or made private.", true);
                return;
            }
            showGameMessage("Couldn't load the collection",
                err.message || "Please try again in a moment.", true);
            if (window.toast) toast.error(err.message || "Couldn't reach the server.");
        });
}

// --- game-stage status overlays (loading spinner / empty / error) ---
function gameStage() { return document.querySelector(".cb-stage"); }

function clearGameStatus() {
    const s = document.getElementById("cbStatus");
    if (s) s.remove();
}

function showGameLoading() {
    clearGameStatus();
    const stage = gameStage();
    if (!stage) return;
    const el = document.createElement("div");
    el.id = "cbStatus";
    el.className = "cb-status";
    el.innerHTML = `
        <div class="cb-spinner" aria-hidden="true"></div>
        <p class="cb-status-text">Loading your collection…</p>`;
    stage.appendChild(el);
}

function showGameMessage(title, detail, showBack) {
    clearGameStatus();
    const stage = gameStage();
    if (!stage) return;
    const el = document.createElement("div");
    el.id = "cbStatus";
    el.className = "cb-status cb-status-error";
    el.innerHTML = `
        <h2 class="cb-status-title">${escapeHtml(title)}</h2>
        <p class="cb-status-text">${escapeHtml(detail)}</p>
        ${showBack ? `<a class="cb-status-back" href="picker.html?panel=chopping">Back to setup</a>` : ""}`;
    stage.appendChild(el);
}

// Build + run the game from the real, fetched collection movies (each in the
// app's normalised shape: { id, title, posterPath, … }).
function runGame(config, collectionMovies) {
    const players = config.players;
    const totalMovies = Math.min(
        config.totalMovies || (players.length * config.eliminations + 1),
        collectionMovies.length
    );

    // Random Order ON → shuffle the pool; OFF → take the collection in order.
    const pool = config.randomOrder ? shuffle(collectionMovies) : collectionMovies.slice();
    const movies = pool.slice(0, totalMovies);

    const turnEl = document.getElementById("cbTurn");
    const track = document.getElementById("cbTrack");
    const prevBtn = document.getElementById("cbPrev");
    const nextBtn = document.getElementById("cbNext");

    // --- build cards ---
    // `order` is the visual left→right order; each card carries its DOM node and
    // eliminated flag. `focus` is the index of the centred (active) card.
    const order = movies.map(m => {
        const el = document.createElement("div");
        el.className = "cb-card";
        el.dataset.id = m.id;
        el.innerHTML = `
            <p class="cb-card-title" title="${escapeHtml(m.title)}">${escapeHtml(m.title)}</p>
            <div class="cb-poster">
                <img src="${escapeHtml(m.posterPath)}" alt="${escapeHtml(m.title)}"
                     onerror="this.onerror=null;this.src='${POSTER_FALLBACK}'">
                <button class="cb-info" type="button"
                        aria-label="View details for ${escapeHtml(m.title)}" title="View details">i</button>
            </div>
            <button class="cb-eliminate" type="button">ELIMINATE</button>`;
        track.appendChild(el);
        // The "i" badge opens the movie's details in a new tab (so the game stays
        // open behind it) — same style/behaviour as the add-to-collection modal.
        const info = el.querySelector(".cb-info");
        if (info) info.addEventListener("click", (e) => {
            e.stopPropagation();
            try { sessionStorage.setItem("mk:lastMovie", JSON.stringify(m)); } catch (_) {}
            window.open("movie.html?id=" + encodeURIComponent(m.id), "_blank", "noopener");
        });
        return { ...m, eliminated: false, el };
    });

    let center = middleActiveIndex();   // continuous carousel position (in card units)
    let pingRight = true;               // first elimination → far right, then ping-pong
    let turnIndex = 0;
    let gameOver = false;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const coverflow = document.getElementById("cbCarousel");

    // --- turn text (hidden entirely in single-player) ---
    function updateTurn(text) {
        if (players.length <= 1) { turnEl.style.display = "none"; return; }
        const next = text || `${players[turnIndex % players.length]}’s Turn`;
        if (turnEl.textContent === next) return;
        turnEl.classList.add("is-swapping");
        setTimeout(() => { turnEl.textContent = next; turnEl.classList.remove("is-swapping"); }, 180);
    }
    function advanceTurn() {
        turnIndex = (turnIndex + 1) % players.length;
        updateTurn();
    }

    // One card-step = a touch more than the poster width, so the five posters sit
    // side by side with small gaps (and never overlap on smaller screens). On a
    // 1920 screen that lays out 5 across with two more peeking past the edges.
    function stepPx() {
        const w = (order[0] && order[0].el.offsetWidth) || 262;
        return w * 1.12;
    }

    // --- render: a flat filmstrip. Every card is offset from a single shared
    //     `center`, so changing `center` slides the WHOLE strip uniformly — a real
    //     carousel where nothing flies across. The five middle posters are full
    //     size; only the two at the edges are slightly smaller ("peeking"). Cards
    //     past that start tiny + transparent, so they grow + fade in "from nowhere"
    //     as they slide on (and shrink + fade out as they slide off). ---
    // Infinite (looping) coverflow: the strip wraps into an endless ring — scroll
    // past the last poster and the first re-enters from the other side. Instead of a
    // fixed card count, this engages the moment the pool has MORE posters than fit
    // across the stage — i.e. as soon as any poster would sit off-screen. On a wide
    // monitor where every poster is visible it stays a static fan (nothing to scroll
    // to); narrow the window (or add movies) and it becomes a carousel. The off-stage
    // surplus also doubles as the buffer that lets a wrapping card slide in from the
    // edge instead of popping onto a peek. Mobile uses the native scroll-snap row.
    //
    // How many full posters fit across the stage right now (poster width incl. gap).
    function fitCount() {
        const w = coverflow.clientWidth || window.innerWidth || 0;
        const step = stepPx();
        return step > 0 ? Math.max(1, Math.floor(w / step)) : order.length;
    }
    function loopEnabled() { return !cbIsMobile() && order.length > fitCount(); }

    let firstPaint = true;
    function render() {
        if (cbIsMobile()) { renderMobile(); return; }
        const step = stepPx();
        const N = order.length;
        const loop = loopEnabled();
        order.forEach((card, i) => {
            let slot = i - center;              // signed distance from centre, in cards
            // Map each card to its nearest copy around the centre so one leaving an
            // edge re-enters from the opposite side (the endless ring).
            if (loop) slot -= N * Math.round(slot / N);
            const a = Math.abs(slot);

            let scale, opacity;
            if (a <= 2.5)      { scale = 1;    opacity = 1; }     // the 5 main posters (equal, no depth)
            else if (a <= 3.5) { scale = 0.84; opacity = 0.9; }   // the 2 peeking (smaller)
            else               { scale = 0.62; opacity = 0; }     // off-stage: tiny, so it grows in
            if (card.eliminated) opacity = Math.min(opacity, a <= 3.5 ? 0.35 : 0);

            // When a card crosses the loop seam its slot flips sign by ~N. It's at
            // the off-stage (opacity 0) edge there, so snap it across with NO
            // transition — otherwise it'd visibly fly back over the whole strip on
            // the next step instead of sliding in from the near edge.
            const prev = card._slot;
            const jumped = loop && prev !== undefined && Math.abs(slot - prev) > N / 2;
            if (jumped) card.el.style.transition = "none";

            // staggered grow-from-centre entrance on the very first paint
            if (firstPaint) card.el.style.transitionDelay = `${Math.min(a, 6) * 0.05}s`;

            card.el.style.transform = `translate(calc(-50% + ${slot * step}px), -50%) scale(${scale})`;
            card.el.style.opacity = opacity;
            card.el.style.zIndex = 100 - Math.round(a);
            card.el.style.pointerEvents = opacity <= 0.05 ? "none" : "auto";
            card.el.classList.toggle("in-window", a <= 2.5 && !card.eliminated); // the pressable five

            if (jumped) { void card.el.offsetWidth; card.el.style.transition = ""; }
            card._slot = slot;
        });
        if (firstPaint) {
            firstPaint = false;
            setTimeout(() => order.forEach(c => (c.el.style.transitionDelay = "")), 1000);
        }
        updateArrows();
    }

    // Mobile: drop the absolute 3D transforms and let the CSS scroll-snap strip
    // (chopping.css ≤768px) lay the cards out. We only (a) reflow the DOM so its
    // order matches the `order` array — keeping eliminated cards at the strip's
    // ends like the desktop graveyard — and (b) clear the inline styles desktop
    // render() leaves behind so they don't fight the stylesheet. Every active
    // card is pressable here (there's no five-poster "window" on a swipe strip).
    function renderMobile() {
        order.forEach((card) => {
            track.appendChild(card.el);          // move into place (no-op if already last)
            card.el.style.transform = "";
            card.el.style.opacity = "";
            card.el.style.zIndex = "";
            card.el.style.pointerEvents = "";
            card.el.style.transitionDelay = "";
            card.el.classList.toggle("in-window", !card.eliminated);
        });
        updateMobilePeek();
    }

    // Grey out the cards that are only peeking at the strip edges, so just the two
    // fully-visible posters stay in colour. A card is "peeking" when any part of it
    // sits outside the scroll viewport. Cheap geometry, throttled to one rAF/scroll.
    function updateMobilePeek() {
        if (!cbIsMobile()) return;
        const sl = track.scrollLeft;
        const vw = track.clientWidth;
        order.forEach((card) => {
            const left = card.el.offsetLeft;            // relative to the position:relative track
            const right = left + card.el.offsetWidth;
            const fullyVisible = left >= sl - 2 && right <= sl + vw + 2;
            card.el.classList.toggle("cb-peek", !fullyVisible);
        });
    }
    let peekRaf = null;
    track.addEventListener("scroll", () => {
        if (peekRaf) return;
        peekRaf = requestAnimationFrame(() => { peekRaf = null; updateMobilePeek(); });
    }, { passive: true });

    function activeIndices() {
        return order.reduce((acc, c, i) => (c.eliminated ? acc : (acc.push(i), acc)), []);
    }
    function middleActiveIndex() {
        const a = activeIndices();
        return a.length ? a[Math.floor(a.length / 2)] : 0;
    }
    // How far the strip may scroll: stop once the end posters are in view (slot
    // ±2, clickable) — never scroll into empty space past them. If everything
    // already fits (<= 5 cards) the centre is fixed and there's nothing to scroll.
    function centerBounds() {
        const N = order.length, mid = (N - 1) / 2;
        return [Math.min(mid, 2), Math.max(mid, N - 3)];
    }
    function updateArrows() {
        // In loop mode there's always more to reveal in either direction.
        if (loopEnabled()) {
            if (prevBtn) prevBtn.classList.remove("cb-nav-off");
            if (nextBtn) nextBtn.classList.remove("cb-nav-off");
            return;
        }
        const [lo, hi] = centerBounds();
        if (prevBtn) prevBtn.classList.toggle("cb-nav-off", center <= lo + 0.01);
        if (nextBtn) nextBtn.classList.toggle("cb-nav-off", center >= hi - 0.01);
    }
    function stepCenter(dir) {
        stopMomentum();   // a discrete step (arrow/key/wheel) cancels any coast
        // Looping: let `center` run unbounded (one card crosses the seam per step);
        // render() wraps every card by modulo, so the value never needs clamping.
        if (loopEnabled()) {
            center = Math.round(center) + dir;
            render();
            return;
        }
        const [lo, hi] = centerBounds();
        center = clamp(Math.round(center) + dir, lo, hi);
        render();
    }
    function recenter() {
        const target = middleActiveIndex();
        // Looping: pick the copy of the middle active card NEAREST the current
        // centre, so re-centring after an elimination shifts the ring minimally
        // instead of snapping `center` back by a whole lap.
        if (loopEnabled()) {
            const N = order.length;
            center = target + N * Math.round((center - target) / N);
            return;
        }
        const [lo, hi] = centerBounds();
        center = clamp(target, lo, hi);
    }

    // --- eliminate a specific (visible, active) poster, then ping-pong it to a
    //     graveyard edge so the remaining valid movies stay grouped in the centre ---
    function eliminate(idx) {
        if (gameOver) return;
        const card = order[idx];
        if (!card || card.eliminated) return;

        card.eliminated = true;
        card.el.classList.add("eliminated");
        card.el.classList.remove("in-window");
        const btn = card.el.querySelector(".cb-eliminate");
        btn.textContent = "ELIMINATED";
        btn.disabled = true;

        const pushed = pingRight;            // which graveyard edge this card flies to
        order.splice(idx, 1);
        if (pushed) order.push(card); else order.unshift(card);
        pingRight = !pingRight;

        const active = activeIndices();
        if (active.length <= 1) {
            gameOver = true;                 // lock the board; the winner has been decided
            const winner = order[active[0]] || card;
            recenter();                      // the lone winner — fine to centre it
            render();
            setTimeout(() => declareWinner(winner), 560);
            return;
        }

        // Don't snap back to the middle — keep the player parked where they were
        // looking. The chopped card flies to a graveyard edge; we only nudge `center`
        // by the index shift its removal+reinsert caused near it, so the neighbour
        // that fills the gap is centred with no jump.
        if (pushed) { if (center > idx) center -= 1; }   // cards after idx slid left
        else        { if (center < idx) center += 1; }   // unshift pushed earlier cards right
        if (!loopEnabled()) {
            const [lo, hi] = centerBounds();
            center = clamp(center, lo, hi);
        }
        advanceTurn();
        render();
    }

    // --- scrolling: buttons + keyboard step one poster (each step animates the
    //     grow/shrink). The laptop touchpad's horizontal scroll spins it one
    //     poster at a time, debounced so a swipe doesn't blur past several. ---
    if (prevBtn) prevBtn.addEventListener("click", () => stepCenter(-1));
    if (nextBtn) nextBtn.addEventListener("click", () => stepCenter(1));
    document.addEventListener("keydown", (e) => {
        if (cbIsMobile()) return;                 // the touch strip scrolls natively
        if (e.key === "ArrowLeft") { e.preventDefault(); stepCenter(-1); }
        else if (e.key === "ArrowRight") { e.preventDefault(); stepCenter(1); }
    });

    let wheelAccum = 0, wheelLock = false;
    coverflow.addEventListener("wheel", (e) => {
        // On the touch strip (≤1024) the browser scrolls the row natively — don't
        // intercept the trackpad's horizontal wheel here, or we'd block that scroll.
        if (cbIsMobile()) return;
        if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;   // vertical → let the page scroll
        e.preventDefault();
        wheelAccum += e.deltaX;
        if (wheelLock || Math.abs(wheelAccum) < 24) return;
        stepCenter(Math.sign(wheelAccum));
        wheelAccum = 0;
        wheelLock = true;
        setTimeout(() => { wheelLock = false; }, 150);
    }, { passive: false });

    // --- click-and-drag scrolling (desktop): grab the strip and pull it sideways
    //     like a trackpad swipe. Pointer movement maps 1:1 to poster-widths so the
    //     cards track the cursor. A flick keeps the strip coasting after release with
    //     friction (momentum), settling on a poster once it slows down; a slow drag
    //     just settles on the nearest one. Touch (≤1024) scrolls natively. ---
    let dragging = false, dragId = null, dragStartX = 0, dragStartCenter = 0, dragMoved = false;
    // Velocity tracking (in `center` units — i.e. posters — per millisecond) and the
    // running momentum animation handle.
    let velocity = 0, lastMoveT = 0, lastMoveCenter = 0, momentumRaf = null;

    // Keep `center` inside the scrollable range (no-op while looping — that runs
    // unbounded and render() wraps every card by modulo instead).
    function clampCenter() {
        if (loopEnabled()) return;
        const [lo, hi] = centerBounds();
        center = clamp(center, lo, hi);
    }

    function stopMomentum() {
        if (momentumRaf) { cancelAnimationFrame(momentumRaf); momentumRaf = null; }
        coverflow.classList.remove("cb-coasting");
    }

    // Land on the nearest whole poster, with the card easing turned back on so the
    // final adjustment is a smooth snap rather than an instant jump.
    function settle() {
        stopMomentum();
        center = Math.round(center);
        clampCenter();
        render();
    }

    // Coast after a flick: advance `center` by the release velocity each frame while
    // friction bleeds it away, then settle once it drops below a slow-walk speed.
    const FLICK_MIN = 0.0014;   // posters/ms (~1.4 posters/sec) — below this, just settle
    const FLICK_MAX = 0.06;     // posters/ms (~60 posters/sec) — cap so a jitter can't fling it
    const FRICTION_TAU = 320;   // ms; velocity decays to ~37% every this-many ms
    function startMomentum() {
        stopMomentum();
        if (Math.abs(velocity) < FLICK_MIN) { settle(); return; }
        coverflow.classList.add("cb-coasting");   // keep transitions off while it glides
        let last = performance.now();
        const tick = (now) => {
            const dt = Math.min(now - last, 40);   // clamp long frames (tab blur) so it can't lurch
            last = now;
            center += velocity * dt;
            velocity *= Math.exp(-dt / FRICTION_TAU);
            if (!loopEnabled()) {
                const [lo, hi] = centerBounds();
                if (center <= lo || center >= hi) { settle(); return; }   // hit an end → stop dead
            }
            if (Math.abs(velocity) < FLICK_MIN) { settle(); return; }
            render();
            momentumRaf = requestAnimationFrame(tick);
        };
        momentumRaf = requestAnimationFrame(tick);
    }

    coverflow.addEventListener("pointerdown", (e) => {
        if (cbIsMobile() || e.button !== 0) return;            // touch strip / non-left → skip
        // Don't start a drag from the interactive controls — the nav arrows, the
        // ELIMINATE button, or the "i" info badge. A tiny move while pressing those
        // would otherwise turn into a drag and swallow their click. Drag begins from
        // the poster/title area (above ELIMINATE) instead.
        if (e.target.closest(".carousel-control-prev, .carousel-control-next, .cb-eliminate, .cb-info")) return;
        stopMomentum();                                        // grabbing a coasting strip catches it
        dragging = true; dragMoved = false; dragId = e.pointerId;
        dragStartX = e.clientX; dragStartCenter = center;
        velocity = 0; lastMoveT = performance.now(); lastMoveCenter = center;
        coverflow.classList.add("cb-dragging");
        // Stop the press from starting a text selection / native image-drag, both of
        // which steal the pointer and make the strip stick mid-drag.
        e.preventDefault();
        try { coverflow.setPointerCapture(e.pointerId); } catch (_) {}
    });

    // Safari/Firefox can still kick off the native image drag-and-drop on a poster;
    // cancel it outright so it never competes with our pointer drag.
    coverflow.addEventListener("dragstart", (e) => e.preventDefault());

    coverflow.addEventListener("pointermove", (e) => {
        if (!dragging || e.pointerId !== dragId) return;
        const dx = e.clientX - dragStartX;
        if (Math.abs(dx) > 4) dragMoved = true;                // past this it's a drag, not a click
        center = dragStartCenter - dx / stepPx();              // pull left → reveal posters on the right
        clampCenter();
        // Track velocity with light smoothing so a single jittery frame can't spike it.
        const now = performance.now();
        const dt = now - lastMoveT;
        if (dt > 0) {
            const inst = (center - lastMoveCenter) / dt;
            velocity = velocity * 0.6 + inst * 0.4;
            lastMoveT = now; lastMoveCenter = center;
        }
        render();
    });

    function endDrag(e) {
        if (!dragging || (e && e.pointerId !== dragId)) return;
        dragging = false; dragId = null;
        coverflow.classList.remove("cb-dragging");
        if (!dragMoved) { center = Math.round(center); clampCenter(); render(); return; }
        // If the pointer was held still just before release, there's no flick — drop
        // any stale velocity so the strip settles where the user left it.
        if (performance.now() - lastMoveT > 80) velocity = 0;
        velocity = clamp(velocity, -FLICK_MAX, FLICK_MAX);
        startMomentum();
    }
    coverflow.addEventListener("pointerup", endDrag);
    coverflow.addEventListener("pointercancel", endDrag);

    // --- mobile strip: the same grab-and-fling, but driving the native scroll
    //     container's scrollLeft instead of the coverflow transform. TOUCH keeps the
    //     browser's own inertial scroll + snap (we don't fight it); this is for MOUSE
    //     users at narrow widths (≤1024), where the strip replaces the coverflow but a
    //     mouse otherwise can't drag a native scroller. Velocity is in px/ms here. ---
    let mDragging = false, mDragId = null, mStartX = 0, mStartScroll = 0, mMoved = false;
    let mVel = 0, mLastT = 0, mLastScroll = 0, mRaf = null;
    const M_FLICK_MIN = 0.02;   // px/ms — below this, stop and let it snap
    const M_FLICK_MAX = 6;      // px/ms cap so a jitter can't fling it across

    function mStopMomentum() {
        if (mRaf) { cancelAnimationFrame(mRaf); mRaf = null; }
    }
    // Re-enable scroll-snap so the strip lands cleanly on the nearest poster (we turn
    // it off during the drag/coast so scrollLeft can move freely without re-snapping).
    function mSnap() { mStopMomentum(); track.style.scrollSnapType = ""; }

    function mStartMomentum() {
        mStopMomentum();
        if (Math.abs(mVel) < M_FLICK_MIN) { mSnap(); return; }
        let last = performance.now();
        const tick = (now) => {
            const dt = Math.min(now - last, 40); last = now;
            track.scrollLeft += mVel * dt;
            mVel *= Math.exp(-dt / FRICTION_TAU);
            const maxScroll = track.scrollWidth - track.clientWidth;
            if (track.scrollLeft <= 0 || track.scrollLeft >= maxScroll
                || Math.abs(mVel) < M_FLICK_MIN) { mSnap(); return; }   // hit an end / slowed → stop
            mRaf = requestAnimationFrame(tick);
        };
        mRaf = requestAnimationFrame(tick);
    }

    track.addEventListener("pointerdown", (e) => {
        if (!cbIsMobile() || e.pointerType !== "mouse" || e.button !== 0) return;  // touch → native
        if (e.target.closest(".cb-eliminate, .cb-info")) return;   // let their clicks through
        mStopMomentum();
        mDragging = true; mMoved = false; mDragId = e.pointerId;
        mStartX = e.clientX; mStartScroll = track.scrollLeft;
        mVel = 0; mLastT = performance.now(); mLastScroll = track.scrollLeft;
        track.style.scrollSnapType = "none";                   // scroll freely while dragging/coasting
        e.preventDefault();
        try { track.setPointerCapture(e.pointerId); } catch (_) {}
    });

    track.addEventListener("pointermove", (e) => {
        if (!mDragging || e.pointerId !== mDragId) return;
        const dx = e.clientX - mStartX;
        if (Math.abs(dx) > 4) mMoved = true;
        track.scrollLeft = mStartScroll - dx;                  // pull left → scroll right
        const now = performance.now();
        const dt = now - mLastT;
        if (dt > 0) {
            const inst = (track.scrollLeft - mLastScroll) / dt;
            mVel = mVel * 0.6 + inst * 0.4;                    // same light smoothing as desktop
            mLastT = now; mLastScroll = track.scrollLeft;
        }
    });

    function mEndDrag(e) {
        if (!mDragging || (e && e.pointerId !== mDragId)) return;
        mDragging = false; mDragId = null;
        if (!mMoved) { mSnap(); return; }
        if (performance.now() - mLastT > 80) mVel = 0;         // held still before release → no flick
        mVel = clamp(mVel, -M_FLICK_MAX, M_FLICK_MAX);
        mStartMomentum();
    }
    track.addEventListener("pointerup", mEndDrag);
    track.addEventListener("pointercancel", mEndDrag);

    // A drag that actually moved (desktop coverflow OR mobile strip) shouldn't also
    // fire the ELIMINATE/info click it happens to end on — swallow that click in the
    // capture phase, before it reaches the button handlers below. (A plain click never
    // trips either moved-flag, so it passes through.)
    coverflow.addEventListener("click", (e) => {
        if (dragMoved || mMoved) {
            e.stopPropagation(); e.preventDefault();
            dragMoved = false; mMoved = false;
        }
    }, true);

    // click an ELIMINATE button — only the five in-window posters are pressable
    track.addEventListener("click", (e) => {
        const btn = e.target.closest(".cb-eliminate");
        if (!btn) return;
        const cardEl = btn.closest(".cb-card");
        if (!cardEl || !cardEl.classList.contains("in-window")) return;
        const idx = order.findIndex(c => c.el === cardEl);
        if (idx >= 0) eliminate(idx);
    });

    // --- winner overlay (same format as Spin the Wheel) + confetti ---
    function declareWinner(card) {
        // `card` is a card object (a movie spread with { eliminated, el }), so read
        // its own id/title directly — not card.dataset (that's a DOM-element API).
        const movie = movies.find(m => m.id === card?.id) || card || movies[0];
        const overlay = document.getElementById("winnerOverlay");
        const titleEl = document.getElementById("winnerTitle");
        if (titleEl) titleEl.textContent = movie.title;
        if (overlay) overlay.classList.add("show");
        Confetti.start();          // same confetti as the Spin the Wheel winner
        updateTurn("We Have a Winner!");
    }

    const winnerClose = document.getElementById("winnerClose");
    const playAgain = document.getElementById("cbPlayAgain");
    if (winnerClose) winnerClose.addEventListener("click", () => {
        document.getElementById("winnerOverlay")?.classList.remove("show");
        Confetti.stop();
    });
    // "Play Again" goes back to the Chopping Block tab in the picker, carrying the
    // collection so the same one is re-played.
    if (playAgain) playAgain.addEventListener("click", () => {
        const c = config.collectionId != null
            ? `&collection=${encodeURIComponent(config.collectionId)}`
            : "";
        window.location.href = `picker.html?panel=chopping${c}`;
    });

    // "Back to Collection" returns to the collection page the game was played from.
    const backToCollection = document.getElementById("cbBackToCollection");
    if (backToCollection && config.collectionId != null) {
        backToCollection.setAttribute("href",
            `collection.html?id=${encodeURIComponent(config.collectionId)}`);
    }

    // --- go ---
    // Resizing can change how many posters fit (and so flip looping on/off) — re-clamp
    // `center` into the new bounds before repainting so it never lands out of range.
    window.addEventListener("resize", () => { clampCenter(); render(); });
    cbMobileMq.addEventListener("change", () => { clampCenter(); render(); }); // coverflow ⇄ scroll-snap strip
    recenter();                        // clamp the starting centre into bounds
    updateTurn();
    requestAnimationFrame(render);     // first paint with transforms in place
}

// ==========================================
// 4. CONFETTI  (self-contained; mirrors wheel.js)
// ==========================================
const Confetti = (() => {
    const colors = ["#e8453c", "#3b6fd4", "#3cae5b", "#f4d03f",
                    "#f1a0c0", "#ffffff", "#f39c12", "#9b59b6", "#86d0e0"];
    let canvas, ctx, particles = [], raf = null, spawning = false, tick = 0;

    function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }

    function spawn(count) {
        for (let i = 0; i < count; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: -20 - Math.random() * canvas.height * 0.4,
                w: 6 + Math.random() * 8, h: 8 + Math.random() * 10,
                color: colors[(Math.random() * colors.length) | 0],
                rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
                vy: 2 + Math.random() * 3, vx: (Math.random() - 0.5) * 1.5,
                sway: Math.random() * Math.PI, swaySpeed: 0.02 + Math.random() * 0.03,
            });
        }
    }

    function frame() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (spawning && tick++ % 4 === 0) spawn(6);
        for (const p of particles) {
            p.sway += p.swaySpeed;
            p.x += p.vx + Math.sin(p.sway) * 0.8;
            p.y += p.vy; p.rot += p.vr;
            ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
            ctx.fillStyle = p.color; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            ctx.restore();
        }
        particles = particles.filter(p => p.y < canvas.height + 40);
        if (spawning || particles.length) raf = requestAnimationFrame(frame);
        else { ctx.clearRect(0, 0, canvas.width, canvas.height); raf = null; }
    }

    function start() {
        canvas = canvas || document.getElementById("confettiCanvas");
        if (!canvas) return;
        ctx = canvas.getContext("2d");
        resize(); tick = 0; spawning = true; spawn(90);
        if (!raf) raf = requestAnimationFrame(frame);
        setTimeout(() => { spawning = false; }, 3500);
    }

    function stop() {
        spawning = false; particles = [];
        if (raf) { cancelAnimationFrame(raf); raf = null; }
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    window.addEventListener("resize", () => { if (raf) resize(); });
    return { start, stop };
})();
