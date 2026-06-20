// profile/header.js — fills the logged-in user's profile header (avatar + name)
// and bounces guests to login. Self-contained IIFE; locals stay off the global
// scope (common.js already declares a global `currentUser`).
// ==========================================
// 0. LOGGED-IN USER → PROFILE HEADER
// ==========================================
// Profile is personal. Read the real signed-in user (stored by js/api.js on
// login/signup) and fill the header; guests are bounced to the login page.
// Wrapped in an IIFE so locals stay off the global scope — common.js (also a
// classic script on this page) already declares a global `currentUser`.
(function () {
  const user = (() => {
    try {
      return JSON.parse(localStorage.getItem("currentUser"));
    } catch {
      return null;
    }
  })();

  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const DEFAULT_AVATAR = "assets/images/default-avatar.svg";
  const avatar = user.avatarUrl || DEFAULT_AVATAR;

  const nameEl = document.querySelector(".profile-username");
  if (nameEl) nameEl.textContent = user.username || user.name || "Member";

  // Big profile avatar + the header-rail thumbnail. (common.js fills the rail
  // username via #displayUsername.)
  document.querySelectorAll(".avatar-pic, .profile-pic").forEach((img) => {
    img.src = avatar;
  });
})();
