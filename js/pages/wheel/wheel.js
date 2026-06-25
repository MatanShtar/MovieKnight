// wheel.js — Drawing, physics, add/remove/rename items, and the winner popup.

// ==========================================
// 1. STATE
// ==========================================
// The free-form title cap shared by "add" and "rename".
const MAX_TITLE_LEN = 20;

// Per-collection sessionStorage key for the unsaved WORKING DRAFT. This is what lets a
// generated/edited wheel survive a page RELOAD — it is NEVER auto-saved to the server
// (the user still saves explicitly). Kept in sessionStorage so it's scoped to this tab
// and cleared automatically when the tab closes — a throwaway working copy. Keyed by
// collection so switching collections can't show the wrong draft; standalone uses ":none".
const WHEEL_DRAFT_PREFIX = "mk:wheelDraft:";

// On initial load the wheel shows two editable placeholder items. When the user
// arrives from the picker these are replaced by their chosen collection's filtered
// titles (the "mk:wheelGame" hand-off); otherwise the saved wheel is loaded from
// the server (GET /api/collections/:id/wheel — see initWheelData).
let movies = ["Movie 1", "Movie 2"];

// --- server-backed persistence state (per collection) ---
// The collection whose wheel we load/save, resolved from ?collection=<id> (or the
// last one the picker remembered). null → a standalone wheel with no server wheel.
let wheelCollectionId = null;
// Whether the signed-in user OWNS that collection (from GET /api/collections/:id).
// Only owners may PUT; a visitor on a public collection gets a read-only wheel.
let wheelIsOwner = false;
// The last array we know the server holds, used to gate the Save button and avoid
// redundant PUTs. null until the first successful load/save.
let serverWheel = null;
let savingWheel = false;       // guards overlapping PUTs

let currentWinnerIdx = -1; // index in `movies` of the movie shown in the popup

// Client-side filter applied to the editable list only (NOT the wheel itself).
// Holds the raw trimmed query; the list is matched case-insensitively against it.
let wheelFilter = "";

// True while the server-backed wheel is still loading — drives the skeleton
// placeholder (a spinning, label-less coloured wheel + shimmer list rows) and
// blocks spinning until the real movies are in.
let wheelLoading = false;
let skeletonRaf = null;

// Circled-plus glyph for the empty "add a movie" rows.
const PLUS_SVG = `
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
         stroke="#cfcfcf" stroke-width="1.6" stroke-linecap="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="16"></line>
        <line x1="8" y1="12" x2="16" y2="12"></line>
    </svg>`;

document.addEventListener('DOMContentLoaded', () => {
    // Wire the (static) UI immediately, paint placeholders, then hydrate the real
    // wheel from the server in the background.
    setupSpinPhysics();
    setupListInteractions();
    setupWinnerControls();
    setupWheelHover();
    setupSaveLoad();
    setupSearch();
    // If there's a collection to hydrate from the server, show a loading skeleton
    // instead of the editable placeholders (which read as real "Movie 1 / Movie 2"
    // titles); otherwise paint immediately. initWheelData() swaps in the real wheel.
    if (resolveWheelCollectionId()) showWheelLoading();
    else rerender();
    initWheelData();
});

// ==========================================
// 1c. CLIENT-SIDE SEARCH (filters the editable list only)
// ==========================================
// Instantly narrows the displayed edit/remove list as the user types. Pure
// client-side: re-renders only the list from the already-loaded `movies` array
// (the wheel canvas is left untouched so what you spin still matches what's saved).
function setupSearch() {
    const search = document.getElementById('wheelSearch');
    if (!search) return;
    search.addEventListener('input', () => {
        wheelFilter = search.value.trim();
        renderMovieList(movies);   // list only — does NOT redraw the wheel
    });
}

// ==========================================
// 1b. LOAD / HYDRATE THE WHEEL (server-backed, per collection)
// ==========================================
// The picker hands off the freshly genre/provider-filtered titles under
// "mk:wheelGame" (consumed once). Read it here so a fresh "Generate Wheel" shows
// those movies; null if the page was opened directly / on a refresh.
function readWheelHandoff() {
    let game;
    try { game = JSON.parse(sessionStorage.getItem('mk:wheelGame')); }
    catch { game = null; }
    if (!game || !Array.isArray(game.movies) || !game.movies.length) return null;
    sessionStorage.removeItem('mk:wheelGame');
    return game.movies.filter(Boolean);
}

// The collection whose wheel we read/write: the ?collection=<id> URL param wins,
// else the last one the picker remembered (ActiveCollection's "mk:activeCollection").
function resolveWheelCollectionId() {
    const fromUrl = new URLSearchParams(location.search).get('collection');
    if (fromUrl) return fromUrl;
    try {
        return sessionStorage.getItem('mk:activeCollection')
            || localStorage.getItem('mk:activeCollection');
    } catch (_) { return null; }
}

// Parse a stored JSON array of titles → a blanks-filtered array, or null if the key is
// absent/empty/not an array. Used by the working-draft reader (readWheelDraft).
function readStoredArray(storage, key) {
    try {
        const parsed = JSON.parse(storage.getItem(key));
        return Array.isArray(parsed) ? parsed.filter(Boolean) : null;
    } catch { return null; }
}

// ---- working draft (sessionStorage) ----
// Saved after every edit; restored on load if present, so the wheel survives a page
// RELOAD. sessionStorage means it's tab-scoped and dropped automatically when the tab
// closes — so there's nothing to clean up. A fresh picker hand-off overwrites it (see
// initWheelData). Keyed by collection (resolved in initWheelData before these run).
function wheelDraftKey() {
    return WHEEL_DRAFT_PREFIX + (wheelCollectionId || "none");
}
// Persist the on-screen wheel so a reload can restore it. Best-effort (storage may be
// full/blocked); called after every edit and after a successful save.
function saveWheelDraft() {
    try { sessionStorage.setItem(wheelDraftKey(), JSON.stringify(movies)); } catch (_) {}
}
function readWheelDraft() {
    return readStoredArray(sessionStorage, wheelDraftKey());
}

// Resolve ownership + the saved wheel from the server, then hydrate. We ALWAYS
// fetch the collection's saved wheel first so `serverWheel` is the correct baseline
// for gating Save/Load — then decide what to SHOW on top of it:
//   • a fresh picker hand-off (the user just chose filters) — shown but NOT saved;
//   • else the working draft from before a reload (sessionStorage), also unsaved;
//   • else the server's saved wheel;
//   • else the two editable placeholders.
// Nothing is ever persisted here — saving happens ONLY when the user clicks Save.
async function initWheelData() {
    const handoff = readWheelHandoff();
    wheelCollectionId = resolveWheelCollectionId();
    wireWheelBack(); // point Back's fallback at the hub for THIS collection

    const draft = readWheelDraft();

    // Paint immediately to clear the skeleton: a fresh hand-off wins, else the restored
    // draft. The server load below still runs to set the Save/Load baseline.
    if (handoff) { movies = handoff; currentRotation = 0; saveWheelDraft(); rerender(); }
    else if (draft) { movies = draft; currentRotation = 0; rerender(); }

    // No collection in context: a standalone wheel. The draft/hand-off (if any) is
    // shown above; otherwise the placeholders already painted stay. Nothing server-side.
    if (!wheelCollectionId) {
        updateButtonStates();
        return;
    }

    // Ownership + existence/visibility. A 404 here means private-and-not-yours.
    try {
        const collection = await MovieAPI.getCollection(wheelCollectionId);
        wheelIsOwner = !!(collection && collection.isOwner);
    } catch (err) {
        handleWheelLoadError(err);
        return;
    }

    // Always read the saved wheel so the buttons can be gated against it, even when
    // a fresh hand-off is about to be shown on top (so Load can pull the saved set
    // back, and Save lights up because the hand-off differs from what's stored).
    try {
        const wc = await MovieAPI.getWheel(wheelCollectionId);
        serverWheel = wc.slice();

        // A fresh picker hand-off or a restored draft is already on screen (set in the
        // early paint above) — keep it; serverWheel is now just the Save/Load baseline.
        // Only when there's neither do we fall back to this collection's saved wheel
        // (else the editable placeholders already on screen stay).
        if (!handoff && !draft && wc.length) {
            movies = wc;
            currentRotation = 0;
        }
        rerender();
    } catch (err) {
        handleWheelLoadError(err);
    }
}

// 401 → re-auth; 404 → no-access state; anything else → keep the current wheel and
// surface a transient toast (the editable placeholders still work in-memory).
function handleWheelLoadError(err) {
    stopWheelLoading();   // never leave the skeleton spinning on an error
    if (err && err.status === 401) { window.location.replace('login.html'); return; }
    if (err && err.status === 404) {
        showWheelMessage("Wheel unavailable",
            "This collection is private or doesn’t exist, so its wheel can’t be loaded.");
        return;
    }
    if (window.toast) toast.error("Couldn’t load the saved wheel. You can still spin this one.");
    rerender();   // fall back to the editable placeholders so the page is usable
}

// Replace the wheel stage with a simple message (no-access / error states).
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
    stopWheelLoading();   // real content is about to paint — drop any skeleton
    renderMovieList(movies);
    drawWheel(movies);
    updateButtonStates(); // keep "Save" enabled only when there are unsaved changes
}

// ==========================================
// 1d. LOADING SKELETON (while the server wheel hydrates)
// ==========================================
// Draw a label-less wheel of equal coloured slices — the "skeleton" the user sees
// before the real titles arrive. `rotationDeg` lets it turn gently for a loading cue.
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

    // Shimmer rows in the list box (no real titles to read).
    const listContainer = document.getElementById('wheelMovieList');
    if (listContainer) {
        listContainer.innerHTML = Array.from({ length: 6 })
            .map(() => `<div class="wheel-skeleton-row" aria-hidden="true"></div>`)
            .join("");
    }
    const countEl = document.getElementById('wheelCount');
    if (countEl) countEl.textContent = 'Loading your wheel…';

    // Dim + softly pulse the wheel, and gently rotate the coloured skeleton.
    const container = document.querySelector('.wheel-visual-container');
    if (container) container.classList.add('is-loading');

    const colors = getWheelSliceColors();
    if (skeletonRaf) cancelAnimationFrame(skeletonRaf);

    // Honour reduced-motion: draw the coloured skeleton once, no rotation.
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        drawSkeletonWheel(0, colors);
        updateButtonStates();
        return;
    }

    let deg = 0;
    const tick = () => {
        const canvas = document.getElementById('rouletteWheel');
        if (!canvas || !wheelLoading) { skeletonRaf = null; return; }
        deg = (deg + 0.35) % 360;            // slow, calming turn
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

// Back returns to the hub (picker). smartBack uses history.back() when there's
// in-app history — which lands on the hub with the user's filter selections intact
// (bfcache) — and only falls back to this href on a direct visit. Carry the
// collection id so even that fallback re-opens the hub for the right collection.
function wireWheelBack() {
    const back = document.querySelector('.back-btn');
    if (!back) return;
    const url = wheelCollectionId
        ? `picker.html?collection=${encodeURIComponent(wheelCollectionId)}`
        : 'picker.html';
    back.setAttribute('href', url);
    back.setAttribute('data-back', url);
}

// ==========================================
// 2. LIST RENDERING
// ==========================================
function renderMovieList(titles) {
    const listContainer = document.getElementById('wheelMovieList');
    if (!listContainer) return;

    // Filter client-side, but keep each row's ORIGINAL index in data-index so the
    // edit/delete handlers still target the right entry in `movies`.
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

    // A single free-text field for adding to the wheel, pinned to the top. It
    // accepts any text up to 20 chars — a movie title, or your own idea like
    // "Do nothing tonight" — submitted with Enter or the + button.
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

    // The count reflects the WHOLE wheel (titles is always the full `movies`
    // array), so it stays correct even while the search filters the visible rows.
    updateWheelCount(titles.length);
}

// Show how many movies are currently on the wheel (caption above the list).
function updateWheelCount(n) {
    const el = document.getElementById('wheelCount');
    if (!el) return;
    el.textContent = `${n} ${n === 1 ? 'movie' : 'movies'} on the wheel`;
}

// ==========================================
// 3. ADD / REMOVE INTERACTIONS
// ==========================================
function setupListInteractions() {
    const listContainer = document.getElementById('wheelMovieList');
    if (!listContainer) return;

    // Enter submits whatever is typed as free-form text. maxlength on the input
    // already caps it at 20 characters.
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
    updateButtonStates();   // enables "Save" — the user clicks it to persist
    saveWheelDraft();       // keep the reload-survival draft in sync

    // Wheel: the new slice emerges from between its two neighbouring slots.
    animateSlice(movies.length - 1, 'add');

    // List: slide the newly added (last) row in from the left.
    const rows = document.querySelectorAll('#wheelMovieList .wheel-list-item');
    const newRow = rows[rows.length - 1];
    if (newRow) {
        newRow.classList.add('is-entering');
        newRow.addEventListener('animationend',
            () => newRow.classList.remove('is-entering'), { once: true });
    }

    // renderMovieList() rebuilt the add-row, so the input is a fresh element —
    // return focus to it so the user can type the next title without clicking.
    const addInput = document.querySelector('#wheelMovieList .wheel-add-input');
    if (addInput) addInput.focus();
}

function removeMovie(index) {
    if (index < 0 || index >= movies.length) return;
    if (movies.length <= 2) {
        if (window.toast) toast.error("Keep at least two movies on the wheel.");
        return;
    }

    // List row slides out to the left; the wheel slice shrinks away in parallel.
    const row = document.querySelector(
        `#wheelMovieList .wheel-list-item[data-index="${index}"]`);
    if (row && row.classList.contains('is-leaving')) return; // already removing
    if (row) row.classList.add('is-leaving');

    // Shrink the slice out, then commit the removal and redraw at rest.
    animateSlice(index, 'remove', () => {
        movies.splice(index, 1);
        renderMovieList(movies);
        updateButtonStates();   // enables "Save"; animateSlice repaints + fades labels
        saveWheelDraft();       // keep the reload-survival draft in sync
    });
}

// ==========================================
// 3b. RENAME AN EXISTING ITEM
// ==========================================
// Clicking a row's rename (pencil) icon swaps its title for an inline input,
// capped at 20 characters like the add field. Enter / blur commits, Escape
// cancels. The wheel and Save-button state refresh once the new name settles.
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
                saveWheelDraft();   // keep the reload-survival draft in sync
            }
        }
        rerender(); // restores the title span (and refreshes the wheel + save state)
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

// ==========================================
// 3c. SAVE / LOAD (server: GET/PUT /api/collections/:id/wheel)
// ==========================================
// The current wheel exactly equals what the server holds (same titles, order)?
function wheelMatchesSaved() {
    return serverWheel !== null && JSON.stringify(serverWheel) === JSON.stringify(movies);
}

// Gate both action buttons:
//  • Save  — only when there's a collection, the user OWNS it, AND the on-screen
//    wheel differs from what the server holds (i.e. there are unsaved changes).
//  • Load  — only when the server actually has a saved wheel for this collection
//    AND loading it would change the current set (otherwise it's a no-op).
// In every other case the button is greyed out and unclickable (a visitor's wheel
// is read-only; a standalone wheel has no server state at all).
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

// PUT the current wheel for the active collection. Owner-only; the server returns
// the normalised (trimmed/capped) list, which becomes our source of truth.
async function persistWheel({ silent = false } = {}) {
    if (!wheelCollectionId || !wheelIsOwner) {
        if (!silent && window.toast) toast.info('Open a collection to save its wheel.');
        return;
    }
    if (savingWheel) return;   // a save is already in flight
    savingWheel = true;
    try {
        const saved = await MovieAPI.saveWheel(wheelCollectionId, movies);
        serverWheel = saved.slice();
        // Adopt the server's normalised list (it may have trimmed/capped entries),
        // but never yank the board out from under an in-progress spin.
        if (!isSpinning && JSON.stringify(saved) !== JSON.stringify(movies)) {
            movies = saved.slice();
            rerender();
        } else {
            updateButtonStates();
        }
        saveWheelDraft();   // draft now matches the server (until the next edit)
        if (!silent && window.toast) toast.success('Wheel saved.');
    } catch (err) {
        if (err && err.status === 401) { window.location.replace('login.html'); return; }
        // 404 here means we don't actually own it (or it's gone) — stop offering save.
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
                currentRotation = 0; // reset the spin orientation for the loaded set
                rerender();
                saveWheelDraft();    // the loaded wheel is now the working draft
                if (window.toast) toast.success('Loaded the saved wheel.');
            } catch (err) {
                if (err && err.status === 401) { window.location.replace('login.html'); return; }
                if (window.toast) toast.error("Couldn’t load the saved wheel. Please try again.");
            }
        });
    }

    updateButtonStates();
}

// ==========================================
// 4. CANVAS DRAWING LOGIC
// ==========================================

// Pull the 8 wheel slice colors out of the CSS design tokens so the palette
// stays defined in one place (tokens.css) rather than hard-coded here.
function getWheelSliceColors() {
    const styles = getComputedStyle(document.documentElement);
    return [1, 2, 3, 4, 5, 6, 7, 8]
        .map(n => styles.getPropertyValue(`--wheel-slice-${n}`).trim())
        .filter(Boolean);
}

// Each movie keeps a STABLE colour for the life of the wheel (keyed by title —
// titles are unique on a wheel), so removing one slice never re-colours the
// others (no colour "jump"). Returns one palette index per title.
let colorByTitle = new Map();
function assignSliceColors(titles, paletteLen) {
    const n = titles.length;
    if (paletteLen < 1) return titles.map(() => 0);
    // Start from each slice's remembered colour (or -1 = "needs one").
    const colors = titles.map(t => (colorByTitle.has(t) ? colorByTitle.get(t) : -1));
    // Lowest palette index (starting the search at i, for variety) that avoids
    // both neighbours' current colours.
    const pick = (avoidA, avoidB, i) => {
        for (let k = 0; k < paletteLen; k++) {
            const c = (i + k) % paletteLen;
            if (c !== avoidA && c !== avoidB) return c;
        }
        return i % paletteLen;
    };
    // Settle the cycle: assign unknowns and repair any slice that matches a
    // neighbour (including the wrap-around seam between the last and first slice).
    // A few passes converge with an 8-colour palette.
    for (let pass = 0; pass < 4; pass++) {
        let changed = false;
        for (let i = 0; i < n; i++) {
            const prev = n > 1 ? colors[(i - 1 + n) % n] : -1;
            const next = n > 2 ? colors[(i + 1) % n] : -1; // n===2: the other slice is already `prev`
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

// Draw the wheel. `weights` (one per slice, default all 1) lets a single slice
// grow in / shrink out for the add/remove animation, while the rest share the
// remaining arc — so a new title appears to emerge from between its neighbours.
function drawWheel(titles, weights, opts) {
    const canvas = document.getElementById('rouletteWheel');
    if (!canvas || titles.length === 0) return;
    const ctx = canvas.getContext('2d');

    // Labels are re-fitted (measureText + ellipsis) per slice, so re-running that every
    // frame while slices resize makes the text jiggle. add/remove pass skipLabels for
    // the in-between frames and only draw labels on the final, settled frame.
    const skipLabels = !!(opts && opts.skipLabels);
    const labelAlpha = opts && opts.labelAlpha != null ? opts.labelAlpha : 1;
    const n = titles.length;
    const w = (weights && weights.length === n) ? weights : titles.map(() => 1);
    const total = w.reduce((a, b) => a + b, 0) || 1;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = canvas.width / 2;
    const sliceColors = getWheelSliceColors();
    // Stable, no-adjacent-duplicate colour index per slice (keyed by title).
    const colorIdx = assignSliceColors(titles, sliceColors.length);

    // 10 or fewer titles read horizontally; more than 10 all switch to vertical
    // so every label is consistent and legible in the narrower wedges.
    const vertical = n > 10;

    // The whole wheel is drawn rotated by currentRotation (the spin angle), so
    // labels can be kept screen-upright while the slices turn underneath them.
    const rotationRad = currentRotation * Math.PI / 180;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Slice 0's LEADING edge is anchored at the top, then everything turns by
    // rotationRad. This anchor is independent of the slice count, so adding /
    // removing a movie can't make the wheel snap to re-centre a slice under the
    // pointer — the absolute rotation is preserved and the arrow simply lands
    // wherever it lands (off-centre or on a seam is fine).
    let startAngle = -Math.PI / 2 + rotationRad;

    titles.forEach((title, i) => {
        const sliceAngle = (w[i] / total) * 2 * Math.PI;
        const endAngle = startAngle + sliceAngle;

        // Stable per-movie colour (no jump on remove) with no two adjacent slices
        // — including the wrap-around seam — sharing a colour.
        ctx.fillStyle = sliceColors[colorIdx[i]];
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startAngle, endAngle);
        ctx.fill();

        // Skip labels mid-animation (skipLabels) and on slivers — they'd just jiggle.
        if (!skipLabels && sliceAngle > 0.05) {
            if (labelAlpha < 1) ctx.globalAlpha = labelAlpha;   // fade labels in at settle
            drawSliceLabel(ctx, title, centerX, centerY, radius, startAngle, sliceAngle, vertical);
            if (labelAlpha < 1) ctx.globalAlpha = 1;
        }
        startAngle = endAngle;
    });
}

// Draw one slice's label. `vertical` picks the orientation for the whole wheel.
// In both orientations the text is shrunk (20→11px) and, if still too long,
// ellipsis-truncated to the space that actually fits inside the slice — bounded
// by the wedge edges AND the circular rim — so it's never clipped.
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
        // HORIZONTAL — upright, screen-horizontal text centred on the slice's
        // bisector. The width is bounded by the slice chord and the circle at
        // this radius, so it never spills past the slice edges or the round rim.
        const r = radius * 0.6; // far enough out to clear the centre SPIN button
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

    // VERTICAL (radial), reading along the spoke. Length is along the radius; the
    // font is capped by how thick the wedge is at the text's mid-radius. rInner
    // starts past the centre SPIN button so labels never run underneath it.
    const rInner = radius * 0.36;
    const rOuter = radius * 0.95;
    const rMid = (rInner + rOuter) / 2;
    const radLen = rOuter - rInner;
    const wedgeThickness = 2 * rMid * Math.sin(halfAngle) * 0.8;

    let size = Math.max(FONT_MIN, Math.min(FONT_MAX, Math.floor(wedgeThickness)));
    ctx.font = font(size);
    while (!fits(title, radLen) && size > FONT_MIN) { size--; ctx.font = font(size); }
    const label = ellipsize(title, radLen);

    // Drawn along the spoke (radial). It turns with the wheel, so whichever slice
    // lands under the top pointer reads exactly vertically. No flipping — that
    // would snap mid-spin — so far-side labels simply radiate outward.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(bisector);
    ctx.fillText(label, rMid, 0);
    ctx.restore();
}

// Animate a slice growing in (add) or shrinking out (remove): its neighbours
// resize to open / close the gap, so the new title emerges from between the two
// slots it sits between. `done` runs once the tween settles.
let wheelAnim = null;
let labelFadeRaf = null;

// Fade the slice labels in over the settled wheel (slices already drawn). Avoids the
// abrupt "pop" of every label appearing at once when a resize finishes — most visible
// with many (vertical) labels on a crowded wheel.
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
    // easeInOutCubic — eases in and out so the resize glides instead of snapping.
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const step = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const e = ease(t);
        const grow = mode === 'add' ? e : 1 - e; // add 0→1, remove 1→0
        const weights = movies.map((_, i) => (i === index ? grow : 1));
        drawWheel(movies, weights, { skipLabels: true }); // no label jiggle mid-roll
        if (t < 1) {
            wheelAnim = requestAnimationFrame(step);
        } else {
            wheelAnim = null;
            if (done) done();                          // remove: splice + re-list
            drawWheel(movies, null, { skipLabels: true }); // settle the slices, no labels
            fadeInLabels();                            // then ease the labels in (no pop)
        }
    };
    wheelAnim = requestAnimationFrame(step);
}

// Hover a slice to see its full (possibly truncated) title.
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
        // Slice 0's leading edge sits at the top (matches drawWheel's anchor).
        const startOffset = -Math.PI / 2;
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

// ==========================================
// 5. SPIN PHYSICS + WINNER
// ==========================================
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

        // Spin at least 10 full turns, then stop at a random angle. We drive the
        // rotation ourselves (redrawing the canvas each frame) instead of a CSS
        // transform, so the labels can be kept upright as the slices turn.
        const startRot = currentRotation;
        const target = currentRotation + 3600 + Math.floor(Math.random() * 360);
        const duration = 5000;
        const t0 = performance.now();
        const easeOut = p => 1 - Math.pow(1 - p, 4); // long, weighted settle

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

// Which slice sits under the top pointer after the current rotation?
// Slice 0's leading edge is anchored at the top (see drawWheel), so the pointer
// falls *inside* a slice — floor() of the angle picks whichever wedge contains it.
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
    // "Keep in the Wheel" just dismisses the popup — the movie stays on the wheel.
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

// ==========================================
// 6. CONFETTI
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
        setTimeout(() => { spawning = false; }, 3500); // then let them fall out
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
