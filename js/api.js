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
    // The TMDB proxy backend. Change this ONE constant to point at a deployed
    // URL (e.g. a Render instance) later — nothing else needs to change.
    const API_BASE = "https://movieknight-server.onrender.com";

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
    }
    function isLoggedIn() {
        return !!getToken();
    }

    // ==========================================
    // 1. LOW-LEVEL REQUEST HELPER
    // ==========================================
    // One fetch wrapper so every call gets the same JSON parsing and error
    // handling. `path` is relative to API_BASE, e.g. "/movies/search".
    // Any non-2xx is treated as a failure; the backend's { error: "..." }
    // body is surfaced as the thrown message when present.
    async function request(path, { params, body, headers, ...options } = {}) {
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
        } catch (networkErr) {
            // Server down / CORS / offline — give a clear, user-facing reason.
            throw new Error("Can't reach the movie server. Is the backend running?");
        }

        if (!res.ok) {
            let message = `Request failed (HTTP ${res.status})`;
            try {
                const body = await res.json();
                // contract error shape: { ok: false, error }
                if (body && body.error) message = body.error;
            } catch {
                /* non-JSON error body — keep the generic message */
            }
            throw new Error(message);
        }

        const json = await res.json();
        // API contract envelope: { ok: true, data } / { ok: false, error }.
        // Unwrap to the inner `data` so the normalisers below see the payload
        // directly. Bare/legacy responses (array or object) pass through as-is.
        if (json && typeof json === "object" && !Array.isArray(json) && "ok" in json) {
            if (!json.ok) {
                throw new Error(json.error || `Request failed (HTTP ${res.status})`);
            }
            return json.data;
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

        return {
            // id is kept so a movie card can link to its details page.
            id: m.id ?? null,
            title: m.title || m.name || "",
            rating: m.rating ?? m.vote_average ?? 0,
            popularity: m.popularity ?? 0,
            releaseYear: releaseYear || "",
            posterPath: posterPath || "",
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
    //     sort:      "rating_desc", // server-side sort  -> sort
    //     page:      2,             // -> page
    //   }
    async function searchMovies(params = {}) {
        if (typeof params === "string") params = { q: params };
        const {
            q, genres, yearFrom, yearTo, minRating, sort, page,
            with_cast, with_crew, minVotes, language,
        } = params;

        const qp = {};
        if (q) qp.q = q;
        if (Array.isArray(genres) && genres.length) qp.genre = genres.join(",");
        if (yearFrom) qp.yearFrom = yearFrom;
        if (yearTo) qp.yearTo = yearTo;
        if (minRating) qp.minRating = minRating;
        if (sort) qp.sort = sort;
        if (page) qp.page = page;
        // Person filtering: cast for actors, crew for everyone else.
        if (with_cast) qp.with_cast = with_cast;
        if (with_crew) qp.with_crew = with_crew;
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

    return {
        API_BASE,
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
    };
})();
