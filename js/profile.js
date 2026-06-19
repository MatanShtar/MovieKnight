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

// ==========================================
// 1–3. COLLECTIONS — real data, 2×2 covers, and the 3-dots menu (real actions)
// ==========================================
// The profile grid is now backed by the live API (GET /api/collections). Each
// card's cover is an auto-generated collage of the first ≤4 movie posters
// (FR-4.6.6): 0 → a gray placeholder, 1 → that poster, 2–3 → the first two side
// by side, 4+ → a 2×2 grid (a 1×4 row on phones). The 3-dots menu performs real
// rename / publish-unpublish / copy-link / delete against the backend.
(function () {
  const row = document.querySelector(".collections-row");
  const menu = document.getElementById("collectionMenu");
  const countEl = document.getElementById("collectionCount");
  if (!row) return;

  const ACCENT_DEFAULT = "#D4AF37"; // gold for the 3 default lists
  const ACCENT_CUSTOM = "#BC6676"; // rose for user lists
  const collectionUrl = (id) => `collection.html?id=${encodeURIComponent(id)}`;

  let collections = []; // the live, normalised list (kept in sync with the DOM)
  const byId = (id) => collections.find((c) => c.id === id);

  // ---- skeletons ----
  function skeletonMarkup(n) {
    const card = `
      <article class="collection-card collection-card--skeleton" aria-hidden="true">
        <div class="skeleton skeleton-name"></div>
        <div class="skeleton skeleton-poster"></div>
        <div class="skeleton skeleton-stats"></div>
      </article>`;
    return card.repeat(n);
  }

  // ---- cover collage (poster-count → layout) ----
  // A missing/broken poster swaps to a gray placeholder tile (never a blank cell).
  const TILE_ERR =
    "this.replaceWith(Object.assign(document.createElement('span'),{className:'cover-tile cover-tile--empty'}))";
  const tileImg = (src) =>
    `<img class="cover-tile" src="${escapeHtml(src)}" alt="" loading="lazy" onerror="${TILE_ERR}">`;

  function buildCover(c) {
    // A custom uploaded cover wins over the auto-collage. It fills the fixed
    // cover box (object-fit:cover in CSS) so the card height stays uniform.
    if (c.posterUrl) {
      return `<div class="collection-cover cover-1">${tileImg(c.posterUrl)}</div>`;
    }
    const posters = c.posters || [];
    const n = posters.length;
    // 0 movies → a single solid placeholder with a centered circled "+"
    // (Figma empty cover), NOT four gray squares.
    if (n === 0) {
      return `<div class="collection-cover cover-empty" role="img" aria-label="No movies yet"><span class="cover-empty__plus" aria-hidden="true"></span></div>`;
    }
    let layout, tiles;
    if (n === 1) {
      layout = "cover-1";
      tiles = posters.slice(0, 1);
    } else if (n <= 3) {
      layout = "cover-2"; // first two, side by side (full-height halves)
      tiles = posters.slice(0, 2);
    } else {
      layout = "cover-4"; // 2×2 (1×4 on phones, via CSS)
      tiles = posters.slice(0, 4);
    }
    const cells = tiles.map(tileImg).join("");
    return `<div class="collection-cover ${layout}">${cells}</div>`;
  }

  // Abbreviate large counts (e.g. 1240 → "1.2k") so 4–5 digit values don't
  // crowd/overflow the stats row on a narrow card.
  const fmt = (n) =>
    n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "") + "k" : n;

  // ---- one card ----
  function buildCard(c) {
    const accent = c.isDefault ? ACCENT_DEFAULT : ACCENT_CUSTOM;
    const visibilityIcon = c.isPublic ? "globus" : "lock";
    const visLabel = c.isPublic ? "Public" : "Private";
    const icon = (name) => {
      const url = `assets/images/icons/${name}-icon.svg`;
      return `<span class="stat-icon" aria-hidden="true" style="-webkit-mask-image: url('${url}'); mask-image: url('${url}');"></span>`;
    };

    // Movie count is ALWAYS first (left); likes + saves follow only on public
    // collections.
    let stats = `<div class="movie-count" aria-label="${fmt(c.movieCount)} movies">${icon("movie-clap")}<span>${fmt(c.movieCount)}</span></div>`;
    if (c.isPublic) {
      stats += `<div class="likes-count" aria-label="${fmt(c.likesCount)} likes">${icon("heart")}<span>${fmt(c.likesCount)}</span></div>
                <div class="saves-count" aria-label="${fmt(c.savesCount)} saves">${icon("download")}<span>${fmt(c.savesCount)}</span></div>`;
    }

    return `
      <article class="collection-card" data-id="${escapeHtml(c.id)}" data-public="${c.isPublic}" data-default="${c.isDefault}" tabindex="0" role="link" aria-label="${escapeHtml(c.name)} collection" style="--card-accent: ${accent}">
        <p class="collection-name">${escapeHtml(c.name)}</p>
        <div class="collection-poster-container">
          ${buildCover(c)}
          <button class="collection-menu-button" aria-label="Collection options" aria-haspopup="menu" aria-expanded="false">
            <img src="assets/images/icons/vertical-3-dots-icon.svg" alt="">
          </button>
        </div>
        <div class="collection-stats" style="color: ${accent}">
          <div class="collections-stats-left">${stats}</div>
          <div class="collections-stats-right" role="img" aria-label="${visLabel}" title="${visLabel} collection">${icon(visibilityIcon)}</div>
        </div>
      </article>`;
  }

  function setCount(n) {
    if (!countEl) return;
    // A non-number (e.g. "Collections") is used as a bare label while loading.
    countEl.textContent =
      typeof n === "number" ? `${n} ${n === 1 ? "Collection" : "Collections"}` : n;
  }

  function emptyStateMarkup() {
    return `
      <div class="collections-empty">
        <h3 class="collections-empty__title">No collections yet</h3>
        <p class="collections-empty__text">Start organising your movies — create your first collection.</p>
        <button type="button" class="collections-empty__cta">Create your first collection</button>
      </div>`;
  }

  function renderCards() {
    if (!collections.length) {
      row.innerHTML = emptyStateMarkup();
      const cta = row.querySelector(".collections-empty__cta");
      if (cta) cta.addEventListener("click", createCollection);
      setCount(0);
      return;
    }
    row.innerHTML = collections.map(buildCard).join("");
    setCount(collections.length);
  }

  function cardEl(id) {
    return row.querySelector(`.collection-card[data-id="${CSS.escape(id)}"]`);
  }

  // ---- initial fetch ----
  (async () => {
    row.innerHTML = skeletonMarkup(4);
    setCount("Collections"); // label placeholder (avoids a lone "…" glyph)
    try {
      collections = await MovieAPI.listCollections();
      // preload a few cover posters so the grid doesn't pop in piecemeal
      await preloadImages(collections.flatMap((c) => c.posters).slice(0, 12));
      renderCards();
    } catch (err) {
      console.error("Could not load collections:", err);
      collections = [];
      renderCards(); // shows the friendly empty state rather than dead space
      if (window.toast) toast.error(err.message || "Couldn't load your collections.");
    }
  })();

  // ==========================================
  // Navigation: click a card body → its collection page
  // ==========================================
  const openCard = (card) => {
    if (!card || !card.dataset.id) return;
    if (card.classList.contains("collection-card--skeleton")) return;
    if (card.querySelector(".collection-name-input")) return; // mid-rename
    window.location.href = collectionUrl(card.dataset.id);
  };

  row.addEventListener("click", (e) => {
    if (e.target.closest(".collection-menu-button")) return; // menu handled below
    const card = e.target.closest(".collection-card");
    // ONLY the "+" itself jumps to the add-movies page; clicking anywhere else on
    // the (empty) cover opens the collection page like a normal card.
    if (e.target.closest(".cover-empty__plus")) {
      if (card && card.dataset.id) window.location.href = addMovieUrl(card.dataset.id);
      return;
    }
    openCard(card);
  });

  // The card is role="link" + tabindex=0, so Enter/Space must activate it.
  row.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const card = e.target.closest(".collection-card");
    if (!card || e.target !== card) return; // ignore keys on inner controls
    e.preventDefault();
    openCard(card);
  });

  // ==========================================
  // 3-dots menu — rename / publish / copy-link / delete (real backend)
  // ==========================================
  let activeBtn = null;

  const MENU_ITEMS = [
    // Always first, for every collection (incl. defaults) — navigates to the
    // full add-movie page for this collection.
    { action: "add", icon: "plus", label: "Add to Collection" },
    { action: "rename", icon: "rename", label: "Rename", defaultHidden: true },
    { toggle: true },
    { action: "copy-link", icon: "copy-link", label: "Copy Link", privateHidden: true },
    {
      action: "delete",
      icon: "red-delete",
      label: "Delete Collection",
      danger: true,
      defaultHidden: true,
    },
  ];

  const addMovieUrl = (id) => `add-movie.html?collection=${encodeURIComponent(id)}`;

  function buildItem(item, isPublic) {
    let { action, icon, label } = item;
    if (item.toggle) {
      action = isPublic ? "unpublish" : "publish";
      label = isPublic ? "Unpublish" : "Publish";
      icon = isPublic ? "lock" : "globus";
    }
    const danger = item.danger ? " collection-menu-item--danger" : "";
    return `
      <button class="collection-menu-item${danger}" role="menuitem" data-action="${action}">
        <img class="menu-icon" src="assets/images/icons/${icon}-icon.svg" alt="" />
        <span>${label}</span>
      </button>`;
  }

  function renderMenu(isDefault, isPublic) {
    const items = MENU_ITEMS.filter(
      (item) =>
        !(isDefault && item.defaultHidden) && !(!isPublic && item.privateHidden),
    )
      .map((item) => buildItem(item, isPublic))
      .join("");
    const note = isDefault
      ? `<p class="collection-menu-note">Default Collection</p>`
      : "";
    menu.setAttribute("role", "menu");
    menu.innerHTML = items + note;
  }

  const menuItemEls = () => [...menu.querySelectorAll(".collection-menu-item")];

  function openMenu(button) {
    closeMenu();
    const card = button.closest(".collection-card");
    if (!card) return;
    menu.dataset.id = card.dataset.id;
    renderMenu(card.dataset.default === "true", card.dataset.public === "true");
    menu.hidden = false; // reveal first so we can measure its width

    const r = button.getBoundingClientRect();
    menu.style.top = `${r.bottom + 6}px`;
    menu.style.left = `${Math.max(8, r.right - menu.offsetWidth)}px`;

    activeBtn = button;
    button.classList.add("collection-menu-button--active");
    button.setAttribute("aria-expanded", "true");
    // Move focus into the menu (native disclosure-menu pattern).
    const first = menuItemEls()[0];
    if (first) first.focus();
  }

  function closeMenu(restoreFocus = false) {
    if (menu) menu.hidden = true;
    if (activeBtn) {
      activeBtn.classList.remove("collection-menu-button--active");
      activeBtn.setAttribute("aria-expanded", "false");
      if (restoreFocus) activeBtn.focus();
    }
    activeBtn = null;
  }

  if (menu) {
    row.addEventListener("click", (e) => {
      const button = e.target.closest(".collection-menu-button");
      if (!button) return;
      e.stopPropagation();
      const card = button.closest(".collection-card");
      const open = !menu.hidden && menu.dataset.id === card.dataset.id;
      if (open) closeMenu();
      else openMenu(button);
    });

    menu.addEventListener("click", (e) => {
      const item = e.target.closest(".collection-menu-item");
      if (!item) return;
      const id = menu.dataset.id;
      const action = item.dataset.action;
      closeMenu();
      const c = byId(id);
      if (!c) return;
      if (action === "add") window.location.href = addMovieUrl(c.id);
      else if (action === "publish" || action === "unpublish") togglePublish(c);
      else if (action === "copy-link") copyLink(c);
      else if (action === "rename") startRename(c);
      else if (action === "delete") confirmDelete(c);
    });

    document.addEventListener("click", (e) => {
      if (!menu.hidden && !menu.contains(e.target)) closeMenu();
    });
    document.addEventListener("keydown", (e) => {
      if (menu.hidden) return;
      if (e.key === "Escape") {
        e.preventDefault();
        closeMenu(true); // restore focus to the trigger
        return;
      }
      // Arrow / Home / End navigation between menu items.
      const items = menuItemEls();
      if (!items.length) return;
      const i = items.indexOf(document.activeElement);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        items[(i + 1 + items.length) % items.length || 0].focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        items[(i <= 0 ? items.length : i) - 1].focus();
      } else if (e.key === "Home") {
        e.preventDefault();
        items[0].focus();
      } else if (e.key === "End") {
        e.preventDefault();
        items[items.length - 1].focus();
      }
    });
    window.addEventListener("scroll", () => { if (!menu.hidden) closeMenu(); }, true);
  }

  // ---- menu actions ----
  async function togglePublish(c) {
    const next = !c.isPublic;
    try {
      const updated = await MovieAPI.updateCollection(c.id, { isPublic: next });
      Object.assign(c, updated);
      const card = cardEl(c.id);
      if (card) card.replaceWith(buildCardEl(c)); // repaint icon + likes/saves stats
      if (window.toast) {
        toast.success(c.isPublic ? "Collection published." : "Collection unpublished.");
      }
    } catch (err) {
      if (window.toast) toast.error(err.message || "Couldn't update visibility.");
    }
  }

  async function copyLink(c) {
    const url = new URL(collectionUrl(c.id), location.href).href;
    try {
      await navigator.clipboard.writeText(url);
      if (window.toast) toast.success("Link copied to clipboard.");
    } catch {
      if (window.toast) toast.info(url);
    }
  }

  function startRename(c) {
    if (c.isDefault) return;
    const card = cardEl(c.id);
    if (!card) return;
    const nameEl = card.querySelector(".collection-name");
    if (!nameEl || nameEl.querySelector("input")) return;

    const prev = c.name;
    const input = document.createElement("input");
    input.type = "text";
    input.className = "collection-name-input";
    input.maxLength = 60;
    input.value = prev;
    nameEl.textContent = "";
    nameEl.appendChild(input);
    input.focus();
    input.select();

    let settled = false;
    const finish = async (save) => {
      if (settled) return;
      settled = true;
      const next = input.value.trim().slice(0, 60);
      nameEl.textContent = save && next ? next : prev;
      if (!save || !next || next === prev) return;
      try {
        const updated = await MovieAPI.updateCollection(c.id, { name: next });
        Object.assign(c, updated);
        nameEl.textContent = c.name;
        if (window.toast) toast.success("Collection renamed.");
      } catch (err) {
        nameEl.textContent = prev;
        if (window.toast) toast.error(err.message || "Couldn't rename collection.");
      }
    };
    input.addEventListener("click", (e) => e.stopPropagation());
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") { e.preventDefault(); finish(true); }
      else if (e.key === "Escape") { e.preventDefault(); finish(false); }
    });
    input.addEventListener("blur", () => finish(true));
  }

  async function confirmDelete(c) {
    const ok = await confirmModal({
      title: "Delete collection?",
      text: `Delete “${c.name}”? This can’t be undone.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      await MovieAPI.deleteCollection(c.id);
      collections = collections.filter((x) => x.id !== c.id);
      if (collections.length === 0) {
        renderCards(); // surface the friendly empty state, not a blank grid
      } else {
        const card = cardEl(c.id);
        if (card) card.remove();
        setCount(collections.length);
      }
      if (window.toast) toast.info(`Deleted “${c.name}”.`);
    } catch (err) {
      if (window.toast) toast.error(err.message || "Couldn't delete collection.");
    }
  }

  // Build a card as a DOM element (for in-place replacement).
  function buildCardEl(c) {
    const tpl = document.createElement("template");
    tpl.innerHTML = buildCard(c).trim();
    return tpl.content.firstElementChild;
  }

  // ==========================================
  // New Collection — create then jump to it
  // ==========================================
  // Shared by the "New Collection" button and the empty-state CTA. While the
  // request is in flight the triggering button shows "Creating…" and stays
  // disabled (it never re-enables — on success we navigate away).
  let creating = false;
  async function createCollection(e) {
    if (creating) return;
    const btn = e && e.currentTarget instanceof HTMLButtonElement ? e.currentTarget : null;
    creating = true;
    let label;
    if (btn) {
      btn.disabled = true;
      const span = btn.querySelector("span") || btn;
      label = span.textContent;
      span.textContent = "Creating…";
    }
    try {
      const created = await MovieAPI.createCollection(); // server auto-names it
      window.location.href = collectionUrl(created.id);
    } catch (err) {
      creating = false;
      if (btn) {
        btn.disabled = false;
        const span = btn.querySelector("span") || btn;
        span.textContent = label;
      }
      if (window.toast) toast.error(err.message || "Couldn't create a collection.");
    }
  }

  const newBtn = document.querySelector(".new-collection-btn");
  if (newBtn) {
    newBtn.removeAttribute("data-toast"); // was a "Coming Soon" stub (still in HTML)
    newBtn.addEventListener("click", createCollection);
  }

  // ---- reusable confirm modal (shares the sign-out modal styling) ----
  function confirmModal({ title, text, confirmLabel = "Confirm" }) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "modal-overlay";
      overlay.innerHTML = `
        <div class="modal-card" role="dialog" aria-modal="true">
          <h3 class="modal-title"></h3>
          <p class="modal-text"></p>
          <div class="modal-actions">
            <button class="modal-btn modal-btn--ghost" data-act="cancel">Cancel</button>
            <button class="modal-btn modal-btn--danger" data-act="confirm"></button>
          </div>
        </div>`;
      overlay.querySelector(".modal-title").textContent = title;
      overlay.querySelector(".modal-text").textContent = text;
      overlay.querySelector('[data-act="confirm"]').textContent = confirmLabel;
      document.body.appendChild(overlay);

      const done = (val) => {
        overlay.classList.remove("show");
        setTimeout(() => overlay.remove(), 250);
        document.removeEventListener("keydown", onKey);
        resolve(val);
      };
      const onKey = (e) => { if (e.key === "Escape") done(false); };
      overlay.addEventListener("click", (e) => {
        const act = e.target.dataset.act;
        if (e.target === overlay || act === "cancel") done(false);
        else if (act === "confirm") done(true);
      });
      document.addEventListener("keydown", onKey);
      void overlay.offsetWidth;
      overlay.classList.add("show");
      overlay.querySelector('[data-act="confirm"]').focus();
    });
  }
})();

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

// ==========================================
// 6. PROGRESSION BADGES (data-driven from the user's `badges`)
// ==========================================
// Earned badges render as metallic shields coloured by tier (gold/silver/bronze).
// A user with no badges shows three empty DASHED shields (Figma "just created").
// Badges are a cosmetic mock for now: the Yuviverse7 demo user is seeded with
// three; every other account has an empty array → the dashed state. "View All
// Badges" stays a Coming-Soon stub for everyone (the full badges page is deferred).
(function () {
  const display = document.getElementById("badgesDisplay");
  if (!display) return;

  const user = (() => {
    try {
      return JSON.parse(localStorage.getItem("currentUser"));
    } catch {
      return null;
    }
  })();
  const badges = user && Array.isArray(user.badges) ? user.badges : [];

  const TIER_CLASS = {
    gold: "gold-shield",
    silver: "silver-shield",
    bronze: "bronze-shield",
  };
  const SHIELD_PATH =
    "M59.8442 140.437C49.3608 125.189 30.6421 126.191 16.3498 113.564C11.7487 109.499 7.33404 106.622 6.16922 93.7854C5.13253 82.2653 9.19764 76.6509 8.96468 58.5379C8.85984 50.3492 10.875 33.0516 0.391602 23.0458C10.3042 15.9986 16.6525 8.06611 16.1284 0.436523C29.2326 7.55359 48.1611 7.70503 59.0289 8.01953H58.7027H61.0788H60.6712C71.539 7.70503 90.5256 7.55359 103.63 0.436523C103.106 8.06611 109.454 15.9986 119.367 23.0458C108.883 33.0516 111.038 50.3492 110.922 58.5379C110.689 76.6392 114.754 82.2537 113.717 93.7854C112.552 106.622 108.149 109.499 103.537 113.564C89.2443 126.191 70.3276 125.189 59.8442 140.437Z";
  const shieldSvg = (cls) =>
    `<svg width="120" height="118" viewBox="0 0 120 141" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path class="shield-path ${cls}" d="${SHIELD_PATH}" /></svg>`;

  function render(list) {
    const arr = Array.isArray(list) ? list : [];
    if (arr.length) {
      display.innerHTML = arr
        .slice(0, 3)
        .map((b) => {
          const cls = TIER_CLASS[b.tier] || "bronze-shield";
          const tip = b.subtitle
            ? `<span class="badge-tooltip">${escapeHtml(b.subtitle)}</span>`
            : "";
          return `<div class="badge-shield">${shieldSvg(cls)}<span class="badge-title">${escapeHtml(b.name)}</span>${tip}</div>`;
        })
        .join("");
    } else {
      display.innerHTML = Array.from(
        { length: 3 },
        () => `<div class="badge-shield badge-shield--empty">${shieldSvg("")}</div>`,
      ).join("");
    }
  }

  // Render from the cached user first (instant), then refresh from the server so
  // badges stay current even for a session cached before badges were assigned.
  render(badges);
  if (window.MovieAPI && MovieAPI.me) {
    MovieAPI.me()
      .then((fresh) => { if (fresh) render(fresh.badges); })
      .catch(() => {});
  }
})();
