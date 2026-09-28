import { DESCRIPCION_BOT, DESCRIPCION_CORTA_BOT, validarPerfilTelegram } from '../salida/stars/perfil.mjs';

validarPerfilTelegram();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('Falta TELEGRAM_BOT_TOKEN');
if (process.env.TELEGRAM_TEST_ENV === 'true') throw new Error('El perfil comercial no se actualiza en modo TEST');

const endpoint = (metodo) => `https://api.telegram.org/bot${token}/${metodo}`;
const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(metodo, datos = {}, intento = 0) {
  const r = await fetch(endpoint(metodo), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
    signal: AbortSignal.timeout(8000),
  });
  const cuerpo = await r.json().catch(() => ({}));
  if (r.status === 429 && intento < 2) {
    const segundos = Math.max(1, Math.min(60, Number(cuerpo?.parameters?.retry_after) || 2));
    await dormir(segundos * 1000 + 250);
    return api(metodo, datos, intento + 1);
  }
  if (!r.ok || cuerpo.ok !== true) throw new Error(`Telegram ${metodo}: ${r.status}`);
  return cuerpo.result;
}

async function sincronizarIdioma(language_code = '') {
  const idioma = language_code ? { language_code } : {};
  const [actual, corta] = await Promise.all([
    api('getMyDescription', idioma),
    api('getMyShortDescription', idioma),
  ]);

  if (actual.description !== DESCRIPCION_BOT) {
    await api('setMyDescription', { description: DESCRIPCION_BOT, ...idioma });
  }
  if (corta.short_description !== DESCRIPCION_CORTA_BOT) {
    await api('setMyShortDescription', { short_description: DESCRIPCION_CORTA_BOT, ...idioma });
  }

  const [verificada, cortaVerificada] = await Promise.all([
    api('getMyDescription', idioma),
    api('getMyShortDescription', idioma),
  ]);
  if (verificada.description !== DESCRIPCION_BOT || cortaVerificada.short_description !== DESCRIPCION_CORTA_BOT) {
    throw new Error(`Telegram no devolvió el copy esperado (${language_code || 'default'})`);
  }
}

await sincronizarIdioma('');
await sincronizarIdioma('es');

console.log('Copy comercial de Telegram actualizado y verificado sin tocar avatar, comandos ni botón de menú.');
