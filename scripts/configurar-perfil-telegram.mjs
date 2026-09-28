import { readFile } from 'node:fs/promises';
import { COMANDOS } from '../salida/stars/comandos.mjs';
import { NOMBRE_BOT, DESCRIPCION_BOT, DESCRIPCION_CORTA_BOT, validarPerfilTelegram } from '../salida/stars/perfil.mjs';

validarPerfilTelegram();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('Falta TELEGRAM_BOT_TOKEN');
if (process.env.TELEGRAM_TEST_ENV === 'true') throw new Error('El perfil comercial no se actualiza en modo TEST');

const endpoint = (metodo) => `https://api.telegram.org/bot${token}/${metodo}`;
const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function retryAfter(cuerpo) {
  const n = Number(cuerpo?.parameters?.retry_after);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

async function api(metodo, datos = {}) {
  for (let intento = 0; intento < 3; intento++) {
    const r = await fetch(endpoint(metodo), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
      signal: AbortSignal.timeout(8000),
    });
    const cuerpo = await r.json().catch(() => ({}));
    if (r.ok && cuerpo.ok === true) return cuerpo.result;

    const espera = r.status === 429 ? retryAfter(cuerpo) : null;
    if (espera && espera <= 120 && intento < 2) {
      console.log(`Telegram ${metodo}: límite temporal; reintento en ${espera}s.`);
      await esperar((espera + 1) * 1000);
      continue;
    }
    const detalle = espera ? ` · retry_after=${espera}s` : '';
    throw new Error(`Telegram ${metodo}: ${r.status}${detalle}`);
  }
  throw new Error(`Telegram ${metodo}: reintentos agotados`);
}

async function subirAvatar(ruta) {
  const bytes = await readFile(ruta);
  for (let intento = 0; intento < 3; intento++) {
    const form = new FormData();
    form.append('photo', JSON.stringify({ type: 'static', photo: 'attach://avatar' }));
    form.append('avatar', new Blob([bytes], { type: 'image/jpeg' }), 'avatar-approved.jpg');
    const r = await fetch(endpoint('setMyProfilePhoto'), {
      method: 'POST', body: form, signal: AbortSignal.timeout(12000),
    });
    const cuerpo = await r.json().catch(() => ({}));
    if (r.ok && cuerpo.ok === true) return;

    const espera = r.status === 429 ? retryAfter(cuerpo) : null;
    if (espera && espera <= 120 && intento < 2) {
      console.log(`Telegram setMyProfilePhoto: límite temporal; reintento en ${espera}s.`);
      await esperar((espera + 1) * 1000);
      continue;
    }
    const detalle = espera ? ` · retry_after=${espera}s` : '';
    throw new Error(`Telegram setMyProfilePhoto: ${r.status}${detalle}`);
  }
}

const idioma = (language_code) => language_code ? { language_code } : {};

for (const language_code of ['', 'es']) {
  const lang = idioma(language_code);
  const [nombreActual, descripcionActual, cortaActual, comandosActuales] = await Promise.all([
    api('getMyName', lang),
    api('getMyDescription', lang),
    api('getMyShortDescription', lang),
    api('getMyCommands', lang),
  ]);

  if (nombreActual.name !== NOMBRE_BOT) {
    await api('setMyName', { name: NOMBRE_BOT, ...lang });
  }
  if (descripcionActual.description !== DESCRIPCION_BOT) {
    await api('setMyDescription', { description: DESCRIPCION_BOT, ...lang });
  }
  if (cortaActual.short_description !== DESCRIPCION_CORTA_BOT) {
    await api('setMyShortDescription', { short_description: DESCRIPCION_CORTA_BOT, ...lang });
  }
  if (JSON.stringify(comandosActuales) !== JSON.stringify(COMANDOS)) {
    await api('setMyCommands', { commands: COMANDOS, ...lang });
  }
}

const menu = await api('getChatMenuButton', {});
if (menu.type !== 'commands') {
  await api('setChatMenuButton', { menu_button: { type: 'commands' } });
}

const avatarArg = process.argv.find((x) => x.startsWith('--avatar='));
if (avatarArg) await subirAvatar(avatarArg.slice('--avatar='.length));

for (const language_code of ['', 'es']) {
  const lang = idioma(language_code);
  const [nombre, descripcion, corta] = await Promise.all([
    api('getMyName', lang),
    api('getMyDescription', lang),
    api('getMyShortDescription', lang),
  ]);
  if (nombre.name !== NOMBRE_BOT || descripcion.description !== DESCRIPCION_BOT ||
      corta.short_description !== DESCRIPCION_CORTA_BOT) {
    throw new Error(`Telegram no devolvió el perfil comercial esperado${language_code ? ` para ${language_code}` : ''}`);
  }
}

console.log('Perfil comercial de Telegram actualizado y verificado.');
