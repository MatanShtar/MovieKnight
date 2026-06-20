// collection/sort.js — Collection Page sort-by dropdown widget.
//
// The custom listbox under "Sort by": building the option rows, opening/closing
// the menu, keyboard roving (aria-activedescendant), and committing a choice
// (which re-sorts state.movies and repaints the grid). Attaches its functions
// onto window.CollectionPage (CP) so main.js can wire the static controls.
//
// Depends on: collection/shared.js (CP.SORTS, CP.state, CP.sortMovies, CP.$) and
//   collection/grid.js (CP.renderGrid). Load AFTER shared.js and grid.js.

(function () {
  const CP = (window.CollectionPage = window.CollectionPage || {});
  const $ = CP.$;
  const state = CP.state;
  const SORTS = CP.SORTS;

  // Reflect a sort key in the UI (closed-pill short label + menu selection) and
  // state, WITHOUT re-sorting/persisting. Used on load to show the remembered sort.
  CP.setSort = function setSort(key) {
    const opt = SORTS.find((o) => o.key === key) || SORTS[0];
    state.sort = opt.key;
    $("colSortText").textContent = opt.short; // compact label in the closed pill
    CP.buildSortMenu();
    return opt;
  };

  CP.applySort = function applySort(key, { persist = true } = {}) {
    const opt = CP.setSort(key);
    state.movies = CP.sortMovies(state.movies, state.sort);
    CP.closeSortMenu();
    CP.renderGrid();
    $("colSortBtn").focus();
    // remember the choice for next visit (owner-only, real collections)
    if (persist && CP.persistSort) CP.persistSort(opt.key);
  };

  CP.buildSortMenu = function buildSortMenu() {
    const menu = $("colSortMenu");
    menu.innerHTML = "";
    SORTS.forEach((opt) => {
      const item = document.createElement("div");
      const selected = opt.key === state.sort;
      item.className = "sort-option" + (selected ? " is-selected" : "");
      item.id = "colSortOpt-" + opt.key;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", selected ? "true" : "false");
      item.dataset.key = opt.key;
      item.textContent = opt.label; // full label inside the open menu
      item.addEventListener("click", () => CP.applySort(opt.key));
      menu.appendChild(item);
    });
  };

  // Roving "active" option for keyboard navigation (aria-activedescendant).
  function moveActiveOption(delta) {
    const menu = $("colSortMenu");
    const opts = Array.from(menu.querySelectorAll(".sort-option"));
    if (!opts.length) return;
    let idx = opts.findIndex((o) => o.classList.contains("is-active"));
    if (idx < 0) idx = opts.findIndex((o) => o.dataset.key === state.sort);
    if (idx < 0) idx = 0;
    let next = idx + delta;
    if (next < 0) next = opts.length - 1;
    if (next >= opts.length) next = 0;
    opts.forEach((o) => o.classList.remove("is-active"));
    opts[next].classList.add("is-active");
    menu.setAttribute("aria-activedescendant", opts[next].id);
    opts[next].scrollIntoView({ block: "nearest" });
  }

  function commitActiveOption() {
    const menu = $("colSortMenu");
    const active =
      menu.querySelector(".sort-option.is-active") ||
      menu.querySelector(".sort-option.is-selected");
    if (!active) return;
    const opt = SORTS.find((o) => o.key === active.dataset.key);
    if (opt) CP.applySort(opt.key);
  }

  CP.onSortKeydown = function onSortKeydown(e) {
    const open = !$("colSortMenu").hidden;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) { CP.openSortMenu(); moveActiveOption(0); }
      else moveActiveOption(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) { CP.openSortMenu(); moveActiveOption(0); }
      else moveActiveOption(-1);
    } else if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      if (open) { e.preventDefault(); commitActiveOption(); }
    } else if (e.key === "Escape") {
      if (open) { e.preventDefault(); CP.closeSortMenu(); $("colSortBtn").focus(); }
    }
  };

  CP.openSortMenu = function openSortMenu() {
    const menu = $("colSortMenu");
    menu.hidden = false;
    $("colSortBtn").setAttribute("aria-expanded", "true");
    // Seed the active descendant on the current selection.
    const sel = menu.querySelector(".sort-option.is-selected");
    menu.querySelectorAll(".sort-option").forEach((o) =>
      o.classList.remove("is-active")
    );
    if (sel) {
      sel.classList.add("is-active");
      menu.setAttribute("aria-activedescendant", sel.id);
    }
  };

  CP.closeSortMenu = function closeSortMenu() {
    const menu = $("colSortMenu");
    menu.hidden = true;
    menu.removeAttribute("aria-activedescendant");
    menu.querySelectorAll(".sort-option").forEach((o) =>
      o.classList.remove("is-active")
    );
    $("colSortBtn").setAttribute("aria-expanded", "false");
  };
})();
