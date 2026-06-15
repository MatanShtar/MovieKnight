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

  // Menu item clicks - actions are placeholders for now (will wire these up later)
  menu.addEventListener("click", (e) => {
    const item = e.target.closest(".collection-menu-item");
    if (!item) return;
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
