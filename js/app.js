const BIN_URL = "https://api.jsonbin.io/v3/b/69a9530ed0ea881f40f12d78";
const MASTER_KEY = "$2a$10$5YbFE8JVfomxRwl2x1XOzOyJXmUkVRi.ssHGBEvHkVGlSPyyBQcpC";
const SITE_URL = "https://sv-okna.ru/derevyannyie-okna-dlya-bani.htm";
const META = new Set(["_categories", "_category_infos", "_category_titles"]);
const DEFAULT_CATEGORIES = [
    "Лиственница 78 [-5%]",
    "Липа 60 [-15%]",
    "ОСВ Для Дачи [-10%]",
    "Дуб 78",
    "Аксессуары",
    "Двери ПВХ",
    "Условия доставки",
];
const DELIVERY = "Условия доставки";
const PVC = "Двери ПВХ";
const DOCK_KEY = "sklad.plaquesExpanded";
const PLAQUE_FRAC = 0.75 * 0.85;
const PLAQUE_GAP = 16;
const SWIPE_THRESHOLD = 28;

const pagesEl = document.getElementById("pages");
const plaquesEl = document.getElementById("plaques");
const dockEl = document.getElementById("dock");
const dockHandle = document.getElementById("dockHandle");
const syncLabel = document.getElementById("syncLabel");
const errorBanner = document.getElementById("errorBanner");
const errorText = document.getElementById("errorText");
const refreshBtn = document.getElementById("refreshBtn");
const retryBtn = document.getElementById("retryBtn");
const webBtn = document.getElementById("webBtn");
const toastEl = document.getElementById("toast");

let warehouse = { categories: [], titles: {}, infos: {}, positions: {} };
let selectedKey = null;
let expanded = localStorage.getItem(DOCK_KEY) !== "0";
let syncing = null;
let clearSyncTimer = 0;
let toastTimer = 0;
let lastActiveIndex = -1;

function initTelegram() {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;
    try {
        tg.ready();
        tg.expand();
        const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        const color = dark ? "#12100E" : "#FAF6EE";
        tg.setHeaderColor(color);
        tg.setBackgroundColor(color);
        if (typeof tg.setBottomBarColor === "function") {
            tg.setBottomBarColor(color);
        }
    } catch (_) { /* ignore */ }
}

function haptic(kind) {
    try {
        const hf = window.Telegram?.WebApp?.HapticFeedback;
        if (hf) {
            if (kind === "scroll") hf.selectionChanged();
            else if (kind === "ok") hf.notificationOccurred("success");
            else hf.impactOccurred("light");
            return;
        }
    } catch (_) { /* ignore */ }
    try {
        if (navigator.vibrate) navigator.vibrate(kind === "scroll" ? 10 : 16);
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
    return (arr || []).map((obj) => ({
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
    let categories = [];
    if (Array.isArray(data._categories) && data._categories.length) {
        categories = data._categories.slice();
    } else {
        categories = DEFAULT_CATEGORIES.slice();
    }
    const infosObj = data._category_infos || {};
    const titlesObj = data._category_titles || {};
    const positions = {};
    const infos = {};
    const titles = {};

    for (const category of categories) {
        const keyToLoad = resolveKey(data, category);
        if (Array.isArray(data[keyToLoad])) {
            positions[category] = parseArray(data[keyToLoad], category);
        } else {
            positions[category] = [];
        }
        infos[category] = infosObj[keyToLoad] || "";
        if (titlesObj[category]) titles[category] = titlesObj[category];
    }

    for (const key of Object.keys(data)) {
        if (META.has(key) || positions[key] || !Array.isArray(data[key])) continue;
        positions[key] = parseArray(data[key], key);
        if (titlesObj[key]) titles[key] = titlesObj[key];
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

function applySafeArea() {
    const probe = document.createElement("div");
    probe.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;height:env(safe-area-inset-bottom,0px)";
    document.body.appendChild(probe);
    const envH = probe.getBoundingClientRect().height;
    probe.remove();
    const tg = Number(window.Telegram?.WebApp?.safeAreaInset?.bottom || 0);
    const standalone = Boolean(
        window.navigator.standalone
        || window.matchMedia("(display-mode: standalone)").matches,
    );
    const px = Math.max(envH, tg, standalone ? 34 : 0);
    document.documentElement.style.setProperty("--safe-bottom", `${px}px`);
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

function applyDock() {
    dockEl.classList.toggle("collapsed", !expanded);
    plaquesEl.style.pointerEvents = expanded ? "auto" : "none";
}

function setExpanded(next) {
    if (next === expanded) return;
    expanded = next;
    localStorage.setItem(DOCK_KEY, expanded ? "1" : "0");
    applyDock();
    haptic("light");
    if (expanded) {
        requestAnimationFrame(() => {
            const idx = Math.max(0, warehouse.categories.indexOf(selectedKey));
            plaquesEl.scrollLeft = idx * plaqueStep();
        });
    }
}

function updatePlaqueMetrics() {
    const width = plaquesEl.clientWidth || window.innerWidth;
    const plaqueW = width * PLAQUE_FRAC;
    const sidePad = (width - plaqueW) / 2;
    plaquesEl.style.setProperty("--plaque-w", `${plaqueW}px`);
    plaquesEl.style.setProperty("--side-pad", `${sidePad}px`);
}

function plaqueStep() {
    const width = plaquesEl.clientWidth || window.innerWidth;
    return width * PLAQUE_FRAC + PLAQUE_GAP;
}

function pageCount() {
    return Math.max(warehouse.categories.length, 1);
}

function setActivePlaque(index, withHaptic) {
    const next = Math.max(0, Math.min(index, pageCount() - 1));
    if (next === lastActiveIndex) {
        const key = warehouse.categories[next];
        if (key) selectedKey = key;
        return;
    }
    lastActiveIndex = next;
    const plaques = plaquesEl.querySelectorAll(".plaque");
    plaques.forEach((el, i) => el.classList.toggle("is-active", i === next));
    const key = warehouse.categories[next];
    if (key) selectedKey = key;
    if (withHaptic) haptic("scroll");
}

function clearSyncSoon() {
    window.clearTimeout(clearSyncTimer);
    clearSyncTimer = window.setTimeout(() => {
        plaquesEl.style.scrollSnapType = "";
        pagesEl.style.scrollSnapType = "";
        syncing = null;
    }, 48);
}

function onPagesScroll() {
    if (syncing === "plaques" || syncing === "jump") return;
    syncing = "pages";
    const w = pagesEl.clientWidth || 1;
    const pageFloat = pagesEl.scrollLeft / w;
    if (expanded) {
        plaquesEl.style.scrollSnapType = "none";
        plaquesEl.scrollLeft = pageFloat * plaqueStep();
    }
    setActivePlaque(Math.round(pageFloat), true);
    clearSyncSoon();
}

function onPlaquesScroll() {
    if (!expanded) return;
    if (syncing === "pages" || syncing === "jump") return;
    syncing = "plaques";
    pagesEl.style.scrollSnapType = "none";
    const step = plaqueStep() || 1;
    const pageFloat = plaquesEl.scrollLeft / step;
    pagesEl.scrollLeft = pageFloat * (pagesEl.clientWidth || 1);
    setActivePlaque(Math.round(pageFloat), true);
    clearSyncSoon();
}

function goToIndex(index, behavior) {
    const i = Math.max(0, Math.min(index, pageCount() - 1));
    const pageW = pagesEl.clientWidth || 1;
    syncing = "jump";
    pagesEl.scrollTo({ left: i * pageW, behavior });
    plaquesEl.scrollTo({ left: i * plaqueStep(), behavior });
    setActivePlaque(i, false);
    window.setTimeout(() => {
        syncing = null;
    }, behavior === "smooth" ? 380 : 32);
}

function positionHtml(key, pos) {
    const isDelivery = key === DELIVERY;
    const inStock = pos.quantity > 0;
    const stock = isDelivery ? "" : `
        <div class="pos-stock ${inStock ? "in" : "out"}">${
            pos.showQuantity ? `${pos.quantity} шт.` : (inStock ? "есть" : "нет")
        }</div>`;
    const links = (!isDelivery && (pos.avito || pos.ozon)) ? `
        <div class="pos-links">
            ${pos.avito ? `<a href="${linkHref(pos.avito)}" target="_blank" rel="noopener">Avito</a>` : ""}
            ${pos.ozon ? `<a href="${linkHref(pos.ozon)}" target="_blank" rel="noopener" class="ozon">Ozon</a>` : ""}
        </div>` : "";
    const side = isDelivery ? "" : `
        <div class="pos-side">
            <div class="pos-price">${formatPrice(pos.price)}</div>
            ${links}
        </div>`;
    return `
        <article class="pos">
            <div class="pos-main">
                <div class="pos-name">${escapeHtml(pos.name)}</div>
                ${stock}
            </div>
            ${side}
        </article>`;
}

function pageHtml(key) {
    const title = displayTitle(key);
    const items = warehouse.positions[key] || [];
    const body = items.length
        ? items.map((pos) => positionHtml(key, pos)).join("")
        : `<div class="empty">В этом разделе пока пусто</div>`;
    return `
        <section class="page" data-key="${encodeURIComponent(key)}">
            <h2 class="page-title">${escapeHtml(title)}</h2>
            ${body}
        </section>`;
}

function plaqueHtml(key, index) {
    const title = displayTitle(key);
    const info = warehouse.infos[key] || "";
    return `
        <article class="plaque" data-key="${encodeURIComponent(key)}" data-index="${index}">
            <div class="plaque-inner">
                <h2 class="plaque-title">${escapeHtml(title)}</h2>
                ${info ? `<div class="plaque-info">${escapeHtml(info)}</div>` : ""}
            </div>
        </article>`;
}

function render() {
    const keys = warehouse.categories;
    lastActiveIndex = -1;
    pagesEl.innerHTML = keys.length
        ? keys.map((key) => pageHtml(key)).join("")
        : `<section class="page"><div class="empty">Нет разделов</div></section>`;
    plaquesEl.innerHTML = keys.map((key, i) => plaqueHtml(key, i)).join("");
    const start = Math.max(0, keys.indexOf(selectedKey));
    selectedKey = keys[start] || null;
    requestAnimationFrame(() => {
        updatePlaqueMetrics();
        goToIndex(start, "auto");
    });
}

async function loadData(manual) {
    hideError();
    refreshBtn.classList.add("spin");
    try {
        const response = await fetch(BIN_URL, {
            method: "GET",
            headers: { "X-Master-Key": MASTER_KEY, "X-Bin-Meta": "false" },
        });
        if (!response.ok) throw new Error("sync");
        const data = await response.json();
        const keep = manual ? selectedKey : null;
        warehouse = parseRecord(data);
        if (keep && warehouse.categories.includes(keep)) {
            selectedKey = keep;
        } else {
            selectedKey = warehouse.categories[0] || null;
        }
        render();
        syncLabel.textContent = formatTime(new Date());
        if (manual) {
            haptic("ok");
            showToast("Информация обновлена");
        }
    } catch (_) {
        showError("Нет связи со складом");
    } finally {
        refreshBtn.classList.remove("spin");
    }
}

function bindDockSwipe() {
    let startY = 0;
    let dragged = 0;
    let tracking = false;

    const onStart = (y) => {
        tracking = true;
        startY = y;
        dragged = 0;
    };
    const onMove = (y, event) => {
        if (!tracking) return;
        dragged = y - startY;
        event.preventDefault();
    };
    const onEnd = () => {
        if (!tracking) return;
        tracking = false;
        if (expanded && dragged > SWIPE_THRESHOLD) setExpanded(false);
        else if (!expanded && dragged < -SWIPE_THRESHOLD) setExpanded(true);
    };

    dockHandle.addEventListener("pointerdown", (event) => {
        dockHandle.setPointerCapture(event.pointerId);
        onStart(event.clientY);
    });
    dockHandle.addEventListener("pointermove", (event) => onMove(event.clientY, event));
    dockHandle.addEventListener("pointerup", onEnd);
    dockHandle.addEventListener("pointercancel", onEnd);
}

pagesEl.addEventListener("scroll", onPagesScroll, { passive: true });
plaquesEl.addEventListener("scroll", onPlaquesScroll, { passive: true });
plaquesEl.addEventListener("click", (event) => {
    const plaque = event.target.closest(".plaque");
    if (!plaque) return;
    const index = Number(plaque.dataset.index);
    if (Number.isFinite(index)) goToIndex(index, "smooth");
});
window.addEventListener("resize", () => {
    updatePlaqueMetrics();
    const idx = Math.max(0, warehouse.categories.indexOf(selectedKey));
    goToIndex(idx, "auto");
});
refreshBtn.addEventListener("click", () => loadData(true));
retryBtn.addEventListener("click", () => loadData(true));
webBtn.href = SITE_URL;

bindDockSwipe();
applyDock();
initTelegram();
applySafeArea();
loadData(false);
