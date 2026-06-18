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
// 1. FETCH & RENDER COLLECTIONS
// ==========================================
(async () => {
  const row = document.querySelector(".collections-row");
  if (!row) return;

  row.innerHTML = skeletonMarkup(4); // placeholder while we fetch + preload

  try {
    const res = await fetch("data/collections.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { totalCollections, collections } = await res.json();

    // Inject collections amount
    const countEl = document.getElementById("collectionCount");
    const colCount = totalCollections ?? collections.length;
    countEl.textContent = `${colCount} Collections`;

    const html = collections.map(buildCollectionCard).join("");
    await preloadImages(collections.map((c) => c.posterPath)); // wait for posters
    row.innerHTML = html;
  } catch (err) {
    console.error("Could not load collections:", err);
    row.innerHTML = ""; // drop the skeletons rather than spin forever
  }
})();

// ==========================================
// 2. CARD BUILDERS & SKELETONS
// ==========================================
function skeletonMarkup(n) {
  const card = `
    <article class="collection-card collection-card--skeleton" aria-hidden="true">
      <div class="skeleton skeleton-name"></div>
      <div class="skeleton skeleton-poster"></div>
      <div class="skeleton skeleton-stats"></div>
    </article>`;
  return card.repeat(n);
}

function buildCollectionCard(c, i) {
  const primaryColor = c.default ? "#D4AF37" : "#BC6676";
  const visibilityIcon = c.published ? "globus" : "lock";

  const icon = (name) => {
    const url = `assets/images/icons/${name}-icon.svg`;
    return `<span class="stat-icon" style="-webkit-mask-image: url('${url}'); mask-image: url('${url}');"></span>`;
  };

  let stats = `<div class="movie-count">${icon("movie-clap")}<span>${c.totalMovies}</span></div>`;
  if (c.published) {
    stats += `<div class="likes-count">${icon("heart")}<span>${c.totalLikes}</span></div>
              <div class="saves-count">${icon("download")}<span>${c.totalSaves}</span></div>`;
  }

  return `
    <article class="collection-card" data-card="${i}" data-published="${c.published}" data-default="${c.default}" style="--card-accent: ${primaryColor}" data-toast="soon:Coming Soon!">
      <p class="collection-name">${c.name}</p>
      <div class="collection-poster-container" style="border: 3px solid ${primaryColor}">
        <img class="collection-poster" src="${c.posterPath}" alt="${c.name}">
        <button class="collection-menu-button">
          <img src="assets/images/icons/vertical-3-dots-icon.svg" alt="Menu">
        </button>
      </div>
      <div class="collection-stats" style="color: ${primaryColor}">
        <div class="collections-stats-left">
          ${stats}
        </div>
        <div class="collections-stats-right">
          ${icon(visibilityIcon)}
        </div>
      </div>
    </article>`;
}

// ==========================================
// 3. COLLECTION 3-DOTS MENU
// ==========================================
(function () {
  const menu = document.getElementById("collectionMenu");
  const row = document.querySelector(".collections-row");
  if (!menu || !row) return;

  let activeBtn = null;

  const MENU_ITEMS = [
    { action: "add", icon: "plus", label: "Add to Collection" },
    { action: "rename", icon: "rename", label: "Rename", defaultHidden: true },
    { toggle: true },
    { action: "copy-link", icon: "copy-link", label: "Copy Link" },
    {
      action: "delete",
      icon: "red-delete",
      label: "Delete Collection",
      danger: true,
      defaultHidden: true,
    },
  ];

  function buildItem(item, isPublished) {
    let { action, icon, label } = item;
    let id = "";
    if (item.toggle) {
      // public collections can be Unpublished (lock icon); private ones Published (globe)
      action = isPublished ? "unpublish" : "publish";
      label = isPublished ? "Unpublish" : "Publish";
      icon = isPublished ? "lock" : "globus";
      id = ' id="publishToggleItem"';
    }
    const danger = item.danger ? " collection-menu-item--danger" : "";
    return `
      <button class="collection-menu-item${danger}"${id} data-action="${action}">
        <img class="menu-icon" src="assets/images/icons/${icon}-icon.svg" alt="" />
        <span>${label}</span>
      </button>`;
  }

  function renderMenu(isDefault, isPublished) {
    const items = MENU_ITEMS.filter(
      (item) => !(isDefault && item.defaultHidden),
    )
      .map((item) => buildItem(item, isPublished))
      .join("");
    // footnote on default collections, explaining the trimmed set of actions
    const note = isDefault
      ? `<p class="collection-menu-note">Default Collection</p>`
      : "";
    menu.innerHTML = items + note;
  }

  function openMenu(button) {
    closeMenu(); // clear any previously-open state first

    const card = button.closest(".collection-card");
    if (!card) return;
    menu.dataset.card = card.dataset.card; // remember which collection this is for

    // Build this collection's menu. Default collections (data-default) drop the
    // Rename + Delete items; the Publish/Unpublish item reflects the published state.
    renderMenu(
      card.dataset.default === "true",
      card.dataset.published === "true",
    );

    menu.hidden = false; // reveal first so we can measure its width

    // Anchor under the dots button, right edges aligned.
    // position: fixed -> getBoundingClientRect gives the coords we need directly.
    const r = button.getBoundingClientRect();
    menu.style.top = `${r.bottom + 6}px`;
    menu.style.left = `${Math.max(8, r.right - menu.offsetWidth)}px`;

    activeBtn = button;
    button.classList.add("collection-menu-button--active");
  }

  function closeMenu() {
    menu.hidden = true;
    if (activeBtn) activeBtn.classList.remove("collection-menu-button--active");
    activeBtn = null;
  }

  // Open / toggle when a card's 3-dots button is clicked
  row.addEventListener("click", (e) => {
    const button = e.target.closest(".collection-menu-button");
    if (!button) return;
    e.stopPropagation(); // don't let the document handler immediately close it

    const card = button.closest(".collection-card");
    const alreadyOpen = !menu.hidden && menu.dataset.card === card.dataset.card;
    if (alreadyOpen) closeMenu();
    else openMenu(button);
  });

  // Flip a collection's visibility icon (globe = public, lock = private) to
  // mirror the new Publish/Unpublish state. UI-only — no backend call.
  function setCardPublished(card, nowPublished) {
    card.dataset.published = String(nowPublished);
    const iconEl = card.querySelector(".collections-stats-right .stat-icon");
    if (iconEl) {
      const url = `assets/images/icons/${nowPublished ? "globus" : "lock"}-icon.svg`;
      iconEl.style.webkitMaskImage = `url('${url}')`;
      iconEl.style.maskImage = `url('${url}')`;
    }
  }

  // Menu item clicks. Publish/Unpublish toggles a purely visual state; the
  // remaining actions are still placeholders (no backend yet).
  menu.addEventListener("click", (e) => {
    const item = e.target.closest(".collection-menu-item");
    if (!item) return;
    const action = item.dataset.action;

    if (action === "publish" || action === "unpublish") {
      const card = row.querySelector(
        `.collection-card[data-card="${menu.dataset.card}"]`,
      );
      if (card) {
        const nowPublished = action === "publish";
        setCardPublished(card, nowPublished);
        toast.success(
          nowPublished ? "Collection published." : "Collection unpublished.",
        );
      }
      closeMenu();
      return;
    }

    closeMenu();
    toast.soon("Coming Soon!");
  });

  // Close on outside click, Escape, or scroll
  document.addEventListener("click", (e) => {
    if (!menu.hidden && !menu.contains(e.target)) closeMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });
  window.addEventListener(
    "scroll",
    () => {
      if (!menu.hidden) closeMenu();
    },
    true,
  );
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
