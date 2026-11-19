(function () {
  "use strict";

  const cssWidth = 800;
  const outputWidth = 1080;
  const scale = outputWidth / cssWidth;
  let lastExport = null;
  let resultDialog;
  let pendingSave = null;

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  function shareableFile(result) {
    try {
      if (typeof File !== "function" || typeof navigator.share !== "function" || typeof navigator.canShare !== "function") return null;
      const file = new File([result.blob], result.filename, {type:"image/png"});
      return navigator.canShare({files:[file]}) ? file : null;
    } catch (_) {
      return null;
    }
  }

  function filename(title) {
    const safe = String(title || "Коммерческое предложение")
      .replace(/[\u0000-\u001f<>:"/\\|?*]/g, " ").replace(/\s+/g, " ").trim().slice(0, 96);
    return (safe || "Коммерческое предложение") + ".png";
  }

  function dialog() {
    if (resultDialog) return resultDialog;
    resultDialog = document.createElement("dialog");
    resultDialog.id = "png-result";
    resultDialog.setAttribute("aria-labelledby", "png-result-title");
    resultDialog.innerHTML = '<div class="png-result-heading"><h2 id="png-result-title">Готовим PNG…</h2><button type="button" class="icon-button" aria-label="Закрыть предпросмотр">×</button></div><div class="png-result-preview" hidden><img alt="Предпросмотр коммерческого предложения"></div><p class="png-result-size" role="status" aria-live="polite"></p><p class="png-result-help field-help" hidden></p><div class="png-result-actions"><button id="png-share" class="outline" type="button" hidden>Поделиться</button><a id="png-open" class="outline" target="_blank" rel="noopener" hidden>Открыть изображение</a><a id="png-download" class="primary" hidden>Скачать PNG</a></div>';
    document.body.append(resultDialog);
    resultDialog.querySelector(".icon-button").addEventListener("click", () => resultDialog.close());
    resultDialog.addEventListener("click", event => {
      if (event.target !== resultDialog) return;
      const bounds = resultDialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) resultDialog.close();
    });
    resultDialog.querySelector("#png-share").addEventListener("click", () => {
      const current = lastExport;
      if (!current?.file) return;
      const failed = error => {
        if (error?.name === "AbortError" || lastExport !== current) return;
        resultDialog.querySelector(".png-result-size").textContent = "Меню сохранения недоступно. Откройте изображение и сохраните его с удержанием или скачайте PNG.";
      };
      try {
        // iOS requires a fresh tap: the file is ready before this handler runs.
        // Share only the image so the native menu can offer saving to Photos.
        const sharing = navigator.share({files:[current.file]});
        Promise.resolve(sharing).catch(failed);
      } catch (error) {
        failed(error);
      }
    });
    return resultDialog;
  }

  async function render(html) {
    if (typeof window.html2canvas !== "function") throw Error("Не удалось загрузить модуль PNG. Обновите страницу.");
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("sandbox", "allow-same-origin");
    frame.tabIndex = -1;
    frame.style.cssText = "position:fixed;left:-20000px;top:0;width:800px;height:1px;border:0;pointer-events:none;";
    let canvas;
    try {
      const loaded = new Promise((resolve,reject) => {
        const timer = setTimeout(() => reject(Error("Не удалось подготовить КП. Попробуйте ещё раз.")), 15000);
        frame.onload = () => { clearTimeout(timer); resolve(); };
        frame.onerror = () => { clearTimeout(timer); reject(Error("Не удалось открыть макет КП.")); };
        frame.srcdoc = html;
      });
      document.body.append(frame);
      await loaded;
      const frameDocument = frame.contentDocument;
      await frameDocument.fonts.ready;
      await Promise.all(Array.from(frameDocument.images, image => image.decode()));
      // Rasterize embedded SVG logos using the browser's renderer before the
      // document renderer handles them. This preserves their clipping and masks.
      for (const image of Array.from(frameDocument.images)) {
        if (!image.src.startsWith("data:image/svg+xml")) continue;
        const bounds = image.getBoundingClientRect();
        const raster = frameDocument.createElement("canvas");
        raster.width = Math.max(1, Math.ceil(bounds.width * 2));
        raster.height = Math.max(1, Math.ceil(bounds.height * 2));
        const context = raster.getContext("2d");
        const fit = Math.min(raster.width / image.naturalWidth, raster.height / image.naturalHeight);
        const width = image.naturalWidth * fit;
        const height = image.naturalHeight * fit;
        context.drawImage(image, (raster.width-width)/2, (raster.height-height)/2, width, height);
        image.src = raster.toDataURL("image/png");
        await image.decode();
        raster.width = 1; raster.height = 1;
      }
      const main = frameDocument.querySelector("main");
      if (!main) throw Error("Не удалось подготовить содержимое КП.");
      const height = Math.ceil(main.getBoundingClientRect().height);
      if (height < 1 || Math.ceil(height * scale) * outputWidth > 16000000) {
        throw Error("КП слишком длинное для одной картинки. Разделите заказ на части.");
      }
      frame.style.height = height + "px";
      canvas = await window.html2canvas(main, {
        backgroundColor:"#ffffff", scale, width:cssWidth, height,
        windowWidth:cssWidth, windowHeight:height, scrollX:0, scrollY:0,
        allowTaint:false, useCORS:false, foreignObjectRendering:false,
        removeContainer:true, logging:false, imageTimeout:15000
      });
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw Error("Не удалось создать PNG. Попробуйте ещё раз.");
      return {blob, width:canvas.width, height:canvas.height};
    } finally {
      if (canvas) { canvas.width = 1; canvas.height = 1; }
      frame.remove();
    }
  }

  async function prepare(html, title) {
    const oldUrl = lastExport?.url;
    lastExport = null;
    if (oldUrl) setTimeout(() => URL.revokeObjectURL(oldUrl), 60000);
    const preview = dialog();
    preview.dataset.state = "loading";
    preview.setAttribute("aria-busy", "true");
    preview.querySelector("h2").textContent = "Готовим PNG…";
    preview.querySelector(".png-result-size").textContent = "Подготавливаем изображение коммерческого предложения.";
    preview.querySelector(".png-result-preview").hidden = true;
    preview.querySelector(".png-result-help").hidden = true;
    for (const action of preview.querySelectorAll(".png-result-actions > *")) action.hidden = true;
    if (!preview.open) preview.showModal();
    try {
      // Let the preparation feedback paint before rendering the document.
      await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
      const rendered = await render(html);
      lastExport = {...rendered, filename:filename(title), url:URL.createObjectURL(rendered.blob)};
      lastExport.file = shareableFile(lastExport);
      preview.querySelector("img").src = lastExport.url;
      preview.querySelector(".png-result-preview").hidden = false;
      preview.querySelector("h2").textContent = "КП готово";
      preview.querySelector(".png-result-size").textContent = rendered.width + " × " + rendered.height + " px · PNG";
      const download = preview.querySelector("#png-download");
      download.href = lastExport.url;
      download.download = lastExport.filename;
      download.hidden = false;
      const open = preview.querySelector("#png-open");
      open.href = lastExport.url;
      open.hidden = false;
      const share = preview.querySelector("#png-share");
      share.hidden = !lastExport.file;
      const ios = isIOS();
      share.textContent = ios ? "Сохранить изображение" : "Поделиться";
      share.className = ios ? "primary" : "outline";
      open.className = ios && !lastExport.file ? "primary" : "outline";
      download.className = ios ? "outline" : "primary";
      const help = preview.querySelector(".png-result-help");
      help.hidden = !ios;
      help.textContent = lastExport.file
        ? "В меню iPhone выберите «Сохранить изображение». Если этого пункта нет, откройте картинку и нажмите на неё с удержанием."
        : "Откройте картинку и нажмите на неё с удержанием, затем выберите «Сохранить в Фото».";
      preview.dataset.state = "ready";
      return lastExport;
    } catch (error) {
      preview.dataset.state = "error";
      preview.querySelector("h2").textContent = "Не удалось создать PNG";
      preview.querySelector(".png-result-size").textContent = /[А-Яа-яЁё]/.test(error?.message || "")
        ? error.message : "Не удалось подготовить изображение. Закройте это окно и попробуйте ещё раз.";
      throw error;
    } finally {
      preview.removeAttribute("aria-busy");
    }
  }

  function save(html, title) {
    if (!pendingSave) pendingSave = prepare(html, title).finally(() => { pendingSave = null; });
    return pendingSave;
  }

  window.CalculatorPNG = Object.freeze({save, render, get lastExport() { return lastExport; }});
})();
