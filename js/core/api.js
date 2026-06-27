// window.MovieAPI - the only place the frontend talks to the backend; load (defer) before page scripts that use it.

window.MovieAPI = (function () {
    // override via localStorage "mk:apiBase"
    const DEPLOYED_API = "https://movieknight-server-7d8h.onrender.com";
    const LOCAL_API = "http://localhost:3000";
    const API_BASE =
        localStorage.getItem("mk:apiBase") ||
        (["localhost", "127.0.0.1", ""].includes(location.hostname)
            ? LOCAL_API
            : DEPLOYED_API);

    const API_PREFIX = "/api";

    // backend returns bare TMDB paths; prefix with CDN base + size to load
    const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
    const TMDB_BACKDROP_BASE = "https://image.tmdb.org/t/p/w1280";

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
        // drop cached AI picks so they don't linger for the next user
        localStorage.removeItem("mk:aiResults");
    }
    function isLoggedIn() {
        return !!getToken();
    }

    // swap a long/multi-line message for a brief status-based line so the UI never shows a wall of text
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

    // full-screen "server down" curtain when fetch can't reach the backend. lives here
    // (not common.js) so it also covers login/signup, which skip the shared shell.
    const MAINT_QUOTES = [
        "We'll be back. — our server took that line a little too literally.",
        "Intermission! Grab some popcorn while we change the reel.",
        "Houston, the server has a problem. We're working the checklist.",
        "The projector jammed mid-reel. Our crew is splicing it back together.",
        "The server's sleeping with the fishes. We're reviving it now.",
        "Roads? Where we're going, we just need the server back online.",
        "Our server wandered off to the dark side. We're restoring balance.",
        "Plot twist: the server needs a quick reboot. Stay tuned.",
        "Frankly, my dear, the server's having a moment. Back shortly.",
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

    // single fetch wrapper; any non-2xx throws, backend { error } surfaced via shortError
    async function request(path, { params, body, headers, returnEnvelope, ...options } = {}) {
        const url = new URL(API_BASE + API_PREFIX + path);
        if (params) {
            Object.entries(params).forEach(([k, v]) => {
                if (v !== undefined && v !== null && v !== "") {
                    url.searchParams.set(k, v);
                }
            });
        }

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
            // still throw so in-flight callers stop their own loading state
            try { showServerDownCurtain(); } catch (_) {}
            throw new Error("Can't reach the movie server. Is the backend running?");
        }

        if (!res.ok) {
            let rawMessage = "";
            let rawCode = "";
            try {
                const errorBody = await res.json();
                if (errorBody && errorBody.error) rawMessage = String(errorBody.error);
                if (errorBody && errorBody.code) rawCode = String(errorBody.code);
            } catch {
                /* non-JSON body - shortError falls back to a status line */
            }
            // expose status + code so callers can branch (e.g. 404 = private/missing,
            // or tell a quota 429 apart from an upstream rate-limit 429)
            const err = new Error(shortError(rawMessage, res.status));
            err.status = res.status;
            if (rawCode) err.code = rawCode;
            throw err;
        }

        const json = await res.json();
        // unwrap the { ok, data } envelope; returnEnvelope keeps the whole object for
        // endpoints with sibling fields (e.g. AI actions return aiUsage)
        if (!json.ok) {
            throw new Error(shortError(json.error, res.status));
        }
        return returnEnvelope ? json : json.data;
    }

    // accepts the app's shape OR a raw TMDB movie, always returns the app's shape
    function normalizeMovie(m) {
        if (!m) return null;

        let posterPath = m.posterPath;
        if (!posterPath && m.poster_path) {
            posterPath = TMDB_IMAGE_BASE + m.poster_path;
        }

        let releaseYear = m.releaseYear;
        if (!releaseYear && m.release_date) {
            releaseYear = Number(String(m.release_date).slice(0, 4));
        }

        // genres arrive 3 ways: TMDB lists use numeric genre_ids, details use
        // [{id,name}], our cache stores name strings. capture ids and names so a
        // filter can match on either.
        const genreIds = [];
        const genres = [];
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
                // a string: numeric id as text, or a genre name
                const n = Number(g);
                if (Number.isFinite(n) && String(g).trim() === String(n)) genreIds.push(n);
                else genres.push(String(g));
            }
        });

        // US flatrate provider ids, so the wheel/chopping picker can filter by service
        let providerIds = [];
        if (Array.isArray(m.provider_ids)) providerIds = m.provider_ids;
        else if (Array.isArray(m.providerIds)) providerIds = m.providerIds;
        providerIds = providerIds.filter((x) => x != null).map(Number);

        return {
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

    // backend may answer with a bare array or { movies: [...] }
    function extractList(data, key) {
        if (Array.isArray(data)) return data;
        if (data && Array.isArray(data[key])) return data[key];
        if (data && Array.isArray(data.results)) return data.results; // raw TMDB
        return [];
    }

    // home grid: text search + filters + sort all go through /movies/search.
    // a bare string is treated as just the text query.
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
        // sortBy is a semantic intent name, NOT a TMDB sort string; server owns the mapping
        if (sort) qp.sortBy = sort;
        if (page) qp.page = page;
        if (with_cast) qp.with_cast = with_cast;
        if (with_crew) qp.with_crew = with_crew;
        if (Array.isArray(providers) && providers.length) {
            const pids = providers.map(Number).filter(Number.isFinite);
            if (pids.length) qp.providers = pids.join(",");
        }
        // TMDB ignores certification without a country, so pair it with US
        if (certification) {
            qp.certification = certification;
            qp.certification_country = "US";
        }
        // default-feed quality guards; only the empty-query feed sets these
        if (minVotes) qp.minVotes = minVotes;
        if (language) qp.language = language;

        const data = await request("/movies/search", { params: qp });
        return extractList(data, "movies").map(normalizeMovie).filter(Boolean);
    }

    async function getMovieDetails(id) {
        const data = await request(`/movies/${encodeURIComponent(id)}`);
        return normalizeDetails(data);
    }

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

    // seeds the actor/director dropdowns before the user types
    async function getPopularPeople() {
        const data = await request("/people/popular");
        return extractList(data, "people").map(normalizePerson).filter(Boolean);
    }

    // server owns the randomization; backend may answer with a bare movie, { movie }, or a one-item list
    async function getRandomMovie(pages) {
        const data = await request("/movies/random", { params: { pages } });
        const list = extractList(data, "movies");
        const raw = list.length ? list[0] : data && data.movie ? data.movie : data;
        return normalizeMovie(raw);
    }

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
                          logo:
                              p.logo ||
                              (p.logo_path ? TMDB_IMAGE_BASE + p.logo_path : ""),
                      },
            )
            .filter((p) => p.name);
    }

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

    async function me() {
        const data = await request("/auth/me");
        if (data && data.user) setSession(null, data.user);
        return data ? data.user : null;
    }

    function logout() {
        clearSession();
    }

    async function updateProfile(fields) {
        const data = await request("/users/me", { method: "PATCH", body: fields });
        if (data && data.user) setSession(null, data.user);
        return data ? data.user : null;
    }

    // backend stores BARE TMDB paths; absolute/data URLs pass through untouched
    function toPosterUrl(path) {
        if (!path) return "";
        if (/^(https?:)?\/\//i.test(path) || /^data:/i.test(path)) return path;
        return TMDB_IMAGE_BASE + path;
    }
    // lighter width for thumbnail-size cover backdrops
    const TMDB_COVER_BACKDROP_BASE = "https://image.tmdb.org/t/p/w780";
    function toCoverBackdropUrl(path) {
        if (!path) return "";
        if (/^(https?:)?\/\//i.test(path) || /^data:/i.test(path)) return path;
        return TMDB_COVER_BACKDROP_BASE + path;
    }

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
            // both image URLs per cover so buildCollectionCover can pick poster or backdrop per layout
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

    // card meta + joined movies, each keeping addedAt/sortOrder for client sorts
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

    async function listCollections() {
        const data = await request("/collections");
        const list = Array.isArray(data) ? data : extractList(data, "collections");
        return list.map(normalizeCollectionCard).filter(Boolean);
    }

    // 404 (missing OR private-and-not-yours) throws err.status === 404 for the page to redirect
    async function getCollection(id) {
        const data = await request(`/collections/${encodeURIComponent(id)}`);
        return normalizeCollectionFull(data);
    }

    // with no name the server auto-names it
    async function createCollection(name) {
        const data = await request("/collections", {
            method: "POST",
            body: { name },
        });
        return normalizeCollectionCard(data);
    }

    async function updateCollection(id, fields) {
        const data = await request(`/collections/${encodeURIComponent(id)}`, {
            method: "PATCH",
            body: fields,
        });
        return normalizeCollectionCard(data);
    }

    // defaults are undeletable (400)
    async function deleteCollection(id) {
        return request(`/collections/${encodeURIComponent(id)}`, { method: "DELETE" });
    }

    // idempotent add; returns the full collection
    async function addMovieToCollection(id, tmdbId) {
        const data = await request(`/collections/${encodeURIComponent(id)}/movies`, {
            method: "POST",
            body: { tmdbId },
        });
        return normalizeCollectionFull(data);
    }

    async function removeMovieFromCollection(id, tmdbId) {
        const data = await request(
            `/collections/${encodeURIComponent(id)}/movies/${encodeURIComponent(tmdbId)}`,
            { method: "DELETE" }
        );
        return normalizeCollectionFull(data);
    }

    // Favorites / Already Watched / Watchlist with member tmdb-id Sets, fetched once
    // and cached. the Sets are live - toggling mutates them in place so cards stay in sync.
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

    // coerce mixed ids (movies/numbers/strings) into unique ints for the AI exclude_ids filter
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

    // exclude_ids is a SOFT reroll filter; backend may still reuse some to reach 3, so callers dedupe
    async function aiPicker({ collectionId, prompt, count, exclude_ids } = {}) {
        const body = { collectionId, prompt, count };
        const exclude = toExcludeIds(exclude_ids);
        if (exclude.length) body.exclude_ids = exclude;
        try {
            // returnEnvelope to read aiUsage for the badge, no separate round-trip
            const env = await request("/ai/picker", { method: "POST", body, returnEnvelope: true });
            if (env) cacheAiUsage(env.aiUsage);
            return extractList(env && env.data, "movies")
                .map((m) => {
                    const n = normalizeMovie(m);
                    return n ? { ...n, reason: m.reason || "" } : null;
                })
                .filter(Boolean);
        } catch (err) {
            // a 429 body carries no usage, so resync the authoritative count
            if (err && err.status === 429) refreshAiUsage();
            throw err;
        }
    }

    async function aiSearch(query, { exclude_ids } = {}) {
        const body = { query };
        const exclude = toExcludeIds(exclude_ids);
        if (exclude.length) body.exclude_ids = exclude;
        try {
            const env = await request("/ai/search", { method: "POST", body, returnEnvelope: true });
            if (env) cacheAiUsage(env.aiUsage);
            return extractList(env && env.data, "movies").map(normalizeMovie).filter(Boolean);
        } catch (err) {
            // a 429 body carries no usage, so resync the authoritative count
            if (err && err.status === 429) refreshAiUsage();
            throw err;
        }
    }

    // reroll passes both: exclude_ids (HARD, never returned) and exclude_titles (fed
    // into the prompt; the model deals in titles, so this is what truly stops repeats)
    async function aiEnhance(collectionId, { exclude_ids, exclude_titles } = {}) {
        const body = {};
        const exclude = toExcludeIds(exclude_ids);
        if (exclude.length) body.exclude_ids = exclude;
        if (Array.isArray(exclude_titles)) {
            const titles = exclude_titles.map((t) => String(t || "").trim()).filter(Boolean);
            if (titles.length) body.exclude_titles = titles;
        }
        try {
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
            // a 429 body carries no usage, so resync the authoritative count
            if (err && err.status === 429) refreshAiUsage();
            throw err;
        }
    }

    // backend owns the AI daily limit and is the real guard; client reads count + limit
    // from aiUsage and never hard-codes the number.

    // code on the quota-exhausted 429 so the UI tells it apart from an upstream rate-limit 429
    const AI_LIMIT_CODE = "AI_LIMIT_REACHED";

    function aiUsage() {
        const user = getCurrentUser();
        const u = user && user.aiUsage;
        return u && typeof u === "object" ? u : null;
    }

    // cache usage on currentUser + fire mk:ai-usage so common.js updates the badge live
    function cacheAiUsage(usage) {
        if (!usage || typeof usage !== "object") return usage;
        const user = getCurrentUser();
        if (user) {
            user.aiUsage = usage;
            setSession(null, user);
        }
        try {
            window.dispatchEvent(new CustomEvent("mk:ai-usage", { detail: usage }));
        } catch (_) { /* CustomEvent unsupported - badge just won't live-update */ }
        return usage;
    }

    // from the cached user, no network. unknown -> Infinity so we never block before
    // the first refresh; the backend 429 is the real stop.
    function aiActionsRemaining() {
        const u = aiUsage();
        return u && Number.isFinite(u.remaining) ? u.remaining : Infinity;
    }

    // null until we've seen a usage payload; callers must tolerate null
    function aiActionsLimit() {
        const u = aiUsage();
        return u && Number.isFinite(u.limit) ? u.limit : null;
    }

    // shared "out of actions" message for the client-side pre-check; mirrors the 429 wording
    function aiLimitReachedMessage() {
        const limit = aiActionsLimit();
        return limit
            ? `You've used all ${limit} daily AI actions. They reset at midnight Pacific time.`
            : "You've used all your daily AI actions. They reset at midnight Pacific time.";
    }

    // resolves null when logged out
    async function getAiUsage() {
        if (!isLoggedIn()) return null;
        const data = await request("/ai/usage");
        return cacheAiUsage(data);
    }

    // fire-and-forget badge resync; never rejects
    function refreshAiUsage() {
        getAiUsage().catch(() => {});
    }

    // wheel is an ordered array of strings (titles / free-form entries), server-backed per collection

    // server uses wheelConfig (GET) or wheelConfig/saved (PUT)
    function extractWheel(data) {
        const list = data && (data.wheelConfig || data.saved);
        return Array.isArray(list) ? list.filter((s) => typeof s === "string") : [];
    }

    // distinct genre + provider ids that actually appear in this collection, so the
    // filter menu offers only matching options. providers are US-flatrate only, so a
    // non-streaming collection legitimately returns availableProviders: [].
    async function getWheelFilters(collectionId) {
        const data = await request(`/collections/${encodeURIComponent(collectionId)}/wheel/filters`);
        const toIds = (arr) =>
            Array.isArray(arr) ? arr.map(Number).filter(Number.isFinite) : [];
        return {
            availableGenres: toIds(data && data.availableGenres),
            availableProviders: toIds(data && data.availableProviders),
        };
    }

    // [] if never saved; a private wheel you don't own throws err.status === 404
    async function getWheel(collectionId) {
        const data = await request(`/collections/${encodeURIComponent(collectionId)}/wheel`);
        return extractWheel(data);
    }

    // owner only (non-owner gets 404). cleans the list (trim, drop blanks, cap 100) to
    // match the server's own coercion.
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
        signup,
        login,
        me,
        logout,
        updateProfile,
        isLoggedIn,
        getCurrentUser,
        listCollections,
        getCollection,
        createCollection,
        updateCollection,
        deleteCollection,
        addMovieToCollection,
        removeMovieFromCollection,
        getLibrary,
    };
})();
