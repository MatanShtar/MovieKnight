// movie.js — Movie Details page.
// Reached by clicking a poster on the home feed: that handler stashes the card's
// basic fields in sessionStorage and navigates here with ?id=<tmdbId>. We paint
// those basics instantly, then fetch the full record (overview, director, cast,
// genres, trailer) from GET /api/movies/:id and fill the rest in.

// A self-contained demo record (matching the Figma frame) shown when the page is
// opened directly with no movie selected — e.g. the design/diff harness, or a
// stray visit to movie.html. Real navigations always arrive with ?id=<tmdbId>.
const DEMO_MOVIE = {
  id: 4951,
  title: "10 Things I Hate About You",
  releaseYear: 1999,
  director: "Gil Junger",
  overview:
    "As soon as Cameron, a newbie at Padua High School, finds Bianca, he " +
    "falls in love with her. However, to date Bianca, he must first get her " +
    "older sister Kate, a mean feminist, to date someone.",
  cast: ["Heath Ledger", "Julia Stiles", "Joseph Gordon - Levitt", "David Krumholtz"],
  genres: ["Comedy", "Drama", "Romance"],
  posterPath: "assets/images/posters/ten-things-i-hate-about-you-poster.webp",
  backdropPath: "assets/images/posters/ten-things-i-hate-about-you-poster.webp",
  trailerKey: "GbWQ_VXek6A",
};

const el = (id) => document.getElementById(id);

// A page that links here can pin where "Back" returns to via a ?back=<relative-url>
// param (e.g. the AI flow wants Back to land on the picker's AI tab, not the
// in-between suggestions page). When present and same-site, we point the Back
// control straight at it and drop data-back so it navigates there instead of using
// the history-based smartBack. Only relative URLs are honoured (no open redirect).
(function applyBackContext() {
  const params = new URLSearchParams(location.search);
  const raw = params.get("back");
  const back = document.getElementById("mdBack");
  if (!back) return;

  // A same-site ?back= pins where Back goes (winner → picker AI tab), bypassing the
  // history-based smartBack. We navigate with location.replace (not a push) so this
  // page is swapped out of history — otherwise the picker's own Back would come
  // straight back here, ping-ponging in a loop.
  if (raw && !/^(?:[a-z]+:)?\/\//i.test(raw)) {
    back.setAttribute("href", raw);
    back.removeAttribute("data-back");
    back.addEventListener("click", (e) => {
      e.preventDefault();
      location.replace(raw);
    });
  }
  // Reached from the AI flow (Info's from=ai, or the winner's back=): render Back in
  // the feature pages' .back-btn style + position so it doesn't shift between pages.
  if (raw || params.get("from") === "ai") {
    back.classList.add("md-back--feature");
  }
})();

// The title of the movie currently shown — passed to the collection modal.
let currentTitle = "";

// Read the movie basics the home card stashed before navigating here.
// Returns the parsed object, or null if absent/unparseable.
function readLastMovie() {
  try {
    return JSON.parse(sessionStorage.getItem("mk:lastMovie"));
  } catch (_) {
    return null;
  }
}

function getMovieId() {
  const fromQuery = new URLSearchParams(location.search).get("id");
  if (fromQuery) return fromQuery;
  // Fall back to whatever the home card stashed (if any).
  const cached = readLastMovie();
  if (cached && cached.id) return cached.id;
  return null; // nothing selected -> show the demo record
}

function getCachedBasics(id) {
  const cached = readLastMovie();
  if (cached && String(cached.id) === String(id)) return cached;
  return null;
}

// Set the blurred backdrop (and the trailer thumbnail, which shares it).
function setBackdrop(url) {
  if (url) {
    document.documentElement.style.setProperty("--md-backdrop", `url("${url}")`);
  }
}

function titleWithYear(title, year) {
  return year ? `${title} (${year})` : title || "";
}

// Paint whatever we already know so the page isn't blank during the fetch.
function paintBasics(basics) {
  if (!basics) return;
  if (basics.title) {
    currentTitle = basics.title;
    el("mdTitle").textContent = titleWithYear(basics.title, basics.releaseYear);
    document.title = `MovieKnight | ${basics.title}`;
  }
  if (basics.posterPath) {
    const poster = el("mdPoster");
    poster.src = basics.posterPath;
    poster.alt = basics.title || "Movie poster";
    setBackdrop(basics.posterPath);
  }
}

// Fill in the full details once they arrive.
function paintDetails(d) {
  if (!d) return;

  currentTitle = d.title;
  el("mdTitle").textContent = titleWithYear(d.title, d.releaseYear);
  document.title = `MovieKnight | ${d.title}`;

  // Show the poster, or the shared 2:3 placeholder when the movie has none.
  // (A poster URL that 404s is handled separately by the global broken-image
  // fallback in common.js, which now matches #mdPoster via its poster-img class.)
  const poster = el("mdPoster");
  poster.src = d.posterPath || POSTER_PLACEHOLDER;
  poster.alt = d.title || "Movie poster";
  // The wide backdrop looks better blurred; fall back to the poster.
  setBackdrop(d.backdropPath || d.posterPath);

  const director = el("mdDirector");
  director.textContent = d.director ? `Directed by ${d.director}` : "";
  director.style.display = d.director ? "" : "none";

  const overview = el("mdOverview");
  overview.textContent = d.overview || "";
  overview.style.display = d.overview ? "" : "none";

  // Cast / genres with a non-bold label, matching the Figma.
  const cast = el("mdCast");
  if (d.cast && d.cast.length) {
    cast.innerHTML = `<strong>Cast:</strong> ${d.cast.map(escapeHtml).join(", ")}`;
    cast.style.display = "";
  } else {
    cast.style.display = "none";
  }

  const genres = el("mdGenres");
  if (d.genres && d.genres.length) {
    genres.innerHTML = `<strong>Genres:</strong> ${d.genres.map(escapeHtml).join(", ")}`;
    genres.style.display = "";
  } else {
    genres.style.display = "none";
  }

  // Trailer: inject the YouTube embed URL into the iframe when we have a key.
  const player = el("trailer-player");
  if (player) {
    if (d.trailerKey) {
      player.src = `https://www.youtube-nocookie.com/embed/${d.trailerKey}`;
      player.title = `${d.title} Trailer`;
      player.closest(".md-trailer").style.display = "";
    } else {
      // No trailer available — hide the player rather than show an empty frame.
      player.removeAttribute("src");
      const wrap = player.closest(".md-trailer");
      if (wrap) wrap.style.display = "none";
    }
  }

  setupReadMore();
}

// "Read more" only earns its place when the full synopsis would actually push
// the page tall enough to scroll at default zoom — otherwise it's just noise, so
// the full text is shown and the toggle stays hidden. On mobile the toggle is
// cancelled entirely (vertical scrolling is expected there), so the synopsis is
// always shown in full. Re-evaluated on resize since both the breakpoint and the
// "does it scroll" answer depend on the viewport.
let readMoreWired = false;
function setupReadMore() {
  const overview = el("mdOverview");
  const btn = el("mdReadMore");
  if (!overview || !btn) return;

  const isMobile = () => window.matchMedia("(max-width: 900px)").matches;
  let expanded = false;

  function sync() {
    // Mobile: no clamp, no toggle — always show the whole synopsis.
    if (isMobile()) {
      expanded = false;
      overview.classList.remove("is-clamped", "is-expanded");
      btn.hidden = true;
      return;
    }
    if (expanded) return; // don't collapse out from under the user

    // Measure with the text fully expanded: if the document now overflows the
    // viewport (a scrollbar would appear), the synopsis is the long pole, so
    // clamp it and offer the toggle. If everything still fits, leave it open.
    overview.classList.remove("is-clamped", "is-expanded");
    const pageScrolls =
      document.documentElement.scrollHeight > window.innerHeight + 2;

    if (pageScrolls) {
      overview.classList.add("is-clamped");
      btn.hidden = false;
      btn.textContent = "Read more";
    } else {
      btn.hidden = true;
    }
  }

  btn.onclick = () => {
    expanded = !expanded;
    // is-expanded carries the override that beats the clamp.
    overview.classList.toggle("is-expanded", expanded);
    overview.classList.toggle("is-clamped", !expanded);
    btn.textContent = expanded ? "Read less" : "Read more";
  };

  // Measure after layout settles (and again shortly after, for late font/image
  // reflow), then keep it in sync with viewport changes.
  requestAnimationFrame(sync);
  setTimeout(sync, 200);
  if (!readMoreWired) {
    readMoreWired = true;
    window.addEventListener("resize", sync);
  }
}

// Quick-action buttons. Heart → Favorites, eye → Already Watched: real add/remove
// (shared logic in js/library-buttons.js). Add to Collection opens the modal. All
// require an account (requireAuth guard).
const LIB_WHICH = { mdLike: "favorites", mdWatched: "watched" };

// Paint a movie-page action button for its membership state.
function paintActionBtn(id, on) {
  const btn = el(id);
  if (!btn) return;
  btn.classList.toggle("is-active", on);
  btn.dataset.tip = LibraryButtons.title(LIB_WHICH[id], on);
}

// Load the library and reflect whether THIS movie is in Favorites / Already Watched.
async function markMovieLibrary() {
  const movieId = Number(getMovieId());
  const library = await LibraryButtons.load();
  if (!library || !movieId) return;
  ["mdLike", "mdWatched"].forEach((id) => {
    const lib = library[LIB_WHICH[id]];
    if (lib) paintActionBtn(id, lib.ids.has(movieId));
  });
}

function setupActions() {
  ["mdWatched", "mdLike"].forEach((id) => {
    const btn = el(id);
    if (!btn) return;
    btn.addEventListener("click", () => {
      if (window.requireAuth && !window.requireAuth()) return; // guests blocked
      LibraryButtons.toggle(LIB_WHICH[id], Number(getMovieId()), (on) =>
        paintActionBtn(id, on),
      );
    });
  });

  const add = el("mdAdd");
  if (add) {
    add.addEventListener("click", () => {
      if (window.requireAuth && !window.requireAuth()) return; // guests blocked
      if (window.CollectionModal) {
        CollectionModal.open(getMovieId(), currentTitle || "This movie");
      } else if (window.toast) {
        toast.soon("Add to Collection — Coming Soon!");
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  setupActions();
  markMovieLibrary(); // reflect Favorites / Already Watched membership for this movie

  const id = getMovieId();

  // No movie selected — render the built-in demo and skip the network call.
  if (!id) {
    paintDetails(DEMO_MOVIE);
    return;
  }

  // A malformed id (e.g. ?id=100s) is no movie at all — go straight to the 404 page.
  if (!/^\d+$/.test(String(id))) {
    window.location.replace("404.html");
    return;
  }

  paintBasics(getCachedBasics(id));

  try {
    const details = await MovieAPI.getMovieDetails(id);
    paintDetails(details);
  } catch (err) {
    // Invalid id (400) or no such movie (404) → the 404 page, not a broken card.
    if (err.status === 400 || err.status === 404) {
      window.location.replace("404.html");
      return;
    }
    console.error("Could not load movie details:", err);
    if (window.toast) toast.error(err.message);
    if (!el("mdTitle").textContent.trim()) {
      el("mdTitle").textContent = "Couldn't load this movie";
    }
  }
});
