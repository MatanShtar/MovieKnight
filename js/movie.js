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

function getMovieId() {
  const fromQuery = new URLSearchParams(location.search).get("id");
  if (fromQuery) return fromQuery;
  // Fall back to whatever the home card stashed (if any).
  try {
    const cached = JSON.parse(sessionStorage.getItem("mk:lastMovie"));
    if (cached && cached.id) return cached.id;
  } catch (_) {
    /* ignore */
  }
  return null; // nothing selected -> show the demo record
}

function getCachedBasics(id) {
  try {
    const cached = JSON.parse(sessionStorage.getItem("mk:lastMovie"));
    if (cached && String(cached.id) === String(id)) return cached;
  } catch (_) {
    /* ignore */
  }
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

  if (d.posterPath) {
    const poster = el("mdPoster");
    poster.src = d.posterPath;
    poster.alt = d.title || "Movie poster";
  }
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
    cast.innerHTML = `<strong>Cast:</strong> ${d.cast.join(", ")}`;
    cast.style.display = "";
  } else {
    cast.style.display = "none";
  }

  const genres = el("mdGenres");
  if (d.genres && d.genres.length) {
    genres.innerHTML = `<strong>Genres:</strong> ${d.genres.join(", ")}`;
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

// Collapse a long synopsis to a few lines with a "Read more" toggle so the page
// stays a single screen. Only shows the toggle when the text actually overflows.
function setupReadMore() {
  const overview = el("mdOverview");
  const btn = el("mdReadMore");
  if (!overview || !btn) return;

  overview.classList.add("is-clamped");
  // Let layout settle, then decide whether the toggle is needed.
  requestAnimationFrame(() => {
    const overflows = overview.scrollHeight > overview.clientHeight + 2;
    btn.hidden = !overflows;
    if (!overflows) overview.classList.remove("is-clamped");
  });

  btn.onclick = () => {
    const clamped = overview.classList.toggle("is-clamped");
    btn.textContent = clamped ? "Read more" : "Read less";
  };
}

// Quick-action buttons: toggle + toast (no persistence wired up yet).
function setupActions() {
  const messages = {
    mdWatched: ["Added to Already Watched", "Removed from Already Watched"],
    mdLike: ["Added to Favorites", "Removed from Favorites"],
  };
  ["mdWatched", "mdLike"].forEach((id) => {
    const btn = el(id);
    if (!btn) return;
    btn.addEventListener("click", () => {
      const active = btn.classList.toggle("is-active");
      const [on, off] = messages[id];
      if (window.toast) toast[active ? "success" : "info"](active ? on : off);
    });
  });

  const add = el("mdAdd");
  if (add) {
    add.addEventListener("click", () => {
      if (window.CollectionModal) {
        CollectionModal.open(currentTitle || "This movie");
      } else if (window.toast) {
        toast.soon("Add to Collection — Coming Soon!");
      }
    });
  }
}

// The Back link returns to the previous page when there is in-app history.
function setupBack() {
  const back = el("mdBack");
  if (!back) return;
  back.addEventListener("click", (e) => {
    if (window.history.length > 1 && document.referrer) {
      e.preventDefault();
      window.history.back();
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  setupActions();
  setupBack();

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
