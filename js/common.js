// common.js - sidebar + auth logic shared by every page (index.html, profile.html)

// ==========================================
// 0. BROKEN POSTER IMAGE FALLBACK (GLOBAL)
// ==========================================
// TMDB images occasionally 404 / fail to load. Rather than wiring an onerror
// onto every single <img> we build, we listen for image error events globally
// in the capture phase (the `error` event doesn't bubble, but it IS observable
// while capturing). Any poster image that fails is swapped once for a local
// placeholder that already matches the 2:3 poster aspect ratio.
const POSTER_PLACEHOLDER = "assets/images/poster-placeholder.svg";

function isPosterImg(el) {
  return (
    el &&
    el.tagName === "IMG" &&
    (el.classList.contains("poster-img") ||
      el.classList.contains("collection-poster") ||
      el.classList.contains("avatar-pic"))
  );
}

document.addEventListener(
  "error",
  (e) => {
    const img = e.target;
    if (!isPosterImg(img)) return;
    // Guard against an infinite loop if the placeholder itself can't load.
    if (img.dataset.fallbackApplied === "true") return;
    img.dataset.fallbackApplied = "true";
    img.src = POSTER_PLACEHOLDER;
  },
  true, // capture: required because `error` does not bubble
);

// ==========================================
// 1. IMAGE PRELOADING HELPER
// ==========================================
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

// ==========================================
// 2. AUTHENTICATION & POST-LOGIN UI
// ==========================================
const loginBtn = document.getElementById("loginBtn");
const userProfileDisplay = document.getElementById("userProfileDisplay");
const displayUsername = document.getElementById("displayUsername");
const sidebarSettings = document.getElementById("sidebarSettings");
const settingsToggleBtn = document.getElementById("settingsToggleBtn");
const settingsSubmenu = document.getElementById("settingsSubmenu");
const currentUser = JSON.parse(localStorage.getItem("currentUser"));

if (currentUser) {
  if (loginBtn) loginBtn.style.display = "none";
  if (userProfileDisplay) userProfileDisplay.style.display = "flex";
  if (sidebarSettings) sidebarSettings.style.display = "flex";
  if (displayUsername) displayUsername.textContent = currentUser.username;
} else {
  if (loginBtn) loginBtn.style.display = "flex";
  if (userProfileDisplay) userProfileDisplay.style.display = "none";
  if (sidebarSettings) sidebarSettings.style.display = "none";
}

// ==========================================
// 3. SIDEBAR SETTINGS (EXPAND/COLLAPSE)
// ==========================================
if (settingsToggleBtn && sidebarSettings && settingsSubmenu) {
  settingsToggleBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    sidebarSettings.classList.toggle("open");
  });
}

// ==========================================
// 4. SIGN OUT MODAL & LOGIC
// ==========================================
const signOutBtn = document.getElementById("signOutBtn");
if (signOutBtn) {
  signOutBtn.addEventListener("click", (e) => {
    e.preventDefault();
    if (headerDropdown) headerDropdown.classList.remove("show"); // close the dropdown first
    showSignOutConfirm();
  });
}

// Build the confirm dialog once (injected so both pages share it), then toggle .show.
function showSignOutConfirm() {
  let overlay = document.getElementById("signOutModal");

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "signOutModal";
    overlay.className = "modal-overlay";
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

    overlay.addEventListener("click", (e) => {
      const action = e.target.dataset.modal;
      if (e.target === overlay || action === "cancel") {
        hideSignOutConfirm();
      } else if (action === "confirm") {
        // Clear the saved login + JWT. Use MovieAPI when it's loaded so the
        // storage keys live in one place; fall back to clearing both directly.
        if (window.MovieAPI) MovieAPI.logout();
        else {
          localStorage.removeItem("currentUser");
          localStorage.removeItem("authToken");
        }
        window.location.href = "index.html"; // reload as a guest
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") hideSignOutConfirm();
    });
  }

  void overlay.offsetWidth; // force reflow so the fade-in plays
  overlay.classList.add("show");
  const cancelBtn = overlay.querySelector('[data-modal="cancel"]');
  if (cancelBtn) cancelBtn.focus();
}

function hideSignOutConfirm() {
  const overlay = document.getElementById("signOutModal");
  if (overlay) overlay.classList.remove("show");
}

// ==========================================
// 5. PROFILE NAV LINK GUARD
// ==========================================
const profileNavLink = document.querySelector(
  '.main-nav a[href="profile.html"]',
);
if (profileNavLink) {
  profileNavLink.addEventListener("click", (e) => {
    e.preventDefault();
    const loggedIn = localStorage.getItem("currentUser"); // checked live on click
    window.location.href = loggedIn ? "profile.html" : "login.html";
  });
}

// ==========================================
// 6. HEADER PROFILE DROPDOWN
// ==========================================
const headerProfileBtn = document.getElementById("headerProfileBtn");
const headerDropdown = document.getElementById("headerDropdown");
if (headerProfileBtn && headerDropdown) {
  // Toggle the menu when clicking the profile picture
  headerProfileBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    headerDropdown.classList.toggle("show");
  });

  // Close the menu when clicking anywhere else
  document.addEventListener("click", (e) => {
    if (!headerDropdown.contains(e.target) && e.target !== headerProfileBtn) {
      headerDropdown.classList.remove("show");
    }
  });
}

// ==========================================
// 7. SMART BACK NAVIGATION (GLOBAL)
// ==========================================
// Any element marked `data-back` returns to the *previous* in-app page using the
// browser history when there is same-origin history to go back to; otherwise it
// falls back to the URL in `data-back` (or its href). This makes a single "Back"
// control behave correctly no matter which page the user arrived from.
function smartBack(fallbackUrl) {
  let sameOrigin = false;
  try {
    sameOrigin =
      !!document.referrer &&
      new URL(document.referrer).origin === window.location.origin;
  } catch (_) {
    sameOrigin = false;
  }
  if (window.history.length > 1 && sameOrigin) {
    window.history.back();
  } else {
    window.location.href = fallbackUrl || "index.html";
  }
}
window.smartBack = smartBack;

document.addEventListener("click", (e) => {
  const back = e.target.closest("[data-back]");
  if (!back) return;
  e.preventDefault();
  const fallback =
    back.getAttribute("data-back") ||
    back.getAttribute("href") ||
    "index.html";
  smartBack(fallback);
});

// ==========================================
// 8. GUEST USER GUARD (GLOBAL)
// ==========================================
// Some actions (Add to Collection, Like, Watched) require an account. Pages call
// requireAuth() before running such an action; for guests it shows a toast and
// returns false so the caller can bail out.
function isGuest() {
  return !localStorage.getItem("currentUser"); // checked live (not the cached var)
}
function requireAuth() {
  if (isGuest()) {
    if (window.toast) {
      toast.info("You must be a logged user in order to do this.");
    }
    return false;
  }
  return true;
}
window.isGuest = isGuest;
window.requireAuth = requireAuth;

// ==========================================
// 9. MOBILE NAV DRAWER & RESPONSIVE LAYOUT
// ==========================================
(function () {
  const mq = window.matchMedia("(max-width: 1024px)");
  const topbar = document.querySelector(".mobile-topbar");
  const userRail = document.querySelector(".user-rail");
  const authContainer = document.getElementById("headerAuthContainer");

  // Auth widget lives in the right rail on desktop and in the top bar on mobile.
  function placeAuth() {
    if (!authContainer || !topbar || !userRail) return;
    const target = mq.matches ? topbar : userRail;
    if (authContainer.parentElement !== target)
      target.appendChild(authContainer);
  }
  placeAuth();
  mq.addEventListener("change", placeAuth);

  // Hamburger opens the sidebar nav as a dropdown menu.
  const navToggle = document.getElementById("mobileNavToggle");
  const sidebar = document.querySelector(".sidebar");
  const backdrop = document.getElementById("navBackdrop");

  function openNav() {
    document.body.classList.add("nav-open");
    if (navToggle) navToggle.setAttribute("aria-expanded", "true");
  }
  function closeNav() {
    document.body.classList.remove("nav-open");
    if (navToggle) navToggle.setAttribute("aria-expanded", "false");
  }

  if (navToggle && sidebar) {
    navToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      if (document.body.classList.contains("nav-open")) closeNav();
      else openNav();
    });
    if (backdrop) backdrop.addEventListener("click", closeNav);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeNav();
    });

    // Tapping a destination closes the menu; the Settings toggle just expands.
    sidebar.querySelectorAll(".nav-link").forEach((link) => {
      if (link.id === "settingsToggleBtn") return;
      link.addEventListener("click", () => {
        if (mq.matches) closeNav();
      });
    });

    // Always reset the menu when returning to desktop.
    mq.addEventListener("change", () => {
      if (!mq.matches) closeNav();
    });
  }
})();
