"use strict";

const by = id => document.getElementById(id);
const money = value => value.toLocaleString("ru-RU") + " ₽";
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const clone = value => JSON.parse(JSON.stringify(value));
const storageKey = "svokna-web-calculator:orders:v1";
let stored = {};
try { stored = JSON.parse(localStorage.getItem(storageKey) || "{}"); } catch { /* Keep corrupt storage untouched until the user makes a new change. */ }
const cleanText = (value, limit) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, limit);
const cleanMultiline = (value, limit) => String(value ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").slice(0, limit);
const cleanPrefix = value => String(value ?? "").replace(/[^\p{L}\p{N}]/gu, "").toLocaleUpperCase("ru-RU").slice(0, 12);
function formatPhone(value, limit = 80) {
  const text = cleanText(value, limit).trim();
  if (!/^[+\d\s().\-\u2010-\u2015\u2212]*$/.test(text) || (/^\+/.test(text) && !/^\+\s*7/.test(text))) return text;
  let digits = text.replace(/\D/g, "");
  if (digits.length === 10 && !text.startsWith("+")) digits = "7" + digits;
  if (digits.length !== 11 || !/^[78]/.test(digits)) return text;
  return "+7 (" + digits.slice(1,4) + ") " + digits.slice(4,7) + "-" + digits.slice(7,9) + "-" + digits.slice(9,11);
}
const business = {
  prefix:cleanPrefix(stored?.business?.prefix) || "ВВ",
  name:cleanText(stored?.business?.name, 120),
  address:cleanMultiline(stored?.business?.address, 240),
  phone:formatPhone(stored?.business?.phone),
  messengerPhone:formatPhone(stored?.business?.messengerPhone),
  showLogo:stored?.business?.showLogo !== false
};
function localDate(value = new Date()) {
  return value.getFullYear() + "-" + String(value.getMonth()+1).padStart(2,"0") + "-" + String(value.getDate()).padStart(2,"0");
}
function newProposal() { return {prefix:business.prefix, date:localDate(), suffix:""}; }
const blank = () => ({id:null, items:[], customer:"", contact:"", address:"", notes:"", delivery:0, discount:0, proposal:newProposal()});
function normalizeProposal(source) {
  const previous = source.proposal || {};
  const saved = new Date(source.savedAt || NaN);
  const fallback = Number.isNaN(saved.getTime()) ? localDate() : localDate(saved);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(previous.date || "") ? new Date(previous.date + "T12:00:00") : null;
  source.proposal = {
    prefix:cleanPrefix(previous.prefix) || business.prefix,
    date:date && !Number.isNaN(date.getTime()) && localDate(date) === previous.date ? previous.date : fallback,
    suffix:cleanText(previous.suffix, 24).trim()
  };
}
const restoredDraft = Array.isArray(stored?.draft?.items);
let order = restoredDraft ? stored.draft : blank();
let archive = Array.isArray(stored?.archive) ? stored.archive : [];
for (const source of [order,...archive]) {
  normalizeProposal(source);
  source.contact = formatPhone(source.contact, 120);
}
// A restored working order starts a new quote; archived documents keep identity.
order.id = null;
delete order.savedAt;
order.proposal = newProposal();
let preserveProposalDate = false;
let pendingProposalExport = null;
let editing = null;
let page = "calc";
let noticeTimer;
let priceBusy = false;
let exportBusy = false;
let priceFailed = false;
let formulaWarning = false;
let needsFinishSelection = false;
const native = window.CalculatorHost;
const systemDark = matchMedia("(prefers-color-scheme: dark)");
let system = {dark:systemDark.matches, accent:"#2760a7"};

function send(message) {
  if (!native) return false;
  native.postMessage(JSON.stringify(message));
  return true;
}

function notice(text) {
  clearTimeout(noticeTimer);
  by("notice").textContent = text;
  by("notice").hidden = false;
  noticeTimer = setTimeout(() => { by("notice").hidden = true; }, 4500);
}

function persist() {
  try {
    localStorage.setItem(storageKey, JSON.stringify({draft:order, archive, business, theme:by("theme").value}));
    return true;
  } catch {
    notice("Не удалось сохранить данные. Освободите место на устройстве.");
    return false;
  }
}

function enhanceFields() {
  for (const label of document.querySelectorAll("label")) {
    const control = label.querySelector(":scope > input, :scope > select, :scope > textarea");
    if (!control) continue;
    if (!label.querySelector(":scope > .field-label")) {
      const textNodes = Array.from(label.childNodes).filter(node => node.nodeType === Node.TEXT_NODE);
      const caption = document.createElement("span");
      caption.className = "field-label";
      caption.textContent = textNodes.map(node => node.textContent).join(" ").trim();
      textNodes.forEach(node => node.remove());
      label.prepend(caption);
    }
    label.classList.add("outlined-field");
    label.classList.toggle("is-floating", control.tagName === "SELECT" || control.value !== "" || control === document.activeElement);
  }
}

document.addEventListener("input", enhanceFields);
document.addEventListener("change", enhanceFields);
document.addEventListener("focusin", enhanceFields);
document.addEventListener("focusout", () => requestAnimationFrame(enhanceFields));
let fieldUpdatePending = false;
new MutationObserver(() => {
  if (fieldUpdatePending) return;
  fieldUpdatePending = true;
  requestAnimationFrame(() => {
    fieldUpdatePending = false;
    enhanceFields();
  });
}).observe(document.body, {childList:true, subtree:true});

function syncTheme() {
  // Shared colors and system appearance belong to the warehouse theme.
  document.documentElement.dataset.mode = document.documentElement.dataset.scheme === "dark" ? "dark" : "light";
}

by("theme").value = "system";
by("theme").addEventListener("change", () => { syncTheme(); persist(); });
systemDark.addEventListener("change", event => { system.dark = event.matches; syncTheme(); });
new MutationObserver(syncTheme).observe(document.documentElement, {attributes:true, attributeFilter:["data-scheme"]});
function openSettings() {
  by("settings").showModal();
  by("settings-toggle").setAttribute("aria-expanded", "true");
}
by("settings-toggle").addEventListener("click", openSettings);
by("settings-close").addEventListener("click", () => by("settings").close());
by("settings").addEventListener("close", () => by("settings-toggle").setAttribute("aria-expanded", "false"));

for (const [id,key] of [["company-name","name"],["company-address","address"],["company-phone","phone"],["messenger-phone","messengerPhone"],["proposal-prefix","prefix"]]) {
  const control = by(id);
  const phone = key === "phone" || key === "messengerPhone";
  control.value = business[key];
  control.addEventListener("input", () => {
    business[key] = phone ? formatPhone(control.value) : key === "prefix" ? cleanPrefix(control.value) || "ВВ" : key === "address" ? cleanMultiline(control.value, control.maxLength) : cleanText(control.value, control.maxLength);
    if (key === "prefix" && (!order.id || !order.proposal.suffix.trim())) { order.proposal.prefix = business.prefix; renderProposalIdentity(); }
    persist();
  });
  if (key === "prefix") control.addEventListener("change", () => { control.value = business.prefix; enhanceFields(); });
  if (phone) {
    const commit = () => {
      business[key] = formatPhone(control.value);
      control.value = business[key];
      enhanceFields(); persist();
    };
    control.addEventListener("change", commit);
    control.addEventListener("blur", commit);
  }
}
by("show-logo").checked = business.showLogo;
by("show-logo").addEventListener("change", () => { business.showLogo = by("show-logo").checked; persist(); });
function proposalNumber(source = order, preview = false) {
  const quote = source.proposal;
  const date = quote.date.slice(5,7) + quote.date.slice(8,10);
  return quote.prefix + "-" + date + "-" + (quote.suffix.trim() || (preview ? "…" : ""));
}
function renderProposalIdentity() {
  by("proposal-number-preview").textContent = proposalNumber(order, true);
}
function refreshDraftProposal() {
  if (preserveProposalDate || order.proposal.date === localDate()) return false;
  order.id = null;
  delete order.savedAt;
  order.proposal = newProposal();
  by("proposal-suffix").value = "";
  by("proposal-suffix").setCustomValidity("");
  renderProposalIdentity(); enhanceFields(); persist();
  return true;
}
by("proposal-suffix").addEventListener("input", () => {
  const suffix = cleanText(by("proposal-suffix").value, 24);
  refreshDraftProposal();
  order.proposal.suffix = suffix;
  by("proposal-suffix").value = suffix;
  by("proposal-suffix").setCustomValidity("");
  renderProposalIdentity(); persist();
});
by("proposal-suffix").addEventListener("change", () => {
  order.proposal.suffix = order.proposal.suffix.trim();
  by("proposal-suffix").value = order.proposal.suffix;
  renderProposalIdentity(); enhanceFields(); persist();
});
function requireProposalNumber() {
  refreshDraftProposal();
  if (order.proposal.suffix.trim()) return true;
  go("order");
  const control = by("proposal-suffix");
  control.setCustomValidity("Укажите номер КП после даты.");
  control.scrollIntoView({block:"center"});
  control.focus({preventScroll:true});
  control.reportValidity();
  return false;
}

function priceStatus() {
  const snapshot = PriceData.current;
  const checked = snapshot.checkedAt ? new Date(snapshot.checkedAt).toLocaleString("ru-RU", {day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}) : null;
  const state = formulaWarning ? "обновите приложение" : priceBusy ? "проверяем…" : priceFailed ? "нет связи" : checked || "встроенный прайс";
  by("price-status").textContent = "Актуальность цен";
  by("price-banner").textContent = "Актуальность цен · " + state;
  by("price-time").textContent = formulaWarning
    ? "На сайте изменился расчётный модуль. Используем последнюю совместимую версию до обновления приложения."
    : checked ? "Последняя успешная проверка " + checked + ". При отсутствии сети используется сохранённый прайс."
    : "Пока используем встроенные цены. Для проверки нужен интернет.";
  by("check-prices").disabled = priceBusy;
}

function checkPrices() {
  if (priceBusy) return;
  priceBusy = true;
  priceFailed = false;
  priceStatus();
  if (!send({kind:"checkPrices"})) {
    priceBusy = false;
    priceFailed = true;
    priceStatus();
    notice("Не удалось проверить цены. Попробуйте ещё раз.");
  }
}
by("check-prices").addEventListener("click", checkPrices);
by("refresh-prices").addEventListener("click", checkPrices);
by("price-banner").addEventListener("click", openSettings);

window.mobileReceive = message => {
  if (message.kind === "checkingPrices") { priceBusy = true; priceStatus(); }
  if (message.kind === "theme") { system = message; syncTheme(); }
  if (message.kind === "prices") {
    try {
      const previous = PriceData.current.prices;
      const config = window.svCalcOrder();
      const inside = previous.colors[config.colorIn-1]?.[0];
      const outside = previous.colors[config.colorOut-1]?.[0];
      const changed = PriceData.accept(message);
      if (changed) {
        config.colorIn = message.prices.colors.findIndex(x => x[0] === inside)+1;
        config.colorOut = message.prices.colors.findIndex(x => x[0] === outside)+1;
        needsFinishSelection = !config.colorIn || !config.colorOut;
        config.colorIn ||= 1;
        config.colorOut ||= 1;
        window.formatUpdatePrices(message.prices, config);
        notice(needsFinishSelection ? "Выбранная отделка исчезла из прайса. Выберите отделку внутри и снаружи заново." : "Прайс обновлён. Цены изделий в заказе можно пересчитать отдельно.");
      }
      priceBusy = false;
      priceFailed = false;
      formulaWarning = false;
      priceStatus();
      refreshOrderPriceNote();
    } catch (error) {
      priceBusy = false;
      priceFailed = true;
      priceStatus();
      notice(error.message);
    }
  }
  if (message.kind === "priceError" || message.kind === "formulaWarning") {
    priceBusy = false;
    priceFailed = true;
    formulaWarning = message.kind === "formulaWarning";
    priceStatus();
    notice(message.text || "Не удалось проверить цены. Используем сохранённый прайс.");
  }
  if (message.kind === "exportDone") {
    if (!pendingProposalExport || message.requestId !== pendingProposalExport.requestId) return;
    const completed = pendingProposalExport;
    pendingProposalExport = null;
    exportBusy = false;
    if (message.success) finishProposalExport(completed);
    else { renderTotals(); if (message.text) notice(message.text); }
  }
  if (message.kind === "exportFinished" || message.kind === "notice") {
    exportBusy = false;
    renderTotals();
    if (message.text) notice(message.text);
  }
};

function go(next) {
  if (next === "order") refreshDraftProposal();
  page = next;
  document.querySelectorAll(".page").forEach(node => { node.hidden = node.id !== next; });
  document.querySelectorAll("[data-view]").forEach(node => {
    if (node.dataset.view === next) node.setAttribute("aria-current", "page");
    else node.removeAttribute("aria-current");
  });
  by("title").textContent = {calc:"Калькулятор",order:"Заказ",history:"История"}[next];
  document.documentElement.dataset.page = next;
  document.querySelector("main").scrollTop = 0;
  dimensions();
  if (next === "order") renderOrder();
  if (next === "history") renderArchive();
}
document.querySelectorAll("[data-view],[data-go]").forEach(node => {
  node.addEventListener("click", () => go(node.dataset.view || node.dataset.go));
});
window.mobileBack = () => {
  const preview = by("png-result");
  if (preview?.open) { preview.close(); return true; }
  if (window.DimensionInputs?.closeIfOpen()) return true;
  if (by("settings").open) { by("settings").close(); return true; }
  if (page !== "calc") { go("calc"); return true; }
  return false;
};

const form = by("calc-form");
const defaultWindowConfig = {
  ...clone(window.svCalcOrder()), width:1000, height:1000, quant:1,
  sashes:[{type:0,left:false}], fan:{type:0,height:0}, handleColor:"Бронза", mnt:0, dem:0
};
let dimensionFrame = 0;
function dimensions() {
  if (dimensionFrame) return;
  dimensionFrame = requestAnimationFrame(() => {
    dimensionFrame = 0;
    renderDimensions();
  });
}

function renderDimensions() {
  const overlay = by("dimension-overlay");
  const blueprint = document.querySelector(".blueprint");
  const frame = by("svc-draw").querySelector('[data-role="outer-frame"]');
  if (!frame || page !== "calc") { overlay.replaceChildren(); return; }
  const surface = blueprint.getBoundingClientRect();
  const bounds = frame.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0 || surface.width <= 0 || surface.height <= 0) {
    overlay.replaceChildren();
    return;
  }
  // Measure the rendered frame, so annotations follow SVG fitting and viewport changes.
  const left = bounds.left - surface.left;
  const right = bounds.right - surface.left;
  const top = bounds.top - surface.top;
  const bottom = bounds.bottom - surface.top;
  const widthY = top - 14;
  const heightX = left - 18;
  const widthCenter = (left + right) / 2;
  const heightCenter = (top + bottom) / 2;
  overlay.setAttribute("viewBox", `0 0 ${surface.width} ${surface.height}`);
  overlay.innerHTML = `
    <g class="dimension-lines">
      <line data-role="dimension-width-line" x1="${left}" y1="${widthY}" x2="${right}" y2="${widthY}"/>
      <line x1="${left}" y1="${widthY - 2}" x2="${left}" y2="${top - 2}"/>
      <line x1="${right}" y1="${widthY - 2}" x2="${right}" y2="${top - 2}"/>
      <path d="M ${left - 3} ${widthY + 3} l 6 -6 M ${right - 3} ${widthY + 3} l 6 -6"/>
      <line data-role="dimension-height-line" x1="${heightX}" y1="${top}" x2="${heightX}" y2="${bottom}"/>
      <line x1="${heightX - 2}" y1="${top}" x2="${left - 2}" y2="${top}"/>
      <line x1="${heightX - 2}" y1="${bottom}" x2="${left - 2}" y2="${bottom}"/>
      <path d="M ${heightX - 3} ${top + 3} l 6 -6 M ${heightX - 3} ${bottom + 3} l 6 -6"/>
    </g>
    <rect data-role="dimension-width-background"/>
    <text id="dim-width" x="${widthCenter}" y="${widthY}" text-anchor="middle" dominant-baseline="central">${Number(by("svc-w").value)} мм</text>
    <g data-role="dimension-height-caption" transform="translate(${heightX} ${heightCenter}) rotate(-90)">
      <rect data-role="dimension-height-background"/>
      <text id="dim-height" x="0" y="0" text-anchor="middle" dominant-baseline="central">${Number(by("svc-h").value)} мм</text>
    </g>`;
  const widthText = by("dim-width");
  const heightText = by("dim-height");
  const widthLength = widthText.getComputedTextLength();
  const heightLength = heightText.getComputedTextLength();
  const widthBackground = overlay.querySelector('[data-role="dimension-width-background"]');
  const heightBackground = overlay.querySelector('[data-role="dimension-height-background"]');
  const shortWidth = bounds.width < widthLength + 16;
  const shortHeight = bounds.height < heightLength + 16;
  if (shortWidth) {
    widthText.setAttribute("y", widthY - 11);
    widthBackground.remove();
  } else {
    widthBackground.setAttribute("x", widthCenter - widthLength / 2 - 4);
    widthBackground.setAttribute("y", widthY - 9);
    widthBackground.setAttribute("width", widthLength + 8);
    widthBackground.setAttribute("height", 18);
  }
  if (shortHeight) {
    const captionY = Math.max(heightLength / 2 + 3, Math.min(heightCenter, surface.height - heightLength / 2 - 3));
    overlay.querySelector('[data-role="dimension-height-caption"]').setAttribute("transform", `translate(${heightX - 12} ${captionY}) rotate(-90)`);
    heightBackground.remove();
  } else {
    heightBackground.setAttribute("x", -heightLength / 2 - 4);
    heightBackground.setAttribute("y", -9);
    heightBackground.setAttribute("width", heightLength + 8);
    heightBackground.setAttribute("height", 18);
  }
}
form.addEventListener("input", dimensions);
form.addEventListener("change", dimensions);
for (const id of ["svc-cin","svc-cout"]) by(id).addEventListener("change", () => { needsFinishSelection = false; });
form.addEventListener("submit", event => { event.preventDefault(); by("add").click(); });

function endEdit() {
  editing = null;
  by("add").querySelector("span").textContent = "Добавить в заказ";
  by("cancel-edit").hidden = true;
}
by("cancel-edit").addEventListener("click", () => { endEdit(); go("order"); });

function snapshotItem() {
  const item = window.formatGetWindow();
  const prices = PriceData.current;
  item.priceVersion = prices.version;
  item.priceCheckedAt = prices.checkedAt;
  item.colorInside = prices.prices.colors[item.config.colorIn-1][0];
  item.colorOutside = prices.prices.colors[item.config.colorOut-1][0];
  item.sashDescription = item.config.sashes.map((s,i) => (i+1) + ": " + ["глухая","поворотная","поворотно-откидная","откидная"][s.type] + (s.type === 1 || s.type === 2 ? (s.left ? ", петли слева" : ", петли справа") : "")).join("; ");
  return item;
}

by("add").addEventListener("click", () => {
  if (needsFinishSelection) { notice("После обновления прайса выберите отделку изделия заново."); return; }
  const invalid = form.querySelector("input:invalid, select:invalid, textarea:invalid");
  if (invalid) {
    invalid.closest("details")?.setAttribute("open", "");
    invalid.scrollIntoView({block:"center"});
    invalid.focus({preventScroll:true});
    form.reportValidity();
    return;
  }
  if (order.items.length >= 100 && editing === null) { notice("В заказе может быть до 100 изделий."); return; }
  if (!order.id && !order.items.length && !order.proposal.suffix.trim()) order.proposal = newProposal();
  const item = snapshotItem();
  const changed = editing !== null;
  if (changed) order.items[editing] = item;
  else order.items.push(item);
  endEdit(); updateCount();
  if (persist()) notice(changed ? "Изделие обновлено" : "Окно добавлено в заказ");
  if (changed) go("order");
});
function updateCount() {
  by("count").textContent = order.items.reduce((total,item) => total+item.config.quant,0);
  by("count").hidden = !order.items.length;
}
const details = ["customer","contact","address","notes","delivery","discount"];
for (const id of details) {
  by(id).addEventListener("input", ({target}) => {
    if (target.type === "number") {
      const value = Math.min(Number(target.max), Math.max(Number(target.min), target.valueAsNumber || 0));
      order[id] = id === "discount" ? Math.sign(value) * Math.round(Math.abs(value) * 10) / 10 : value;
    } else order[id] = id === "contact" ? formatPhone(target.value, 120) : target.value;
    renderTotals(); persist();
  });
  if (by(id).type === "number") by(id).addEventListener("change", () => { by(id).value = order[id]; });
}
for (const event of ["change","blur"]) by("contact").addEventListener(event, () => {
  order.contact = formatPhone(by("contact").value, 120);
  by("contact").value = order.contact;
  enhanceFields(); persist();
});
by("discount-sign").addEventListener("click", () => {
  const control = by("discount");
  control.value = -order.discount;
  control.dispatchEvent(new Event("input", {bubbles:true}));
  control.dispatchEvent(new Event("change", {bubbles:true}));
});

function windowPrices(source) {
  const markupTenths = Math.max(0, -Math.round((Number(source.discount) || 0) * 10));
  return source.items.map(item => {
    // Integer tenths avoid losing a ruble at floating-point half boundaries.
    const one = markupTenths ? Math.round(item.one * (1000 + markupTenths) / 1000) : item.one;
    return {one, goods:markupTenths ? one * item.config.quant : item.goods};
  });
}
function amounts(source) {
  const sum = key => source.items.reduce((value,item) => value + item[key],0);
  const goods = windowPrices(source).reduce((value,item) => value + item.goods,0), mounting = sum("mount"), demo = sum("demo");
  const mount = mounting ? Math.max(8000,mounting) : 0;
  const discount = Math.round(goods * Math.max(0, Number(source.discount) || 0) / 100);
  return {goods,mount,demo,discount,delivery:Math.round(source.delivery),total:goods+mount+demo+Math.round(source.delivery)-discount};
}
function rows(a) {
  return [["Окна",a.goods], ...(a.mount ? [["Монтаж",a.mount]] : []), ...(a.demo ? [["Демонтаж",a.demo]] : []),
    ...(a.delivery ? [["Доставка",a.delivery]] : []), ...(a.discount ? [["Скидка на окна",-a.discount]] : [])];
}
function itemName(item) { return item.config.type === 78 ? "ЕВРО 78×78" : "ОСВ 60×70"; }
function itemSize(item) { return item.config.width + " × " + item.config.height + " мм"; }
function renderTotals() {
  const prices = windowPrices(order);
  const a = amounts(order);
  by("summary").innerHTML = rows(a).map(([label,value]) => '<div class="summary-row"><span>'+label+'</span><strong>'+money(value)+'</strong></div>').join("");
  by("grand").textContent = money(a.total);
  by("items").querySelectorAll(".item-copy > strong").forEach((node,index) => { if (prices[index]) node.textContent = money(prices[index].goods); });
  for (const id of ["png","save"]) by(id).disabled = !order.items.length || exportBusy;
}
function refreshOrderPriceNote() {
  const stale = order.items.some(item => item.priceVersion !== PriceData.current.version);
  by("order-price-note").textContent = stale ? "В заказе есть изделия по предыдущему прайсу. Пересчитайте, чтобы применить новые цены." : "Цены изделий сохранены вместе с заказом.";
  by("order-price-note").hidden = !order.items.length;
  by("reprice").hidden = !stale;
}

function renderOrder() {
  const prices = windowPrices(order);
  details.forEach(id => { by(id).value = order[id]; });
  by("proposal-suffix").value = order.proposal.suffix;
  by("proposal-suffix").setCustomValidity("");
  renderProposalIdentity();
  enhanceFields();
  by("items").innerHTML = order.items.map((item,index) => '<article class="entry"><div class="thumb">'+item.svg+'</div><div class="item-copy"><h3>'+itemName(item)+'</h3><p>'+itemSize(item)+'</p><strong>'+money(prices[index].goods)+'</strong><small>'+item.config.quant+' шт. · '+esc(item.config.material)+'</small></div><div class="item-actions"><button data-edit="'+index+'" aria-label="Изменить изделие '+(index+1)+'">Изменить</button><button data-remove="'+index+'" aria-label="Убрать изделие '+(index+1)+'">Убрать</button></div></article>').join("") || '<div class="empty"><h3>Начните с первого окна</h3><p>Укажите размеры в калькуляторе и добавьте изделие в заказ.</p><button data-first>Рассчитать окно</button></div>';
  renderTotals(); refreshOrderPriceNote();
}

function configForCurrentPrices(item) {
  const config = clone(item.config), prices = PriceData.current.prices;
  config.colorIn = prices.colors.findIndex(row => row[0] === item.colorInside)+1;
  config.colorOut = prices.colors.findIndex(row => row[0] === item.colorOutside)+1;
  if (!config.colorIn || !config.colorOut) throw Error("Отделка изделия отсутствует в новом прайсе. Выберите её заново.");
  return config;
}
by("items").addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.hasAttribute("data-first")) { go("calc"); return; }
  if (button.hasAttribute("data-remove")) {
    const index = Number(button.dataset.remove);
    order.items.splice(index,1);
    endEdit(); updateCount(); renderOrder(); persist();
    notice("Изделие убрано из заказа");
    return;
  }
  if (button.hasAttribute("data-edit")) {
    try {
      const index = Number(button.dataset.edit);
      window.formatSetWindow(configForCurrentPrices(order.items[index]));
      editing = index;
      by("add").querySelector("span").textContent = "Сохранить изменения";
      by("cancel-edit").hidden = false;
      dimensions(); go("calc");
      by("parameter-scroll").scrollTop = 0;
    } catch (error) { notice(error.message); }
  }
});

by("reprice").addEventListener("click", () => {
  const currentConfig = window.svCalcOrder();
  try {
    const next = order.items.map(item => {
      window.formatSetWindow(configForCurrentPrices(item));
      const replacement = snapshotItem();
      return replacement;
    });
    order.items = next;
    persist(); renderOrder(); notice("Заказ пересчитан по текущему прайсу");
  } catch (error) { notice(error.message); }
  finally { window.formatSetWindow(currentConfig); dimensions(); }
});

by("save").addEventListener("click", () => {
  if (!order.items.length) return;
  refreshDraftProposal();
  order.id ||= crypto.randomUUID();
  order.savedAt = new Date().toISOString();
  archive = [clone(order), ...archive.filter(item => item.id !== order.id)];
  if (persist()) notice("Заказ сохранён в истории");
});
function renderArchive() {
  by("archive").innerHTML = archive.map((item,index) => '<article class="archive-entry"><h3>'+esc(item.customer || "Заказ без имени")+'</h3><p>'+(item.proposal.suffix.trim() ? 'КП № '+esc(proposalNumber(item)) : 'Номер КП не задан')+'</p><p>'+esc(new Date(item.savedAt).toLocaleString("ru-RU"))+'</p><strong>'+money(amounts(item).total)+'</strong><div class="archive-actions"><button data-open="'+index+'">Открыть</button><button data-copy="'+index+'">Копировать</button></div></article>').join("") || '<div class="empty"><h3>Сохранённых заказов пока нет</h3><p>Сохраните смету во вкладке «Заказ», чтобы вернуться к ней позже.</p></div>';
}
function replaceOrder(next, preserveDate = false) {
  const hasDraft = order.items.length || details.some(id => order[id]) || order.proposal.suffix;
  const isSaved = archive.some(item => item.id === order.id && JSON.stringify(item) === JSON.stringify(order));
  if (hasDraft && !isSaved && !window.confirm("Заменить текущий черновик? Для сохранения сначала нажмите «Сохранить заказ».")) return;
  order = next; preserveProposalDate = preserveDate;
  endEdit(); updateCount(); persist(); go("order");
}
by("archive").addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.hasAttribute("data-open")) replaceOrder(clone(archive[+button.dataset.open]), true);
  if (button.hasAttribute("data-copy")) {
    const copy = clone(archive[+button.dataset.copy]);
    copy.id = null; delete copy.savedAt;
    copy.proposal = newProposal();
    replaceOrder(copy);
  }
});
by("new-order").addEventListener("click", () => replaceOrder(blank()));

function finishProposalExport(completed) {
  const previousOrder = order, previousArchive = archive;
  const previousMode = preserveProposalDate;
  const unchanged = JSON.stringify(order) === completed.serialized;
  const saved = completed.snapshot;
  saved.id ||= crypto.randomUUID();
  saved.savedAt = new Date().toISOString();
  archive = [saved, ...archive.filter(item => item.id !== saved.id)];
  if (unchanged) { order = blank(); preserveProposalDate = false; }
  // Persist the completed quote and next draft together before clearing the UI.
  if (!persist()) {
    order = previousOrder; archive = previousArchive; preserveProposalDate = previousMode;
    renderTotals(); return;
  }
  if (!unchanged) {
    renderTotals();
    notice("КП сохранено в истории. Новые изменения в расчёте оставлены.");
    return;
  }
  endEdit(); needsFinishSelection = false;
  const config = clone(defaultWindowConfig);
  const finish = PriceData.current.prices.colors.findIndex(row => row[0] === "Без отделки") + 1;
  config.colorIn = config.colorOut = finish || 1;
  window.formatSetWindow(config);
  renderOrder(); updateCount(); go("calc");
  by("parameter-scroll").scrollTop = 0;
  enhanceFields(); dimensions();
  notice("КП сохранено в истории. Можно начать новый расчёт.");
}

function proposalHtml() {
  const a = amounts(order);
  const prices = windowPrices(order);
  const spec = (label,value) => '<div><dt>'+esc(label)+'</dt><dd>'+esc(value)+'</dd></div>';
  const rubles = value => value.toLocaleString("ru-RU") + " руб.";
  const content = order.items.map((item,index) => {
    const config = item.config;
    const glassType = (config.glass.split("-").length - 1) > 2 ? "Двухкамерный" : "Однокамерный";
    const glassFormula = config.glassOut + config.glass + config.glassIn;
    const finish = item.colorInside === "Без отделки" && item.colorOutside === "Без отделки"
      ? "Без отделки"
      : "Отделка внутри: " + item.colorInside + ", Отделка снаружи: " + item.colorOutside;
    const specs = [
      ["Стеклопакет",glassType+" ("+glassFormula+")"],
      ["Створки",item.sashDescription],
      ...(config.fan.type ? [["Фрамуга",["","глухая","открывная","глухая раздельная","открывная раздельная"][config.fan.type]+", "+config.fan.height+" мм"]] : []),
      ["Ручка металлическая",'Цвет «'+config.handleColor+'»'],
      ["Петли","Цвет "+config.handleColor]
    ];
    const price = config.quant > 1
      ? '<span class="item-price-unit">Цена за штуку - '+rubles(prices[index].one)+'</span><strong>Всего - '+rubles(prices[index].goods)+'</strong>'
      : '<strong>'+money(prices[index].goods)+'</strong>';
    return '<section class="product"><div class="product-heading"><h2>Изделие '+(index+1)+'. '+esc(itemName(item)+' '+config.material)+'</h2><span>'+config.quant+' шт.</span></div><div class="product-body"><div class="picture">'+window.proposalDrawing(item)+'</div><div class="product-description"><p class="finish-spec">'+esc(finish)+'</p><dl class="specifications">'+specs.map(([label,value])=>spec(label,value)).join("")+'</dl><div class="item-price">'+price+'</div></div></div></section>';
  }).join("");
  const logo = business.showLogo && window.PROPOSAL_LOGO ? '<img class="brand-logo" data-role="proposal-logo" src="'+esc(window.PROPOSAL_LOGO)+'" alt="СВ Окна" width="170" height="70">' : '';
  const companyPhone = formatPhone(business.phone);
  const messengerPhone = formatPhone(business.messengerPhone);
  const messengerIcons = (window.PROPOSAL_MESSENGERS || []).map(icon=>'<img data-messenger="'+esc(icon.name)+'" src="'+esc(icon.src)+'" alt="'+esc(icon.name)+'" width="28" height="28">').join("");
  const messengers = messengerPhone ? '<div class="messenger-contact" data-role="messenger-contact"><div class="messenger-icons">'+messengerIcons+'</div><p class="messenger-phone" data-role="messenger-phone">'+esc(messengerPhone)+'</p></div>' : '';
  const supplier = '<div class="supplier">'+(business.name.trim() ? '<p class="supplier-name">'+esc(business.name.trim())+'</p>' : '')+[business.address,companyPhone].filter(value=>value.trim()).map(value=>'<p>'+esc(value.trim())+'</p>').join("")+'</div>';
  const header = (logo || messengers || business.name.trim() || business.address.trim() || companyPhone) ? '<header class="brand-header'+(messengers ? ' has-messengers' : '')+'">'+(messengers ? '<div class="brand-identity">'+logo+'</div>' : logo)+messengers+supplier+'</header>' : '';
  const date = new Date(order.proposal.date + "T12:00:00").toLocaleDateString("ru-RU");
  const customer = [["Заказчик",order.customer],["Телефон",formatPhone(order.contact,120)],...(a.delivery > 0 ? [["Адрес доставки",order.address]] : [])]
    .map(([label,value])=>[label,String(value ?? "").trim()])
    .filter(([,value])=>value)
    .map(([label,value])=>spec(label,value)).join("");
  const count = order.items.reduce((sum,item)=>sum+item.config.quant,0);
  const area = order.items.reduce((sum,item)=>sum+item.config.width*item.config.height/1000000*item.config.quant,0).toLocaleString("ru-RU",{maximumFractionDigits:2});
  return '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=800"><title>КП '+esc(proposalNumber())+'</title><style>'+proposalCss+'</style></head><body><main>'+header+'<div class="document-heading"><h1>Коммерческое предложение № '+esc(proposalNumber())+'</h1><p>от '+esc(date)+'</p></div>'+(customer ? '<dl class="customer">'+customer+'</dl>' : '')+content+'<section class="estimate-summary"><div class="quantities"><p>Всего изделий <b>'+count+' шт.</b></p><p>Общая площадь <b>'+area+' м²</b></p></div><div class="sums">'+rows(a).map(([label,value])=>'<div><span>'+label+'</span><strong>'+money(value)+'</strong></div>').join("")+'<div class="total"><span>Всего стоимость заказа</span><strong>'+money(a.total)+'</strong></div></div></section>'+(order.notes ? '<p class="notes">'+esc(order.notes)+'</p>' : '')+'</main></body></html>';
}
const proposalCss = `*{box-sizing:border-box}html,body{margin:0;background:#fff;color:#142133;font:13px/1.4 Arial,sans-serif}main{padding:28px 30px;max-width:800px;margin:auto}p{margin:3px 0}h1,h2{margin:0}h1{font-size:18px;line-height:1.35;overflow-wrap:anywhere}h2{font-size:14px;line-height:1.35}.brand-header{display:flex;align-items:center;justify-content:space-between;gap:28px;border-bottom:2px solid #008c45;padding-bottom:14px;margin-bottom:16px;break-inside:avoid}.brand-logo{display:block;object-fit:contain;width:170px;height:70px;flex:none}.brand-header.has-messengers{display:grid;grid-template-columns:minmax(0,1fr) 174px minmax(0,1fr);gap:18px}.brand-identity{width:170px;flex:none}.messenger-contact{width:174px;flex:none;text-align:center;align-self:center}.messenger-icons{display:flex;justify-content:center;align-items:center;gap:8px;margin-bottom:6px}.messenger-icons img{display:block;width:28px;height:28px;object-fit:contain}.messenger-phone{font-size:12px;font-weight:700;line-height:1.4;white-space:nowrap}.supplier{flex:1;min-width:0;text-align:right;font-size:12px;overflow-wrap:anywhere;white-space:pre-line}.supplier-name{font-size:17px;font-weight:700;line-height:1.3;margin-bottom:5px}.document-heading{display:flex;align-items:baseline;justify-content:space-between;gap:18px;margin:0 0 15px;break-inside:avoid}.document-heading h1{flex:1}.document-heading p{flex:none;color:#52606d;font-size:11px}.customer{margin:0 0 18px}.customer>div{display:flex;gap:10px;margin:3px 0}.customer dt{color:#52606d;flex:none;width:98px}.customer dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;min-width:0}.product{border-top:1px solid #bcc8ce;padding:13px 0 16px;break-inside:avoid}.product-heading{display:flex;align-items:baseline;justify-content:space-between;gap:16px;margin-bottom:10px}.product-heading>span{flex:none;font-weight:700}.product-body{display:flex;align-items:center;gap:20px}.picture{width:200px;min-width:200px;text-align:center;padding:7px 10px}.picture>svg{display:block;width:180px;height:205px;fill:none;stroke:currentColor}.product-description{flex:1;min-width:0}.finish-spec{margin:0;padding:3px 0;border-bottom:1px solid #e1e6e9;font-size:12px;overflow-wrap:anywhere}.specifications{margin:0}.specifications>div{display:grid;grid-template-columns:120px minmax(0,1fr);gap:10px;border-bottom:1px solid #e1e6e9;padding:3px 0;font-size:12px;break-inside:avoid}.specifications dt{color:#52606d}.specifications dd{margin:0;overflow-wrap:anywhere}.item-price{display:flex;flex-direction:column;align-items:flex-end;gap:4px;text-align:right;margin-top:10px}.item-price-unit{font-size:12px;color:#52606d}.item-price>strong{font-size:18px;white-space:nowrap}.estimate-summary{display:flex;align-items:flex-start;justify-content:space-between;gap:25px;border-top:2px solid #008c45;padding-top:13px;margin-top:4px;break-inside:avoid}.quantities{font-size:12px;padding-top:4px}.quantities b{display:block;font-size:14px;margin:2px 0 9px}.sums{width:340px;max-width:65%;flex:none}.sums>div{display:flex;justify-content:space-between;gap:16px;padding:4px 0}.sums strong{white-space:nowrap}.sums .total{border-top:1px solid #aebdc6;margin-top:7px;padding-top:9px;font-size:17px;font-weight:700}.notes{white-space:pre-wrap;overflow-wrap:anywhere;margin:18px 0;font-size:12px}@page{size:A4;margin:12mm}@media print{main{padding:0}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.document-heading{break-after:avoid}.product-heading{break-after:avoid}}`;

for (const format of ["png"]) by(format).addEventListener("click", () => {
  if (!order.items.length || exportBusy) return;
  if (!requireProposalNumber()) return;
  const html = proposalHtml();
  if (!native) { notice("Не удалось открыть сохранение PNG. Обновите страницу."); return; }
  if (new Blob([html]).size > 1000000) { notice("Смета слишком большая для экспорта. Разделите заказ на части."); return; }
  exportBusy = true; renderTotals();
  const snapshot = clone(order), requestId = crypto.randomUUID();
  pendingProposalExport = {snapshot,serialized:JSON.stringify(order),requestId};
  send({kind:"export",format,html,title:"КП " + proposalNumber(),requestId});
});

syncTheme();
priceStatus();
dimensions();
updateCount();
renderTotals();
enhanceFields();
new ResizeObserver(dimensions).observe(document.querySelector(".blueprint"));
go("calc");
if (restoredDraft) persist();
for (const event of ["pageshow","focus"]) window.addEventListener(event, refreshDraftProposal);
document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshDraftProposal(); });
setInterval(refreshDraftProposal, 60000);
send({kind:"ready"});

