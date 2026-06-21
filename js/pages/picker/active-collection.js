// active-collection.js — resolves the ONE collection the games play from.
//
// The collection is chosen on the collection page, which links to
// picker.html?collection=<id>. There's no in-app dropdown: the picker simply
// plays from whichever collection sent the user here. We read that id (and keep
// the last one in sessionStorage so returning from a game — whose Back / Play
// Again links don't carry the param — still works), fetch the full collection
// once, and share it with whichever game setup needs it (wheel + chopping both
// run on picker.html, so this avoids a duplicate GET /api/collections/:id).

window.ActiveCollection = (function () {
  const SS_KEY = "mk:activeCollection";
  let promise = null;

  // Remember the chosen collection in BOTH session- and localStorage. Session
  // covers in-tab hops (Back / Play Again links that drop the ?collection param);
  // local covers a fresh tab or a direct visit to the picker/wheel afterwards, so
  // the games don't wrongly report "Open a collection…" once one has been picked.
  function remember(id) {
    try { sessionStorage.setItem(SS_KEY, id); } catch (_) {}
    try { localStorage.setItem(SS_KEY, id); } catch (_) {}
  }

  // The active collection id: the ?collection= param wins (and is remembered);
  // otherwise fall back to the last one we played (this tab, then any tab).
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

  // Fetch the full collection (with movies) once; resolves null when there's no
  // collection to play from. A 401 bounces to login like the rest of the app.
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
