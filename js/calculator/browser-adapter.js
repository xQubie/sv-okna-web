(function () {
  "use strict";

  let checking = null;
  let configuredTelegram = false;
  function receive(message) { window.mobileReceive?.(message); }

  const root = document.documentElement;
  const viewport = window.visualViewport;
  let viewportFrame = 0;
  let focusFrame = 0;
  let focusTimer = 0;
  let blurTimer = 0;
  let closedHeight = Math.min(innerHeight, viewport?.height || innerHeight);
  let viewportWidth = innerWidth;
  let keyboardOpen = false;
  let focusOutAt = -Infinity;

  function editable(element) {
    return element instanceof HTMLElement && element.matches('textarea:not(:disabled):not([readonly]),select:not(:disabled),input:not(:disabled):not([readonly]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="range"]):not([type="color"]):not([type="file"])');
  }

  function revealFocusedField() {
    cancelAnimationFrame(focusFrame);
    focusFrame = requestAnimationFrame(() => {
      const field = document.activeElement;
      if (!editable(field)) return;
      const scroller = field.closest('dialog[open],#parameter-scroll,#main-content');
      if (!scroller || scroller.scrollHeight <= scroller.clientHeight) return;
      const bounds = scroller.getBoundingClientRect();
      const rect = field.getBoundingClientRect();
      const visibleTop = keyboardOpen ? Math.max(0, viewport?.offsetTop || 0) : 0;
      const visibleBottom = visibleTop + (viewport?.height || innerHeight);
      const padding = Math.min(12, Math.max(0, (Math.min(bounds.bottom, visibleBottom) - Math.max(bounds.top, visibleTop) - rect.height) / 2));
      const top = Math.max(bounds.top, visibleTop) + padding;
      const bottom = Math.min(bounds.bottom, visibleBottom) - padding;
      if (rect.top < top - 1) scroller.scrollTop += rect.top - top;
      else if (rect.bottom > bottom + 1) scroller.scrollTop += rect.bottom - bottom;
    });
  }

  function updateViewport() {
    viewportFrame = 0;
    const telegramBottom = Math.max(0, Number(window.Telegram?.WebApp?.safeAreaInset?.bottom) || 0);
    root.style.setProperty("--safe-bottom", "max(env(safe-area-inset-bottom, 0px), " + telegramBottom + "px)");
    // Pinch zoom changes the visual viewport too; it must not resize the app.
    if (Math.abs((viewport?.scale || 1) - 1) > 0.05) return;
    const visible = Math.max(1, Math.min(innerHeight, viewport?.height || innerHeight));
    const focused = editable(document.activeElement);
    if (Math.abs(innerWidth - viewportWidth) > 80) {
      // Rotation changes the closed viewport, independently of the keyboard.
      closedHeight = Math.max(innerHeight, root.clientHeight);
      viewportWidth = innerWidth;
    }
    const loss = closedHeight - visible;
    const shrinking = loss > Math.max(96, closedHeight * 0.15);
    const settling = keyboardOpen && performance.now() - focusOutAt < 700;
    keyboardOpen = shrinking && (focused || settling);
    if (!focused && !keyboardOpen) closedHeight = visible;
    else if (focused && visible > closedHeight) closedHeight = visible;

    if (keyboardOpen) {
      root.dataset.keyboard = visible < 360 ? "compact" : "open";
      root.style.setProperty("--calculator-height", Math.floor(visible) + "px");
      root.style.setProperty("--calculator-offset", Math.max(0, viewport?.offsetTop || 0) + "px");
    } else {
      delete root.dataset.keyboard;
      root.style.removeProperty("--calculator-height");
      root.style.removeProperty("--calculator-offset");
    }
    // Only a layout-height mismatch is standalone chrome. Keyboard height is
    // never bottom padding; preserve the last chrome gap throughout editing.
    if (root.dataset.display !== "standalone") root.style.setProperty("--viewport-gap", "0px");
    else if (!focused && !keyboardOpen) {
      const gap = Math.max(0, root.getBoundingClientRect().height - innerHeight);
      root.style.setProperty("--viewport-gap", Math.ceil(gap) + "px");
    }
    revealFocusedField();
  }

  function safeArea() {
    if (!viewportFrame) viewportFrame = requestAnimationFrame(updateViewport);
  }

  function focusViewport(event) {
    if (!editable(event.target)) return;
    if (event.type === "focusout") focusOutAt = performance.now();
    safeArea();
    clearTimeout(focusTimer);
    // Safari may report the new visual height only after keyboard animation.
    focusTimer = setTimeout(safeArea, 350);
    clearTimeout(blurTimer);
    if (event.type === "focusout") blurTimer = setTimeout(safeArea, 750);
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
        .then(() => receive({kind:"exportDone",success:true,requestId:message.requestId}))
        .catch(error => receive({kind:"exportDone",success:false,requestId:message.requestId,
          text:error.name === "AbortError" ? undefined : /[А-Яа-яЁё]/.test(error.message || "") ? error.message : "Не удалось сохранить PNG. Попробуйте ещё раз."}));
    }
  }
  for (const event of ["resize","orientationchange","pageshow"]) window.addEventListener(event, safeArea);
  viewport?.addEventListener("resize", safeArea);
  viewport?.addEventListener("scroll", safeArea);
  document.addEventListener("focusin", focusViewport);
  document.addEventListener("focusout", focusViewport);
  window.CalculatorHost = Object.freeze({postMessage, checkPrices});
})();
