import test from 'node:test';
import assert from 'node:assert/strict';
import { publicarSinPremium } from '../salida/web/generar.mjs';
import { crearBotStars } from '../salida/stars/bot.mjs';
import { cabeza, encabezado } from '../salida/web/perfil.mjs';

test('web pública no expone probabilidad ni estado interno antes del resultado', () => {
  const futura = {
    match_id: 99, juego: 'cs2', equipo_a: 1, equipo_b: 2,
    inicio_programado: '2026-09-28T12:00:00Z', formato: 'bo3',
    prob_a: 0.71, prob_b: 0.29, rating_a: 1700, rd_a: 55,
    rating_b: 1510, rd_b: 83, motor: 'glicko2', resultado_real: null,
  };
  const publica = publicarSinPremium(futura);
  for (const campo of ['prob_a','prob_b','rating_a','rd_a','rating_b','rd_b','motor']) {
    assert.equal(publica[campo], null, campo);
  }
  assert.equal(publica.match_id, 99);
  assert.equal(publica.inicio_programado, futura.inicio_programado);
});

test('web conserva completa una predicción ya cerrada para auditar historial', () => {
  const cerrada = { match_id: 5, prob_a: 0.63, rating_a: 1600, resultado_real: 'ganaA' };
  assert.equal(publicarSinPremium(cerrada), cerrada);
});

test('rate limit corta comandos antes de tocar usuario o contenido premium', async () => {
  const llamadas = [];
  let acciones = 0;
  const almacen = {
    limite: async () => ({ ok: false, motivo: 'limite' }),
    accion: async () => { acciones++; return { ok: true }; },
    prediccion: async () => { throw new Error('no debe leer premium'); },
  };
  const api = async (metodo, datos) => { llamadas.push({ metodo, datos }); return true; };
  const bot = crearBotStars({
    config: { habilitado: true, pro: 250, partido: 50, recurrente: true, soporte: '@soporte' },
    almacen, api,
  });
  await bot.procesar({
    update_id: 1,
    message: { from: { id: 10 }, chat: { id: 10, type: 'private' }, text: '/analisis 20', date: 1790440000 },
  });
  assert.equal(acciones, 0);
  assert.equal(llamadas.length, 0);
});

test('rate limit no bloquea recibos de pago', async () => {
  const llamadas = [];
  let limiteLlamado = false;
  const almacen = {
    limite: async () => { limiteLlamado = true; return { ok: false }; },
    accion: async (a) => a === 'pago'
      ? { ok: true, producto: 'partido', match_id: 20 }
      : { ok: true },
  };
  const api = async (metodo, datos) => { llamadas.push({ metodo, datos }); return true; };
  const bot = crearBotStars({
    config: { habilitado: true, pro: 250, partido: 50, recurrente: true, soporte: '@soporte' },
    almacen, api,
  });
  await bot.procesar({
    update_id: 2,
    message: {
      from: { id: 10 }, chat: { id: 10, type: 'private' }, date: 1790440000,
      successful_payment: {
        currency: 'XTR', total_amount: 50, invoice_payload: 'x',
        telegram_payment_charge_id: 'charge-1',
      },
    },
  });
  assert.equal(limiteLlamado, false);
  assert.ok(llamadas.some(x => x.metodo === 'sendMessage'));
});


test('perfil público redactado no inventa 50/50 ni expone porcentaje previo', () => {
  const f = { match_id: 77, juego: 'cs2', equipo_a: 1, equipo_b: 2,
    inicio_programado: '2026-09-28T12:00:00Z', formato: 'bo3',
    prob_a: null, prob_b: null, rating_a: null, rd_a: null, rating_b: null, rd_b: null,
    resultado_real: null };
  const head = cabeza(f, 'Alpha', 'Beta', { etiqueta: 'CS2', hora: '8:00 AM' });
  const body = encabezado(f, { nombreA: 'Alpha', nombreB: 'Beta', etiqueta: 'CS2', chip: 'cs2' });
  assert.match(head, /análisis previo protegido/i);
  assert.match(body, /análisis previo protegido/i);
  assert.doesNotMatch(head + body, /50\/50|\b[0-9]{1,3}(?:\.[0-9])?%/);
});
