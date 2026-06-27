(function () {
  const BIO_PLACEHOLDER = "Add bio";
  const BIO_MAX = 200;
  const bioEl = document.querySelector(".profile-bio");
  const editBtn = document.querySelector(".bio-edit-btn");
  if (!bioEl) return;

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

    const wrap = document.createElement("div");
    wrap.className = "bio-edit-wrap";

    const textarea = document.createElement("textarea");
    textarea.className = "profile-bio-input";
    textarea.maxLength = BIO_MAX;
    textarea.value = prev;
    textarea.setAttribute("aria-label", "Edit bio");

    const counter = document.createElement("div");
    counter.className = "bio-counter";
    const updateCounter = () => {
      counter.textContent = `${textarea.value.length}/${BIO_MAX}`;
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
      const next = textarea.value.trim().slice(0, BIO_MAX);
      wrap.replaceWith(bioEl);
      if (editBtn) editBtn.style.display = "";
      editing = false;

      if (!save || next === prev) {
        renderBio();
        return;
      }

      applyBioText(next); // optimistic

      try {
        if (window.MovieAPI && MovieAPI.updateProfile) {
          await MovieAPI.updateProfile({ bio: next });
        } else {
          saveBioLocal(next);
        }
        if (window.toast) toast.success("Bio updated.");
      } catch (err) {
        renderBio(); // cached user still holds old bio, so this reverts
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

  bioEl.addEventListener("click", startEditing);
  if (editBtn) {
    editBtn.removeAttribute("data-toast");
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      startEditing();
    });
  }

  renderBio();
})();

// avatar upload: downscale to a 256x256 square so the stored data url stays tiny
(function () {
  const camBtn = document.querySelector(".upload-new-pic");
  if (!camBtn) return;
  camBtn.removeAttribute("data-toast");
  camBtn.style.cursor = "pointer";

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.hidden = true;
  document.body.appendChild(input);

  camBtn.addEventListener("click", () => input.click());

  const bigAvatar = document.querySelector(".profile-avatar .avatar-pic");
  if (bigAvatar) {
    bigAvatar.style.cursor = "pointer";
    bigAvatar.addEventListener("click", () => input.click());
  }

  // center-crop to a square canvas, return a jpeg data url
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
          reject(e);
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
    input.value = ""; // reset so the same file can be re-picked
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

    // optimistic; revert if the save fails
    const imgs = [...document.querySelectorAll(".avatar-pic, .profile-pic")];
    const prev = imgs.map((im) => im.src);
    imgs.forEach((im) => (im.src = dataUrl));

    try {
      if (window.MovieAPI && MovieAPI.updateProfile) {
        await MovieAPI.updateProfile({ avatarUrl: dataUrl });
      } else {
        const u = JSON.parse(localStorage.getItem("currentUser") || "{}");
        u.avatarUrl = dataUrl;
        localStorage.setItem("currentUser", JSON.stringify(u));
      }
      if (window.toast) toast.success("Profile picture updated.");
    } catch (err) {
      imgs.forEach((im, i) => (im.src = prev[i]));
      if (window.toast) toast.error(err.message || "Couldn't update your picture.");
    }
  });
})();
