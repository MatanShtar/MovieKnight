// api.js — the single place the frontend talks to the live backend.
//
// Everything that used to read from data/movies.json now goes through
// window.MovieAPI instead. Load this file (defer) BEFORE the page script
// that uses it, the same way toast.js exposes window.toast:
//
//   <script src="js/api.js" defer></script>
//   <script src="js/home.js" defer></script>
//
// The backend is expected to proxy TMDB. These functions normalise whatever
// the backend returns into the shape the rest of the app already uses:
//   { title, rating, popularity, releaseYear, posterPath }
// so home.js / wheel.js need almost no other changes.

window.MovieAPI = (function () {
    // The backend base URL, chosen by where the client is being served from:
    //   • localhost / 127.0.0.1 / file:// (local dev)  → the local dev server on
    //     :3000, so un-deployed server changes (e.g. new endpoints) are visible
    //     while developing — run `npm run dev` in server/ first.
    //   • anything else (the deployed site)            → the deployed Render API.
    // To force one, set localStorage "mk:apiBase" to a URL (cleared = auto).
    const DEPLOYED_API = "https://movieknight-server-7d8h.onrender.com";
    const LOCAL_API = "http://localhost:3000";
    const API_BASE =
        localStorage.getItem("mk:apiBase") ||
        (["localhost", "127.0.0.1", ""].includes(location.hostname)
            ? LOCAL_API
            : DEPLOYED_API);

    // All endpoints live under the /api prefix per the API contract
    // (e.g. /api/movies/search, /api/movies/random).
    const API_PREFIX = "/api";

    // The backend returns bare TMDB paths (poster_path / logo_path) like
    // "/abc.jpg"; images must be prefixed with this CDN base + size to load.
    const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
    // Backdrops are wider stills — pull them at a larger width than posters.
    const TMDB_BACKDROP_BASE = "https://image.tmdb.org/t/p/w1280";

    // ==========================================
    // 0. AUTH SESSION (token + cached user in localStorage)
    // ==========================================
    // The JWT returned by /api/auth/(login|signup) is stored here and sent as a
    // Bearer token on every request. `currentUser` is the cached safe user object
    // the shared shell (common.js) reads to toggle the logged-in UI.
    const TOKEN_KEY = "authToken";
    const USER_KEY = "currentUser";

    function getToken() {
        return localStorage.getItem(TOKEN_KEY) || null;
    }
    function getCurrentUser() {
        try {
            return JSON.parse(localStorage.getItem(USER_KEY));
        } catch {
            return null;
        }
    }
    function setSession(token, user) {
        if (token) localStorage.setItem(TOKEN_KEY, token);
        if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    }
    function clearSession() {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        // Also drop the cached AI Picker results — they live in localStorage now
        // (so they survive a reload), so logout must clear them rather than letting
        // one user's picks linger for the next person on this browser.
        localStorage.removeItem("mk:aiResults");
    }
    function isLoggedIn() {
        return !!getToken();
    }

    // Keep user-facing error text SHORT. The backend already sanitises (its central
    // handler turns unexpected bugs into a generic "Server error" and never forwards
    // a raw TMDB/Gemini body), so a clean, brief message passes through untouched.
    // This is the hard guarantee the UI never shows a "full detail" wall of text: a
    // long or multi-line message is swapped for a brief, status-based line instead.
    const SHORT_ERROR_MAX = 120;
    function shortError(raw, status) {
        const msg = typeof raw === "string" ? raw.trim() : "";
        if (msg && msg.length <= SHORT_ERROR_MAX && !msg.includes("\n")) return msg;
        if (status >= 500) return "Something went wrong on the server. Please try again.";
        if (status === 429) return "Too many requests — give it a moment and try again.";
        if (status === 404) return "Not found.";
        if (status === 401 || status === 403) return "You’re not allowed to do that.";
        if (status === 400) return "That request wasn’t valid.";
        return `Request failed (HTTP ${status}).`;
    }

    // ==========================================
    // 0c. SERVER-DOWN MAINTENANCE CURTAIN
    // ==========================================
    // When a request can't reach the backend at all (the fetch throws — server not
    // running / offline), we drop a full-screen cinematic "We'll Be Back Soon"
    // curtain (the same red-velvet stage as the Coming Soon page, styled in
    // common.css) with a random movie-flavoured maintenance pun — mirroring how the
    // 404 page randomises its one-liner. This replaces the old fleeting toast; it's a
    // terminal state (no back button), since the app can't function without the
    // server. Lives here (not common.js) so it also covers the login/signup pages,
    // which load api.js but not the shared shell. Shown at most once per page.
    const MAINT_QUOTES = [
        "We'll be back. — our server took that line a little too literally.", // The Terminator
        "Intermission! Grab some popcorn while we change the reel.",
        "Houston, the server has a problem. We're working the checklist.", // Apollo 13
        "The projector jammed mid-reel. Our crew is splicing it back together.",
        "The server's sleeping with the fishes. We're reviving it now.", // The Godfather
        "Roads? Where we're going, we just need the server back online.", // Back to the Future
        "Our server wandered off to the dark side. We're restoring balance.", // Star Wars
        "Plot twist: the server needs a quick reboot. Stay tuned.",
        "Frankly, my dear, the server's having a moment. Back shortly.", // Gone with the Wind
        "This is the part where our ops team saves the day. Hang tight.",
        "The show isn't over — we're just resetting the stage.",
    ];
    let maintShown = false;
    function showServerDownCurtain() {
        if (maintShown || typeof document === "undefined" || !document.body) return;
        maintShown = true;
        document.body.classList.add("mk-maint-open");
        const stage = document.createElement("div");
        stage.className = "mk-maint";
        stage.setAttribute("role", "alertdialog");
        stage.setAttribute("aria-live", "assertive");
        stage.setAttribute("aria-label", "Service temporarily unavailable");
        // Build the structure; the random pun goes in via textContent (no HTML).
        stage.innerHTML =
            '<div class="mk-maint-curtain mk-maint-curtain--left"></div>' +
            '<div class="mk-maint-curtain mk-maint-curtain--right"></div>' +
            '<div class="mk-maint-valance"></div>' +
            '<div class="mk-maint-content">' +
            '<p class="mk-maint-eyebrow">Intermission</p>' +
            '<h1 class="mk-maint-title">We’ll Be Back Soon</h1>' +
            '<p class="mk-maint-copy"></p>' +
            "</div>";
        stage.querySelector(".mk-maint-copy").textContent =
            MAINT_QUOTES[Math.floor(Math.random() * MAINT_QUOTES.length)];
        document.body.appendChild(stage);
    }

    // ==========================================
    // 1. LOW-LEVEL REQUEST HELPER
    // ==========================================
    // One fetch wrapper so every call gets the same JSON parsing and error
    // handling. `path` is relative to API_BASE, e.g. "/movies/search".
    // Any non-2xx is treated as a failure; the backend's { error: "..." }
    // body is surfaced (shortened via shortError) as the thrown message.
    async function request(path, { params, body, headers, returnEnvelope, ...options } = {}) {
        const url = new URL(API_BASE + API_PREFIX + path);
        if (params) {
            Object.entries(params).forEach(([k, v]) => {
                if (v !== undefined && v !== null && v !== "") {
                    url.searchParams.set(k, v);
                }
            });
        }

        // Always accept JSON; attach the Bearer token when we have one (harmless
        // on public routes, required on protected ones); serialise a JSON body
        // and set Content-Type when one is supplied (POST/PUT/PATCH).
        const finalHeaders = { Accept: "application/json", ...(headers || {}) };
        const token = getToken();
        if (token) finalHeaders.Authorization = `Bearer ${token}`;
        if (body !== undefined && body !== null) {
            finalHeaders["Content-Type"] = "application/json";
            options.body = JSON.stringify(body);
        }

        let res;
        try {
            res = await fetch(url, {
                headers: finalHeaders,
                ...options,
            });
        } catch {
            // Server down / CORS / offline — drop the full-screen "We'll Be Back
            // Soon" maintenance curtain instead of a fleeting toast. Still throw so
            // any in-flight caller stops its own loading state; the curtain covers
            // the screen (and hides any toast) regardless.
            try { showServerDownCurtain(); } catch (_) {}
            throw new Error("Can't reach the movie server. Is the backend running?");
        }

        if (!res.ok) {
            let rawMessage = "";
            let rawCode = "";
            try {
                // Named `errorBody` to avoid shadowing the request `body` param.
                const errorBody = await res.json();
                // contract error shape: { ok: false, error, code? }
                if (errorBody && errorBody.error) rawMessage = String(errorBody.error);
                if (errorBody && errorBody.code) rawCode = String(errorBody.code);
            } catch {
                /* non-JSON error body — shortError falls back to a status line */
            }
            // Attach the HTTP status so callers can branch on it (e.g. a 404 from
            // GET /collections/:id means "private or missing" → redirect to 404.html).
            const err = new Error(shortError(rawMessage, res.status));
            err.status = res.status;
            // …and the machine-readable code when present, so callers can tell apart
            // same-status cases (e.g. a quota 429 vs an upstream rate-limit 429).
            if (rawCode) err.code = rawCode;
            throw err;
        }

        const json = await res.json();
        // API contract envelope: { ok: true, data } / { ok: false, error }.
        // Unwrap to the inner `data` so the normalisers below see the payload
        // directly. Bare/legacy responses (array or object) pass through as-is.
        // `returnEnvelope` keeps the whole object instead, for the few endpoints that
        // attach sibling fields beyond `data` (e.g. AI actions return `aiUsage`).
        if (json && typeof json === "object" && !Array.isArray(json) && "ok" in json) {
            if (!json.ok) {
                throw new Error(shortError(json.error, res.status));
            }
            return returnEnvelope ? json : json.data;
        }
        return json;
    }

    // ==========================================
    // 2. NORMALISERS
    // ==========================================
    // Accepts either the app's existing shape OR a raw TMDB movie and always
    // returns the app's shape. This makes the frontend resilient to whether
    // the backend pre-formats the data or just forwards TMDB.
    function normalizeMovie(m) {
        if (!m) return null;

        // posterPath: use it as-is if already a URL/path; otherwise build one
        // from TMDB's poster_path.
        let posterPath = m.posterPath;
        if (!posterPath && m.poster_path) {
            posterPath = TMDB_IMAGE_BASE + m.poster_path;
        }

        // releaseYear: prefer an explicit year, else slice TMDB's release_date.
        let releaseYear = m.releaseYear;
        if (!releaseYear && m.release_date) {
            releaseYear = Number(String(m.release_date).slice(0, 4));
        }

        // Genres — kept so the client can filter a fixed movie pool by genre (e.g.
        // the Spin-the-Wheel picker). These arrive in different shapes depending on
        // the source: TMDB list payloads use numeric `genre_ids`; the TMDB details
        // shape uses `genres: [{ id, name }]`; and OUR backend's movie cache stores
        // `genres: ["Action", "Drama"]` (plain name strings). Capture whichever of
        // ids / names we can so a filter can match on either vocabulary.
        const genreIds = [];
        const genres = []; // names (lower-cased downstream as needed)
        const rawGenres = Array.isArray(m.genre_ids)
            ? m.genre_ids
            : Array.isArray(m.genreIds)
            ? m.genreIds
            : Array.isArray(m.genres)
            ? m.genres
            : [];
        rawGenres.forEach((g) => {
            if (g == null) return;
            if (typeof g === "object") {
                if (g.id != null) genreIds.push(Number(g.id));
                if (g.name) genres.push(String(g.name));
            } else if (typeof g === "number") {
                genreIds.push(g);
            } else {
                // A string: either a numeric id as text, or a genre name.
                const n = Number(g);
                if (Number.isFinite(n) && String(g).trim() === String(n)) genreIds.push(n);
                else genres.push(String(g));
            }
        });

        // Provider ids — US flatrate (streaming) watch-provider ids. The backend
        // embeds these (and genre_ids) on each collection item, hydrated from TMDB
        // at add-time, so the wheel/chopping picker can filter a collection by
        // streaming service. Items added before that change read as [] until re-added.
        let providerIds = [];
        if (Array.isArray(m.provider_ids)) providerIds = m.provider_ids;
        else if (Array.isArray(m.providerIds)) providerIds = m.providerIds;
        providerIds = providerIds.filter((x) => x != null).map(Number);

        return {
            // id is kept so a movie card can link to its details page.
            id: m.id ?? null,
            title: m.title || m.name || "",
            rating: m.rating ?? m.vote_average ?? 0,
            popularity: m.popularity ?? 0,
            releaseYear: releaseYear || "",
            posterPath: posterPath || "",
            genreIds,
            genres,
            providerIds,
        };
    }

    // The Movie Details page payload from GET /api/movies/:id. Builds full image
    // URLs and a year, and passes through the richer fields (overview, genres,
    // director, cast, trailer) the details screen renders.
    function normalizeDetails(d) {
        if (!d) return null;
        let posterPath = d.posterPath;
        if (!posterPath && d.poster_path) posterPath = TMDB_IMAGE_BASE + d.poster_path;
        let backdropPath = d.backdropPath;
        if (!backdropPath && d.backdrop_path) backdropPath = TMDB_BACKDROP_BASE + d.backdrop_path;
        let releaseYear = d.releaseYear;
        if (!releaseYear && d.release_date) {
            releaseYear = Number(String(d.release_date).slice(0, 4)) || "";
        }
        return {
            id: d.id ?? null,
            title: d.title || "",
            releaseYear: releaseYear || "",
            overview: d.overview || "",
            tagline: d.tagline || "",
            runtime: d.runtime || null,
            rating: d.rating ?? d.vote_average ?? 0,
            posterPath: posterPath || "",
            backdropPath: backdropPath || "",
            genres: Array.isArray(d.genres) ? d.genres : [],
            director: d.director || "",
            cast: Array.isArray(d.cast) ? d.cast : [],
            trailerKey: d.trailerKey || null,
        };
    }

    // The backend may answer with either a bare array or { movies: [...] }.
    function extractList(data, key) {
        if (Array.isArray(data)) return data;
        if (data && Array.isArray(data[key])) return data[key];
        if (data && Array.isArray(data.results)) return data.results; // raw TMDB
        return [];
    }

    // ==========================================
    // 3. PUBLIC API
    // ==========================================

    // The home grid's single source of truth: text search + filters + sort all
    // go through GET /api/movies/search. Accepts a query object built from the UI
    // state; a bare string is still accepted as just the text query.
    //
    //   params = {
    //     q:         "dune",        // text query        -> q
    //     genres:    [28, 12],      // genre ids         -> genre (comma)
    //     yearFrom:  2000,          // -> yearFrom
    //     yearTo:    2024,          // -> yearTo
    //     minRating: 7,             // 0-10              -> minRating
    //     sort:      "rating_desc", // semantic sort intent -> sortBy (canonical)
    //     page:      2,             // -> page
    //     providers: [8, 9],        // TMDB provider ids -> providers (comma)
    //     certification: "PG-13",   // TMDB age rating   -> certification
    //   }
    async function searchMovies(params = {}) {
        if (typeof params === "string") params = { q: params };
        const {
            q, genres, yearFrom, yearTo, minRating, sort, page,
            with_cast, with_crew, minVotes, language,
            providers, certification,
        } = params;

        const qp = {};
        if (q) qp.q = q;
        if (Array.isArray(genres) && genres.length) qp.genre = genres.join(",");
        if (yearFrom) qp.yearFrom = yearFrom;
        if (yearTo) qp.yearTo = yearTo;
        if (minRating) qp.minRating = minRating;
        // The backend's canonical sort param is `sortBy` (a semantic intent name
        // like "popularity"/"trending" — NOT a TMDB sort string; the server owns
        // the mapping). It still accepts legacy `sort`, but `sortBy` is what we send.
        if (sort) qp.sortBy = sort;
        if (page) qp.page = page;
        // Person filtering: cast for actors, crew for everyone else.
        if (with_cast) qp.with_cast = with_cast;
        if (with_crew) qp.with_crew = with_crew;
        // Streaming-provider filter: comma-separated numeric TMDB provider ids
        // (OR semantics, e.g. providers=8,9). Same vocabulary the wheel uses.
        if (Array.isArray(providers) && providers.length) {
            const pids = providers.map(Number).filter(Number.isFinite);
            if (pids.length) qp.providers = pids.join(",");
        }
        // Age-rating filter: a single TMDB certification (e.g. "PG-13", "R").
        // TMDB ignores `certification` unless a country is given too, so always
        // pair it with the US certification system the values come from.
        if (certification) {
            qp.certification = certification;
            qp.certification_country = "US";
        }
        // Default-feed quality guards (vote count floor + language); only the
        // empty-query feed sets these, so a real text search stays unrestricted.
        if (minVotes) qp.minVotes = minVotes;
        if (language) qp.language = language;

        const data = await request("/movies/search", { params: qp });
        return extractList(data, "movies").map(normalizeMovie).filter(Boolean);
    }

    // Full details for one movie (GET /api/movies/:id) for the details page.
    async function getMovieDetails(id) {
        const data = await request(`/movies/${encodeURIComponent(id)}`);
        return normalizeDetails(data);
    }

    // People autocomplete for the Actor / Director filter. Returns
    // { id, name, department } where department is TMDB's known_for_department.
    function normalizePerson(p) {
        if (!p) return null;
        const id = p.id ?? p.person_id ?? null;
        const name = p.name || "";
        const department = p.known_for_department || p.department || "";
        if (!id || !name) return null;
        return { id, name, department };
    }

    async function searchPeople(query) {
        if (!query || !query.trim()) return [];
        const data = await request("/people/search", {
            params: { q: query.trim() },
        });
        return extractList(data, "people").map(normalizePerson).filter(Boolean);
    }

    // The "most popular" people used to seed the actor/director dropdowns before
    // the user types (the dropdown then live-searches via searchPeople()).
    async function getPopularPeople() {
        const data = await request("/people/popular");
        return extractList(data, "people").map(normalizePerson).filter(Boolean);
    }

    // A single random movie, used by the home "Surprise Me" button. The backend
    // may answer with a bare movie object, { movie: {...} }, or a one-item list —
    // all are accepted and normalised to the app's movie shape.
    async function getRandomMovie() {
        const data = await request("/movies/random");
        const list = extractList(data, "movies");
        const raw = list.length ? list[0] : data && data.movie ? data.movie : data;
        return normalizeMovie(raw);
    }

    // Genres as { id, name }. The id is needed to filter movies by genre.
    async function getGenres() {
        const data = await request("/genres");
        const list = extractList(data, "genres");
        return list
            .map((g) =>
                typeof g === "string"
                    ? { id: null, name: g }
                    : { id: g.id ?? null, name: g.name || "" },
            )
            .filter((g) => g.name);
    }

    // Watch providers as { id, name, logo }. The id (TMDB provider_id) is
    // needed to filter movies by streaming provider.
    async function getProviders() {
        const data = await request("/providers");
        const list = extractList(data, "providers");
        return list
            .map((p) =>
                typeof p === "string"
                    ? { id: null, name: p, logo: "" }
                    : {
                          id: p.id ?? p.provider_id ?? null,
                          name: p.name || p.provider_name || "",
                          // logo_path is the bare TMDB path; prefix it for display.
                          logo:
                              p.logo ||
                              (p.logo_path ? TMDB_IMAGE_BASE + p.logo_path : ""),
                      },
            )
            .filter((p) => p.name);
    }

    // ==========================================
    // 4. AUTH (signup / login / me / logout)
    // ==========================================
    // signup/login store the returned token + user and resolve with the user.
    // On failure they throw with the server's message (e.g. "An account with that
    // email already exists", "Invalid credentials") for the form to display.
    async function signup({ name, email, username, password, dateOfBirth }) {
        const data = await request("/auth/signup", {
            method: "POST",
            body: { name, email, username, password, dateOfBirth },
        });
        setSession(data.token, data.user);
        return data.user;
    }

    async function login(emailOrUsername, password) {
        const data = await request("/auth/login", {
            method: "POST",
            body: { emailOrUsername, password },
        });
        setSession(data.token, data.user);
        return data.user;
    }

    // Re-fetch the current user from the stored token (refreshes the cached copy).
    // Resolves null if there's no/invalid token.
    async function me() {
        const data = await request("/auth/me");
        if (data && data.user) setSession(null, data.user);
        return data ? data.user : null;
    }

    function logout() {
        clearSession();
    }

    // Update the signed-in user's own profile (e.g. bio). Persists via
    // PATCH /api/users/me and refreshes the cached user. Throws on failure.
    async function updateProfile(fields) {
        const data = await request("/users/me", { method: "PATCH", body: fields });
        if (data && data.user) setSession(null, data.user);
        return data ? data.user : null;
    }

    // ==========================================
    // 5. COLLECTIONS (CRUD + add/remove movie)
    // ==========================================
    // Backend stores BARE TMDB poster paths (e.g. "/abc.jpg"); the cover collage and
    // grid need full URLs. A custom cover (posterUrl) or an already-absolute/data URL
    // is passed through untouched.
    function toPosterUrl(path) {
        if (!path) return "";
        if (/^(https?:)?\/\//i.test(path) || /^data:/i.test(path)) return path;
        return TMDB_IMAGE_BASE + path;
    }
    // Backdrops for cover tiles are small — pull a lighter width than the full
    // movie-page backdrop (w1280) since these render at thumbnail size.
    const TMDB_COVER_BACKDROP_BASE = "https://image.tmdb.org/t/p/w780";
    function toCoverBackdropUrl(path) {
        if (!path) return "";
        if (/^(https?:)?\/\//i.test(path) || /^data:/i.test(path)) return path;
        return TMDB_COVER_BACKDROP_BASE + path;
    }

    // A collection "card" (profile grid): identity + visibility + up to 4 cover
    // posters (as full URLs) + counts. Likes/saves are deferred (always 0).
    function normalizeCollectionCard(c) {
        if (!c) return null;
        return {
            id: c.id,
            name: c.name || "",
            isDefault: !!c.isDefault,
            isPublic: !!c.isPublic,
            posterUrl: c.posterUrl ? toPosterUrl(c.posterUrl) : null,
            sort: c.sort || "added_desc",
            movieCount: c.movieCount || 0,
            // First ≤4 movies, each with BOTH image URLs so the cover generator can
            // pick poster or backdrop per layout/viewport (see buildCollectionCover).
            // This is the sole source for the cover — the backend always returns it.
            covers: (c.covers || []).map((x) => ({
                poster: toPosterUrl(x && x.poster),
                backdrop: toCoverBackdropUrl(x && x.backdrop),
            })),
            likesCount: c.likesCount || 0,
            savesCount: c.savesCount || 0,
            author: c.author || null,
            isOwner: c.isOwner !== false,
        };
    }

    // The full collection-page payload: the card meta + the joined movie objects
    // (each normalised to the app shape, keeping addedAt/sortOrder for client sorts).
    function normalizeCollectionFull(c) {
        if (!c) return null;
        return {
            id: c.id,
            name: c.name || "",
            isDefault: !!c.isDefault,
            isPublic: !!c.isPublic,
            posterUrl: c.posterUrl ? toPosterUrl(c.posterUrl) : null,
            sort: c.sort || "added_desc",
            author: c.author || null,
            authorId: c.authorId || null,
            isOwner: !!c.isOwner,
            movieCount: c.movieCount || 0,
            likesCount: c.likesCount || 0,
            savesCount: c.savesCount || 0,
            createdAt: c.createdAt || null,
            movies: (c.movies || [])
                .map((m) => {
                    const n = normalizeMovie(m);
                    if (!n) return null;
                    return { ...n, addedAt: m.addedAt || null, sortOrder: m.sortOrder || 0 };
                })
                .filter(Boolean),
        };
    }

    // GET /api/collections — the signed-in user's own collections (profile grid).
    async function listCollections() {
        const data = await request("/collections");
        const list = Array.isArray(data) ? data : extractList(data, "collections");
        return list.map(normalizeCollectionCard).filter(Boolean);
    }

    // GET /api/collections/:id — one collection + its movies. Works for a guest on a
    // PUBLIC collection (visitor mode). A 404 (missing OR private-and-not-yours) is
    // thrown with err.status === 404 so the page can redirect to 404.html.
    async function getCollection(id) {
        const data = await request(`/collections/${encodeURIComponent(id)}`);
        return normalizeCollectionFull(data);
    }

    // POST /api/collections — create a list. With no name the server auto-names it.
    async function createCollection(name) {
        const data = await request("/collections", {
            method: "POST",
            body: { name },
        });
        return normalizeCollectionCard(data);
    }

    // PATCH /api/collections/:id — rename and/or publish-toggle. Owner only.
    async function updateCollection(id, fields) {
        const data = await request(`/collections/${encodeURIComponent(id)}`, {
            method: "PATCH",
            body: fields,
        });
        return normalizeCollectionCard(data);
    }

    // DELETE /api/collections/:id — owner only; defaults are undeletable (400).
    async function deleteCollection(id) {
        return request(`/collections/${encodeURIComponent(id)}`, { method: "DELETE" });
    }

    // POST /api/collections/:id/movies — add a movie (idempotent). Returns the full
    // collection so the caller can repaint the grid + count.
    async function addMovieToCollection(id, tmdbId) {
        const data = await request(`/collections/${encodeURIComponent(id)}/movies`, {
            method: "POST",
            body: { tmdbId },
        });
        return normalizeCollectionFull(data);
    }

    // DELETE /api/collections/:id/movies/:tmdbId — remove a movie. Returns the full
    // collection.
    async function removeMovieFromCollection(id, tmdbId) {
        const data = await request(
            `/collections/${encodeURIComponent(id)}/movies/${encodeURIComponent(tmdbId)}`,
            { method: "DELETE" }
        );
        return normalizeCollectionFull(data);
    }

    // ---- Library (default lists) for the heart / eye buttons --------------------
    // The user's Favorites / Already Watched / Watchlist with their member tmdb-id
    // Sets, fetched ONCE (?isDefault=true) and cached. The Sets are live — toggling
    // a movie mutates them in place so every card stays in sync without a refetch.
    let _library = null;
    async function getLibrary({ refresh = false } = {}) {
        if (refresh) _library = null;
        if (!_library) {
            _library = (async () => {
                const cards = await request("/collections", { params: { isDefault: "true" } });
                const byName = {};
                (cards || []).forEach((c) => { byName[c.name] = c; });
                const mk = (c) =>
                    c ? { id: c.id, ids: new Set((c.movieIds || []).map(Number)) } : null;
                return {
                    favorites: mk(byName["Favorites"]),
                    watched: mk(byName["Already Watched"]),
                    watchlist: mk(byName["Watchlist"]),
                };
            })().catch((e) => {
                _library = null; // let the next call retry
                throw e;
            });
        }
        return _library;
    }

    // ==========================================
    // 7. AI (Gemini-backed picker + search)
    // ==========================================
    // Both go through the standard envelope: request() returns the inner `data`
    // on success and throws an Error (with err.status set) on { ok:false } / a
    // non-2xx, so callers can branch on 400/404/502/504 for tailored toasts.

    // Coerce a list of TMDB ids (movies, numbers, strings) into a clean array of
    // unique integers for the AI `exclude_ids` soft filter. Drops anything
    // non-numeric so the backend always receives integers (not strings/objects).
    function toExcludeIds(ids) {
        if (!Array.isArray(ids)) return [];
        const out = [];
        const seen = new Set();
        ids.forEach((x) => {
            const n = Number(typeof x === "object" && x ? x.id : x);
            if (Number.isFinite(n) && !seen.has(n)) {
                seen.add(n);
                out.push(n);
            }
        });
        return out;
    }

    // POST /api/ai/picker — "Let AI Choose". Body { collectionId, prompt, count,
    // exclude_ids? }. `exclude_ids` is a soft "don't repeat these" filter for a
    // reroll (an array of integer TMDB ids); the backend may still reuse some if
    // it would otherwise return fewer than 3, so callers must still dedupe.
    // `data` is [{ id, title, poster_path, reason... }]: TMDB-shaped movies with an
    // extra AI `reason`. Normalise to the app's movie shape but preserve `reason`.
    async function aiPicker({ collectionId, prompt, count, exclude_ids } = {}) {
        const body = { collectionId, prompt, count };
        const exclude = toExcludeIds(exclude_ids);
        if (exclude.length) body.exclude_ids = exclude;
        try {
            // returnEnvelope: read the `aiUsage` the endpoint already sends back (the
            // action it just spent) and update the badge from it — no separate
            // /ai/usage round-trip.
            const env = await request("/ai/picker", { method: "POST", body, returnEnvelope: true });
            if (env) cacheAiUsage(env.aiUsage);
            return extractList(env && env.data, "movies")
                .map((m) => {
                    const n = normalizeMovie(m);
                    return n ? { ...n, reason: m.reason || "" } : null;
                })
                .filter(Boolean);
        } catch (err) {
            // A 429 body carries no usage (it threw before spending), so on the rare
            // cache desync that lets one through, fetch the authoritative count.
            if (err && err.status === 429) refreshAiUsage();
            throw err;
        }
    }

    // POST /api/ai/search — natural-language search. Body { query, exclude_ids? }.
    // `exclude_ids` is the same soft reroll filter as aiPicker (integer TMDB ids).
    // `data` is an array of standard TMDB movie objects → normalise to the app's
    // movie shape so the existing card UI can render them unchanged.
    async function aiSearch(query, { exclude_ids } = {}) {
        const body = { query };
        const exclude = toExcludeIds(exclude_ids);
        if (exclude.length) body.exclude_ids = exclude;
        try {
            // returnEnvelope: read the `aiUsage` the endpoint already sends back and
            // update the badge from it — no separate /ai/usage round-trip.
            const env = await request("/ai/search", { method: "POST", body, returnEnvelope: true });
            if (env) cacheAiUsage(env.aiUsage);
            return extractList(env && env.data, "movies").map(normalizeMovie).filter(Boolean);
        } catch (err) {
            // A 429 body carries no usage (it threw before spending), so on the rare
            // cache desync that lets one through, fetch the authoritative count.
            if (err && err.status === 429) refreshAiUsage();
            throw err;
        }
    }

    // POST /api/ai/enhance/:id — "Enhance Collection". Recommends up to 3 movies
    // NOT already in the collection that fit its taste, each with an AI `reason`.
    // For a "Try Again" reroll the caller passes everything shown so far:
    //   • exclude_ids    — integer TMDB ids, the HARD filter (never returned again).
    //   • exclude_titles — the titles, fed into the prompt so the model itself avoids
    //     them (Gemini deals in titles, not ids, so this is what truly stops repeats).
    // `data` is TMDB-shaped movies + `reason`; normalise but keep `reason`.
    async function aiEnhance(collectionId, { exclude_ids, exclude_titles } = {}) {
        const body = {};
        const exclude = toExcludeIds(exclude_ids);
        if (exclude.length) body.exclude_ids = exclude;
        if (Array.isArray(exclude_titles)) {
            const titles = exclude_titles.map((t) => String(t || "").trim()).filter(Boolean);
            if (titles.length) body.exclude_titles = titles;
        }
        try {
            // returnEnvelope: read the `aiUsage` the endpoint already sends back (the
            // action it just spent) and update the badge from it — no extra round-trip.
            const env = await request(`/ai/enhance/${encodeURIComponent(collectionId)}`, {
                method: "POST", body, returnEnvelope: true,
            });
            if (env) cacheAiUsage(env.aiUsage);
            return extractList(env && env.data, "movies")
                .map((m) => {
                    const n = normalizeMovie(m);
                    return n ? { ...n, reason: m.reason || "" } : null;
                })
                .filter(Boolean);
        } catch (err) {
            // A 429 body carries no usage (it threw before spending), so on the rare
            // cache desync that lets one through, fetch the authoritative count.
            if (err && err.status === 429) refreshAiUsage();
            throw err;
        }
    }

    // ---- AI daily quota ---------------------------------------------------------
    // The header menu shows "AI Actions: N of LIMIT left". The BACKEND owns the limit
    // (services/aiQuota.js → DAILY_AI_LIMIT) and is the real guard (it 429s the
    // over-limit request); the client never hard-codes the number — it reads both the
    // count and the limit from the `aiUsage` payload the backend delivers (carried on
    // the cached currentUser via login/signup/me, refreshed from /ai/usage). So
    // changing the limit server-side updates everything here with no client change.

    // Error code the backend sends with the quota-exhausted 429 (services/aiQuota.js)
    // so the UI can tell it apart from an upstream rate-limit 429 of the same status.
    const AI_LIMIT_CODE = "AI_LIMIT_REACHED";

    // The cached usage object { used, remaining, limit }, or null if we've never seen
    // one (logged out, or a session cached before this feature shipped).
    function aiUsage() {
        const user = getCurrentUser();
        const u = user && user.aiUsage;
        return u && typeof u === "object" ? u : null;
    }

    // Store the latest usage on the cached currentUser and notify the shell so the
    // header badge updates live (common.js listens for "mk:ai-usage").
    function cacheAiUsage(usage) {
        if (!usage || typeof usage !== "object") return usage;
        const user = getCurrentUser();
        if (user) {
            user.aiUsage = usage;
            setSession(null, user);
        }
        try {
            window.dispatchEvent(new CustomEvent("mk:ai-usage", { detail: usage }));
        } catch (_) { /* CustomEvent unsupported — badge just won't live-update */ }
        return usage;
    }

    // Actions left today from the CACHED user (no network). Unknown → Infinity so we
    // never wrongly block before the first refresh — the backend 429 is the real stop.
    function aiActionsRemaining() {
        const u = aiUsage();
        return u && Number.isFinite(u.remaining) ? u.remaining : Infinity;
    }

    // The daily limit as reported by the backend, or null until we've seen a usage
    // payload. Callers that display it must tolerate null (show no number).
    function aiActionsLimit() {
        const u = aiUsage();
        return u && Number.isFinite(u.limit) ? u.limit : null;
    }

    // The single, shared "you're out of actions" message for the instant client-side
    // pre-check. Mirrors the backend's 429 wording; folds in the backend-provided
    // limit when known so the number is never hard-coded.
    function aiLimitReachedMessage() {
        const limit = aiActionsLimit();
        return limit
            ? `You've used all ${limit} daily AI actions. They reset at midnight Pacific time.`
            : "You've used all your daily AI actions. They reset at midnight Pacific time.";
    }

    // GET /api/ai/usage → { used, remaining, limit }. Refreshes the cache + badge.
    // Resolves null when logged out. Throws are the caller's to ignore (badge stale).
    async function getAiUsage() {
        if (!isLoggedIn()) return null;
        const data = await request("/ai/usage");
        return cacheAiUsage(data);
    }

    // Fire-and-forget badge resync (used after an AI action); never rejects.
    function refreshAiUsage() {
        getAiUsage().catch(() => {});
    }

    // (AI Picker session persistence was removed — the picker results page now caches
    // its picks in localStorage instead of a server-side session.)

    // ==========================================
    // 8. SPIN-THE-WHEEL PERSISTENCE (per collection, server-backed)
    // ==========================================
    // The wheel for a collection is stored on the server as an ordered array of
    // strings (movie titles / free-form entries). Both calls require auth (the
    // Bearer token request() already attaches). request() unwraps the { ok, data }
    // envelope and throws an Error with .status set, so callers branch on 401/404/5xx.

    // Pull the array of strings out of whichever key the server used (GET returns
    // `wheelConfig`; PUT returns the normalised list as `wheelConfig`/`saved`).
    function extractWheel(data) {
        const list = data && (data.wheelConfig || data.saved);
        return Array.isArray(list) ? list.filter((s) => typeof s === "string") : [];
    }

    // GET /api/collections/:id/wheel/filters — the distinct genre + provider TMDB
    // ids that ACTUALLY appear across this collection's movies, so the wheel's filter
    // menu can offer (and highlight) only what matches something. Envelope uses `ok`
    // (request() unwraps it); data is
    // { availableGenres: number[], availableProviders: number[] }. Provider ids are
    // US-flatrate only, so a collection of non-streaming titles legitimately returns
    // availableProviders: []. Always resolves clean integer arrays.
    async function getWheelFilters(collectionId) {
        const data = await request(`/collections/${encodeURIComponent(collectionId)}/wheel/filters`);
        const toIds = (arr) =>
            Array.isArray(arr) ? arr.map(Number).filter(Number.isFinite) : [];
        return {
            availableGenres: toIds(data && data.availableGenres),
            availableProviders: toIds(data && data.availableProviders),
        };
    }

    // GET /api/collections/:id/wheel — the saved wheel (or [] if never saved).
    // Owner sees theirs; a PUBLIC collection's wheel is readable by any logged-in
    // user; a PRIVATE collection you don't own throws err.status === 404.
    async function getWheel(collectionId) {
        const data = await request(`/collections/${encodeURIComponent(collectionId)}/wheel`);
        return extractWheel(data);
    }

    // PUT /api/collections/:id/wheel — save/overwrite the wheel (owner only; a
    // non-owner gets 404). Sends a cleaned list (trim, drop blanks, cap at 100) to
    // match the server's own coercion, and returns the server's normalised array.
    async function saveWheel(collectionId, wheelConfig) {
        const clean = (Array.isArray(wheelConfig) ? wheelConfig : [])
            .map((s) => String(s).trim())
            .filter(Boolean)
            .slice(0, 100);
        const data = await request(`/collections/${encodeURIComponent(collectionId)}/wheel`, {
            method: "PUT",
            body: { wheelConfig: clean },
        });
        const saved = extractWheel(data);
        return saved.length || clean.length === 0 ? saved : clean;
    }

    return {
        API_BASE,
        aiPicker,
        aiSearch,
        aiEnhance,
        getAiUsage,
        aiActionsRemaining,
        aiActionsLimit,
        aiLimitReachedMessage,
        AI_LIMIT_CODE,
        getWheel,
        saveWheel,
        getWheelFilters,
        searchMovies,
        getMovieDetails,
        searchPeople,
        getPopularPeople,
        getRandomMovie,
        getGenres,
        getProviders,
        // auth
        signup,
        login,
        me,
        logout,
        updateProfile,
        isLoggedIn,
        getToken,
        getCurrentUser,
        clearSession,
        // collections
        listCollections,
        getCollection,
        createCollection,
        updateCollection,
        deleteCollection,
        addMovieToCollection,
        removeMovieFromCollection,
        getLibrary,
        toPosterUrl,
    };
})();
