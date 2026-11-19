(function () {
  "use strict";

  const picker = document.getElementById("dimension-picker");
  const options = document.getElementById("dimension-options");
  const heading = document.getElementById("dimension-picker-title");
  const values = Array.from({length: 77}, (_, index) => 400 + index * 50);
  const optionNodes = [];
  let activeInput = null;
  let activeTrigger = null;
  let activeIndex = 0;

  const fragment = document.createDocumentFragment();
  for (const value of values) {
    const option = document.createElement("button");
    option.type = "button";
    option.id = "dimension-option-" + value;
    option.className = "dimension-option";
    option.dataset.value = String(value);
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", "false");
    option.tabIndex = -1;
    option.innerHTML = '<span>' + value.toLocaleString("ru-RU") + ' мм</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4 10-10"/></svg>';
    optionNodes.push(option);
    fragment.append(option);
  }
  options.append(fragment);

  function highlight(index, centered = false) {
    activeIndex = Math.max(0, Math.min(values.length - 1, index));
    optionNodes.forEach((option, position) => option.classList.toggle("is-active", position === activeIndex));
    const active = optionNodes[activeIndex];
    options.setAttribute("aria-activedescendant", active.id);
    const optionTop = active.offsetTop - options.offsetTop;
    if (centered) {
      options.scrollTop = optionTop - (options.clientHeight - active.offsetHeight) / 2;
    } else if (optionTop < options.scrollTop) {
      options.scrollTop = optionTop;
    } else if (optionTop + active.offsetHeight > options.scrollTop + options.clientHeight) {
      options.scrollTop = optionTop + active.offsetHeight - options.clientHeight;
    }
  }

  function openPicker(trigger) {
    const input = document.getElementById(trigger.dataset.dimension);
    if (!input || input.disabled || picker.open) return;
    activeInput = input;
    activeTrigger = trigger;
    heading.textContent = input.id === "svc-h" ? "Высота окна, мм" : "Ширина окна, мм";
    const entered = Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : 400;
    const nearest = Math.round((entered - 400) / 50);
    optionNodes.forEach(option => option.setAttribute("aria-selected", String(Number(option.dataset.value) === entered)));
    trigger.setAttribute("aria-expanded", "true");
    input.blur();
    picker.showModal();
    options.focus({preventScroll: true});
    requestAnimationFrame(() => highlight(nearest, true));
  }

  function choose(value) {
    if (!activeInput) return;
    activeInput.value = String(value);
    activeInput.dispatchEvent(new Event("input", {bubbles: true}));
    activeInput.dispatchEvent(new Event("change", {bubbles: true}));
    picker.close();
  }

  function closeIfOpen() {
    if (!picker.open) return false;
    picker.close();
    return true;
  }

  document.addEventListener("click", event => {
    if (!(event.target instanceof Element)) return;
    const trigger = event.target.closest(".dimension-toggle");
    if (trigger) {
      event.preventDefault();
      openPicker(trigger);
      return;
    }
    const option = event.target.closest(".dimension-option");
    if (option && picker.open) choose(Number(option.dataset.value));
  });

  document.addEventListener("keydown", event => {
    if (!(event.target instanceof Element)) return;
    if (event.altKey && event.key === "ArrowDown" && ["svc-h", "svc-w"].includes(event.target.id)) {
      event.preventDefault();
      openPicker(document.querySelector('.dimension-toggle[data-dimension="' + event.target.id + '"]'));
    }
  });

  options.addEventListener("keydown", event => {
    const moves = {ArrowDown: 1, ArrowUp: -1, PageDown: 7, PageUp: -7};
    if (Object.hasOwn(moves, event.key)) {
      event.preventDefault();
      highlight(activeIndex + moves[event.key]);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      highlight(event.key === "Home" ? 0 : values.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(values[activeIndex]);
    }
  });

  document.getElementById("dimension-picker-close").addEventListener("click", closeIfOpen);
  picker.addEventListener("cancel", event => {
    event.preventDefault();
    picker.close();
  });
  picker.addEventListener("click", event => {
    if (event.target !== picker) return;
    const bounds = picker.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) picker.close();
  });
  picker.addEventListener("close", () => {
    activeTrigger?.setAttribute("aria-expanded", "false");
    activeTrigger?.focus({preventScroll: true});
    activeInput = null;
    activeTrigger = null;
  });

  window.DimensionInputs = Object.freeze({closeIfOpen});
})();
