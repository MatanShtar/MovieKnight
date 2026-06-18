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
    const API_BASE = "http://localhost:3000";

    // The backend returns bare TMDB paths (poster_path / logo_path) like
    // "/abc.jpg"; images must be prefixed with this CDN base + size to load.
    const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";

    // ==========================================
    // 1. LOW-LEVEL REQUEST HELPER
    // ==========================================
    // One fetch wrapper so every call gets the same JSON parsing and error
    // handling. `path` is relative to API_BASE, e.g. "/movies/search".
    // Any non-2xx is treated as a failure; the backend's { error: "..." }
    // body is surfaced as the thrown message when present.
    async function request(path, { params, ...options } = {}) {
        const url = new URL(API_BASE + path);
        if (params) {
            Object.entries(params).forEach(([k, v]) => {
                if (v !== undefined && v !== null && v !== "") {
                    url.searchParams.set(k, v);
                }
            });
        }

        let res;
        try {
            res = await fetch(url, {
                headers: { Accept: "application/json" },
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
                if (body && body.error) message = body.error;
            } catch {
                /* non-JSON error body — keep the generic message */
            }
            throw new Error(message);
        }

        return res.json();
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
            title: m.title || m.name || "",
            rating: m.rating ?? m.vote_average ?? 0,
            popularity: m.popularity ?? 0,
            releaseYear: releaseYear || "",
            posterPath: posterPath || "",
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

    // The movie grid. Called with no filters it returns the popular feed; with
    // filters it returns a filtered catalog. `filters` is a plain object of the
    // user's selections — this maps them to TMDB-native discover params. Each
    // param is sent only when actually set, so an empty `filters` produces no
    // query string at all (popular feed).
    //
    //   filters = {
    //     genres:    [28, 12],   // genre ids        -> with_genres (comma)
    //     providers: [8, 9],     // provider ids     -> with_watch_providers (pipe) + watch_region=US
    //     yearFrom:  2000,       // -> primary_release_date.gte = 2000-01-01
    //     yearTo:    2024,       // -> primary_release_date.lte = 2024-12-31
    //     minRating: 7,          // 0-10             -> vote_average.gte
    //   }
    async function getMovies(filters = {}) {
        const params = {};
        const { genres, providers, yearFrom, yearTo, minRating } = filters;

        if (Array.isArray(genres) && genres.length) {
            params.with_genres = genres.join(",");
        }
        if (Array.isArray(providers) && providers.length) {
            params.with_watch_providers = providers.join("|");
            params.watch_region = "US"; // required by TMDB alongside providers
        }
        if (yearFrom) params["primary_release_date.gte"] = `${yearFrom}-01-01`;
        if (yearTo) params["primary_release_date.lte"] = `${yearTo}-12-31`;
        if (minRating) params["vote_average.gte"] = minRating;
        if (filters.page) params.page = filters.page; // TMDB paginates 20/page

        // request() feeds these to URLSearchParams (single, correct encoding —
        // the dotted keys and the "|" / "," separators are not double-encoded).
        const data = await request("/movies", { params });
        return extractList(data, "movies").map(normalizeMovie).filter(Boolean);
    }

    // Full-text search. Used by the wheel's "add a movie" box and the home search.
    async function searchMovies(query) {
        if (!query || !query.trim()) return [];
        const data = await request("/movies/search", {
            params: { query: query.trim() },
        });
        return extractList(data, "movies").map(normalizeMovie).filter(Boolean);
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

    return {
        API_BASE,
        getMovies,
        searchMovies,
        getRandomMovie,
        getGenres,
        getProviders,
    };
})();
