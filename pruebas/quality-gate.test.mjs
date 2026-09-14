import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluarQualityGate, resumirQualityGate, GATE_VERSION } from '../auditoria/quality-gate.mjs';

const ahora = new Date('2026-09-14T14:00:00.000Z');
const base = {
  match_id: 1,
  juego: 'lol',
  tier: 's',
  prob_a: 0.62,
  prob_b: 0.38,
  rd_a: 90,
  rd_b: 120,
  inicio_programado: '2026-09-14T20:00:00.000Z',
};

test('pasa LoL tier S dentro de 24h, confianza 55-74.9 y RD bajo', () => {
  const d = evaluarQualityGate(base, { ahora });
  assert.equal(d.gate_version, GATE_VERSION);
  assert.equal(d.decision, 'pass');
  assert.deepEqual(d.reasons, []);
  assert.equal(d.confidence, 0.62);
  assert.equal(d.rd_max, 120);
});

test('rechaza juego no permitido', () => {
  const d = evaluarQualityGate({ ...base, juego: 'cs2' }, { ahora });
  assert.equal(d.decision, 'reject');
  assert.ok(d.reasons.includes('GAME_NOT_ALLOWED'));
});

test('rechaza tier fuera de S/A', () => {
  const d = evaluarQualityGate({ ...base, tier: 'b' }, { ahora });
  assert.ok(d.reasons.includes('TIER_NOT_ALLOWED'));
});

test('rechaza probabilidades inválidas', () => {
  const d = evaluarQualityGate({ ...base, prob_a: 0.8, prob_b: 0.4 }, { ahora });
  assert.ok(d.reasons.includes('INVALID_PROBABILITIES'));
});

test('rechaza si ya empezó', () => {
  const d = evaluarQualityGate({ ...base, inicio_programado: '2026-09-14T13:59:00.000Z' }, { ahora });
  assert.ok(d.reasons.includes('ALREADY_STARTED'));
});

test('rechaza si faltan más de 24h', () => {
  const d = evaluarQualityGate({ ...base, inicio_programado: '2026-09-15T15:00:00.000Z' }, { ahora });
  assert.ok(d.reasons.includes('TOO_FAR_AHEAD'));
});

test('rechaza confianza menor de 55%', () => {
  const d = evaluarQualityGate({ ...base, prob_a: 0.54, prob_b: 0.46 }, { ahora });
  assert.ok(d.reasons.includes('CONFIDENCE_TOO_LOW'));
});

test('rechaza confianza de 75% o más en v1', () => {
  const d = evaluarQualityGate({ ...base, prob_a: 0.75, prob_b: 0.25 }, { ahora });
  assert.ok(d.reasons.includes('CONFIDENCE_TOO_HIGH_FOR_V1'));
});

test('rechaza RD faltante o >=150', () => {
  const a = evaluarQualityGate({ ...base, rd_a: null }, { ahora });
  assert.ok(a.reasons.includes('RD_UNAVAILABLE'));
  const b = evaluarQualityGate({ ...base, rd_b: 150 }, { ahora });
  assert.ok(b.reasons.includes('RD_TOO_HIGH'));
});

test('conserva todos los motivos de rechazo, no sólo el primero', () => {
  const d = evaluarQualityGate({
    ...base,
    juego: 'valorant',
    tier: 'c',
    prob_a: 0.9,
    prob_b: 0.2,
    rd_a: 180,
    rd_b: 170,
    inicio_programado: '2026-09-14T13:00:00.000Z',
  }, { ahora });
  assert.deepEqual(new Set(d.reasons), new Set([
    'GAME_NOT_ALLOWED',
    'TIER_NOT_ALLOWED',
    'INVALID_PROBABILITIES',
    'ALREADY_STARTED',
    'CONFIDENCE_TOO_HIGH_FOR_V1',
    'RD_TOO_HIGH',
  ]));
});

test('resume pass/reject y frecuencia de motivos', () => {
  const ds = [
    evaluarQualityGate(base, { ahora }),
    evaluarQualityGate({ ...base, match_id: 2, juego: 'cs2' }, { ahora }),
    evaluarQualityGate({ ...base, match_id: 3, juego: 'cs2', tier: 'b' }, { ahora }),
  ];
  const r = resumirQualityGate(ds);
  assert.equal(r.total, 3);
  assert.equal(r.pass, 1);
  assert.equal(r.reject, 2);
  assert.equal(r.reasons.find(([k]) => k === 'GAME_NOT_ALLOWED')[1], 2);
});
