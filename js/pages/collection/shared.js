// load first; other collection/* files depend on this.

(function () {
  const CP = (window.CollectionPage = window.CollectionPage || {});

  CP.$ = (id) => document.getElementById(id);
  CP.esc = (s) => (window.escapeHtml ? window.escapeHtml(s) : String(s ?? ""));

  // short = compact label in closed pill; label = full menu text
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
    collection: null,
    movies: [],
    sort: "added_desc",
    isOwner: false,
  };

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

  CP.metaLine = function metaLine(c, isOwner) {
    const count = c.movieCount || 0;
    let line = `By ${c.author || "Unknown"} | ${count} ${count === 1 ? "Movie" : "Movies"}`;
    if (!c.isPublic) {
      line += " | Private";
    } else if (isOwner) {
      line += ` | Public | ${c.likesCount ?? 0} Likes | ${c.savesCount ?? 0} Saves`;
    } else {
      line += ` | ${c.likesCount ?? 0} Likes | ${c.savesCount ?? 0} Saves`;
    }
    return line;
  };

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

      void overlay.offsetWidth; // reflow so fade-in plays
      overlay.classList.add("show");
      overlay.querySelector('[data-act="confirm"]').focus();
    });
  };
})();
