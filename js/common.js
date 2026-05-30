// common.js — sidebar + auth logic shared by every page (index.html, profile.html)

// Resolve once every image has loaded or errored, with a timeout so a broken image
// can't stall the reveal. Used by the home grid and the profile collections.
function preloadImages(urls, timeoutMs = 2500) {
    const loaded = Promise.all(
        urls.map(
            (src) =>
                new Promise((resolve) => {
                    const img = new Image();
                    img.onload = img.onerror = resolve;
                    img.src = src;
                }),
        ),
    );
    const timeout = new Promise((resolve) => setTimeout(resolve, timeoutMs));
    return Promise.race([loaded, timeout]);
}

// --- AUTHENTICATION & POST-LOGIN UI ---
const loginBtn = document.getElementById('loginBtn');
const userProfileDisplay = document.getElementById('userProfileDisplay');
const displayUsername = document.getElementById('displayUsername');
const sidebarSettings = document.getElementById('sidebarSettings');
const settingsToggleBtn = document.getElementById('settingsToggleBtn');
const settingsSubmenu = document.getElementById('settingsSubmenu');

// Single source of truth for the logged-in user (set by validation.js on login)
const currentUser = JSON.parse(localStorage.getItem('currentUser'));

if (currentUser) {
    // Logged in: swap to the profile UI and reveal the sidebar Settings
    if (loginBtn) loginBtn.style.display = 'none';
    if (userProfileDisplay) userProfileDisplay.style.display = 'flex';
    if (sidebarSettings) sidebarSettings.style.display = 'flex';
    if (displayUsername) displayUsername.textContent = currentUser.username;
} else {
    // Guest: default state
    if (loginBtn) loginBtn.style.display = 'flex';
    if (userProfileDisplay) userProfileDisplay.style.display = 'none';
    if (sidebarSettings) sidebarSettings.style.display = 'none';
}

// --- SIDEBAR SETTINGS EXPAND / COLLAPSE ---
// Toggling .open drives the background, the sliding submenu, the gear spin,
// AND the arrow rotation — all via CSS on .settings-container.open.
if (settingsToggleBtn && sidebarSettings && settingsSubmenu) {
    settingsToggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        sidebarSettings.classList.toggle('open');
    });
}

// --- SIGN OUT (with confirmation) ---
const signOutBtn = document.getElementById('signOutBtn');
if (signOutBtn) {
    signOutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (headerDropdown) headerDropdown.classList.remove('show'); // close the dropdown first
        showSignOutConfirm();
    });
}

// Build the confirm dialog once (injected so both pages share it), then toggle .show.
function showSignOutConfirm() {
    let overlay = document.getElementById('signOutModal');

    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'signOutModal';
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
          <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="signOutTitle">
            <h3 id="signOutTitle" class="modal-title">Sign out?</h3>
            <p class="modal-text">Are you sure you want to sign out?</p>
            <div class="modal-actions">
              <button class="modal-btn modal-btn--ghost" data-modal="cancel">Cancel</button>
              <button class="modal-btn modal-btn--danger" data-modal="confirm">Sign Out</button>
            </div>
          </div>`;
        document.body.appendChild(overlay);

        overlay.addEventListener('click', (e) => {
            const action = e.target.dataset.modal;
            if (e.target === overlay || action === 'cancel') {
                hideSignOutConfirm();
            } else if (action === 'confirm') {
                localStorage.removeItem('currentUser'); // clear the saved login
                window.location.href = 'index.html';     // reload as a guest
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') hideSignOutConfirm();
        });
    }

    void overlay.offsetWidth; // force reflow so the fade-in plays
    overlay.classList.add('show');
    const cancelBtn = overlay.querySelector('[data-modal="cancel"]');
    if (cancelBtn) cancelBtn.focus();
}

function hideSignOutConfirm() {
    const overlay = document.getElementById('signOutModal');
    if (overlay) overlay.classList.remove('show');
}

// --- PROFILE NAV LINK GUARD ---
// Clicking "Profile" goes to the profile page only when logged in;
// otherwise it sends the user to the login page.
const profileNavLink = document.querySelector('.main-nav a[href="profile.html"]');
if (profileNavLink) {
    profileNavLink.addEventListener('click', (e) => {
        e.preventDefault();
        const loggedIn = localStorage.getItem('currentUser'); // checked live on click
        window.location.href = loggedIn ? 'profile.html' : 'login.html';
    });
}

// --- HEADER PROFILE-PIC DROPDOWN ---
const headerProfileBtn = document.getElementById('headerProfileBtn');
const headerDropdown = document.getElementById('headerDropdown');
if (headerProfileBtn && headerDropdown) {
    // Toggle the menu when clicking the profile picture
    headerProfileBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        headerDropdown.classList.toggle('show');
    });

    // Close the menu when clicking anywhere else
    document.addEventListener('click', (e) => {
        if (!headerDropdown.contains(e.target) && e.target !== headerProfileBtn) {
            headerDropdown.classList.remove('show');
        }
    });
}

// --- MOBILE NAV DRAWER + LAYOUT RELOCATION ---
(function () {
    const mq = window.matchMedia('(max-width: 1024px)');
    const topbar = document.querySelector('.mobile-topbar');
    const userRail = document.querySelector('.user-rail');
    const authContainer = document.getElementById('headerAuthContainer');

    // Auth widget lives in the right rail on desktop and in the top bar on mobile.
    function placeAuth() {
        if (!authContainer || !topbar || !userRail) return;
        const target = mq.matches ? topbar : userRail;
        if (authContainer.parentElement !== target) target.appendChild(authContainer);
    }
    placeAuth();
    mq.addEventListener('change', placeAuth);

    // Hamburger opens the sidebar nav as a dropdown menu.
    const navToggle = document.getElementById('mobileNavToggle');
    const sidebar = document.querySelector('.sidebar');
    const backdrop = document.getElementById('navBackdrop');

    function openNav() {
        document.body.classList.add('nav-open');
        if (navToggle) navToggle.setAttribute('aria-expanded', 'true');
    }
    function closeNav() {
        document.body.classList.remove('nav-open');
        if (navToggle) navToggle.setAttribute('aria-expanded', 'false');
    }

    if (navToggle && sidebar) {
        navToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            if (document.body.classList.contains('nav-open')) closeNav();
            else openNav();
        });
        if (backdrop) backdrop.addEventListener('click', closeNav);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeNav();
        });

        // Tapping a destination closes the menu; the Settings toggle just expands.
        sidebar.querySelectorAll('.nav-link').forEach((link) => {
            if (link.id === 'settingsToggleBtn') return;
            link.addEventListener('click', () => {
                if (mq.matches) closeNav();
            });
        });

        // Always reset the menu when returning to desktop.
        mq.addEventListener('change', () => {
            if (!mq.matches) closeNav();
        });
    }
})();
