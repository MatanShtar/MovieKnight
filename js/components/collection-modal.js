// collection-modal.js — reusable "Add to Collection" modal.
//
// Triggered from a home movie card's "+" action or the Movie Details page. Lists
// the signed-in user's REAL collections (GET /api/collections) and, on submit,
// adds the current movie to each selected list (POST /api/collections/:id/movies).
// A "New Collection" field creates a list (POST /api/collections) and adds to it.
//
// Usage:
//   CollectionModal.open(tmdbId, "Some Movie Title");
//
// The caller (home.js / movie.js) guards with requireAuth() first, so by the time
// we open we have a logged-in session whose token MovieAPI attaches automatically.

window.CollectionModal = (function () {

  // escapeHtml is the shared global from core/common.js (loaded before this module on
  // every page that uses it — index and movie).
  const escapeHtml = window.escapeHtml;

  let overlay = null; // built lazily on first open
  let nameInput = null;
  let listEl = null; // the collection rows container
  let currentMovieId = null;
  let currentMovie = "This movie";
  let collections = []; // live list fetched per open
  let opener = null; // element focused before open, restored on close
  const selected = new Set(); // ids the user has ticked this session
  const initiallyIn = new Set(); // ids of lists that already contain the movie

  // Build the modal DOM once and wire its interactions.
  function build() {
    overlay = document.createElement("div");
    overlay.className = "cm-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Add to collection");

    const panel = document.createElement("div");
    panel.className = "cm-panel";

    const header = document.createElement("div");
    header.className = "cm-header";
    header.innerHTML = `
      <h2 class="cm-title">Add to Collection</h2>
      <button class="cm-close" type="button" aria-label="Close">&times;</button>`;

    const list = document.createElement("div");
    list.className = "cm-list";
    listEl = list;

    const footer = document.createElement("div");
    footer.className = "cm-footer";
    footer.innerHTML = `
      <label class="cm-newlabel" for="cmNewName">New Collection:</label>
      <div class="cm-newfield">
        <input id="cmNewName" class="cm-input" type="text"
               maxlength="40" autocomplete="off"
               aria-label="New collection name" />
      </div>
      <button class="cm-add" type="button" aria-label="Create collection">+</button>`;

    panel.append(header, list, footer);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    nameInput = footer.querySelector("#cmNewName");

    // --- interactions ---
    header.querySelector(".cm-close").addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(); // click the dimmed backdrop
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && overlay.classList.contains("is-open")) close();
    });

    // Trap Tab within the panel while the dialog is open.
    overlay.addEventListener("keydown", (e) => {
      if (e.key !== "Tab" || !overlay.classList.contains("is-open")) return;
      const focusable = panel.querySelectorAll(
        '.cm-close, .cm-item, .cm-input, .cm-add',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    });

    footer.querySelector(".cm-add").addEventListener("click", submitAdd);
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submitAdd();
      }
    });
  }

  // A whole-cell toggle: square checkbox + name + 2×2 poster collage from the
  // collection's first ≤4 movies.
  function buildItem(c) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "cm-item";
    item.dataset.id = c.id;
    item.setAttribute("role", "checkbox");

    // Cover built with the shared helper (common.js). The modal tiles are pinned
    // to 2:3 regardless of viewport, so pass responsive:false to keep the desktop
    // (portrait) layout — 1 poster / 2-3 stacked backdrops / 2×2 — not the banner.
    item.innerHTML = `
      <span class="cm-check" aria-hidden="true"></span>
      <span class="cm-name"></span>
      ${window.buildCollectionCover(c, { responsive: false })}`;
    const nameEl = item.querySelector(".cm-name");
    nameEl.textContent = c.name;
    // Surface the full name on hover when it ellipsis-truncates.
    nameEl.title = c.name;
    item.setAttribute("aria-label", `${c.name} collection`);

    // Pre-check lists the movie is already in (membership seeded in renderRows).
    const startsChecked = initiallyIn.has(c.id);
    if (startsChecked) {
      selected.add(c.id);
      item.classList.add("is-selected");
    }
    item.setAttribute("aria-checked", String(startsChecked));

    // Ticking ADDS/REMOVES the movie immediately (optimistic) and toasts in the
    // matching colour — green for added, orange/red for removed.
    item.addEventListener("click", async () => {
      if (currentMovieId == null) return;
      const on = !selected.has(c.id);
      // optimistic flip
      if (on) {
        selected.add(c.id);
        initiallyIn.add(c.id);
      } else {
        selected.delete(c.id);
        initiallyIn.delete(c.id);
      }
      item.classList.toggle("is-selected", on);
      item.setAttribute("aria-checked", String(on));
      try {
        if (on) await MovieAPI.addMovieToCollection(c.id, currentMovieId);
        else await MovieAPI.removeMovieFromCollection(c.id, currentMovieId);
        if (window.toast) {
          if (on) toast.success(`${currentMovie} added to ${c.name}`);
          else toast.warn(`${currentMovie} removed from ${c.name}`);
        }
      } catch (err) {
        // revert the optimistic flip on failure
        if (on) {
          selected.delete(c.id);
          initiallyIn.delete(c.id);
        } else {
          selected.add(c.id);
          initiallyIn.add(c.id);
        }
        item.classList.toggle("is-selected", !on);
        item.setAttribute("aria-checked", String(!on));
        if (window.toast) toast.error(err.message || "Something went wrong.");
      }
    });

    return item;
  }

  function renderRows() {
    listEl.innerHTML = "";
    if (!collections.length) {
      const empty = document.createElement("p");
      empty.className = "cm-empty";
      empty.textContent = "You don't have any collections yet — create one below.";
      listEl.appendChild(empty);
      return;
    }
    collections.forEach((c) => listEl.appendChild(buildItem(c)));
  }

  // The "+" / Enter now ONLY creates a new collection and adds the movie to it
  // (ticking handles existing lists immediately, above). The new list then shows
  // in place, checked.
  async function submitAdd() {
    const name = (nameInput.value || "").trim();
    if (!name) {
      nameInput.focus();
      return;
    }
    if (currentMovieId == null) {
      if (window.toast) toast.error("Couldn't tell which movie to add.");
      return;
    }

    const addBtn = overlay.querySelector(".cm-add");
    addBtn.disabled = true;
    try {
      const created = await MovieAPI.createCollection(name);
      await MovieAPI.addMovieToCollection(created.id, currentMovieId);
      nameInput.value = "";
      initiallyIn.add(created.id);
      selected.add(created.id);
      collections = await MovieAPI.listCollections(); // refresh covers + counts
      renderRows();
      if (window.toast) toast.success(`${currentMovie} added to ${created.name}`);
    } catch (err) {
      if (window.toast) toast.error(err.message || "Couldn't create the collection.");
    } finally {
      addBtn.disabled = false;
    }
  }

  async function open(movieId, movieTitle) {
    if (!overlay) build();
    // Remember who opened us so focus can be restored on close.
    opener = document.activeElement;
    currentMovieId = movieId != null ? movieId : null;
    currentMovie = movieTitle || "This movie";
    nameInput.value = "";
    selected.clear();
    initiallyIn.clear();

    overlay.classList.add("is-open");
    document.body.classList.add("cm-no-scroll");

    // Move focus into the dialog (the close button) so Tab is trapped inside.
    const closeBtn = overlay.querySelector(".cm-close");
    if (closeBtn) closeBtn.focus();

    // Load the user's real collections fresh each open.
    listEl.innerHTML = `<p class="cm-empty">Loading your collections…</p>`;
    try {
      collections = await MovieAPI.listCollections();
      // Pre-check the lists this movie is already in. listCollections() carries
      // no membership flag, so fetch each list's movies in parallel (only for
      // the currently-open movie) and seed initiallyIn from the join.
      if (currentMovieId != null && collections.length) {
        const target = String(currentMovieId);
        const full = await Promise.all(
          collections.map((c) =>
            MovieAPI.getCollection(c.id).catch(() => null),
          ),
        );
        full.forEach((detail, i) => {
          if (!detail) return;
          const has = (detail.movies || []).some(
            (m) => String(m.id) === target,
          );
          if (has) initiallyIn.add(collections[i].id);
        });
      }
      renderRows();
    } catch (err) {
      collections = [];
      listEl.innerHTML = `<p class="cm-empty">${escapeHtml(
        err.message || "Couldn't load your collections.",
      )}</p>`;
    }
  }

  // The modal is a same-page overlay, so closing it simply hides it — it must NOT
  // touch window.history (that used to break the page's own Back button).
  function close() {
    if (!overlay) return;
    overlay.classList.remove("is-open");
    document.body.classList.remove("cm-no-scroll");
    // Restore focus to whatever opened the dialog (ARIA dialog pattern).
    if (opener && typeof opener.focus === "function") {
      opener.focus();
    }
    opener = null;
  }

  return { open, close };
})();
