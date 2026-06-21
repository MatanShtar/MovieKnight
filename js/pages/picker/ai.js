// ai.js — "Let AI Choose" results page (ai-suggestions.html).
//
// The picker (picker.js, AI tab) hands off the chosen collection + prompt + count
// via sessionStorage "mk:aiGame", then navigates here. We fire POST /api/ai/picker
// through MovieAPI.aiPicker(), show a pulsing loading state while the model thinks
// (2–4s), then reveal the suggestions: posters first, sliding left ~0.5s later to
// uncover each movie's AI "reason". "Try Again" re-runs the same request; a card's
// "Select Winner" raises the shared winner overlay (confetti + "View Details").

// ==========================================
// 1. STATE
// ==========================================
const REVEAL_DELAY_MS = 500;   // posters land, THEN slide to reveal the text

let aiConfig = null;   // { collectionId, collectionName, prompt, count }
let movies = [];       // the suggestions currently on screen
let loading = false;   // guards Try Again against overlapping requests

// Circle-"i" info glyph (inline so it tints with the button text colour).
const INFO_SVG = `
    <svg class="ai-info-icon" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="9"></circle>
        <line x1="12" y1="11" x2="12" y2="16"></line>
        <circle cx="12" cy="7.6" r="0.6" fill="currentColor" stroke="none"></circle>
    </svg>`;

document.addEventListener('DOMContentLoaded', () => {
    aiConfig = readConfig();

    // A direct visit (no hand-off) has nothing to pick from — send the user back
    // to the picker's AI tab to set one up.
    if (!aiConfig || aiConfig.collectionId == null) {
        if (window.toast) toast.info('Pick a collection and prompt first.');
        window.location.href = 'picker.html?panel=ai';
        return;
    }

    wireBackLink();
    setupWinnerControls();
    setupTryAgain();
    loadInitial();
});

function readConfig() {
    let cfg;
    try { cfg = JSON.parse(sessionStorage.getItem('mk:aiGame')); }
    catch { cfg = null; }
    if (!cfg || typeof cfg !== 'object') return null;
    // Clamp the count to the 1–3 the stepper offers.
    cfg.count = Math.min(3, Math.max(1, Number(cfg.count) || 3));
    return cfg;
}

// Where the whole AI flow exits to: the picker's AI tab, carrying the collection.
function pickerAiUrl() {
    return `picker.html?panel=ai&collection=${encodeURIComponent(aiConfig.collectionId)}`;
}

// "Back" returns to the picker's AI tab. We use the shared smartBack (data-back):
// it goes history.back() when there's same-origin history — and because the picker
// rewrote its own entry to ?panel=ai on SEND, that lands on the AI tab. Crucially
// history.back() does NOT push a new entry, so the picker's own Back can't bounce
// straight back here (the loop we used to have). Direct visits with no history fall
// back to the data-back href.
function wireBackLink() {
    const back = document.getElementById('aiBackBtn');
    if (!back) return;
    const href = pickerAiUrl();
    back.setAttribute('href', href);
    back.setAttribute('data-back', href);
}

// ==========================================
// 2. RUN THE PICK (cache-aware initial load → fetch / error)
// ==========================================
const RESULTS_KEY = 'mk:aiResults';

// Initial load: reuse THIS generation's cached picks if we have them — so coming
// back from a movie's "Info" shows the very same set, not a freshly generated one.
// A new SEND from the picker carries a new token, so it always generates instead.
function loadInitial() {
    const cached = readCachedResults();
    if (cached && aiConfig.token && cached.token === aiConfig.token &&
        Array.isArray(cached.movies) && cached.movies.length) {
        movies = cached.movies;
        renderCards(movies);
        return;
    }
    generate();
}

// Fetch a fresh set from the AI (first generation, and every "Try Again").
async function generate() {
    if (loading) return;
    loading = true;
    setTryAgainBusy(true);

    // Snapshot what's on screen so a FAILED attempt can leave it untouched. A
    // rate-limit / error must not replace the suggestions with a wall of error
    // text — we just toast and keep the current picks (see the catch below).
    const prev = movies.slice();
    movies = [];
    renderSkeletons(aiConfig.count);

    try {
        const results = await MovieAPI.aiPicker({
            collectionId: aiConfig.collectionId,
            prompt: aiConfig.prompt,
            count: aiConfig.count,
        });

        if (!results.length) {
            if (prev.length) {
                movies = prev;
                renderCards(movies); // keep the previous picks rather than blanking
                if (window.toast) toast.info("No new suggestions came back — keeping your current picks.");
            } else {
                clearCachedResults();
                renderEmpty("The AI didn't return any suggestions. Try a different prompt.");
            }
        } else {
            movies = results;
            cacheResults(movies);
            renderCards(movies);
        }
    } catch (err) {
        // Only a short, friendly toast — never the raw upstream error. Keep the
        // screen as it was: restore the previous picks if we had any.
        if (window.toast) toast.error(aiErrorMessage(err));
        if (prev.length) {
            movies = prev;
            renderCards(movies);
        } else {
            renderEmpty("Couldn’t get AI suggestions right now. Please try again.");
        }
    } finally {
        loading = false;
        setTryAgainBusy(false);
    }
}

// Per-generation result cache (sessionStorage), keyed by the SEND token so a back
// navigation restores the same picks while a new SEND / Try Again replaces them.
function readCachedResults() {
    try { return JSON.parse(sessionStorage.getItem(RESULTS_KEY)); }
    catch { return null; }
}
function cacheResults(list) {
    try {
        sessionStorage.setItem(RESULTS_KEY, JSON.stringify({ token: aiConfig.token, movies: list }));
    } catch (_) { /* private mode / quota — just skip caching */ }
}
function clearCachedResults() {
    try { sessionStorage.removeItem(RESULTS_KEY); } catch (_) {}
}

// A SHORT, friendly message for a failed pick — never the raw upstream error
// (Gemini's free-tier rate-limit replies are a huge wall of text). Branches on the
// status the envelope handler attaches (api.js): 400 bad input, 401 auth, 404
// collection gone, 429/503 busy (rate limit), 502 bad AI data, 504 timeout.
function aiErrorMessage(err) {
    switch (err && err.status) {
        case 400: return (err.message && err.message.length <= 100)
            ? err.message : 'Tweak your prompt and try again.';
        case 401: return 'Please sign in to use AI picks.';
        case 404: return 'That collection could not be found.';
        case 429:
        case 503: return 'The AI director is currently busy. Please try again in a few minutes!';
        case 502: return 'The AI had trouble responding. Give it another go.';
        case 504: return 'The AI took too long to answer. Try again in a moment.';
        default:  return 'Couldn’t get AI suggestions right now. Please try again.';
    }
}

// ==========================================
// 3. RENDERING
// ==========================================
function getResults() {
    return document.getElementById('aiResults');
}

// Pulsing poster placeholders for the duration of the AI call.
function renderSkeletons(count) {
    const wrap = getResults();
    if (!wrap) return;
    wrap.innerHTML = Array.from({ length: count }, () => `
        <div class="ai-card ai-card--skeleton">
            <div class="ai-card-body">
                <div class="ai-skeleton"></div>
            </div>
        </div>
    `).join('');
}

function renderEmpty(message) {
    const wrap = getResults();
    if (!wrap) return;
    wrap.innerHTML = `<div class="ai-empty">${escapeHtml(message)}</div>`;
}

function renderCards(list) {
    const wrap = getResults();
    if (!wrap) return;

    wrap.innerHTML = list.map((m, i) => {
        const title = escapeHtml(m.title || 'Untitled');
        const reason = escapeHtml(m.reason || '');
        const poster = escapeHtml(m.posterPath || '');
        const posterEl = poster
            ? `<img class="ai-poster" src="${poster}" alt="${title}" loading="lazy" decoding="async">`
            : `<div class="ai-poster"></div>`;
        return `
            <div class="ai-card" data-index="${i}">
                <div class="ai-card-body">
                    ${posterEl}
                    <div class="ai-reason">
                        <h2 class="ai-reason-title">${title}</h2>
                        <p class="ai-reason-text">${reason}</p>
                    </div>
                </div>
                <div class="ai-actions">
                    <button class="ai-info-btn" data-action="info" data-index="${i}" type="button">
                        ${INFO_SVG}<span>Info</span>
                    </button>
                    <button class="ai-winner-btn" data-action="winner" data-index="${i}" type="button">
                        Select Winner
                    </button>
                </div>
            </div>`;
    }).join('');

    // Posters land visible first; flip to the revealed state one frame later so
    // the transition runs, after the requested ~0.5s beat.
    setTimeout(() => {
        wrap.querySelectorAll('.ai-card').forEach((card, i) => {
            // A small per-card stagger keeps the reveal feeling smooth, not abrupt.
            setTimeout(() => card.classList.add('is-revealed'), i * 90);
        });
    }, REVEAL_DELAY_MS);

    wireCardActions();
}

function wireCardActions() {
    const wrap = getResults();
    if (!wrap || wrap.dataset.wired === '1') return;
    wrap.dataset.wired = '1';   // delegate once; survives re-renders
    wrap.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const movie = movies[Number(btn.dataset.index)];
        if (!movie) return;
        if (btn.dataset.action === 'info') openDetails(movie);
        else if (btn.dataset.action === 'winner') showWinner(movie);
    });
}

// Info (browsing a suggestion before a winner is chosen) returns HERE to the
// suggestions — its movie-page Back uses normal history, and our results are
// restored from cache so they don't regenerate. The winner's View Details instead
// exits the whole flow, pinning the movie-page Back to the picker's AI tab.
function openDetails(movie, { backToPicker = false } = {}) {
    if (movie.id == null) {
        if (window.toast) toast.info('No details available for this title.');
        return;
    }
    // backToPicker (winner): pin the movie Back to the picker's AI tab. Otherwise
    // (Info): leave Back to history so it returns here to the suggestions, but mark
    // from=ai so the movie page renders Back in the aligned feature style either way.
    let url = `movie.html?id=${encodeURIComponent(movie.id)}`;
    url += backToPicker ? `&back=${encodeURIComponent(pickerAiUrl())}` : '&from=ai';
    window.location.href = url;
}

// ==========================================
// 4. TRY AGAIN
// ==========================================
function setupTryAgain() {
    const btn = document.getElementById('aiTryAgain');
    if (!btn) return;
    btn.addEventListener('click', () => {
        if (loading) return;
        // Spin the arrows once on each press (CSS animation; restart it cleanly).
        btn.classList.remove('is-spinning');
        void btn.offsetWidth;        // reflow so the animation can replay
        btn.classList.add('is-spinning');
        btn.addEventListener('animationend', () => btn.classList.remove('is-spinning'),
            { once: true });
        generate();
    });
}

function setTryAgainBusy(busy) {
    const btn = document.getElementById('aiTryAgain');
    if (btn) btn.disabled = busy;
}

// ==========================================
// 5. WINNER POPUP
// ==========================================
let currentWinner = null;

function setupWinnerControls() {
    const overlay = document.getElementById('winnerOverlay');
    const close = document.getElementById('winnerClose');
    const view = document.getElementById('aiViewDetails');

    if (close) close.addEventListener('click', closeWinner);
    if (view) view.addEventListener('click', () => {
        if (currentWinner) openDetails(currentWinner, { backToPicker: true });
    });
    if (overlay) overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeWinner();
    });
}

function showWinner(movie) {
    const overlay = document.getElementById('winnerOverlay');
    const titleEl = document.getElementById('winnerTitle');
    if (!overlay || !titleEl) return;
    currentWinner = movie;
    titleEl.textContent = movie.title || '';
    overlay.classList.add('show');
    Confetti.start();
}

function closeWinner() {
    const overlay = document.getElementById('winnerOverlay');
    if (overlay) overlay.classList.remove('show');
    Confetti.stop();
}

// ==========================================
// 6. CONFETTI  (same effect as wheel.js / chopping.js)
// ==========================================
const Confetti = (() => {
    const colors = ['#e8453c', '#3b6fd4', '#3cae5b', '#f4d03f',
                    '#f1a0c0', '#ffffff', '#f39c12', '#9b59b6', '#86d0e0'];
    let canvas, ctx, particles = [], raf = null, spawning = false, tick = 0;

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    function spawn(count) {
        for (let i = 0; i < count; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: -20 - Math.random() * canvas.height * 0.4,
                w: 6 + Math.random() * 8,
                h: 8 + Math.random() * 10,
                color: colors[(Math.random() * colors.length) | 0],
                rot: Math.random() * Math.PI,
                vr: (Math.random() - 0.5) * 0.3,
                vy: 2 + Math.random() * 3,
                vx: (Math.random() - 0.5) * 1.5,
                sway: Math.random() * Math.PI,
                swaySpeed: 0.02 + Math.random() * 0.03,
            });
        }
    }

    function frame() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (spawning && tick++ % 4 === 0) spawn(6);

        for (const p of particles) {
            p.sway += p.swaySpeed;
            p.x += p.vx + Math.sin(p.sway) * 0.8;
            p.y += p.vy;
            p.rot += p.vr;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            ctx.restore();
        }
        particles = particles.filter(p => p.y < canvas.height + 40);

        if (spawning || particles.length) {
            raf = requestAnimationFrame(frame);
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            raf = null;
        }
    }

    function start() {
        canvas = canvas || document.getElementById('confettiCanvas');
        if (!canvas) return;
        ctx = canvas.getContext('2d');
        resize();
        tick = 0;
        spawning = true;
        spawn(90);
        if (!raf) raf = requestAnimationFrame(frame);
        setTimeout(() => { spawning = false; }, 3500);
    }

    function stop() {
        spawning = false;
        particles = [];
        if (raf) { cancelAnimationFrame(raf); raf = null; }
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    window.addEventListener('resize', () => { if (raf) resize(); });
    return { start, stop };
})();

// ==========================================
// 7. HELPERS
// ==========================================
function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}
