// shared shell loaded on every page: nav, auth ui, sign-out modal, dropdown, mobile drawer, guards

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
    // guard infinite loop if the fallback itself fails to load
    if (img.dataset.fallbackApplied === "true") return;
    img.dataset.fallbackApplied = "true";
    img.src = fallback;
  },
  true, // capture: error doesn't bubble
);

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
window.escapeHtml = escapeHtml;

// collection cover from first <=4 movies. layout varies by movie count and card
// shape: portrait 2:3 on desktop, banner 5:2 at <=600px. each movie has both a
// poster and backdrop; layouts pick one with the other as fallback. opts.responsive
// (default true) re-lays-out on breakpoint change; the modal passes false to pin 2:3.
const COVER_MOBILE_MQ = "(max-width: 600px)";
const COVER_TILE_ERR =
  "this.replaceWith(Object.assign(document.createElement('span'),{className:'cover-tile cover-tile--empty'}))";

function coverTile(src) {
  return `<img class="cover-tile" src="${escapeHtml(src)}" alt="" loading="lazy" onerror="${COVER_TILE_ERR}">`;
}

function coverPairs(c) {
  const covers = (c && Array.isArray(c.covers) && c.covers) || [];
  return covers
    .slice(0, 4)
    .map((x) => ({ poster: (x && x.poster) || "", backdrop: (x && x.backdrop) || "" }));
}

function coverIsMobile() {
  return !!(window.matchMedia && window.matchMedia(COVER_MOBILE_MQ).matches);
}

function pickCoverLayout(pairs, mobile) {
  const n = pairs.length;
  const poster = (m) => m.poster || m.backdrop || "";
  const backdrop = (m) => m.backdrop || m.poster || "";
  if (mobile) {
    if (n === 1) return { cls: "cover-m1", srcs: [backdrop(pairs[0])] };
    if (n === 2) return { cls: "cover-m2", srcs: pairs.map(backdrop) };
    const cols = n === 3 ? 3 : 4;
    return { cls: `cover-mcols cover-mcols-${cols}`, srcs: pairs.slice(0, cols).map(poster) };
  }
  if (n === 1) return { cls: "cover-d1", srcs: [poster(pairs[0])] };
  if (n <= 3) return { cls: `cover-dstack cover-dstack-${n}`, srcs: pairs.map(backdrop) };
  return { cls: "cover-dgrid", srcs: pairs.slice(0, 4).map(poster) };
}

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
  else if (mq.addListener) mq.addListener(relayout); // older safari
}

function buildCollectionCover(c, opts) {
  const responsive = !opts || opts.responsive !== false;
  if (responsive) ensureCoverRelayout();
  if (c && c.posterUrl) {
    return `<div class="collection-cover cover-d1">${coverTile(c.posterUrl)}</div>`;
  }
  const pairs = coverPairs(c);
  if (!pairs.length) {
    return `<div class="collection-cover cover-empty" role="img" aria-label="No movies yet"><span class="cover-empty__plus" aria-hidden="true"></span></div>`;
  }
  const { cls, srcs } = pickCoverLayout(pairs, responsive && coverIsMobile());
  // responsive covers stash data so the breakpoint listener can re-lay-out in place
  const data = responsive ? ` data-cover="${escapeHtml(JSON.stringify(pairs))}"` : "";
  return `<div class="collection-cover ${cls}"${data}>${srcs.map(coverTile).join("")}</div>`;
}
window.buildCollectionCover = buildCollectionCover;

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

const loginBtn = document.getElementById("loginBtn");
const userProfileDisplay = document.getElementById("userProfileDisplay");
const displayUsername = document.getElementById("displayUsername");
const sidebarSettings = document.getElementById("sidebarSettings");
const settingsToggleBtn = document.getElementById("settingsToggleBtn");
const settingsSubmenu = document.getElementById("settingsSubmenu");
// bad JSON here would throw at load and abort the rest of common.js
let currentUser = null;
try {
  currentUser = JSON.parse(localStorage.getItem("currentUser"));
} catch (_) {
  currentUser = null;
}

if (currentUser) {
  if (loginBtn) loginBtn.style.display = "none";
  if (userProfileDisplay) userProfileDisplay.hidden = false;
  if (sidebarSettings) sidebarSettings.hidden = false;
  if (displayUsername) displayUsername.textContent = currentUser.username;
  setupDropdownUserPanel(currentUser);
  if (currentUser.avatarUrl) {
    document.querySelectorAll(".profile-pic, .avatar-pic").forEach((img) => {
      img.src = currentUser.avatarUrl;
    });
  }
} else {
  if (loginBtn) loginBtn.style.display = "flex";
  if (userProfileDisplay) userProfileDisplay.hidden = true;
  if (sidebarSettings) sidebarSettings.hidden = true;
}

if (settingsToggleBtn && sidebarSettings && settingsSubmenu) {
  settingsToggleBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const opening = !sidebarSettings.classList.contains("open");
    sidebarSettings.classList.toggle("open");
    // pin accordion to the submenu's actual height; clearing falls back to css max-height:0
    settingsSubmenu.style.maxHeight = opening
      ? `${settingsSubmenu.scrollHeight}px`
      : "";
  });
}

const signOutBtn = document.getElementById("signOutBtn");
if (signOutBtn) {
  signOutBtn.addEventListener("click", (e) => {
    e.preventDefault();
    if (headerDropdown) headerDropdown.classList.remove("show");
    showSignOutConfirm();
  });
}

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
        if (window.MovieAPI) MovieAPI.logout();
        else {
          localStorage.removeItem("currentUser");
          localStorage.removeItem("authToken");
        }
        window.location.href = "index.html";
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") hideSignOutConfirm();
    });
  }

  void overlay.offsetWidth; // force reflow so fade-in plays
  overlay.classList.add("show");
  const cancelBtn = overlay.querySelector('[data-modal="cancel"]');
  if (cancelBtn) cancelBtn.focus();
}

function hideSignOutConfirm() {
  const overlay = document.getElementById("signOutModal");
  if (overlay) overlay.classList.remove("show");
}

const profileNavLink = document.querySelector(
  '.main-nav a[href="profile.html"]',
);
if (profileNavLink) {
  profileNavLink.addEventListener("click", (e) => {
    e.preventDefault();
    const loggedIn = localStorage.getItem("currentUser");
    window.location.href = loggedIn ? "profile.html" : "login.html";
  });
}

function setupDropdownUserPanel(user) {
  const dropdown = document.getElementById("headerDropdown");
  if (!dropdown || !user) return;
  if (dropdown.querySelector(".dropdown-user")) return;

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

  renderAiUsageBadge(user.aiUsage); // instant paint from cached user, then resync
  whenMovieApiReady(() => {
    MovieAPI.getAiUsage().then(renderAiUsageBadge).catch(() => {});
  });
}

// api.js loads after common.js, so wait for DOMContentLoaded unless it's already there
function whenMovieApiReady(fn) {
  const run = () => {
    if (window.MovieAPI && MovieAPI.getAiUsage) fn();
  };
  if (window.MovieAPI && MovieAPI.getAiUsage) return run();
  if (document.readyState === "complete") return run();
  document.addEventListener("DOMContentLoaded", run, { once: true });
}

// paint the ai-actions label + bar from { remaining, limit }, coloured by amount left
function renderAiUsageBadge(usage) {
  const el = document.getElementById("dropdownAiUsage");
  const bar = document.getElementById("dropdownAiBar");
  const track = bar && bar.parentElement;
  if (!el) return;

  const limit = usage && Number.isFinite(usage.limit) ? usage.limit : null;
  const remaining = usage && Number.isFinite(usage.remaining) ? usage.remaining : null;

  el.classList.remove("is-ok", "is-low", "is-out");
  if (track) track.classList.remove("is-ok", "is-low", "is-out");

  if (limit === null || remaining === null) {
    el.textContent = "AI Actions: …";
    if (bar) bar.style.width = "0%";
    return;
  }

  // warn in the last 30% of the daily limit, floored at 1
  const lowAt = Math.max(1, Math.ceil(limit * 0.3));
  const state = remaining <= 0 ? "is-out" : remaining <= lowAt ? "is-low" : "is-ok";

  el.textContent = `AI Actions: ${remaining} of ${limit} left`;
  el.classList.add(state);
  if (track) track.classList.add(state);
  if (bar) bar.style.width = `${(remaining / limit) * 100}%`;
}

// api.js dispatches "mk:ai-usage" with fresh usage after each ai call
window.addEventListener("mk:ai-usage", (e) => renderAiUsageBadge(e.detail));

const headerProfileBtn = document.getElementById("headerProfileBtn");
const headerDropdown = document.getElementById("headerDropdown");
if (headerProfileBtn && headerDropdown) {
  headerProfileBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const opened = headerDropdown.classList.toggle("show");
    // refetch on open to reflect the daily reset / actions spent in another tab
    if (opened && window.MovieAPI && MovieAPI.getAiUsage) {
      MovieAPI.getAiUsage().then(renderAiUsageBadge).catch(() => {});
    }
  });

  document.addEventListener("click", (e) => {
    if (!headerDropdown.contains(e.target) && e.target !== headerProfileBtn) {
      headerDropdown.classList.remove("show");
    }
  });
}

// data-back: go back via history if same-origin, else fall back to the given url
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

function isGuest() {
  return !localStorage.getItem("currentUser");
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

(function () {
  const mq = window.matchMedia("(max-width: 1024px)");
  const topbar = document.querySelector(".mobile-topbar");
  const userRail = document.querySelector(".user-rail");
  const authContainer = document.getElementById("headerAuthContainer");

  // auth widget: right rail on desktop, top bar on mobile
  function placeAuth() {
    if (!authContainer || !topbar || !userRail) return;
    const target = mq.matches ? topbar : userRail;
    if (authContainer.parentElement !== target)
      target.appendChild(authContainer);
  }
  placeAuth();
  mq.addEventListener("change", placeAuth);

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

    // tapping a destination closes the menu; settings toggle just expands
    sidebar.querySelectorAll(".nav-link").forEach((link) => {
      if (link.id === "settingsToggleBtn") return;
      link.addEventListener("click", () => {
        if (mq.matches) closeNav();
      });
    });

    mq.addEventListener("change", () => {
      if (!mq.matches) closeNav();
    });
  }
})();
