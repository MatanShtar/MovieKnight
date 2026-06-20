// collection.js — Collection Page (Owner + Visitor views).
//
// Reached as collection.html?id=<collectionId>. Loads the collection via
// MovieAPI.getCollection(id):
//   • owner  → editable header (rename + publish), per-card remove, Add to
//              Collection, Movie Picker + Enhance toolbar.
//   • visitor (someone else's PUBLIC collection) → read-only header, Like + Save,
//              no remove, no toolbar (FR-4.7.6).
//   • private collection you don't own / missing → backend 404 → redirect to 404.html.
// Opened with no ?id (e.g. the design/diff harness), it paints a demo owner view
// that mirrors the Figma frame.

(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => (window.escapeHtml ? window.escapeHtml(s) : String(s ?? ""));

  // The 6 sort options shown in the dropdown (Figma owner view). Each maps to a
  // client-side comparator over the collection's movies.
  const SORTS = [
    { key: "added_desc", label: "Date Added (Latest → Earliest)" },
    { key: "added_asc", label: "Date Added (Earliest → Latest)" },
    { key: "title_asc", label: "Alphabetical (A → Z)" },
    { key: "title_desc", label: "Alphabetical (Z → A)" },
    { key: "year_desc", label: "Release Date (Latest → Earliest)" },
    { key: "year_asc", label: "Release Date (Earliest → Latest)" },
  ];

  const state = {
    id: null,
    collection: null, // normalized full collection
    movies: [], // working (sorted) copy
    sort: "added_desc",
    isOwner: false,
    isDemo: false,
  };

  // ---- sorting ----------------------------------------------------------------
  function sortMovies(movies, sortKey) {
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
  }

  // ---- header -----------------------------------------------------------------
  function metaLine(c, isOwner) {
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
  }

  // A masked-icon span that takes the surrounding text color.
  function pillIcon(name) {
    const span = document.createElement("span");
    span.className = "pill-icon";
    const url = `assets/images/icons/${name}-icon.svg`;
    span.style.webkitMaskImage = `url('${url}')`;
    span.style.maskImage = `url('${url}')`;
    return span;
  }

  // actionPill(label) → text-only pill (owner pills, per Figma).
  // actionPill(label, iconName) → label THEN icon (visitor Like/Save, icon after
  // the text per Figma 92:66). Owner pills are text-only and pass no icon.
  function actionPill(label, iconName, extraClass) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "action-pill" + (extraClass ? " " + extraClass : "");
    const text = document.createElement("span");
    text.textContent = label;
    btn.appendChild(text);
    if (iconName) btn.appendChild(pillIcon(iconName)); // icon AFTER the label
    return btn;
  }

  function renderActions(c, isOwner) {
    const wrap = $("colActions");
    wrap.innerHTML = "";
    wrap.hidden = false;

    if (isOwner) {
      // Text-only pill — navigate to the full Add-to-Collection page.
      const add = actionPill("Add to Collection");
      add.addEventListener("click", goToAddMovie);

      const pub = actionPill(c.isPublic ? "Unpublish" : "Publish");
      pub.setAttribute(
        "aria-label",
        c.isPublic ? "Unpublish collection" : "Publish collection"
      );
      pub.addEventListener("click", () => togglePublish(pub));

      wrap.append(add, pub);
    } else {
      // Counts live in the meta line only (Figma keeps the pills bare).
      let isLiked = false;
      const like = actionPill("Like", "heart", "action-pill--like");
      like.setAttribute("aria-pressed", String(isLiked));
      like.addEventListener("click", () => {
        if (window.requireAuth && !window.requireAuth()) return;
        isLiked = !isLiked;
        like.setAttribute("aria-pressed", String(isLiked));
        like.classList.toggle("is-active", isLiked);
        if (window.toast) toast.soon("Likes — Coming Soon!");
      });
      const save = actionPill("Save", "download", "action-pill--save");
      save.addEventListener("click", () => {
        if (window.requireAuth && !window.requireAuth()) return;
        if (window.toast) toast.soon("Save to your profile — Coming Soon!");
      });
      wrap.append(like, save);
    }
  }

  // Navigate to the full-page Add-to-Collection flow (replaces the old overlay
  // modal). In demo mode there is no real collection id, so there's nothing to
  // add to — tell the user it's coming.
  function goToAddMovie() {
    if (!state.id) {
      if (window.toast) toast.soon("Add to Collection — Coming Soon!");
      return;
    }
    window.location.href =
      "add-movie.html?collection=" + encodeURIComponent(state.id);
  }

  // ---- grid -------------------------------------------------------------------
  function buildCard(m, isOwner) {
    const card = document.createElement("article");
    card.className = "collection-card";
    card.dataset.id = m.id ?? "";
    card.dataset.title = m.title || "";
    const cardLabel = m.releaseYear
      ? `${m.title} (${m.releaseYear})`
      : m.title || "Movie";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `View details for ${cardLabel}`);

    const img = document.createElement("img");
    img.className = "poster-img";
    img.loading = "lazy";
    img.decoding = "async";
    img.alt = m.title || "Movie poster";
    img.src = m.posterPath || "assets/images/poster-placeholder.svg";
    card.appendChild(img);

    if (m.rating != null && !Number.isNaN(Number(m.rating))) {
      const rating = document.createElement("div");
      rating.className = "card-rating";
      rating.innerHTML = `${Number(m.rating).toFixed(1)} <img src="assets/images/icons/ratings-star.svg" alt="">`;
      card.appendChild(rating);
    }

    const title = document.createElement("div");
    title.className = "card-title";
    title.textContent = m.releaseYear ? `${m.title} (${m.releaseYear})` : m.title || "";
    card.appendChild(title);

    if (isOwner) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "card-remove";
      remove.setAttribute("aria-label", `Remove ${m.title || "movie"} from collection`);
      remove.innerHTML = `<img src="assets/images/icons/trash-icon.svg" alt="">`;
      remove.addEventListener("click", (e) => {
        e.stopPropagation();
        onRemoveMovie(m);
      });
      card.appendChild(remove);
    }

    // Card body → movie details (stash basics so it paints instantly).
    const openMovie = () => {
      if (!m.id) return;
      sessionStorage.setItem(
        "mk:lastMovie",
        JSON.stringify({
          id: m.id,
          title: m.title,
          releaseYear: m.releaseYear,
          rating: m.rating,
          posterPath: m.posterPath,
        })
      );
      window.location.href = `movie.html?id=${encodeURIComponent(m.id)}`;
    };
    card.addEventListener("click", openMovie);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        openMovie();
      }
    });

    return card;
  }

  function renderGrid() {
    const grid = $("colGrid");
    grid.innerHTML = "";
    grid.setAttribute("aria-busy", "false");

    if (!state.movies.length) {
      const empty = document.createElement("div");
      empty.className = "collection-empty";
      if (state.isOwner) {
        empty.innerHTML = `
          <h2>No movies yet</h2>
          <p>Use the button below to start filling this list with movies you love.</p>`;
        // Big in-body primary CTA mirroring the profile empty-state affordance.
        const cta = document.createElement("button");
        cta.type = "button";
        cta.className = "action-pill collection-empty-cta";
        cta.textContent = "Add to Collection";
        cta.addEventListener("click", goToAddMovie);
        empty.appendChild(cta);
      } else {
        empty.innerHTML = `
          <h2>No movies yet</h2>
          <p>This collection doesn’t have any movies yet.</p>`;
        const explore = document.createElement("a");
        explore.className = "action-pill collection-empty-cta";
        explore.href = "index.html";
        explore.textContent = "Explore movies";
        empty.appendChild(explore);
      }
      grid.appendChild(empty);
      return;
    }

    const frag = document.createDocumentFragment();
    state.movies.forEach((m) => frag.appendChild(buildCard(m, state.isOwner)));
    grid.appendChild(frag);
  }

  function showSkeletons(n = 18) {
    const grid = $("colGrid");
    grid.innerHTML = "";
    grid.setAttribute("aria-busy", "true");
    for (let i = 0; i < n; i++) {
      const s = document.createElement("article");
      s.className = "collection-card collection-card--skeleton";
      s.setAttribute("aria-hidden", "true");
      grid.appendChild(s);
    }
  }

  // ---- whole-page render ------------------------------------------------------
  function render() {
    const c = state.collection;
    if (!c) return;

    const titleEl = $("colTitle");
    titleEl.textContent = c.name || "Untitled";
    // Keep the full name discoverable on hover/AT when the h1 ellipsis-truncates.
    titleEl.title = c.name || "";
    document.title = `MovieKnight | ${c.name || "Collection"}`;
    $("colMeta").textContent = metaLine(c, state.isOwner);

    // rename pencil: owner + not a default collection
    const renameBtn = $("colRenameBtn");
    renameBtn.hidden = !(state.isOwner && !c.isDefault);

    renderActions(c, state.isOwner);

    // owner-only bottom toolbar (Movie Picker + Enhance)
    $("colToolbar").hidden = !state.isOwner;

    // mobile topbar add button — owners only, same navigation as the action pill
    const mobileAdd = $("colMobileAddBtn");
    if (mobileAdd) mobileAdd.hidden = !state.isOwner;

    renderGrid();
  }

  // ---- actions ----------------------------------------------------------------
  async function togglePublish(btn) {
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
  }

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

  async function onRemoveMovie(m) {
    const ok = await confirmModal({
      title: "Remove movie?",
      text: `Remove “${m.title}” from this collection?`,
      confirmLabel: "Remove",
    });
    if (!ok) return;

    if (state.isDemo) {
      removeFromState(m.id);
      if (window.toast) toast.info(`Removed “${m.title}”.`);
      return;
    }
    try {
      const updated = await MovieAPI.removeMovieFromCollection(state.id, m.id);
      state.collection = updated;
      state.movies = sortMovies(updated.movies, state.sort);
      $("colMeta").textContent = metaLine(updated, state.isOwner);
      renderGrid();
      if (window.toast) toast.info(`Removed “${m.title}”.`);
    } catch (err) {
      if (window.toast) toast.error(err.message || "Couldn't remove the movie.");
    }
  }

  function removeFromState(movieId) {
    state.movies = state.movies.filter((x) => x.id !== movieId);
    state.collection.movieCount = state.movies.length;
    $("colMeta").textContent = metaLine(state.collection, state.isOwner);
    renderGrid();
  }

  // ---- sort dropdown ----------------------------------------------------------
  function applySort(key, label) {
    state.sort = key;
    $("colSortText").textContent = label;
    state.movies = sortMovies(state.movies, state.sort);
    closeSortMenu();
    buildSortMenu();
    renderGrid();
    $("colSortBtn").focus();
  }

  function buildSortMenu() {
    const menu = $("colSortMenu");
    menu.innerHTML = "";
    SORTS.forEach((opt) => {
      const item = document.createElement("div");
      const selected = opt.key === state.sort;
      item.className = "sort-option" + (selected ? " is-selected" : "");
      item.id = "colSortOpt-" + opt.key;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", selected ? "true" : "false");
      item.dataset.key = opt.key;
      item.textContent = opt.label;
      item.addEventListener("click", () => applySort(opt.key, opt.label));
      menu.appendChild(item);
    });
  }

  // Roving "active" option for keyboard navigation (aria-activedescendant).
  function moveActiveOption(delta) {
    const menu = $("colSortMenu");
    const opts = Array.from(menu.querySelectorAll(".sort-option"));
    if (!opts.length) return;
    let idx = opts.findIndex((o) => o.classList.contains("is-active"));
    if (idx < 0) idx = opts.findIndex((o) => o.dataset.key === state.sort);
    if (idx < 0) idx = 0;
    let next = idx + delta;
    if (next < 0) next = opts.length - 1;
    if (next >= opts.length) next = 0;
    opts.forEach((o) => o.classList.remove("is-active"));
    opts[next].classList.add("is-active");
    menu.setAttribute("aria-activedescendant", opts[next].id);
    opts[next].scrollIntoView({ block: "nearest" });
  }

  function commitActiveOption() {
    const menu = $("colSortMenu");
    const active =
      menu.querySelector(".sort-option.is-active") ||
      menu.querySelector(".sort-option.is-selected");
    if (!active) return;
    const opt = SORTS.find((o) => o.key === active.dataset.key);
    if (opt) applySort(opt.key, opt.label);
  }

  function onSortKeydown(e) {
    const open = !$("colSortMenu").hidden;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) { openSortMenu(); moveActiveOption(0); }
      else moveActiveOption(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) { openSortMenu(); moveActiveOption(0); }
      else moveActiveOption(-1);
    } else if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      if (open) { e.preventDefault(); commitActiveOption(); }
    } else if (e.key === "Escape") {
      if (open) { e.preventDefault(); closeSortMenu(); $("colSortBtn").focus(); }
    }
  }

  function openSortMenu() {
    const menu = $("colSortMenu");
    menu.hidden = false;
    $("colSortBtn").setAttribute("aria-expanded", "true");
    // Seed the active descendant on the current selection.
    const sel = menu.querySelector(".sort-option.is-selected");
    menu.querySelectorAll(".sort-option").forEach((o) =>
      o.classList.remove("is-active")
    );
    if (sel) {
      sel.classList.add("is-active");
      menu.setAttribute("aria-activedescendant", sel.id);
    }
  }
  function closeSortMenu() {
    const menu = $("colSortMenu");
    menu.hidden = true;
    menu.removeAttribute("aria-activedescendant");
    menu.querySelectorAll(".sort-option").forEach((o) =>
      o.classList.remove("is-active")
    );
    $("colSortBtn").setAttribute("aria-expanded", "false");
  }

  // ---- reusable confirm modal (matches the shared sign-out modal styling) ------
  function confirmModal({ title, text, confirmLabel = "Confirm" }) {
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
    state.movies = sortMovies(state.collection.movies, state.sort);
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

    showSkeletons();
    try {
      const c = await MovieAPI.getCollection(id);
      state.collection = c;
      state.isOwner = !!c.isOwner;
      state.movies = sortMovies(c.movies, state.sort);
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
    buildSortMenu();

    $("colRenameBtn").addEventListener("click", startRename);
    $("colTitle").addEventListener("click", () => {
      // clicking the title also opens rename for an owner on a non-default list
      if (state.isOwner && state.collection && !state.collection.isDefault) startRename();
    });

    $("colSortBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      if ($("colSortMenu").hidden) openSortMenu();
      else closeSortMenu();
    });
    $("colSortBtn").addEventListener("keydown", onSortKeydown);
    document.addEventListener("click", (e) => {
      if (!$("colSortSelect").contains(e.target)) closeSortMenu();
    });
    window.addEventListener("scroll", () => { if (!$("colSortMenu").hidden) closeSortMenu(); }, true);

    // Mobile topbar add button → same full-page Add-to-Collection flow (owner only).
    const mobileAdd = $("colMobileAddBtn");
    if (mobileAdd) mobileAdd.addEventListener("click", goToAddMovie);

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
