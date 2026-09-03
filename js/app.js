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

const carousel = document.getElementById("carousel");
const positionsEl = document.getElementById("positions");
const syncLabel = document.getElementById("syncLabel");
const errorBanner = document.getElementById("errorBanner");
const errorText = document.getElementById("errorText");
const refreshBtn = document.getElementById("refreshBtn");
const retryBtn = document.getElementById("retryBtn");

let warehouse = { categories: [], titles: {}, infos: {}, positions: {} };
let selectedKey = null;
let lastPlaqueIndex = -1;
let ticking = false;

function initTelegram() {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;
    try {
        tg.ready();
        tg.expand();
        tg.setHeaderColor("#140E0C");
        tg.setBackgroundColor("#140E0C");
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

function showError(message) {
    errorText.textContent = message;
    errorBanner.classList.remove("hidden");
}

function hideError() {
    errorBanner.classList.add("hidden");
}

function plaqueHtml(key, index) {
    const title = displayTitle(key);
    const info = warehouse.infos[key] || "";
    return `
        <article class="plaque" data-key="${encodeURIComponent(key)}" data-index="${index}">
            <div class="plaque-inner">
                <img class="plaque-logo" src="img/logo_sv_okna.png" alt="">
                <div class="plaque-body">
                    <h2 class="plaque-title">${escapeHtml(title)}</h2>
                    ${info ? `<div class="plaque-info">${escapeHtml(info)}</div>` : ""}
                </div>
            </div>
        </article>
    `;
}

function escapeHtml(text) {
    return String(text)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

function renderCarousel(animate) {
    carousel.innerHTML = warehouse.categories.map((key, i) => plaqueHtml(key, i)).join("");
    const plaques = [...carousel.querySelectorAll(".plaque")];
    plaques.forEach((el, i) => {
        const inner = el.querySelector(".plaque-inner");
        if (animate) {
            if (inner) inner.style.animationDelay = `${i * 70}ms`;
            requestAnimationFrame(() => el.classList.add("ready"));
            window.setTimeout(() => haptic("appear"), 40 + i * 70);
        } else {
            el.classList.add("ready");
            if (inner) {
                inner.style.animation = "none";
                inner.style.opacity = "1";
                inner.style.transform = "none";
            }
        }
    });
    const start = Math.max(0, warehouse.categories.indexOf(selectedKey));
    requestAnimationFrame(() => {
        const target = plaques[start];
        if (target) target.scrollIntoView({ inline: "center", block: "nearest", behavior: "auto" });
        updatePlaqueTransforms();
        renderPositions(warehouse.categories[start] || warehouse.categories[0], true);
    });
}

function nearestIndex() {
    const plaques = [...carousel.querySelectorAll(".plaque")];
    if (!plaques.length) return 0;
    const mid = carousel.scrollLeft + carousel.clientWidth / 2;
    let best = 0;
    let bestDist = Infinity;
    plaques.forEach((el, i) => {
        const center = el.offsetLeft + el.offsetWidth / 2;
        const dist = Math.abs(center - mid);
        if (dist < bestDist) {
            bestDist = dist;
            best = i;
        }
    });
    return best;
}

function updatePlaqueTransforms() {
    const plaques = [...carousel.querySelectorAll(".plaque")];
    const mid = carousel.scrollLeft + carousel.clientWidth / 2;
    plaques.forEach((el) => {
        const center = el.offsetLeft + el.offsetWidth / 2;
        const dx = (center - mid) / Math.max(el.offsetWidth, 1);
        const abs = Math.abs(dx);
        const centered = 1 - Math.min(1, abs);
        const scale = 0.88 + 0.12 * centered;
        const alpha = 0.58 + 0.42 * (1 - Math.min(1, abs / 1.35));
        el.style.transform = `rotateY(${(-dx * 26).toFixed(2)}deg) rotateX(4deg) scale(${scale.toFixed(3)})`;
        el.style.opacity = alpha.toFixed(3);
    });
}

function onCarouselScroll() {
    if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => {
            updatePlaqueTransforms();
            ticking = false;
        });
    }
    const idx = nearestIndex();
    if (idx !== lastPlaqueIndex) {
        lastPlaqueIndex = idx;
        const key = warehouse.categories[idx];
        if (key && key !== selectedKey) {
            selectedKey = key;
            haptic("scroll");
            renderPositions(key, true);
        }
    }
}

function renderPositions(key, animate) {
    selectedKey = key;
    const items = warehouse.positions[key] || [];
    const isDelivery = key === DELIVERY;
    if (!items.length) {
        positionsEl.innerHTML = `<div class="empty">В этом разделе пока пусто</div>`;
        return;
    }
    positionsEl.innerHTML = items.map((pos, i) => {
        const inStock = pos.quantity > 0;
        const barClass = isDelivery ? "" : inStock ? "in" : "out";
        const meta = isDelivery ? "" : `
            <div class="pos-meta">
                <span class="pos-price">${formatPrice(pos.price)}</span>
                ${pos.showQuantity
                    ? `<span class="pos-qty">${pos.quantity} шт.</span>`
                    : `<span class="pos-stock ${inStock ? "in" : "out"}">${inStock ? "есть" : "нет"}</span>`}
            </div>`;
        const links = (!isDelivery && (pos.avito || pos.ozon)) ? `
            <div class="pos-links">
                ${pos.avito ? `<a href="${linkHref(pos.avito)}" target="_blank" rel="noopener">Avito</a>` : ""}
                ${pos.ozon ? `<a href="${linkHref(pos.ozon)}" target="_blank" rel="noopener" class="ozon">Ozon</a>` : ""}
            </div>` : "";
        const delay = animate ? `style="animation-delay:${Math.min(i, 12) * 45}ms"` : `style="animation:none;opacity:1;transform:none"`;
        return `
            <article class="pos" ${delay}>
                <div class="pos-bar ${barClass}"></div>
                <div class="pos-main">
                    <div class="pos-name">${escapeHtml(pos.name)}</div>
                    ${meta}
                </div>
                ${links}
            </article>
        `;
    }).join("");
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
        lastPlaqueIndex = -1;
        renderCarousel(true);
        syncLabel.textContent = formatTime(new Date());
        if (manual) haptic("ok");
    } catch (_) {
        showError("Нет связи со складом");
    } finally {
        refreshBtn.classList.remove("spin");
    }
}

carousel.addEventListener("scroll", onCarouselScroll, { passive: true });
window.addEventListener("resize", updatePlaqueTransforms);
refreshBtn.addEventListener("click", () => loadData(true));
retryBtn.addEventListener("click", () => loadData(true));

initTelegram();
loadData(false);
