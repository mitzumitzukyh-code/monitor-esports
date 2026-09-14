import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EVALUATOR_VERSION,
  CALIBRATION_VERSION,
  probabilityBand,
  readingMilestone,
  scoreObservation,
  summarizeEvaluation,
} from '../auditoria/prospective-evaluator.mjs';

const obs = {
  calibration_version: 'market-calibration-shadow-v1',
  match_id: 10,
  juego: 'lol',
  observed_at: '2026-09-14T14:00:00Z',
  pick_side: 'A',
  pick_team_id: 100,
  model_probability: 0.62,
  market_probability_devig: 0.70,
  model_market_delta_pp: -8,
  delta_band: '<-5pp',
};

const pred = {
  match_id: 10,
  equipo_a: 100,
  equipo_b: 200,
  resultado_real: 'ganaA',
  calificada_en: '2026-09-14T18:00:00Z',
};

test('versiones del experimento quedan congeladas', () => {
  assert.equal(EVALUATOR_VERSION, 'prospective-evaluator-v1');
  assert.equal(CALIBRATION_VERSION, 'market-calibration-shadow-v1');
});

test('bandas de probabilidad quedan congeladas', () => {
  assert.equal(probabilityBand(0.549), '<55%');
  assert.equal(probabilityBand(0.55), '55-60%');
  assert.equal(probabilityBand(0.60), '60-65%');
  assert.equal(probabilityBand(0.65), '65-70%');
  assert.equal(probabilityBand(0.70), '70-75%');
  assert.equal(probabilityBand(0.75), '75%+');
});

test('hitos N30 N50 N100 quedan congelados', () => {
  assert.equal(readingMilestone(0), 'PRE_N30_INTEGRITY_ONLY');
  assert.equal(readingMilestone(29), 'PRE_N30_INTEGRITY_ONLY');
  assert.equal(readingMilestone(30), 'N30_INTEGRITY_CHECKPOINT');
  assert.equal(readingMilestone(50), 'N50_EXPLORATORY');
  assert.equal(readingMilestone(100), 'N100_OPERATIONAL_READ');
});

test('resultado pendiente no se puntúa', () => {
  const row = scoreObservation(obs, { ...pred, resultado_real: null, calificada_en: null });
  assert.equal(row.status, 'pending');
  assert.equal('brier_model' in row, false);
});

test('detecta identidad inconsistente antes de puntuar', () => {
  const row = scoreObservation(obs, { ...pred, equipo_a: 999 });
  assert.equal(row.status, 'identity_mismatch');
});

test('rechaza un resultado que preceda la observación prospectiva', () => {
  const row = scoreObservation(obs, { ...pred, calificada_en: '2026-09-14T13:59:59Z' });
  assert.equal(row.status, 'result_precedes_observation');
});

test('calcula Brier modelo y referencia cuando gana el pick', () => {
  const row = scoreObservation(obs, pred);
  assert.equal(row.status, 'resolved');
  assert.equal(row.outcome_pick, 1);
  assert.equal(row.pick_correct, true);
  assert.ok(Math.abs(row.brier_model - 0.1444) < 1e-12);
  assert.ok(Math.abs(row.brier_reference - 0.09) < 1e-12);
  assert.ok(row.brier_diff_model_minus_reference > 0);
});

test('calcula Brier correctamente cuando pierde el pick', () => {
  const row = scoreObservation(obs, { ...pred, resultado_real: 'ganaB' });
  assert.equal(row.outcome_pick, 0);
  assert.equal(row.pick_correct, false);
  assert.ok(Math.abs(row.brier_model - 0.3844) < 1e-12);
  assert.ok(Math.abs(row.brier_reference - 0.49) < 1e-12);
  assert.ok(row.brier_diff_model_minus_reference < 0);
});

test('lado B usa el resultado desde la perspectiva del pick', () => {
  const row = scoreObservation(
    { ...obs, pick_side: 'B', pick_team_id: 200, model_probability: 0.61, market_probability_devig: 0.58 },
    { ...pred, resultado_real: 'ganaB' },
  );
  assert.equal(row.status, 'resolved');
  assert.equal(row.outcome_pick, 1);
});

test('resumen separa pendientes y calcula métricas sólo con resueltas', () => {
  const resolvedA = scoreObservation(obs, pred);
  const resolvedB = scoreObservation({ ...obs, match_id: 11 }, { ...pred, match_id: 11, resultado_real: 'ganaB' });
  const pending = scoreObservation(
    { ...obs, match_id: 12 },
    { ...pred, match_id: 12, resultado_real: null, calificada_en: null },
  );
  const summary = summarizeEvaluation([resolvedA, resolvedB, pending]);
  assert.equal(summary.total_canonical, 3);
  assert.equal(summary.resolved, 2);
  assert.equal(summary.pending, 1);
  assert.equal(summary.global.n, 2);
  assert.equal(summary.by_delta_band['<-5pp'].n, 2);
  assert.equal(summary.by_probability_band['60-65%'].n, 2);
});

test('resumen vacío no inventa métricas', () => {
  const summary = summarizeEvaluation([]);
  assert.equal(summary.resolved, 0);
  assert.equal(summary.global.n, 0);
  assert.equal(summary.global.brier_model, null);
});
