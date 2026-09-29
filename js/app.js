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
    const standalone = Boolean(
        window.navigator.standalone
        || window.matchMedia("(display-mode: standalone)").matches,
    );
    const tg = Number(window.Telegram?.WebApp?.safeAreaInset?.bottom || 0);
    const env = getComputedStyle(document.documentElement)
        .getPropertyValue("--safe-bottom")
        .trim();
    const envPx = Number.parseFloat(env) || 0;
    const px = Math.max(envPx, tg, standalone ? 34 : 0);
    if (px > 0) {
        document.documentElement.style.setProperty("--safe-bottom", `${px}px`);
    }
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

function openInfoDialog() {
    const key = selectedKey;
    if (!key) return;
    const info = warehouse.infos[key] || "";
    if (!info.trim()) return;
    infoDlgTitle.textContent = displayTitle(key);
    infoDlgText.textContent = info;
    infoDlg.classList.remove("hidden");
}

function closeInfoDialog() {
    infoDlg.classList.add("hidden");
}

function paneInnerHtml(key) {
    const items = warehouse.positions[key] || [];
    const info = (warehouse.infos[key] || "").trim();
    const body = items.length
        ? items.map((pos) => rowHtml(key, pos)).join("")
        : `<div class="empty">В этом разделе пока пусто</div>`;
    const infoBtn = info
        ? `<button type="button" class="info-btn" aria-label="Информация">i</button>`
        : "";
    return `
        <div class="cat-head">
            <h1 class="cat-title">${escapeHtml(displayTitle(key))}</h1>
            ${infoBtn}
        </div>
        ${body}`;
}

function onPaneScroll(event) {
    const y = event.currentTarget.scrollTop;
    if (y > lastScroll + 8 && y > 40) document.body.classList.add("chrome-away");
    else if (y < lastScroll - 8) document.body.classList.remove("chrome-away");
    lastScroll = y;
}

function createPane(key) {
    const pane = document.createElement("div");
    pane.className = "pane";
    pane.dataset.key = key;
    pane.innerHTML = paneInnerHtml(key);
    pane.addEventListener("scroll", onPaneScroll, { passive: true });
    return pane;
}

function showPane(key) {
    if (!key) {
        stageTrack.replaceChildren();
        return;
    }
    stageTrack.replaceChildren(createPane(key));
    stageTrack.style.transition = "none";
    stageTrack.style.transform = "translate3d(0,0,0)";
    document.body.classList.remove("chrome-away");
    lastScroll = 0;
}

function slideTo(key, dir) {
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
        render();
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
    if (event.target.closest(".info-btn")) {
        openInfoDialog();
        return;
    }
    const link = event.target.closest("a");
    if (!link) return;
    event.preventDefault();
    openExternal(link.getAttribute("href"));
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
        if (sliding || !infoDlg.classList.contains("hidden")) return;
        if (event.pointerType === "mouse" && event.button !== 0) return;
        if (event.target.closest("a, .info-btn, button")) return;
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

bindStageSwipe();

refreshBtn.addEventListener("click", () => loadData(true));
retryBtn.addEventListener("click", () => loadData(true));
webBtn.addEventListener("click", () => openExternal(SITE_URL));

initTelegram();
applySafeArea();
loadData(false);
