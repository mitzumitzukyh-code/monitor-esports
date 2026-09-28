const te = new TextEncoder();

function bytesHex(hex) {
  if (!/^[0-9a-f]{64}$/i.test(hex ?? '')) return null;
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function claveHmac(bytes) {
  return crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function firmaHmac(keyBytes, texto) {
  const key = await claveHmac(keyBytes);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, te.encode(texto)));
}

export async function calcularHashInitData(pares, botToken) {
  if (typeof botToken !== 'string' || botToken.length < 20) throw new Error('token Telegram inválido');
  const secret = await firmaHmac(te.encode('WebAppData'), botToken);
  const data = [...pares].sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`).join('\n');
  const key = await claveHmac(secret);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, te.encode(data)));
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function verificaHash(pares, hash, botToken) {
  const esperado = bytesHex(hash);
  if (!esperado) return false;
  const secret = await firmaHmac(te.encode('WebAppData'), botToken);
  const key = await claveHmac(secret);
  const data = [...pares].sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`).join('\n');
  return crypto.subtle.verify('HMAC', key, esperado, te.encode(data));
}

/**
 * Valida Telegram.WebApp.initData con el token del bot.
 * El servidor nunca confía en initDataUnsafe ni en un user_id enviado aparte.
 */
export async function validarInitData(initData, {
  botToken,
  ahora = Date.now(),
  maxAgeSeconds = 300,
  toleranciaFuturoSeconds = 30,
} = {}) {
  if (typeof initData !== 'string' || initData.length < 20 || initData.length > 8192) {
    throw new Error('initData inválido');
  }
  if (!Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds < 30 || maxAgeSeconds > 3600) {
    throw new Error('maxAgeSeconds inválido');
  }

  const params = new URLSearchParams(initData);
  const vistos = new Set();
  const pares = [];
  let hash = null;
  for (const [k, v] of params.entries()) {
    if (vistos.has(k)) throw new Error('initData duplicado');
    vistos.add(k);
    if (k === 'hash') hash = v;
    else pares.push([k, v]);
  }
  if (!hash) throw new Error('initData sin hash');

  // Telegram añadió `signature` para validación por terceros. El método del
  // bot usa hash; aceptamos el formato actual (incluye signature) y, por
  // compatibilidad con clientes que todavía no la incorporan al hash, el
  // mismo conjunto sin signature. Ninguna variante es falsificable sin token.
  let valido = await verificaHash(pares, hash, botToken);
  if (!valido && pares.some(([k]) => k === 'signature')) {
    valido = await verificaHash(pares.filter(([k]) => k !== 'signature'), hash, botToken);
  }
  if (!valido) throw new Error('firma Telegram inválida');

  const authDate = Number(params.get('auth_date'));
  if (!Number.isSafeInteger(authDate) || authDate <= 0) throw new Error('auth_date inválido');
  const ahoraSeg = Math.floor(ahora / 1000);
  if (authDate > ahoraSeg + toleranciaFuturoSeconds) throw new Error('auth_date futuro');
  if (ahoraSeg - authDate > maxAgeSeconds) throw new Error('initData vencido');

  let user;
  try { user = JSON.parse(params.get('user') ?? 'null'); } catch { throw new Error('user inválido'); }
  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0) throw new Error('user inválido');

  return {
    user: {
      id: user.id,
      first_name: typeof user.first_name === 'string' ? user.first_name : '',
      username: typeof user.username === 'string' ? user.username : null,
    },
    authDate,
    queryId: params.get('query_id') || null,
  };
}
