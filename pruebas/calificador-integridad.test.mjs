import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://prueba.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'llave-de-prueba';

const { calificarTerminadas } = await import('../juez/vivo-esports.mjs');

const respuesta = (datos) => ({
  ok: true,
  status: 200,
  json: async () => datos,
  text: async () => JSON.stringify(datos),
});

function cruda({ id, a, b, ganador, ma, mb, disciplina = 1 }) {
  return {
    id,
    discipline_id: disciplina,
    tournament_id: 1,
    start_date: '2026-09-14T10:00:00.000Z',
    bo_type: 3,
    team1_id: a,
    team2_id: b,
    team1_score: ma,
    team2_score: mb,
    winner_team_id: ganador,
    tier: 'a',
    status: 'finished',
  };
}

function supabasePendientes(pendientes) {
  const patches = [];
  const fetchImpl = async (url, opciones = {}) => {
    if (opciones.method === 'PATCH') {
      patches.push({ url: String(url), body: JSON.parse(opciones.body) });
      return respuesta([]);
    }
    if (String(url).includes('/rest/v1/eslo_predicciones')) return respuesta(pendientes);
    return respuesta([]);
  };
  return { fetchImpl, patches };
}

test('calificador: una cola mayor de 100 no queda bloqueada por el primer lote', async () => {
  const pendientes = Array.from({ length: 101 }, (_, i) => ({
    match_id: i + 1,
    juego: 'cs2',
    equipo_a: 10,
    equipo_b: 20,
    prob_a: 0.6,
    resultado_real: null,
    inicio_programado: '2026-09-14T10:00:00.000Z',
  }));
  const { fetchImpl: fetchImplSupabase, patches } = supabasePendientes(pendientes);
  const llamadas = [];
  const bo3 = async (url) => {
    llamadas.push(String(url));
    if (String(url).includes('101')) {
      return respuesta({ results: [cruda({ id: 101, a: 10, b: 20, ganador: 10, ma: 2, mb: 0 })] });
    }
    return respuesta({ results: [] });
  };

  const r = await calificarTerminadas('cs2', { fetchImpl: bo3, fetchImplSupabase });

  assert.equal(llamadas.length, 2, 'debe consultar un segundo lote en vez de quedarse en las primeras 100');
  assert.equal(r.lotes, 2);
  assert.equal(r.consultadas, 101);
  assert.equal(r.calificadas, 1);
  assert.equal(r.noDevueltas, 100);
  assert.equal(patches.length, 1);
  assert.match(patches[0].url, /match_id=eq\.101/);
});

test('calificador: mismo match_id con equipos ajenos NO escribe un resultado falso', async () => {
  const pendientes = [{
    match_id: 200,
    juego: 'cs2',
    equipo_a: 10,
    equipo_b: 20,
    prob_a: 0.7,
    resultado_real: null,
    inicio_programado: '2026-09-14T10:00:00.000Z',
  }];
  const { fetchImpl: fetchImplSupabase, patches } = supabasePendientes(pendientes);
  const bo3 = async () => respuesta({
    results: [cruda({ id: 200, a: 30, b: 40, ganador: 30, ma: 2, mb: 0 })],
  });

  const r = await calificarTerminadas('cs2', { fetchImpl: bo3, fetchImplSupabase });

  assert.equal(r.calificadas, 0);
  assert.equal(r.fixtureMismatch, 1);
  assert.equal(patches.length, 0, 'un cambio de participantes no puede contaminar Brier/ROI');
});

test('calificador: acepta orden A/B invertido y remapea marcador a la predicción congelada', async () => {
  const pendientes = [{
    match_id: 300,
    juego: 'cs2',
    equipo_a: 10,
    equipo_b: 20,
    prob_a: 0.6,
    resultado_real: null,
    inicio_programado: '2026-09-14T10:00:00.000Z',
  }];
  const { fetchImpl: fetchImplSupabase, patches } = supabasePendientes(pendientes);
  // En el proveedor vienen 20 vs 10; gana 10 por 2-1.
  const bo3 = async () => respuesta({
    results: [cruda({ id: 300, a: 20, b: 10, ganador: 10, ma: 1, mb: 2 })],
  });

  const r = await calificarTerminadas('cs2', { fetchImpl: bo3, fetchImplSupabase });

  assert.equal(r.calificadas, 1);
  assert.equal(r.fixtureMismatch, 0);
  assert.equal(patches.length, 1);
  assert.equal(patches[0].body.resultado_real, 'ganaA');
  assert.equal(patches[0].body.marcador_a, 2);
  assert.equal(patches[0].body.marcador_b, 1);
  assert.equal(Number(patches[0].body.brier).toFixed(4), '0.1600');
});
