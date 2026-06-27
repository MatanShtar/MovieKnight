// shared heart/eye toggle (Favorites / Already Watched) for home + movie pages
window.LibraryButtons = (function () {
  const LABELS = { favorites: "Favorites", watched: "Already Watched" };

  function title(which, on) {
    return `${on ? "Remove from" : "Add to"} "${LABELS[which]}"`;
  }

  // null when logged out or load failed
  async function load() {
    if (!window.MovieAPI || !MovieAPI.isLoggedIn || !MovieAPI.isLoggedIn()) return null;
    try {
      return await MovieAPI.getLibrary();
    } catch {
      return null;
    }
  }

  // paint(on) flips the caller's button; called again to revert on failure
  async function toggle(which, movieId, paint) {
    const library = await load();
    const lib = library && library[which];
    if (!lib || !movieId) {
      if (window.toast) toast.error("Couldn't update — please try again.");
      return;
    }
    const adding = !lib.ids.has(movieId);
    paint(adding);
    try {
      if (adding) await MovieAPI.addMovieToCollection(lib.id, movieId);
      else await MovieAPI.removeMovieFromCollection(lib.id, movieId);
      if (adding) lib.ids.add(movieId);
      else lib.ids.delete(movieId);
      if (window.toast) {
        const msg = `${adding ? "Added to" : "Removed from"} ${LABELS[which]}`;
        adding ? toast.success(msg) : toast.warn(msg);
      }
    } catch (err) {
      paint(!adding);
      if (window.toast) toast.error(err.message || "Something went wrong.");
    }
  }

  return { title, load, toggle };
})();
