// enhance-modal.js — "Enhance My Collection" modal (window.EnhanceModal).
//
// Opened from the collection page's gold "ENHANCE MY COLLECTION" toolbar button.
// Overlaid on the (blurred) collection page, it asks the AI for 3 movies the user
// would enjoy that are NOT already in the list (POST /api/ai/enhance/:id via
// MovieAPI.aiEnhance), shows a pulsing loading state, then reveals the picks as
// poster + one-line reason + an "Add to Collection" button.
//
// "Try Again" rerolls (sending the on-screen ids so the new trio is fresh). It is
// UNLIMITED — but each reroll, like the first generation, spends one daily AI
// action, so before firing we surface the SAME "out of daily actions" toast the
// rest of the app uses (MovieAPI.aiLimitReachedMessage) when the quota is gone.
//
//   EnhanceModal.open(collectionId, {
//     name: "Must Watch Classics",      // collection name, for toasts
//     onChange: () => reloadGrid(),      // called once on close IF a movie was added
//   });
//
// Reuses: MovieAPI (aiEnhance + quota helpers), window.toast, the shared
// .ai-tryagain button (css/components/ai-tryagain.css), and the modal conventions
// from add-to-collection-modal.js (.is-open / cm-no-scroll / Escape to close).
window.EnhanceModal = (function () {
  const REVEAL_DELAY_MS = 120; // brief beat before the staggered card reveal
  const esc = (s) => (window.escapeHtml ? window.escapeHtml(s) : String(s ?? ""));

  // Refresh "cw" arrows — identical markup to ai-suggestions.html so the shared
  // .ai-tryagain styling animates it the same way.
  const TRYAGAIN_ARROWS = `
    <svg class="ai-tryagain-arrows" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-8.49-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <polyline points="3 21 3 15 9 15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M3 12a9 9 0 0 1 9-9 9 9 0 0 1 8.49 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <polyline points="21 3 21 9 15 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;

  const PLUS_ICON = `
    <svg class="enhance-add-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>`;
  const CHECK_ICON = `
    <svg class="enhance-add-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>`;

  let overlay = null, modal = null, cardsEl = null, tryAgainBtn = null;
  let ctx = null;        // { id, name, onChange, mutated }
  let movies = [];       // the recommendations currently on screen
  let loading = false;   // guards Try Again / close against overlapping requests

  // ==========================================
  // 1. BUILD (once) + open/close
  // ==========================================
  function build() {
    overlay = document.createElement("div");
    overlay.className = "enhance-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Enhance my collection");
    overlay.innerHTML = `
      <div class="enhance-modal">
        <button class="enhance-close" type="button" aria-label="Close">&times;</button>
        <div class="enhance-cards" id="enhanceCards"></div>
        <button class="ai-tryagain" id="enhanceTryAgain" type="button">
          TRY AGAIN
          ${TRYAGAIN_ARROWS}
        </button>
      </div>`;
    document.body.appendChild(overlay);
    modal = overlay.querySelector(".enhance-modal");
    cardsEl = overlay.querySelector("#enhanceCards");
    tryAgainBtn = overlay.querySelector("#enhanceTryAgain");

    overlay.querySelector(".enhance-close").addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && overlay.classList.contains("is-open")) close();
    });

    setupTryAgain();
    // Delegate the per-card actions once; survives re-renders. The poster's "i"
    // badge opens details in a new tab (modal stays put); the button adds the movie.
    cardsEl.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const movie = movies[Number(btn.dataset.index)];
      if (!movie) return;
      if (btn.dataset.action === "info") openDetails(movie);
      else if (btn.dataset.action === "add") addToCollection(movie, btn);
    });
  }

  function open(id, opts = {}) {
    if (!overlay) build();
    ctx = {
      id,
      name: opts.name || "your collection",
      onChange: typeof opts.onChange === "function" ? opts.onChange : null,
      mutated: false,
    };
    movies = [];
    clearOffered(); // fresh session — start avoiding repeats from zero
    overlay.classList.add("is-open");
    document.body.classList.add("cm-no-scroll");
    setTimeout(() => { try { overlay.querySelector(".enhance-close").focus(); } catch (_) {} }, 50);
    generate(); // first generation (spends one AI action on success)
  }

  function close() {
    if (!overlay) return;
    overlay.classList.remove("is-open");
    document.body.classList.remove("cm-no-scroll");
    // Tell the collection page to refresh ONLY if the user actually added something.
    if (ctx && ctx.mutated && ctx.onChange) ctx.onChange();
  }

  // ==========================================
  // 2. GENERATE (initial + every Try Again reroll)
  // ==========================================
  async function generate() {
    if (loading || !ctx) return;
    loading = true;
    setTryAgainBusy(true);

    // Snapshot so a FAILED attempt leaves the screen untouched (toast + keep prev).
    const prev = movies.slice();
    // Send EVERYTHING offered this modal session (not just the trio on screen): ids
    // for the backend's hard filter, and titles so the AI itself avoids them. The
    // list grows with every press, so a reroll never repeats an earlier movie.
    const offered = readOffered();
    const excludeIds = offered.map((o) => o.id);
    const excludeTitles = offered.map((o) => (o.year ? `${o.title} (${o.year})` : o.title));
    movies = [];
    renderSkeletons();

    try {
      const results = await MovieAPI.aiEnhance(ctx.id, {
        exclude_ids: excludeIds,
        exclude_titles: excludeTitles,
      });
      if (!results.length) {
        if (prev.length) {
          movies = prev;
          renderCards(movies);
          if (window.toast) toast.info("No fresh recommendations left — keeping these.");
        } else {
          renderEmpty("The AI didn’t suggest anything new. Add a few movies, then try again.");
        }
      } else {
        movies = dedupeById(results);
        addOffered(movies); // accumulate so future rerolls never repeat these
        renderCards(movies);
      }
    } catch (err) {
      if (window.toast) toast.error(aiErrorMessage(err));
      if (prev.length) {
        movies = prev;
        renderCards(movies);
      } else {
        renderEmpty("Couldn’t get AI recommendations right now. Please try again.");
      }
    } finally {
      loading = false;
      setTryAgainBusy(false);
    }
  }

  // Keep each TMDB id at most once, preserving order (mirrors ai.js).
  function dedupeById(list) {
    const seen = new Set();
    return (Array.isArray(list) ? list : []).filter((m) => {
      if (!m || m.id == null) return !!m;
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  }

  // ---- offered-movies accumulator (sessionStorage, per collection) -------------
  // Every movie shown this session is remembered as { id, title, year } so each
  // request can send the FULL list — ids (hard filter) + titles (prompt avoidance).
  // That's what makes "Try Again" never repeat. Cleared when the modal is (re)opened,
  // so it accumulates only "as long as you don't exit".
  function offeredKey() { return `mk:enhanceOffered:${ctx.id}`; }
  function readOffered() {
    try {
      const a = JSON.parse(sessionStorage.getItem(offeredKey()));
      return Array.isArray(a) ? a : [];
    } catch (_) { return []; }
  }
  function addOffered(list) {
    const byId = new Map(readOffered().map((o) => [o.id, o]));
    (list || []).forEach((m) => {
      if (m && m.id != null && !byId.has(m.id)) {
        byId.set(m.id, { id: m.id, title: m.title || "", year: m.releaseYear || null });
      }
    });
    // Cap so the array (and request body) can't grow without bound on long sessions.
    const capped = [...byId.values()].slice(-300);
    try { sessionStorage.setItem(offeredKey(), JSON.stringify(capped)); } catch (_) {}
  }
  function clearOffered() {
    try { sessionStorage.removeItem(offeredKey()); } catch (_) {}
  }

  // A SHORT, friendly message for a failed request — never the raw upstream error.
  // The quota-exhausted 429 is told apart by the backend's error code so it shows
  // its specific "out of daily actions" line, not the generic "AI is busy".
  function aiErrorMessage(err) {
    if (err && err.code === MovieAPI.AI_LIMIT_CODE) return err.message;
    switch (err && err.status) {
      case 400: return (err.message && err.message.length <= 100)
        ? err.message : "Couldn’t enhance this collection. Try again.";
      case 401: return "Please sign in to use AI recommendations.";
      case 404: return "That collection could not be found.";
      case 429:
      case 503: return "The AI director is currently busy. Please try again in a few minutes!";
      case 502: return "The AI had trouble responding. Give it another go.";
      case 504: return "The AI took too long to answer. Try again in a moment.";
      default:  return "Couldn’t get AI recommendations right now. Please try again.";
    }
  }

  // ==========================================
  // 3. RENDERING
  // ==========================================
  function renderSkeletons() {
    if (!cardsEl) return;
    cardsEl.innerHTML = Array.from({ length: 3 }, () => `
      <div class="enhance-card enhance-card--skeleton">
        <div class="enhance-poster-wrap"><div class="enhance-poster"></div></div>
      </div>`).join("");
  }

  function renderEmpty(message) {
    if (cardsEl) cardsEl.innerHTML = `<div class="enhance-empty">${esc(message)}</div>`;
  }

  function renderCards(list) {
    if (!cardsEl) return;
    cardsEl.innerHTML = list.map((m, i) => {
      const title = esc(m.title || "Untitled");
      const label = m.releaseYear ? `${title} (${esc(m.releaseYear)})` : title;
      const reason = esc(m.reason || "");
      const poster = esc(m.posterPath || "");
      const posterEl = poster
        ? `<img class="enhance-poster" src="${poster}" alt="${title}" loading="lazy" decoding="async">`
        : `<div class="enhance-poster"></div>`;
      return `
        <div class="enhance-card" data-index="${i}">
          <div class="enhance-poster-wrap">
            ${posterEl}
            <button class="enhance-info" type="button" data-action="info" data-index="${i}"
                    aria-label="View details for ${title}" title="View details">i</button>
            <span class="enhance-card-title">${label}</span>
          </div>
          <button class="enhance-add" type="button" data-action="add" data-index="${i}">
            ${PLUS_ICON}<span class="enhance-add-label">Add to Collection</span>
          </button>
          <p class="enhance-reason">${reason}</p>
        </div>`;
    }).join("");

    // Staggered fade/rise reveal once the posters are in the DOM.
    setTimeout(() => {
      cardsEl.querySelectorAll(".enhance-card").forEach((card, i) => {
        setTimeout(() => card.classList.add("is-revealed"), i * 90);
      });
    }, REVEAL_DELAY_MS);
  }

  // ==========================================
  // 4. CARD ACTIONS
  // ==========================================
  // The poster's "i" badge → the movie's details page in a NEW tab, so the enhance
  // modal (and the rest of this session's picks) stays put behind it. Same behaviour
  // as the chopping carousel's "i" badge.
  function openDetails(movie) {
    if (!movie || movie.id == null) {
      if (window.toast) toast.info("No details available for this title.");
      return;
    }
    window.open("movie.html?id=" + encodeURIComponent(movie.id), "_blank", "noopener");
  }

  async function addToCollection(movie, btn) {
    if (!ctx || !ctx.id || movie.id == null) return;
    if (btn.classList.contains("is-added") || btn.classList.contains("is-busy")) return;
    btn.classList.add("is-busy");
    btn.disabled = true;
    try {
      await MovieAPI.addMovieToCollection(ctx.id, movie.id);
      btn.classList.remove("is-busy");
      btn.classList.add("is-added");
      btn.innerHTML = `${CHECK_ICON}<span class="enhance-add-label">Added</span>`;
      ctx.mutated = true; // collection page refreshes on close
      if (window.toast) toast.success(`Added “${movie.title}” to ${ctx.name}.`);
    } catch (err) {
      btn.classList.remove("is-busy");
      btn.disabled = false;
      if (window.toast) toast.error((err && err.message) || "Couldn’t add that movie.");
    }
  }

  // ==========================================
  // 5. TRY AGAIN (unlimited; gated only by the daily AI quota)
  // ==========================================
  function setupTryAgain() {
    tryAgainBtn.addEventListener("click", () => {
      if (loading) return;
      // A reroll spends another AI action — stop here with the SAME "out of daily
      // actions" toast the rest of the app uses, rather than firing a doomed request.
      if (window.MovieAPI && MovieAPI.aiActionsRemaining() <= 0) {
        if (window.toast) toast.warn(MovieAPI.aiLimitReachedMessage());
        return;
      }
      // Spin the arrows once per press (restart the CSS animation cleanly).
      tryAgainBtn.classList.remove("is-spinning");
      void tryAgainBtn.offsetWidth; // reflow so the animation can replay
      tryAgainBtn.classList.add("is-spinning");
      tryAgainBtn.addEventListener(
        "animationend",
        () => tryAgainBtn.classList.remove("is-spinning"),
        { once: true }
      );
      generate();
    });
  }

  function setTryAgainBusy(busy) {
    if (tryAgainBtn) tryAgainBtn.disabled = !!busy;
  }

  return { open };
})();
