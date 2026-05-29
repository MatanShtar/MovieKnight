// --- RENDER COLLECTIONS FROM JSON ---
// Most basic card for now: the poster image + the name above it. Build on top of this.
(async () => {
  const row = document.querySelector(".collections-row");
  if (!row) return;

  try {
    const res = await fetch("data/collections.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { collections } = await res.json();

    row.innerHTML = collections.map(buildCollectionCard).join("");
  } catch (err) {
    console.error("Could not load collections:", err);
  }
})();

function buildCollectionCard(c, i) {
  const primaryColor = c.default ? "#D4AF37" : "#BC6676";
  const visibilityIcon = c.published ? "globus" : "lock";

  const icon = (name) => {
    const url = `assets/images/icons/${name}-icon.svg`;
    return `<span class="stat-icon" style="-webkit-mask-image: url('${url}'); mask-image: url('${url}');"></span>`;
  };

  let stats = `<div class="movie-count">${icon('movie-clap')}<span>${c.totalMovies}</span></div>`;
  if (c.published) {
    stats += `<div class="likes-count">${icon('heart')}<span>${c.totalLikes}</span></div>
              <div class="saves-count">${icon('download')}<span>${c.totalSaves}</span></div>`;
  }

  return `
    <article class="collection-card" data-card="${i}" data-published="${c.published}">
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

// --- COLLECTION CARD 3-DOTS MENU ---
// Event delegation on .collections-row so it works for cards rendered
// asynchronously by the fetch above (binding per-button at load would miss them).
(function () {
  "use strict";

  const menu = document.getElementById("collectionMenu");
  const row = document.querySelector(".collections-row");
  if (!menu || !row) return;

  let activeBtn = null;

  function openMenu(button) {
    closeMenu(); // clear any previously-open state first

    const card = button.closest(".collection-card");
    if (!card) return;
    menu.dataset.card = card.dataset.card; // remember which collection this is for

    // Public collections can be Unpublished (lock icon); private ones can be Published (globe icon)
    const published = card.dataset.published === "true";
    const toggle = document.getElementById("publishToggleItem");
    if (toggle) {
      toggle.dataset.action = published ? "unpublish" : "publish";
      toggle.querySelector("span").textContent = published ? "Unpublish" : "Publish";
      toggle.querySelector(".menu-icon").src = published
        ? "assets/images/icons/lock-icon.svg"
        : "assets/images/icons/globus-icon.svg";
    }

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

  // Menu item clicks — actions are stubs for now (wire these up later)
  menu.addEventListener("click", (e) => {
    const item = e.target.closest(".collection-menu-item");
    if (!item) return;
    console.log(`${item.dataset.action} -> collection #${menu.dataset.card}`);
    closeMenu();
  });

  // Close on outside click, Escape, or scroll
  document.addEventListener("click", (e) => {
    if (!menu.hidden && !menu.contains(e.target)) closeMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });
  window.addEventListener("scroll", () => {
    if (!menu.hidden) closeMenu();
  }, true);
})();
