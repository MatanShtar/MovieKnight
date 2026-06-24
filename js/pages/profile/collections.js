// profile/collections.js — the collections grid (live API): 2×2 cover collages,
// the 3-dots context menu (rename / publish / copy-link / delete), New
// Collection creation, the Add-to-Collection modal wiring, and a reusable
// confirm modal. The biggest, self-contained block of the profile page.
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

  // ---- cover collage ----
  // Shared with the Add-to-Collection modal via common.js (buildCollectionCover)
  // so the layout rules (0 → placeholder, 1 → single, 2-3 → two, 4+ → 2×2) live
  // in exactly one place.
  const buildCover = (c) => window.buildCollectionCover(c);

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
      // preload a few cover images (poster + backdrop) so the grid doesn't pop in
      // piecemeal — whichever the layout picks for the current viewport is warm.
      await preloadImages(
        collections
          .flatMap((c) => (c.covers || []).flatMap((x) => [x.poster, x.backdrop]))
          .filter(Boolean)
          .slice(0, 12)
      );
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
    // ONLY the "+" itself opens the Add-to-Collection modal; clicking anywhere else on
    // the (empty) cover opens the collection page like a normal card.
    if (e.target.closest(".cover-empty__plus")) {
      if (card && card.dataset.id) {
        const nameEl = card.querySelector(".collection-name");
        openAddFor(card.dataset.id, nameEl && nameEl.textContent);
      }
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
    // Always first, for every collection (incl. defaults) — opens the
    // Add-to-Collection modal overlaid on the profile.
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

  // Open the shared Add-to-Collection modal overlaid on the profile, then refresh
  // the affected card (count + cover) when a movie is added/removed.
  function openAddFor(id, name) {
    if (!window.AddToCollectionModal) {
      if (window.toast) toast.soon("Add to Collection — Coming Soon!");
      return;
    }
    AddToCollectionModal.open(id, name || "Collection", { onChange: refreshCollections });
  }
  async function refreshCollections() {
    try {
      collections = await MovieAPI.listCollections();
      renderCards();
    } catch (_) {
      /* keep the current grid on a refresh hiccup */
    }
  }

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
      if (action === "add") openAddFor(c.id, c.name);
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
      if (window.toast) toast.warn(`Deleted “${c.name}”`);
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
