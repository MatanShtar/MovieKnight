// chopping.js — The Chopping Block game feature.
//
// One file drives two screens, picked by which DOM is present on load:
//   • picker.html   → the "Chopping Block" SETUP panel (players, eliminations,
//                     live math, validation) and the START hand-off.
//   • chopping.html → the GAME screen: a 3D coverflow carousel (Bootstrap
//                     carousel shell + custom depth), turn order, elimination
//                     with a "ping-pong graveyard", and the winner overlay.
//
// The backend collections aren't wired up yet, so everything runs off the local
// `mockCollection` below. The setup screen passes its result to the game screen
// through sessionStorage.

// ==========================================
// 0. MOCK DATA  (stand-in for a real collection)
// ==========================================
const mockCollection = [
    { id: 1,  title: "Everything Everywhere All At Once", poster_path: "assets/images/posters/everything-everywhere-all-at-once-poster.webp" },
    { id: 2,  title: "Interstellar",                      poster_path: "assets/images/posters/interstellar-poster.webp" },
    { id: 3,  title: "Parasite",                          poster_path: "assets/images/posters/parasite-poster.webp" },
    { id: 4,  title: "The Dark Knight",                   poster_path: "assets/images/posters/the-dark-knight-poster.webp" },
    { id: 5,  title: "Pulp Fiction",                      poster_path: "assets/images/posters/pulp-fiction-poster.webp" },
    { id: 6,  title: "Whiplash",                          poster_path: "assets/images/posters/whiplash-poster.webp" },
    { id: 7,  title: "Dune: Part Two",                    poster_path: "assets/images/posters/dune-part-two-poster.webp" },
    { id: 8,  title: "Oppenheimer",                       poster_path: "assets/images/posters/oppenheimer-poster.webp" },
    { id: 9,  title: "La La Land",                        poster_path: "assets/images/posters/la-la-land-poster.webp" },
    { id: 10, title: "Kill Bill",                         poster_path: "assets/images/posters/kill-bill-poster.webp" },
];

const CHOPPING_CONFIG_KEY = "choppingBlockConfig";
const POSTER_FALLBACK = "assets/images/poster-placeholder.svg";

// ==========================================
// 1. SHARED HELPERS
// ==========================================
function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => (
        { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
}

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
    // How many tags fit in the 2-column grid before we collapse the rest into a
    // "+N …" chip (8 slots = 2 columns × 4 rows; the chip occupies the 8th).
    const MAX_TAG_SLOTS = 8;

    // --- state ---
    const players = ["Matan", "Niv"]; // two seeded players, like the Figma
    let eliminations = 2;             // 1 | 2 | 3

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
        let visible, hidden = [];
        if (players.length <= MAX_TAG_SLOTS) {
            visible = players.map((n, i) => [n, i]);
        } else {
            visible = players.slice(0, MAX_TAG_SLOTS - 1).map((n, i) => [n, i]);
            hidden = players.slice(MAX_TAG_SLOTS - 1);
        }

        let html = visible.map(([n, i]) => tagHtml(n, i)).join("");
        if (hidden.length) {
            const list = hidden.map(escapeHtml).join("<br>");
            html += `
                <span class="cb-tag cb-tag-more" tabindex="0" aria-label="${hidden.length} more players">
                    +${hidden.length} &hellip;
                    <span class="cb-more-tooltip">${list}</span>
                </span>`;
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
        bump(totalMoviesEl, movies);

        const noPlayers = players.length < 1;                 // single player is allowed
        const notEnoughMovies = movies > mockCollection.length;
        const invalid = noPlayers || notEnoughMovies;

        let msg = "";
        if (noPlayers) msg = "Add at least one player to start.";
        else if (notEnoughMovies) msg = "Not enough movies in the collection.";
        errorEl.textContent = msg;
        errorEl.classList.toggle("show", !!msg);

        startBtn.disabled = invalid;
        startBtn.classList.toggle("generate-wheel-btn--disabled", invalid);
    }

    // --- wire it up ---
    renderTags();
    renderSlider();
    refresh();

    addBtn.addEventListener("click", () => addPlayer(input.value));
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); addPlayer(input.value); }
    });

    tagsEl.addEventListener("click", (e) => {
        const btn = e.target.closest(".cb-tag-remove");
        if (btn) removePlayer(Number(btn.dataset.index));
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
        }));

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
    // Read the setup; fall back to a sensible default so the page also works on
    // its own (direct visit / design diff).
    let config;
    try { config = JSON.parse(sessionStorage.getItem(CHOPPING_CONFIG_KEY)); }
    catch { config = null; }
    if (!config || !Array.isArray(config.players) || config.players.length < 1) {
        config = { players: ["Niv", "Matan"], eliminations: 2, totalMovies: 5, randomOrder: true };
    }

    const players = config.players;
    const totalMovies = Math.min(
        config.totalMovies || (players.length * config.eliminations + 1),
        mockCollection.length
    );

    // Random Order ON → shuffle the pool; OFF → take the collection in order.
    const pool = config.randomOrder ? shuffle(mockCollection) : mockCollection.slice();
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
                <img src="${escapeHtml(m.poster_path)}" alt="${escapeHtml(m.title)}"
                     onerror="this.onerror=null;this.src='${POSTER_FALLBACK}'">
            </div>
            <button class="cb-eliminate" type="button">ELIMINATE</button>`;
        track.appendChild(el);
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
    let firstPaint = true;
    function render() {
        const step = stepPx();
        order.forEach((card, i) => {
            const slot = i - center;            // signed distance from centre, in cards
            const a = Math.abs(slot);

            let scale, opacity;
            if (a <= 2.5)      { scale = 1;    opacity = 1; }     // the 5 main posters (equal, no depth)
            else if (a <= 3.5) { scale = 0.84; opacity = 0.9; }   // the 2 peeking (smaller)
            else               { scale = 0.62; opacity = 0; }     // off-stage: tiny, so it grows in
            if (card.eliminated) opacity = Math.min(opacity, a <= 3.5 ? 0.35 : 0);

            // staggered grow-from-centre entrance on the very first paint
            if (firstPaint) card.el.style.transitionDelay = `${Math.min(a, 6) * 0.05}s`;

            card.el.style.transform = `translate(calc(-50% + ${slot * step}px), -50%) scale(${scale})`;
            card.el.style.opacity = opacity;
            card.el.style.zIndex = 100 - Math.round(a);
            card.el.style.pointerEvents = opacity <= 0.05 ? "none" : "auto";
            card.el.classList.toggle("in-window", a <= 2.5 && !card.eliminated); // the pressable five
        });
        if (firstPaint) {
            firstPaint = false;
            setTimeout(() => order.forEach(c => (c.el.style.transitionDelay = "")), 1000);
        }
        updateArrows();
    }

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
        const [lo, hi] = centerBounds();
        if (prevBtn) prevBtn.classList.toggle("cb-nav-off", center <= lo + 0.01);
        if (nextBtn) nextBtn.classList.toggle("cb-nav-off", center >= hi - 0.01);
    }
    function stepCenter(dir) {
        const [lo, hi] = centerBounds();
        center = clamp(Math.round(center) + dir, lo, hi);
        render();
    }
    function recenter() {
        const [lo, hi] = centerBounds();
        center = clamp(middleActiveIndex(), lo, hi);
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

        order.splice(idx, 1);
        if (pingRight) order.push(card); else order.unshift(card);
        pingRight = !pingRight;

        const active = activeIndices();
        if (active.length <= 1) {
            gameOver = true;                 // lock the board; the winner has been decided
            const winner = order[active[0]] || card;
            recenter();
            render();
            setTimeout(() => declareWinner(winner), 560);
            return;
        }
        recenter();
        advanceTurn();
        render();
    }

    // --- scrolling: buttons + keyboard step one poster (each step animates the
    //     grow/shrink). The laptop touchpad's horizontal scroll spins it one
    //     poster at a time, debounced so a swipe doesn't blur past several. ---
    if (prevBtn) prevBtn.addEventListener("click", () => stepCenter(-1));
    if (nextBtn) nextBtn.addEventListener("click", () => stepCenter(1));
    document.addEventListener("keydown", (e) => {
        if (e.key === "ArrowLeft") { e.preventDefault(); stepCenter(-1); }
        else if (e.key === "ArrowRight") { e.preventDefault(); stepCenter(1); }
    });

    let wheelAccum = 0, wheelLock = false;
    coverflow.addEventListener("wheel", (e) => {
        if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;   // vertical → let the page scroll
        e.preventDefault();
        wheelAccum += e.deltaX;
        if (wheelLock || Math.abs(wheelAccum) < 24) return;
        stepCenter(Math.sign(wheelAccum));
        wheelAccum = 0;
        wheelLock = true;
        setTimeout(() => { wheelLock = false; }, 150);
    }, { passive: false });

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
    // "Play Again" goes back to the Chopping Block tab in the picker.
    if (playAgain) playAgain.addEventListener("click", () => window.location.href = "picker.html?panel=chopping");

    // --- go ---
    window.addEventListener("resize", render);   // keep the spread matched to the viewport
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
