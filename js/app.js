const BIN_URL = "https://api.jsonbin.io/v3/b/69a9530ed0ea881f40f12d78";
const MASTER_KEY = "$2a$10$5YbFE8JVfomxRwl2x1XOzOyJXmUkVRi.ssHGBEvHkVGlSPyyBQcpC";
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

const catalogEl = document.getElementById("catalog");
const sheetEl = document.getElementById("sheet");
const coversEl = document.getElementById("covers");
const positionsEl = document.getElementById("positions");
const syncLabel = document.getElementById("syncLabel");
const errorBanner = document.getElementById("errorBanner");
const errorText = document.getElementById("errorText");
const refreshBtn = document.getElementById("refreshBtn");
const sheetRefresh = document.getElementById("sheetRefresh");
const retryBtn = document.getElementById("retryBtn");
const backBtn = document.getElementById("backBtn");
const sheetNo = document.getElementById("sheetNo");
const sheetTitle = document.getElementById("sheetTitle");
const sheetInfo = document.getElementById("sheetInfo");

let warehouse = { categories: [], titles: {}, infos: {}, positions: {} };
let selectedKey = null;

function initTelegram() {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;
    try {
        tg.ready();
        tg.expand();
        tg.setHeaderColor("#F3EDE2");
        tg.setBackgroundColor("#F3EDE2");
        if (typeof tg.setBottomBarColor === "function") {
            tg.setBottomBarColor("#F3EDE2");
        }
    } catch (_) { /* ignore */ }
}

function haptic(kind) {
    try {
        const hf = window.Telegram?.WebApp?.HapticFeedback;
        if (hf) {
            if (kind === "appear") hf.impactOccurred("light");
            else if (kind === "scroll") hf.selectionChanged();
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
    return `${dd}.${mm} · ${hh}:${mi}`;
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

function padNo(i) {
    return String(i).padStart(2, "0");
}

function showError(message) {
    errorText.textContent = message;
    errorBanner.classList.remove("hidden");
}

function hideError() {
    errorBanner.classList.add("hidden");
}

function coverSrc(key) {
    if (key === PVC) return "img/hero-door.jpg";
    if (key === DELIVERY) return "img/hero-ship.jpg";
    if (key === "Аксессуары") return "img/hero-parts.jpg";
    if (key === "Дуб 78" || displayTitle(key).toLowerCase().includes("дуб")) return "img/hero-still.jpg";
    return "img/hero-wood.jpg";
}

function countLabel(n) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return `${n} позиция`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} позиции`;
    return `${n} позиций`;
}

function hashKey() {
    const raw = decodeURIComponent((location.hash || "").replace(/^#\/?/, ""));
    return raw || "";
}

function showCatalog() {
    selectedKey = null;
    catalogEl.hidden = false;
    sheetEl.hidden = true;
    window.scrollTo(0, 0);
}

function openSheet(key, push) {
    if (!key || !warehouse.categories.includes(key)) {
        showCatalog();
        if (push) history.pushState({ view: "catalog" }, "", "#");
        return;
    }
    selectedKey = key;
    renderSheet();
    catalogEl.hidden = true;
    sheetEl.hidden = false;
    window.scrollTo(0, 0);
    if (push) history.pushState({ view: "sheet", key }, "", `#/${encodeURIComponent(key)}`);
}

function renderCovers() {
    coversEl.innerHTML = warehouse.categories.map((key, i) => {
        const n = (warehouse.positions[key] || []).length;
        const sub = key === DELIVERY ? "как возим" : countLabel(n);
        return `
            <button class="cover" type="button" data-key="${encodeURIComponent(key)}">
                <img class="cover-photo" src="${coverSrc(key)}" alt="">
                <div class="cover-meta">
                    <span class="cover-no">${padNo(i + 1)}</span>
                    <h2 class="cover-title">${escapeHtml(displayTitle(key))}</h2>
                    <p class="cover-n">${escapeHtml(sub)}</p>
                </div>
            </button>`;
    }).join("");
}

function renderSheet() {
    const key = selectedKey;
    const idx = warehouse.categories.indexOf(key);
    sheetNo.textContent = `раздел ${padNo(idx + 1)}`;
    sheetTitle.textContent = displayTitle(key);
    const info = (warehouse.infos[key] || "").trim();
    if (info) {
        sheetInfo.hidden = false;
        sheetInfo.textContent = info;
    } else {
        sheetInfo.hidden = true;
        sheetInfo.textContent = "";
    }
    const items = warehouse.positions[key] || [];
    const isDelivery = key === DELIVERY;
    if (!items.length) {
        positionsEl.innerHTML = `<div class="empty">В этом разделе пока пусто</div>`;
        return;
    }
    positionsEl.innerHTML = items.map((pos, i) => {
        if (isDelivery) {
            return `
                <article class="row note">
                    <div class="row-no">${padNo(i + 1)}</div>
                    <div class="row-name">${escapeHtml(pos.name)}</div>
                </article>`;
        }
        const inStock = pos.quantity > 0;
        const stock = pos.showQuantity
            ? `<span class="ok">${pos.quantity} шт.</span>`
            : `<span class="${inStock ? "ok" : "no"}">${inStock ? "есть" : "нет"}</span>`;
        const links = [
            pos.avito ? `<a href="${linkHref(pos.avito)}" target="_blank" rel="noopener">Avito</a>` : "",
            pos.ozon ? `<a href="${linkHref(pos.ozon)}" target="_blank" rel="noopener">Ozon</a>` : "",
        ].filter(Boolean).join("");
        return `
            <article class="row">
                <div class="row-no">${padNo(i + 1)}</div>
                <div class="row-name">${escapeHtml(pos.name)}</div>
                <div class="row-price">${formatPrice(pos.price)}</div>
                <div class="row-sub">${stock}${links}</div>
            </article>`;
    }).join("");
}

function routeFromHash() {
    const key = hashKey();
    if (key && warehouse.categories.includes(key)) openSheet(key, false);
    else showCatalog();
}

async function loadData(manual) {
    hideError();
    refreshBtn.classList.add("spin");
    sheetRefresh.classList.add("spin");
    try {
        const response = await fetch(BIN_URL, {
            headers: { "X-Master-Key": MASTER_KEY, "X-Bin-Meta": "false" },
        });
        if (!response.ok) throw new Error("sync");
        const data = await response.json();
        warehouse = parseRecord(data);
        renderCovers();
        if (selectedKey && warehouse.categories.includes(selectedKey)) renderSheet();
        else routeFromHash();
        syncLabel.textContent = formatTime(new Date());
        if (manual) haptic("ok");
        else haptic("appear");
    } catch (_) {
        showError("Нет связи со складом");
    } finally {
        refreshBtn.classList.remove("spin");
        sheetRefresh.classList.remove("spin");
    }
}

coversEl.addEventListener("click", (event) => {
    const btn = event.target.closest(".cover");
    if (!btn) return;
    const key = decodeURIComponent(btn.dataset.key || "");
    haptic("scroll");
    openSheet(key, true);
});

backBtn.addEventListener("click", () => {
    haptic("scroll");
    if (history.state && history.state.view === "sheet") history.back();
    else {
        history.pushState({ view: "catalog" }, "", "#");
        showCatalog();
    }
});

window.addEventListener("popstate", routeFromHash);

refreshBtn.addEventListener("click", () => loadData(true));
sheetRefresh.addEventListener("click", () => loadData(true));
retryBtn.addEventListener("click", () => loadData(true));

initTelegram();
loadData(false);
