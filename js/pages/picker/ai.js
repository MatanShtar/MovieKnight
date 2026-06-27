// "Let AI Choose" results page (ai-suggestions.html).

const REVEAL_DELAY_MS = 500;

let aiConfig = null;
let movies = [];
let loading = false;
let rerollUsed = false; // try again is allowed once per result set

// inline svg so it tints with currentColor
const INFO_SVG = `
    <svg class="ai-info-icon" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="9"></circle>
        <line x1="12" y1="11" x2="12" y2="16"></line>
        <circle cx="12" cy="7.6" r="0.6" fill="currentColor" stroke="none"></circle>
    </svg>`;

document.addEventListener('DOMContentLoaded', () => {
    aiConfig = readConfig();

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
    cfg.count = Math.min(3, Math.max(1, Number(cfg.count) || 3));
    return cfg;
}

function pickerAiUrl() {
    return `picker.html?panel=ai&collection=${encodeURIComponent(aiConfig.collectionId)}`;
}

function wireBackLink() {
    const back = document.getElementById('aiBackBtn');
    if (!back) return;
    const href = pickerAiUrl();
    back.setAttribute('href', href);
    back.setAttribute('data-back', href);
}

const RESULTS_KEY = 'mk:aiResults';

// reuse cached picks for this run; keyed by send token so a new send regenerates
function loadInitial() {
    const cached = readCachedResults();
    if (cached && aiConfig.token && cached.token === aiConfig.token &&
        Array.isArray(cached.movies) && cached.movies.length) {
        movies = dedupeById(cached.movies);
        rerollUsed = !!cached.rerollUsed;
        renderCards(movies);
        updateTryAgainVisibility();
        return;
    }

    generate();
}

// a reroll sends on-screen ids as a soft exclude_ids filter and is consumed on success
async function generate(isReroll = false) {
    if (loading) return;
    if (isReroll && rerollUsed) return;
    loading = true;
    setTryAgainBusy(true);

    // snapshot so a failed attempt can restore current picks
    const prev = movies.slice();
    // soft filter: backend may still reuse ids to fill the count, so dedupe below still matters
    const excludeIds = isReroll ? prev.map((m) => m && m.id) : [];
    movies = [];
    renderSkeletons(aiConfig.count);

    try {
        const results = await MovieAPI.aiPicker({
            collectionId: aiConfig.collectionId,
            prompt: aiConfig.prompt,
            count: aiConfig.count,
            exclude_ids: excludeIds,
        });

        if (!results.length) {
            if (prev.length) {
                movies = prev;
                renderCards(movies);
                if (window.toast) toast.info("No new suggestions came back — keeping your current picks.");
            } else {
                clearCachedResults();
                renderEmpty("The AI didn't return any suggestions. Try a different prompt.");
            }
        } else {
            movies = dedupeById(results);
            if (isReroll) rerollUsed = true;
            cacheResults(movies);
            renderCards(movies);
            updateTryAgainVisibility();
        }
    } catch (err) {
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
        updateTryAgainVisibility();
    }
}

// dedupe by id, preserving order; id-less entries are kept
function dedupeById(list) {
    const seen = new Set();
    return (Array.isArray(list) ? list : []).filter((m) => {
        if (!m || m.id == null) return !!m;
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
    });
}

// localStorage (not session) so picks survive a reload and tab close
function readCachedResults() {
    try { return JSON.parse(localStorage.getItem(RESULTS_KEY)); }
    catch { return null; }
}
function cacheResults(list) {
    try {
        localStorage.setItem(RESULTS_KEY, JSON.stringify({
            token: aiConfig.token, movies: list, rerollUsed,
        }));
    } catch (_) { /* storage full or disabled, skip */ }
}
function clearCachedResults() {
    try { localStorage.removeItem(RESULTS_KEY); } catch (_) {}
}

// friendly message keyed off the status api.js attaches; never the raw upstream error
function aiErrorMessage(err) {
    // quota exhausted is also a 429 but flagged by a distinct code; surface its message
    if (err && err.code === MovieAPI.AI_LIMIT_CODE) return err.message;
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

function getResults() {
    return document.getElementById('aiResults');
}

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

    // posters land visible, then flip to revealed a frame later so the transition runs (staggered)
    setTimeout(() => {
        wrap.querySelectorAll('.ai-card').forEach((card, i) => {
            setTimeout(() => card.classList.add('is-revealed'), i * 90);
        });
    }, REVEAL_DELAY_MS);

    wireCardActions();
}

function wireCardActions() {
    const wrap = getResults();
    if (!wrap || wrap.dataset.wired === '1') return;
    wrap.dataset.wired = '1';   // delegate once, survives re-renders
    wrap.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const movie = movies[Number(btn.dataset.index)];
        if (!movie) return;
        if (btn.dataset.action === 'info') openDetails(movie);
        else if (btn.dataset.action === 'winner') showWinner(movie);
    });
}

// backToPicker (winner) pins the movie page Back to the AI tab; Info uses from=ai
function openDetails(movie, { backToPicker = false } = {}) {
    if (movie.id == null) {
        if (window.toast) toast.info('No details available for this title.');
        return;
    }
    let url = `movie.html?id=${encodeURIComponent(movie.id)}`;
    url += backToPicker ? `&back=${encodeURIComponent(pickerAiUrl())}` : '&from=ai';
    // new tab so the suggestions stay put behind it
    window.open(url, "_blank", "noopener");
}

function setupTryAgain() {
    const btn = document.getElementById('aiTryAgain');
    if (!btn) return;
    btn.addEventListener('click', () => {
        if (loading || rerollUsed) return;
        // a reroll spends an AI action; stop if the daily quota is gone
        if (window.MovieAPI && MovieAPI.aiActionsRemaining() <= 0) {
            if (window.toast) toast.warn(MovieAPI.aiLimitReachedMessage());
            return;
        }
        // generate()'s finally brings it back if the reroll fails
        btn.hidden = true;
        generate(true);
    });
}

function setTryAgainBusy(busy) {
    const btn = document.getElementById('aiTryAgain');
    if (btn) btn.disabled = busy || rerollUsed;
}

function updateTryAgainVisibility() {
    const btn = document.getElementById('aiTryAgain');
    if (!btn) return;
    btn.hidden = rerollUsed;
    btn.disabled = rerollUsed;
}

let currentWinner = null;

function setupWinnerControls() {
    const overlay = document.getElementById('winnerOverlay');
    const close = document.getElementById('winnerClose');
    const view = document.getElementById('aiViewDetails');
    const back = document.getElementById('aiBackToCollection');

    if (close) close.addEventListener('click', closeWinner);
    if (view) view.addEventListener('click', () => {
        if (currentWinner) openDetails(currentWinner, { backToPicker: true });
    });
    if (back && aiConfig && aiConfig.collectionId != null) {
        back.setAttribute('href',
            `collection.html?id=${encodeURIComponent(aiConfig.collectionId)}`);
    }
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

// confetti, same effect as wheel.js / chopping.js
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

// escapeHtml() is a shared global from js/core/common.js
