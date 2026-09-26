import test from 'node:test';
import assert from 'node:assert/strict';
import { aciertoPrincipal, despacharResultados, mensajeResultados } from '../salida/stars/resultados.mjs';
import { crearBotStars } from '../salida/stars/bot.mjs';
import { VERSION_TERMINOS } from '../salida/stars/config.mjs';

const r = (match_id, juego, inicio, extra = {}) => ({ match_id, juego, equipo_a: match_id * 10, equipo_b: match_id * 10 + 1,
  prob_a: 0.7, resultado_real: 'ganaA', inicio_programado: inicio, ...extra });
const mapa = new Map([['cs2:10', { nombre: 'Team A' }], ['cs2:11', { nombre: 'Team B' }],
  ['cs2:20', { nombre: 'Team C' }], ['cs2:21', { nombre: 'Team D' }],
  ['lol:30', { nombre: 'Team E' }], ['lol:31', { nombre: 'Team F' }]]);
const hasta = '2026-09-26T18:30:00Z';

test('formato de resultados: agrupa por juego, ordena por hora real y marca ✅/❌ sin lenguaje de apuestas', () => {
  const texto = mensajeResultados([
    r(3, 'lol', '2026-09-26T18:10:00Z'),
    r(2, 'cs2', '2026-09-26T18:15:00Z', { resultado_real: 'ganaB' }),
    r(1, 'cs2', '2026-09-26T18:00:00Z'),
  ], { mapa, hasta });
  assert.equal(texto, [
    '🏁 <b>Resultados recientes</b>', '', '<b>CS2</b>',
    '2:00 PM — Team A vs. Team B ✅', '2:15 PM — Team C vs. Team D ❌', '', '<b>LoL</b>',
    '2:10 PM — Team E vs. Team F ✅', '', 'Actualizado hasta 2:30 PM · UTC−4 / ET',
    '✅ predicción principal correcta · ❌ incorrecta',
  ].join('\n'));
  assert.doesNotMatch(texto, /ROI|cuota|ganancia|apuesta|Venezuela/i);
});

test('formato de resultados: sin resultados válidos no hay mensaje; fechas de otro día llevan fecha', () => {
  assert.equal(mensajeResultados([], { hasta }), null);
  assert.equal(mensajeResultados([r(1, 'cs2', hasta, { resultado_real: 'empate' }), r(2, 'cs2', hasta, { prob_a: null })], { hasta }), null);
  const texto = mensajeResultados([r(1, 'cs2', '2026-09-25T23:00:00Z')], { mapa, hasta });
  assert.match(texto, /25 sept 2026 · 7:00 PM — Team A vs\. Team B ✅/);
  assert.match(mensajeResultados([r(1, 'cs2', '2026-01-10T18:00:00Z')], { mapa, hasta: '2026-01-10T18:30:00Z' }), /UTC−4$/m);
});

test('acierto principal usa el favorito guardado sin recalcular', () => {
  assert.equal(aciertoPrincipal({ prob_a: 0.7, resultado_real: 'ganaA' }), true);
  assert.equal(aciertoPrincipal({ prob_a: 0.3, resultado_real: 'ganaA' }), false);
  assert.equal(aciertoPrincipal({ prob_a: 0.3, resultado_real: 'ganaB' }), true);
});

function fixture({ bloques, reservar = async () => ({ ok: true }), fallo } = {}) {
  const acciones = [], llamadas = [];
  const accion = async (a, d) => { acciones.push({ a, d });
    return a === 'preparar' ? { ok: true, bloques } : a === 'reservar' ? reservar(d) : { ok: true }; };
  const api = async (m, d) => { llamadas.push({ m, d }); if (fallo) throw Error(`Telegram ${m}: ${fallo}`); return true; };
  return { acciones, llamadas, run: () => despacharResultados({ accion, api, pausa: async () => {} }) };
}

test('despacho: sin bloques o sin destinatarios no envía nada', async () => {
  for (const bloques of [[], [{ bloque_id: 1, hasta, items: [r(1, 'cs2', hasta)], destinatarios: [] }]]) {
    const f = fixture({ bloques }); const res = await f.run();
    assert.equal(f.llamadas.length, 0); assert.equal(res.enviados, 0);
  }
});

test('despacho: sólo envía tras reservar; reserva rechazada (FREE, vencido o duplicado) no envía', async () => {
  const f = fixture({ bloques: [{ bloque_id: 7, hasta, items: [r(1, 'cs2', hasta)], destinatarios: [10, 11] }],
    reservar: async (d) => ({ ok: d.user_id === 10 }) });
  const res = await f.run();
  assert.deepEqual(f.llamadas.map((c) => c.d.chat_id), [10]); assert.equal(f.llamadas[0].d.protect_content, true);
  assert.deepEqual(f.acciones.filter((c) => c.a === 'confirmar').map((c) => c.d), [{ bloque_id: 7, user_id: 10 }]);
  assert.equal(res.omitidos, 1);
});

test('despacho: fallo temporal libera para reintentar; bot bloqueado se descarta', async () => {
  for (const [fallo, esperado] of [[500, 'liberar'], [403, 'descartar']]) {
    const f = fixture({ fallo, bloques: [{ bloque_id: 1, hasta, items: [r(1, 'cs2', hasta)], destinatarios: [10] }] });
    const res = await f.run(); assert.equal(res.fallidos, 1);
    assert.ok(f.acciones.some((c) => c.a === esperado)); assert.ok(!f.acciones.some((c) => c.a === 'confirmar'));
  }
});

test('el bot FREE no dispara mensajes de resultados al navegar', async () => {
  const llamadas = [];
  const bot = crearBotStars({ config: { habilitado: true, pro: 250, partido: 50, recurrente: true, soporte: '@s' },
    almacen: { accion: async () => ({ premium: false, suscripciones: [], terminos_version: VERSION_TERMINOS }), partidos: async () => [] },
    api: async (m, d) => { llamadas.push({ m, d }); return true; } });
  for (const text of ['/start', '/planes', '/partidos', '/estado']) {
    await bot.procesar({ update_id: 1, message: { from: { id: 10 }, chat: { id: 10, type: 'private' }, text } });
  }
  assert.ok(!llamadas.some((c) => /Resultados recientes/.test(c.d.text ?? c.d.caption ?? '')));
});
