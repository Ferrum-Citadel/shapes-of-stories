// The same choice as resolveTheme in src/lib/theme.ts, made once before first paint; useTheme follows the system from then on.
(function () {
  var stored = null;
  try {
    stored = localStorage.getItem("sos.theme");
  } catch (e) {
    // Storage can be blocked; the dark default still applies.
  }
  document.documentElement.dataset.theme =
    stored === "light" ||
    (stored === "system" && !matchMedia("(prefers-color-scheme: dark)").matches)
      ? "light"
      : "dark";
})();
