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
const pagesStrip = document.getElementById("pagesStrip");
const plaquesEl = document.getElementById("plaques");
const plaquesStrip = document.getElementById("plaquesStrip");
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
let toastTimer = 0;
let lastActiveIndex = -1;
let pageW = 1;
let plaqueStepPx = 1;
let followRaf = 0;
let settleTimer = 0;
let draggingPlaques = false;

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
        }
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
}

function pageCount() {
    return Math.max(warehouse.categories.length, 1);
}

function pageFloatNow() {
    return pagesEl.scrollLeft / (pageW || 1);
}

function cacheMetrics() {
    pageW = pagesEl.clientWidth || window.innerWidth || 1;
    const dockW = plaquesEl.clientWidth || window.innerWidth || 1;
    const plaqueW = dockW * PLAQUE_FRAC;
    const sidePad = (dockW - plaqueW) / 2;
    plaqueStepPx = plaqueW + PLAQUE_GAP;
    pagesEl.style.setProperty("--page-w", `${pageW}px`);
    plaquesEl.style.setProperty("--plaque-w", `${plaqueW}px`);
    plaquesEl.style.setProperty("--side-pad", `${sidePad}px`);
}

function applyPlaqueTransform(pageFloat) {
    if (!expanded) return;
    const max = Math.max(pageCount() - 1, 0);
    const clamped = Math.max(0, Math.min(pageFloat, max));
    plaquesStrip.style.transform = `translate3d(${-(clamped * plaqueStepPx)}px,0,0)`;
}

function followPlaques() {
    followRaf = 0;
    applyPlaqueTransform(pageFloatNow());
}

function scheduleFollow() {
    if (!expanded || draggingPlaques || followRaf) return;
    followRaf = requestAnimationFrame(followPlaques);
}

function setActivePlaque(index, withHaptic) {
    const next = Math.max(0, Math.min(index, pageCount() - 1));
    if (next === lastActiveIndex) {
        const key = warehouse.categories[next];
        if (key) selectedKey = key;
        return;
    }
    lastActiveIndex = next;
    const plaques = plaquesStrip.querySelectorAll(".plaque");
    for (let i = 0; i < plaques.length; i += 1) {
        plaques[i].classList.toggle("is-active", i === next);
    }
    const key = warehouse.categories[next];
    if (key) selectedKey = key;
    if (withHaptic) haptic("scroll");
}

function onPagesSettled() {
    const idx = Math.round(pageFloatNow());
    setActivePlaque(idx, true);
    applyPlaqueTransform(idx);
}

function onPagesScroll() {
    scheduleFollow();
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(onPagesSettled, 90);
}

function goToIndex(index, behavior) {
    const i = Math.max(0, Math.min(index, pageCount() - 1));
    const smooth = behavior === "smooth";
    pagesEl.scrollTo({ left: i * pageW, behavior: smooth ? "smooth" : "auto" });
    if (!smooth) applyPlaqueTransform(i);
    setActivePlaque(i, false);
}

function setExpanded(next) {
    if (next === expanded) return;
    expanded = next;
    localStorage.setItem(DOCK_KEY, expanded ? "1" : "0");
    applyDock();
    haptic("light");
    if (expanded) {
        requestAnimationFrame(() => {
            cacheMetrics();
            applyPlaqueTransform(pageFloatNow());
        });
    }
}

function warmupPages() {
    const nodes = pagesStrip.querySelectorAll(".page");
    for (let i = 0; i < nodes.length; i += 1) {
        void nodes[i].scrollHeight;
    }
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
    pagesStrip.innerHTML = keys.length
        ? keys.map((key) => pageHtml(key)).join("")
        : `<section class="page"><div class="empty">Нет разделов</div></section>`;
    plaquesStrip.innerHTML = keys.map((key, i) => plaqueHtml(key, i)).join("");
    const start = Math.max(0, keys.indexOf(selectedKey));
    selectedKey = keys[start] || null;
    requestAnimationFrame(() => {
        cacheMetrics();
        warmupPages();
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

    dockHandle.addEventListener("pointerdown", (event) => {
        dockHandle.setPointerCapture(event.pointerId);
        tracking = true;
        startY = event.clientY;
        dragged = 0;
    });
    dockHandle.addEventListener("pointermove", (event) => {
        if (!tracking) return;
        dragged = event.clientY - startY;
        event.preventDefault();
    });
    const onEnd = () => {
        if (!tracking) return;
        tracking = false;
        if (expanded && dragged > SWIPE_THRESHOLD) setExpanded(false);
        else if (!expanded && dragged < -SWIPE_THRESHOLD) setExpanded(true);
    };
    dockHandle.addEventListener("pointerup", onEnd);
    dockHandle.addEventListener("pointercancel", onEnd);
}

function bindPlaqueDrag() {
    let pointerId = null;
    let startX = 0;
    let startTime = 0;
    let startFloat = 0;
    let moved = 0;
    let pendingFloat = 0;
    let lastX = 0;
    let lastT = 0;
    let vx = 0;
    let dragRaf = 0;

    const maxIndex = () => Math.max(pageCount() - 1, 0);

    const applyDragVisual = () => {
        dragRaf = 0;
        const clamped = Math.max(0, Math.min(pendingFloat, maxIndex()));
        applyPlaqueTransform(clamped);
        pagesStrip.style.transform = `translate3d(${(startFloat - clamped) * pageW}px,0,0)`;
    };

    const onMove = (event) => {
        if (pointerId == null || event.pointerId !== pointerId) return;
        const now = performance.now();
        const dt = Math.max(now - lastT, 1);
        vx = (event.clientX - lastX) / dt;
        lastX = event.clientX;
        lastT = now;
        const dx = event.clientX - startX;
        moved = Math.max(moved, Math.abs(dx));
        pendingFloat = startFloat - dx / (plaqueStepPx || 1);
        if (!dragRaf) dragRaf = requestAnimationFrame(applyDragVisual);
        event.preventDefault();
    };

    const onEnd = (event) => {
        if (pointerId == null || event.pointerId !== pointerId) return;
        pointerId = null;
        if (dragRaf) {
            cancelAnimationFrame(dragRaf);
            applyDragVisual();
        }
        const clamped = Math.max(0, Math.min(pendingFloat, maxIndex()));
        pagesStrip.style.transform = "none";
        draggingPlaques = false;
        try { plaquesEl.releasePointerCapture(event.pointerId); } catch (_) { /* ignore */ }

        const startIndex = Math.round(startFloat);
        let target = startIndex;
        if (moved < 8) {
            const plaque = event.target.closest?.(".plaque");
            const tapped = plaque ? Number(plaque.dataset.index) : startIndex;
            target = Number.isFinite(tapped) ? tapped : startIndex;
        } else {
            const dx = lastX - startX;
            const overallV = dx / Math.max(performance.now() - startTime, 1);
            const speed = Math.abs(vx) > Math.abs(overallV) ? vx : overallV;
            const flick = Math.abs(speed) > 0.32;
            const far = Math.abs(dx) > Math.min(48, pageW * 0.14);
            if (flick || far) {
                target = dx < 0 ? startIndex + 1 : startIndex - 1;
            }
        }
        pagesEl.scrollLeft = clamped * pageW;
        goToIndex(target, "smooth");
    };

    plaquesEl.addEventListener("pointerdown", (event) => {
        if (!expanded) return;
        if (event.pointerType === "mouse" && event.button !== 0) return;
        pointerId = event.pointerId;
        draggingPlaques = true;
        moved = 0;
        vx = 0;
        startX = event.clientX;
        lastX = event.clientX;
        startTime = performance.now();
        lastT = startTime;
        startFloat = pageFloatNow();
        pendingFloat = startFloat;
        plaquesEl.setPointerCapture(event.pointerId);
    });
    plaquesEl.addEventListener("pointermove", onMove);
    plaquesEl.addEventListener("pointerup", onEnd);
    plaquesEl.addEventListener("pointercancel", onEnd);
}

pagesEl.addEventListener("scroll", onPagesScroll, { passive: true });
pagesEl.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (!link) return;
    event.preventDefault();
    openExternal(link.getAttribute("href"));
});
window.addEventListener("resize", () => {
    cacheMetrics();
    const idx = Math.max(0, warehouse.categories.indexOf(selectedKey));
    goToIndex(idx, "auto");
});
refreshBtn.addEventListener("click", () => loadData(true));
retryBtn.addEventListener("click", () => loadData(true));
webBtn.addEventListener("click", () => openExternal(SITE_URL));

bindDockSwipe();
bindPlaqueDrag();
applyDock();
initTelegram();
applySafeArea();
loadData(false);
