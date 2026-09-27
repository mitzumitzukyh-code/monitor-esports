import test from 'node:test';
import assert from 'node:assert/strict';
import { crearBotStars } from '../salida/stars/bot.mjs';

const config = { habilitado: true, pro: 250, partido: 50, recurrente: true, soporte: '@soporte' };
const msg = (text, update_id = 100) => ({
  update_id,
  message: { from: { id: 10 }, chat: { id: 10, type: 'private' }, text, date: 1790520000 },
});

function baseFixture(extra = {}) {
  const llamadas = [];
  const almacen = {
    accion: async (a) => a === 'estado'
      ? { premium: false, suscripciones: [], expira_en: null, terminos_version: 'x' }
      : { ok: true },
    resultados: async () => [],
    comprasIndividuales: async () => [],
    metricas: async () => ({ total: { n: 0, aciertos: 0, porcentaje: null }, juegos: [] }),
    ...extra.almacen,
  };
  const api = async (metodo, datos) => { llamadas.push({ metodo, datos }); return true; };
  const bot = crearBotStars({
    config, almacen, api,
    ahora: () => Date.parse('2026-09-27T16:00:00Z'),
    nombresPartidos: extra.nombresPartidos ?? (async () => new Map()),
  });
  return { bot, llamadas, almacen };
}

test('Resultados de hoy muestra sólo la vista diaria y separa Historial', async () => {
  const f = baseFixture({
    almacen: {
      resultados: async ({ desde, hasta }) => {
        assert.equal(desde, '2026-09-27T04:00:00.000Z');
        assert.equal(hasta, '2026-09-28T04:00:00.000Z');
        return [{
          match_id: 1, juego: 'cs2', equipo_a: 1, equipo_b: 2,
          inicio_programado: '2026-09-27T17:00:00Z', resultado_real: 'ganaA',
          prob_a: 0.61, marcador_a: 2, marcador_b: 0,
        }];
      },
    },
    nombresPartidos: async () => new Map([
      ['cs2:1', { nombre: 'Alpha' }], ['cs2:2', { nombre: 'Beta' }],
    ]),
  });
  await f.bot.procesar(msg('/hoy'));
  const m = f.llamadas.find(x => x.metodo === 'sendMessage').datos;
  assert.match(m.text, /Resultados de hoy/);
  assert.match(m.text, /Alpha vs\. Beta/);
  assert.match(m.text, /2–0/);
  assert.match(m.text, /✅/);
  assert.ok(m.reply_markup.inline_keyboard.flat().some(b => b.callback_data === 'historial'));
});

test('Mi cuenta muestra plan, renovación y análisis individuales', async () => {
  const f = baseFixture({
    almacen: {
      accion: async (a) => a === 'estado'
        ? { premium: true, expira_en: '2026-10-27T16:00:00Z',
            suscripciones: [{ state: 'active', cancelada: false, cargo: 'c', payload: 'p' }] }
        : { ok: true },
      comprasIndividuales: async () => [101, 202],
    },
  });
  await f.bot.procesar(msg('/estado'));
  const m = f.llamadas.find(x => x.metodo === 'sendMessage').datos;
  assert.match(m.text, /Mi cuenta/);
  assert.match(m.text, /Plan: <b>PRO<\/b>/);
  assert.match(m.text, /Renovación automática: <b>activa<\/b>/);
  assert.match(m.text, /Análisis individuales activos: <b>2<\/b>/);
  assert.match(m.text, /#101, #202/);
  assert.ok(m.reply_markup.inline_keyboard.flat().some(b => b.callback_data === 'cancelar'));
});

test('FREE usa CTA fuerte para desbloquear PRO y comprar sólo ese análisis', async () => {
  const f = baseFixture({
    almacen: {
      engagement: async (a) => a === 'gratis' ? { ok: true, match_id: 77 } : {},
      prediccion: async () => ({
        match_id: 77, juego: 'lol', equipo_a: 1, equipo_b: 2, prob_a: 0.6,
        inicio_programado: '2026-09-27T18:00:00Z', predicha_en: '2026-09-27T15:00:00Z',
      }),
      metricas: async () => null,
    },
    nombresPartidos: async () => new Map([
      ['lol:1', { nombre: 'Uno' }], ['lol:2', { nombre: 'Dos' }],
    ]),
  });
  await f.bot.procesar(msg('/gratis'));
  const m = f.llamadas.find(x => x.metodo === 'sendMessage').datos;
  const botones = m.reply_markup.inline_keyboard.flat();
  assert.ok(botones.some(b => b.text.includes('Desbloquear informe completo') && b.callback_data === 'pro'));
  assert.ok(botones.some(b => b.text.includes('Comprar solo este análisis') && b.callback_data === 'comprar:77'));
  assert.ok(botones.some(b => b.callback_data === 'historial'));
});

test('copy comercial evita Cambios del modelo y usa alerta comprensible', async () => {
  const f = baseFixture();
  await f.bot.procesar(msg('/start'));
  const m = f.llamadas.find(x => x.metodo === 'sendMessage').datos;
  assert.doesNotMatch(m.text, /Cambios del modelo/);
  assert.match(m.text, /Alertas si cambia la predicción/);
});
