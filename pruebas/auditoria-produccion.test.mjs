import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bucketConfianza,
  bucketCuota,
  relacionEquipos,
  elegirCuotaEntrada,
  elegirCuotaCierre,
  evaluar,
  resumir,
} from '../auditoria/produccion.mjs';

const pred = {
  match_id: 1,
  juego: 'cs2',
  equipo_a: 10,
  equipo_b: 20,
  inicio_programado: '2026-09-14T12:00:00.000Z',
  creada_en: '2026-09-14T10:00:00.000Z',
  prob_a: 0.70,
  prob_b: 0.30,
  resultado_real: 'ganaA',
};

const cuota = (hora, extra = {}) => ({
  match_id: 1,
  equipo_a: 10,
  equipo_b: 20,
  capturado_en: hora,
  inicio_programado: pred.inicio_programado,
  coeff_a: 1.50,
  coeff_b: 2.50,
  max_coeff_a: 1.60,
  max_coeff_b: 2.60,
  ...extra,
});

test('bucket de confianza y cuota respeta los límites comerciales', () => {
  assert.equal(bucketConfianza(0.549), '50-54.9%');
  assert.equal(bucketConfianza(0.55), '55-59.9%');
  assert.equal(bucketConfianza(0.75), '75%+');
  assert.equal(bucketCuota(1.39), '<1.40');
  assert.equal(bucketCuota(1.40), '1.40-1.59');
  assert.equal(bucketCuota(2.50), '2.50+');
});

test('clasifica mismo orden, orden invertido y equipos ajenos', () => {
  assert.equal(relacionEquipos(pred, cuota('2026-09-14T09:55:00.000Z')), 'mismo');
  assert.equal(relacionEquipos(pred, cuota('2026-09-14T09:55:00.000Z', { equipo_a: 20, equipo_b: 10 })), 'invertido');
  assert.equal(relacionEquipos(pred, cuota('2026-09-14T09:55:00.000Z', { equipo_a: 30, equipo_b: 40 })), 'ajeno');
});

test('entrada usa la última cuota previa a la predicción si tiene <=30 min', () => {
  const cuotas = [
    cuota('2026-09-14T09:20:00.000Z'),
    cuota('2026-09-14T09:45:00.000Z', { max_coeff_a: 1.61 }),
    cuota('2026-09-14T10:10:00.000Z', { max_coeff_a: 1.62 }),
  ];
  assert.equal(elegirCuotaEntrada(pred, cuotas).max_coeff_a, 1.61);
});

test('entrada no usa una cuota vieja y toma la primera observable posterior', () => {
  const cuotas = [
    cuota('2026-09-14T08:00:00.000Z'),
    cuota('2026-09-14T10:10:00.000Z', { max_coeff_a: 1.62 }),
  ];
  assert.equal(elegirCuotaEntrada(pred, cuotas).max_coeff_a, 1.62);
});

test('nunca usa como entrada ni cierre una captura posterior al inicio', () => {
  const cuotas = [
    cuota('2026-09-14T11:50:00.000Z', { max_coeff_a: 1.70 }),
    cuota('2026-09-14T12:01:00.000Z', { max_coeff_a: 9.99 }),
  ];
  assert.equal(elegirCuotaCierre(pred, cuotas).max_coeff_a, 1.70);
});

test('acepta A/B invertido y remapea la cuota al team_id elegido', () => {
  const invertida = cuota('2026-09-14T09:55:00.000Z', {
    equipo_a: 20,
    equipo_b: 10,
    coeff_a: 2.40,
    coeff_b: 1.55,
    max_coeff_a: 2.50,
    max_coeff_b: 1.72,
  });
  const r = evaluar(pred, [invertida]);
  assert.equal(r.cuotaEntrada, 1.72);
  assert.equal(r.cuotaProveedor, 1.55);
  assert.ok(Math.abs(r.roiEntrada - 0.72) < 1e-12);
});

test('descarta una cuota con team_id realmente ajenos al match', () => {
  const ajena = cuota('2026-09-14T09:55:00.000Z', { equipo_a: 30, equipo_b: 40, max_coeff_a: 9.99 });
  assert.equal(elegirCuotaEntrada(pred, [ajena]), null);
});

test('calcula Brier, acierto y ROI flat stake con el precio observable', () => {
  const r = evaluar(pred, [cuota('2026-09-14T09:55:00.000Z')]);
  assert.equal(r.acierto, true);
  assert.ok(Math.abs(r.brier - 0.09) < 1e-12);
  assert.ok(Math.abs(r.roiEntrada - 0.60) < 1e-12);
  assert.ok(Math.abs(r.roiProveedor - 0.50) < 1e-12);
});

test('resumen usa sólo filas con cuota para ROI, no inventa cuota ausente', () => {
  const conCuota = evaluar(pred, [cuota('2026-09-14T09:55:00.000Z')]);
  const sinCuota = evaluar({ ...pred, match_id: 2, resultado_real: 'ganaB' }, []);
  const r = resumir([conCuota, sinCuota]);
  assert.equal(r.n, 2);
  assert.equal(r.nOdds, 1);
  assert.ok(Math.abs(r.accuracy - 0.5) < 1e-12);
  assert.ok(Math.abs(r.roi - 0.60) < 1e-12);
});
