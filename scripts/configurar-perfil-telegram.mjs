import { readFile } from 'node:fs/promises';
import { COMANDOS } from '../salida/stars/comandos.mjs';
import { NOMBRE_BOT, DESCRIPCION_BOT, DESCRIPCION_CORTA_BOT, validarPerfilTelegram } from '../salida/stars/perfil.mjs';

validarPerfilTelegram();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('Falta TELEGRAM_BOT_TOKEN');
if (process.env.TELEGRAM_TEST_ENV === 'true') throw new Error('El perfil comercial no se actualiza en modo TEST');

const endpoint = (metodo) => `https://api.telegram.org/bot${token}/${metodo}`;

async function api(metodo, datos = {}) {
  const r = await fetch(endpoint(metodo), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
    signal: AbortSignal.timeout(8000),
  });
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok || cuerpo.ok !== true) throw new Error(`Telegram ${metodo}: ${r.status}`);
  return cuerpo.result;
}

async function subirAvatar(ruta) {
  const bytes = await readFile(ruta);
  const form = new FormData();
  form.append('photo', JSON.stringify({ type: 'static', photo: 'attach://avatar' }));
  form.append('avatar', new Blob([bytes], { type: 'image/jpeg' }), 'avatar-approved.jpg');
  const r = await fetch(endpoint('setMyProfilePhoto'), { method: 'POST', body: form, signal: AbortSignal.timeout(12000) });
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok || cuerpo.ok !== true) throw new Error(`Telegram setMyProfilePhoto: ${r.status}`);
}

for (const language_code of ['', 'es']) {
  await api('setMyName', { name: NOMBRE_BOT, ...(language_code ? { language_code } : {}) });
  await api('setMyDescription', { description: DESCRIPCION_BOT, ...(language_code ? { language_code } : {}) });
  await api('setMyShortDescription', { short_description: DESCRIPCION_CORTA_BOT, ...(language_code ? { language_code } : {}) });
  await api('setMyCommands', { commands: COMANDOS, ...(language_code ? { language_code } : {}) });
}

await api('setChatMenuButton', { menu_button: { type: 'commands' } });

const avatarArg = process.argv.find((x) => x.startsWith('--avatar='));
if (avatarArg) await subirAvatar(avatarArg.slice('--avatar='.length));

const [nombre, descripcion, corta] = await Promise.all([
  api('getMyName', {}),
  api('getMyDescription', {}),
  api('getMyShortDescription', {}),
]);

if (nombre.name !== NOMBRE_BOT || descripcion.description !== DESCRIPCION_BOT ||
    corta.short_description !== DESCRIPCION_CORTA_BOT) {
  throw new Error('Telegram no devolvió el perfil comercial esperado');
}

console.log('Perfil comercial de Telegram actualizado y verificado.');
