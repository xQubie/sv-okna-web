'use strict';

const BIN_URL = "https://api.jsonbin.io/v3/b/69a9530ed0ea881f40f12d78";
const DEFAULT_ACCESS_KEY = "$2a$10$wv.J9tD0CS1bJdPTfU.O..Hj43emjtoZsMg.s0nUgK29Hw5WVXKLC";
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 8_000;

function respond(response, status, payload) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('CDN-Cache-Control', 'no-store');
  response.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

async function readRecord(response) {
  if (!response.ok || !response.body) throw new Error('Warehouse unavailable.');
  if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) {
    await response.body.cancel();
    throw new Error('Warehouse record exceeds size limit.');
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
        throw new Error('Warehouse record exceeds size limit.');
      }
      chunks.push(Buffer.from(part.value));
    }
  } finally {
    reader.releaseLock();
  }
  const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const record = data?.record || data;
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error('Invalid warehouse record.');
  }
  return data;
}

module.exports = async function warehouse(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    respond(response, 405, { error: 'Данные склада доступны только для чтения.' });
    return;
  }

  const key = process.env.JSONBIN_ACCESS_KEY?.trim() || DEFAULT_ACCESS_KEY;
  const authenticationHeader = 'X-Access-Key';
  if (!key) {
    respond(response, 503, { error: 'Подключение к складу ещё не настроено.' });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const upstream = await fetch(BIN_URL, {
      method: 'GET',
      redirect: 'error',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        [authenticationHeader]: key,
        'X-Bin-Meta': 'false'
      }
    });
    respond(response, 200, await readRecord(upstream));
  } catch {
    respond(response, 503, { error: 'Не удалось получить данные склада. Попробуйте позже.' });
  } finally {
    controller.abort();
    clearTimeout(timeout);
  }
};
