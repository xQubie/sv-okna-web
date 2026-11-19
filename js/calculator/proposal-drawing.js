(function () {
  "use strict";

  const svgNamespace = "http://www.w3.org/2000/svg";
  const drawingWidth = 180;
  const drawingHeight = 205;
  const inset = {left: 36, top: 28, width: 136, height: 169};
  const annotationColor = "#52606d";
  const textColor = "#142133";

  function placeholder() {
    return '<svg xmlns="' + svgNamespace + '" width="180" height="205" viewBox="0 0 180 205" role="img" aria-label="Эскиз недоступен"><text x="90" y="102" fill="' + textColor + '" stroke="none" font-family="Arial,sans-serif" font-size="11" text-anchor="middle">Эскиз недоступен</text></svg>';
  }

  function numberAttribute(element, name, fallback = 0) {
    const value = Number.parseFloat(element.getAttribute(name));
    return Number.isFinite(value) ? value : fallback;
  }

  function line(x1, y1, x2, y2, role = "") {
    return '<line' + (role ? ' data-role="' + role + '"' : '') + ' x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" fill="none" stroke="' + annotationColor + '" stroke-width="0.8"/>';
  }

  function caption(value, x, y, role) {
    return '<text data-role="' + role + '" x="' + x + '" y="' + y + '" text-anchor="middle" dominant-baseline="central" fill="' + textColor + '" stroke="none" font-family="Arial,sans-serif" font-size="10.5" font-weight="600">' + value + ' мм</text>';
  }

  function background(x, y, width, height) {
    return '<rect x="' + x + '" y="' + y + '" width="' + width + '" height="' + height + '" fill="#ffffff" stroke="none"/>';
  }

  window.proposalDrawing = function (item) {
    const width = Number(item?.config?.width);
    const height = Number(item?.config?.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || typeof item?.svg !== "string") return placeholder();

    // Older saved drawings omit xmlns. Add it before parsing so nested SVG nodes
    // retain their namespace when the standalone drawing is serialized.
    const markup = item.svg.replace(/<svg\b([^>]*)>/i, (opening, attributes) => (
      /\bxmlns\s*=/.test(attributes) ? opening : '<svg xmlns="' + svgNamespace + '"' + attributes + '>'
    ));
    const parsed = new DOMParser().parseFromString(markup, "image/svg+xml");
    const raw = parsed.documentElement;
    if (parsed.querySelector("parsererror") || raw.localName !== "svg" || raw.namespaceURI !== svgNamespace) return placeholder();
    const frame = raw.querySelector('[data-role="outer-frame"]') || raw.querySelector("rect");
    if (!frame) return placeholder();

    const frameX = numberAttribute(frame, "x");
    const frameY = numberAttribute(frame, "y");
    const frameWidth = numberAttribute(frame, "width");
    const frameHeight = numberAttribute(frame, "height");
    if (frameWidth <= 0 || frameHeight <= 0) return placeholder();
    let viewBox = (raw.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
    if (viewBox.length !== 4 || !viewBox.every(Number.isFinite) || viewBox[2] <= 0 || viewBox[3] <= 0) {
      viewBox = [0, 0, numberAttribute(raw, "width", frameX + frameWidth), numberAttribute(raw, "height", frameY + frameHeight)];
    }
    if (viewBox[2] <= 0 || viewBox[3] <= 0) return placeholder();

    // Only the saved outer SVG viewport changes. Its paths, frame and colors remain intact.
    raw.setAttribute("x", String(inset.left));
    raw.setAttribute("y", String(inset.top));
    raw.setAttribute("width", String(inset.width));
    raw.setAttribute("height", String(inset.height));
    raw.setAttribute("viewBox", viewBox.join(" "));
    raw.setAttribute("preserveAspectRatio", "xMidYMid meet");
    raw.setAttribute("data-role", "proposal-window");
    frame.setAttribute("data-role", "outer-frame");
    raw.querySelectorAll("script,foreignObject").forEach(node => node.remove());
    for (const node of [raw, ...raw.querySelectorAll("*")]) {
      for (const attribute of Array.from(node.attributes)) {
        if (/^on/i.test(attribute.name) || /href$/i.test(attribute.name)) node.removeAttribute(attribute.name);
      }
    }

    const scale = Math.min(inset.width / viewBox[2], inset.height / viewBox[3]);
    const offsetX = inset.left + (inset.width - viewBox[2] * scale) / 2;
    const offsetY = inset.top + (inset.height - viewBox[3] * scale) / 2;
    const left = offsetX + (frameX - viewBox[0]) * scale;
    const top = offsetY + (frameY - viewBox[1]) * scale;
    const right = left + frameWidth * scale;
    const bottom = top + frameHeight * scale;
    const widthY = top - 11;
    const heightX = left - 14;
    const widthCenter = (left + right) / 2;
    const heightCenter = (top + bottom) / 2;
    const widthTextLength = String(width).length * 6 + 18;
    const heightTextLength = String(height).length * 6 + 18;
    const shortWidth = right - left < widthTextLength + 12;
    const shortHeight = bottom - top < heightTextLength + 12;
    const ticks = line(left - 2, widthY + 2, left + 2, widthY - 2)
      + line(right - 2, widthY + 2, right + 2, widthY - 2)
      + line(heightX - 2, top + 2, heightX + 2, top - 2)
      + line(heightX - 2, bottom + 2, heightX + 2, bottom - 2);
    const dimensions = line(left, widthY, right, widthY, "dimension-width-line")
      + line(left, widthY - 2, left, top - 2) + line(right, widthY - 2, right, top - 2)
      + line(heightX, top, heightX, bottom, "dimension-height-line")
      + line(heightX - 2, top, left - 2, top) + line(heightX - 2, bottom, left - 2, bottom)
      + ticks;
    const widthLabel = (shortWidth ? "" : background(widthCenter - widthTextLength / 2 - 3, widthY - 7, widthTextLength + 6, 14))
      + caption(width, widthCenter, shortWidth ? widthY - 9 : widthY, "dimension-width-label");
    const heightCaptionX = shortHeight ? heightX - 9 : heightX;
    const heightCaptionY = Math.max(heightTextLength / 2 + 3, Math.min(heightCenter, drawingHeight - heightTextLength / 2 - 3));
    const heightLabel = '<g transform="translate(' + heightCaptionX + ' ' + heightCaptionY + ') rotate(-90)">'
      + (shortHeight ? "" : background(-heightTextLength / 2 - 3, -7, heightTextLength + 6, 14))
      + caption(height, 0, 0, "dimension-height-label") + '</g>';
    const savedDrawing = new XMLSerializer().serializeToString(raw);
    return '<svg xmlns="' + svgNamespace + '" data-role="proposal-drawing" width="' + drawingWidth + '" height="' + drawingHeight + '" viewBox="0 0 180 205" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Окно, ширина ' + width + ' мм, высота ' + height + ' мм">'
      + savedDrawing + dimensions + widthLabel + heightLabel + '</svg>';
  };
})();
