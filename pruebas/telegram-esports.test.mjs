import test from 'node:test';
import assert from 'node:assert/strict';
import { avisarTelegram, fotosDe } from '../salida/telegram-esports.mjs';

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

  assert.equal(llamadas.telegram.length, 2, 'texto + álbum de logos');
  assert.match(llamadas.telegram[0].url, /bot.*\/sendMessage/);
  assert.match(llamadas.telegram[0].body.text, /Team Falcons/);
  // El álbum: primero el logo del juego, y como los equipos del mock no
  // traen image_url, no hay escudos que añadir.
  assert.match(llamadas.telegram[1].url, /sendMediaGroup/);
  const media = llamadas.telegram[1].body.media;
  assert.equal(media.length, 1);
  assert.match(media[0].media, /logo-dota2\.png$/);
  assert.match(media[0].caption, /Dota 2/);
  assert.equal(llamadas.parches.length, 1, 'debió marcar la fila');
  assert.ok(llamadas.parches[0].url.includes('match_id=in.(900)'), 'marcó el match_id equivocado');
  const columna = Object.keys(llamadas.parches[0].body)[0];
  assert.match(columna, /avisado_telegram_prediccion_en/, `marcó la columna equivocada: ${columna}`);
  assert.equal(r.enviados[0].enviado, true);
});

// --- fotosDe: el álbum de logos ----------------------------------------------

const NOMBRES = new Map([
  [111, { nombre: 'Team Falcons', logo: 'https://cdn.ejemplo/falcons.webp' }],
  [222, { nombre: 'GG', logo: null }],
]);
const nombre = (id) => NOMBRES.get(id)?.nombre ?? `#${id}`;
const logoDe = (id) => NOMBRES.get(id)?.logo ?? null;

test('fotosDe: logo del juego de primero, escudo del favorito con caption en HTML escapado', () => {
  const fotos = fotosDe(
    [
      { juego: 'cs2', equipo_a: 111, equipo_b: 222, inicio_programado: '2026-08-25T22:00:00Z', prob_a: 0.7 },
      { juego: 'cs2', equipo_a: 222, equipo_b: 111, inicio_programado: '2026-08-25T23:00:00Z', prob_a: 0.3, marcador_a: null },
    ],
    { juego: 'cs2', tipo: 'predicciones', nombre, logoDe },
  );
  assert.equal(fotos.length, 3, 'logo del juego + 2 partidas');
  assert.match(fotos[0].url, /logo-cs2\.jpg$/);
  assert.match(fotos[0].caption, /<b>CS2<\/b>/);
  // Favorito de la primera es A (Falcons, 70%); de la segunda es B (Falcons otra vez, 70%).
  assert.equal(fotos[1].url, 'https://cdn.ejemplo/falcons.webp');
  assert.match(fotos[1].caption, /→ <b>Team Falcons<\/b> 70% vs GG/);
  assert.equal(fotos[2].url, 'https://cdn.ejemplo/falcons.webp');
});

test('fotosDe: resultados con el escudo del GANADOR, y sin escudo no hay foto inventada', () => {
  const fotos = fotosDe(
    [
      // Falcons (111, con escudo) es favorito y gana: acierto.
      { juego: 'lol', equipo_a: 111, equipo_b: 222, inicio_programado: '2026-08-25T20:00:00Z', prob_a: 0.7, resultado_real: 'ganaA', marcador_a: 2, marcador_b: 0 },
      // Íbamos con GG (222, SIN escudo) y ganó Falcons: fallo, pero la foto
      // existe porque el escudo es del GANADOR, no del favorito.
      { juego: 'lol', equipo_a: 222, equipo_b: 111, inicio_programado: '2026-08-25T21:00:00Z', prob_a: 0.6, resultado_real: 'ganaB' },
    ],
    { juego: 'lol', tipo: 'resultados', nombre, logoDe },
  );
  assert.equal(fotos.length, 3, 'logo del juego + 2 partidas');
  assert.match(fotos[0].caption, /<b>LoL<\/b>/);
  assert.match(fotos[1].caption, /✅ .* · <b>Team Falcons<\/b> 2–0 le ganó a GG/);
  assert.match(fotos[2].caption, /❌ .* · <b>Team Falcons<\/b> le ganó a GG/);
  assert.equal(fotos[2].url, 'https://cdn.ejemplo/falcons.webp', 'el escudo es del GANADOR aunque hayamos fallado');
});

test('fotosDe: tope de 10 fotos por grupo (límite de sendMediaGroup)', () => {
  const muchas = Array.from({ length: 15 }, (_, i) => ({
    juego: 'cs2',
    equipo_a: 111,
    equipo_b: 222,
    inicio_programado: `2026-08-25T${String(10 + i).padStart(2, '0')}:00:00Z`,
    prob_a: 0.7,
  }));
  const fotos = fotosDe(muchas, { juego: 'cs2', tipo: 'predicciones', nombre, logoDe });
  assert.equal(fotos.length, 10, '1 del juego + 9 partidas');
});
