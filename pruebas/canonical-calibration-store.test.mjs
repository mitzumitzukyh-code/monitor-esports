import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL_TABLE,
  filtrarNuevasCanonicas,
} from '../auditoria/canonical-calibration-store.mjs';

const ok = (matchId, observedAt = '2026-09-14T14:00:00Z') => ({
  calibration_version: 'market-calibration-shadow-v1',
  source_gate_version: 'quality-gate-v1',
  observed_at: observedAt,
  match_id: matchId,
  juego: 'lol',
  tier: 'a',
  inicio_programado: '2026-09-14T20:00:00Z',
  status: 'ok',
  pick_side: 'A',
  pick_team_id: 100,
  model_probability: 0.62,
  provider_odds_pick: 1.7,
  best_observed_odds_pick: 1.75,
  market_probability_raw: 0.58,
  market_probability_devig: 0.57,
  market_overround: 0.04,
  model_market_delta_pp: 5,
  delta_band: '5..8pp',
  quote_captured_at: '2026-09-14T13:55:00Z',
  quote_age_minutes: 5,
  quote_provider_id: 1,
  team_order_relation: 'mismo',
});

test('tabla canónica tiene nombre estable', () => {
  assert.equal(CANONICAL_TABLE, 'eslo_market_calibration_shadow');
});

test('sólo status ok es candidato canónico', () => {
  const rows = filtrarNuevasCanonicas([ok(1), { ...ok(2), status: 'no_quote' }], []);
  assert.deepEqual(rows.map((x) => x.match_id), [1]);
});

test('un match ya existente no se reemplaza por observación posterior', () => {
  const rows = filtrarNuevasCanonicas(
    [ok(1, '2026-09-14T15:00:00Z')],
    [{ match_id: 1, calibration_version: 'market-calibration-shadow-v1' }],
  );
  assert.equal(rows.length, 0);
});

test('duplicados dentro de la misma ejecución conservan la primera fila', () => {
  const first = ok(1, '2026-09-14T14:00:00Z');
  const second = { ...ok(1, '2026-09-14T14:05:00Z'), model_probability: 0.70 };
  const rows = filtrarNuevasCanonicas([first, second], []);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].observed_at, first.observed_at);
  assert.equal(rows[0].model_probability, first.model_probability);
});
