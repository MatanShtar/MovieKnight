// load last among collection/*.

(function () {
  const CP = (window.CollectionPage = window.CollectionPage || {});
  const $ = CP.$;
  const esc = CP.esc;
  const state = CP.state;
  const SORTS = CP.SORTS;

  function render() {
    const c = state.collection;
    if (!c) return;

    const titleEl = $("colTitle");
    titleEl.textContent = c.name || "Untitled";
    document.title = `MovieKnight | ${c.name || "Collection"}`;
    $("colMeta").textContent = CP.metaLine(c, state.isOwner);

    // rename is owner-only on non-default lists; css keys off is-editable
    const editable = state.isOwner && !c.isDefault;
    $("colRenameBtn").hidden = !editable;
    const titleRow = titleEl.closest(".collection-title-row");
    if (titleRow) titleRow.classList.toggle("is-editable", editable);

    CP.renderActions(c, state.isOwner);

    $("colToolbar").hidden = !state.isOwner;

    CP.renderGrid();
  }

  // owners only; fire-and-forget, failed save is silent
  CP.persistSort = function persistSort(key) {
    if (!state.isOwner || !state.id) return;
    if (state.collection && state.collection.sort === key) return;
    MovieAPI.updateCollection(state.id, { sort: key })
      .then(() => {
        if (state.collection) state.collection.sort = key;
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
    const titleRow = h1.closest(".collection-title-row");
    const renameBtn = $("colRenameBtn");
    if (titleRow) titleRow.classList.remove("is-editable");
    renameBtn.style.display = "none";
    // lock editor to title's current box so text→input swap doesn't resize the row
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
    // select-all so name's start stays visible (caret-to-end scrolls it out of view)
    input.select();

    let settled = false;
    const finish = async (save) => {
      if (settled) return;
      settled = true;
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

  async function load() {
    const params = new URLSearchParams(location.search);
    const id = params.get("id");
    state.id = id;

    if (!id) { window.location.replace("404.html"); return; }

    // viewing is logged-in only; bounce guests to login
    if (window.isGuest && window.isGuest()) {
      window.location.replace("login.html");
      return;
    }

    CP.showSkeletons();
    try {
      const c = await MovieAPI.getCollection(id);
      state.collection = c;
      state.isOwner = !!c.isOwner;
      CP.setSort(c.sort || "added_desc");
      state.movies = CP.sortMovies(c.movies, state.sort);
      render();
    } catch (err) {
      if (err.status === 401) {
        window.location.replace("login.html");
        return;
      }
      // missing OR private-and-not-yours both return 404
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

  function init() {
    $("colSortText").textContent = SORTS[0].short;
    CP.buildSortMenu();

    $("colRenameBtn").addEventListener("click", startRename);
    $("colTitle").addEventListener("click", () => {
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
      if (!state.id) {
        if (window.toast) toast.info("Open a saved collection to enhance it.");
        return;
      }
      // first AI rec spends a daily action; bail early if none left
      if (window.MovieAPI && MovieAPI.aiActionsRemaining() <= 0) {
        if (window.toast) toast.warn(MovieAPI.aiLimitReachedMessage());
        return;
      }
      window.EnhanceModal.open(state.id, {
        name: state.collection && state.collection.name,
        onChange: () => load(),
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
