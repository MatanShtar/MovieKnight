// profile/badges.js — renders the user's progression badges as metallic shields
// (gold/silver/bronze), or three empty dashed shields when they have none.
// Self-contained IIFE; refreshes from the server after the cached-first paint.
// ==========================================
// 6. PROGRESSION BADGES (data-driven from the user's `badges`)
// ==========================================
// Earned badges render as metallic shields coloured by tier (gold/silver/bronze).
// A user with no badges shows three empty DASHED shields (Figma "just created").
// Badges are a cosmetic mock for now: the Yuviverse7 demo user is seeded with
// three; every other account has an empty array → the dashed state. "View All
// Badges" stays a Coming-Soon stub for everyone (the full badges page is deferred).
(function () {
  const display = document.getElementById("badgesDisplay");
  if (!display) return;

  const user = (() => {
    try {
      return JSON.parse(localStorage.getItem("currentUser"));
    } catch {
      return null;
    }
  })();
  const badges = user && Array.isArray(user.badges) ? user.badges : [];

  const TIER_CLASS = {
    gold: "gold-shield",
    silver: "silver-shield",
    bronze: "bronze-shield",
  };
  const SHIELD_PATH =
    "M59.8442 140.437C49.3608 125.189 30.6421 126.191 16.3498 113.564C11.7487 109.499 7.33404 106.622 6.16922 93.7854C5.13253 82.2653 9.19764 76.6509 8.96468 58.5379C8.85984 50.3492 10.875 33.0516 0.391602 23.0458C10.3042 15.9986 16.6525 8.06611 16.1284 0.436523C29.2326 7.55359 48.1611 7.70503 59.0289 8.01953H58.7027H61.0788H60.6712C71.539 7.70503 90.5256 7.55359 103.63 0.436523C103.106 8.06611 109.454 15.9986 119.367 23.0458C108.883 33.0516 111.038 50.3492 110.922 58.5379C110.689 76.6392 114.754 82.2537 113.717 93.7854C112.552 106.622 108.149 109.499 103.537 113.564C89.2443 126.191 70.3276 125.189 59.8442 140.437Z";
  const shieldSvg = (cls) =>
    `<svg width="120" height="118" viewBox="0 0 120 141" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path class="shield-path ${cls}" d="${SHIELD_PATH}" /></svg>`;

  function render(list) {
    const arr = Array.isArray(list) ? list : [];
    if (arr.length) {
      display.innerHTML = arr
        .slice(0, 3)
        .map((b) => {
          const cls = TIER_CLASS[b.tier] || "bronze-shield";
          const tip = b.subtitle
            ? `<span class="badge-tooltip">${escapeHtml(b.subtitle)}</span>`
            : "";
          return `<div class="badge-shield">${shieldSvg(cls)}<span class="badge-title">${escapeHtml(b.name)}</span>${tip}</div>`;
        })
        .join("");
    } else {
      display.innerHTML = Array.from(
        { length: 3 },
        () => `<div class="badge-shield badge-shield--empty">${shieldSvg("")}</div>`,
      ).join("");
    }
  }

  // Render from the cached user first (instant), then refresh from the server so
  // badges stay current even for a session cached before badges were assigned.
  render(badges);
  if (window.MovieAPI && MovieAPI.me) {
    MovieAPI.me()
      .then((fresh) => { if (fresh) render(fresh.badges); })
      .catch(() => {});
  }
})();
