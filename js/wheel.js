// wheel.js — Drawing, physics, movie search/add, and the winner popup.

// ==========================================
// 1. STATE
// ==========================================
// The wheel starts populated with the design-mockup sample (8 slices, clockwise).
let movies = [
    "The Martian",
    "La La Land",
    "Drive",
    "Arrival",
    "Baby Driver",
    "Her",
    "Eternal Sunshine of the Spotless Mind",
    "John Wick 1",
];

let currentWinnerIdx = -1; // index in `movies` of the movie shown in the popup
let searchDebounce;        // debounce timer for the live "add a movie" search

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
});

function rerender() {
    renderMovieList(movies);
    drawWheel(movies);
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
                <img src="assets/images/icons/edit-icon.svg" alt="Edit" title="Edit">
                <img class="row-delete" src="assets/images/icons/trash-icon.svg"
                     alt="Delete" title="Delete" data-index="${i}">
            </div>
        </div>
    `).join("");

    // A single live search field for adding a movie, pinned to the top.
    const addRow = `
        <div class="wheel-add-row">
            <div class="wheel-add-field">
                <input class="wheel-add-input" type="text" aria-label="Search movies to add">
                <ul class="wheel-add-results"></ul>
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

    // Typing in an add field filters the backend's titles into a dropdown.
    listContainer.addEventListener('input', (e) => {
        if (e.target.classList.contains('wheel-add-input')) renderResults(e.target);
    });

    // mousedown (not click) so the pick registers before the input blurs.
    listContainer.addEventListener('mousedown', (e) => {
        const li = e.target.closest('.wheel-add-results li[data-title]');
        if (li) {
            e.preventDefault();
            addMovie(li.dataset.title);
        }
    });

    listContainer.addEventListener('click', (e) => {
        const addBtn = e.target.closest('.wheel-add-btn');
        if (addBtn) {
            const input = addBtn.closest('.wheel-add-row').querySelector('.wheel-add-input');
            addMovie(input.value.trim());
            return;
        }
        const del = e.target.closest('.row-delete');
        if (del) removeMovie(Number(del.dataset.index));
    });

    // Click anywhere else closes any open dropdown.
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.wheel-add-field')) {
            document.querySelectorAll('.wheel-add-results.show')
                .forEach(ul => ul.classList.remove('show'));
        }
    });
}

// Live search the backend (debounced) and show titles not already on the wheel.
function renderResults(input) {
    const ul = input.closest('.wheel-add-field').querySelector('.wheel-add-results');
    const q = input.value.trim();

    clearTimeout(searchDebounce);
    if (!q) {
        ul.classList.remove('show');
        ul.innerHTML = "";
        return;
    }

    searchDebounce = setTimeout(async () => {
        // Bail if the field was cleared while the request was in flight.
        if (!input.value.trim()) return;
        try {
            const results = await MovieAPI.searchMovies(q);
            const onWheel = new Set(movies.map(m => m.toLowerCase()));
            const matches = results
                .map(r => r.title)
                .filter(t => t && !onWheel.has(t.toLowerCase()))
                .slice(0, 6);

            ul.innerHTML = matches.length
                ? matches.map(t => `<li data-title="${escapeHtml(t)}">${escapeHtml(t)}</li>`).join("")
                : `<li class="no-results">No matches</li>`;
        } catch (err) {
            console.error("Movie search failed:", err);
            ul.innerHTML = `<li class="no-results">Search failed</li>`;
        }
        ul.classList.add('show');
    }, 300);
}

function addMovie(title) {
    if (!title) return;
    if (movies.some(m => m.toLowerCase() === title.toLowerCase())) {
        if (window.toast) toast.info(`"${title}" is already on the wheel.`);
        return;
    }
    movies.push(title);
    renderMovieList(movies);

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
    });
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
