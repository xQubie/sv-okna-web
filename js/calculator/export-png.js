(function () {
  "use strict";

  let lastExport = null;
  let resultDialog;
  let pendingSave = null;
  let preparationController = null;

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
    resultDialog.addEventListener("close", () => {
      if (!resultDialog.open && resultDialog.dataset.state === "loading") preparationController?.abort(new DOMException("Подготовка PNG отменена.", "AbortError"));
    });
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

  async function render(html, options) {
    if (typeof window.ProposalCanvas?.render !== "function") throw Error("Не удалось загрузить модуль PNG. Обновите страницу.");
    return window.ProposalCanvas.render(html, options);
  }

  async function prepare(html, title) {
    const controller = new AbortController();
    preparationController = controller;
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
      await new Promise(resolve => setTimeout(resolve, 0));
      if (controller.signal.aborted || !preview.open) throw controller.signal.reason || new DOMException("Подготовка PNG отменена.", "AbortError");
      const rendered = await render(html, {signal:controller.signal,onProgress:text => { preview.querySelector(".png-result-size").textContent = text; }});
      if (controller.signal.aborted || !preview.open) throw controller.signal.reason || new DOMException("Подготовка PNG отменена.", "AbortError");
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
      preview.dataset.state = error.name === "AbortError" ? "cancelled" : "error";
      preview.querySelector("h2").textContent = "Не удалось создать PNG";
      preview.querySelector(".png-result-size").textContent = /[А-Яа-яЁё]/.test(error?.message || "")
        ? error.message : "Не удалось подготовить изображение. Закройте это окно и попробуйте ещё раз.";
      throw error;
    } finally {
      if (preparationController === controller) preparationController = null;
      preview.removeAttribute("aria-busy");
    }
  }

  function save(html, title) {
    if (!pendingSave) pendingSave = prepare(html, title).finally(() => { pendingSave = null; });
    return pendingSave;
  }

  window.CalculatorPNG = Object.freeze({save, render, get lastExport() { return lastExport; }});
})();
