// library-buttons.js — shared logic for the heart (→ Favorites) and eye (→ Already
// Watched) buttons on the home feed AND the movie page.
//
// Membership comes from ONE cached request (MovieAPI.getLibrary, ?isDefault=true).
// Toggling adds/removes the movie in the matching default list, mutates the live
// id-Set so every button stays in sync, and shows the colored toast (green add /
// orange remove). Each page passes a `paint(on)` callback for its own button DOM,
// so the optimistic-flip + revert-on-error + toast contract lives in one place
// instead of being copy-pasted into home.js and movie.js.
window.LibraryButtons = (function () {
  const LABELS = { favorites: "Favorites", watched: "Already Watched" };

  // Tooltip text for a button given its list + current membership.
  function title(which, on) {
    return `${on ? "Remove from" : "Add to"} "${LABELS[which]}"`;
  }

  // The user's default-list library (cached), or null when logged out / failed.
  async function load() {
    if (!window.MovieAPI || !MovieAPI.isLoggedIn || !MovieAPI.isLoggedIn()) return null;
    try {
      return await MovieAPI.getLibrary();
    } catch {
      return null;
    }
  }

  // Optimistically add/remove `movieId` in the `which` default list. `paint(on)`
  // updates the caller's button to the new state; on failure it's called again to
  // revert. Returns nothing — the toast + button are the feedback.
  async function toggle(which, movieId, paint) {
    const library = await load();
    const lib = library && library[which];
    if (!lib || !movieId) {
      if (window.toast) toast.error("Couldn't update — please try again.");
      return;
    }
    const adding = !lib.ids.has(movieId);
    paint(adding); // optimistic
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
      paint(!adding); // revert
      if (window.toast) toast.error(err.message || "Something went wrong.");
    }
  }

  return { title, load, toggle };
})();
