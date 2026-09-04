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

const chipsEl = document.getElementById("chips");
const positionsEl = document.getElementById("positions");
const syncLabel = document.getElementById("syncLabel");
const errorBanner = document.getElementById("errorBanner");
const errorText = document.getElementById("errorText");
const refreshBtn = document.getElementById("refreshBtn");
const retryBtn = document.getElementById("retryBtn");
const hero = document.getElementById("hero");
const heroImg = document.getElementById("heroImg");
const heroTitle = document.getElementById("heroTitle");
const heroKicker = document.getElementById("heroKicker");
const heroCount = document.getElementById("heroCount");
const infoEl = document.getElementById("info");

let warehouse = { categories: [], titles: {}, infos: {}, positions: {} };
let selectedKey = null;

function initTelegram() {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;
    try {
        tg.ready();
        tg.expand();
        tg.setHeaderColor("#000000");
        tg.setBackgroundColor("#000000");
        if (typeof tg.setBottomBarColor === "function") {
            tg.setBottomBarColor("#000000");
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

function showError(message) {
    errorText.textContent = message;
    errorBanner.classList.remove("hidden");
}

function hideError() {
    errorBanner.classList.add("hidden");
}

function heroSrc(key) {
    if (key === PVC) return "img/hero-door.jpg";
    if (key === DELIVERY || key === "Аксессуары") return "img/hero-still.jpg";
    return "img/hero-wood.jpg";
}

function heroKickerText(key) {
    if (key === PVC) return "двери";
    if (key === DELIVERY) return "логистика";
    if (key === "Аксессуары") return "комплектация";
    return "пиломатериал";
}

function countLabel(n) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return `${n} позиция`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} позиции`;
    return `${n} позиций`;
}

function selectCategory(key, hapticKind) {
    if (!key) return;
    const changed = key !== selectedKey;
    selectedKey = key;
    if (hapticKind && (changed || hapticKind === "ok" || hapticKind === "appear")) haptic(hapticKind);
    renderHero();
    renderChips();
    renderInfo();
    renderPositions(true);
    const on = chipsEl.querySelector(".chip.on");
    if (on && changed) on.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
}

function renderHero() {
    const key = selectedKey;
    if (!key) return;
    const next = heroSrc(key);
    if (heroImg.getAttribute("src") !== next) heroImg.src = next;
    heroTitle.textContent = displayTitle(key);
    heroKicker.textContent = heroKickerText(key);
    const n = (warehouse.positions[key] || []).length;
    heroCount.textContent = key === DELIVERY ? "как возим" : countLabel(n);
}

function renderChips() {
    chipsEl.innerHTML = warehouse.categories.map((key) => {
        const on = key === selectedKey ? " on" : "";
        return `<button class="chip${on}" type="button" data-key="${encodeURIComponent(key)}">${escapeHtml(displayTitle(key))}</button>`;
    }).join("");
}

function renderInfo() {
    const info = (warehouse.infos[selectedKey] || "").trim();
    if (!info) {
        infoEl.hidden = true;
        infoEl.textContent = "";
        return;
    }
    infoEl.hidden = false;
    infoEl.textContent = info;
}

function renderPositions(animate) {
    const key = selectedKey;
    const items = warehouse.positions[key] || [];
    const isDelivery = key === DELIVERY;
    if (!items.length) {
        positionsEl.innerHTML = `<div class="empty">В этом разделе пока пусто</div>`;
        return;
    }
    positionsEl.innerHTML = items.map((pos, i) => {
        const delay = animate
            ? `style="animation-delay:${Math.min(i, 14) * 28}ms"`
            : `style="animation:none;opacity:1;transform:none"`;
        if (isDelivery) {
            return `<article class="pos delivery" ${delay}><div class="pos-name">${escapeHtml(pos.name)}</div></article>`;
        }
        const inStock = pos.quantity > 0;
        const stock = pos.showQuantity
            ? `<span class="pos-qty">${pos.quantity} шт.</span>`
            : `<span class="pos-stock ${inStock ? "in" : "out"}">${inStock ? "есть" : "нет"}</span>`;
        const links = (pos.avito || pos.ozon) ? `
            <div class="pos-links">
                ${pos.avito ? `<a href="${linkHref(pos.avito)}" target="_blank" rel="noopener">Avito</a>` : ""}
                ${pos.ozon ? `<a href="${linkHref(pos.ozon)}" target="_blank" rel="noopener" class="ozon">Ozon</a>` : ""}
            </div>` : "";
        return `
            <article class="pos" ${delay}>
                <div class="pos-name">${escapeHtml(pos.name)}</div>
                <div class="pos-price">${formatPrice(pos.price)}</div>
                <div class="pos-meta">${stock}</div>
                ${links}
            </article>`;
    }).join("");
}

function neighbor(step) {
    const list = warehouse.categories;
    if (!list.length) return;
    const i = Math.max(0, list.indexOf(selectedKey));
    const next = list[(i + step + list.length) % list.length];
    selectCategory(next, "scroll");
}

async function loadData(manual) {
    hideError();
    refreshBtn.classList.add("spin");
    try {
        const response = await fetch(BIN_URL, {
            headers: { "X-Master-Key": MASTER_KEY, "X-Bin-Meta": "false" },
        });
        if (!response.ok) throw new Error("sync");
        const data = await response.json();
        warehouse = parseRecord(data);
        if (!warehouse.categories.includes(selectedKey)) {
            selectedKey = warehouse.categories[0] || null;
        }
        selectCategory(selectedKey, manual ? "ok" : "appear");
        syncLabel.textContent = formatTime(new Date());
    } catch (_) {
        showError("Нет связи со складом");
    } finally {
        refreshBtn.classList.remove("spin");
    }
}

chipsEl.addEventListener("click", (event) => {
    const btn = event.target.closest(".chip");
    if (!btn) return;
    const key = decodeURIComponent(btn.dataset.key || "");
    selectCategory(key, "scroll");
});

let touchX = 0;
let touchY = 0;
hero.addEventListener("touchstart", (event) => {
    const t = event.changedTouches[0];
    touchX = t.clientX;
    touchY = t.clientY;
}, { passive: true });
hero.addEventListener("touchend", (event) => {
    const t = event.changedTouches[0];
    const dx = t.clientX - touchX;
    const dy = t.clientY - touchY;
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    neighbor(dx < 0 ? 1 : -1);
}, { passive: true });

refreshBtn.addEventListener("click", () => loadData(true));
retryBtn.addEventListener("click", () => loadData(true));

initTelegram();
loadData(false);
