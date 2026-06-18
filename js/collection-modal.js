// collection-modal.js — reusable "Add to Collection" modal.
//
// Triggered from a home movie card's "+" action or the Movie Details page.
// Backend collections don't exist yet, so this runs entirely on mock data:
// one existing collection ("Placeholder") with a 4-tile placeholder collage.
//
// Usage:
//   CollectionModal.open("Some Movie Title");
//
// The movie title is stored so the "New Collection" flow can name it in the
// success toast: "<Movie> added to <Collection>".

window.CollectionModal = (function () {
  // Mock collections shown in the grid — the six from the Figma frame, each with
  // a 2x2 poster collage. (No backend yet; the checked state is purely the UI
  // prep for the eventual handoff.) Order matches the Figma: the list flows
  // left-to-right, top-to-bottom across two columns.
  const P = "assets/images/posters/";
  const COLLECTIONS = [
    { name: "Watchlist", checked: false, posters: [
      P + "bugonia-movie-poster.webp", P + "one-battle-after-another-poster.webp",
      P + "ten-things-i-hate-about-you-poster.webp", P + "marty-supreme-poster.webp" ] },
    { name: "Favorites", checked: false, posters: [
      P + "the-dark-knight-poster.webp", P + "pulp-fiction-poster.webp",
      P + "parasite-poster.webp", P + "oppenheimer-poster.webp" ] },
    { name: "Already Watched", checked: false, posters: [
      P + "interstellar-poster.webp", P + "everything-everywhere-all-at-once-poster.webp",
      P + "whiplash-poster.webp", P + "spider-man-into-the-spider-verse-poster.webp" ] },
    { name: "Chick Flicks", checked: false, posters: [
      P + "la-la-land-poster.webp", P + "ten-things-i-hate-about-you-poster.webp",
      P + "the-substance-poster.webp", P + "housemaid-poster.webp" ] },
    { name: "Wheel 1", checked: false, posters: [
      P + "dune-part-two-poster.webp", P + "frankenstein-poster.webp",
      P + "the-dark-knight-poster.webp", P + "parasite-poster.webp" ] },
    { name: "Wheel 2", checked: false, posters: [
      P + "kill-bill-poster.webp", P + "housemaid-poster.webp",
      P + "interstellar-poster.webp", P + "pulp-fiction-poster.webp" ] },
  ];

  let overlay = null; // built lazily on first open
  let nameInput = null;
  let listEl = null; // the collection rows container (for resetting checks)
  let currentMovie = "This movie";
  let pushedState = false; // true while our history entry is on the stack

  // Build the modal DOM once and wire its interactions.
  function build() {
    overlay = document.createElement("div");
    overlay.className = "cm-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Add to collection");

    const panel = document.createElement("div");
    panel.className = "cm-panel";

    // Header
    const header = document.createElement("div");
    header.className = "cm-header";
    header.innerHTML = `
      <h2 class="cm-title">Add to Collection</h2>
      <button class="cm-close" type="button" aria-label="Close">&times;</button>`;

    // Collection list
    const list = document.createElement("div");
    list.className = "cm-list";
    COLLECTIONS.forEach((c) => list.appendChild(buildItem(c)));
    listEl = list;

    // Footer — new collection
    const footer = document.createElement("div");
    footer.className = "cm-footer";
    footer.innerHTML = `
      <label class="cm-newlabel" for="cmNewName">New Collection:</label>
      <div class="cm-newfield">
        <input id="cmNewName" class="cm-input" type="text"
               maxlength="40" autocomplete="off"
               aria-label="New collection name" />
      </div>
      <button class="cm-add" type="button" aria-label="Create collection">+</button>`;

    panel.append(header, list, footer);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    nameInput = footer.querySelector("#cmNewName");

    // --- interactions ---
    header.querySelector(".cm-close").addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(); // click the dimmed backdrop
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && overlay.classList.contains("is-open")) close();
    });

    footer.querySelector(".cm-add").addEventListener("click", submitAdd);
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submitAdd();
      }
    });
  }

  // Uncheck every collection row and sync the toggle UI. Run on each open so a
  // stale selection from a previous movie doesn't carry over.
  function resetChecks() {
    COLLECTIONS.forEach((c) => (c.checked = false));
    if (!listEl) return;
    listEl.querySelectorAll(".cm-item").forEach((item) => {
      item.classList.remove("is-selected", "is-confirmed");
      item.setAttribute("aria-checked", "false");
    });
  }

  // One collection cell: the whole cell is a toggle (square checkbox + name +
  // 2x2 poster collage). Clicking anywhere on it flips its checked state.
  function buildItem(c) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "cm-item" + (c.checked ? " is-selected" : "");
    item.setAttribute("role", "checkbox");
    item.setAttribute("aria-checked", String(c.checked));

    const posters = (c.posters || [])
      .slice(0, 4)
      .map((src) => `<img class="cm-poster" src="${src}" alt="" loading="lazy">`)
      .join("");

    item.innerHTML = `
      <span class="cm-check" aria-hidden="true"></span>
      <span class="cm-name"></span>
      <span class="cm-collage" aria-hidden="true">${posters}</span>`;
    item.querySelector(".cm-name").textContent = c.name;

    item.addEventListener("click", () => {
      c.checked = !c.checked;
      item.classList.toggle("is-selected", c.checked);
      item.setAttribute("aria-checked", String(c.checked));
    });

    return item;
  }

  // The "+" / Enter is the single submit action. It now serves double duty:
  //   • if existing collections are ticked, it confirms "add to those", and
  //   • if a new-collection name is typed, it creates that one and adds too.
  // Both can happen at once. With nothing selected and no name, it just nudges
  // the name field instead of doing nothing silently.
  function submitAdd() {
    const name = (nameInput.value || "").trim();
    const selected = COLLECTIONS.filter((c) => c.checked).map((c) => c.name);
    const targets = name ? [...selected, name] : selected;

    if (!targets.length) {
      nameInput.focus(); // nothing to add to — hint at creating one
      return;
    }

    const toastMsg = () => {
      if (!window.toast) return;
      const where =
        targets.length === 1
          ? targets[0]
          : targets.slice(0, -1).join(", ") + " and " + targets[targets.length - 1];
      toast.success(`${currentMovie} added to ${where}`);
    };

    // Visually confirm the choice: pulse the selected tiles, then close + toast.
    const chosen = listEl
      ? [...listEl.querySelectorAll(".cm-item.is-selected")]
      : [];
    if (chosen.length) {
      chosen.forEach((it) => it.classList.add("is-confirmed"));
      setTimeout(() => {
        close();
        toastMsg();
      }, 280);
    } else {
      close();
      toastMsg();
    }
  }

  function open(movieTitle) {
    if (!overlay) build();
    currentMovie = movieTitle || "This movie";
    nameInput.value = "";
    resetChecks();
    overlay.classList.add("is-open");
    document.body.classList.add("cm-no-scroll");
    // Push a history entry so the browser/in-app Back closes the overlay and
    // returns to the page it was opened from (Home OR Movie Details).
    pushedState = true;
    history.pushState({ cmOpen: true }, "");
  }

  // Hide the panel without touching history (used by both close() and popstate).
  function hide() {
    overlay.classList.remove("is-open");
    document.body.classList.remove("cm-no-scroll");
  }

  function close() {
    if (!overlay) return;
    hide();
    // Consume the entry we added so a later Back doesn't re-trigger on it.
    if (pushedState) {
      pushedState = false;
      history.back();
    }
  }

  // Browser/in-app Back while the modal is open: just close it (the entry is
  // already being popped, so don't call history.back() again).
  window.addEventListener("popstate", () => {
    if (overlay && overlay.classList.contains("is-open")) {
      pushedState = false;
      hide();
    }
  });

  return { open, close };
})();
