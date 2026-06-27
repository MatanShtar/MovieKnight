// collection/main.js — Collection Page orchestration + bootstrap.
//
// Reached as collection.html?id=<collectionId>. Owns the whole-page render, the
// owner-only header actions that live outside the grid (Publish/Unpublish toggle,
// inline rename), and the load/access-control flow (?id, guest→login, 401→login,
// 404→404.html). init() wires the static controls and kicks off load(); it's the
// last collection/* file to run.
//
// owner  → editable header (rename + publish), per-card remove, Add to Collection,
//          Movie Picker + Enhance toolbar.
// visitor (someone else's PUBLIC collection) → read-only header, Like + Save,
//          no remove, no toolbar (FR-4.7.6).
// private collection you don't own / missing → backend 404 → redirect to 404.html.
// Opened with no ?id → redirect to 404.html.
//
// Depends on: collection/shared.js + grid.js + sort.js (all the CP.* helpers),
//   MovieAPI, window.isGuest, window.toast. Load LAST among collection/*.

(function () {
  const CP = (window.CollectionPage = window.CollectionPage || {});
  const $ = CP.$;
  const esc = CP.esc;
  const state = CP.state;
  const SORTS = CP.SORTS;

  // ---- whole-page render ------------------------------------------------------
  function render() {
    const c = state.collection;
    if (!c) return;

    const titleEl = $("colTitle");
    titleEl.textContent = c.name || "Untitled";
    document.title = `MovieKnight | ${c.name || "Collection"}`;
    $("colMeta").textContent = CP.metaLine(c, state.isOwner);

    // rename pencil: owner + not a default collection. The hover-reveal + dashed
    // outline (CSS) keys off `is-editable` on the title row.
    const editable = state.isOwner && !c.isDefault;
    $("colRenameBtn").hidden = !editable;
    const titleRow = titleEl.closest(".collection-title-row");
    if (titleRow) titleRow.classList.toggle("is-editable", editable);

    CP.renderActions(c, state.isOwner);

    // owner-only bottom toolbar (Movie Picker + Enhance)
    $("colToolbar").hidden = !state.isOwner;

    CP.renderGrid();
  }

  // ---- actions ----------------------------------------------------------------
  // Remember the chosen "Sort by" server-side so it persists across visits.
  // Owners only; fire-and-forget — a failed save just means the next load falls
  // back to the previous sort, no user-facing error.
  CP.persistSort = function persistSort(key) {
    if (!state.isOwner || !state.id) return;
    // Already the stored sort? Skip the round-trip entirely (the server also
    // no-ops an unchanged PATCH, but there's no point making the request).
    if (state.collection && state.collection.sort === key) return;
    MovieAPI.updateCollection(state.id, { sort: key })
      .then(() => {
        if (state.collection) state.collection.sort = key; // keep local in sync
      })
      .catch((err) => {
        console.warn("Couldn't save sort preference:", (err && err.message) || err);
      });
  };

  CP.togglePublish = async function togglePublish(btn) {
    const c = state.collection;
    const next = !c.isPublic;
    btn.disabled = true;
    try {
      const updated = await MovieAPI.updateCollection(state.id, { isPublic: next });
      c.isPublic = updated.isPublic;
      if (window.toast) {
        toast.success(c.isPublic ? "Collection published" : "Collection unpublished");
      }
      render();
    } catch (err) {
      if (window.toast) toast.error(err.message || "Couldn't update visibility");
    } finally {
      btn.disabled = false;
    }
  };

  function startRename() {
    const c = state.collection;
    if (!state.isOwner || c.isDefault) return;
    const h1 = $("colTitle");
    if (h1.querySelector("input")) return;

    const prev = c.name || "";
    // While the editor is open, drop the hover affordance (dashed outline + pencil)
    // so it doesn't frame the input; restored in finish().
    const titleRow = h1.closest(".collection-title-row");
    const renameBtn = $("colRenameBtn");
    if (titleRow) titleRow.classList.remove("is-editable");
    renameBtn.style.display = "none";
    // Lock the editor to the title's current box so swapping text→input doesn't
    // resize the row (which would otherwise slide the pencil and bump the meta line).
    const box = h1.getBoundingClientRect();
    const input = document.createElement("input");
    input.type = "text";
    input.className = "collection-title-input";
    input.maxLength = 60;
    input.value = prev;
    input.style.width = `${box.width}px`;
    input.style.height = `${box.height}px`;
    h1.textContent = "";
    h1.appendChild(input);
    input.focus();
    // Select-all so the start of the name stays visible (a caret-to-end on a
    // narrow, large-font field scrolls the first glyphs out of view).
    input.select();

    let settled = false;
    const finish = async (save) => {
      if (settled) return;
      settled = true;
      // restore the hover affordance (the list is still an owner's non-default one)
      renameBtn.style.display = "";
      if (titleRow) titleRow.classList.add("is-editable");
      const next = input.value.trim().slice(0, 60);
      const shown = save && next ? next : prev;
      h1.textContent = shown;

      if (!save || !next || next === prev) return;

      try {
        const updated = await MovieAPI.updateCollection(state.id, { name: next });
        c.name = updated.name;
        h1.textContent = c.name;
        document.title = `MovieKnight | ${c.name}`;
        if (window.toast) toast.success("Collection renamed.");
      } catch (err) {
        h1.textContent = prev;
        if (window.toast) toast.error(err.message || "Couldn't rename collection.");
      }
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); finish(true); }
      else if (e.key === "Escape") { e.preventDefault(); finish(false); }
    });
    input.addEventListener("blur", () => finish(true));
  }

  // ---- load -------------------------------------------------------------------
  async function load() {
    const params = new URLSearchParams(location.search);
    const id = params.get("id");
    state.id = id;

    // No collection selected (opened bare, no ?id) — nothing to show.
    if (!id) { window.location.replace("404.html"); return; }

    // Viewing a collection is logged-in only (it's part of Explore). Bounce guests
    // to login rather than showing a visitor view or a 404.
    if (window.isGuest && window.isGuest()) {
      window.location.replace("login.html");
      return;
    }

    CP.showSkeletons();
    try {
      const c = await MovieAPI.getCollection(id);
      state.collection = c;
      state.isOwner = !!c.isOwner;
      CP.setSort(c.sort || "added_desc"); // show the remembered "Sort by"
      state.movies = CP.sortMovies(c.movies, state.sort);
      render();
    } catch (err) {
      // No/expired token (e.g. logged out in another tab) → login.
      if (err.status === 401) {
        window.location.replace("login.html");
        return;
      }
      // Missing OR private-and-not-yours both come back as 404 → the 404 page.
      if (err.status === 404) {
        window.location.replace("404.html");
        return;
      }
      console.error("Could not load collection:", err);
      const grid = $("colGrid");
      grid.innerHTML = "";
      grid.setAttribute("aria-busy", "false");
      const msg = document.createElement("div");
      msg.className = "collection-empty collection-error";
      msg.innerHTML = `<h2>Couldn’t load this collection</h2><p>${esc(err.message || "Please try again later.")}</p>`;
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "action-pill collection-empty-cta collection-retry";
      retry.textContent = "Retry";
      retry.addEventListener("click", () => load());
      msg.appendChild(retry);
      grid.appendChild(msg);
      if (window.toast) toast.error(err.message || "Couldn't load this collection.");
    }
  }

  // ---- wire static controls ---------------------------------------------------
  function init() {
    $("colSortText").textContent = SORTS[0].short;
    CP.buildSortMenu();

    $("colRenameBtn").addEventListener("click", startRename);
    $("colTitle").addEventListener("click", () => {
      // clicking the title also opens rename for an owner on a non-default list
      if (state.isOwner && state.collection && !state.collection.isDefault) startRename();
    });

    $("colSortBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      if ($("colSortMenu").hidden) CP.openSortMenu();
      else CP.closeSortMenu();
    });
    $("colSortBtn").addEventListener("keydown", CP.onSortKeydown);
    document.addEventListener("click", (e) => {
      if (!$("colSortSelect").contains(e.target)) CP.closeSortMenu();
    });
    window.addEventListener("scroll", () => { if (!$("colSortMenu").hidden) CP.closeSortMenu(); }, true);

    $("colPickerBtn").addEventListener("click", () => {
      const q = state.id ? `?collection=${encodeURIComponent(state.id)}` : "";
      window.location.href = `picker.html${q}`;
    });
    $("colEnhanceBtn").addEventListener("click", () => {
      // Enhance acts on a real, saved collection.
      if (!state.id) {
        if (window.toast) toast.info("Open a saved collection to enhance it.");
        return;
      }
      // The first AI recommendation spends a daily action — surface the shared
      // "out of daily actions" toast instead of opening a doomed modal.
      if (window.MovieAPI && MovieAPI.aiActionsRemaining() <= 0) {
        if (window.toast) toast.warn(MovieAPI.aiLimitReachedMessage());
        return;
      }
      window.EnhanceModal.open(state.id, {
        name: state.collection && state.collection.name,
        onChange: () => load(), // refresh the grid + count once, on close, if a movie was added
      });
    });

    load();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
