// common.js - shared shell loaded on every page: sidebar/nav, auth UI,
// sign-out modal, profile dropdown, mobile nav drawer, and global guards.

// ==========================================
// 0. BROKEN POSTER IMAGE FALLBACK (GLOBAL)
// ==========================================
// TMDB images occasionally 404 / fail to load, and a stored avatarUrl can point
// at a file that no longer exists. Rather than wiring an onerror onto every
// single <img> we build, we listen for image error events globally in the
// capture phase (the `error` event doesn't bubble, but it IS observable while
// capturing). A failed image is swapped once for the right local fallback:
// posters → the 2:3 poster placeholder, avatars → the default avatar (so a dead
// profile-pic URL shows the silhouette, not a broken-image icon).
const POSTER_PLACEHOLDER = "assets/images/poster-placeholder.svg";
const DEFAULT_AVATAR = "assets/images/default-avatar.svg";

function isPosterImg(el) {
  return (
    el &&
    el.tagName === "IMG" &&
    (el.classList.contains("poster-img") || el.classList.contains("collection-poster"))
  );
}

function isAvatarImg(el) {
  return (
    el &&
    el.tagName === "IMG" &&
    (el.classList.contains("avatar-pic") || el.classList.contains("profile-pic"))
  );
}

document.addEventListener(
  "error",
  (e) => {
    const img = e.target;
    const fallback = isAvatarImg(img)
      ? DEFAULT_AVATAR
      : isPosterImg(img)
        ? POSTER_PLACEHOLDER
        : null;
    if (!fallback) return;
    // Guard against an infinite loop if the fallback itself can't load.
    if (img.dataset.fallbackApplied === "true") return;
    img.dataset.fallbackApplied = "true";
    img.src = fallback;
  },
  true, // capture: required because `error` does not bubble
);

// ==========================================
// 0b. HTML ESCAPING (GLOBAL)
// ==========================================
// Escape a value for safe interpolation into HTML text or a double-quoted
// attribute. Used wherever we build markup from TMDB / user data via template
// strings (movie titles, cast, genres, collection names) so a stray quote or
// angle bracket can't break the attribute or inject markup.
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
window.escapeHtml = escapeHtml;

// ==========================================
// 0c. COLLECTION COVER COLLAGE (GLOBAL)
// ==========================================
// Build a collection's cover from its first ≤4 movies. The layout depends on BOTH
// the movie count AND the card shape — the profile grid is a 2:3 portrait on
// desktop but a 5:2 banner at ≤600px (see common.css / profile responsive.css):
//
//   count   Desktop (portrait 2:3)        Mobile (banner 5:2)
//   ----    ----------------------        -------------------
//   1       1 poster                      1 backdrop
//   2-3     2-3 backdrops, stacked        2 → 2 backdrops side by side
//   4+      2×2 poster grid               3 → 3 posters / 4+ → 4 posters, in cols
//
// Each movie carries BOTH a poster and a backdrop URL (c.covers); each layout picks
// whichever image type it wants, with the other as a per-tile fallback. A custom
// uploaded cover (c.posterUrl) always wins. Styles live in common.css.
//
// `opts.responsive` (default true) follows the viewport and re-lays-out live when
// the card crosses the breakpoint. The Add-to-Collection modal passes `false`: its
// tiles are pinned to 2:3 regardless of viewport, so they keep the desktop layout.
const COVER_MOBILE_MQ = "(max-width: 600px)";
const COVER_TILE_ERR =
  "this.replaceWith(Object.assign(document.createElement('span'),{className:'cover-tile cover-tile--empty'}))";

function coverTile(src) {
  return `<img class="cover-tile" src="${escapeHtml(src)}" alt="" loading="lazy" onerror="${COVER_TILE_ERR}">`;
}

// Normalise a card into an ordered [{poster, backdrop}] of its first ≤4 movies,
// from the card's `covers` (the backend's single source of truth for the cover).
function coverPairs(c) {
  const covers = (c && Array.isArray(c.covers) && c.covers) || [];
  return covers
    .slice(0, 4)
    .map((x) => ({ poster: (x && x.poster) || "", backdrop: (x && x.backdrop) || "" }));
}

function coverIsMobile() {
  return !!(window.matchMedia && window.matchMedia(COVER_MOBILE_MQ).matches);
}

// Choose the layout class + the ordered image srcs for a movie set and viewport.
function pickCoverLayout(pairs, mobile) {
  const n = pairs.length;
  const poster = (m) => m.poster || m.backdrop || "";
  const backdrop = (m) => m.backdrop || m.poster || "";
  if (mobile) {
    if (n === 1) return { cls: "cover-m1", srcs: [backdrop(pairs[0])] };
    if (n === 2) return { cls: "cover-m2", srcs: pairs.map(backdrop) };
    const cols = n === 3 ? 3 : 4; // 3 → 3 columns, 4+ → 4 columns
    return { cls: `cover-mcols cover-mcols-${cols}`, srcs: pairs.slice(0, cols).map(poster) };
  }
  if (n === 1) return { cls: "cover-d1", srcs: [poster(pairs[0])] };
  if (n <= 3) return { cls: `cover-dstack cover-dstack-${n}`, srcs: pairs.map(backdrop) };
  return { cls: "cover-dgrid", srcs: pairs.slice(0, 4).map(poster) };
}

// One global listener re-lays-out every responsive cover when the card flips
// between its portrait (desktop) and banner (mobile) shapes. Covers are pure images
// (no per-tile listeners — the profile grid delegates clicks on the card), so
// swapping innerHTML in place is safe.
let _coverRelayoutReady = false;
function ensureCoverRelayout() {
  if (_coverRelayoutReady || !window.matchMedia) return;
  _coverRelayoutReady = true;
  const mq = window.matchMedia(COVER_MOBILE_MQ);
  const relayout = () => {
    document.querySelectorAll(".collection-cover[data-cover]").forEach((el) => {
      let pairs;
      try {
        pairs = JSON.parse(el.getAttribute("data-cover"));
      } catch (_) {
        return;
      }
      if (!Array.isArray(pairs) || !pairs.length) return;
      const { cls, srcs } = pickCoverLayout(pairs, mq.matches);
      el.className = `collection-cover ${cls}`;
      el.innerHTML = srcs.map(coverTile).join("");
    });
  };
  if (mq.addEventListener) mq.addEventListener("change", relayout);
  else if (mq.addListener) mq.addListener(relayout); // older Safari
}

function buildCollectionCover(c, opts) {
  const responsive = !opts || opts.responsive !== false;
  if (responsive) ensureCoverRelayout();
  if (c && c.posterUrl) {
    // Custom uploaded cover: one image filling the card (portrait or banner).
    return `<div class="collection-cover cover-d1">${coverTile(c.posterUrl)}</div>`;
  }
  const pairs = coverPairs(c);
  if (!pairs.length) {
    return `<div class="collection-cover cover-empty" role="img" aria-label="No movies yet"><span class="cover-empty__plus" aria-hidden="true"></span></div>`;
  }
  const { cls, srcs } = pickCoverLayout(pairs, responsive && coverIsMobile());
  // Responsive covers stash their data so the breakpoint listener can re-lay-out
  // in place; fixed (modal) covers don't — they stay on the desktop layout.
  const data = responsive ? ` data-cover="${escapeHtml(JSON.stringify(pairs))}"` : "";
  return `<div class="collection-cover ${cls}"${data}>${srcs.map(coverTile).join("")}</div>`;
}
window.buildCollectionCover = buildCollectionCover;

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
// Guard the parse: a corrupt "currentUser" value would otherwise throw here at
// load time and abort the rest of common.js (nav, auth toggle, sign-out modal,
// requireAuth/isGuest) on EVERY page. Fall back to logged-out on bad JSON.
let currentUser = null;
try {
  currentUser = JSON.parse(localStorage.getItem("currentUser"));
} catch (_) {
  currentUser = null;
}

if (currentUser) {
  if (loginBtn) loginBtn.style.display = "none";
  if (userProfileDisplay) userProfileDisplay.style.display = "flex";
  if (sidebarSettings) sidebarSettings.style.display = "flex";
  if (displayUsername) displayUsername.textContent = currentUser.username;
  setupDropdownUserPanel(currentUser);
  // Show the user's uploaded avatar (if any) in every page's header/profile pics.
  if (currentUser.avatarUrl) {
    document.querySelectorAll(".profile-pic, .avatar-pic").forEach((img) => {
      img.src = currentUser.avatarUrl;
    });
  }
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
    const opening = !sidebarSettings.classList.contains("open");
    sidebarSettings.classList.toggle("open");
    // Drive the accordion to the submenu's ACTUAL height (read after the .open
    // class applies its padding) instead of the CSS fallback's fixed overshoot —
    // that overshoot is what made the close stall before it visibly collapsed.
    // Clearing it on close lets it fall back to the CSS max-height:0 and animate
    // smoothly the other way.
    settingsSubmenu.style.maxHeight = opening
      ? `${settingsSubmenu.scrollHeight}px`
      : "";
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

// Build the logged-in header for the profile dropdown: a non-clickable username
// line + an "AI Actions remaining" badge, injected once at the top of the menu.
// The avatar isn't repeated here — it's already the dropdown's trigger button. The
// username doubles as the only place the handle shows on mobile (the header text is
// hidden there). Called from the post-login UI block above; safe to call once.
function setupDropdownUserPanel(user) {
  const dropdown = document.getElementById("headerDropdown");
  if (!dropdown || !user) return;
  if (dropdown.querySelector(".dropdown-user")) return; // already injected

  const panel = document.createElement("div");
  panel.className = "dropdown-user";
  panel.innerHTML =
    '<span class="dropdown-username"></span>' +
    '<span class="dropdown-ai-usage" id="dropdownAiUsage">AI Actions: …</span>' +
    '<span class="ai-bar"><span class="ai-bar-fill" id="dropdownAiBar"></span></span>';
  panel.querySelector(".dropdown-username").textContent = user.username || "";

  const divider = document.createElement("div");
  divider.className = "dropdown-divider";

  dropdown.insertBefore(divider, dropdown.firstChild);
  dropdown.insertBefore(panel, dropdown.firstChild);

  renderAiUsageBadge(user.aiUsage); // instant paint from the cached user…
  // …then resync from the server (covers the midnight reset while logged in, or
  // actions spent on another tab). api.js is loaded AFTER common.js on every page,
  // so window.MovieAPI doesn't exist yet at this point — wait until the deferred
  // scripts have all run before reaching for it. Best-effort: the cached value (or
  // the "…" placeholder for a pre-feature session) already showed.
  whenMovieApiReady(() => {
    MovieAPI.getAiUsage().then(renderAiUsageBadge).catch(() => {});
  });
}

// Run `fn` once window.MovieAPI is available. It's defined in api.js, which loads
// AFTER common.js, so at common.js execution time it isn't there yet — defer to
// DOMContentLoaded (fires after all `defer` scripts have executed) unless it's
// somehow already present or the page has finished loading.
function whenMovieApiReady(fn) {
  const run = () => {
    if (window.MovieAPI && MovieAPI.getAiUsage) fn();
  };
  if (window.MovieAPI && MovieAPI.getAiUsage) return run();
  if (document.readyState === "complete") return run();
  document.addEventListener("DOMContentLoaded", run, { once: true });
}

// Paint the AI-actions label + stat bar from a { remaining, limit } usage object,
// colouring both by how much is left (ok → low → out). The limit is backend-owned
// (never hard-coded here): until a usage payload has arrived we show a neutral
// placeholder and wait for the server refresh in setupDropdownUserPanel.
function renderAiUsageBadge(usage) {
  const el = document.getElementById("dropdownAiUsage");
  const bar = document.getElementById("dropdownAiBar");
  const track = bar && bar.parentElement; // the .ai-bar carries the state class
  if (!el) return;

  const limit = usage && Number.isFinite(usage.limit) ? usage.limit : null;
  const remaining = usage && Number.isFinite(usage.remaining) ? usage.remaining : null;

  el.classList.remove("is-ok", "is-low", "is-out");
  if (track) track.classList.remove("is-ok", "is-low", "is-out");

  if (limit === null || remaining === null) {
    el.textContent = "AI Actions: …"; // unknown yet — server refresh will replace this
    if (bar) bar.style.width = "0%";
    return;
  }

  // Warning band: the last 30% of the daily allowance (but always at least the final
  // action, so small limits still get a warning). Derived from the backend-owned
  // limit, so bumping DAILY_AI_LIMIT keeps it sensible (limit 5 → warn at ≤1;
  // limit 10 → ≤3; limit 20 → ≤6).
  const lowAt = Math.max(1, Math.ceil(limit * 0.3));
  const state = remaining <= 0 ? "is-out" : remaining <= lowAt ? "is-low" : "is-ok";

  el.textContent = `AI Actions: ${remaining} of ${limit} left`;
  el.classList.add(state);
  if (track) track.classList.add(state);
  if (bar) bar.style.width = `${(remaining / limit) * 100}%`;
}

// Keep the badge live whenever an AI action is spent anywhere in the app
// (api.js dispatches "mk:ai-usage" with the fresh usage after each call).
window.addEventListener("mk:ai-usage", (e) => renderAiUsageBadge(e.detail));

const headerProfileBtn = document.getElementById("headerProfileBtn");
const headerDropdown = document.getElementById("headerDropdown");
if (headerProfileBtn && headerDropdown) {
  // Toggle the menu when clicking the profile picture
  headerProfileBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const opened = headerDropdown.classList.toggle("show");
    // Re-fetch the AI-actions count every time the menu opens, so it reflects the
    // midnight-Pacific reset (or actions spent in another tab) even if the page has
    // been sitting open — without this, opening the menu would show the stale cached
    // count until a reload. Guests have no badge, so getAiUsage() no-ops (null).
    if (opened && window.MovieAPI && MovieAPI.getAiUsage) {
      MovieAPI.getAiUsage().then(renderAiUsageBadge).catch(() => {});
    }
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
