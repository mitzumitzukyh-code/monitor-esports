import test from 'node:test';
import assert from 'node:assert/strict';
import { clasificarPendiente, diagnosticarPendientes } from '../auditoria/estado-pendientes.mjs';

const AHORA = Date.parse('2026-11-04T10:00:00.000Z');
const pred = (id = 101, juego = 'cs2') => ({
  match_id: id, juego, equipo_a: 10, equipo_b: 20,
  inicio_programado: '2026-11-03T12:00:00.000Z',
});
const cruda = (id = 101, cambios = {}) => ({
  id, discipline_id: 1, team1_id: 10, team2_id: 20,
  status: 'finished', start_date: '2026-11-03T12:00:00.000Z',
  bo_type: 3, winner_team_id: 10, team1_score: 2, team2_score: 0,
  ...cambios,
});
const respuesta = (datos, status = 200) => ({
  ok: status === 200, status,
  json: async () => datos,
});

test('resultado final verificable con equipos originales requiere calificar', () => {
  assert.equal(clasificarPendiente(pred(), cruda(), AHORA), 'terminado_sin_calificar');
});

test('acepta equipos A/B invertidos sin cambiar el resultado congelado', () => {
  assert.equal(clasificarPendiente(pred(), cruda(101, {
    team1_id: 20, team2_id: 10, winner_team_id: 20,
    team1_score: 2, team2_score: 0,
  }), AHORA), 'terminado_sin_calificar');
});

test('fixture sustituido no es un resultado verificable de la prediccion', () => {
  assert.equal(clasificarPendiente(pred(), cruda(101, {
    team1_id: 10, team2_id: 30, winner_team_id: 10,
  }), AHORA), 'fixture_cambiado');
});

test('un estado upcoming reprogramado no equivale a finalizado', () => {
  assert.equal(clasificarPendiente(pred(), cruda(101, {
    status: 'upcoming', winner_team_id: null,
    start_date: '2026-11-06T12:00:00.000Z',
  }), AHORA), 'reprogramado');
  assert.equal(clasificarPendiente(pred(), cruda(101, {
    status: 'ongoing', winner_team_id: null,
  }), AHORA), 'sin_resultado_confirmado');
});

test('resultado incoherente entre marcador y ganador se rechaza', () => {
  assert.equal(clasificarPendiente(pred(), cruda(101, {
    winner_team_id: 20, team1_score: 2, team2_score: 0,
  }), AHORA), 'resultado_invalido');
});

test('ID no devuelto o disciplina ajena no simulan un resultado correcto', () => {
  assert.equal(clasificarPendiente(pred(), null, AHORA), 'no_encontrado');
  assert.equal(clasificarPendiente(pred(), cruda(101, { discipline_id: 2 }), AHORA), 'dato_ajeno');
});

test('diagnostico consulta cada juego y agrupa las causas sin escrituras', async () => {
  const consultas = [];
  const fetchImpl = async (url, opciones) => {
    consultas.push({ url, opciones });
    if (url.includes('discipline_id][eq]=1')) {
      return respuesta({ results: [
        cruda(101),
        cruda(102, { id: 102, team2_id: 30 }),
      ] });
    }
    return respuesta({ results: [
      cruda(201, { id: 201, discipline_id: 4, status: 'upcoming', start_date: '2026-11-05T09:00:00.000Z' }),
    ] });
  };
  const pendientes = [pred(101), pred(102), pred(103), pred(201, 'dota2')];
  const r = await diagnosticarPendientes(pendientes, { fetchImpl, ahora: AHORA });
  assert.equal(r.total, 4);
  assert.equal(r.lotes, 2);
  assert.deepEqual(r.terminado_sin_calificar, [101]);
  assert.deepEqual(r.fixture_cambiado, [102]);
  assert.deepEqual(r.no_encontrado, [103]);
  assert.deepEqual(r.reprogramado, [201]);
  assert.equal(consultas.length, 2);
  assert.ok(consultas.every((c) => !c.opciones.method));
});

test('diagnostico pagina en grupos de hasta cien, sin perder la cola', async () => {
  const consultas = [];
  const fetchImpl = async (url) => {
    consultas.push(url);
    const ids = url.split('filter[matches.id][in]=')[1].split(',').map(Number);
    assert.ok(ids.length <= 100);
    return respuesta({ results: ids.map((id) => cruda(id)) });
  };
  const r = await diagnosticarPendientes(
    Array.from({ length: 101 }, (_, i) => pred(i + 1)),
    { fetchImpl, ahora: AHORA },
  );
  assert.equal(r.lotes, 2);
  assert.equal(r.terminado_sin_calificar.length, 101);
  assert.equal(consultas.length, 2);
});

test('fallos HTTP y formatos inesperados no se silencian como fixtures ausentes', async () => {
  await assert.rejects(
    diagnosticarPendientes([pred()], { fetchImpl: async () => respuesta({}, 503) }),
    /503/,
  );
  await assert.rejects(
    diagnosticarPendientes([pred()], { fetchImpl: async () => respuesta({ errors: [] }) }),
    /sin results/,
  );
});
