import test from 'node:test';
import assert from 'node:assert/strict';
import { crearBotStars } from '../salida/stars/bot.mjs';
import { almacenStars } from '../salida/stars/persistencia.mjs';
import { ventanaPartidos } from '../salida/stars/partidos.mjs';
import { informePremium } from '../salida/stars/informe.mjs';

const ahora = Date.parse('2026-09-26T20:00:00Z');
const config = { habilitado: true, pro: 250, partido: 50, recurrente: true, soporte: '@mitzukyhs' };
const partido = { match_id: 20, juego: 'cs2', equipo_a: 1, equipo_b: 2, inicio_programado: '2026-09-26T21:00:00Z', formato: 'bo3' };
const cb = data => ({ update_id: 200, callback_query: { id: 'cb', from: { id: 10 }, message: { chat: { id: 10, type: 'private' } }, data } });
const msg = text => ({ update_id: 201, message: { from: { id: 10 }, chat: { id: 10, type: 'private' }, text } });
function fixture({ acceso = false, filas = [partido], ficha = partido, fallaNombres = false } = {}) {
  const apiCalls = [], consultas = [], acciones = []; let privadas = 0;
  const almacen = {
    accion: async (a, d) => { acciones.push({ a, d }); return { ok: a === 'acceso' && acceso }; },
    partidos: async filtros => { consultas.push(filtros); return filas; },
    ficha: async id => { consultas.push({ ficha: id }); return ficha; },
    prediccion: async () => { privadas++; return { ...partido, prob_a: 0.73 }; },
    historial: async () => [],
  };
  const bot = crearBotStars({ config, almacen, ahora: () => ahora,
    api: async (metodo, datos) => { apiCalls.push({ metodo, datos }); return {}; },
    nombresPartidos: async () => { if (fallaNombres) throw Error('caída'); return new Map([
      ['cs2:1', { nombre: '<Liquid>' }], ['cs2:2', { nombre: 'M80' }],
    ]); },
    nombres: async () => new Map([[1, { nombre: 'Liquid' }], [2, { nombre: 'M80' }]]),
  });
  return { bot, apiCalls, consultas, acciones, privadas: () => privadas,
    ultimo: () => apiCalls.filter(c => c.metodo === 'sendMessage').at(-1).datos };
}

test('partidos abre un selector de juego sin mezclar encuentros ni consultar informes', async () => {
  const f = fixture(); await f.bot.procesar(msg('/partidos'));
  assert.deepEqual(f.ultimo().reply_markup.inline_keyboard.slice(0, 2).flat().map(b => b.text), ['CS2','Dota 2','LoL','Valorant']);
  assert.equal(f.consultas.length, 0); assert.equal(f.privadas(), 0);
});

test('selección filtra en servidor por juego y lista seis encuentros con fechas y siguiente página', async () => {
  const filas = Array.from({ length: 7 }, (_, i) => ({ ...partido, match_id: 20 + i,
    inicio_programado: i < 3 ? '2026-09-26T21:00:00Z' : '2026-09-27T15:00:00Z' }));
  const f = fixture({ filas }); await f.bot.procesar(cb('juego:cs2:0:proximos'));
  assert.deepEqual(f.consultas[0], { juego: 'cs2', desde: '2026-09-26T20:00:00.000Z', offset: 0, limite: 7 });
  const datos = f.ultimo(), botones = datos.reply_markup.inline_keyboard.flat();
  assert.equal(botones.filter(b => b.callback_data.startsWith('partido:')).length, 6);
  assert.ok(botones.some(b => b.callback_data === 'juego:cs2:1:proximos'));
  assert.match(datos.text, /26 sept/); assert.match(datos.text, /27 sept/); assert.match(datos.text, /&lt;Liquid&gt;/);
  assert.doesNotMatch(datos.text, /73%|Venezuela/); assert.equal(f.privadas(), 0);
});

test('paginación conserva juego y fecha, solicita la siguiente ventana y ofrece volver', async () => {
  const f = fixture(); await f.bot.procesar(cb('juego:lol:2:manana'));
  assert.deepEqual(f.consultas[0], { juego: 'lol', desde: '2026-09-27T04:00:00.000Z', hasta: '2026-09-28T04:00:00.000Z', offset: 12, limite: 7 });
  assert.ok(f.ultimo().reply_markup.inline_keyboard.flat().some(b => b.callback_data === 'juego:lol:1:manana'));
});

test('Hoy y Mañana respetan el cambio de día de UTC−4 y excluyen encuentros ya iniciados', () => {
  const noche = Date.parse('2026-09-27T03:30:00Z');
  assert.deepEqual(ventanaPartidos('hoy', noche), { desde: '2026-09-27T03:30:00.000Z', hasta: '2026-09-27T04:00:00.000Z' });
  assert.deepEqual(ventanaPartidos('manana', noche), { desde: '2026-09-27T04:00:00.000Z', hasta: '2026-09-28T04:00:00.000Z' });
});

test('callbacks manipulados no llegan a la base ni a compras', async () => {
  const f = fixture();
  for (const data of ['juego:cs2&select=*:0:proximos','juego:cs2:-1:hoy','juego:cs2:1000:hoy',
    'juego:cs2:0:otro','juego:cs2:0:hoy:extra','partido:20&select=*:cs2:0:hoy']) await f.bot.procesar(cb(data));
  assert.equal(f.consultas.length, 0); assert.equal(f.privadas(), 0);
  assert.ok(f.acciones.every(a => a.a === 'usuario'));
});

test('un juego sin encuentros conserva filtros y permite cambiar juego', async () => {
  const f = fixture({ filas: [] }); await f.bot.procesar(cb('juego:valorant:0:hoy'));
  assert.match(f.ultimo().text, /No hay encuentros/);
  assert.ok(f.ultimo().reply_markup.inline_keyboard.flat().some(b => b.callback_data === 'partidos'));
});

test('FREE abre ficha con nombres, horario, formato y precios, nunca probabilidades ni órdenes', async () => {
  const f = fixture(); await f.bot.procesar(cb('partido:20:cs2:1:hoy'));
  const datos = f.ultimo(); assert.match(datos.text, /&lt;Liquid&gt; vs. M80/); assert.match(datos.text, /Serie al mejor de 3/);
  assert.match(datos.text, /50 Stars/); assert.match(datos.text, /250 Stars/); assert.match(datos.text, /Renovación automática/);
  assert.doesNotMatch(datos.text, /73%|prob_a|rating|Venezuela/); assert.equal(f.privadas(), 0);
  assert.deepEqual(f.consultas, [{ ficha: 20 }]);
  assert.ok(datos.reply_markup.inline_keyboard.flat().some(b => b.callback_data === 'juego:cs2:1:hoy'));
  assert.ok(!f.acciones.some(a => ['crear','terminos'].includes(a.a)));
  assert.ok(!f.apiCalls.some(c => ['createInvoiceLink','sendInvoice'].includes(c.metodo)));
});

test('PRO o compra individual autorizados abren informe protegido, con regreso a la selección', async () => {
  const f = fixture({ acceso: true }); await f.bot.procesar(cb('partido:20:cs2:0:manana'));
  assert.equal(f.privadas(), 1); assert.equal(f.consultas.length, 0);
  assert.match(f.ultimo().text, /Análisis completo/); assert.match(f.ultimo().text, /73%/);
  assert.equal(f.ultimo().protect_content, true);
  assert.ok(f.ultimo().reply_markup.inline_keyboard.flat().some(b => b.callback_data === 'juego:cs2:0:manana'));
});

test('si faltan nombres o la ficha sigue bloqueado y mantiene navegación', async () => {
  for (const opciones of [{ fallaNombres: true }, { ficha: null }]) {
    const f = fixture(opciones); await f.bot.procesar(cb('partido:20:cs2:0:proximos'));
    assert.match(f.ultimo().text, /requiere PRO/); assert.equal(f.privadas(), 0);
  }
});

test('la ficha pública y la lista usan proyección limitada y filtros seguros en PostgREST', async t => {
  const anterior = process.env.SUPABASE_URL;
  process.env.SUPABASE_URL = 'https://prueba.supabase.co';
  t.after(() => { if (anterior === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = anterior; });
  const peticiones = [];
  const almacen = almacenStars({ fetchImpl: async url => { peticiones.push(new URL(url)); return { ok: true, json: async () => [partido] }; } });
  await almacen.partidos({ juego: 'cs2', desde: '2026-09-26T20:00:00Z', hasta: '2026-09-27T04:00:00Z', offset: 6, limite: 7 });
  await almacen.ficha(20);
  for (const url of peticiones) assert.equal(url.searchParams.get('select'), 'match_id,juego,equipo_a,equipo_b,inicio_programado,formato');
  assert.equal(peticiones[0].searchParams.get('juego'), 'eq.cs2'); assert.equal(peticiones[0].searchParams.get('offset'), '6');
  assert.equal(peticiones[0].searchParams.getAll('inicio_programado').length, 2);
  assert.equal(peticiones[1].searchParams.get('match_id'), 'eq.20');
  assert.throws(() => almacen.partidos({ juego: 'cs2&select=*' }));
  await assert.rejects(almacen.ficha('20&select=*')); assert.equal(peticiones.length, 2);
});

test('la plantilla conserva las probabilidades guardadas y explica forma y antecedentes sin datos inventados', () => {
  const historia = [
    { equipo_a: 1, equipo_b: 2, resultado_real: 'ganaA' },
    { equipo_a: 2, equipo_b: 1, resultado_real: 'ganaA' },
    { equipo_a: 1, equipo_b: 3, resultado_real: 'ganaA' },
    { equipo_a: 1, equipo_b: 4, resultado_real: null },
  ];
  for (const juego of ['cs2','dota2','lol','valorant']) {
    const texto = informePremium({ ...partido, juego, prob_a: 0.73 }, historia, id => ({ 1: 'Liquid', 2: 'M80' })[id]);
    assert.match(texto, /73%/); assert.match(texto, /27%/); assert.match(texto, /2 de 3 series ganadas/);
    assert.match(texto, /2 series registradas/); assert.match(texto, /Liquid: 1 ganadas · M80: 1 ganadas/);
    assert.doesNotMatch(texto, /Venezuela|motor|rating|veto|ranking|mapas/i);
  }
});
