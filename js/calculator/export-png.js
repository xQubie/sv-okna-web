(function () {
  "use strict";

  const cssWidth = 800;
  const outputWidth = 1080;
  const scale = outputWidth / cssWidth;
  let lastExport = null;
  let resultDialog;

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
    resultDialog.innerHTML = '<div class="png-result-heading"><h2 id="png-result-title">КП готово</h2><button type="button" class="icon-button" aria-label="Закрыть предпросмотр">×</button></div><div class="png-result-preview"><img alt="Предпросмотр коммерческого предложения"></div><p class="png-result-size"></p><div class="png-result-actions"><a id="png-download" class="primary">Скачать PNG</a><button id="png-share" class="outline" type="button" hidden>Поделиться</button></div>';
    document.body.append(resultDialog);
    resultDialog.querySelector(".icon-button").addEventListener("click", () => resultDialog.close());
    resultDialog.addEventListener("click", event => {
      if (event.target !== resultDialog) return;
      const bounds = resultDialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) resultDialog.close();
    });
    resultDialog.querySelector("#png-share").addEventListener("click", async () => {
      if (!lastExport) return;
      const file = new File([lastExport.blob], lastExport.filename, {type:"image/png"});
      try { await navigator.share({files:[file], title:lastExport.filename.replace(/\.png$/, "")}); }
      catch (error) {
        if (error.name !== "AbortError") resultDialog.querySelector(".png-result-size").textContent = "Сохраните PNG кнопкой «Скачать PNG».";
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
    document.body.append(frame);
    let canvas;
    try {
      await new Promise((resolve,reject) => {
        const timer = setTimeout(() => reject(Error("Не удалось подготовить КП. Попробуйте ещё раз.")), 15000);
        frame.onload = () => { clearTimeout(timer); resolve(); };
        frame.onerror = () => { clearTimeout(timer); reject(Error("Не удалось открыть макет КП.")); };
        frame.srcdoc = html;
      });
      const document = frame.contentDocument;
      await document.fonts.ready;
      await Promise.all(Array.from(document.images, image => image.decode()));
      // Rasterize embedded SVG logos using the browser's renderer before the
      // document renderer handles them. This preserves their clipping and masks.
      for (const image of Array.from(document.images)) {
        if (!image.src.startsWith("data:image/svg+xml")) continue;
        const bounds = image.getBoundingClientRect();
        const raster = document.createElement("canvas");
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
      const main = document.querySelector("main");
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

  async function save(html, title) {
    const rendered = await render(html);
    const oldUrl = lastExport?.url;
    lastExport = {...rendered, filename:filename(title), url:URL.createObjectURL(rendered.blob)};
    if (oldUrl) setTimeout(() => URL.revokeObjectURL(oldUrl), 60000);
    const preview = dialog();
    preview.querySelector("img").src = lastExport.url;
    const download = preview.querySelector("#png-download");
    download.href = lastExport.url;
    download.download = lastExport.filename;
    preview.querySelector(".png-result-size").textContent = rendered.width + " × " + rendered.height + " px · PNG";
    const file = new File([rendered.blob], lastExport.filename, {type:"image/png"});
    preview.querySelector("#png-share").hidden = !(navigator.share && navigator.canShare?.({files:[file]}));
    if (!preview.open) preview.showModal();
    return lastExport;
  }

  window.CalculatorPNG = Object.freeze({save, render, get lastExport() { return lastExport; }});
})();
