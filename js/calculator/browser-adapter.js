(function () {
  "use strict";

  let checking = null;
  let configuredTelegram = false;
  function receive(message) { window.mobileReceive?.(message); }

  function safeArea() {
    const root = document.documentElement;
    const telegramBottom = Math.max(0, Number(window.Telegram?.WebApp?.safeAreaInset?.bottom) || 0);
    root.style.setProperty("--safe-bottom", "max(env(safe-area-inset-bottom, 0px), " + telegramBottom + "px)");
    const visible = Math.min(innerHeight, window.visualViewport?.height || innerHeight);
    const gap = root.dataset.display === "standalone" ? Math.max(0, root.getBoundingClientRect().height-visible) : 0;
    root.style.setProperty("--viewport-gap", Math.ceil(gap) + "px");
  }

  async function checkPrices() {
    if (checking) return checking;
    receive({kind:"checkingPrices"});
    checking = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 40000);
      try {
        const response = await fetch("api/calculator-prices", {cache:"no-store", signal:controller.signal, headers:{Accept:"application/json"}});
        const message = await response.json();
        if (response.ok && message.kind === "prices") receive(message);
        else if (message.kind === "formulaWarning") receive(message);
        else throw Error(message.text || "Проверка цен пока недоступна. Используем сохранённый прайс.");
      } catch (error) {
        receive({kind:"priceError", text:error.name === "AbortError" ? "Сайт не ответил. Используем сохранённый прайс." : "Не удалось проверить цены. Используем сохранённый прайс."});
      } finally { clearTimeout(timer); checking = null; }
    })();
    return checking;
  }

  function telegram() {
    if (configuredTelegram) return;
    const app = window.Telegram?.WebApp;
    if (!app?.initData) return;
    configuredTelegram = true;
    try {
      app.ready(); app.expand();
      app.BackButton.show();
      app.BackButton.onClick(() => {
        if (!window.mobileBack?.()) { app.BackButton.hide(); location.href = "index.html"; }
      });
      window.addEventListener("pagehide", () => app.BackButton.hide());
      window.addEventListener("pageshow", () => app.BackButton.show());
      window.warehouseTheme?.apply();
      app.onEvent?.("safeAreaChanged", safeArea);
      app.onEvent?.("viewportChanged", safeArea);
    } catch { /* Browser navigation works without the optional Telegram bridge. */ }
  }

  function postMessage(value) {
    let message;
    try { message = JSON.parse(value); } catch { return; }
    if (message.kind === "checkPrices") void checkPrices();
    if (message.kind === "ready") { telegram(); safeArea(); void checkPrices(); }
    if (message.kind === "export" && message.format === "png") {
      window.CalculatorPNG.save(message.html, message.title)
        .then(() => receive({kind:"exportDone"}))
        .catch(error => receive({kind:"exportDone", text:/[А-Яа-яЁё]/.test(error.message || "") ? error.message : "Не удалось сохранить PNG. Попробуйте ещё раз."}));
    }
  }
  for (const event of ["resize","orientationchange","pageshow"]) window.addEventListener(event, safeArea);
  window.visualViewport?.addEventListener("resize", safeArea);
  window.CalculatorHost = Object.freeze({postMessage, checkPrices});
})();
