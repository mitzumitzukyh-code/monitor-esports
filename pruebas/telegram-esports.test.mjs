import test from 'node:test';
import assert from 'node:assert/strict';
import { avisarTelegram } from '../salida/telegram-esports.mjs';

process.env.SUPABASE_URL = 'https://prueba.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'llave-de-prueba';
// Sin esto, enviar() corta con "faltan TELEGRAM_BOT_TOKEN..." ANTES de tocar
// el fetch inyectado y la prueba nunca vería la llamada a api.telegram.org.
process.env.TELEGRAM_BOT_TOKEN = '123:prueba';
process.env.TELEGRAM_CHAT_ID = '@monitor_prueba';

// Fila de predicción tier s que arranca dentro de las 24 h: candidata a
// aviso. Los nombres de equipo salen de bo3.mjs vía fetch inyectado.
const PRED = {
  match_id: 900,
  juego: 'dota2',
  tier: 's',
  formato: 'bo3',
  equipo_a: 111,
  equipo_b: 222,
  inicio_programado: new Date(Date.now() + 3600 * 1000).toISOString(),
  resultado_real: null,
  avisado_telegram_prediccion_en: null,
  avisado_telegram_resultado_en: null,
};

const respuesta = (cuerpo) => ({ ok: true, json: async () => cuerpo });

test('avisarTelegram: manda por Telegram y marca SUS columnas, no las de Discord', async () => {
  const llamadas = { telegram: [], parches: [] };

  const fetchImpl = async (url, opts) => {
    if (String(url).includes('api.telegram.org')) {
      llamadas.telegram.push({ url: String(url), body: JSON.parse(opts.body) });
      return { ok: true, json: async () => ({}) };
    }
    // nombresDeEquipos contra bo3.gg
    return respuesta({ results: [{ id: 111, name: 'Team Falcons' }, { id: 222, name: 'GG' }] });
  };

  const fetchImplSupabase = async (url, opts) => {
    const u = String(url);
    if (u.includes('eslo_predicciones?select')) return respuesta([PRED]);
    if (u.startsWith('PATCH') || (opts?.method ?? '').toUpperCase() === 'PATCH') {
      llamadas.parches.push({ url: u, body: JSON.parse(opts.body) });
      return respuesta({});
    }
    return respuesta([]);
  };

  // parchear usa PATCH por defecto; lo interceptamos por URL también
  const r = await avisarTelegram('dota2', {
    fetchImpl,
    fetchImplSupabase: async (url, opts) => {
      const u = String(url);
      if (u.includes('eslo_predicciones?select')) return respuesta([PRED]);
      if ((opts?.method ?? '').toUpperCase() === 'PATCH') {
        llamadas.parches.push({ url: u, body: JSON.parse(opts.body) });
        return respuesta({});
      }
      return respuesta([]);
    },
  });

  assert.equal(llamadas.telegram.length, 1, 'debió mandar un mensaje a Telegram');
  assert.match(llamadas.telegram[0].url, /bot.*\/sendMessage/);
  assert.match(llamadas.telegram[0].body.text, /Team Falcons/);
  assert.equal(llamadas.parches.length, 1, 'debió marcar la fila');
  assert.ok(llamadas.parches[0].url.includes('match_id=in.(900)'), 'marcó el match_id equivocado');
  const columna = Object.keys(llamadas.parches[0].body)[0];
  assert.match(columna, /avisado_telegram_prediccion_en/, `marcó la columna equivocada: ${columna}`);
  assert.equal(r.enviados[0].enviado, true);
});
