// drives both the picker.html setup panel and the chopping.html game, picked by which DOM is present

const CHOPPING_CONFIG_KEY = "choppingBlockConfig";
const MIN_COLLECTION_SIZE = 2;
const POSTER_FALLBACK = "assets/images/poster-placeholder.svg";

// must match the @media breakpoint in chopping.css
const cbMobileMq = window.matchMedia("(max-width: 1024px)");
const cbIsMobile = () => cbMobileMq.matches;

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

function initSetup() {
    // mobile pills stay on one non-wrapping row, so cap lower there
    const maxTagSlots = () => (cbIsMobile() ? 3 : 8);

    const cu = (typeof currentUser !== "undefined" && currentUser) || null;
    const players = [(cu && (cu.name || cu.username)) || "Player 1"];
    let eliminations = 2;             // 1 | 2 | 3
    let selectedCollection = null;
    let overflowOpen = false;

    const input = document.getElementById("cbPlayerInput");
    const addBtn = document.getElementById("cbAddPlayerBtn");
    const tagsEl = document.getElementById("cbPlayerTags");
    const slider = document.getElementById("cbSlider");
    const totalPlayersEl = document.getElementById("cbTotalPlayers");
    const totalMoviesEl = document.getElementById("cbTotalMovies");
    const randomOrderEl = document.getElementById("cbRandomOrder");
    const errorEl = document.getElementById("cbError");
    const startBtn = document.getElementById("cbStartBtn");

    // gooey metaball filter: blur + alpha-threshold so the slider blobs merge with a liquid neck
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

    const collectionSize = () =>
        selectedCollection && Array.isArray(selectedCollection.movies)
            ? selectedCollection.movies.length
            : 0;

    const totalMovies = () => players.length * eliminations + 1;

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
            // keep hidden players' real index so the dropdown removes the right one
            hidden = players.slice(slots - 1).map((n, i) => [n, i + (slots - 1)]);
        }

        let html = visible.map(([n, i]) => tagHtml(n, i)).join("");
        if (hidden.length) {
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
            overflowOpen = false;
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

    function toggleOverflow(force) {
        overflowOpen = (force === undefined) ? !overflowOpen : force;
        const chip = document.getElementById("cbMoreChip");
        if (!chip) return;
        const box = chip.querySelector(".cb-overflow-box");
        if (box) box.hidden = !overflowOpen;
        chip.setAttribute("aria-expanded", overflowOpen ? "true" : "false");
        if (overflowOpen) requestAnimationFrame(clampOverflowBox);
    }

    // box is centred on the chip; nudge it back inside the viewport via transform so it never
    // affects flow (a centred box near the edge would cause horizontal scroll on mobile)
    function clampOverflowBox() {
        const chip = document.getElementById("cbMoreChip");
        const box = chip && chip.querySelector(".cb-overflow-box");
        if (!box || box.hidden) return;
        box.style.transform = "translateX(-50%)";   // start centred, then measure
        const rect = box.getBoundingClientRect();
        const margin = 8;
        let shift = 0;
        if (rect.right > window.innerWidth - margin) shift = (window.innerWidth - margin) - rect.right;
        else if (rect.left < margin) shift = margin - rect.left;
        if (shift) box.style.transform = `translateX(calc(-50% + ${shift}px))`;
    }
    window.addEventListener("resize", () => { if (overflowOpen) clampOverflowBox(); });

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
            // commit after the shrink so the grid reflows smoothly
            setTimeout(() => { players.splice(index, 1); renderTags(); refresh(); }, 180);
        } else {
            players.splice(index, 1); renderTags(); refresh();
        }
    }

    // tapering blobs, each lagging the one before, so the goo filter fuses them into one
    // stretching stream that flows between circles on a value change
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

    function bump(el, value) {
        if (el.textContent === String(value)) return;
        el.textContent = value;
        el.classList.remove("bump");
        void el.offsetWidth;          // restart the transition
        el.classList.add("bump");
        setTimeout(() => el.classList.remove("bump"), 220);
    }

    function refresh() {
        bump(totalPlayersEl, players.length);
        const movies = totalMovies();
        if (typeof animateCount === 'function') animateCount(totalMoviesEl, movies);
        else bump(totalMoviesEl, movies);

        const noCollection = !selectedCollection;
        const collSize = collectionSize();
        const tooSmall = !noCollection && collSize < MIN_COLLECTION_SIZE;
        const noPlayers = players.length < 1;
        const notEnoughMovies = !noCollection && !tooSmall && movies > collSize;
        const invalid = noCollection || tooSmall || noPlayers || notEnoughMovies;

        let msg = "";
        if (noCollection) msg = collectionError; // empty while loading
        else if (tooSmall) msg = `This collection has only ${collSize} movie${collSize === 1 ? "" : "s"} — add more to play.`;
        else if (noPlayers) msg = "Add at least one player to start.";
        else if (notEnoughMovies) msg = `Not enough movies — this collection has ${collSize}.`;
        errorEl.textContent = msg;
        errorEl.classList.toggle("show", !!msg);

        startBtn.disabled = invalid;
        startBtn.classList.toggle("generate-wheel-btn--disabled", invalid);
    }

    renderTags();
    renderSlider();
    refresh();

    // overflow threshold differs desktop vs mobile
    cbMobileMq.addEventListener("change", () => renderTags());

    addBtn.addEventListener("click", () => addPlayer(input.value));
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); addPlayer(input.value); }
    });

    tagsEl.addEventListener("click", (e) => {
        const btn = e.target.closest(".cb-tag-remove");
        if (btn) { removePlayer(Number(btn.dataset.index)); return; }
        const chip = e.target.closest(".cb-tag-more");
        if (chip && !e.target.closest(".cb-overflow-box")) toggleOverflow();
    });

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
        if (startBtn.disabled) return;
        sessionStorage.setItem(CHOPPING_CONFIG_KEY, JSON.stringify({
            players: players.slice(),
            eliminations,
            totalMovies: totalMovies(),
            randomOrder: !!(randomOrderEl && randomOrderEl.checked),
            collectionId: selectedCollection.id,
            collectionName: selectedCollection.name,
        }));

        // rewrite this history entry so a later Back returns to the Chopping tab, not Wheel
        try {
            history.replaceState(history.state, "",
                `picker.html?panel=chopping&collection=${encodeURIComponent(selectedCollection.id)}`);
        } catch (_) {}

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

function initGame() {
    let config;
    try { config = JSON.parse(sessionStorage.getItem(CHOPPING_CONFIG_KEY)); }
    catch { config = null; }

    if (!config || !config.collectionId) {
        showGameMessage("No game in progress",
            "Start a game from the picker to play The Chopping Block.", true);
        return;
    }
    if (!Array.isArray(config.players) || config.players.length < 1) {
        config.players = ["Niv", "Matan"];
    }

    // fallback Back target for a direct visit (smartBack still prefers history.back())
    const back = document.querySelector('.back-btn');
    if (back && config.collectionId != null) {
        const url = `picker.html?panel=chopping&collection=${encodeURIComponent(config.collectionId)}`;
        back.setAttribute('href', url);
        back.setAttribute('data-back', url);
    }

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

function runGame(config, collectionMovies) {
    const players = config.players;
    const totalMovies = Math.min(
        config.totalMovies || (players.length * config.eliminations + 1),
        collectionMovies.length
    );

    const pool = config.randomOrder ? shuffle(collectionMovies) : collectionMovies.slice();
    const movies = pool.slice(0, totalMovies);

    const turnEl = document.getElementById("cbTurn");
    const track = document.getElementById("cbTrack");
    const prevBtn = document.getElementById("cbPrev");
    const nextBtn = document.getElementById("cbNext");

    // visual left→right order; each card carries its DOM node and eliminated flag
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
        // open details in a new tab so the game stays open
        const info = el.querySelector(".cb-info");
        if (info) info.addEventListener("click", (e) => {
            e.stopPropagation();
            try { sessionStorage.setItem("mk:lastMovie", JSON.stringify(m)); } catch (_) {}
            window.open("movie.html?id=" + encodeURIComponent(m.id), "_blank", "noopener");
        });
        return { ...m, eliminated: false, el };
    });

    let center = middleActiveIndex();   // continuous carousel position, in card units
    let pingRight = true;               // first elimination → far right, then ping-pong
    let turnIndex = 0;
    let gameOver = false;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const coverflow = document.getElementById("cbCarousel");

    // hidden entirely in single-player
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

    // one card-step is a touch wider than a poster so the five sit side by side with small gaps
    function stepPx() {
        const w = (order[0] && order[0].el.offsetWidth) || 262;
        return w * 1.12;
    }

    // flat filmstrip: every card is offset from a shared `center`, so changing center slides
    // the whole strip. five middle posters full size, two edges smaller ("peeking"), rest tiny
    // + transparent so they grow in. loops into an endless ring once the pool overflows the stage
    // (a wide monitor where all fit stays a static fan). mobile uses the native scroll-snap row.

    // full posters that fit across the stage now (width incl. gap)
    function fitCount() {
        const w = coverflow.clientWidth || window.innerWidth || 0;
        const step = stepPx();
        return step > 0 ? Math.max(1, Math.floor(w / step)) : order.length;
    }
    function loopEnabled() { return !cbIsMobile() && order.length > fitCount(); }

    let firstPaint = true;
    // mobile seamless-loop state (see buildMobileLoop)
    let mobileFirstBuild = true;
    let loopActiveMobile = false;
    const mobileLoop = { homeStart: 0, realSetWidth: 0 };
    function render() {
        if (cbIsMobile()) { renderMobile(); return; }
        clearMobileClones();
        const step = stepPx();
        const N = order.length;
        const loop = loopEnabled();
        order.forEach((card, i) => {
            let slot = i - center;              // signed distance from centre, in cards
            // map to nearest copy around centre so a card leaving an edge re-enters the other side
            if (loop) slot -= N * Math.round(slot / N);
            const a = Math.abs(slot);

            let scale, opacity;
            if (a <= 2.5)      { scale = 1;    opacity = 1; }     // 5 main posters
            else if (a <= 3.5) { scale = 0.84; opacity = 0.9; }   // 2 peeking
            else               { scale = 0.62; opacity = 0; }     // off-stage, grows in
            if (card.eliminated) opacity = Math.min(opacity, a <= 3.5 ? 0.35 : 0);

            // crossing the seam flips slot sign by ~N; snap across with no transition (at the
            // off-stage edge anyway) else it'd visibly fly back over the strip
            const prev = card._slot;
            const jumped = loop && prev !== undefined && Math.abs(slot - prev) > N / 2;
            if (jumped) card.el.style.transition = "none";

            // staggered grow-from-centre entrance on first paint
            if (firstPaint) card.el.style.transitionDelay = `${Math.min(a, 6) * 0.05}s`;

            card.el.style.transform = `translate(calc(-50% + ${slot * step}px), -50%) scale(${scale})`;
            card.el.style.opacity = opacity;
            card.el.style.zIndex = 100 - Math.round(a);
            card.el.style.pointerEvents = opacity <= 0.05 ? "none" : "auto";
            card.el.classList.toggle("in-window", a <= 2.5 && !card.eliminated); // pressable

            if (jumped) { void card.el.offsetWidth; card.el.style.transition = ""; }
            card._slot = slot;
        });
        if (firstPaint) {
            firstPaint = false;
            setTimeout(() => order.forEach(c => (c.el.style.transitionDelay = "")), 1000);
        }
        updateArrows();
    }

    // mobile: drop the 3D transforms and let the CSS scroll-snap strip lay cards out. reflow the
    // DOM to match `order` and clear the inline styles desktop render() leaves so they don't fight
    // the stylesheet. every active card is pressable (no five-poster window on a swipe strip).
    function renderMobile() {
        clearMobileClones();
        order.forEach((card) => {
            track.appendChild(card.el);          // move into place (no-op if already last)
            card.el.style.transform = "";
            card.el.style.opacity = "";
            card.el.style.zIndex = "";
            card.el.style.pointerEvents = "";
            card.el.style.transitionDelay = "";
            card.el.classList.toggle("in-window", !card.eliminated);
        });
        buildMobileLoop();
        updateMobilePeek();
    }

    function clearMobileClones() {
        track.querySelectorAll(".cb-clone").forEach((n) => n.remove());
    }

    // seamless infinite loop for the native mobile scroll strip: flank the real posters with
    // cloned copies (tail block before first, head block after last), each wide enough to cover the
    // viewport. swiping into a clone zone makes wrapMobileScroll() jump scrollLeft by one lap to the
    // equivalent real posters; the content is periodic so a lap jump renders identical pixels and
    // the swipe never stops. clones are inert (aria-hidden); a tap on a clone's ELIMINATE maps back
    // to its real card by id in the click handler. only when the strip overflows.
    function buildMobileLoop() {
        loopActiveMobile = false;
        mobileLoop.realSetWidth = 0;
        const cards = order.map((c) => c.el);
        if (cards.length < 2) return;

        const first = cards[0], last = cards[cards.length - 1];
        const realWidth = (last.offsetLeft + last.offsetWidth) - first.offsetLeft;
        if (realWidth <= track.clientWidth + 1) return;     // it all fits → plain finite strip

        const leftPad = parseFloat(getComputedStyle(track).paddingLeft) || 0;
        const cardOuter = first.offsetWidth + 8;            // poster width + 8px flex gap
        const k = Math.min(cards.length, Math.ceil(track.clientWidth / cardOuter) + 1);

        const mkClone = (src) => {
            const c = src.cloneNode(true);
            c.classList.add("cb-clone");
            c.setAttribute("aria-hidden", "true");
            return c;
        };
        // head clones (first k) go after the last real card
        for (let i = 0; i < k; i++) track.appendChild(mkClone(cards[i]));
        // tail clones (last k, in order) go before the first real card
        const frag = document.createDocumentFragment();
        for (let i = cards.length - k; i < cards.length; i++) frag.appendChild(mkClone(cards[i]));
        track.insertBefore(frag, first);

        // one lap = gap from first real card to its head-clone copy
        const headCloneOfFirst = last.nextElementSibling;
        mobileLoop.realSetWidth = headCloneOfFirst.offsetLeft - first.offsetLeft;
        mobileLoop.homeStart = first.offsetLeft - leftPad;  // scroll pos that snaps first real card to start
        loopActiveMobile = true;

        if (mobileFirstBuild) {
            track.scrollLeft = mobileLoop.homeStart;
            mobileFirstBuild = false;
        } else {
            // rebuild (after elimination/resize): keep the view, folded back into the home window
            const span = mobileLoop.realSetWidth;
            const rel = (((track.scrollLeft - mobileLoop.homeStart) % span) + span) % span;
            track.scrollLeft = mobileLoop.homeStart + rel;
        }
    }

    // when the strip scrolls into a clone zone, jump back by one lap. synchronous on every scroll
    // event so a clone is never on screen long enough to be seen.
    function wrapMobileScroll() {
        if (!loopActiveMobile || mobileLoop.realSetWidth <= 0) return;
        const { homeStart, realSetWidth } = mobileLoop;
        let jump = 0;
        if (track.scrollLeft < homeStart - 0.5) jump = realSetWidth;
        else if (track.scrollLeft >= homeStart + realSetWidth - 0.5) jump = -realSetWidth;
        if (!jump) return;
        track.scrollLeft += jump;
        // shift an in-flight mouse-drag baseline by the same lap so the next pointermove doesn't undo the wrap
        if (mDragging) { mStartScroll += jump; mLastScroll += jump; }
    }

    // grey out cards only peeking at the edges (any part outside the viewport) so just the two
    // fully-visible posters stay in colour. applies to real cards and clones alike.
    function updateMobilePeek() {
        if (!cbIsMobile()) return;
        const sl = track.scrollLeft;
        const vw = track.clientWidth;
        track.querySelectorAll(".cb-card").forEach((el) => {
            const left = el.offsetLeft;                 // relative to the position:relative track
            const right = left + el.offsetWidth;
            const fullyVisible = left >= sl - 2 && right <= sl + vw + 2;
            el.classList.toggle("cb-peek", !fullyVisible);
        });
    }
    let peekRaf = null;
    track.addEventListener("scroll", () => {
        wrapMobileScroll();                 // must run promptly to stay seamless
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
    // scroll limit: stop once the end posters are in view (slot ±2, clickable), never past them
    function centerBounds() {
        const N = order.length, mid = (N - 1) / 2;
        return [Math.min(mid, 2), Math.max(mid, N - 3)];
    }
    function updateArrows() {
        // loop mode always has more either way
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
        stopMomentum();   // a discrete step cancels any coast
        // looping: let center run unbounded; render() wraps every card by modulo
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
        // looping: pick the copy of the middle active card nearest the current centre so
        // re-centring shifts the ring minimally instead of snapping back a whole lap
        if (loopEnabled()) {
            const N = order.length;
            center = target + N * Math.round((center - target) / N);
            return;
        }
        const [lo, hi] = centerBounds();
        center = clamp(target, lo, hi);
    }

    // eliminate a visible active poster, then ping-pong it to a graveyard edge so the
    // remaining movies stay grouped in the centre
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
            gameOver = true;
            const winner = order[active[0]] || card;
            recenter();
            render();
            setTimeout(() => declareWinner(winner), 560);
            return;
        }

        // don't snap to the middle; just nudge center by the index shift the removal+reinsert
        // caused near it, so the neighbour filling the gap is centred with no jump
        if (pushed) { if (center > idx) center -= 1; }   // cards after idx slid left
        else        { if (center < idx) center += 1; }   // unshift pushed earlier cards right
        if (!loopEnabled()) {
            const [lo, hi] = centerBounds();
            center = clamp(center, lo, hi);
        }
        advanceTurn();
        render();
    }

    // buttons + keyboard step one poster; the touchpad's horizontal scroll spins one at a time,
    // debounced so a swipe doesn't blur past several
    if (prevBtn) prevBtn.addEventListener("click", () => stepCenter(-1));
    if (nextBtn) nextBtn.addEventListener("click", () => stepCenter(1));
    document.addEventListener("keydown", (e) => {
        if (cbIsMobile()) return;                 // touch strip scrolls natively
        if (e.key === "ArrowLeft") { e.preventDefault(); stepCenter(-1); }
        else if (e.key === "ArrowRight") { e.preventDefault(); stepCenter(1); }
    });

    let wheelAccum = 0, wheelLock = false;
    coverflow.addEventListener("wheel", (e) => {
        // touch strip scrolls natively; don't intercept its horizontal wheel
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

    // desktop click-and-drag: pull the strip sideways, pointer maps 1:1 to poster-widths. a flick
    // keeps it coasting with friction, settling on a poster; a slow drag settles on the nearest.
    let dragging = false, dragId = null, dragStartX = 0, dragStartCenter = 0, dragMoved = false;
    // velocity in posters/ms, plus the running momentum animation handle
    let velocity = 0, lastMoveT = 0, lastMoveCenter = 0, momentumRaf = null;

    // no-op while looping (runs unbounded; render() wraps by modulo)
    function clampCenter() {
        if (loopEnabled()) return;
        const [lo, hi] = centerBounds();
        center = clamp(center, lo, hi);
    }

    function stopMomentum() {
        if (momentumRaf) { cancelAnimationFrame(momentumRaf); momentumRaf = null; }
        coverflow.classList.remove("cb-coasting");
    }

    // land on the nearest whole poster with easing back on so the snap is smooth
    function settle() {
        stopMomentum();
        center = Math.round(center);
        clampCenter();
        render();
    }

    // coast after a flick: advance center by velocity each frame while friction bleeds it away,
    // then settle once it drops below a slow walk
    const FLICK_MIN = 0.0014;   // posters/ms; below this just settle
    const FLICK_MAX = 0.06;     // posters/ms cap so a jitter can't fling it
    const FRICTION_TAU = 320;   // ms; velocity decays to ~37% per this many ms
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
        // don't start a drag from the controls; a tiny move there would swallow their click
        if (e.target.closest(".carousel-control-prev, .carousel-control-next, .cb-eliminate, .cb-info")) return;
        stopMomentum();                                        // grabbing a coasting strip catches it
        dragging = true; dragMoved = false; dragId = e.pointerId;
        dragStartX = e.clientX; dragStartCenter = center;
        velocity = 0; lastMoveT = performance.now(); lastMoveCenter = center;
        coverflow.classList.add("cb-dragging");
        // block text-selection / native image-drag, which steal the pointer and stick the strip
        e.preventDefault();
        try { coverflow.setPointerCapture(e.pointerId); } catch (_) {}
    });

    // cancel native image drag-and-drop so it never competes with the pointer drag
    coverflow.addEventListener("dragstart", (e) => e.preventDefault());

    coverflow.addEventListener("pointermove", (e) => {
        if (!dragging || e.pointerId !== dragId) return;
        const dx = e.clientX - dragStartX;
        if (Math.abs(dx) > 4) dragMoved = true;                // past this it's a drag, not a click
        center = dragStartCenter - dx / stepPx();              // pull left → reveal posters on the right
        clampCenter();
        // light smoothing so a jittery frame can't spike velocity
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
        // held still before release → no flick; drop stale velocity
        if (performance.now() - lastMoveT > 80) velocity = 0;
        velocity = clamp(velocity, -FLICK_MAX, FLICK_MAX);
        startMomentum();
    }
    coverflow.addEventListener("pointerup", endDrag);
    coverflow.addEventListener("pointercancel", endDrag);

    // mobile strip: same grab-and-fling, but driving the native scroller's scrollLeft. touch keeps
    // the browser's inertial scroll + snap; this is for mouse users at narrow widths, where a mouse
    // otherwise can't drag a native scroller. velocity in px/ms here.
    let mDragging = false, mDragId = null, mStartX = 0, mStartScroll = 0, mMoved = false;
    let mVel = 0, mLastT = 0, mLastScroll = 0, mRaf = null;
    const M_FLICK_MIN = 0.02;   // px/ms; below this stop and let it snap
    const M_FLICK_MAX = 6;      // px/ms cap so a jitter can't fling it

    function mStopMomentum() {
        if (mRaf) { cancelAnimationFrame(mRaf); mRaf = null; }
    }
    // re-enable scroll-snap (off during drag/coast so scrollLeft moves freely)
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
            // while looping the wrap handles the ends; only stop on a real edge when loop is off
            const hitEnd = !loopActiveMobile && (track.scrollLeft <= 0 || track.scrollLeft >= maxScroll);
            if (hitEnd || Math.abs(mVel) < M_FLICK_MIN) { mSnap(); return; }
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
        track.style.scrollSnapType = "none";                   // scroll freely while dragging
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
            mVel = mVel * 0.6 + inst * 0.4;
            mLastT = now; mLastScroll = track.scrollLeft;
        }
    });

    function mEndDrag(e) {
        if (!mDragging || (e && e.pointerId !== mDragId)) return;
        mDragging = false; mDragId = null;
        if (!mMoved) { mSnap(); return; }
        if (performance.now() - mLastT > 80) mVel = 0;         // held still → no flick
        mVel = clamp(mVel, -M_FLICK_MAX, M_FLICK_MAX);
        mStartMomentum();
    }
    track.addEventListener("pointerup", mEndDrag);
    track.addEventListener("pointercancel", mEndDrag);

    // a drag that moved shouldn't also fire the ELIMINATE/info click it ends on; swallow it in
    // capture phase before the button handlers (a plain click never trips the moved-flag)
    coverflow.addEventListener("click", (e) => {
        if (dragMoved || mMoved) {
            e.stopPropagation(); e.preventDefault();
            dragMoved = false; mMoved = false;
        }
    }, true);

    // only the in-window posters are pressable
    track.addEventListener("click", (e) => {
        const btn = e.target.closest(".cb-eliminate");
        if (!btn) return;
        const cardEl = btn.closest(".cb-card");
        if (!cardEl || !cardEl.classList.contains("in-window")) return;
        let idx = order.findIndex(c => c.el === cardEl);
        // a tap on a loop clone won't match by element; map to the real card by id
        if (idx < 0) idx = order.findIndex(c => String(c.id) === cardEl.dataset.id);
        if (idx >= 0) eliminate(idx);
    });

    function declareWinner(card) {
        // card is a movie spread with { eliminated, el }; read its own id/title, not card.dataset
        const movie = movies.find(m => m.id === card?.id) || card || movies[0];
        const overlay = document.getElementById("winnerOverlay");
        const titleEl = document.getElementById("winnerTitle");
        if (titleEl) titleEl.textContent = movie.title;
        if (overlay) overlay.classList.add("show");
        Confetti.start();
        updateTurn("We Have a Winner!");
    }

    const winnerClose = document.getElementById("winnerClose");
    const playAgain = document.getElementById("cbPlayAgain");
    if (winnerClose) winnerClose.addEventListener("click", () => {
        document.getElementById("winnerOverlay")?.classList.remove("show");
        Confetti.stop();
    });
    // Play Again returns to the Chopping tab carrying the collection so the same one replays
    if (playAgain) playAgain.addEventListener("click", () => {
        const c = config.collectionId != null
            ? `&collection=${encodeURIComponent(config.collectionId)}`
            : "";
        window.location.href = `picker.html?panel=chopping${c}`;
    });

    const backToCollection = document.getElementById("cbBackToCollection");
    if (backToCollection && config.collectionId != null) {
        backToCollection.setAttribute("href",
            `collection.html?id=${encodeURIComponent(config.collectionId)}`);
    }

    // resize can flip looping on/off; re-clamp center before repainting
    window.addEventListener("resize", () => { clampCenter(); render(); });
    cbMobileMq.addEventListener("change", () => { clampCenter(); render(); }); // coverflow ⇄ scroll-snap strip
    recenter();
    updateTurn();
    requestAnimationFrame(render);
}

// confetti, self-contained; mirrors wheel.js
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
