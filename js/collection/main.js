// collection/main.js — Collection Page orchestration + bootstrap.
//
// Reached as collection.html?id=<collectionId>. Owns the whole-page render, the
// owner-only header actions that live outside the grid (Publish/Unpublish toggle,
// inline rename), the demo/?demo= harness, and the load/access-control flow
// (?id, guest→login, 401→login, 404→404.html). init() wires the static controls
// and kicks off load(); it's the last collection/* file to run.
//
// owner  → editable header (rename + publish), per-card remove, Add to Collection,
//          Movie Picker + Enhance toolbar.
// visitor (someone else's PUBLIC collection) → read-only header, Like + Save,
//          no remove, no toolbar (FR-4.7.6).
// private collection you don't own / missing → backend 404 → redirect to 404.html.
// Opened with no ?id (e.g. the design/diff harness), it paints a demo owner view.
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
    // Keep the full name discoverable on hover/AT when the h1 ellipsis-truncates.
    titleEl.title = c.name || "";
    document.title = `MovieKnight | ${c.name || "Collection"}`;
    $("colMeta").textContent = CP.metaLine(c, state.isOwner);

    // rename pencil: owner + not a default collection
    const renameBtn = $("colRenameBtn");
    renameBtn.hidden = !(state.isOwner && !c.isDefault);

    CP.renderActions(c, state.isOwner);

    // owner-only bottom toolbar (Movie Picker + Enhance)
    $("colToolbar").hidden = !state.isOwner;

    // mobile topbar add button — owners only, same navigation as the action pill
    const mobileAdd = $("colMobileAddBtn");
    if (mobileAdd) mobileAdd.hidden = !state.isOwner;

    CP.renderGrid();
  }

  // ---- actions ----------------------------------------------------------------
  CP.togglePublish = async function togglePublish(btn) {
    const c = state.collection;
    const next = !c.isPublic;
    if (state.isDemo) {
      c.isPublic = next;
      if (window.toast) toast.success(next ? "Collection published." : "Collection unpublished.");
      render();
      return;
    }
    btn.disabled = true;
    try {
      const updated = await MovieAPI.updateCollection(state.id, { isPublic: next });
      c.isPublic = updated.isPublic;
      if (window.toast) {
        toast.success(c.isPublic ? "Collection published." : "Collection unpublished.");
      }
      render();
    } catch (err) {
      if (window.toast) toast.error(err.message || "Couldn't update visibility.");
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
    const input = document.createElement("input");
    input.type = "text";
    input.className = "collection-title-input";
    input.maxLength = 60;
    input.value = prev;
    h1.title = "";
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
      const next = input.value.trim().slice(0, 60);
      const shown = save && next ? next : prev;
      h1.textContent = shown;
      h1.title = shown;

      if (!save || !next || next === prev) return;

      if (state.isDemo) {
        c.name = next;
        document.title = `MovieKnight | ${next}`;
        return;
      }
      try {
        const updated = await MovieAPI.updateCollection(state.id, { name: next });
        c.name = updated.name;
        h1.textContent = c.name;
        h1.title = c.name || "";
        document.title = `MovieKnight | ${c.name}`;
        if (window.toast) toast.success("Collection renamed.");
      } catch (err) {
        h1.textContent = prev;
        h1.title = prev;
        if (window.toast) toast.error(err.message || "Couldn't rename collection.");
      }
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); finish(true); }
      else if (e.key === "Escape") { e.preventDefault(); finish(false); }
    });
    input.addEventListener("blur", () => finish(true));
  }

  // ---- demo (no ?id — design/diff harness) ------------------------------------
  function demoCollection(mode) {
    const isVisitor = mode === "visitor";
    const empty = mode === "empty";
    const P = "assets/images/posters/";
    const items = [
      ["One Battle After Another", 2025, "one-battle-after-another-poster.webp", 8.1],
      ["The Dark Knight", 2008, "the-dark-knight-poster.webp", 8.5],
      ["Pulp Fiction", 1994, "pulp-fiction-poster.webp", 8.5],
      ["Parasite", 2019, "parasite-poster.webp", 8.5],
      ["Oppenheimer", 2023, "oppenheimer-poster.webp", 8.1],
      ["Interstellar", 2014, "interstellar-poster.webp", 8.4],
      ["Whiplash", 2014, "whiplash-poster.webp", 8.4],
      ["Spider-Man: Into the Spider-Verse", 2018, "spider-man-into-the-spider-verse-poster.webp", 8.4],
      ["La La Land", 2016, "la-la-land-poster.webp", 7.9],
      ["Dune: Part Two", 2024, "dune-part-two-poster.webp", 8.2],
      ["Kill Bill: Vol. 1", 2003, "kill-bill-poster.webp", 8.0],
      ["Everything Everywhere All at Once", 2022, "everything-everywhere-all-at-once-poster.webp", 7.8],
      ["10 Things I Hate About You", 1999, "ten-things-i-hate-about-you-poster.webp", 7.7],
      ["The Substance", 2024, "the-substance-poster.webp", 7.3],
    ];
    const movies = empty
      ? []
      : items.map(([title, releaseYear, file, rating], i) => ({
          id: 100000 + i,
          title,
          releaseYear,
          rating,
          posterPath: P + file,
          addedAt: new Date(Date.now() - i * 86400000).toISOString(),
        }));
    return {
      id: null,
      name: "Must Watch Classics",
      isDefault: false,
      isPublic: !!isVisitor, // a visitor only ever sees a public collection
      author: "vova2020",
      isOwner: !isVisitor,
      // Keep the meta count in lockstep with the grid (demo harness).
      movieCount: movies.length,
      likesCount: isVisitor ? 28 : 0,
      savesCount: isVisitor ? 4 : 0,
      movies,
    };
  }

  function renderDemo(mode) {
    state.isDemo = true;
    state.collection = demoCollection(mode);
    state.isOwner = mode !== "visitor";
    state.movies = CP.sortMovies(state.collection.movies, state.sort);
    render();
  }

  // ---- load -------------------------------------------------------------------
  async function load() {
    const params = new URLSearchParams(location.search);
    const id = params.get("id");
    const demo = params.get("demo"); // ?demo=visitor / ?demo=empty / ?demo (owner)
    state.id = id;

    if (!id || demo != null) { renderDemo(demo || "owner"); return; }

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
    $("colSortText").textContent = SORTS[0].label;
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

    // Mobile topbar add button → same full-page Add-to-Collection flow (owner only).
    const mobileAdd = $("colMobileAddBtn");
    if (mobileAdd) mobileAdd.addEventListener("click", CP.openAddModal);

    $("colPickerBtn").addEventListener("click", () => {
      const q = state.id ? `?collection=${encodeURIComponent(state.id)}` : "";
      window.location.href = `picker.html${q}`;
    });
    $("colEnhanceBtn").addEventListener("click", () => {
      if (window.toast) toast.soon("Enhance My Collection — Coming Soon!");
    });

    load();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
