// home/main.js — the orchestrator wiring the home page together: card-grid click
// handling (heart/eye -> LibraryButtons.toggle, "+" -> CollectionModal, card body
// -> movie page), the AI-mode toggle, the live debounced text search, and the
// "Surprise Me" randomizer. Split out of the former monolithic js/home.js
// (behaviour unchanged). Loaded LAST of the home/* scripts, so every global it
// touches (feed state + helpers, runSearch, paintLibBtn, ...) is already declared.

// ==========================================
// 13. CARD INTERACTIONS (LIKE / WATCHED)
// ==========================================
const movieGridEl = document.getElementById("movieGrid");
if (movieGridEl) {
  movieGridEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".icon-btn");
    if (!btn) {
      // A click anywhere else on a card opens its details page. The basic
      // fields are stashed so the details page can paint instantly while it
      // fetches the full record (overview, cast, trailer) in the background.
      const card = e.target.closest(".movie-card");
      if (!card || !card.dataset.id) return;
      sessionStorage.setItem(
        "mk:lastMovie",
        JSON.stringify({
          id: card.dataset.id,
          title: card.dataset.title,
          releaseYear: card.dataset.year,
          rating: card.dataset.rating,
          posterPath: card.dataset.poster,
        }),
      );
      window.location.href = `movie.html?id=${encodeURIComponent(card.dataset.id)}`;
      return;
    }
    e.stopPropagation();
    const label = btn.querySelector("img")?.alt || "";

    // Add to Collection / Like / Watched all require an account — block guests
    // with a toast before doing anything (shared guard from common.js).
    if (window.requireAuth && !window.requireAuth()) return;

    if (label === "Add to collection") {
      const card = btn.closest(".movie-card");
      const title = (card && card.dataset.title) || "This movie";
      const id = card && card.dataset.id ? card.dataset.id : null;
      if (window.CollectionModal) CollectionModal.open(id, title);
      else toast.soon("Coming Soon!");
      return;
    }

    // Like → Favorites, Mark watched → Already Watched: real add/remove.
    const which =
      label === "Like" ? "favorites" : label === "Mark watched" ? "watched" : null;
    if (which) {
      const card = btn.closest(".movie-card");
      LibraryButtons.toggle(which, Number(card && card.dataset.id), (on) =>
        paintLibBtn(btn, which, on),
      );
    }
  });
}

// ==========================================
// 14. AI MODE TOGGLE
// ==========================================
const aiModeBtn = document.querySelector(".ai-mode-btn");
const searchContainer = document.querySelector(".search-container");
const searchInput = document.getElementById("movieSearch");

function aiModeOn() {
  return !!(aiModeBtn && aiModeBtn.classList.contains("pressed"));
}

if (aiModeBtn && searchContainer && searchInput) {
  aiModeBtn.addEventListener("click", () => {
    aiModeBtn.classList.toggle("pressed");
    searchContainer.classList.toggle("ai-glow");
    if (aiModeOn()) {
      // AI mode is deliberate, not live: typing won't fire a (slow, costly) AI
      // call — the user submits with Enter. The hint reflects that.
      searchInput.placeholder = "Describe a movie, then press Enter…";
    } else {
      // Back to the normal catalog: restore the live feed for whatever's typed.
      searchInput.placeholder = "Search movies...";
      runSearch();
    }
  });
}

// ==========================================
// 14b. AI NATURAL-LANGUAGE SEARCH  (POST /api/ai/search)
// ==========================================
// Unlike the live catalog search, this is a single deliberate request (6–9s and
// a real API call), so it fires on Enter only. It takes over the feed: clear,
// show skeletons, then render the AI's picks with the SAME card builder. Setting
// feedDone stops infinite scroll from appending the popular feed underneath.
async function runAiSearch(query) {
  // Snapshot the current feed so a FAILED search can leave it on screen — a
  // rate-limit / error should just toast, not dump a wall of error text.
  const prev = feedMovies.slice();
  feedMovies = [];
  feedPage = 0;
  feedDone = true; // AI results are a fixed set — no paging beneath them
  feedLoading = false;
  const token = ++feedToken; // invalidate any in-flight catalog page load
  const grid = document.getElementById("movieGrid");
  if (grid) {
    clearGridCards();
    insertBeforeSentinel(fragmentFromHTML(movieSkeletonMarkup(10)));
  }

  try {
    const results = await MovieAPI.aiSearch(query);
    if (token !== feedToken) return; // a newer search superseded this one
    clearGridCards();
    if (!results.length) {
      if (prev.length) {
        feedMovies = prev;
        insertBeforeSentinel(fragmentFromHTML(prev.map(buildMovieCard).join("")));
        if (window.toast) toast.info("No matches — keeping your previous results.");
      } else {
        showGridMessage("The AI couldn’t find a match — try rephrasing.");
      }
      return;
    }
    feedMovies = results;
    insertBeforeSentinel(fragmentFromHTML(results.map(buildMovieCard).join("")));
  } catch (err) {
    if (token !== feedToken) return;
    // Only a short, friendly toast — never the raw upstream error. Keep the feed
    // as it was: restore the previous cards if we had any.
    if (window.toast) toast.error(aiSearchErrorMessage(err));
    clearGridCards();
    if (prev.length) {
      feedMovies = prev;
      insertBeforeSentinel(fragmentFromHTML(prev.map(buildMovieCard).join("")));
    } else {
      showGridMessage("Couldn’t run AI search right now. Please try again.");
    }
  }
}

// A SHORT, friendly message for a failed AI search — never the raw upstream error
// (Gemini's free-tier rate-limit replies are a huge wall of text).
function aiSearchErrorMessage(err) {
  switch (err && err.status) {
    case 400: return (err.message && err.message.length <= 100)
      ? err.message : "That search didn’t look right — try rephrasing it.";
    case 401: return "Please sign in to use AI search.";
    case 429:
    case 503: return "The AI is busy right now (free-tier rate limit). Give it a moment, then try again.";
    case 502: return "The AI had trouble responding. Try again.";
    case 504: return "The AI took too long to answer. Try again in a moment.";
    default:  return "Couldn’t run AI search right now. Please try again.";
  }
}

// ==========================================
// 15. LIVE TEXT SEARCH (debounced -> runSearch)
// ==========================================
// Typing just re-runs the consolidated query (text + filters + sort). An empty
// box is a valid query too — it returns the default feed. Out-of-order responses
// are handled by the feedToken guard inside loadFeedBatch().
if (searchInput) {
  let searchDebounce;
  searchInput.addEventListener("input", () => {
    // In AI mode typing is NOT live — the user submits with Enter (handled below),
    // so don't fire the debounced catalog search.
    if (aiModeOn()) return;
    // If the user scrolled down the feed and starts typing again, glide back to
    // the top so the fresh results aren't hidden below the fold.
    window.scrollTo({ top: 0, behavior: "smooth" });
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(runSearch, 300);
  });

  // Enter submits an AI search when AI mode is on. (In normal mode the live
  // input handler already covers it, so Enter is a harmless no-op there.)
  searchInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || !aiModeOn()) return;
    e.preventDefault();
    const q = searchInput.value.trim();
    if (!q) {
      if (window.toast) toast.info("Describe what you’re after, then press Enter.");
      return;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
    runAiSearch(q);
  });
}

// ==========================================
// 16. SURPRISE ME RANDOMIZER
// ==========================================
// Picks a random movie to take over the screen with one result. Rather than the
// generic /movies/random endpoint (which surfaced obscure / foreign titles), it
// draws from the SAME pool as the default feed — popular, well-voted, English
// movies — so the "surprise" is always a recognisable, normal pick. It grabs a
// random page from the top of that pool and chooses a movie from it at random.
const SURPRISE_PAGES = 50; // sample from roughly the top ~1000 popular movies

async function fetchSurpriseMovie() {
  const page = Math.floor(Math.random() * SURPRISE_PAGES) + 1;
  // Mirrors the empty-box default feed: popularity sort + quality guards.
  let results = await MovieAPI.searchMovies({
    sort: "popularity",
    minVotes: 500,
    language: "en",
    page,
  });
  // A high random page can fall past the result set on a thin catalog — retry
  // once from page 1 so the button still returns something popular.
  if (!results.length && page !== 1) {
    results = await MovieAPI.searchMovies({
      sort: "popularity",
      minVotes: 500,
      language: "en",
      page: 1,
    });
  }
  if (!results.length) return null;
  return results[Math.floor(Math.random() * results.length)];
}

document.addEventListener("DOMContentLoaded", () => {
  const diceOne = document.getElementById("diceOne");
  const diceTwo = document.getElementById("diceTwo");
  const movieSearchInput = document.getElementById("movieSearch");
  const surpriseTrigger = document.querySelector(".surprise-container");
  let surprising = false; // guard against double-clicks while a request is live

  function rollDice() {
    if (!diceOne || !diceTwo) return;
    diceOne.classList.remove("roll-left");
    diceTwo.classList.remove("roll-right");
    void diceOne.offsetWidth; // force a reflow so the animation replays
    diceOne.classList.add("roll-left");
    diceTwo.classList.add("roll-right");
  }

  if (surpriseTrigger) {
    surpriseTrigger.addEventListener("click", async (e) => {
      e.preventDefault();
      rollDice();
      if (surprising) return;
      surprising = true;

      try {
        const movie = await fetchSurpriseMovie();
        if (!movie || !movie.title) {
          if (window.toast) toast.info("Couldn't find a movie — try again!");
          return;
        }
        // Take over the grid with just this pick and pause pagination, and
        // reflect the result in the search bar (without re-triggering a search —
        // editing/clearing the box later runs a fresh query as usual).
        feedQuery = {};
        feedMovies = [movie];
        feedPage = 0;
        feedDone = true; // no more pages for a single random pick
        feedToken++; // abandon any in-flight page load
        if (movieSearchInput) movieSearchInput.value = movie.title;
        await renderMovieGrid([movie]);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (err) {
        console.error("Surprise Me failed:", err);
        if (window.toast) toast.error(err.message);
      } finally {
        surprising = false;
      }
    });
  }
});
