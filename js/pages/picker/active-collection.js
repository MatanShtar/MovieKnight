// resolves the one collection the games play from, fetched once and shared so wheel
// + chopping avoid a duplicate GET /api/collections/:id.

window.ActiveCollection = (function () {
  const SS_KEY = "mk:activeCollection";
  let promise = null;

  // session covers in-tab hops (Back drops the ?collection param); local covers a
  // fresh tab / direct visit afterwards.
  function remember(id) {
    try { sessionStorage.setItem(SS_KEY, id); } catch (_) {}
    try { localStorage.setItem(SS_KEY, id); } catch (_) {}
  }

  // ?collection= wins (and is remembered); else last played (session then local)
  function getId() {
    const fromUrl = new URLSearchParams(location.search).get("collection");
    if (fromUrl) {
      remember(fromUrl);
      return fromUrl;
    }
    try {
      return sessionStorage.getItem(SS_KEY) || localStorage.getItem(SS_KEY);
    } catch (_) {
      return null;
    }
  }

  // fetch once; resolves null when there's none to play, 401 bounces to login
  function load() {
    if (promise) return promise;
    const id = getId();
    if (!id) {
      promise = Promise.resolve(null);
      return promise;
    }
    promise = MovieAPI.getCollection(id).catch((err) => {
      if (err && err.status === 401) {
        window.location.replace("login.html");
        return null;
      }
      throw err;
    });
    return promise;
  }

  return { getId, load };
})();
