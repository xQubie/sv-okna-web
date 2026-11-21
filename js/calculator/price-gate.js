(function () {
  "use strict";
  const app = document.querySelector(".app-shell");
  const overlay = document.getElementById("price-gate");
  const alert = document.getElementById("price-alert");
  const reason = document.getElementById("price-alert-reason");
  const brief = document.getElementById("price-alert-brief");
  const retry = document.getElementById("price-retry");
  const reasons = {
    network:"Нет соединения с сервером обновлений. Проверьте интернет и повторите попытку.",
    timeout:"Сервер обновлений не ответил за 12 секунд. Повторите попытку позже.",
    server:"Сервер обновлений или сайт прайса временно недоступен. Повторите попытку позже.",
    schema:"Формат данных сервера отличается. Для обновления цен может потребоваться новая версия приложения.",
    formula:"На сайте изменился модуль расчёта. Требуется обновление приложения."
  };
  const briefReasons = {network:"Нет соединения с сервером",timeout:"Сервер не ответил вовремя",server:"Сервер обновлений недоступен",schema:"Данные сервера отличаются",formula:"Изменился расчёт. Обновите приложение"};
  let state = {phase:"checking",requestId:null,reason:null,text:""};
  let timer;
  function render() {
    const blocked = state.phase === "checking";
    app.inert = blocked;
    app.toggleAttribute("inert", blocked);
    app.setAttribute("aria-busy", String(blocked));
    overlay.hidden = !blocked;
    document.documentElement.dataset.priceState = state.phase;
    alert.hidden = !state.reason;
    reason.textContent = state.text;
    brief.textContent = briefReasons[state.reason] || "";
    retry.disabled = blocked;
    retry.textContent = blocked ? "Проверяем…" : "Повторить";
    window.dispatchEvent(new CustomEvent("pricegatechange", {detail:{...state}}));
  }
  function accepts(message) {
    return state.phase === "checking" && message.requestId === state.requestId;
  }
  function fail(message) {
    if (!accepts(message)) return false;
    clearTimeout(timer);
    const code = Object.hasOwn(reasons, message.reason) ? message.reason : "server";
    state = {...state,phase:"fallback",reason:code,text:message.text || reasons[code]};
    render();
    return true;
  }
  function begin(message) {
    clearTimeout(timer);
    for (const dialog of document.querySelectorAll("#settings[open],#dimension-picker[open]")) dialog.close();
    if (app.contains(document.activeElement)) document.activeElement.blur();
    state = {...state,phase:"checking",requestId:message.requestId};
    render();
    const requestId = state.requestId;
    timer = setTimeout(() => {
      if (fail({requestId,reason:"timeout"})) window.CalculatorHost?.cancelPriceCheck?.(requestId);
    }, 12000);
  }
  function succeed(message) {
    if (!accepts(message) || message.fresh !== true || message.provenance !== "network") return false;
    clearTimeout(timer);
    state = {...state,phase:"fresh",reason:null,text:""};
    render();
    return true;
  }
  function suspend() {
    clearTimeout(timer);
    state = {...state,phase:"checking",requestId:null};
    render();
  }
  for (const event of ["click","submit","keydown"]) document.addEventListener(event, value => {
    if (state.phase === "checking" && app.contains(value.target)) {
      value.preventDefault(); value.stopImmediatePropagation();
    }
  }, true);
  window.PriceGate = Object.freeze({begin,fail,succeed,suspend,accepts,
    get blocked() { return state.phase === "checking"; }, get state() { return {...state}; }});
  begin({requestId:null});
})();
