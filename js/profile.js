// --- RENDER COLLECTIONS FROM JSON ---
// Most basic card for now: the poster image + the name above it. Build on top of this.
(async () => {
    const row = document.querySelector('.collections-row');
    if (!row) return;

    try {
        const res = await fetch('data/collections.json');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { collections } = await res.json();

        row.innerHTML = collections.map((c, i) => `
            <article class="collection-card" data-card="${i}">
                <p class="collection-name">${c.name}</p>
                <img class="collection-poster" src="${c.posterPath}" alt="${c.name}">
            </article>
        `).join('');
    } catch (err) {
        console.error('Could not load collections:', err);
    }
})();


(function () {
    'use strict';

    const menu = document.getElementById('collectionMenu');
    const triggers = document.querySelectorAll('[data-menu-trigger]');

    if (!menu || triggers.length === 0) return;

    function openMenuForCard(cardId) {
        const card = document.querySelector(`.collection-card[data-card="${cardId}"]`);
        const trigger = document.querySelector(`[data-menu-trigger="${cardId}"]`);
        if (!card || !trigger) return;

        // Anchor: menu right edge ≈ dots-button right edge; menu top ≈ card.top + 27.
        // The 3-dots button is at (226.03, 0.35) inside each 252.6 × 364.16 card.
        const dotsRightOffset = 226.03 + 27; // = 253.03
        const menuWidth = 243;
        const menuLeftInRow = (card.offsetLeft + dotsRightOffset) - menuWidth;
        const menuTopInRow = card.offsetTop + 27;

        // Convert to .profile-stage-relative coords.
        const collectionsRow = card.parentElement;
        menu.style.left = (collectionsRow.offsetLeft + menuLeftInRow) + 'px';
        menu.style.top = (collectionsRow.offsetTop + menuTopInRow) + 'px';
        menu.dataset.menu = cardId;
        menu.hidden = false;

        document.querySelectorAll('.dots-btn--active').forEach(btn => {
            if (btn !== trigger) btn.classList.remove('dots-btn--active');
        });
        trigger.classList.add('dots-btn--active');
    }

    function closeMenu() {
        menu.hidden = true;
        document.querySelectorAll('.dots-btn--active').forEach(btn => btn.classList.remove('dots-btn--active'));
    }

    triggers.forEach(trigger => {
        trigger.addEventListener('click', function (e) {
            e.stopPropagation();
            const cardId = trigger.dataset.menuTrigger;
            const isOpen = !menu.hidden && menu.dataset.menu === cardId;
            if (isOpen) {
                closeMenu();
            } else {
                openMenuForCard(cardId);
            }
        });
    });

    // Click outside closes the menu
    document.addEventListener('click', function (e) {
        if (menu.hidden) return;
        if (menu.contains(e.target)) return;
        closeMenu();
    });

    // Escape key closes the menu
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !menu.hidden) closeMenu();
    });
})();
