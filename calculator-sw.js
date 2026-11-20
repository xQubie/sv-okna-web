"use strict";

// Bump BUILD and offline-shell.js's worker URL whenever this snapshot changes.
// Only the calculator's public shell is stored. Price and warehouse data never are.
const BUILD = "v5-5a0979efed97";
const BASE = new URL("./", self.location.href);
const CACHE_PREFIX = "svokna-calculator-public-shell:" + encodeURIComponent(BASE.pathname) + ":";
const CACHE_NAME = CACHE_PREFIX + BUILD;
const SHELL_URL = new URL("calculator.html", BASE).href;
const CALCULATOR_URL = new URL("calculator", BASE).href;
const ASSETS = [
  "css/app.css?v=46", "css/calculator.css?v=5", "js/theme.js?v=45",
  "js/calculator/prices.js", "js/calculator/price-data.js?v=5",
  "js/calculator/colors.js", "js/calculator/engine.js", "js/calculator/ui.js",
  "js/calculator/dimension-inputs.js", "js/calculator/brand-assets.js",
  "js/calculator/messenger-assets.js", "js/calculator/proposal-drawing.js",
  "js/calculator/messenger-png-assets.js?v=3", "js/calculator/proposal-canvas.js?v=3",
  "js/calculator/export-png.js?v=4", "js/calculator/price-gate.js?v=5",
  "js/calculator/browser-adapter.js?v=5", "js/calculator/app.js?v=5",
  "js/calculator/offline-shell.js?v=5", "img/bg_windows.jpg", "img/favicon.png",
  "img/apple-touch-icon.png", "img/icon-192.png", "img/icon-512.png", "manifest.webmanifest"
].map(path => new URL(path, BASE).href);
const PUBLIC_URLS = new Set(ASSETS);
const CALCULATOR_PATHS = new Set(["calculator", "calculator.html", "calculator/"].map(path => new URL(path, BASE).pathname));
const WAREHOUSE_PATHS = new Set(["./", "index", "index.html"].map(path => new URL(path, BASE).pathname));

function calculatorUrl(url) {
  return url.origin === BASE.origin && CALCULATOR_PATHS.has(url.pathname);
}

function validResponse(response, url, html = false) {
  if (!response.ok || response.type === "opaque") throw Error("Public shell resource unavailable.");
  const actual = new URL(response.url || url);
  const expected = new URL(url);
  if (actual.origin !== BASE.origin || (html ? !calculatorUrl(actual) : actual.pathname !== expected.pathname)) {
    throw Error("Unexpected public resource redirect.");
  }
  const mime = response.headers.get("Content-Type") || "";
  if (html ? !/text\/html/i.test(mime) : /\.js$/.test(expected.pathname) ? !/(?:javascript|ecmascript)/i.test(mime)
    : /\.css$/.test(expected.pathname) ? !/text\/css/i.test(mime)
    : /\.(?:png|jpg)$/.test(expected.pathname) ? !/image\//i.test(mime) : !/json/i.test(mime)) {
    throw Error("Unexpected public resource format.");
  }
}

function validateDocument(html) {
  const seen = new Set();
  for (const match of html.matchAll(/<(script|link)\b[^>]*>/gi)) {
    if (match[1].toLowerCase() === "link" && !/\brel\s*=\s*["'](?:stylesheet|icon|apple-touch-icon|manifest)["']/i.test(match[0])) continue;
    const source = /\b(?:src|href)\s*=\s*(["'])(.*?)\1/i.exec(match[0]);
    if (!source) continue;
    const url = new URL(source[2].replace(/&amp;/gi, "&"), SHELL_URL);
    // Telegram is optional and loaded asynchronously; no third-party bytes are stored.
    if (url.href === "https://telegram.org/js/telegram-web-app.js") continue;
    if (!PUBLIC_URLS.has(url.href)) throw Error("Calculator snapshot revision mismatch.");
    seen.add(url.href);
  }
  for (const url of ASSETS) {
    if (/\.(?:js|css)$/.test(new URL(url).pathname) && !seen.has(url)) throw Error("Incomplete calculator document.");
  }
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const options = {cache:"no-store", credentials:"omit", signal:controller.signal};
      const shell = await fetch(SHELL_URL, options);
      validResponse(shell, SHELL_URL, true);
      const html = await shell.text();
      validateDocument(html);
      // cleanUrls may redirect .html to /calculator. Cached navigation must be
      // non-redirected so it is valid for a browser navigation's manual mode.
      const cachedShell = new Response(html, {status:200, headers:{"Content-Type":"text/html; charset=utf-8"}});
      const responses = await Promise.all(ASSETS.map(async url => {
        const response = await fetch(url, options);
        validResponse(response, url);
        // Drain each download immediately: unread streams can exhaust the
        // worker's connection pool before the remaining fetches get headers.
        await response.clone().arrayBuffer();
        return response;
      }));
      const cache = await caches.open(CACHE_NAME);
      await Promise.all([cache.put(SHELL_URL, cachedShell), ...ASSETS.map((url, index) => cache.put(url, responses[index]))]);
      await self.skipWaiting();
    } catch (error) {
      await caches.delete(CACHE_NAME);
      throw error;
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    if ((await Promise.all([SHELL_URL, ...ASSETS].map(url => cache.match(url)))).some(response => !response)) {
      throw Error("Calculator snapshot is incomplete.");
    }
    await Promise.all((await caches.keys()).filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function calculatorNavigation(request) {
  const controller = new AbortController();
  let delivered = false;
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await fetch(request, {cache:"no-store", signal:controller.signal});
    validResponse(response, request.url, true);
    // Include body download in the deadline, while returning the original response.
    await response.clone().arrayBuffer();
    delivered = true;
    return response;
  } catch {
    return await (await caches.open(CACHE_NAME)).match(SHELL_URL)
      || new Response("Калькулятор пока недоступен офлайн. Откройте его один раз с интернетом.", {status:503, headers:{"Content-Type":"text/plain; charset=utf-8"}});
  } finally {
    clearTimeout(timer);
    if (!delivered) controller.abort();
  }
}

async function warehouseNavigation(request) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    // No warehouse response enters Cache Storage, including HTTP error responses.
    const response = await fetch(request, {cache:"no-store", signal:controller.signal});
    if (response.ok) await response.clone().arrayBuffer();
    return response;
  } catch (error) {
    if (await (await caches.open(CACHE_NAME)).match(SHELL_URL)) return Response.redirect(CALCULATOR_URL, 302);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== BASE.origin || url.pathname.startsWith(new URL("api/", BASE).pathname)) return;
  if (request.mode === "navigate") {
    if (calculatorUrl(url)) {
      // A trailing slash would change all relative CSS/script addresses in cached HTML.
      event.respondWith(url.pathname.endsWith("/") ? Response.redirect(CALCULATOR_URL + url.search, 302) : calculatorNavigation(request));
    } else if (WAREHOUSE_PATHS.has(url.pathname)) event.respondWith(warehouseNavigation(request));
    return;
  }
  if (PUBLIC_URLS.has(url.href)) {
    event.respondWith((async () => await (await caches.open(CACHE_NAME)).match(url.href) || fetch(request))());
  }
});
