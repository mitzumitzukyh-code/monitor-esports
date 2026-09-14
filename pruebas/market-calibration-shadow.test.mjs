import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CALIBRATION_VERSION,
  SOURCE_GATE_VERSION,
  relacionEquipos,
  alinearCuota,
  probabilidadMercadoDevig,
  bandaDelta,
  elegirSnapshotCuota,
  observarCalibracion,
  resumirCalibracion,
} from '../auditoria/market-calibration-shadow.mjs';

const pred = {
  match_id: 42,
  juego: 'lol',
  equipo_a: 10,
  equipo_b: 20,
  inicio_programado: '2026-09-14T20:00:00.000Z',
  tier: 'a',
  prob_a: 0.624,
  prob_b: 0.376,
  resultado_real: null,
};

const gate = {
  match_id: 42,
  gate_version: 'quality-gate-v1',
  decision: 'pass',
  tier: 'a',
};

const cuota = (hora, extra = {}) => ({
  match_id: 42,
  capturado_en: hora,
  juego: 'lol',
  equipo_a: 10,
  equipo_b: 20,
  coeff_a: 1.72,
  coeff_b: 2.08,
  max_coeff_a: 1.78,
  max_coeff_b: 2.14,
  proveedor_id: 7,
  inicio_programado: pred.inicio_programado,
  ...extra,
});

test('versiones quedan congeladas', () => {
  assert.equal(CALIBRATION_VERSION, 'market-calibration-shadow-v1');
  assert.equal(SOURCE_GATE_VERSION, 'quality-gate-v1');
});

test('clasifica mismo orden, invertido y ajeno por team_id', () => {
  assert.equal(relacionEquipos(pred, cuota('2026-09-14T19:00:00Z')), 'mismo');
  assert.equal(relacionEquipos(pred, cuota('2026-09-14T19:00:00Z', { equipo_a: 20, equipo_b: 10 })), 'invertido');
  assert.equal(relacionEquipos(pred, cuota('2026-09-14T19:00:00Z', { equipo_a: 30, equipo_b: 40 })), 'ajeno');
});

test('remapea correctamente una cuota invertida', () => {
  const c = cuota('2026-09-14T19:00:00Z', {
    equipo_a: 20,
    equipo_b: 10,
    coeff_a: 2.08,
    coeff_b: 1.72,
    max_coeff_a: 2.14,
    max_coeff_b: 1.78,
  });
  const a = alinearCuota(pred, c);
  assert.equal(a.relacion, 'invertido');
  assert.equal(a.oddsA, 1.72);
  assert.equal(a.oddsB, 2.08);
  assert.equal(a.bestOddsA, 1.78);
});

test('de-vig normaliza probabilidades del mismo snapshot a uno', () => {
  const m = probabilidadMercadoDevig(1.72, 2.08);
  assert.ok(m);
  assert.ok(Math.abs(m.devigA + m.devigB - 1) < 1e-12);
  assert.ok(m.rawA > m.devigA);
  assert.ok(m.overround > 0);
});

test('rechaza cuotas inválidas', () => {
  assert.equal(probabilidadMercadoDevig(1, 2.0), null);
  assert.equal(probabilidadMercadoDevig(null, 2.0), null);
});

test('bandas de delta respetan los límites congelados', () => {
  assert.equal(bandaDelta(-5.01), '<-5pp');
  assert.equal(bandaDelta(-5), '-5..-2pp');
  assert.equal(bandaDelta(-2), '-2..0pp');
  assert.equal(bandaDelta(0), '0..2pp');
  assert.equal(bandaDelta(2), '2..5pp');
  assert.equal(bandaDelta(5), '5..8pp');
  assert.equal(bandaDelta(8), '8pp+');
});

test('snapshot usa la última cuota observable a la hora de evaluación, nunca una futura', () => {
  const cuotas = [
    cuota('2026-09-14T18:00:00Z', { coeff_a: 1.70 }),
    cuota('2026-09-14T19:00:00Z', { coeff_a: 1.72 }),
    cuota('2026-09-14T19:31:00Z', { coeff_a: 9.99 }),
  ];
  const elegido = elegirSnapshotCuota(pred, cuotas, { ahora: new Date('2026-09-14T19:30:00Z') });
  assert.equal(elegido.coeff_a, 1.72);
});

test('snapshot nunca usa captura posterior al inicio del partido', () => {
  const cuotas = [
    cuota('2026-09-14T19:50:00Z'),
    cuota('2026-09-14T20:01:00Z', { coeff_a: 9.99 }),
  ];
  const elegido = elegirSnapshotCuota(pred, cuotas, { ahora: new Date('2026-09-14T20:02:00Z') });
  assert.equal(elegido.capturado_en, '2026-09-14T19:50:00Z');
});

test('observación calcula modelo vs mercado de-vig sin convertirlo en decisión', () => {
  const obs = observarCalibracion(
    pred,
    gate,
    [cuota('2026-09-14T19:00:00Z')],
    { ahora: new Date('2026-09-14T19:30:00Z') },
  );
  assert.equal(obs.status, 'ok');
  assert.equal(obs.pick_side, 'A');
  assert.equal(obs.pick_team_id, 10);
  assert.equal(obs.model_probability, 0.624);
  assert.ok(Number.isFinite(obs.market_probability_devig));
  assert.ok(Number.isFinite(obs.model_market_delta_pp));
  assert.equal(obs.quote_age_minutes, 30);
  assert.equal('resultado_real' in obs, false);
  assert.equal('roi' in obs, false);
  assert.equal('ev' in obs, false);
  assert.equal('decision' in obs, false);
});

test('sin cuota produce observación explícita, no silencio', () => {
  const obs = observarCalibracion(pred, gate, [], { ahora: new Date('2026-09-14T19:30:00Z') });
  assert.equal(obs.status, 'no_quote');
  assert.equal(obs.match_id, 42);
});

test('equipos ajenos no contaminan la calibración', () => {
  const ajena = cuota('2026-09-14T19:00:00Z', { equipo_a: 30, equipo_b: 40 });
  const obs = observarCalibracion(pred, gate, [ajena], { ahora: new Date('2026-09-14T19:30:00Z') });
  assert.equal(obs.status, 'no_quote');
});

test('resumen cuenta estados y bandas sin métricas de resultado', () => {
  const ok = observarCalibracion(pred, gate, [cuota('2026-09-14T19:00:00Z')], { ahora: new Date('2026-09-14T19:30:00Z') });
  const noQuote = observarCalibracion({ ...pred, match_id: 43 }, { ...gate, match_id: 43 }, [], { ahora: new Date('2026-09-14T19:30:00Z') });
  const r = resumirCalibracion([ok, noQuote]);
  assert.equal(r.total, 2);
  assert.equal(r.ok, 1);
  assert.deepEqual(r.estados.find(([k]) => k === 'ok'), ['ok', 1]);
  assert.equal(r.bandas.reduce((s, [, count]) => s + count, 0), 1);
});
