// wheel.js — Drawing, physics, movie search/add, and the winner popup.

// ==========================================
// 1. STATE
// ==========================================
// localStorage key + the free-form title cap shared by "add" and "rename".
const WHEEL_STORAGE_KEY = "movieKnightWheel";
const MAX_TITLE_LEN = 20;

// On initial load the wheel shows two editable placeholder items. (Saved wheels
// are restored explicitly via the "Load Latest Wheel" button, not automatically.)
let movies = ["Movie 1", "Movie 2"];

let currentWinnerIdx = -1; // index in `movies` of the movie shown in the popup

// Circled-plus glyph for the empty "add a movie" rows.
const PLUS_SVG = `
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
         stroke="#cfcfcf" stroke-width="1.6" stroke-linecap="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="16"></line>
        <line x1="8" y1="12" x2="16" y2="12"></line>
    </svg>`;

document.addEventListener('DOMContentLoaded', () => {
    rerender();
    setupSpinPhysics();
    setupListInteractions();
    setupWinnerControls();
    setupWheelHover();
    setupSaveLoad();
});

function rerender() {
    renderMovieList(movies);
    drawWheel(movies);
    updateSaveButtonState(); // keep "Save" enabled only when there are unsaved changes
}

// ==========================================
// 2. LIST RENDERING
// ==========================================
function renderMovieList(titles) {
    const listContainer = document.getElementById('wheelMovieList');
    if (!listContainer) return;

    const rows = titles.map((title, i) => `
        <div class="wheel-list-item" data-index="${i}">
            <span class="movie-title" title="${escapeHtml(title)}">${escapeHtml(title)}</span>
            <div class="list-actions">
                <img class="row-edit" src="assets/images/icons/edit-icon.svg"
                     alt="Rename" title="Rename" data-index="${i}">
                <img class="row-delete" src="assets/images/icons/trash-icon.svg"
                     alt="Delete" title="Delete" data-index="${i}">
            </div>
        </div>
    `).join("");

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
}

// ==========================================
// 3. SEARCH + ADD / REMOVE INTERACTIONS
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
    updateSaveButtonState();

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
        drawWheel(movies);
        updateSaveButtonState();
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
// 3c. SAVE / LOAD (localStorage: "movieKnightWheel")
// ==========================================
function getSavedWheel() {
    try {
        const parsed = JSON.parse(localStorage.getItem(WHEEL_STORAGE_KEY));
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

// The current wheel exactly equals what's saved (same titles, same order)?
function wheelMatchesSaved() {
    const saved = getSavedWheel();
    return saved !== null && JSON.stringify(saved) === JSON.stringify(movies);
}

// Save is pointless when there's nothing new to save — grey it out then.
function updateSaveButtonState() {
    const saveBtn = document.querySelector('.save-current-btn');
    if (!saveBtn) return;
    const matches = wheelMatchesSaved();
    saveBtn.disabled = matches;
    saveBtn.classList.toggle('save-btn--disabled', matches);
}

function setupSaveLoad() {
    const saveBtn = document.querySelector('.save-current-btn');
    const loadBtn = document.querySelector('.load-btn');

    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            if (saveBtn.disabled) return;
            localStorage.setItem(WHEEL_STORAGE_KEY, JSON.stringify(movies));
            updateSaveButtonState();
            if (window.toast) toast.success('Wheel saved.');
        });
    }

    if (loadBtn) {
        loadBtn.addEventListener('click', () => {
            const saved = getSavedWheel();
            if (!saved || !saved.length) {
                if (window.toast) toast.info('No saved wheel to load yet.');
                return;
            }
            movies = saved.slice();
            currentRotation = 0; // reset the spin orientation for the loaded set
            rerender();
            if (window.toast) toast.success('Loaded your latest wheel.');
        });
    }

    updateSaveButtonState();
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

// Draw the wheel. `weights` (one per slice, default all 1) lets a single slice
// grow in / shrink out for the add/remove animation, while the rest share the
// remaining arc — so a new title appears to emerge from between its neighbours.
function drawWheel(titles, weights) {
    const canvas = document.getElementById('rouletteWheel');
    if (!canvas || titles.length === 0) return;
    const ctx = canvas.getContext('2d');

    const n = titles.length;
    const w = (weights && weights.length === n) ? weights : titles.map(() => 1);
    const total = w.reduce((a, b) => a + b, 0) || 1;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = canvas.width / 2;
    const sliceColors = getWheelSliceColors();

    // 10 or fewer titles read horizontally; more than 10 all switch to vertical
    // so every label is consistent and legible in the narrower wedges.
    const vertical = n > 10;

    // The whole wheel is drawn rotated by currentRotation (the spin angle), so
    // labels can be kept screen-upright while the slices turn underneath them.
    const rotationRad = currentRotation * Math.PI / 180;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Slice 0 is centred at the top at rest; everything turns by rotationRad.
    let startAngle = -Math.PI / 2 - (w[0] / total) * Math.PI + rotationRad;

    titles.forEach((title, i) => {
        const sliceAngle = (w[i] / total) * 2 * Math.PI;
        const endAngle = startAngle + sliceAngle;

        // The 8 colors repeat if there are ever more than 8 slices.
        ctx.fillStyle = sliceColors[i % sliceColors.length];
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startAngle, endAngle);
        ctx.fill();

        // Skip the label on a sliver (mid-animation) — it'd just be an ellipsis.
        if (sliceAngle > 0.05) {
            drawSliceLabel(ctx, title, centerX, centerY, radius, startAngle, sliceAngle, vertical);
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
function animateSlice(index, mode, done) {
    const canvas = document.getElementById('rouletteWheel');
    if (!canvas) { if (done) done(); return; }
    if (wheelAnim) cancelAnimationFrame(wheelAnim);

    const duration = 300;
    const start = performance.now();
    const step = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const e = 1 - Math.pow(1 - t, 3); // easeOutCubic
        const grow = mode === 'add' ? e : 1 - e; // add 0→1, remove 1→0
        const weights = movies.map((_, i) => (i === index ? grow : 1));
        drawWheel(movies, weights);
        if (t < 1) {
            wheelAnim = requestAnimationFrame(step);
        } else {
            wheelAnim = null;
            if (done) done();
            else drawWheel(movies);
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
        if (isSpinning || movies.length === 0) { tip.classList.remove('show'); return; }

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
        const startOffset = -Math.PI / 2 - sliceAngle / 2;
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
        if (isSpinning || movies.length === 0) return;

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
function getWinningIndex() {
    const n = movies.length;
    const sliceDeg = 360 / n;
    const rot = ((currentRotation % 360) + 360) % 360;
    return Math.round(((360 - rot) % 360) / sliceDeg) % n;
}

function setupWinnerControls() {
    const overlay = document.getElementById('winnerOverlay');
    const close = document.getElementById('winnerClose');
    const remove = document.getElementById('winnerRemove');

    if (close) close.addEventListener('click', closeWinner);
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
