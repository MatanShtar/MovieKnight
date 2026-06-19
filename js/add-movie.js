// add-movie.js — Add to Collection (full standalone page, Figma 92:34).
//
// Reached as add-movie.html?collection=<id>. Replaces the old in-collection
// overlay modal. Flow:
//   • guests are bounced to login.html;
//   • the collection is fetched (MovieAPI.getCollection) to title the page and to
//     pre-flag movies already in the list as ADDED;
//   • a non-owner / missing collection redirects back (collection.html / 404.html);
//   • a debounced (300ms) + stale-seq-guarded search renders a horizontal strip of
//     result posters, each with a "+ add to list" pill that flips to a solid
//     "ADDED" pill on success.

(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => (window.escapeHtml ? window.escapeHtml(s) : String(s ?? ""));

  const state = {
    id: null,
    collection: null,
    added: new Set(), // TMDB ids already in the collection (pre-flag + live)
    seq: 0, // stale-response guard
    timer: null, // debounce handle
    lastQuery: "",
  };

  // ---- back link --------------------------------------------------------------
  function wireBack() {
    const back = $("amBack");
    if (!back) return;
    if (state.id) {
      back.href = "collection.html?id=" + encodeURIComponent(state.id);
    }
  }

  // ---- title ------------------------------------------------------------------
  function setTitle(name) {
    const safe = name || "Collection";
    const h1 = $("amTitle");
    h1.textContent = safe;
    h1.title = safe;
    document.title = "MovieKnight | " + safe;
  }

  // ---- results helpers --------------------------------------------------------
  const resultsEl = () => $("amResults");

  function setBusy(busy) {
    resultsEl().setAttribute("aria-busy", busy ? "true" : "false");
  }

  // Full-width centered message block (empty / no-results / error states).
  function hint(html, { error = false } = {}) {
    setBusy(false);
    const wrap = resultsEl();
    wrap.classList.add("am-results--message");
    wrap.innerHTML = `<div class="am-hint${error ? " am-hint--error" : ""}">${html}</div>`;
  }

  function clearMessageMode() {
    resultsEl().classList.remove("am-results--message");
  }

  // Shimmer poster placeholders shown the moment a fetch starts (Doherty <400ms).
  function showSkeletons(n = 5) {
    setBusy(true);
    clearMessageMode();
    const wrap = resultsEl();
    wrap.innerHTML = "";
    const frag = document.createDocumentFragment();
    for (let i = 0; i < n; i++) {
      const card = document.createElement("div");
      card.className = "am-card am-card--skeleton";
      card.setAttribute("aria-hidden", "true");
      card.innerHTML = `<div class="am-poster am-poster--skeleton"></div><div class="am-pill am-pill--skeleton"></div>`;
      frag.appendChild(card);
    }
    wrap.appendChild(frag);
  }

  // ---- one result card --------------------------------------------------------
  function buildCard(m) {
    const card = document.createElement("article");
    card.className = "am-card";
    card.dataset.id = m.id ?? "";

    const figure = document.createElement("div");
    figure.className = "am-poster";
    const img = document.createElement("img");
    img.className = "am-poster__img";
    img.loading = "lazy";
    img.decoding = "async";
    img.alt = m.title ? `${m.title} poster` : "Movie poster";
    img.src = m.posterPath || "assets/images/poster-placeholder.svg";
    figure.appendChild(img);
    card.appendChild(figure);

    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "am-pill";
    const title = m.title || "this movie";
    const isAdded = m.id != null && state.added.has(m.id);
    applyPillState(pill, isAdded, title);
    pill.addEventListener("click", () => onAdd(m, pill));
    card.appendChild(pill);

    return card;
  }

  function applyPillState(pill, added, title) {
    if (added) {
      pill.classList.add("is-added");
      pill.textContent = "ADDED";
      pill.setAttribute("aria-pressed", "true");
      pill.setAttribute("aria-label", `${title} added to list`);
      pill.disabled = true;
    } else {
      pill.classList.remove("is-added");
      pill.textContent = "+ add to list";
      pill.setAttribute("aria-pressed", "false");
      pill.setAttribute("aria-label", `Add ${title} to list`);
      pill.disabled = false;
    }
  }

  function renderResults(movies) {
    setBusy(false);
    clearMessageMode();
    const wrap = resultsEl();
    wrap.innerHTML = "";
    if (!movies.length) {
      hint("No movies found. Try a different title.");
      return;
    }
    const frag = document.createDocumentFragment();
    movies.forEach((m) => frag.appendChild(buildCard(m)));
    wrap.appendChild(frag);
  }

  // ---- add action -------------------------------------------------------------
  async function onAdd(m, pill) {
    if (m.id == null || state.added.has(m.id)) return;
    const title = m.title || "this movie";
    pill.disabled = true;
    try {
      const updated = await MovieAPI.addMovieToCollection(state.id, m.id);
      state.collection = updated;
      // Re-seed the added set from the server's authoritative list so re-search
      // keeps showing ADDED.
      seedAddedFrom(updated);
      state.added.add(m.id);
      applyPillState(pill, true, title);
      if (window.toast) toast.success(`Added “${title}”.`);
    } catch (err) {
      pill.disabled = false;
      if (err && err.status === 401) {
        window.location.replace("login.html");
        return;
      }
      if (window.toast) toast.error((err && err.message) || "Couldn't add the movie.");
    }
  }

  function seedAddedFrom(collection) {
    const ids = (collection && collection.movies ? collection.movies : [])
      .map((x) => x && x.id)
      .filter((x) => x != null);
    state.added = new Set(ids);
  }

  // ---- search (debounce + stale-seq guard) ------------------------------------
  async function runSearch(q) {
    const mySeq = ++state.seq;
    showSkeletons();
    try {
      const movies = await MovieAPI.searchMovies({ q });
      if (mySeq !== state.seq) return; // a newer query superseded this one
      renderResults(movies);
    } catch (err) {
      if (mySeq !== state.seq) return;
      if (err && err.status === 401) {
        window.location.replace("login.html");
        return;
      }
      const retry = `<p>${esc((err && err.message) || "Couldn't search right now.")}</p>
        <button type="button" class="am-retry" id="amRetry">Retry</button>`;
      hint(`<h2>Something went wrong</h2>${retry}`, { error: true });
      const btn = $("amRetry");
      if (btn) btn.addEventListener("click", () => runSearch(q));
    }
  }

  function onInput(e) {
    const q = e.target.value.trim();
    state.lastQuery = q;
    if (state.timer) clearTimeout(state.timer);
    if (!q) {
      state.seq++; // cancel any in-flight render
      hint("<h2>Search for a movie</h2><p>Type a title above to find movies to add to this list.</p>");
      return;
    }
    state.timer = setTimeout(() => runSearch(q), 300);
  }

  // ---- load / access control --------------------------------------------------
  async function load() {
    const params = new URLSearchParams(location.search);
    const id = params.get("collection");
    state.id = id;
    wireBack();

    // Adding is a logged-in, owner-only action.
    if (window.isGuest && window.isGuest()) {
      window.location.replace("login.html");
      return;
    }

    if (!id) {
      window.location.replace("404.html");
      return;
    }

    try {
      const c = await MovieAPI.getCollection(id);
      if (!c.isOwner) {
        // Not your list — back to the (read-only) collection view.
        window.location.replace("collection.html?id=" + encodeURIComponent(id));
        return;
      }
      state.collection = c;
      setTitle(c.name);
      seedAddedFrom(c);
      hint("<h2>Search for a movie</h2><p>Type a title above to find movies to add to this list.</p>");
    } catch (err) {
      if (err && err.status === 401) {
        window.location.replace("login.html");
        return;
      }
      if (err && err.status === 404) {
        window.location.replace("404.html");
        return;
      }
      setTitle("Collection");
      hint(
        `<h2>Couldn’t load this collection</h2><p>${esc((err && err.message) || "Please try again later.")}</p>`,
        { error: true }
      );
      if (window.toast) toast.error((err && err.message) || "Couldn't load this collection.");
    }
  }

  function init() {
    const input = $("amSearchInput");
    if (input) input.addEventListener("input", onInput);
    load();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
