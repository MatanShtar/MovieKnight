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
  posterPath: "assets/images/movie-details-demo-poster.png",
  backdropPath: "assets/images/movie-details-demo-poster.png",
  trailerKey: "GbWQ_VXek6A",
};

const el = (id) => document.getElementById(id);

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
  // (The #trailer-player id is left in place so a URL can also be injected later.)
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

// Quick-action buttons: toggle + toast (no persistence wired up yet).
// Like / Watched / Add to Collection all require an account — guests are blocked
// with a toast via the shared requireAuth() guard before anything happens.
function setupActions() {
  const messages = {
    mdWatched: ["Added to Already Watched", "Removed from Already Watched"],
    mdLike: ["Added to Favorites", "Removed from Favorites"],
  };
  ["mdWatched", "mdLike"].forEach((id) => {
    const btn = el(id);
    if (!btn) return;
    btn.addEventListener("click", () => {
      if (window.requireAuth && !window.requireAuth()) return; // guests blocked
      const active = btn.classList.toggle("is-active");
      const [on, off] = messages[id];
      if (window.toast) toast[active ? "success" : "info"](active ? on : off);
    });
  });

  const add = el("mdAdd");
  if (add) {
    add.addEventListener("click", () => {
      if (window.requireAuth && !window.requireAuth()) return; // guests blocked
      if (window.CollectionModal) {
        CollectionModal.open(currentTitle || "This movie");
      } else if (window.toast) {
        toast.soon("Add to Collection — Coming Soon!");
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  setupActions();

  const id = getMovieId();

  // No movie selected — render the built-in demo and skip the network call.
  if (!id) {
    paintDetails(DEMO_MOVIE);
    return;
  }

  paintBasics(getCachedBasics(id));

  try {
    const details = await MovieAPI.getMovieDetails(id);
    paintDetails(details);
  } catch (err) {
    console.error("Could not load movie details:", err);
    if (window.toast) toast.error(err.message);
    if (!el("mdTitle").textContent.trim()) {
      el("mdTitle").textContent = "Couldn't load this movie";
    }
  }
});
