// load LAST of home/* so every global it touches is already declared

const movieGridEl = document.getElementById("movieGrid");
if (movieGridEl) {
  movieGridEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".icon-btn");
    if (!btn) {
      // stash basic fields so movie.html paints instantly while fetching the full record
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

    // collection / like / watched all require an account
    if (window.requireAuth && !window.requireAuth()) return;

    if (label === "Add to collection") {
      const card = btn.closest(".movie-card");
      const title = (card && card.dataset.title) || "This movie";
      const id = card && card.dataset.id ? card.dataset.id : null;
      if (window.CollectionModal) CollectionModal.open(id, title);
      else toast.soon("Coming Soon!");
      return;
    }

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

const aiModeBtn = document.querySelector(".ai-mode-btn");
const searchContainer = document.querySelector(".search-container");
const searchInput = document.getElementById("movieSearch");

function aiModeOn() {
  return !!(aiModeBtn && aiModeBtn.classList.contains("pressed"));
}

// whether AI results own the grid; only then does leaving AI mode restore the catalog
let aiResultsShowing = false;

if (aiModeBtn && searchContainer && searchInput) {
  aiModeBtn.addEventListener("click", () => {
    // gate turning AI on (logged-in only); turning it off must always work
    if (!aiModeOn() && window.requireAuth && !requireAuth()) return;
    aiModeBtn.classList.toggle("pressed");
    searchContainer.classList.toggle("ai-glow");
    if (aiModeOn()) {
      searchInput.placeholder = "Describe a movie, press Enter…";
    } else {
      searchInput.placeholder = "Search movies...";
      if (aiResultsShowing) {
        aiResultsShowing = false;
        runSearch();
      }
    }
  });
}

// last AI query run, to no-op an unchanged submit so the costly request doesn't re-fire
let lastAiQuery = "";
// each query gets one reroll; reset when the text changes
let aiSearchRerolled = false;

// safety net for the soft exclude_ids reroll, where the backend may reuse an id; keep movies without an id
function dedupeMoviesById(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : []).filter((m) => {
    if (!m || m.id == null) return !!m;
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}

// reroll re-runs the query excluding shown ids for a fresh set
async function runAiSearch(query, { reroll = false } = {}) {
    lastAiQuery = query;
  // snapshot the feed so a failed search can leave it on screen
  const prev = feedMovies.slice();
  const excludeIds = reroll ? prev.map((m) => m && m.id) : [];
  feedMovies = [];
  feedPage = 0;
  feedDone = true; // AI results are a fixed set, no paging
  feedLoading = false;
  const token = ++feedToken; // invalidate any in-flight catalog page load
  const grid = document.getElementById("movieGrid");
  if (grid) {
    clearGridCards();
    insertBeforeSentinel(fragmentFromHTML(movieSkeletonMarkup(10)));
  }

  try {
    const results = dedupeMoviesById(
      await MovieAPI.aiSearch(query, { exclude_ids: excludeIds })
    );
    if (token !== feedToken) return; // a newer search superseded this one
    clearGridCards();
    if (!results.length) {
      if (prev.length) {
        feedMovies = prev;
        aiResultsShowing = false;
        insertBeforeSentinel(fragmentFromHTML(prev.map(buildMovieCard).join("")));
        if (window.toast) toast.info("No matches — keeping your previous results.");
      } else {
        showGridMessage("The AI couldn’t find a match — try rephrasing.");
      }
      return;
    }
    feedMovies = results;
    aiResultsShowing = true;
    insertBeforeSentinel(fragmentFromHTML(results.map(buildMovieCard).join("")));
  } catch (err) {
    if (token !== feedToken) return;
    // forget the query so retrying the same text isn't a no-op
    lastAiQuery = "";
    aiSearchRerolled = false; // a failed run doesn't consume the reroll
    aiResultsShowing = false;
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

function aiSearchErrorMessage(err) {
  // quota exhausted is a 429 too, distinguished by the backend's error code
  if (err && err.code === MovieAPI.AI_LIMIT_CODE) return err.message;
  switch (err && err.status) {
    case 400: return (err.message && err.message.length <= 100)
      ? err.message : "That search didn’t look right — try rephrasing it.";
    case 401: return "Please sign in to use AI search.";
    case 429:
    case 503: return "The AI director is currently busy. Please try again in a few minutes!";
    case 502: return "The AI had trouble responding. Try again.";
    case 504: return "The AI took too long to answer. Try again in a moment.";
    default:  return "Couldn’t run AI search right now. Please try again.";
  }
}

// live text search (debounced); empty box returns the default feed, feedToken guards order
if (searchInput) {
  let searchDebounce;
  searchInput.addEventListener("input", () => {
    updateSearchModeUI();
    if (aiModeOn()) return; // in AI mode typing is not live, Enter submits below
    window.scrollTo({ top: 0, behavior: "smooth" });
    aiResultsShowing = false;
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(runSearch, 300);
  });

  searchInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || !aiModeOn()) return;
    e.preventDefault();
    const q = searchInput.value.trim();
    if (!q) return;
    // bail early if quota is spent (the backend would 429 anyway)
    if (window.requireAuth && !requireAuth()) return;
    if (window.MovieAPI && MovieAPI.aiActionsRemaining() <= 0) {
      if (window.toast) toast.warn(MovieAPI.aiLimitReachedMessage());
      return;
    }
    if (q === lastAiQuery) {
      // re-submitting the same query is one reroll, then a no-op until the text changes
      if (aiSearchRerolled) return;
      aiSearchRerolled = true;
      window.scrollTo({ top: 0, behavior: "smooth" });
      runAiSearch(q, { reroll: true });
      return;
    }
    aiSearchRerolled = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
    runAiSearch(q);
  });
}

// server owns the randomization (random title from the popular, well-voted feed)
async function fetchSurpriseMovie() {
  return MovieAPI.getRandomMovie();
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
    void diceOne.offsetWidth; // force reflow so the animation replays
    diceOne.classList.add("roll-left");
    diceTwo.classList.add("roll-right");
  }

  if (diceOne) diceOne.addEventListener("animationend", (e) => {
    if (e.animationName === "tossLeft") diceOne.classList.remove("roll-left");
  });
  if (diceTwo) diceTwo.addEventListener("animationend", (e) => {
    if (e.animationName === "tossRight") diceTwo.classList.remove("roll-right");
  });

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
        // take over the grid with just this pick and pause pagination
        feedQuery = {};
        feedMovies = [movie];
        feedPage = 0;
        feedDone = true;
        feedToken++; // abandon any in-flight page load
        if (movieSearchInput) {
          movieSearchInput.value = movie.title;
          // fire change not input, so the clear "X" shows without the live search re-firing
          movieSearchInput.dispatchEvent(new Event("change"));
        }
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
