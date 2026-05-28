// common.js — sidebar + auth logic shared by every page (index.html, profile.html)

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

// --- SIGN OUT ---
const signOutBtn = document.getElementById('signOutBtn');
if (signOutBtn) {
    signOutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.removeItem('currentUser'); // clear the saved login
        window.location.href = 'index.html';    // reload as a guest
    });
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
