// wheel.js — Drawing and physics for the spinning movie roulette.

// ==========================================
// 1. INITIALIZATION & FETCH
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const res = await fetch("data/movies.json");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { movies } = await res.json();

        // For now, let's grab the first 8 movies to populate the wheel
        const wheelEntries = movies.slice(0, 8);
        
        renderMovieList(wheelEntries);
        drawWheel(wheelEntries);
        setupSpinPhysics();

    } catch (err) {
        console.error("Could not load movies:", err);
        toast.error("Failed to load movie data.");
    }
});

// ==========================================
// 2. LIST RENDERING
// ==========================================
function renderMovieList(entries) {
    const listContainer = document.getElementById('wheelMovieList');
    if (!listContainer) return;

    // We use emojis here as placeholders for your actual SVG edit/trash icons
    const html = entries.map(movie => `
        <div class="wheel-list-item">
            <span>${movie.title}</span>
            <div class="list-actions">
                <span title="Edit">📝</span>
                <span title="Delete">🗑️</span>
            </div>
        </div>
    `).join("");
    
    listContainer.innerHTML = html;
}

// ==========================================
// 3. CANVAS DRAWING LOGIC
// ==========================================
function drawWheel(entries) {
    const canvas = document.getElementById('rouletteWheel');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const numSlices = entries.length;
    const sliceAngle = (2 * Math.PI) / numSlices;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = canvas.width / 2;

    // Clear previous drawings
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw each slice
    entries.forEach((movie, i) => {
        const startAngle = i * sliceAngle;
        const endAngle = startAngle + sliceAngle;

        // Alternating colors based on your mockup palette
        // Using raw hex here for the canvas API
        const colors = ['#C46C83', '#A17D9C', '#BC8DA1', '#858797'];
        ctx.fillStyle = colors[i % colors.length];

        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startAngle, endAngle);
        ctx.fill();

        // --- Draw the text inside the slice ---
        ctx.save();
        
        // Move the "brush" to the center of the canvas
        ctx.translate(centerX, centerY);
        
        // Rotate the brush to point perfectly down the middle of the current slice
        ctx.rotate(startAngle + sliceAngle / 2);
        
        // Draw the text (aligned to the right so it hits the outer edge)
        ctx.textAlign = "right";
        ctx.fillStyle = "white";
        ctx.font = "20px 'Impact', sans-serif";
        
        // Push the text outward toward the edge
        ctx.fillText(movie.title, radius - 30, 6);
        
        ctx.restore();
    });
}

// ==========================================
// 4. SPIN PHYSICS
// ==========================================
function setupSpinPhysics() {
    const spinBtn = document.getElementById('spinBtn');
    const canvas = document.getElementById('rouletteWheel');
    
    // We keep track of total rotation so spinning multiple times doesn't reset it
    let currentRotation = 0; 
    let isSpinning = false;

    if (spinBtn && canvas) {
        spinBtn.addEventListener('click', () => {
            if (isSpinning) return; // Prevent clicking while it's already spinning
            
            isSpinning = true;
            spinBtn.style.opacity = '0.5';
            
            // Math: Spin at least 10 full times (3600 deg) + a random extra amount
            const extraSpins = 3600; 
            const randomStop = Math.floor(Math.random() * 360);
            currentRotation += extraSpins + randomStop;

            // Apply the rotation via CSS transform. 
            // The 4-second transition in wheel.css makes this look physical and heavy.
            canvas.style.transform = `rotate(${currentRotation}deg)`;

            // Wait for the CSS transition to finish (4 seconds) before unlocking the button
            setTimeout(() => {
                isSpinning = false;
                spinBtn.style.opacity = '1';
                // Later, you can calculate exactly which slice won here!
            }, 4000); 
        });
    }
}