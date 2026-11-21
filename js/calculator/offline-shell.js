(function () {
  "use strict";
  if (!window.isSecureContext || !("serviceWorker" in navigator)) return;
  const source = document.currentScript?.src;
  if (!source) return;
  const base = new URL("../../", source);
  function register() {
    // Initial online installation is optional; it never delays price checking.
    navigator.serviceWorker.register(new URL("calculator-sw.js?v=v6-5df664fdde61", base).href,
      {scope:base.pathname, updateViaCache:"none"}).catch(() => {});
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", register, {once:true});
  else setTimeout(register, 0);
})();
