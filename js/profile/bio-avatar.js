// profile/bio-avatar.js — the editable-bio inline editor and the avatar-upload
// flow. Two independent IIFEs, both persisting to the server via
// MovieAPI.updateProfile (PATCH /api/users/me) with a localStorage fallback.
// ==========================================
// 4. EDITABLE BIO (persisted to the server via PATCH /api/users/me)
// ==========================================
(function () {
  const BIO_PLACEHOLDER = "Add bio";
  const BIO_MAX = 200; // strict cap to keep the bio block from overflowing
  const bioEl = document.querySelector(".profile-bio");
  const editBtn = document.querySelector(".bio-edit-btn");
  if (!bioEl) return;

  // The bio lives on the user object. Saving persists to the server via
  // MovieAPI.updateProfile (PATCH /api/users/me), which also refreshes the
  // cached user; if the API isn't on the page we fall back to the local cache.
  const readUser = () => {
    try {
      return JSON.parse(localStorage.getItem("currentUser")) || {};
    } catch {
      return {};
    }
  };
  const getSavedBio = () => readUser().bio || "";
  const saveBioLocal = (text) => {
    const u = readUser();
    u.bio = text;
    localStorage.setItem("currentUser", JSON.stringify(u));
  };

  // Show the bio (truncated past the BIO_MAX cap), or the "Add bio" placeholder.
  function applyBioText(text) {
    const t = (text || "").trim();
    if (t) {
      bioEl.textContent = t.length > BIO_MAX ? t.slice(0, BIO_MAX).trimEnd() + "…" : t;
      bioEl.classList.remove("profile-bio--placeholder");
    } else {
      bioEl.textContent = BIO_PLACEHOLDER;
      bioEl.classList.add("profile-bio--placeholder");
    }
  }
  const renderBio = () => applyBioText(getSavedBio());

  let editing = false;
  function startEditing() {
    if (editing) return;
    editing = true;
    const prev = getSavedBio();

    // Swap the static bio for a textarea (multi-line input) seeded with the
    // current text. Enter (⌘/Ctrl) or blur saves; Escape cancels.
    // The editor is a textarea + a live "n/200" counter, grouped in one wrapper
    // so they swap in/out of the layout as a single unit.
    const wrap = document.createElement("div");
    wrap.className = "bio-edit-wrap";

    const textarea = document.createElement("textarea");
    textarea.className = "profile-bio-input";
    textarea.maxLength = BIO_MAX; // hard cap input at 200 characters
    textarea.value = prev;
    textarea.setAttribute("aria-label", "Edit bio");

    const counter = document.createElement("div");
    counter.className = "bio-counter";
    const updateCounter = () => {
      counter.textContent = `${textarea.value.length}/${BIO_MAX}`;
      // Warn as the user approaches the cap.
      counter.classList.toggle("is-full", textarea.value.length >= BIO_MAX);
    };
    updateCounter();
    textarea.addEventListener("input", updateCounter);

    wrap.append(textarea, counter);
    bioEl.replaceWith(wrap);
    if (editBtn) editBtn.style.display = "none";
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    let settled = false;
    const finish = async (save) => {
      if (settled) return;
      settled = true;
      const next = textarea.value.trim().slice(0, BIO_MAX); // enforce the cap
      wrap.replaceWith(bioEl);
      if (editBtn) editBtn.style.display = "";
      editing = false;

      if (!save || next === prev) {
        renderBio();
        return;
      }

      applyBioText(next); // optimistic — show the new bio while it saves

      try {
        if (window.MovieAPI && MovieAPI.updateProfile) {
          await MovieAPI.updateProfile({ bio: next }); // persist + refresh cache
        } else {
          saveBioLocal(next); // no API on the page — cache only
        }
        if (window.toast) toast.success("Bio updated.");
      } catch (err) {
        renderBio(); // cached user still holds the old bio -> reverts
        if (window.toast) toast.error(err.message || "Couldn't save your bio.");
      }
    };

    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish(false);
      } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        finish(true);
      }
    });
    textarea.addEventListener("blur", () => finish(true));
  }

  // Clicking the bio text (or the pencil button) opens the editor.
  bioEl.addEventListener("click", startEditing);
  if (editBtn) {
    editBtn.removeAttribute("data-toast"); // was a "Coming Soon" stub
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      startEditing();
    });
  }

  renderBio();
})();

// ==========================================
// 5. AVATAR UPLOAD (resize client-side -> data URL -> PATCH /api/users/me)
// ==========================================
// The camera button opens a file picker, downscales the chosen image to a
// 256x256 square on a <canvas> (keeps the stored data URL tiny), then saves it
// via MovieAPI.updateProfile. common.js then shows it on every page's header.
(function () {
  const camBtn = document.querySelector(".upload-new-pic");
  if (!camBtn) return;
  camBtn.removeAttribute("data-toast"); // was a "Coming Soon" stub
  camBtn.style.cursor = "pointer";

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.hidden = true;
  document.body.appendChild(input);

  camBtn.addEventListener("click", () => input.click());

  // Clicking the big profile picture itself also opens the file picker (same as
  // the camera badge) — a larger, more discoverable target.
  const bigAvatar = document.querySelector(".profile-avatar .avatar-pic");
  if (bigAvatar) {
    bigAvatar.style.cursor = "pointer";
    bigAvatar.addEventListener("click", () => input.click());
  }

  // Draw the file to a square canvas (center-cropped) → JPEG data URL.
  function toSquareDataUrl(file, size) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objUrl);
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext("2d");
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const sx = (img.naturalWidth - side) / 2;
        const sy = (img.naturalHeight - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        try {
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        } catch (e) {
          reject(e); // e.g. a tainted/odd source
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(objUrl);
        reject(new Error("decode failed"));
      };
      img.src = objUrl;
    });
  }

  input.addEventListener("change", async () => {
    const file = input.files && input.files[0];
    input.value = ""; // reset so the same file can be re-picked later
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      if (window.toast) toast.error("Please choose an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      if (window.toast) toast.error("Image must be under 5 MB.");
      return;
    }

    let dataUrl;
    try {
      dataUrl = await toSquareDataUrl(file, 256);
    } catch {
      if (window.toast) toast.error("Couldn't read that image. Try another.");
      return;
    }

    // Optimistically show the new picture; revert if the save fails.
    const imgs = [...document.querySelectorAll(".avatar-pic, .profile-pic")];
    const prev = imgs.map((im) => im.src);
    imgs.forEach((im) => (im.src = dataUrl));

    try {
      if (window.MovieAPI && MovieAPI.updateProfile) {
        await MovieAPI.updateProfile({ avatarUrl: dataUrl }); // persist + refresh cache
      } else {
        const u = JSON.parse(localStorage.getItem("currentUser") || "{}");
        u.avatarUrl = dataUrl;
        localStorage.setItem("currentUser", JSON.stringify(u));
      }
      if (window.toast) toast.success("Profile picture updated.");
    } catch (err) {
      imgs.forEach((im, i) => (im.src = prev[i])); // revert
      if (window.toast) toast.error(err.message || "Couldn't update your picture.");
    }
  });
})();
