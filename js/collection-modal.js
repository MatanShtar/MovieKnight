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
  // Mock collections shown in the grid (one, per spec).
  const COLLECTIONS = [{ name: "Placeholder", checked: false }];

  let overlay = null; // built lazily on first open
  let nameInput = null;
  let currentMovie = "This movie";

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

    footer.querySelector(".cm-add").addEventListener("click", createCollection);
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        createCollection();
      }
    });
  }

  // One collection row: toggleable checkbox + name, with a 2x2 collage.
  function buildItem(c) {
    const item = document.createElement("div");
    item.className = "cm-item";

    const left = document.createElement("button");
    left.type = "button";
    left.className = "cm-item-toggle" + (c.checked ? " is-checked" : "");
    left.setAttribute("role", "checkbox");
    left.setAttribute("aria-checked", String(c.checked));
    left.innerHTML = `
      <span class="cm-check" aria-hidden="true"></span>
      <span class="cm-name"></span>`;
    left.querySelector(".cm-name").textContent = c.name;

    left.addEventListener("click", () => {
      c.checked = !c.checked;
      left.classList.toggle("is-checked", c.checked);
      left.setAttribute("aria-checked", String(c.checked));
    });

    // 4-tile placeholder collage (gradients stand in for posters).
    const collage = document.createElement("div");
    collage.className = "cm-collage";
    for (let i = 0; i < 4; i++) {
      const tile = document.createElement("span");
      tile.className = "cm-tile cm-tile--" + (i + 1);
      collage.appendChild(tile);
    }

    item.append(left, collage);
    return item;
  }

  // Enter / "+" — assume create-and-add, then close with a success toast.
  function createCollection() {
    const name = (nameInput.value || "").trim();
    if (!name) {
      nameInput.focus();
      return;
    }
    close();
    if (window.toast) {
      toast.success(`${currentMovie} added to ${name}`);
    }
  }

  function open(movieTitle) {
    if (!overlay) build();
    currentMovie = movieTitle || "This movie";
    nameInput.value = "";
    overlay.classList.add("is-open");
    document.body.classList.add("cm-no-scroll");
  }

  function close() {
    if (!overlay) return;
    overlay.classList.remove("is-open");
    document.body.classList.remove("cm-no-scroll");
  }

  return { open, close };
})();
