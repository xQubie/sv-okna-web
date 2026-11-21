(function () {
  "use strict";

  const width = 800;
  const outputWidth = 1080;
  const scale = outputWidth / width;
  const ink = "#142133", muted = "#52606d", border = "#bcc8ce", green = "#008c45";

  function abortReason(signal) {
    return signal.reason instanceof Error ? signal.reason : new DOMException("Подготовка PNG отменена.", "AbortError");
  }

  function loadImage(source, label, signal) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      let settled = false;
      const timer = setTimeout(() => finish(Error("Не удалось загрузить " + label + ". Обновите страницу и попробуйте ещё раз.")), 8000);
      function finish(error) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener("abort", aborted);
        image.onload = image.onerror = null;
        if (error) { image.src = ""; reject(error); }
        else resolve(image);
      }
      function aborted() { finish(abortReason(signal)); }
      image.onload = () => image.naturalWidth ? finish() : finish(Error("Не удалось прочитать " + label + "."));
      image.onerror = () => finish(Error("Не удалось прочитать " + label + "."));
      signal.addEventListener("abort", aborted, {once:true});
      if (signal.aborted) { aborted(); return; }
      image.src = source;
      if (image.complete && image.naturalWidth) finish();
    });
  }

  function pngBlob(canvas, signal) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(fallback, 4000);
      function finish(error, blob) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener("abort", aborted);
        error ? reject(error) : resolve(blob);
      }
      function aborted() { finish(abortReason(signal)); }
      function fallback() {
        if (settled) return;
        try {
          const encoded = canvas.toDataURL("image/png").split(",")[1];
          if (!encoded) throw Error("PNG недоступен.");
          const bytes = atob(encoded);
          const buffer = Uint8Array.from(bytes, value => value.charCodeAt(0));
          finish(null, new Blob([buffer], {type:"image/png"}));
        } catch (_) { finish(Error("Не удалось создать PNG. Попробуйте ещё раз.")); }
      }
      signal.addEventListener("abort", aborted, {once:true});
      if (signal.aborted) { aborted(); return; }
      try {
        if (typeof canvas.toBlob === "function") canvas.toBlob(blob => blob ? finish(null, blob) : fallback(), "image/png");
        else fallback();
      } catch (_) { fallback(); }
    });
  }

  async function render(html, options = {}) {
    const job = new AbortController();
    const deadline = setTimeout(() => job.abort(Error("Подготовка PNG заняла слишком много времени. Попробуйте ещё раз.")), 25000);
    const cancelled = () => job.abort(options.signal.reason);
    options.signal?.addEventListener("abort", cancelled, {once:true});
    if (options.signal?.aborted) cancelled();
    let canvas;
    const progress = text => { if (job.signal.aborted) throw abortReason(job.signal); options.onProgress?.(text); };
    try {
      progress("Подготавливаем макет коммерческого предложения…");
      const document = new DOMParser().parseFromString(html, "text/html");
      const main = document.querySelector("main");
      if (!main || !main.querySelector(".product")) throw Error("Не удалось подготовить содержимое КП.");
      const assets = new Map();
      progress("Подготавливаем логотип и чертежи…");
      await Promise.all(Array.from(main.querySelectorAll("img,.picture>svg"), async node => {
        let source;
        if (node.localName === "svg") {
          node.setAttribute("xmlns", "http://www.w3.org/2000/svg");
          node.setAttribute("fill", "none");
          node.setAttribute("stroke", ink);
          node.setAttribute("width", "360");
          node.setAttribute("height", "410");
          source = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(node));
        } else {
          source = node.dataset.messenger ? window.PROPOSAL_MESSENGER_PNG?.[node.dataset.messenger] : node.getAttribute("src");
          if (!source?.startsWith("data:image/png")) throw Error("Не удалось загрузить изображения КП. Обновите страницу.");
        }
        assets.set(node, await loadImage(source, node.localName === "svg" ? "чертёж окна" : "логотип", job.signal));
      }));
      progress("Рисуем коммерческое предложение…");
      canvas = window.document.createElement("canvas");
      canvas.width = outputWidth; canvas.height = 1;
      let context = canvas.getContext("2d");
      if (!context) throw Error("Браузер не поддерживает сохранение PNG.");
      let commands = [];
      const font = (size, bold) => (bold ? "700 " : "400 ") + size + "px Arial, sans-serif";
      const measure = (value, size, bold) => { context.font = font(size, bold); return context.measureText(value).width; };
      function wrap(value, available, size, bold) {
        const result = [];
        for (const paragraph of String(value).replace(/\r/g, "").split("\n")) {
          const words = paragraph.trim().split(/\s+/).filter(Boolean);
          let line = "";
          for (let word of words) {
            const candidate = line ? line + " " + word : word;
            if (measure(candidate, size, bold) <= available) { line = candidate; continue; }
            if (line) { result.push(line); line = ""; }
            while (measure(word, size, bold) > available && word.length > 1) {
              const points = Array.from(word);
              let count = 1;
              while (count < points.length && measure(points.slice(0, count + 1).join(""), size, bold) <= available) count++;
              result.push(points.slice(0, count).join("")); word = points.slice(count).join("");
            }
            line = word;
          }
          result.push(line);
        }
        return result;
      }
      function text(value, x, y, available, size = 13, bold = false, color = ink, align = "left", lineHeight = size * 1.4) {
        const lines = wrap(value, available, size, bold);
        for (let index = 0; index < lines.length; index++) commands.push({kind:"text",value:lines[index],x:x + (align === "right" ? available : align === "center" ? available / 2 : 0),y:y + index * lineHeight,size,bold,color,align});
        return lines.length * lineHeight;
      }
      function fitted(value, right, y, available, size, bold, color = ink) {
        while (size > 9 && measure(value, size, bold) > available) size -= .5;
        commands.push({kind:"text",value,x:right,y,size,bold,color,align:"right"});
        return size * 1.4;
      }
      function line(x1, y, x2, color = border, thickness = 1) { commands.push({kind:"line",x1,y,x2,color,thickness}); }
      function image(node, x, y, w, h) { if (node) commands.push({kind:"image",source:assets.get(node),x,y,w,h}); }
      function group(build) {
        const parent = commands; commands = [];
        const height = build(), children = commands;
        commands = parent;
        return {height,children};
      }
      function place(content, x, y) { commands.push({kind:"group",content,x,y}); }
      const content = node => node?.textContent.trim() || "";
      let y = 28;
      const header = main.querySelector(".brand-header");
      if (header) {
        const messenger = header.querySelector(".messenger-contact");
        const logo = header.querySelector(".brand-logo");
        const supplierX = messenger ? 505 : logo ? 228 : 30;
        const supplierWidth = 770 - supplierX;
        const supplier = group(() => {
          let top = 0;
          for (const paragraph of header.querySelectorAll(".supplier>p")) {
            const bold = paragraph.classList.contains("supplier-name");
            top += 3;
            top += text(content(paragraph), 0, top, supplierWidth, bold ? 17 : 12, bold, ink, "right", bold ? 22.1 : 16.8) + 3;
          }
          return top;
        });
        const height = Math.max(logo ? 70 : 0, messenger ? 51 : 0, supplier.height);
        image(logo, 30, y + (height - 70) / 2, 170, 70);
        if (messenger) {
          const icons = Array.from(messenger.querySelectorAll("img"));
          const span = icons.length * 28 + Math.max(0, icons.length - 1) * 8;
          const top = y + (height - 51) / 2;
          icons.forEach((icon, index) => image(icon, 400 - span / 2 + index * 36, top, 28, 28));
          text(content(messenger.querySelector(".messenger-phone")), 313, top + 34, 174, 12, true, ink, "center", 16.8);
        }
        place(supplier, supplierX, y + (height - supplier.height) / 2);
        line(30, y + height + 14, 770, green, 2);
        y += height + 32;
      }
      const heading = main.querySelector(".document-heading");
      const date = content(heading?.querySelector("p"));
      const dateWidth = Math.min(180, measure(date, 11, false));
      const titleHeight = text(content(heading?.querySelector("h1")), 30, y, 740 - dateWidth - 18, 18, true, ink, "left", 24.3);
      text(date, 770 - dateWidth, y + 6, dateWidth || 1, 11, false, muted, "right", 15.4);
      y += Math.max(titleHeight, 21.4) + 15;
      const customer = main.querySelector(".customer");
      if (customer) {
        for (const row of customer.children) {
          const labelHeight = text(content(row.querySelector("dt")), 30, y, 98, 13, false, muted);
          const valueHeight = text(content(row.querySelector("dd")), 138, y, 632);
          y += Math.max(labelHeight, valueHeight) + 3;
        }
        y += 18;
      }
      for (const product of main.querySelectorAll(".product")) {
        line(30, y, 770); y += 14;
        const quantity = content(product.querySelector(".product-heading>span"));
        const quantityWidth = Math.min(160, measure(quantity, 13, true));
        const headingHeight = text(content(product.querySelector("h2")), 30, y, 740 - quantityWidth - 16, 14, true, ink, "left", 18.9);
        fitted(quantity, 770, y, quantityWidth || 1, 13, true);
        y += Math.max(headingHeight, 18.9) + 10;
        const description = group(() => {
          let top = 0;
          for (const row of product.querySelectorAll(".specifications>div")) {
            top += 3;
            const labelHeight = text(content(row.querySelector("dt")), 0, top, 120, 12, false, muted, "left", 16.8);
            const valueHeight = text(content(row.querySelector("dd")), 130, top, 390, 12, false, ink, "left", 16.8);
            top += Math.max(labelHeight, valueHeight) + 3;
            line(0, top, 520, "#e1e6e9"); top++;
          }
          top += 10;
          const unit = product.querySelector(".item-price-unit");
          if (unit) top += text(content(unit), 0, top, 520, 12, false, muted, "right", 16.8) + 4;
          top += fitted(content(product.querySelector(".item-price>strong")), 520, top, 520, 17, true);
          return top;
        });
        const bodyHeight = Math.max(219, description.height);
        image(product.querySelector(".picture>svg"), 40, y + (bodyHeight - 219) / 2 + 7, 180, 205);
        place(description, 250, y + (bodyHeight - description.height) / 2);
        y += bodyHeight + 16;
      }
      y += 4; line(30, y, 770, green, 2); y += 15;
      const quantities = group(() => {
        let top = 4;
        for (const paragraph of main.querySelectorAll(".quantities>p")) {
          const label = Array.from(paragraph.childNodes).filter(node => node.nodeType === 3).map(node => node.textContent).join("").trim();
          top += text(label, 0, top, 375, 12, false, ink, "left", 16.8) + 2;
          top += text(content(paragraph.querySelector("b")), 0, top, 375, 14, true, ink, "left", 19.6) + 9;
        }
        return top;
      });
      const sums = group(() => {
        let top = 0;
        for (const row of main.querySelectorAll(".sums>div")) {
          const total = row.classList.contains("total");
          if (total) { top += 7; line(0, top, 340, "#aebdc6"); top += 9; }
          else top += 4;
          const size = total ? 17 : 13;
          const value = content(row.querySelector("strong"));
          const valueWidth = Math.max(50, Math.min(154, measure(value, size, true)));
          const labelHeight = text(content(row.querySelector("span")), 0, top, 340 - valueWidth - 16, size, total);
          const valueHeight = fitted(value, 340, top, valueWidth, size, true);
          top += Math.max(labelHeight, valueHeight) + 4;
        }
        return top;
      });
      place(quantities, 30, y); place(sums, 430, y);
      y += Math.max(quantities.height, sums.height);
      const notes = main.querySelector(".notes");
      if (notes) { y += 18; y += text(content(notes), 30, y, 740, 12, false, ink, "left", 16.8); }
      const height = Math.ceil((y + 28) * scale);
      if (height * outputWidth > 16000000) throw Error("КП слишком длинное для одной картинки. Разделите заказ на части.");
      canvas.height = height;
      context = canvas.getContext("2d");
      context.scale(scale, scale);
      context.fillStyle = "#fff"; context.fillRect(0, 0, width, height / scale);
      function paint(items) {
        for (const command of items) {
          if (command.kind === "group") {
            context.save(); context.translate(command.x, command.y); paint(command.content.children); context.restore();
          } else if (command.kind === "text") {
            context.font = font(command.size, command.bold); context.fillStyle = command.color;
            context.textAlign = command.align; context.textBaseline = "top";
            context.fillText(command.value, command.x, command.y);
          } else if (command.kind === "line") {
            context.beginPath(); context.lineWidth = command.thickness; context.strokeStyle = command.color;
            context.moveTo(command.x1, command.y); context.lineTo(command.x2, command.y); context.stroke();
          } else if (command.kind === "image") {
            const fit = Math.min(command.w / command.source.naturalWidth, command.h / command.source.naturalHeight);
            const w = command.source.naturalWidth * fit, h = command.source.naturalHeight * fit;
            context.drawImage(command.source, command.x + (command.w - w) / 2, command.y + (command.h - h) / 2, w, h);
          }
        }
      }
      paint(commands);
      progress("Сохраняем изображение PNG…");
      const blob = await pngBlob(canvas, job.signal);
      return {blob,width:outputWidth,height};
    } finally {
      clearTimeout(deadline);
      if (!job.signal.aborted) job.abort(new DOMException("Подготовка завершена.", "AbortError"));
      options.signal?.removeEventListener("abort", cancelled);
      if (canvas) { canvas.width = 1; canvas.height = 1; }
    }
  }

  window.ProposalCanvas = Object.freeze({render});
})();
