// --- TOAST NOTIFICATIONS ---
// Thin, theme-matched wrapper around Toastify-js (vendor/toastify). Two ways to fire:
//   • from JS:    toast.success("Saved!")   toast.info("Coming Soon!")   toast.error("Login failed")
//   • from HTML:  <button data-toast="Coming Soon!">      (defaults to info)
//                 <a data-toast="error:Nope, try again">  (type:message)
// Loaded on every page; requires vendor/toastify/toastify.min.js to load before it.
// Exposed on window so inline HTML handlers (onclick / data-toast) can reach it.

window.toast = (function () {
  // Each type → a gradient tuned to the dark maroon theme + a leading glyph.
  const TYPES = {
    success: { icon: "✓", background: "linear-gradient(135deg, #1d9d6c, #2bbd7e)" },
    info: { icon: "ⓘ", background: "linear-gradient(135deg, #3a7bd5, #4a9fe0)" },
    soon: { icon: "✦", background: "linear-gradient(135deg, #8338ec, #c77dff)" }, // "Coming Soon" — its own colour
    error: { icon: "✕", background: "linear-gradient(135deg, #c0392b, #e7503f)" },
  };

  // phones get top-center toasts; wider screens get bottom-right
  const isPhone = () => window.matchMedia("(max-width: 1024px)").matches;

  function show(message, type = "info", options = {}) {
    if (typeof Toastify !== "function") {
      console.warn("[toast] Toastify not loaded — message was:", message);
      return;
    }
    const t = TYPES[type] || TYPES.info;
    Toastify({
      text: `${t.icon}  ${message}`,
      duration: options.duration ?? 3000,
      gravity: options.gravity ?? (isPhone() ? "top" : "bottom"), // phone: top, desktop: bottom
      position: options.position ?? (isPhone() ? "center" : "right"), // phone: center, desktop: right
      close: options.close ?? true,
      stopOnFocus: true, // pause the auto-dismiss while hovered
      className: "mk-toast",
      style: {
        background: t.background,
        color: "#fff",
        borderRadius: "12px",
        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.35)",
        fontFamily: '"Lao Sangam MN", sans-serif',
        fontSize: "16px",
        padding: "14px 18px",
      },
    }).showToast();
  }

  // Declarative HTML hook: any element with data-toast fires on click.
  //   data-toast="Coming Soon!"        -> info
  //   data-toast="success:Saved!"      -> success (type before the first colon)
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-toast]");
    if (!el) return;
    if (el.tagName === "A" && el.getAttribute("href") === "#") e.preventDefault();
    const raw = el.getAttribute("data-toast") || "";
    const m = raw.match(/^(success|info|error|soon)\s*:\s*([\s\S]+)$/);
    if (m) show(m[2], m[1]);
    else show(raw, "info");
  });

  return {
    show,
    success: (m, o) => show(m, "success", o),
    info: (m, o) => show(m, "info", o),
    soon: (m = "Coming Soon!", o) => show(m, "soon", o), // toast.soon() defaults to "Coming Soon!"
    error: (m, o) => show(m, "error", o),
  };
})();
