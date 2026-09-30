const BIN_URL = "https://api.jsonbin.io/v3/b/69a9530ed0ea881f40f12d78";
const MASTER_KEY = "$2a$10$5YbFE8JVfomxRwl2x1XOzOyJXmUkVRi.ssHGBEvHkVGlSPyyBQcpC";
const SITE_URL = "https://sv-okna.ru/derevyannyie-okna-dlya-bani.htm";
const META = new Set(["_categories", "_category_infos", "_category_titles"]);
const DELIVERY = "Условия доставки";
const PVC = "Двери ПВХ";

const sectionsEl = document.getElementById("sections");
const stageEl = document.getElementById("stage");
const stageTrack = document.getElementById("stageTrack");
const syncLabel = document.getElementById("syncLabel");
const errorBanner = document.getElementById("errorBanner");
const errorText = document.getElementById("errorText");
const refreshBtn = document.getElementById("refreshBtn");
const retryBtn = document.getElementById("retryBtn");
const webBtn = document.getElementById("webBtn");
const toastEl = document.getElementById("toast");
const infoDlg = document.getElementById("infoDlg");
const infoDlgTitle = document.getElementById("infoDlgTitle");
const infoDlgText = document.getElementById("infoDlgText");
const infoDlgOk = document.getElementById("infoDlgOk");
const infoDlgScrim = document.getElementById("infoDlgScrim");

let warehouse = { categories: [], titles: {}, infos: {}, positions: {} };
let selectedKey = null;
let toastTimer = 0;
let lastScroll = 0;
let sliding = false;
let loading = false;
let dataRevision = 0;
let entranceAnimations = [];
let entranceTimers = [];
let infoCloseTimer = 0;
let lastDataLoad = 0;
let hiddenSince = 0;
const categoryDlg = document.getElementById("categoryDlg");
let dialogReturnFocus = null;

function initTelegram() {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;
    try {
        tg.ready();
        tg.expand();
        const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        const color = dark ? "#101218" : "#F3F5F9";
        tg.setHeaderColor(color);
        tg.setBackgroundColor(color);
        if (typeof tg.setBottomBarColor === "function") tg.setBottomBarColor(color);
    } catch (_) { /* ignore */ }
}

function resolveKey(data, category) {
    if (category === "Лиственница 78 [-5%]" && !(category in data) && ("Лиственница 78" in data)) {
        return "Лиственница 78";
    }
    if (category === "Липа 60 [-15%]" && !(category in data) && ("Липа 60" in data)) {
        return "Липа 60";
    }
    if (category === "ОСВ Для Дачи [-10%]" && !(category in data)) {
        if ("ОСВ Для Дачи" in data) return "ОСВ Для Дачи";
        if ("Сосна 60" in data) return "Сосна 60";
    }
    return category;
}

function parseArray(arr, category) {
    const defaultShow = category === PVC;
    return (arr || []).filter(obj => obj && typeof obj === "object").map((obj) => ({
        name: obj.name || "",
        quantity: Number(obj.quantity) || 0,
        price: Number(obj.price) || 0,
        ozon: obj.ozon || "",
        avito: obj.avito || "",
        showQuantity: Object.prototype.hasOwnProperty.call(obj, "showQuantity")
            ? Boolean(obj.showQuantity)
            : defaultShow,
    }));
}

function parseRecord(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid record");
    let categories = [];
    if (Array.isArray(data._categories) && data._categories.length) {
        categories = [...new Set(data._categories.filter(key => typeof key === "string" && key.trim()))];
    } else {
        categories = Object.keys(data).filter(key => !META.has(key) && Array.isArray(data[key]));
    }
    const infosObj = data._category_infos || {};
    const titlesObj = data._category_titles || {};
    const positions = Object.create(null);
    const loadedKeys = new Set();
    const infos = Object.create(null);
    const titles = Object.create(null);

    for (const category of categories) {
        const keyToLoad = resolveKey(data, category);
        loadedKeys.add(keyToLoad);
        positions[category] = Array.isArray(data[keyToLoad])
            ? parseArray(data[keyToLoad], category)
            : [];
        infos[category] = String(infosObj[category] || infosObj[keyToLoad] || "");
        if (titlesObj[category] || titlesObj[keyToLoad]) titles[category] = String(titlesObj[category] || titlesObj[keyToLoad]);
    }

    for (const key of Object.keys(data)) {
        if (META.has(key) || loadedKeys.has(key) || positions[key] || !Array.isArray(data[key])) continue;
        positions[key] = parseArray(data[key], key);
        infos[key] = String(infosObj[key] || "");
        if (titlesObj[key]) titles[key] = String(titlesObj[key]);
        if (!categories.includes(key)) categories.push(key);
    }

    return { categories, titles, infos, positions };
}

function displayTitle(key) {
    const titled = warehouse.titles[key];
    return titled && titled.trim() ? titled : key;
}

function formatPrice(n) {
    return `${new Intl.NumberFormat("ru-RU").format(n)} ₽`;
}

function formatTime(date) {
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const mi = String(date.getMinutes()).padStart(2, "0");
    return `актуально ${dd}.${mm}, ${hh}:${mi}`;
}

function linkHref(url) {
    if (!url) return "";
    return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function escapeHtml(text) {
    return String(text)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

function copyText(text) {
    if (!text) return Promise.resolve(false);
    if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text).then(() => true).catch(() => copyTextFallback(text));
    }
    return Promise.resolve(copyTextFallback(text));
}

function copyTextFallback(text) {
    try {
        const field = document.createElement("textarea");
        field.value = text;
        field.setAttribute("readonly", "");
        field.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0";
        document.body.appendChild(field);
        field.focus();
        field.select();
        field.setSelectionRange(0, text.length);
        const ok = document.execCommand("copy");
        field.remove();
        return ok;
    } catch (_) {
        return false;
    }
}
function openExternal(url) {
    const href = linkHref(url);
    if (!href) return;
    try {
        if (window.Telegram?.WebApp?.openLink) {
            window.Telegram.WebApp.openLink(href);
            return;
        }
    } catch (_) { /* ignore */ }
    const link = document.createElement("a");
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();
}

function applySafeArea() {
    // Keep CSS env() live: iOS safe insets can change after launching or rotating.
    const tgBottom = Number(window.Telegram?.WebApp?.safeAreaInset?.bottom || 0);
    document.documentElement.style.setProperty("--safe-bottom", `max(env(safe-area-inset-bottom, 0px), ${Math.max(0,tgBottom)}px)`);
}

function showError(message) {
    errorText.textContent = message;
    errorBanner.classList.remove("hidden");
}

function hideError() {
    errorBanner.classList.add("hidden");
}

function showToast(text) {
    toastEl.textContent = text;
    toastEl.classList.remove("hidden");
    requestAnimationFrame(() => toastEl.classList.add("show"));
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
        toastEl.classList.remove("show");
        window.setTimeout(() => toastEl.classList.add("hidden"), 220);
    }, 1800);
}

function rowHtml(key, pos) {
    if (key === DELIVERY) return `<article class="row delivery-row"><div class="row-name">${escapeHtml(pos.name)}</div></article>`;
    const inStock = pos.quantity > 0;
    const stock = pos.showQuantity ? `${pos.quantity} шт.` : (inStock ? "есть" : "нет");
    return `<article class="row${inStock ? "" : " unavailable"}"><div class="row-main"><h2 class="row-name">${escapeHtml(pos.name)}</h2><span class="row-stock ${inStock ? "in" : "out"}">${stock}</span></div>
        <div class="row-side"><div class="row-price">${formatPrice(pos.price)}</div><div class="row-links">
        ${pos.avito ? `<button type="button" class="market avito" data-act="copy" data-href="${escapeHtml(linkHref(pos.avito))}" aria-label="Скопировать ссылку Avito: ${escapeHtml(pos.name)}">Avito</button>` : ""}
        ${pos.ozon ? `<button type="button" class="market ozon" data-act="open" data-href="${escapeHtml(linkHref(pos.ozon))}" aria-label="Открыть Ozon: ${escapeHtml(pos.name)}">Ozon</button>` : ""}
        </div></div></article>`;
}

function cleanTitle(title) { return title.replace(/\s*\[-\d+%\]\s*/g, " ").trim(); }
function discount(title) { return title.match(/\[(-\d+%)\]/)?.[1] || ""; }
function positionLabel(n) { const m = n % 100, d = n % 10; return `${n} ${m >= 11 && m <= 14 ? "позиций" : d === 1 ? "позиция" : d >= 2 && d <= 4 ? "позиции" : "позиций"}`; }
function renderSections() {
    sectionsEl.innerHTML = warehouse.categories.map((key, i) => `
        <button type="button" class="chip${key === selectedKey ? " is-on" : ""}" data-key="${encodeURIComponent(key)}" aria-current="${key === selectedKey ? "true" : "false"}">
            <span class="section-number">${String(i + 1).padStart(2, "0")}</span>
            <span class="section-copy"><span>${escapeHtml(displayTitle(key))}</span><small>${positionLabel((warehouse.positions[key] || []).length)}</small></span><span class="section-check" aria-hidden="true">${key === selectedKey ? "✓" : ""}</span>
        </button>`).join("");

}

function openInfoDialog() {
    const key = selectedKey;
    if (!key) return;
    const info = warehouse.infos[key] || "";
    if (!info.trim()) return;
    cancelRowEntrance();
    clearTimeout(infoCloseTimer);
    infoDlg.classList.remove("is-closing");
    infoDlgTitle.textContent = displayTitle(key);
    infoDlgText.textContent = info;
    dialogReturnFocus = document.activeElement;
    infoDlg.classList.remove("hidden");
    document.getElementById("chrome").inert = true;
    stageEl.inert = true;
    infoDlgOk.focus();
}

function closeInfoDialog() {
    if (infoDlg.classList.contains("hidden") || infoDlg.classList.contains("is-closing")) return;
    infoDlg.classList.add("is-closing");
    infoCloseTimer = setTimeout(() => {
        infoDlg.classList.add("hidden");
        infoDlg.classList.remove("is-closing");
        document.getElementById("chrome").inert = false;
        stageEl.inert = false;
        dialogReturnFocus?.focus();
    }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180);
}

function paneInnerHtml(key) {
    const items = warehouse.positions[key] || [];
    const info = (warehouse.infos[key] || "").trim();
    const title = displayTitle(key);
    const offer = discount(title);
    return `<div class="cat-head"><h1 class="cat-title"><button type="button" class="category-picker" aria-haspopup="dialog" aria-expanded="false" aria-label="Выбрать раздел: ${escapeHtml(cleanTitle(title))}">${escapeHtml(cleanTitle(title))}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></button></h1>${offer ? `<span class="discount">${escapeHtml(offer)}</span>` : ''}${info ? '<button type="button" class="info-btn" aria-label="Информация о разделе">i</button>' : ''}</div>
        <div class="product-list">${items.length ? items.map(pos => rowHtml(key,pos)).join("") : '<div class="empty">В этом разделе пока нет позиций</div>'}</div>`;
}
function createPane(key) {
    const pane = document.createElement("div");
    pane.className = "pane";
    pane.dataset.key = key;
    pane.innerHTML = paneInnerHtml(key);
    return pane;
}

function showPane(key) {
    cancelRowEntrance();
    if (!key) {
        stageTrack.innerHTML = '<div class="loading-state"><h1>Разделов пока нет</h1><p>Они появятся здесь после добавления в облачный склад.</p></div>';
        return;
    }
    stageTrack.replaceChildren(createPane(key));
    stageTrack.style.transition = "none";
    stageTrack.style.transform = "translate3d(0,0,0)";
    document.body.classList.remove("chrome-away");
    lastScroll = 0;
}

function slideTo(key, dir) {
    cancelRowEntrance();
    const current = stageTrack.querySelector(".pane");
    if (!current || sliding) {
        selectedKey = key;
        renderSections();
        showPane(key);
        return;
    }
    sliding = true;
    selectedKey = key;
    renderSections();
    const incoming = createPane(key);
    const width = stageEl.clientWidth || window.innerWidth;
    stageTrack.style.transition = "none";
    if (dir > 0) {
        stageTrack.appendChild(incoming);
        stageTrack.style.transform = "translate3d(0,0,0)";
    } else {
        stageTrack.insertBefore(incoming, current);
        stageTrack.style.transform = `translate3d(${-width}px,0,0)`;
    }
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            stageTrack.style.transition = "transform 340ms cubic-bezier(0.22, 1, 0.36, 1)";
            stageTrack.style.transform = dir > 0
                ? `translate3d(${-width}px,0,0)`
                : "translate3d(0,0,0)";
        });
    });
    let done = false;
    const finish = (event) => {
        if (event && event.target !== stageTrack) return;
        if (done) return;
        done = true;
        stageTrack.removeEventListener("transitionend", finish);
        current.remove();
        stageTrack.style.transition = "none";
        stageTrack.style.transform = "translate3d(0,0,0)";
        incoming.scrollTop = 0;
        document.body.classList.remove("chrome-away");
        lastScroll = 0;
        sliding = false;
    };
    stageTrack.addEventListener("transitionend", finish);
    window.setTimeout(finish, 420);
}

function selectCategory(key, animate) {
    if (sliding) return;
    if (!key || key === selectedKey) {
        renderSections();
        return;
    }
    const from = warehouse.categories.indexOf(selectedKey);
    const to = warehouse.categories.indexOf(key);
    if (animate && from >= 0 && to >= 0 && stageTrack.querySelector(".pane")) {
        slideTo(key, to > from ? 1 : -1);
        return;
    }
    selectedKey = key;
    renderSections();
    showPane(key);
}

function render() {
    if (!warehouse.categories.includes(selectedKey)) {
        selectedKey = warehouse.categories[0] || null;
    }
    renderSections();
    showPane(selectedKey);
}

async function loadData(manual) {
    if (loading || sliding) return;
    cancelRowEntrance();
    loading = true;
    refreshBtn.disabled = true;
    hideError();
    refreshBtn.classList.add("spin");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
        const response = await fetch(BIN_URL, {
            signal: controller.signal,
            cache: "no-store",
            method: "GET",
            headers: { "X-Master-Key": MASTER_KEY, "X-Bin-Meta": "false" },
        });
        if (!response.ok) throw new Error("sync");
        const data = await response.json();
        const keep = manual ? selectedKey : null;
        warehouse = parseRecord(data.record || data);
        dataRevision += 1;
        selectedKey = (keep && warehouse.categories.includes(keep))
            ? keep
            : (warehouse.categories[0] || null);
        render();
        lastDataLoad = Date.now();
        animateLoadedRows();
        syncLabel.textContent = formatTime(new Date());
        if (manual) showToast("Информация обновлена");
    } catch (_) {
        showError(warehouse.categories.length ? "Не удалось обновить. Показаны предыдущие данные." : "Не удалось загрузить склад. Проверьте подключение.");
        if (!warehouse.categories.length) {
            syncLabel.textContent = "Нет связи со складом";
            stageTrack.innerHTML = '<div class="loading-state"><span class="offline-icon">!</span><h1>Склад пока недоступен</h1><p>Нажмите «Повторить», чтобы загрузить разделы и позиции.</p></div>';
        }
    } finally {
        clearTimeout(timeout);
        loading = false;
        refreshBtn.disabled = false;
        refreshBtn.classList.remove("spin");
    }
}

sectionsEl.addEventListener("click", (event) => {
    const chip = event.target.closest(".chip");
    if (!chip) return;
    const key = decodeURIComponent(chip.dataset.key || "");
    if (key && key !== selectedKey) selectCategory(key, true);
    categoryDlg.close();
});

stageEl.addEventListener("click", (event) => {
    if (event.target.closest(".info-btn")) {
        openInfoDialog();
        return;
    }
    const market = event.target.closest(".market");
    if (market) {
        const href = market.getAttribute("data-href") || "";
        if (market.getAttribute("data-act") === "open") {
            openExternal(href);
            return;
        }
        copyText(href).then((ok) => {
            showToast(ok ? "Ссылка скопирована" : "Не удалось скопировать");
        });
        return;
    }
});
infoDlgOk.addEventListener("click", closeInfoDialog);
infoDlgScrim.addEventListener("click", closeInfoDialog);

function bindStageSwipe() {
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastT = 0;
    let vx = 0;
    let mode = "idle";
    let dir = 0;
    let width = 0;
    let current = null;
    let neighbor = null;
    let nextKey = null;

    const teardown = (keepNeighbor) => {
        const panes = [...stageTrack.querySelectorAll(".pane")];
        if (keepNeighbor && neighbor) {
            panes.forEach((pane) => {
                if (pane !== neighbor) pane.remove();
            });
            selectedKey = nextKey;
            renderSections();
            neighbor.scrollTop = 0;
        } else if (current) {
            panes.forEach((pane) => {
                if (pane !== current) pane.remove();
            });
        }
        stageTrack.style.transition = "none";
        stageTrack.style.transform = "translate3d(0,0,0)";
        document.body.classList.remove("chrome-away");
        lastScroll = 0;
        sliding = false;
        mode = "idle";
        current = null;
        neighbor = null;
        nextKey = null;
        dir = 0;
    };

    const settle = (commit) => {
        sliding = true;
        const target = commit
            ? (dir > 0 ? -width : 0)
            : (dir > 0 ? 0 : -width);
        stageTrack.style.transition = "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)";
        stageTrack.style.transform = `translate3d(${target}px,0,0)`;
        let done = false;
        const finish = (event) => {
            if (event && event.target !== stageTrack) return;
            if (done) return;
            done = true;
            stageTrack.removeEventListener("transitionend", finish);
            teardown(commit);
        };
        stageTrack.addEventListener("transitionend", finish);
        window.setTimeout(finish, 360);
    };

    const applyDrag = (x) => {
        const dx = x - startX;
        if (dir > 0) {
            const offset = Math.max(-width, Math.min(0, dx));
            stageTrack.style.transform = `translate3d(${offset}px,0,0)`;
        } else {
            const offset = Math.max(-width, Math.min(0, -width + dx));
            stageTrack.style.transform = `translate3d(${offset}px,0,0)`;
        }
    };

    const startDrag = (x) => {
        const keys = warehouse.categories;
        const index = keys.indexOf(selectedKey);
        const nextIndex = index + dir;
        if (nextIndex < 0 || nextIndex >= keys.length) return false;
        current = stageTrack.querySelector(".pane");
        if (!current) return false;
        nextKey = keys[nextIndex];
        neighbor = createPane(nextKey);
        width = stageEl.clientWidth || window.innerWidth;
        stageTrack.style.transition = "none";
        if (dir > 0) {
            stageTrack.appendChild(neighbor);
            stageTrack.style.transform = "translate3d(0,0,0)";
        } else {
            stageTrack.insertBefore(neighbor, current);
            stageTrack.style.transform = `translate3d(${-width}px,0,0)`;
        }
        mode = "drag";
        applyDrag(x);
        return true;
    };

    const onMove = (x, y, event) => {
        if (mode === "idle" || sliding) return;
        const now = performance.now();
        vx = (x - lastX) / Math.max(now - lastT, 1);
        lastX = x;
        lastT = now;
        const dx = x - startX;
        const dy = y - startY;
        if (mode === "maybe") {
            if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
                mode = "idle";
                return;
            }
            if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
                dir = dx < 0 ? 1 : -1;
                if (!startDrag(x)) {
                    mode = "idle";
                    return;
                }
                event.preventDefault();
            }
            return;
        }
        if (mode === "drag") {
            event.preventDefault();
            applyDrag(x);
        }
    };

    const onEnd = (event) => {
        if (mode === "drag") {
            if (event.type === "pointercancel") {
                settle(false);
                return;
            }
            const dx = lastX - startX;
            const progress = dir > 0 ? -dx / width : dx / width;
            const flick = dir > 0 ? vx < -0.35 : vx > 0.35;
            settle(progress > 0.18 || flick);
            return;
        }
        mode = "idle";
    };

    stageEl.addEventListener("pointerdown", (event) => {
        if (sliding || loading || !infoDlg.classList.contains("hidden")) return;
        if (event.pointerType === "mouse" && event.button !== 0) return;
        if (event.target.closest("a, .info-btn, button")) return;
        cancelRowEntrance();
        mode = "maybe";
        startX = lastX = event.clientX;
        startY = event.clientY;
        lastT = performance.now();
        vx = 0;
        try { stageEl.setPointerCapture(event.pointerId); } catch (_) { /* ignore */ }
    });
    stageEl.addEventListener("pointermove", (event) => onMove(event.clientX, event.clientY, event), { passive: false });
    stageEl.addEventListener("pointerup", onEnd);
    stageEl.addEventListener("pointercancel", onEnd);
    stageEl.addEventListener("touchmove", (event) => {
        if (event.touches.length !== 1) return;
        onMove(event.touches[0].clientX, event.touches[0].clientY, event);
    }, { passive: false });
}

stageEl.addEventListener("click", event => {
    const button=event.target.closest('.category-picker');
    if (!button || sliding || !warehouse.categories.length) return;
    categoryDlg.showModal();
    button.setAttribute('aria-expanded','true');
});
document.getElementById("categoryClose").addEventListener("click", () => categoryDlg.close());
categoryDlg.addEventListener("close", () => { const button=stageTrack.querySelector('.category-picker');button?.setAttribute('aria-expanded','false');button?.focus(); });
categoryDlg.addEventListener("click", event => { if (event.target === categoryDlg) { const r = categoryDlg.getBoundingClientRect(); if (event.clientY < r.top || event.clientX < r.left || event.clientX > r.right) categoryDlg.close(); } });
infoDlg.addEventListener("keydown", event => {
    if (event.key === "Escape") closeInfoDialog();
    if (event.key === "Tab") { event.preventDefault(); infoDlgOk.focus(); }
});
bindStageSwipe();

refreshBtn.addEventListener("click", () => loadData(true));
retryBtn.addEventListener("click", () => loadData(true));
webBtn.addEventListener("click", () => openExternal(SITE_URL));

initTelegram();
window.warehouseTheme.apply();
applySafeArea();
loadData(false);

// Appearance preferences are device-local; inventory remains exclusively cloud-based.
const settingsDlg = document.getElementById("settingsDlg");
const settingsBtn = document.getElementById("settingsBtn");
function updateSettings() {
    const prefs = window.warehouseTheme.get();
    document.querySelectorAll('[name="glassStyle"]').forEach(input => input.checked = input.value === prefs.style);
    document.querySelectorAll('[name="colorMode"]').forEach(input => input.checked = input.value === prefs.mode);
    const styles = {warm:"Тёплое",blue:"Синее",silver:"Серебристое"};
    const modes = {light:"Светлая",dark:"Тёмная",system:"Системная"};
    document.getElementById("selectionLabel").textContent = `${styles[prefs.style]} · ${modes[prefs.mode]}`;
}
settingsBtn.addEventListener("click", () => { updateSettings(); settingsDlg.showModal(); settingsBtn.setAttribute("aria-expanded","true"); });
function closeSettings() {
    if (!settingsDlg.open || settingsDlg.classList.contains("closing")) return;
    settingsDlg.classList.add("closing");
    setTimeout(() => { settingsDlg.close();settingsDlg.classList.remove("closing");settingsDlg.style.removeProperty("transform"); }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 220);
}
document.getElementById("settingsClose").addEventListener("click",closeSettings);
settingsDlg.addEventListener("cancel",event=>{event.preventDefault();closeSettings();});
settingsDlg.addEventListener("close",()=>{settingsBtn.setAttribute("aria-expanded","false");settingsBtn.focus();});
settingsDlg.addEventListener("click",event=>{if(event.target===settingsDlg){const r=settingsDlg.getBoundingClientRect();if(event.clientY<r.top||event.clientX<r.left||event.clientX>r.right)closeSettings();}});
settingsDlg.addEventListener("change",event=>{
    const input=event.target;
    if(input.name!=="glassStyle"&&input.name!=="colorMode")return;
    const saved=window.warehouseTheme.set(input.name==="glassStyle"?{style:input.value}:{mode:input.value});
    updateSettings();
    document.getElementById("settingsHint").textContent=saved?"Изменения применяются сразу":"Применено. Браузер не разрешил запомнить выбор.";
});
const handle=document.getElementById("settingsHandle");let dragStart=null;
handle.addEventListener("pointerdown",event=>{dragStart=event.clientY;handle.setPointerCapture(event.pointerId);});
handle.addEventListener("pointermove",event=>{if(dragStart!==null)settingsDlg.style.transform=`translateY(${Math.max(0,event.clientY-dragStart)}px)`;});
handle.addEventListener("pointerup",event=>{if(dragStart!==null&&event.clientY-dragStart>70)closeSettings();else settingsDlg.style.removeProperty("transform");dragStart=null;});
handle.addEventListener("pointercancel",()=>{dragStart=null;settingsDlg.style.removeProperty("transform");});
window.addEventListener("warehouse-theme-change",updateSettings);
updateSettings();
window.addEventListener('resize',applySafeArea);

function cancelRowEntrance() {
    entranceTimers.forEach(clearTimeout);
    entranceTimers = [];
    entranceAnimations.forEach(animation => animation.cancel());
    entranceAnimations = [];
}
function softHaptic() {
    if (document.hidden) return;
    const tg = window.Telegram?.WebApp;
    try {
        // The SDK is also loaded in browsers; use its native bridge only in a Mini App.
        if (tg?.initData && tg.HapticFeedback && (!tg.isVersionAtLeast || tg.isVersionAtLeast('6.1'))) {
            tg.HapticFeedback.impactOccurred('soft');
            return;
        }
        if (typeof navigator.vibrate === 'function' && navigator.userActivation?.hasBeenActive) navigator.vibrate(8);
    } catch { /* Haptics are optional and must never block the interface. */ }
}
function animateLoadedRows() {
    cancelRowEntrance();
    if (document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const pane = stageTrack.querySelector('.pane');
    if (!pane || typeof Element.prototype.animate !== 'function') return;
    const bounds = pane.getBoundingClientRect();
    const rows = [...pane.querySelectorAll('.row')].filter(row => {
        const rect = row.getBoundingClientRect();
        return rect.top < bounds.bottom && rect.bottom > bounds.top;
    });
    rows.forEach((row,index) => {
        const delay = index * 95;
        entranceAnimations.push(row.animate([
            {opacity:0,transform:'translateY(14px) scale(.985)'},
            {opacity:1,transform:'translateY(0) scale(1)'}
        ], {duration:340,delay,easing:'cubic-bezier(.2,.75,.25,1)',fill:'backwards'}));
        entranceTimers.push(setTimeout(() => {
            if (!row.isConnected || document.hidden || !infoDlg.classList.contains('hidden') || document.querySelector('dialog[open]')) return;
            const rect=row.getBoundingClientRect(), area=pane.getBoundingClientRect();
            if(rect.top<area.bottom&&rect.bottom>area.top)softHaptic();
        },delay+95));
    });
}
document.addEventListener('visibilitychange',()=>{
    if(document.hidden){hiddenSince=Date.now();cancelRowEntrance();return;}
    if(hiddenSince && Date.now()-hiddenSince>15000 && Date.now()-lastDataLoad>15000)loadData(true);
    hiddenSince=0;
});
window.addEventListener('pagehide',cancelRowEntrance);
window.addEventListener('pageshow',event=>{if(event.persisted && Date.now()-lastDataLoad>1000)loadData(true);});
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',event=>{if(event.matches)cancelRowEntrance();});
