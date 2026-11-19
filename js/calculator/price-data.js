"use strict";

// Remote prices are data. Downloaded JavaScript is never evaluated.
window.PriceData = (() => {
  const storageKey = "svokna-web-calculator:prices:v1";
  const bundled = structuredClone(window.SV_PRICES);
  const bundledVersion = "4512186f0d817ed0cacb8013660b828c60b9989b237a2c5337ebedd55bc48c29";
  const finitePrice = value => Number.isFinite(value) && value >= 0 && value <= 1e9;
  function validate(prices) {
    if (!prices || !Number.isFinite(prices.coeff) || prices.coeff <= 0 || prices.coeff > 100) return false;
    const tables = {colors:4, glassOut:4, glassIn:4, profile:4, handles:3, hinges:2};
    return Object.entries(tables).every(([name, width]) => {
      const rows = prices[name];
      if (!Array.isArray(rows) || !rows.length || rows.length > 2000) return false;
      if (new Set(rows.map(row => row?.[0])).size !== rows.length) return false;
      return rows.every(row => Array.isArray(row) && row.length === width && row.every((cell, index) => {
        if (name === "handles" && index === 0) return Number.isInteger(cell) && cell >= 10 && cell <= 15;
        if (index === 0 || ((name === "glassOut" || name === "glassIn" || name === "handles") && index === 1))
          return typeof cell === "string" && cell.length > 0 && cell.length < 180;
        return finitePrice(cell);
      }));
    }) && prices.colors[0][0] === "Без отделки"
      && [10,11,12,13,14,15].every(id => prices.handles.some(row => row[0] === id))
      && ["4","4МФ","4зак","4мат"].every(id => prices.glassOut.some(row => row[0] === id))
      && ["4И","4зак","4мат"].every(id => prices.glassIn.some(row => row[0] === id))
      && prices.profile.length === 3 && prices.profile.every((row,index) => row[0] === bundled.profile[index][0])
      && prices.colors.every(row => [0,1].includes(row[1]) && [0,1,2].includes(row[3]))
      && prices.glassOut.every(row => row[3] === 4) && prices.glassIn.every(row => row[3] === 4);
  }
  let current = {prices:bundled, version:bundledVersion, checkedAt:null};
  try {
    const cached = JSON.parse(localStorage.getItem(storageKey));
    if (cached && validate(cached.prices) && /^[a-f0-9]{64}$/i.test(cached.version)) current = cached;
  } catch { /* The bundled price list remains available. */ }
  window.SV_PRICES = structuredClone(current.prices);
  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  function accept(message) {
    if (!validate(message.prices) || !/^[a-f0-9]{64}$/i.test(message.version)) throw Error("Формат прайса изменился. Сохранён последний проверенный прайс.");
    const changed = !same(current.prices, message.prices);
    const next = {prices:message.prices, version:changed ? message.version.toLowerCase() : current.version, checkedAt:message.checkedAt};
    localStorage.setItem(storageKey, JSON.stringify(next));
    current = next;
    return changed;
  }
  return {validate, accept, same, bundled, get current() { return current; }};
})();
