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
      icon: "⚠",
      background: "linear-gradient(135deg, #c0392b, #e7503f)",
    },
    warn: {
      icon: "✓",
      background: "linear-gradient(135deg, #e8743b, #e7503f)",
    },
  };

  const isPhone = () => window.matchMedia("(max-width: 1024px)").matches;

  // keyed by type+message so a repeat replaces the one on screen instead of stacking
  const activeToasts = new Map();

  function show(message, type = "info", options = {}) {
    if (typeof Toastify !== "function") {
      console.warn("[toast] Toastify not loaded - message was:", message);
      return;
    }
    const typeStyle = TYPES[type] || TYPES.info;

    const key = `${type}:${message}`;
    const existing = activeToasts.get(key);
    if (existing) {
      try { existing.hideToast(); } catch (_) {}
      activeToasts.delete(key);
    }

    const instance = Toastify({
      text: `${typeStyle.icon}  ${message}`,
      duration: options.duration ?? 3000,
      gravity: options.gravity ?? (isPhone() ? "top" : "bottom"),
      position: options.position ?? (isPhone() ? "center" : "right"),
      close: options.close ?? true,
      stopOnFocus: true,
      className: "mk-toast",
      // only clear if still the tracked instance, a replace may own this key now
      callback: () => {
        if (activeToasts.get(key) === instance) activeToasts.delete(key);
      },
      style: {
        background: typeStyle.background,
        color: "#fff",
        borderRadius: "12px",
        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.35)",
        fontFamily: '"Lao Sangam MN", sans-serif',
        fontSize: "16px",
        padding: "14px 18px",
      },
    });
    activeToasts.set(key, instance);
    instance.showToast();
  }

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
    success: (m, o) => show(m, "success", o),
    info: (m, o) => show(m, "info", o),
    soon: (m = "Coming Soon!", o) => show(m, "soon", o),
    error: (m, o) => show(m, "error", o),
    warn: (m, o) => show(m, "warn", o),
  };
})();
