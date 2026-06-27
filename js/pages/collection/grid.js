// collection/grid.js — Collection Page movie grid + action pills + add/remove.
//
// Builds the poster cards and the grid (incl. skeletons + empty states), the
// header action pills (owner: Add to Collection / Publish-Unpublish · visitor:
// Like / Save), the Add-to-Collection modal hook, and the per-card remove flow
// (confirm modal → API). Attaches its functions onto window.CollectionPage
// (CP) so sort.js and main.js can call renderGrid / openAddModal / renderActions.
//
// Depends on: collection/shared.js (CP.state, CP.metaLine, CP.sortMovies,
//   CP.confirmModal, CP.$), MovieAPI, AddToCollectionModal, window.requireAuth,
//   window.toast. Load AFTER shared.js.

(function () {
  const CP = (window.CollectionPage = window.CollectionPage || {});
  const $ = CP.$;
  const state = CP.state;

  // A masked-icon span that takes the surrounding text color.
  function pillIcon(name) {
    const span = document.createElement("span");
    span.className = "pill-icon";
    const url = `assets/images/icons/${name}-icon.svg`;
    span.style.webkitMaskImage = `url('${url}')`;
    span.style.maskImage = `url('${url}')`;
    return span;
  }

  // actionPill(label) → text-only pill.
  // actionPill(label, iconName) → label THEN icon (visitor Like/Save, icon after
  //   the text per Figma 92:66).
  // actionPill(label, iconName, extraClass, "before") → icon BEFORE the label
  //   (the owner's "+ Add to Collection").
  function actionPill(label, iconName, extraClass, iconPos) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "action-pill" + (extraClass ? " " + extraClass : "");
    const text = document.createElement("span");
    text.className = "pill-label";
    text.textContent = label;
    if (iconName && iconPos === "before") btn.appendChild(pillIcon(iconName));
    btn.appendChild(text);
    if (iconName && iconPos !== "before") btn.appendChild(pillIcon(iconName));
    return btn;
  }

  CP.renderActions = function renderActions(c, isOwner) {
    const wrap = $("colActions");
    wrap.innerHTML = "";
    wrap.hidden = false;

    if (isOwner) {
      // "+ Add to Collection" — opens the in-page Add-to-Collection modal.
      // A shorter "Add Movies" label swaps in on phones (CSS) so it fits.
      const add = actionPill("Add to Collection", "plus", "action-pill--add", "before");
      const shortLabel = document.createElement("span");
      shortLabel.className = "pill-label-short";
      shortLabel.textContent = "Add Movies";
      add.appendChild(shortLabel);
      add.addEventListener("click", CP.openAddModal);

      const pub = actionPill(c.isPublic ? "Unpublish" : "Publish", null, "action-pill--publish");
      pub.setAttribute(
        "aria-label",
        c.isPublic ? "Unpublish collection" : "Publish collection"
      );
      pub.addEventListener("click", () => CP.togglePublish(pub));

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
  };

  // ---- Add-to-Collection modal (owner) ----------------------------------------
  // Opens the shared modal (js/add-to-collection-modal.js) overlaid on this
  // page. The modal owns search + add/remove against the API; we just hand it
  // this collection's id/name and current movie ids, and refresh on change.
  CP.openAddModal = function openAddModal() {
    if (!window.AddToCollectionModal) return;
    AddToCollectionModal.open(
      state.id,
      (state.collection && state.collection.name) || "Collection",
      {
        initialMovieIds: state.movies.map((m) => m.id),
        onChange: (action, movie, updated) => {
          state.collection = updated;
          state.movies = CP.sortMovies(updated.movies, state.sort);
          $("colMeta").textContent = CP.metaLine(state.collection, state.isOwner);
          CP.renderGrid();
        },
      }
    );
  };

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
      // Navigate in the SAME tab (matches Home) — smartBack returns to the
      // collection. The mk:lastMovie stash above makes the details page paint
      // instantly on arrival.
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

  CP.renderGrid = function renderGrid() {
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
        cta.addEventListener("click", CP.openAddModal);
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
  };

  CP.showSkeletons = function showSkeletons(n = 18) {
    const grid = $("colGrid");
    grid.innerHTML = "";
    grid.setAttribute("aria-busy", "true");
    for (let i = 0; i < n; i++) {
      const s = document.createElement("article");
      s.className = "collection-card collection-card--skeleton";
      s.setAttribute("aria-hidden", "true");
      grid.appendChild(s);
    }
  };

  // ---- remove movie -----------------------------------------------------------
  async function onRemoveMovie(m) {
    const ok = await CP.confirmModal({
      title: "Remove movie?",
      text: `Remove “${m.title}” from this collection?`,
      confirmLabel: "Remove",
    });
    if (!ok) return;

    try {
      const updated = await MovieAPI.removeMovieFromCollection(state.id, m.id);
      state.collection = updated;
      state.movies = CP.sortMovies(updated.movies, state.sort);
      $("colMeta").textContent = CP.metaLine(updated, state.isOwner);
      CP.renderGrid();
      if (window.toast) toast.warn(`Removed “${m.title}”.`);
    } catch (err) {
      if (window.toast) toast.error(err.message || "Couldn't remove the movie.");
    }
  }
})();
