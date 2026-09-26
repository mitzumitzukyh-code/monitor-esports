import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configuracionStars } from '../salida/stars/config.mjs';
import { clienteTelegram } from '../salida/stars/api.mjs';
import { COMANDOS } from '../salida/stars/comandos.mjs';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argumento = (nombre) => process.argv.find((x) => x.startsWith(`--${nombre}=`))?.slice(nombre.length + 3);
const config = configuracionStars();
const api = clienteTelegram(config);
const chat = Number(argumento('chat'));
if (!Number.isSafeInteger(chat) || chat <= 0) throw new Error('Indica --chat=ID de tu conversación privada');
const me = await api('getMe', {});
if (me.username !== 'monitor_esports_avisos_bot') throw new Error('Las credenciales no corresponden al destino comercial');
const destino = await api('getChat', { chat_id: chat });
if (destino.type !== 'private' || destino.username?.toLowerCase() !== 'mitzukyhs') {
  throw new Error('El chat no corresponde al propietario/soporte @mitzukyhs');
}
if (config.pro !== 250 || config.partido !== 50 || !config.recurrente) {
  throw new Error('Los precios o la renovación no coinciden con el pack aprobado');
}
console.log('Destino comercial y conversación del propietario verificados. Precios 250/50, PRO recurrente.');
if (process.argv.includes('--aplicar')) {

const pack = resolve(argumento('pack') ?? 'assets/telegram');
const fotos = { bienvenida: 'bienvenida.png', pro: 'pro.png', individual: 'individual.png', muestra: 'muestra.png', resultados: 'resultados.png' };
// Sin reintentos automáticos de envíos. Ningún archivo se manda al canal de pruebas.
async function multipart(metodo, datos, archivo, bytes, mime) {
  const form = new FormData();
  for (const [k, v] of Object.entries(datos)) form.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  form.set('archivo', new Blob([bytes], { type: mime }), archivo);
  const res = await fetch(`https://api.telegram.org/bot${config.token}/${config.test ? 'test/' : ''}${metodo}`, {
    method: 'POST', body: form, signal: AbortSignal.timeout(20000),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(`Telegram ${metodo}: ${res.status}`);
  return json.result;
}

const anteriores = {
  descripcion: await api('getMyDescription', {}),
  breve: await api('getMyShortDescription', {}),
  comandos: await api('getMyCommands', {}),
  fotos: await api('getUserProfilePhotos', { user_id: me.id, limit: 1 }),
};
await mkdir(resolve(raiz, 'work'), { recursive: true });
const respaldo = resolve(raiz, 'work', `marca-antes-${Date.now()}.json`);
await writeFile(respaldo, JSON.stringify(anteriores, null, 2));
const marca = { botId: me.id, fecha: new Date().toISOString(), proStars: config.pro, matchStars: config.partido, recurrente: config.recurrente, imagenes: {} };
for (const [nombre, archivo] of Object.entries(fotos)) {
  const enviado = await multipart('sendPhoto', {
    chat_id: chat, photo: 'attach://archivo', disable_notification: true,
    caption: `Monitor eSports · ${nombre === 'muestra' ? 'ejemplo de diseño, con campos pendientes' : nombre}`,
  }, archivo, await readFile(resolve(pack, archivo)), 'image/png');
  marca.imagenes[nombre] = enviado.photo.at(-1).file_id;
  // Guardar cada avance permite recuperar la carga sin repetir todos los envíos.
  await writeFile(resolve(raiz, 'work/marca-carga.json'), JSON.stringify(marca, null, 2));
}
await writeFile(resolve(raiz, 'salida/stars/marca.mjs'),
  '// Pack aprobado por el propietario. file_id reutilizables de este bot; sin credenciales.\n' +
  `export const MARCA = ${JSON.stringify(marca, null, 2)};\n`);
await multipart('setMyProfilePhoto', { photo: { type: 'static', photo: 'attach://archivo' } },
  'avatar.jpg', await readFile(resolve(pack, 'avatar.jpg')), 'image/jpeg');
const descripcion = 'Predicciones y estadísticas para entender cada partido.\nCS2 · Dota 2 · LoL · Valorant\n\nPRO: 250 Stars cada 30 días, con renovación automática.\nUn análisis: 50 Stars, pago único.\n\nEmpieza con los botones del menú. Soporte: @mitzukyhs.';
const breve = 'Predicciones, estadísticas y resultados de eSports. Planes y análisis disponibles en Telegram.';
for (const language_code of ['', 'es']) {
  await api('setMyDescription', { description: descripcion, language_code });
  await api('setMyShortDescription', { short_description: breve, language_code });
  await api('setMyCommands', { commands: COMANDOS, language_code });
}
await api('setChatMenuButton', { menu_button: { type: 'commands' } });
console.log(`Pack cargado y perfil aplicado a @${me.username}. Cinco imágenes disponibles. Respaldo local guardado.`);
}
