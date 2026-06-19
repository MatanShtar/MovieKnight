// chopping.js — The Chopping Block game feature.
//
// One file drives two screens, picked by which DOM is present on load:
//   • picker.html  → the "Chopping Block" SETUP panel (players, eliminations,
//                    live math, validation) and the START hand-off.
//   • chopping.html → the GAME screen (turns, carousel, elimination, winner).
//
// The backend collections aren't wired up yet, so everything temporarily runs
// off the local `mockCollection` below. The setup screen passes its result to
// the game screen through sessionStorage.

// ==========================================
// 0. MOCK DATA  (stand-in for a real collection)
// ==========================================
// Ten dummy movies. `poster_path` points at the demo posters already shipped in
// assets/; swap these for real collection items once the API is ready.
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

// Fisher–Yates: return `count` distinct random items from a list.
function pickRandom(list, count) {
    const pool = list.slice();
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, count);
}

document.addEventListener("DOMContentLoaded", () => {
    if (document.getElementById("cbSetup")) initSetup();
    if (document.getElementById("cbGame")) initGame();
});

// ==========================================
// 2. SETUP SCREEN  (picker.html → chopping panel)
// ==========================================
function initSetup() {
    const root = document.getElementById("cbSetup");

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
    const errorEl = document.getElementById("cbError");
    const startBtn = document.getElementById("cbStartBtn");

    // (Players * Eliminations) + 1
    const totalMovies = () => players.length * eliminations + 1;

    // --- render player tags (removable) ---
    function renderTags() {
        tagsEl.innerHTML = players.map((name, i) => `
            <span class="cb-tag" data-index="${i}">
                <span class="cb-tag-name">${escapeHtml(name)}</span>
                <button class="cb-tag-remove" data-index="${i}" aria-label="Remove ${escapeHtml(name)}">
                    <img src="assets/images/icons/genre-x-icon.svg" alt="">
                </button>
            </span>
        `).join("");
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
        renderTags();
        // Slide the freshly added tag in.
        const tag = tagsEl.lastElementChild;
        if (tag) {
            tag.classList.add("is-entering");
            tag.addEventListener("animationend",
                () => tag.classList.remove("is-entering"), { once: true });
        }
        input.value = "";
        input.focus();
        refresh();
    }

    function removePlayer(index) {
        const tag = tagsEl.querySelector(`.cb-tag[data-index="${index}"]`);
        if (!tag) { players.splice(index, 1); renderTags(); refresh(); return; }
        // Collapse the tag out, then commit + re-render so the rest reflow.
        tag.classList.add("is-leaving");
        tag.addEventListener("transitionend", () => {
            players.splice(index, 1);
            renderTags();
            refresh();
        }, { once: true });
    }

    // --- the 1/2/3 slider: a maroon thumb that glides between three dots ---
    function renderSlider() {
        slider.innerHTML = `
            <div class="cb-slider-track"></div>
            <div class="cb-slider-thumb" id="cbSliderThumb"></div>
            ${[1, 2, 3].map(v => `
                <button class="cb-slider-dot" data-value="${v}" aria-label="${v} per player">
                    <span class="cb-slider-num">${v}</span>
                </button>
            `).join("")}
        `;
        positionThumb();
    }

    function positionThumb() {
        const thumb = slider.querySelector("#cbSliderThumb");
        slider.querySelectorAll(".cb-slider-dot").forEach(dot => {
            dot.classList.toggle("active", Number(dot.dataset.value) === eliminations);
        });
        // Thumb (21px) glides over the selected 25px dot. The three dots sit at
        // the track's left / centre / right (flex space-between), so the thumb's
        // left travels 0 → (100% − 25px), offset 2px to centre it on the dot.
        if (thumb) thumb.style.left = `calc((100% - 25px) * ${(eliminations - 1) / 2} + 2px)`;
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

    // --- recompute the live numbers + validity on every change ---
    function refresh() {
        bump(totalPlayersEl, players.length);
        const movies = totalMovies();
        bump(totalMoviesEl, movies);

        const tooFewPlayers = players.length < 2;
        const notEnoughMovies = movies > mockCollection.length;
        const invalid = tooFewPlayers || notEnoughMovies;

        // The red "Not enough movies" message only speaks to the collection size.
        errorEl.classList.toggle("show", notEnoughMovies);

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
        positionThumb();
        refresh();
    });

    startBtn.addEventListener("click", () => {
        if (startBtn.disabled) {
            if (players.length < 2) {
                if (window.toast) toast.error("Add at least two players to start.");
            } else if (window.toast) {
                toast.error("Not enough movies in the collection.");
            }
            return;
        }
        // Hand the chosen setup to the game screen.
        sessionStorage.setItem(CHOPPING_CONFIG_KEY, JSON.stringify({
            players: players.slice(),
            eliminations,
            totalMovies: totalMovies(),
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
// 3. GAME SCREEN  (chopping.html)
// ==========================================
function initGame() {
    const root = document.getElementById("cbGame");

    // Read the setup; fall back to a sensible default so the page also works on
    // its own (e.g. a direct visit, or the design diff).
    let config;
    try { config = JSON.parse(sessionStorage.getItem(CHOPPING_CONFIG_KEY)); }
    catch { config = null; }
    if (!config || !Array.isArray(config.players) || config.players.length < 2) {
        config = { players: ["Niv", "Matan"], eliminations: 2, totalMovies: 5 };
    }

    const players = config.players;
    const totalMovies = Math.min(
        config.totalMovies || (players.length * config.eliminations + 1),
        mockCollection.length
    );

    let turnIndex = 0;        // whose turn (index into players)
    let remaining = totalMovies;

    const turnEl = document.getElementById("cbTurn");
    const carousel = document.getElementById("cbCarousel");

    // --- render the carousel of random movies ---
    const movies = pickRandom(mockCollection, totalMovies);

    function cardHtml(movie) {
        return `
            <article class="cb-card" data-id="${movie.id}">
                <div class="cb-poster">
                    <img src="${escapeHtml(movie.poster_path)}" alt="${escapeHtml(movie.title)}"
                         onerror="this.onerror=null;this.src='${POSTER_FALLBACK}'">
                </div>
                <button class="cb-eliminate" type="button">ELIMINATE</button>
                <p class="cb-card-title" title="${escapeHtml(movie.title)}">${escapeHtml(movie.title)}</p>
            </article>`;
    }

    carousel.innerHTML = movies.map(cardHtml).join("");
    updateTurn();

    // --- turn text, smoothly swapped ---
    function updateTurn() {
        const name = players[turnIndex % players.length];
        if (turnEl.textContent === `${name}’s Turn`) return;
        turnEl.classList.add("is-swapping");
        setTimeout(() => {
            turnEl.textContent = `${name}’s Turn`;
            turnEl.classList.remove("is-swapping");
        }, 180);
    }

    function advanceTurn() {
        turnIndex = (turnIndex + 1) % players.length;
        updateTurn();
    }

    // --- elimination + FLIP re-sort (dead options glide to the far right) ---
    carousel.addEventListener("click", (e) => {
        const btn = e.target.closest(".cb-eliminate");
        if (!btn) return;
        const card = btn.closest(".cb-card");
        if (!card || card.classList.contains("eliminated")) return;

        // 1. visual disabled state
        card.classList.add("eliminated");
        btn.textContent = "ELIMINATED";
        btn.disabled = true;

        // 2. slide it to the far right so live options stay grouped left
        moveToEnd(card);

        remaining--;

        // 3. last one standing wins
        if (remaining <= 1) {
            const winnerCard = carousel.querySelector(".cb-card:not(.eliminated)");
            setTimeout(() => declareWinner(winnerCard), 520);
            return;
        }
        advanceTurn();
    });

    // FLIP: record positions, reorder the DOM, then animate every card from its
    // old box to its new one so the reflow looks like a smooth slide.
    function moveToEnd(card) {
        const cards = [...carousel.children];
        const first = new Map(cards.map(c => [c, c.getBoundingClientRect()]));

        carousel.appendChild(card); // dead card to the end

        const cardsAfter = [...carousel.children];
        cardsAfter.forEach(c => {
            const before = first.get(c);
            if (!before) return;
            const after = c.getBoundingClientRect();
            const dx = before.left - after.left;
            if (!dx) return;
            c.style.transition = "none";
            c.style.transform = `translateX(${dx}px)`;
            // next frame: release to the new position
            requestAnimationFrame(() => {
                c.style.transition = "transform 0.5s var(--ease-snap)";
                c.style.transform = "";
            });
        });
    }

    // --- winner + confetti (shared overlay markup, like the wheel) ---
    function declareWinner(card) {
        const id = Number(card?.dataset.id);
        const movie = movies.find(m => m.id === id) || movies[0];

        const overlay = document.getElementById("winnerOverlay");
        const titleEl = document.getElementById("winnerTitle");
        const posterEl = document.getElementById("winnerPoster");
        if (titleEl) titleEl.textContent = movie.title;
        if (posterEl) {
            posterEl.src = movie.poster_path;
            posterEl.onerror = () => { posterEl.onerror = null; posterEl.src = POSTER_FALLBACK; };
        }
        if (overlay) overlay.classList.add("show");
        if (window.Confetti) Confetti.start();
        if (turnEl) {
            turnEl.classList.add("is-swapping");
            setTimeout(() => { turnEl.textContent = "We Have a Winner!"; turnEl.classList.remove("is-swapping"); }, 180);
        }
    }

    // close / play again
    const winnerClose = document.getElementById("winnerClose");
    const playAgain = document.getElementById("cbPlayAgain");
    const closeOverlay = () => {
        const overlay = document.getElementById("winnerOverlay");
        if (overlay) overlay.classList.remove("show");
        if (window.Confetti) Confetti.stop();
    };
    if (winnerClose) winnerClose.addEventListener("click", closeOverlay);
    if (playAgain) playAgain.addEventListener("click", () => window.location.href = "picker.html");
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
