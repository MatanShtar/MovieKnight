const el = (id) => document.getElementById(id);

// ?back=<relative-url> pins where Back returns to. only relative urls, no open redirect.
(function applyBackContext() {
  const params = new URLSearchParams(location.search);
  const raw = params.get("back");
  const back = document.getElementById("mdBack");
  if (!back) return;

  // replace not push, else the target's own Back returns here and ping-pongs
  if (raw && !/^(?:[a-z]+:)?\/\//i.test(raw)) {
    back.setAttribute("href", raw);
    back.removeAttribute("data-back");
    back.addEventListener("click", (e) => {
      e.preventDefault();
      location.replace(raw);
    });
  }
  if (raw || params.get("from") === "ai") {
    back.classList.add("md-back--feature");
  }
})();

let currentTitle = "";

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
  const cached = readLastMovie();
  if (cached && cached.id) return cached.id;
  return null;
}

function getCachedBasics(id) {
  const cached = readLastMovie();
  if (cached && String(cached.id) === String(id)) return cached;
  return null;
}

function setBackdrop(url) {
  if (url) {
    document.documentElement.style.setProperty("--md-backdrop", `url("${url}")`);
  }
}

function titleWithYear(title, year) {
  return year ? `${title} (${year})` : title || "";
}

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

function paintDetails(d) {
  if (!d) return;

  currentTitle = d.title;
  el("mdTitle").textContent = titleWithYear(d.title, d.releaseYear);
  document.title = `MovieKnight | ${d.title}`;

  const poster = el("mdPoster");
  poster.src = d.posterPath || POSTER_PLACEHOLDER;
  poster.alt = d.title || "Movie poster";
  setBackdrop(d.backdropPath || d.posterPath);

  const director = el("mdDirector");
  director.textContent = d.director ? `Directed by ${d.director}` : "";
  director.style.display = d.director ? "" : "none";

  const overview = el("mdOverview");
  overview.textContent = d.overview || "";
  overview.style.display = d.overview ? "" : "none";

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

  const player = el("trailer-player");
  if (player) {
    if (d.trailerKey) {
      player.src = `https://www.youtube-nocookie.com/embed/${d.trailerKey}`;
      player.title = `${d.title} Trailer`;
      player.closest(".md-trailer").style.display = "";
    } else {
      player.removeAttribute("src");
      const wrap = player.closest(".md-trailer");
      if (wrap) wrap.style.display = "none";
    }
  }

  setupReadMore();
}

// Read more only shows when the full synopsis makes the page scroll. off on mobile.
let readMoreWired = false;
function setupReadMore() {
  const overview = el("mdOverview");
  const btn = el("mdReadMore");
  if (!overview || !btn) return;

  const isMobile = () => window.matchMedia("(max-width: 900px)").matches;
  let expanded = false;

  function sync() {
    if (isMobile()) {
      expanded = false;
      overview.classList.remove("is-clamped", "is-expanded");
      btn.hidden = true;
      return;
    }
    if (expanded) return; // don't collapse out from under the user

    // measure unclamped: if the page overflows, clamp and offer the toggle
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
    overview.classList.toggle("is-expanded", expanded);
    overview.classList.toggle("is-clamped", !expanded);
    btn.textContent = expanded ? "Read less" : "Read more";
  };

  // re-measure after late font/image reflow
  requestAnimationFrame(sync);
  setTimeout(sync, 200);
  if (!readMoreWired) {
    readMoreWired = true;
    window.addEventListener("resize", sync);
  }
}

const LIB_WHICH = { mdLike: "favorites", mdWatched: "watched" };

function paintActionBtn(id, on) {
  const btn = el(id);
  if (!btn) return;
  btn.classList.toggle("is-active", on);
  btn.dataset.tip = LibraryButtons.title(LIB_WHICH[id], on);
}

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
      if (window.requireAuth && !window.requireAuth()) return;
      LibraryButtons.toggle(LIB_WHICH[id], Number(getMovieId()), (on) =>
        paintActionBtn(id, on),
      );
    });
  });

  const add = el("mdAdd");
  if (add) {
    add.addEventListener("click", () => {
      if (window.requireAuth && !window.requireAuth()) return;
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
  markMovieLibrary();

  const id = getMovieId();

  // no id or malformed id (e.g. ?id=100s) -> 404 rather than a blank card
  if (!id || !/^\d+$/.test(String(id))) {
    window.location.replace("404.html");
    return;
  }

  paintBasics(getCachedBasics(id));

  try {
    const details = await MovieAPI.getMovieDetails(id);
    paintDetails(details);
  } catch (err) {
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
