// collection/shared.js — Collection Page shared core (state + cross-file helpers).
//
// The Collection page is split across several files that all run on collection.html
// (?id=<collectionId>). Because vanilla <script defer> files can't share a private
// closure, the pieces communicate through a single namespace object, window.CollectionPage
// (aliased CP below). This file owns:
//   • the page `state`, the SORTS options, and the $/esc DOM helpers,
//   • sortMovies (client-side comparators), metaLine (header meta string),
//   • confirmModal (the reusable danger confirm used by remove-movie).
// Leaf files (sort.js, grid.js) and the orchestrator (main.js) attach their own
// functions onto CP. Load this FIRST.
//
// Depends on: window.escapeHtml (optional). Loaded before any other collection/* file.

(function () {
  // The shared namespace. Created once here; later files add to it.
  const CP = (window.CollectionPage = window.CollectionPage || {});

  CP.$ = (id) => document.getElementById(id);
  CP.esc = (s) => (window.escapeHtml ? window.escapeHtml(s) : String(s ?? ""));

  // The 6 sort options shown in the dropdown (Figma owner view). Each maps to a
  // client-side comparator over the collection's movies. `short` is the compact
  // label shown in the closed pill; `label` is the full text shown in the open
  // menu (mirrors the home feed's short/long sort pattern).
  CP.SORTS = [
    { key: "added_desc", short: "Latest Added", label: "Date Added (Latest → Earliest)" },
    { key: "added_asc", short: "Earliest Added", label: "Date Added (Earliest → Latest)" },
    { key: "title_asc", short: "A → Z", label: "Alphabetical (A → Z)" },
    { key: "title_desc", short: "Z → A", label: "Alphabetical (Z → A)" },
    { key: "year_desc", short: "Newest", label: "Release Date (Latest → Earliest)" },
    { key: "year_asc", short: "Oldest", label: "Release Date (Earliest → Latest)" },
  ];

  CP.state = {
    id: null,
    collection: null, // normalized full collection
    movies: [], // working (sorted) copy
    sort: "added_desc",
    isOwner: false,
  };

  // ---- sorting ----------------------------------------------------------------
  CP.sortMovies = function sortMovies(movies, sortKey) {
    const arr = [...movies];
    const byAdded = (a, b) => new Date(a.addedAt || 0) - new Date(b.addedAt || 0);
    const byYear = (a, b) => (a.releaseYear || 0) - (b.releaseYear || 0);
    const byTitle = (a, b) =>
      String(a.title || "").localeCompare(String(b.title || ""));
    switch (sortKey) {
      case "added_asc": return arr.sort(byAdded);
      case "added_desc": return arr.sort((a, b) => byAdded(b, a));
      case "year_asc": return arr.sort(byYear);
      case "year_desc": return arr.sort((a, b) => byYear(b, a));
      case "title_asc": return arr.sort(byTitle);
      case "title_desc": return arr.sort((a, b) => byTitle(b, a));
      default: return arr;
    }
  };

  // ---- header -----------------------------------------------------------------
  CP.metaLine = function metaLine(c, isOwner) {
    const count = c.movieCount || 0;
    let line = `By ${c.author || "Unknown"} | ${count} ${count === 1 ? "Movie" : "Movies"}`;
    if (!c.isPublic) {
      line += " | Private"; // only an owner ever sees a private collection
    } else if (isOwner) {
      line += ` | Public | ${c.likesCount ?? 0} Likes | ${c.savesCount ?? 0} Saves`;
    } else {
      // visitor on a public collection — counts only (Figma visitor view)
      line += ` | ${c.likesCount ?? 0} Likes | ${c.savesCount ?? 0} Saves`;
    }
    return line;
  };

  // ---- reusable confirm modal (matches the shared sign-out modal styling) ------
  CP.confirmModal = function confirmModal({ title, text, confirmLabel = "Confirm" }) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "modal-overlay";
      overlay.innerHTML = `
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="colConfirmTitle" aria-describedby="colConfirmText">
          <h3 class="modal-title" id="colConfirmTitle"></h3>
          <p class="modal-text" id="colConfirmText"></p>
          <div class="modal-actions">
            <button class="modal-btn modal-btn--ghost" data-act="cancel">Cancel</button>
            <button class="modal-btn modal-btn--danger" data-act="confirm"></button>
          </div>
        </div>`;
      overlay.querySelector(".modal-title").textContent = title;
      overlay.querySelector(".modal-text").textContent = text;
      overlay.querySelector('[data-act="confirm"]').textContent = confirmLabel;
      document.body.appendChild(overlay);

      const close = (val) => {
        overlay.classList.remove("show");
        setTimeout(() => overlay.remove(), 250);
        document.removeEventListener("keydown", onKey);
        resolve(val);
      };
      const onKey = (e) => { if (e.key === "Escape") close(false); };

      overlay.addEventListener("click", (e) => {
        const act = e.target.dataset.act;
        if (e.target === overlay || act === "cancel") close(false);
        else if (act === "confirm") close(true);
      });
      document.addEventListener("keydown", onKey);

      void overlay.offsetWidth; // reflow so the fade-in plays
      overlay.classList.add("show");
      overlay.querySelector('[data-act="confirm"]').focus();
    });
  };
})();
