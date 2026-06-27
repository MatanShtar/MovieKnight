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

  document.querySelectorAll(".avatar-pic, .profile-pic").forEach((img) => {
    img.src = avatar;
  });
})();
