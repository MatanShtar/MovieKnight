// add-to-collection-modal.js — shared "Add to <Collection>" modal.
//
// Used by BOTH the collection page and the profile page: search movies and
// toggle them in/out of one specific collection, overlaid on the current page.
//
//   AddToCollectionModal.open(collectionId, "Favorites", {
//     initialMovieIds: [123, 456],   // pre-flag movies already in the list (optional)
//     onChange: (action, movie, updatedCollection) => {},  // after add/remove
//   });
//
// Each result: click the poster to ADD/REMOVE (toggles "+" ⇄ "✓"); the small
// "i" button opens that movie's details page in a new tab (so the add session
// isn't lost). Shows the top 12 matches so the grid stays full.
window.AddToCollectionModal = (function () {
  const MAX_RESULTS = 12; // a full grid (6×2 desktop, 4×3 tablet, 3×4 phone)
  const PLACEHOLDER = "assets/images/poster-placeholder.svg";
  const esc = (s) => (window.escapeHtml ? window.escapeHtml(s) : String(s ?? ""));

  let overlay = null, titleEl = null, input = null, results = null, clearBtn = null;
  let debounce = null, seq = 0;
  let ctx = null; // { id, name, inCollection:Set, onChange }

  function build() {
    overlay = document.createElement("div");
    overlay.className = "am-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML = `
      <div class="am-panel">
        <div class="am-header">
          <h2 class="am-title">Add to Collection</h2>
          <button class="am-close" type="button" aria-label="Close">&times;</button>
        </div>
        <div class="am-search">
          <img src="assets/images/icons/search-icon.svg" alt="" width="20" height="20" />
          <input type="text" placeholder="Search movies to add…" aria-label="Search movies" />
          <button class="am-clear" type="button" aria-label="Clear search" hidden>&times;</button>
        </div>
        <div class="am-results"></div>
      </div>`;
    document.body.appendChild(overlay);
    titleEl = overlay.querySelector(".am-title");
    input = overlay.querySelector("input");
    results = overlay.querySelector(".am-results");
    clearBtn = overlay.querySelector(".am-clear");

    overlay.querySelector(".am-close").addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && overlay.classList.contains("is-open")) close();
    });
    input.addEventListener("input", () => {
      toggleClear();
      clearTimeout(debounce);
      debounce = setTimeout(runSearch, 300);
    });
    clearBtn.addEventListener("click", () => {
      input.value = "";
      toggleClear();
      seq++; // invalidate any in-flight search so its late results don't land
      hint("Start typing to search for movies to add.");
      input.focus();
    });
  }

  // Show the clear "×" only when the box has text to clear.
  function toggleClear() {
    if (clearBtn) clearBtn.hidden = !input.value;
  }

  function hint(text) {
    results.innerHTML = `<p class="am-hint">${esc(text)}</p>`;
  }

  async function runSearch() {
    const q = input.value.trim();
    if (!q) {
      hint("Start typing to search for movies to add.");
      return;
    }
    const s = ++seq;
    hint("Searching…");
    try {
      // The search API serves 20 per page — one page is plenty to fill the
      // 12-card grid (6×2 desktop / 4×3 tablet / 3×4 phone).
      const page1 = await MovieAPI.searchMovies({ q });
      if (s !== seq) return; // a newer search superseded this one
      renderResults(page1.slice(0, MAX_RESULTS));
    } catch (err) {
      if (s === seq) hint(err.message || "Search failed.");
    }
  }

  function renderResults(movies) {
    results.innerHTML = "";
    if (!movies.length) {
      hint("No movies found.");
      return;
    }
    const frag = document.createDocumentFragment();
    movies.forEach((m) => {
      const added = ctx.inCollection.has(m.id);
      const cell = document.createElement("div");
      cell.className = "am-result" + (added ? " is-added" : "");
      cell.setAttribute("role", "button");
      cell.setAttribute("tabindex", "0");
      cell.setAttribute("aria-pressed", String(added));
      cell.setAttribute("aria-label", `${added ? "Remove" : "Add"} ${m.title}`);
      cell.innerHTML = `
        <img src="${esc(m.posterPath || PLACEHOLDER)}" alt="${esc(m.title)}" loading="lazy">
        <button class="am-info" type="button" aria-label="View details for ${esc(m.title)}" title="View details">i</button>
        <span class="am-add-flag" aria-hidden="true">✓</span>
        <span class="am-result-title">${esc(m.title)}</span>`;
      cell.addEventListener("click", () => toggle(m, cell));
      cell.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle(m, cell);
        }
      });
      cell.querySelector(".am-info").addEventListener("click", (e) => {
        e.stopPropagation(); // don't toggle add/remove — just open details
        try {
          sessionStorage.setItem("mk:lastMovie", JSON.stringify(m)); // instant paint
        } catch (_) {}
        window.open("movie.html?id=" + encodeURIComponent(m.id), "_blank", "noopener");
      });
      frag.appendChild(cell);
    });
    results.appendChild(frag);
  }

  function setCell(cell, added) {
    // No "+" badge: the bare poster is the add affordance; a "✓" badge (shown via
    // CSS on .is-added) marks the ones already in the list.
    cell.classList.toggle("is-added", added);
    cell.setAttribute("aria-pressed", String(added));
    cell.setAttribute("aria-label", `${added ? "Remove" : "Add"} ${cell.querySelector("img").alt}`);
  }

  async function toggle(m, cell) {
    const adding = !cell.classList.contains("is-added");
    setCell(cell, adding); // optimistic
    try {
      const updated = adding
        ? await MovieAPI.addMovieToCollection(ctx.id, m.id)
        : await MovieAPI.removeMovieFromCollection(ctx.id, m.id);
      if (adding) ctx.inCollection.add(m.id);
      else ctx.inCollection.delete(m.id);
      if (ctx.onChange) ctx.onChange(adding ? "add" : "remove", m, updated);
      if (window.toast) {
        if (adding) toast.success(`Added “${m.title}”.`);
        else toast.warn(`Removed “${m.title}”.`);
      }
    } catch (err) {
      setCell(cell, !adding); // revert on failure
      if (window.toast) toast.error(err.message || "Something went wrong.");
    }
  }

  async function open(id, name, opts = {}) {
    if (!overlay) build();
    ctx = {
      id,
      name: name || "Collection",
      inCollection: new Set(opts.initialMovieIds || []),
      onChange: opts.onChange || null,
    };
    titleEl.textContent = `Add to “${ctx.name}”`;
    input.value = "";
    toggleClear();
    hint("Start typing to search for movies to add.");
    overlay.classList.add("is-open");
    document.body.classList.add("cm-no-scroll");
    setTimeout(() => input.focus(), 50);

    // When the caller didn't hand us the current movie ids (e.g. the profile,
    // whose cards only carry the cover posters), fetch them so already-added
    // movies show a "✓" instead of a "+".
    if (!opts.initialMovieIds && id) {
      try {
        const c = await MovieAPI.getCollection(id);
        (c.movies || []).forEach((mv) => ctx.inCollection.add(mv.id));
        if (overlay.classList.contains("is-open") && input.value.trim()) runSearch();
      } catch (_) {
        /* leave everything unflagged */
      }
    }
  }

  function close() {
    if (!overlay) return;
    overlay.classList.remove("is-open");
    document.body.classList.remove("cm-no-scroll");
  }

  return { open };
})();
