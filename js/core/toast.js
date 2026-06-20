// ==========================================
// 1. TOAST CONFIGURATION & SETUP
// ==========================================
window.toast = (function () {
  const TYPES = {
    success: {
      icon: "✓",
      background: "linear-gradient(135deg, #1d9d6c, #2bbd7e)",
    },
    info: {
      icon: "ⓘ",
      background: "linear-gradient(135deg, #3a7bd5, #4a9fe0)",
    },
    soon: {
      icon: "✦",
      background: "linear-gradient(135deg, #8338ec, #c77dff)",
    },
    error: {
      icon: "✕",
      background: "linear-gradient(135deg, #c0392b, #e7503f)",
    },
    // "removed / undone" — an orange→red so a removal reads differently from a
    // green "added" success.
    warn: {
      icon: "✓",
      background: "linear-gradient(135deg, #e8743b, #e7503f)",
    },
  };

  // phones get top-center toasts; wider screens get bottom-right
  const isPhone = () => window.matchMedia("(max-width: 1024px)").matches;

  // ==========================================
  // 2. TOAST DISPLAY LOGIC
  // ==========================================
  function show(message, type = "info", options = {}) {
    if (typeof Toastify !== "function") {
      console.warn("[toast] Toastify not loaded - message was:", message);
      return;
    }
    const typeStyle = TYPES[type] || TYPES.info;
    Toastify({
      text: `${typeStyle.icon}  ${message}`,
      duration: options.duration ?? 3000,
      gravity: options.gravity ?? (isPhone() ? "top" : "bottom"), // phone: top, desktop: bottom
      position: options.position ?? (isPhone() ? "center" : "right"), // phone: center, desktop: right
      close: options.close ?? true,
      stopOnFocus: true, // pause the auto-dismiss while hovered
      className: "mk-toast",
      style: {
        background: typeStyle.background,
        color: "#fff",
        borderRadius: "12px",
        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.35)",
        fontFamily: '"Lao Sangam MN", sans-serif',
        fontSize: "16px",
        padding: "14px 18px",
      },
    }).showToast();
  }

  // ==========================================
  // 3. DECLARATIVE HTML HOOKS
  // ==========================================
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-toast]");
    if (!el) return;
    if (el.tagName === "A" && el.getAttribute("href") === "#")
      e.preventDefault();
    const raw = el.getAttribute("data-toast") || "";
    // optional "type: message" prefix, e.g. data-toast="error: Saving failed"
    const typedMatch = raw.match(/^(success|info|error|soon)\s*:\s*([\s\S]+)$/);
    if (typedMatch) show(typedMatch[2], typedMatch[1]);
    else show(raw, "info");
  });

  return {
    show,
    success: (m, o) => show(m, "success", o),
    info: (m, o) => show(m, "info", o),
    soon: (m = "Coming Soon!", o) => show(m, "soon", o), // toast.soon() defaults to "Coming Soon!"
    error: (m, o) => show(m, "error", o),
    warn: (m, o) => show(m, "warn", o), // removals / undone actions (orange→red)
  };
})();
