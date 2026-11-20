'use strict';

const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const ORIGIN = 'https://svokna.com';
const MAX_RESPONSE_BYTES = 512_000;
const REQUEST_TIMEOUT_MS = 8_000;
const FORMULA_HASHES = {
  engine: 'a5cbc45157521b61482fa0b9e7a3c1a9e651972e65074872c881c52708762f11',
  ui: 'ddbb7020cdc9c783a59ba4e5b1dd55fc1c8379572e18a35a8b24f28dfa989320'
};
const TABLE_COLUMNS = { colors: 4, glassOut: 4, glassIn: 4, profile: 4, handles: 3, hinges: 2 };
let bundledPrices;

class FormulaChangedError extends Error {}
class PriceSchemaError extends Error {}
class UpdateServerError extends Error {}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function allowedUrl(value, base = ORIGIN) {
  let url;
  try { url = new URL(value, base); }
  catch { throw new PriceSchemaError('Invalid calculator resource URL.'); }
  if (url.origin !== ORIGIN || url.username || url.password || !url.pathname.startsWith('/calc/')) {
    throw new PriceSchemaError('Unexpected calculator resource URL.');
  }
  url.hash = '';
  return url;
}

async function download(url, signal) {
  const response = await fetch(allowedUrl(url), {
    signal,
    redirect: 'error',
    cache: 'no-store',
    headers: { 'User-Agent': 'SvOknaWebCalculator/1.0', 'Cache-Control': 'no-cache' }
  });
  if (!response.ok || !response.body) throw new UpdateServerError('Calculator resource unavailable.');
  if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) {
    await response.body.cancel();
    throw new PriceSchemaError('Calculator resource exceeds size limit.');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new PriceSchemaError('Calculator resource exceeds size limit.');
      }
      chunks.push(Buffer.from(part.value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString('utf8');
}

function scriptUrl(html, moduleName, embedUrl) {
  const sources = html.matchAll(/<script\b[^>]*?\bsrc\s*=\s*(['"])([^'"]+)\1/gi);
  for (const match of sources) {
    const source = match[2].replace(/&amp;/gi, '&');
    const url = new URL(source, embedUrl);
    if (url.pathname.endsWith('/' + moduleName + '.js')) return allowedUrl(url);
  }
  if (moduleName !== 'prices') throw new FormulaChangedError();
  throw new PriceSchemaError('Price module missing from calculator.');
}

function parsePrices(script) {
  const match = /^\s*(?:\/\*[\s\S]*?\*\/\s*)*window\.SV_PRICES\s*=\s*(\{[\s\S]*\})\s*;?\s*$/.exec(script);
  if (!match) throw new PriceSchemaError('Unsupported price data format.');
  try { return JSON.parse(match[1]); }
  catch { throw new PriceSchemaError('Invalid price data JSON.'); }
}

function text(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 300;
}

function amount(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100_000_000;
}

function validRow(name, row) {
  switch (name) {
    case 'colors':
      return text(row[0]) && [0, 1].includes(row[1]) && amount(row[2]) && [0, 1, 2].includes(row[3]);
    case 'glassOut':
    case 'glassIn':
      return text(row[0]) && text(row[1]) && amount(row[2]) && amount(row[3]) && row[3] > 0;
    case 'profile':
      return text(row[0]) && row.slice(1).every(amount);
    case 'handles':
      return Number.isInteger(row[0]) && row[0] >= 0 && row[0] <= 1000 && text(row[1]) && amount(row[2]);
    case 'hinges':
      return text(row[0]) && amount(row[1]);
    default:
      return false;
  }
}

function validatePrices(prices, baseline) {
  if (!prices || Array.isArray(prices) || typeof prices !== 'object'
      || !Number.isFinite(prices.coeff) || prices.coeff <= 0 || prices.coeff > 100) {
    throw new PriceSchemaError('Invalid price coefficient.');
  }
  for (const [name, columns] of Object.entries(TABLE_COLUMNS)) {
    const rows = prices[name];
    if (!Array.isArray(rows) || rows.length < 1 || rows.length > 2000) throw new PriceSchemaError('Incomplete price table.');
    const keys = new Set();
    for (const row of rows) {
      if (!Array.isArray(row) || row.length !== columns || !validRow(name, row) || keys.has(row[0])) {
        throw new PriceSchemaError('Invalid price table row.');
      }
      keys.add(row[0]);
    }
    if (rows.length < baseline[name].length || baseline[name].some(row => !keys.has(row[0]))) {
      throw new PriceSchemaError('Existing price identifiers changed.');
    }
    if ((name === 'colors' || name === 'profile') && baseline[name].some((row, index) => rows[index][0] !== row[0])) {
      throw new PriceSchemaError('Indexed price table reordered.');
    }
  }
}

function baselinePrices() {
  if (!bundledPrices) {
    // The literal local path lets Vercel include the baseline in the function bundle.
    const prices = parsePrices(readFileSync(join(__dirname, '../js/calculator/prices.js'), 'utf8'));
    validatePrices(prices, prices);
    bundledPrices = prices;
  }
  return bundledPrices;
}

function respond(response, status, payload) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('CDN-Cache-Control', 'no-store');
  response.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

module.exports = async function calculatorPrices(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    respond(response, 405, { kind: 'priceError', text: 'Для проверки цен используйте GET.' });
    return;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const baseline = baselinePrices();
    const widget = await download(allowedUrl('/calc/widget.js'), controller.signal);
    const base = /\bBASE\s*=\s*(['"])([^'"]+)\1/.exec(widget);
    if (!base) throw new PriceSchemaError('Calculator embed URL missing.');
    const embedUrl = allowedUrl(base[2]);
    const embed = await download(embedUrl, controller.signal);
    const modules = ['engine', 'ui', 'prices'];
    const urls = modules.map(name => scriptUrl(embed, name, embedUrl));
    const sources = await Promise.all(urls.map(url => download(url, controller.signal)));
    for (let index = 0; index < 2; index++) {
      if (sha256(sources[index]) !== FORMULA_HASHES[modules[index]]) throw new FormulaChangedError();
    }
    const prices = parsePrices(sources[2]);
    validatePrices(prices, baseline);
    respond(response, 200, {
      kind: 'prices',
      prices,
      formulas: FORMULA_HASHES,
      version: sha256(JSON.stringify(prices)),
      checkedAt: new Date().toISOString(),
      source: urls[2].origin + urls[2].pathname
    });
  } catch (error) {
    if (error instanceof FormulaChangedError) {
      respond(response, 409, {
        kind: 'formulaWarning',
        reason: 'formula',
        text: 'На сайте обновились формулы расчёта. Для актуальных цен требуется обновление калькулятора.'
      });
    } else if (error instanceof PriceSchemaError) {
      respond(response, 409, {
        kind:'priceError',reason:'schema',
        text:'Данные сервера отличаются от поддерживаемого прайса. Для обновления цен может потребоваться новая версия приложения.'
      });
    } else {
      respond(response, 503, {
        kind: 'priceError',
        reason:controller.signal.aborted ? 'timeout' : 'server',
        text:controller.signal.aborted ? 'Источник прайса не ответил вовремя. Повторите попытку позже.' : 'Сервер обновлений или источник прайса недоступен. Повторите попытку позже.'
      });
    }
  } finally {
    controller.abort();
    clearTimeout(timeout);
  }
};
