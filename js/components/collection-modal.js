// one movie -> many of the user's lists
window.CollectionModal = (function () {

  const escapeHtml = window.escapeHtml;

  let overlay = null;
  let nameInput = null;
  let listEl = null;
  let currentMovieId = null;
  let currentMovie = "This movie";
  let collections = [];
  let opener = null;
  const selected = new Set();
  const initiallyIn = new Set();

  function build() {
    overlay = document.createElement("div");
    overlay.className = "cm-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Add to collection");

    const panel = document.createElement("div");
    panel.className = "cm-panel";

    const header = document.createElement("div");
    header.className = "cm-header";
    header.innerHTML = `
      <h2 class="cm-title">Add to Collection</h2>
      <button class="cm-close" type="button" aria-label="Close">&times;</button>`;

    const list = document.createElement("div");
    list.className = "cm-list";
    listEl = list;

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

    header.querySelector(".cm-close").addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && overlay.classList.contains("is-open")) close();
    });

    // trap Tab within the panel while open
    overlay.addEventListener("keydown", (e) => {
      if (e.key !== "Tab" || !overlay.classList.contains("is-open")) return;
      const focusable = panel.querySelectorAll(
        '.cm-close, .cm-item, .cm-input, .cm-add',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    });

    footer.querySelector(".cm-add").addEventListener("click", submitAdd);
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submitAdd();
      }
    });
  }

  function buildItem(c) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "cm-item";
    item.dataset.id = c.id;
    item.setAttribute("role", "checkbox");

    // tiles pinned to 2:3, so responsive:false keeps the portrait layout
    item.innerHTML = `
      <span class="cm-check" aria-hidden="true"></span>
      <span class="cm-name"></span>
      ${window.buildCollectionCover(c, { responsive: false })}`;
    const nameEl = item.querySelector(".cm-name");
    nameEl.textContent = c.name;
    nameEl.title = c.name;
    item.setAttribute("aria-label", `${c.name} collection`);

    const startsChecked = initiallyIn.has(c.id);
    if (startsChecked) {
      selected.add(c.id);
      item.classList.add("is-selected");
    }
    item.setAttribute("aria-checked", String(startsChecked));

    // optimistic add/remove, reverts on failure
    item.addEventListener("click", async () => {
      if (currentMovieId == null) return;
      const on = !selected.has(c.id);
      if (on) {
        selected.add(c.id);
        initiallyIn.add(c.id);
      } else {
        selected.delete(c.id);
        initiallyIn.delete(c.id);
      }
      item.classList.toggle("is-selected", on);
      item.setAttribute("aria-checked", String(on));
      try {
        if (on) await MovieAPI.addMovieToCollection(c.id, currentMovieId);
        else await MovieAPI.removeMovieFromCollection(c.id, currentMovieId);
        if (window.toast) {
          if (on) toast.success(`${currentMovie} added to ${c.name}`);
          else toast.warn(`${currentMovie} removed from ${c.name}`);
        }
      } catch (err) {
        if (on) {
          selected.delete(c.id);
          initiallyIn.delete(c.id);
        } else {
          selected.add(c.id);
          initiallyIn.add(c.id);
        }
        item.classList.toggle("is-selected", !on);
        item.setAttribute("aria-checked", String(!on));
        if (window.toast) toast.error(err.message || "Something went wrong.");
      }
    });

    return item;
  }

  function renderRows() {
    listEl.innerHTML = "";
    if (!collections.length) {
      const empty = document.createElement("p");
      empty.className = "cm-empty";
      empty.textContent = "You don't have any collections yet — create one below.";
      listEl.appendChild(empty);
      return;
    }
    collections.forEach((c) => listEl.appendChild(buildItem(c)));
  }

  // "+"/Enter only creates a new collection and adds the movie to it
  async function submitAdd() {
    const name = (nameInput.value || "").trim();
    if (!name) {
      nameInput.focus();
      return;
    }
    if (currentMovieId == null) {
      if (window.toast) toast.error("Couldn't tell which movie to add.");
      return;
    }

    const addBtn = overlay.querySelector(".cm-add");
    addBtn.disabled = true;
    try {
      const created = await MovieAPI.createCollection(name);
      await MovieAPI.addMovieToCollection(created.id, currentMovieId);
      nameInput.value = "";
      initiallyIn.add(created.id);
      selected.add(created.id);
      collections = await MovieAPI.listCollections();
      renderRows();
      if (window.toast) toast.success(`${currentMovie} added to ${created.name}`);
    } catch (err) {
      if (window.toast) toast.error(err.message || "Couldn't create the collection.");
    } finally {
      addBtn.disabled = false;
    }
  }

  async function open(movieId, movieTitle) {
    if (!overlay) build();
    opener = document.activeElement;
    currentMovieId = movieId != null ? movieId : null;
    currentMovie = movieTitle || "This movie";
    nameInput.value = "";
    selected.clear();
    initiallyIn.clear();

    overlay.classList.add("is-open");
    document.body.classList.add("cm-no-scroll");

    const closeBtn = overlay.querySelector(".cm-close");
    if (closeBtn) closeBtn.focus();

    listEl.innerHTML = `<p class="cm-empty">Loading your collections…</p>`;
    try {
      collections = await MovieAPI.listCollections();
      // listCollections carries no membership flag, so fetch each list to
      // pre-check the ones already containing this movie
      if (currentMovieId != null && collections.length) {
        const target = String(currentMovieId);
        const full = await Promise.all(
          collections.map((c) =>
            MovieAPI.getCollection(c.id).catch(() => null),
          ),
        );
        full.forEach((detail, i) => {
          if (!detail) return;
          const has = (detail.movies || []).some(
            (m) => String(m.id) === target,
          );
          if (has) initiallyIn.add(collections[i].id);
        });
      }
      renderRows();
    } catch (err) {
      collections = [];
      listEl.innerHTML = `<p class="cm-empty">${escapeHtml(
        err.message || "Couldn't load your collections.",
      )}</p>`;
    }
  }

  // closing only hides it, must not touch window.history or the page Back button breaks
  function close() {
    if (!overlay) return;
    overlay.classList.remove("is-open");
    document.body.classList.remove("cm-no-scroll");
    if (opener && typeof opener.focus === "function") {
      opener.focus();
    }
    opener = null;
  }

  return { open };
})();
