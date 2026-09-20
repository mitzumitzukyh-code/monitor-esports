import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://prueba.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'llave-de-prueba';

const { guardarCuotas } = await import('../datos/juegos/guardar-cuotas.mjs');

const respuesta = (datos) => ({
  ok: true,
  status: 200,
  json: async () => datos,
  text: async () => JSON.stringify(datos),
});

function partido({ id, a, b }) {
  return {
    id,
    discipline_id: 1,
    tournament_id: 1,
    start_date: '2099-09-20T12:00:00.000Z',
    bo_type: 3,
    team1_id: a,
    team2_id: b,
    status: 'upcoming',
    bet_updates: {
      bet_provider_id: 7,
      team_1: { team_id: a, coeff: 1.8, max_coeff: 1.9 },
      team_2: { team_id: b, coeff: 2.0, max_coeff: 2.1 },
    },
  };
}

test('guardarCuotas: no persiste cuotas que contradicen una predicción congelada', async () => {
  const bo3 = async () =>
    respuesta({
      results: [
        partido({ id: 101, a: 10, b: 20 }),
        partido({ id: 202, a: 30, b: 40 }),
        partido({ id: 303, a: 70, b: 80 }),
      ],
    });

  let insertadas = null;
  const supabase = async (url, opciones = {}) => {
    const s = String(url);
    if (s.includes('/rest/v1/eslo_predicciones') && !opciones.method) {
      return respuesta([
        { match_id: 101, juego: 'cs2', equipo_a: 10, equipo_b: 20 },
        // El proveedor reutilizó/corrigió #202: el pick congelado era 50/60.
        { match_id: 202, juego: 'cs2', equipo_a: 50, equipo_b: 60 },
        // Orden invertido, pero son exactamente los mismos participantes.
        { match_id: 303, juego: 'cs2', equipo_a: 80, equipo_b: 70 },
      ]);
    }
    if (s.includes('/rest/v1/eslo_cuotas') && opciones.method === 'POST') {
      insertadas = JSON.parse(opciones.body);
      return respuesta(insertadas);
    }
    return respuesta([]);
  };

  const r = await guardarCuotas(['cs2'], { fetchImpl: bo3, fetchImplSupabase: supabase });

  assert.equal(r.capturadas, 3);
  assert.equal(r.guardadas, 2);
  assert.equal(r.descartadasFixture, 1);
  assert.deepEqual(
    insertadas.map((x) => x.match_id).sort((a, b) => a - b),
    [101, 303],
  );
});
