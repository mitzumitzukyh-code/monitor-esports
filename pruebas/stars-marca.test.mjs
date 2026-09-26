import test from 'node:test';
import assert from 'node:assert/strict';
import { crearBotStars } from '../salida/stars/bot.mjs';
import { nombresParaPartidos } from '../salida/stars/catalogo.mjs';
import { VERSION_TERMINOS } from '../salida/stars/config.mjs';

const config = { habilitado: true, pro: 250, partido: 50, recurrente: true, soporte: '@mitzukyhs' };
const marca = { proStars: 250, matchStars: 50, recurrente: true,
  imagenes: { bienvenida: 'welcome', pro: 'pro', individual: 'one', muestra: 'sample', resultados: 'history' } };
const mensaje = (text) => ({ update_id: 123, message: { from: { id: 10 }, chat: { id: 10, type: 'private' }, text } });
const callback = (data) => ({ update_id: 124, callback_query: { id: 'cb', from: { id: 10 },
  message: { chat: { id: 10, type: 'private' } }, data } });
function fixture(opciones = {}) {
  const llamadas = [], acciones = []; let lecturas = 0;
  const almacen = { accion: async (a, d) => { acciones.push({ a, d }); return opciones.estado ?? { premium: false, suscripciones: [], terminos_version: VERSION_TERMINOS }; },
    partidos: async () => opciones.partidos ?? [],
    prediccion: async () => { lecturas++; return { match_id: 20, juego: 'cs2', equipo_a: 1, equipo_b: 2,
      prob_a: 0.6, inicio_programado: '2026-09-27T15:00:00Z', formato: 'bo3', motor: 'glicko2', rating_a: 1550, rd_a: 50 }; },
    historial: async () => [] };
  const api = async (metodo, datos) => { llamadas.push({ metodo, datos });
    if (metodo === 'sendPhoto' && opciones.falloFoto) throw Error('rechazo'); return {}; };
  const bot = crearBotStars({ config: opciones.config ?? config, almacen, api, marca,
    nombres: async () => new Map([[1, { nombre: 'Equipo A' }], [2, { nombre: 'Equipo B' }]]),
    nombresPartidos: opciones.nombresPartidos ?? (async () => new Map()) });
  return { bot, llamadas, acciones, lecturas: () => lecturas };
}

test('bienvenida muestra el pack y cuatro botones reales sin iniciar compras', async () => {
  const f = fixture(); await f.bot.procesar(mensaje('/start'));
  const c = f.llamadas[0]; assert.equal(c.metodo, 'sendPhoto'); assert.equal(c.datos.photo, 'welcome');
  assert.deepEqual(c.datos.reply_markup.inline_keyboard.flat().map(b => b.callback_data), ['planes','partidos','estado','paysupport']);
  assert.equal(f.lecturas(), 0); assert.ok(f.acciones.every(c => c.a !== 'crear'));
});
test('los botones abren planes, estado y soporte sin consultar informes premium', async () => {
  const f = fixture(); for (const data of ['planes','estado','paysupport']) await f.bot.procesar(callback(data));
  assert.equal(f.llamadas.filter(c => c.metodo === 'answerCallbackQuery').length, 3);
  assert.ok(f.llamadas.some(c => c.metodo === 'sendPhoto' && c.datos.photo === 'pro'));
  assert.ok(f.llamadas.some(c => /@mitzukyhs/.test(c.datos.text ?? ''))); assert.equal(f.lecturas(), 0);
});
test('PRO con imagen sigue exigiendo consentimiento antes de crear factura', async () => {
  const f = fixture({ estado: { premium: false, suscripciones: [] } }); await f.bot.procesar(mensaje('/pro'));
  const c = f.llamadas[0]; assert.equal(c.metodo, 'sendPhoto'); assert.equal(c.datos.photo, 'pro');
  assert.match(c.datos.caption, /cobra automáticamente/); assert.ok(c.datos.caption.length <= 1024);
  assert.equal(c.datos.reply_markup.inline_keyboard[0][0].callback_data, `aceptar:${VERSION_TERMINOS}:p`);
  assert.ok(!f.acciones.some(c => c.a === 'crear')); assert.equal(f.lecturas(), 0);
});
test('si cambia el precio o la renovación no se muestra una pieza con condiciones anteriores', async () => {
  for (const cambio of [{ pro: 300 }, { partido: 80 }, { recurrente: false }]) {
    const f = fixture({ config: { ...config, ...cambio } }); await f.bot.procesar(mensaje('/planes'));
    assert.equal(f.llamadas[0].metodo, 'sendMessage'); assert.ok(!f.llamadas.some(c => c.metodo === 'sendPhoto'));
    if (cambio.pro) assert.match(f.llamadas[0].datos.text, /300 Stars/);
    if (cambio.partido) assert.match(f.llamadas[0].datos.text, /80 Stars/);
    if (cambio.recurrente === false) assert.match(f.llamadas[0].datos.text, /Pago único, sin renovación automática/);
  }
});
test('una imagen rechazada conserva el menú de texto y no crea órdenes', async () => {
  const f = fixture({ falloFoto: true }); await f.bot.procesar(mensaje('/start'));
  assert.deepEqual(f.llamadas.map(c => c.metodo), ['sendPhoto','sendMessage']);
  assert.equal(f.llamadas[1].datos.reply_markup.inline_keyboard.flat().length, 4);
  assert.ok(!f.acciones.some(c => c.a === 'crear'));
});
test('muestra e historial identifican plantilla y período, sin leer informes privados', async () => {
  const f = fixture(); await f.bot.procesar(callback('muestra')); await f.bot.procesar(callback('resultados'));
  const fotos = f.llamadas.filter(c => c.metodo === 'sendPhoto');
  assert.match(fotos[0].datos.caption, /plantilla no es un resultado confirmado/);
  assert.match(fotos[1].datos.caption, /27 AGO–25 SEP 2026/); assert.match(fotos[1].datos.caption, /166 pendientes/);
  assert.doesNotMatch(fotos[1].datos.caption, /Venezuela|no garantiza resultados futuros/);
  assert.equal(f.lecturas(), 0); assert.ok(!f.acciones.some(c => c.a === 'acceso'));
});
test('seleccionar un análisis individual muestra 50 Stars y opciones de acceso', async () => {
  const partidos = [{ match_id: 20, juego: 'cs2', equipo_a: 1, equipo_b: 2, inicio_programado: '2026-09-27T15:00:00Z' }];
  const f = fixture({ partidos, estado: { ok: false }, nombresPartidos: async () => new Map([
    ['cs2:1', { nombre: '<Equipo A>' }], ['cs2:2', { nombre: 'Equipo B' }],
  ]) });
  await f.bot.procesar(callback('individual'));
  const c = f.llamadas.find(c => c.metodo === 'sendPhoto'); assert.equal(c.datos.photo, 'one');
  assert.match(c.datos.caption, /50 Stars/);
  assert.equal(c.datos.reply_markup.inline_keyboard[0][0].callback_data, 'juego:cs2:0:proximos');
  await f.bot.procesar(callback('juego:cs2:0:proximos'));
  const lista = f.llamadas.find(c => c.metodo === 'sendMessage' && c.datos.text.includes('&lt;Equipo A&gt;'));
  assert.ok(lista); assert.equal(lista.datos.reply_markup.inline_keyboard[1][0].callback_data, 'partido:20:cs2:0:proximos');
  await f.bot.procesar(callback('analisis:20')); assert.equal(f.lecturas(), 0);
  assert.ok(!f.llamadas.some(c => ['sendInvoice','createInvoiceLink'].includes(c.metodo)));
});
test('las imágenes y menús nunca se envían a grupos ni chats ajenos', async () => {
  const f = fixture(); for (const chat of [{ id: -1, type: 'group' }, { id: 11, type: 'private' }]) {
    const u = mensaje('/start'); u.message.chat = chat; await f.bot.procesar(u);
  } assert.equal(f.llamadas.length, 0); assert.equal(f.acciones.length, 0);
});
test('el informe autorizado conserva probabilidades y protección sin referencias internas', async () => {
  const f = fixture({ estado: { ok: true } }); await f.bot.procesar(mensaje('/analisis 20'));
  const c = f.llamadas[0]; assert.equal(c.datos.protect_content, true); assert.match(c.datos.text, /60%/);
  assert.match(c.datos.text, /40%/); assert.match(c.datos.text, /Forma reciente/);
  assert.doesNotMatch(c.datos.text, /glicko|modelo|motor|rating|\bRD\b|algoritmo/i);
});
test('el catálogo agrupa nombres por juego y conserva la lista si un proveedor falla', async () => {
  const calls = []; const mapa = await nombresParaPartidos([
    { juego: 'cs2', equipo_a: 1, equipo_b: 2 }, { juego: 'cs2', equipo_a: 1, equipo_b: 3 },
    { juego: 'lol', equipo_a: 1, equipo_b: 2 },
  ], async (ids, { juego }) => { calls.push({ ids, juego }); if (juego === 'lol') throw Error('caída');
    return new Map(ids.map(id => [id, { nombre: `Equipo ${id}` }])); });
  assert.equal(calls.length, 2); assert.deepEqual(calls.find(c => c.juego === 'cs2').ids, [1,2,3]);
  assert.equal(mapa.get('cs2:1').nombre, 'Equipo 1'); assert.equal(mapa.has('lol:1'), false);
});
