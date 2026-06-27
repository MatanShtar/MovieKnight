const MAX_TITLE_LEN = 20;

// sessionStorage draft so an edited wheel survives reload without auto-saving to server.
// keyed by collection (standalone uses ":none").
const WHEEL_DRAFT_PREFIX = "mk:wheelDraft:";

let movies = ["Movie 1", "Movie 2"];

let wheelCollectionId = null;
// only owners may PUT; a visitor on a public collection gets a read-only wheel.
let wheelIsOwner = false;
// last array the server holds; gates the Save button. null until first load/save.
let serverWheel = null;
let savingWheel = false;

let currentWinnerIdx = -1;

let wheelFilter = "";

let wheelLoading = false;
let skeletonRaf = null;

const PLUS_SVG = `
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
         stroke="#cfcfcf" stroke-width="1.6" stroke-linecap="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="16"></line>
        <line x1="8" y1="12" x2="16" y2="12"></line>
    </svg>`;

document.addEventListener('DOMContentLoaded', () => {
    setupSpinPhysics();
    setupListInteractions();
    setupWinnerControls();
    setupWheelHover();
    setupSaveLoad();
    setupSearch();
    if (resolveWheelCollectionId()) showWheelLoading();
    else rerender();
    initWheelData();
});

function setupSearch() {
    const search = document.getElementById('wheelSearch');
    if (!search) return;
    search.addEventListener('input', () => {
        wheelFilter = search.value.trim();
        renderMovieList(movies);   // list only, not the wheel
    });
}

// picker hands off filtered titles under "mk:wheelGame" (consumed once).
function readWheelHandoff() {
    let game;
    try { game = JSON.parse(sessionStorage.getItem('mk:wheelGame')); }
    catch { game = null; }
    if (!game || !Array.isArray(game.movies) || !game.movies.length) return null;
    sessionStorage.removeItem('mk:wheelGame');
    return game.movies.filter(Boolean);
}

// ?collection=<id> wins, else the last one the picker remembered.
function resolveWheelCollectionId() {
    const fromUrl = new URLSearchParams(location.search).get('collection');
    if (fromUrl) return fromUrl;
    try {
        return sessionStorage.getItem('mk:activeCollection')
            || localStorage.getItem('mk:activeCollection');
    } catch (_) { return null; }
}

function readStoredArray(storage, key) {
    try {
        const parsed = JSON.parse(storage.getItem(key));
        return Array.isArray(parsed) ? parsed.filter(Boolean) : null;
    } catch { return null; }
}

function wheelDraftKey() {
    return WHEEL_DRAFT_PREFIX + (wheelCollectionId || "none");
}
function saveWheelDraft() {
    try { sessionStorage.setItem(wheelDraftKey(), JSON.stringify(movies)); } catch (_) {}
}
function readWheelDraft() {
    return readStoredArray(sessionStorage, wheelDraftKey());
}

// Resolve ownership + the saved wheel, then hydrate. fetch the saved wheel first so
// serverWheel is the Save/Load baseline; then show, in priority: picker hand-off, else
// pre-reload draft, else saved wheel, else placeholders. nothing persists until Save.
async function initWheelData() {
    const handoff = readWheelHandoff();
    wheelCollectionId = resolveWheelCollectionId();
    wireWheelBack();

    const draft = readWheelDraft();

    if (handoff) { movies = handoff; currentRotation = 0; saveWheelDraft(); rerender(); }
    else if (draft) { movies = draft; currentRotation = 0; rerender(); }

    if (!wheelCollectionId) {
        updateButtonStates();
        return;
    }

    // 404 here means private-and-not-yours.
    try {
        const collection = await MovieAPI.getCollection(wheelCollectionId);
        wheelIsOwner = !!(collection && collection.isOwner);
    } catch (err) {
        handleWheelLoadError(err);
        return;
    }

    // read saved wheel to gate buttons even when a hand-off is shown on top.
    try {
        const wc = await MovieAPI.getWheel(wheelCollectionId);
        serverWheel = wc.slice();

        if (!handoff && !draft && wc.length) {
            movies = wc;
            currentRotation = 0;
        }
        rerender();
    } catch (err) {
        handleWheelLoadError(err);
    }
}

function handleWheelLoadError(err) {
    stopWheelLoading();
    if (err && err.status === 401) { window.location.replace('login.html'); return; }
    if (err && err.status === 404) {
        showWheelMessage("Wheel unavailable",
            "This collection is private or doesn’t exist, so its wheel can’t be loaded.");
        return;
    }
    if (window.toast) toast.error("Couldn’t load the saved wheel. You can still spin this one.");
    rerender();
}

function showWheelMessage(title, detail) {
    const stage = document.querySelector('.wheel-stage');
    if (!stage) return;
    stage.innerHTML = `
        <div class="wheel-message">
            <h2>${escapeHtml(title)}</h2>
            <p>${escapeHtml(detail)}</p>
            <a class="save-btn" href="picker.html">Back to picker</a>
        </div>`;
}

function rerender() {
    stopWheelLoading();
    renderMovieList(movies);
    drawWheel(movies);
    updateButtonStates();
}

// label-less wheel of equal slices, shown while real titles load.
function drawSkeletonWheel(rotationDeg, colors) {
    const canvas = document.getElementById('rouletteWheel');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cx = canvas.width / 2, cy = canvas.height / 2, r = canvas.width / 2;
    const n = colors.length || 8;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let start = -Math.PI / 2 + (rotationDeg * Math.PI / 180);
    for (let i = 0; i < n; i++) {
        const end = start + (2 * Math.PI) / n;
        ctx.fillStyle = colors[i % colors.length];
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, start, end);
        ctx.fill();
        start = end;
    }
}

function showWheelLoading() {
    wheelLoading = true;

    const listContainer = document.getElementById('wheelMovieList');
    if (listContainer) {
        listContainer.innerHTML = Array.from({ length: 6 })
            .map(() => `<div class="wheel-skeleton-row" aria-hidden="true"></div>`)
            .join("");
    }
    const countEl = document.getElementById('wheelCount');
    if (countEl) countEl.textContent = 'Loading your wheel…';

    const container = document.querySelector('.wheel-visual-container');
    if (container) container.classList.add('is-loading');

    const colors = getWheelSliceColors();
    if (skeletonRaf) cancelAnimationFrame(skeletonRaf);

    // reduced-motion: draw once, no rotation.
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        drawSkeletonWheel(0, colors);
        updateButtonStates();
        return;
    }

    let deg = 0;
    const tick = () => {
        const canvas = document.getElementById('rouletteWheel');
        if (!canvas || !wheelLoading) { skeletonRaf = null; return; }
        deg = (deg + 0.35) % 360;
        drawSkeletonWheel(deg, colors);
        skeletonRaf = requestAnimationFrame(tick);
    };
    skeletonRaf = requestAnimationFrame(tick);
    updateButtonStates();
}

function stopWheelLoading() {
    if (!wheelLoading && !skeletonRaf) return;
    wheelLoading = false;
    if (skeletonRaf) { cancelAnimationFrame(skeletonRaf); skeletonRaf = null; }
    const container = document.querySelector('.wheel-visual-container');
    if (container) container.classList.remove('is-loading');
}

// carry the collection id so the direct-visit href fallback reopens the right hub.
function wireWheelBack() {
    const back = document.querySelector('.back-btn');
    if (!back) return;
    const url = wheelCollectionId
        ? `picker.html?collection=${encodeURIComponent(wheelCollectionId)}`
        : 'picker.html';
    back.setAttribute('href', url);
    back.setAttribute('data-back', url);
}

function renderMovieList(titles) {
    const listContainer = document.getElementById('wheelMovieList');
    if (!listContainer) return;

    // keep each row's original index in data-index so edit/delete target the right entry.
    const q = wheelFilter.toLowerCase();
    const matched = titles
        .map((title, i) => ({ title, i }))
        .filter(({ title }) => !q || title.toLowerCase().includes(q));

    const rowFor = ({ title, i }) => `
        <div class="wheel-list-item" data-index="${i}">
            <span class="movie-title" title="${escapeHtml(title)}">${escapeHtml(title)}</span>
            <div class="list-actions">
                <img class="row-edit" src="assets/images/icons/edit-icon.svg"
                     alt="Rename" title="Rename" data-index="${i}">
                <img class="row-delete" src="assets/images/icons/trash-icon.svg"
                     alt="Delete" title="Delete" data-index="${i}">
            </div>
        </div>
    `;

    const rows = matched.length
        ? matched.map(rowFor).join("")
        : `<div class="wheel-list-empty">No movies match &ldquo;${escapeHtml(wheelFilter)}&rdquo;.</div>`;

    const addRow = `
        <div class="wheel-add-row">
            <div class="wheel-add-field">
                <input class="wheel-add-input" type="text" maxlength="${MAX_TITLE_LEN}"
                       placeholder="Type anything, then press +"
                       aria-label="Add text to the wheel">
            </div>
            <button class="wheel-add-btn" title="Add">${PLUS_SVG}</button>
        </div>`;

    listContainer.innerHTML = addRow + rows;

    // count the whole wheel, not the filtered rows.
    updateWheelCount(titles.length);
}

function updateWheelCount(n) {
    const el = document.getElementById('wheelCount');
    if (!el) return;
    el.textContent = `${n} ${n === 1 ? 'movie' : 'movies'} on the wheel`;
}

function setupListInteractions() {
    const listContainer = document.getElementById('wheelMovieList');
    if (!listContainer) return;

    listContainer.addEventListener('keydown', (e) => {
        if (e.target.classList.contains('wheel-add-input') && e.key === 'Enter') {
            e.preventDefault();
            addMovie(e.target.value.trim());
        }
    });

    listContainer.addEventListener('click', (e) => {
        const addBtn = e.target.closest('.wheel-add-btn');
        if (addBtn) {
            const input = addBtn.closest('.wheel-add-row').querySelector('.wheel-add-input');
            addMovie(input.value.trim());
            return;
        }
        const edit = e.target.closest('.row-edit');
        if (edit) { startRename(Number(edit.dataset.index)); return; }
        const del = e.target.closest('.row-delete');
        if (del) removeMovie(Number(del.dataset.index));
    });
}

function addMovie(title) {
    if (!title) return;
    if (movies.some(m => m.toLowerCase() === title.toLowerCase())) {
        if (window.toast) toast.info(`"${title}" is already on the wheel.`);
        return;
    }
    movies.push(title);
    renderMovieList(movies);
    updateButtonStates();
    saveWheelDraft();

    animateSlice(movies.length - 1, 'add');

    const rows = document.querySelectorAll('#wheelMovieList .wheel-list-item');
    const newRow = rows[rows.length - 1];
    if (newRow) {
        newRow.classList.add('is-entering');
        newRow.addEventListener('animationend',
            () => newRow.classList.remove('is-entering'), { once: true });
    }

    // renderMovieList rebuilt the add-row, so refocus the fresh input.
    const addInput = document.querySelector('#wheelMovieList .wheel-add-input');
    if (addInput) addInput.focus();
}

function removeMovie(index) {
    if (index < 0 || index >= movies.length) return;
    if (movies.length <= 2) {
        if (window.toast) toast.error("Keep at least two movies on the wheel.");
        return;
    }

    const row = document.querySelector(
        `#wheelMovieList .wheel-list-item[data-index="${index}"]`);
    if (row && row.classList.contains('is-leaving')) return; // already removing
    if (row) row.classList.add('is-leaving');

    animateSlice(index, 'remove', () => {
        movies.splice(index, 1);
        renderMovieList(movies);
        updateButtonStates();
        saveWheelDraft();
    });
}

// Enter/blur commits, Escape cancels.
function startRename(index) {
    if (index < 0 || index >= movies.length) return;
    const row = document.querySelector(
        `#wheelMovieList .wheel-list-item[data-index="${index}"]`);
    if (!row) return;
    const titleEl = row.querySelector('.movie-title');
    if (!titleEl || row.querySelector('.wheel-rename-input')) return; // already editing

    const input = document.createElement('input');
    input.className = 'wheel-rename-input';
    input.type = 'text';
    input.maxLength = MAX_TITLE_LEN;
    input.value = movies[index];
    titleEl.replaceWith(input);
    input.focus();
    input.select();

    let settled = false;
    const commit = () => {
        if (settled) return;
        settled = true;
        const next = input.value.trim();
        if (next && next.toLowerCase() !== movies[index].toLowerCase()) {
            const dup = movies.some(
                (m, i) => i !== index && m.toLowerCase() === next.toLowerCase());
            if (dup) {
                if (window.toast) toast.info(`"${next}" is already on the wheel.`);
            } else {
                movies[index] = next;
                saveWheelDraft();
            }
        }
        rerender();
    };
    const cancel = () => {
        if (settled) return;
        settled = true;
        rerender();
    };

    input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    input.addEventListener('blur', commit);
}

function wheelMatchesSaved() {
    return serverWheel !== null && JSON.stringify(serverWheel) === JSON.stringify(movies);
}

function updateButtonStates() {
    const saveBtn = document.querySelector('.save-current-btn');
    if (saveBtn) {
        const canSave = !!wheelCollectionId && wheelIsOwner && !wheelMatchesSaved();
        saveBtn.disabled = !canSave;
        saveBtn.classList.toggle('save-btn--disabled', !canSave);
    }

    const loadBtn = document.querySelector('.load-btn');
    if (loadBtn) {
        const hasSaved = serverWheel !== null && serverWheel.length > 0;
        const canLoad = !!wheelCollectionId && hasSaved && !wheelMatchesSaved();
        loadBtn.disabled = !canLoad;
        loadBtn.classList.toggle('save-btn--disabled', !canLoad);
    }
}

// owner-only PUT; server returns the normalised list, which becomes source of truth.
async function persistWheel({ silent = false } = {}) {
    if (!wheelCollectionId || !wheelIsOwner) {
        if (!silent && window.toast) toast.info('Open a collection to save its wheel.');
        return;
    }
    if (savingWheel) return;
    savingWheel = true;
    try {
        const saved = await MovieAPI.saveWheel(wheelCollectionId, movies);
        serverWheel = saved.slice();
        // adopt the server's list, but don't yank the board mid-spin.
        if (!isSpinning && JSON.stringify(saved) !== JSON.stringify(movies)) {
            movies = saved.slice();
            rerender();
        } else {
            updateButtonStates();
        }
        saveWheelDraft();
        if (!silent && window.toast) toast.success('Wheel saved.');
    } catch (err) {
        if (err && err.status === 401) { window.location.replace('login.html'); return; }
        // 404 means we don't own it (or it's gone), stop offering save.
        if (err && err.status === 404) {
            wheelIsOwner = false;
            updateButtonStates();
            if (!silent && window.toast) toast.error("You can’t save this collection’s wheel.");
            return;
        }
        if (window.toast) toast.error("Couldn’t save the wheel. Please try again.");
    } finally {
        savingWheel = false;
    }
}

function setupSaveLoad() {
    const saveBtn = document.querySelector('.save-current-btn');
    const loadBtn = document.querySelector('.load-btn');

    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            if (saveBtn.disabled) return;
            persistWheel({ silent: false });
        });
    }

    if (loadBtn) {
        loadBtn.addEventListener('click', async () => {
            if (loadBtn.disabled) return;
            if (!wheelCollectionId) {
                if (window.toast) toast.info('Open a collection to load its wheel.');
                return;
            }
            try {
                const saved = await MovieAPI.getWheel(wheelCollectionId);
                serverWheel = saved.slice();
                if (!saved.length) {
                    if (window.toast) toast.info('No saved wheel to load yet.');
                    updateButtonStates();
                    return;
                }
                movies = saved.slice();
                currentRotation = 0;
                rerender();
                saveWheelDraft();
                if (window.toast) toast.success('Loaded the saved wheel.');
            } catch (err) {
                if (err && err.status === 401) { window.location.replace('login.html'); return; }
                if (window.toast) toast.error("Couldn’t load the saved wheel. Please try again.");
            }
        });
    }

    updateButtonStates();
}

// slice colors come from CSS tokens (tokens.css).
function getWheelSliceColors() {
    const styles = getComputedStyle(document.documentElement);
    return [1, 2, 3, 4, 5, 6, 7, 8]
        .map(n => styles.getPropertyValue(`--wheel-slice-${n}`).trim())
        .filter(Boolean);
}

// each title keeps a stable palette index so removing a slice never recolours the rest.
let colorByTitle = new Map();
function assignSliceColors(titles, paletteLen) {
    const n = titles.length;
    if (paletteLen < 1) return titles.map(() => 0);
    const colors = titles.map(t => (colorByTitle.has(t) ? colorByTitle.get(t) : -1)); // -1 = needs one
    // lowest index from i that avoids both neighbours.
    const pick = (avoidA, avoidB, i) => {
        for (let k = 0; k < paletteLen; k++) {
            const c = (i + k) % paletteLen;
            if (c !== avoidA && c !== avoidB) return c;
        }
        return i % paletteLen;
    };
    // assign unknowns and repair any slice matching a neighbour, including the wrap seam.
    for (let pass = 0; pass < 4; pass++) {
        let changed = false;
        for (let i = 0; i < n; i++) {
            const prev = n > 1 ? colors[(i - 1 + n) % n] : -1;
            const next = n > 2 ? colors[(i + 1) % n] : -1; // n===2: other slice is already prev
            if (colors[i] === -1 || colors[i] === prev || colors[i] === next) {
                const c = pick(prev, next, i);
                if (c !== colors[i]) { colors[i] = c; changed = true; }
            }
        }
        if (!changed) break;
    }
    titles.forEach((t, i) => colorByTitle.set(t, colors[i]));
    return colors;
}

// `weights` (one per slice, default 1) lets a single slice grow/shrink for the
// add/remove animation while the rest share the remaining arc.
function drawWheel(titles, weights, opts) {
    const canvas = document.getElementById('rouletteWheel');
    if (!canvas || titles.length === 0) return;
    const ctx = canvas.getContext('2d');

    // labels are re-fitted per slice, so skip them mid-resize to avoid jiggle.
    const skipLabels = !!(opts && opts.skipLabels);
    const labelAlpha = opts && opts.labelAlpha != null ? opts.labelAlpha : 1;
    const n = titles.length;
    const w = (weights && weights.length === n) ? weights : titles.map(() => 1);
    const total = w.reduce((a, b) => a + b, 0) || 1;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = canvas.width / 2;
    const sliceColors = getWheelSliceColors();
    const colorIdx = assignSliceColors(titles, sliceColors.length);

    // >10 titles switch to vertical labels to fit the narrower wedges.
    const vertical = n > 10;

    const rotationRad = currentRotation * Math.PI / 180;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // slice 0's leading edge anchored at the top, count-independent, so add/remove can't
    // snap a slice under the pointer.
    let startAngle = -Math.PI / 2 + rotationRad;

    titles.forEach((title, i) => {
        const sliceAngle = (w[i] / total) * 2 * Math.PI;
        const endAngle = startAngle + sliceAngle;

        ctx.fillStyle = sliceColors[colorIdx[i]];
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startAngle, endAngle);
        ctx.fill();

        if (!skipLabels && sliceAngle > 0.05) {
            if (labelAlpha < 1) ctx.globalAlpha = labelAlpha;
            drawSliceLabel(ctx, title, centerX, centerY, radius, startAngle, sliceAngle, vertical);
            if (labelAlpha < 1) ctx.globalAlpha = 1;
        }
        startAngle = endAngle;
    });
}

// shrink the text, then ellipsis-truncate to what fits inside the wedge and rim.
function drawSliceLabel(ctx, title, cx, cy, radius, startAngle, sliceAngle, vertical) {
    const FONT_MAX = 20, FONT_MIN = 11;
    const font = s => `${s}px 'Lao Sangam MN', sans-serif`;
    const fits = (text, w) => ctx.measureText(text).width <= w;
    const ellipsize = (text, w) => {
        if (fits(text, w)) return text;
        let t = text;
        while (t.length > 1 && !fits(t + "…", w)) t = t.slice(0, -1);
        return t + "…";
    };
    const bisector = startAngle + sliceAngle / 2;
    const halfAngle = sliceAngle / 2;

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";

    if (!vertical) {
        // horizontal: upright text on the bisector, width bounded by chord and rim.
        const r = radius * 0.6; // clears the centre spin button
        const px = cx + r * Math.cos(bisector);
        const py = cy + r * Math.sin(bisector);
        const circleW = 2 * Math.sqrt(Math.max(1, radius * radius - r * r));
        const chordW = 2 * r * Math.sin(halfAngle);
        const maxW = Math.min(circleW, chordW) * 0.86;

        let size = FONT_MAX;
        ctx.font = font(size);
        while (!fits(title, maxW) && size > FONT_MIN) { size--; ctx.font = font(size); }
        ctx.fillText(ellipsize(title, maxW), px, py);
        return;
    }

    // vertical (radial) along the spoke; font capped by wedge thickness at mid-radius.
    // rInner starts past the centre spin button.
    const rInner = radius * 0.36;
    const rOuter = radius * 0.95;
    const rMid = (rInner + rOuter) / 2;
    const radLen = rOuter - rInner;
    const wedgeThickness = 2 * rMid * Math.sin(halfAngle) * 0.8;

    let size = Math.max(FONT_MIN, Math.min(FONT_MAX, Math.floor(wedgeThickness)));
    ctx.font = font(size);
    while (!fits(title, radLen) && size > FONT_MIN) { size--; ctx.font = font(size); }
    const label = ellipsize(title, radLen);

    // no flipping (would snap mid-spin), so far-side labels radiate outward.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(bisector);
    ctx.fillText(label, rMid, 0);
    ctx.restore();
}

let wheelAnim = null;
let labelFadeRaf = null;

// fade labels in over the settled wheel to avoid every label popping at once.
function fadeInLabels() {
    if (labelFadeRaf) cancelAnimationFrame(labelFadeRaf);
    const dur = 180;
    const t0 = performance.now();
    const tick = (now) => {
        const a = Math.min(1, (now - t0) / dur);
        drawWheel(movies, null, { labelAlpha: a });
        labelFadeRaf = a < 1 ? requestAnimationFrame(tick) : null;
    };
    labelFadeRaf = requestAnimationFrame(tick);
}

function animateSlice(index, mode, done) {
    const canvas = document.getElementById('rouletteWheel');
    if (!canvas) { if (done) done(); return; }
    if (wheelAnim) cancelAnimationFrame(wheelAnim);
    if (labelFadeRaf) { cancelAnimationFrame(labelFadeRaf); labelFadeRaf = null; }

    const duration = 360;
    const start = performance.now();
    // easeInOutCubic
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const step = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const e = ease(t);
        const grow = mode === 'add' ? e : 1 - e; // add 0→1, remove 1→0
        const weights = movies.map((_, i) => (i === index ? grow : 1));
        drawWheel(movies, weights, { skipLabels: true });
        if (t < 1) {
            wheelAnim = requestAnimationFrame(step);
        } else {
            wheelAnim = null;
            if (done) done();
            drawWheel(movies, null, { skipLabels: true });
            fadeInLabels();
        }
    };
    wheelAnim = requestAnimationFrame(step);
}

// hover a slice to see its full title.
function setupWheelHover() {
    const canvas = document.getElementById('rouletteWheel');
    if (!canvas) return;

    const tip = document.createElement('div');
    tip.className = 'wheel-tooltip';
    document.body.appendChild(tip);

    canvas.addEventListener('mousemove', (e) => {
        if (wheelLoading || isSpinning || movies.length === 0) { tip.classList.remove('show'); return; }

        const rect = canvas.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        const dist = Math.hypot(dx, dy);
        const r = rect.width / 2;
        if (dist > r || dist < r * 0.12) { tip.classList.remove('show'); return; }

        const n = movies.length;
        const sliceAngle = (2 * Math.PI) / n;
        const startOffset = -Math.PI / 2; // matches drawWheel's anchor

        const rot = currentRotation * Math.PI / 180;
        let a = Math.atan2(dy, dx) - rot - startOffset;
        a = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        const idx = Math.floor(a / sliceAngle) % n;

        tip.textContent = movies[idx];
        tip.style.left = `${e.clientX + 14}px`;
        tip.style.top = `${e.clientY + 14}px`;
        tip.classList.add('show');
    });

    canvas.addEventListener('mouseleave', () => tip.classList.remove('show'));
}

let currentRotation = 0;
let isSpinning = false;

function setupSpinPhysics() {
    const spinBtn = document.getElementById('spinBtn');
    const canvas = document.getElementById('rouletteWheel');
    if (!spinBtn || !canvas) return;

    spinBtn.addEventListener('click', () => {
        if (wheelLoading || isSpinning || movies.length === 0) return;

        isSpinning = true;
        spinBtn.classList.add('spinning');

        // 10 full turns then a random angle; we drive rotation per-frame (not CSS) so
        // labels stay upright as slices turn.
        const startRot = currentRotation;
        const target = currentRotation + 3600 + Math.floor(Math.random() * 360);
        const duration = 5000;
        const t0 = performance.now();
        const easeOut = p => 1 - Math.pow(1 - p, 4);

        const step = (now) => {
            const p = Math.min(1, (now - t0) / duration);
            currentRotation = startRot + (target - startRot) * easeOut(p);
            drawWheel(movies);
            if (p < 1) {
                requestAnimationFrame(step);
            } else {
                currentRotation = target;
                drawWheel(movies);
                isSpinning = false;
                spinBtn.classList.remove('spinning');
                showWinner(getWinningIndex());
            }
        };
        requestAnimationFrame(step);
    });
}

// which slice sits under the top pointer after the current rotation.
function getWinningIndex() {
    const n = movies.length;
    const sliceDeg = 360 / n;
    const rot = ((currentRotation % 360) + 360) % 360;
    return Math.floor(((360 - rot) % 360) / sliceDeg) % n;
}

function setupWinnerControls() {
    const overlay = document.getElementById('winnerOverlay');
    const close = document.getElementById('winnerClose');
    const remove = document.getElementById('winnerRemove');
    const keep = document.getElementById('winnerKeep');

    if (close) close.addEventListener('click', closeWinner);
    if (keep) keep.addEventListener('click', closeWinner);
    if (remove) remove.addEventListener('click', () => {
        if (currentWinnerIdx >= 0) removeMovie(currentWinnerIdx);
        closeWinner();
    });
    if (overlay) overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeWinner();
    });
}

function showWinner(index) {
    const overlay = document.getElementById('winnerOverlay');
    const titleEl = document.getElementById('winnerTitle');
    if (!overlay || !titleEl) return;

    currentWinnerIdx = index;
    titleEl.textContent = movies[index];
    overlay.classList.add('show');
    Confetti.start();
}

function closeWinner() {
    const overlay = document.getElementById('winnerOverlay');
    if (overlay) overlay.classList.remove('show');
    Confetti.stop();
}

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

// escapeHtml() is the shared global from js/core/common.js, loaded before this script.
