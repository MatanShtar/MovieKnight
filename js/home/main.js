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

if (aiModeBtn && searchContainer && searchInput) {
  aiModeBtn.addEventListener("click", () => {
    aiModeBtn.classList.toggle("pressed");
    searchContainer.classList.toggle("ai-glow");
    if (aiModeBtn.classList.contains("pressed")) {
      searchInput.placeholder = "Search movies with AI...";
      toast.soon("AI Mode - Coming Soon!");
    } else {
      searchInput.placeholder = "Search movies...";
    }
  });
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
    // If the user scrolled down the feed and starts typing again, glide back to
    // the top so the fresh results aren't hidden below the fold.
    window.scrollTo({ top: 0, behavior: "smooth" });
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(runSearch, 300);
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
