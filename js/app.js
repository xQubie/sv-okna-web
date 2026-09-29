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

const sectionsEl = document.getElementById("sections");
const stageEl = document.getElementById("stage");
const syncLabel = document.getElementById("syncLabel");
const errorBanner = document.getElementById("errorBanner");
const errorText = document.getElementById("errorText");
const refreshBtn = document.getElementById("refreshBtn");
const retryBtn = document.getElementById("retryBtn");
const webBtn = document.getElementById("webBtn");
const toastEl = document.getElementById("toast");

let warehouse = { categories: [], titles: {}, infos: {}, positions: {} };
let selectedKey = null;
let toastTimer = 0;
let lastScroll = 0;

function initTelegram() {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;
    try {
        tg.ready();
        tg.expand();
        const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        const color = dark ? "#071018" : "#C9D8E6";
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
        positions[category] = Array.isArray(data[keyToLoad])
            ? parseArray(data[keyToLoad], category)
            : [];
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

function openExternal(url) {
    const href = linkHref(url);
    if (!href) return;
    try {
        if (window.Telegram?.WebApp?.openLink) {
            window.Telegram.WebApp.openLink(href);
            return;
        }
    } catch (_) { /* ignore */ }
    const opened = window.open(href, "_blank", "noopener,noreferrer");
    if (!opened) window.location.href = href;
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
    document.documentElement.style.setProperty("--safe-bottom", `${Math.max(envH, tg, standalone ? 34 : 0)}px`);
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
    const isDelivery = key === DELIVERY;
    const inStock = pos.quantity > 0;
    const stock = isDelivery ? "" : `
        <span class="row-stock ${inStock ? "in" : "out"}">${
            pos.showQuantity ? `${pos.quantity} шт.` : (inStock ? "есть" : "нет")
        }</span>`;
    const links = (!isDelivery && (pos.avito || pos.ozon)) ? `
        <div class="row-links">
            ${pos.avito ? `<a href="${linkHref(pos.avito)}" target="_blank" rel="noopener">Avito</a>` : ""}
            ${pos.ozon ? `<a href="${linkHref(pos.ozon)}" target="_blank" rel="noopener">Ozon</a>` : ""}
        </div>` : "";
    const side = isDelivery ? "" : `
        <div class="row-side">
            <div class="row-price">${formatPrice(pos.price)}</div>
            ${links}
        </div>`;
    return `
        <article class="row">
            <div class="row-main">
                <div class="row-name">${escapeHtml(pos.name)}</div>
                ${stock}
            </div>
            ${side}
        </article>`;
}

function renderSections() {
    sectionsEl.innerHTML = warehouse.categories.map((key) => `
        <button type="button" class="chip${key === selectedKey ? " is-on" : ""}" data-key="${encodeURIComponent(key)}">
            ${escapeHtml(displayTitle(key))}
        </button>
    `).join("");
    const active = sectionsEl.querySelector(".chip.is-on");
    if (active) {
        active.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    }
}

function renderStage(animate) {
    const key = selectedKey;
    if (!key) {
        stageEl.innerHTML = `<div class="empty">Нет разделов</div>`;
        return;
    }
    const items = warehouse.positions[key] || [];
    const info = warehouse.infos[key] || "";
    const body = items.length
        ? items.map((pos) => rowHtml(key, pos)).join("")
        : `<div class="empty">В этом разделе пока пусто</div>`;
    stageEl.innerHTML = `
        <h1 class="cat-title">${escapeHtml(displayTitle(key))}</h1>
        ${info ? `<p class="cat-info">${escapeHtml(info)}</p>` : `<div style="height:12px"></div>`}
        ${body}
    `;
    stageEl.scrollTop = 0;
    document.body.classList.remove("chrome-away");
    lastScroll = 0;
    if (animate) {
        stageEl.classList.remove("swap");
        void stageEl.offsetWidth;
        stageEl.classList.add("swap");
    }
}

function selectCategory(key, animate) {
    if (!key || key === selectedKey && animate) {
        renderSections();
        return;
    }
    selectedKey = key;
    renderSections();
    renderStage(animate);
}

function render(animate) {
    if (!warehouse.categories.includes(selectedKey)) {
        selectedKey = warehouse.categories[0] || null;
    }
    renderSections();
    renderStage(animate);
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
        selectedKey = (keep && warehouse.categories.includes(keep))
            ? keep
            : (warehouse.categories[0] || null);
        render(true);
        syncLabel.textContent = formatTime(new Date());
        if (manual) showToast("Информация обновлена");
    } catch (_) {
        showError("Нет связи со складом");
    } finally {
        refreshBtn.classList.remove("spin");
    }
}

sectionsEl.addEventListener("click", (event) => {
    const chip = event.target.closest(".chip");
    if (!chip) return;
    const key = decodeURIComponent(chip.dataset.key || "");
    if (key && key !== selectedKey) selectCategory(key, true);
});

stageEl.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (!link) return;
    event.preventDefault();
    openExternal(link.getAttribute("href"));
});

stageEl.addEventListener("scroll", () => {
    const y = stageEl.scrollTop;
    if (y > lastScroll + 8 && y > 40) document.body.classList.add("chrome-away");
    else if (y < lastScroll - 8) document.body.classList.remove("chrome-away");
    lastScroll = y;
}, { passive: true });

refreshBtn.addEventListener("click", () => loadData(true));
retryBtn.addEventListener("click", () => loadData(true));
webBtn.addEventListener("click", () => openExternal(SITE_URL));

initTelegram();
applySafeArea();
loadData(false);
