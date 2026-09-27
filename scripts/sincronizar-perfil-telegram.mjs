import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configuracionStars } from '../salida/stars/config.mjs';
import { clienteTelegram } from '../salida/stars/api.mjs';
import { COMANDOS } from '../salida/stars/comandos.mjs';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = configuracionStars();
if (!config.token) throw new Error('Falta TELEGRAM_BOT_TOKEN');
if (config.test) throw new Error('Este sincronizador sólo puede ejecutarse en producción');
if (config.pro !== 250 || config.partido !== 50 || !config.recurrente) {
  throw new Error('Los precios o la renovación no coinciden con el lanzamiento aprobado');
}

const api = clienteTelegram(config);
const me = await api('getMe', {});
if (me.username !== 'monitor_esports_avisos_bot') {
  throw new Error('Las credenciales no corresponden al bot comercial');
}

const nombre = 'Monitor eSports';
const descripcion = [
  'Tu bot de predicciones y estadísticas de eSports.',
  'CS2 · Dota 2 · LoL · Valorant',
  '',
  '🎁 FREE: 1 predicción diaria e historial actualizado.',
  '👑 PRO: 250 Stars / 30 días · renovación automática.',
  '🎯 Análisis individual: 50 Stars · pago único.',
  '',
  'Contexto, no solo predicciones. Soporte: @mitzukyhs.',
].join('\n');
const breve = 'Predicciones, estadísticas y resultados de CS2, Dota 2, LoL y Valorant. FREE, PRO y análisis por partido.';

for (const language_code of ['', 'es']) {
  await api('setMyName', { name: nombre, language_code });
  await api('setMyDescription', { description: descripcion, language_code });
  await api('setMyShortDescription', { short_description: breve, language_code });
  await api('setMyCommands', { commands: COMANDOS, language_code });
}
await api('setChatMenuButton', { menu_button: { type: 'commands' } });

const b64 = (await readFile(resolve(raiz, 'assets/telegram/avatar-aprobado.b64'), 'utf8')).trim();
const bytes = Buffer.from(b64, 'base64');
if (bytes.length < 1024 || bytes.length > 10 * 1024 * 1024) throw new Error('Avatar comercial inválido');
const form = new FormData();
form.set('photo', JSON.stringify({ type: 'static', photo: 'attach://avatar' }));
form.set('avatar', new Blob([bytes], { type: 'image/jpeg' }), 'monitor-esports.jpg');
const foto = await fetch(`https://api.telegram.org/bot${config.token}/setMyProfilePhoto`, {
  method: 'POST',
  body: form,
  signal: AbortSignal.timeout(20000),
});
const fotoJson = await foto.json();
if (!foto.ok || fotoJson.ok !== true) {
  const detalle = typeof fotoJson?.description === 'string' ? fotoJson.description.slice(0, 180) : 'sin detalle';
  throw new Error(`Telegram setMyProfilePhoto: ${foto.status} · ${detalle}`);
}

const [n, d, s, menu] = await Promise.all([
  api('getMyName', {}),
  api('getMyDescription', {}),
  api('getMyShortDescription', {}),
  api('getChatMenuButton', {}),
]);
if (n.name !== nombre || d.description !== descripcion || s.short_description !== breve || menu.type !== 'commands') {
  throw new Error('Telegram no devolvió el perfil comercial esperado');
}
console.log('Perfil comercial sincronizado: nombre, descripción, bio, comandos, menú y avatar.');
