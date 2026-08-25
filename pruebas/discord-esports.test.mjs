import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://prueba.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'llave-de-prueba';

const { mensajePredicciones, mensajeResultados, calcularMetricas, embedsDe, TIERS_QUE_SE_AVISAN } = await import(
  '../salida/discord-esports.mjs'
);
const { enviar } = await import('../salida/discord.mjs');

const nombre = (id) => ({ 1: 'Vitality', 2: 'NAVI', 3: 'FaZe', 4: 'Spirit' })[id] ?? `#${id}`;
const AHORA = new Date('2026-08-17T12:00:00Z');

const pred = (o) => ({
  match_id: 1,
  equipo_a: 1,
  equipo_b: 2,
  inicio_programado: '2026-08-17T22:00:00Z',
  prob_a: 0.7,
  prob_b: 0.3,
  rd_a: 60,
  rd_b: 60,
  tier: 's',
  ...o,
});

test('mensajePredicciones: pone al favorito primero con su porcentaje', () => {
  const m = mensajePredicciones([pred({})], nombre, 'cs2', AHORA);
  assert.match(m, /CS2/);
  assert.match(m, /\*\*Vitality\*\* 70% vs NAVI 30%/);
});

test('mensajePredicciones: el favorito es el otro equipo si la probabilidad se invierte', () => {
  const m = mensajePredicciones([pred({ prob_a: 0.25, prob_b: 0.75 })], nombre, 'cs2', AHORA);
  assert.match(m, /\*\*NAVI\*\* 75% vs Vitality 25%/);
});

// La ventaja de Glicko-2 sobre Elo es expresar incertidumbre. Un "rd 300"
// crudo no le dice nada a nadie, así que se traduce a palabras.
test('mensajePredicciones: avisa en palabras cuando hay poco historial', () => {
  const m = mensajePredicciones([pred({ rd_b: 300 })], nombre, 'cs2', AHORA);
  assert.match(m, /poco historial, mucha incertidumbre/);
});

test('mensajePredicciones: marca los partidos parejos', () => {
  const m = mensajePredicciones([pred({ prob_a: 0.52, prob_b: 0.48 })], nombre, 'cs2', AHORA);
  assert.match(m, /muy parejo/);
});

test('mensajePredicciones: sin nada que avisar devuelve null', () => {
  assert.equal(mensajePredicciones([], nombre, 'cs2', AHORA), null);
});

test('mensajeResultados: distingue acierto de fallo', () => {
  const acierto = mensajeResultados(
    [pred({ resultado_real: 'ganaA', marcador_a: 2, marcador_b: 0 })],
    nombre,
    'cs2',
    null,
    AHORA,
  );
  assert.match(acierto, /✅ \*\*Vitality\*\* le ganó 2–0 a NAVI/);
  assert.match(acierto, /le dábamos 70%/);

  const fallo = mensajeResultados(
    [pred({ resultado_real: 'ganaB', marcador_a: 1, marcador_b: 2 })],
    nombre,
    'cs2',
    null,
    AHORA,
  );
  assert.match(fallo, /❌ \*\*NAVI\*\* le ganó 2–1 a Vitality/);
  assert.match(fallo, /íbamos con Vitality, 70%/);
});

test('calcularMetricas: cuenta aciertos y promedia el Brier', () => {
  const m = calcularMetricas([
    { prob_a: 0.7, resultado_real: 'ganaA', brier: 0.09 }, // acierta
    { prob_a: 0.7, resultado_real: 'ganaB', brier: 0.49 }, // falla
    { prob_a: 0.3, resultado_real: 'ganaB', brier: 0.09 }, // acierta
  ]);
  assert.equal(m.n, 3);
  assert.equal(m.aciertos, 2);
  // (0.09 + 0.49 + 0.09) / 3 = 0.2233…, verificable a mano.
  assert.equal(m.brier.toFixed(4), '0.2233');
});

test('calcularMetricas: con muestra chica NO se declara concluyente', () => {
  const m = calcularMetricas([
    { prob_a: 0.7, resultado_real: 'ganaA', brier: 0.09 },
    { prob_a: 0.6, resultado_real: 'ganaB', brier: 0.36 },
  ]);
  assert.equal(m.concluyente, false, 'con n=2 el intervalo contiene a la base de 0.25');
});

test('calcularMetricas: sin datos no inventa números', () => {
  assert.deepEqual(calcularMetricas([]), { n: 0 });
});

// CS2 mueve ~34 partidas al día contando todos los tiers. Anunciarlas todas
// es ruido que nadie lee.
test('sólo se avisan los tiers que importan', () => {
  assert.ok(TIERS_QUE_SE_AVISAN.has('s'));
  assert.ok(TIERS_QUE_SE_AVISAN.has('a'));
  assert.ok(!TIERS_QUE_SE_AVISAN.has('c'));
  assert.ok(!TIERS_QUE_SE_AVISAN.has('d'));
});

// ---------------------------------------------------------------------------
// Ventana de anticipación. LoL tenía 55 partidas de tier s/a pendientes a la
// vez y el mensaje se truncaba (1.887 caracteres, con aviso de recorte).
// ---------------------------------------------------------------------------
test('un mensaje con 24 h de partidas cabe en el límite de Discord', () => {
  const muchas = Array.from({ length: 12 }, (_, i) =>
    pred({ match_id: i, inicio_programado: `2026-08-17T${String(12 + (i % 10)).padStart(2, '0')}:00:00Z` }),
  );
  const m = mensajePredicciones(muchas, nombre, 'lol', AHORA);
  assert.ok(m.length < 1900, `el mensaje mide ${m.length}`);
  assert.doesNotMatch(m, /recortado/);
});

test('con demasiadas partidas el mensaje avisa que se recortó, no corta a la mitad', () => {
  const demasiadas = Array.from({ length: 90 }, (_, i) =>
    pred({ match_id: i, equipo_a: 1, equipo_b: 2 }),
  );
  const m = mensajePredicciones(demasiadas, nombre, 'lol', AHORA);
  assert.ok(m.length <= 1900);
  assert.match(m, /recortado/, 'mejor un aviso claro que un renglón cortado por la mitad');
});

// --- embeds con logos --------------------------------------------------------

const logos = new Map([
  [1, { nombre: 'Vitality', logo: 'https://cdn.ejemplo/vitality.webp' }],
  [2, { nombre: 'NAVI', logo: null }],
]);
const nombreConLogo = (id) => logos.get(id)?.nombre ?? `#${id}`;
const logoDe = (id) => logos.get(id)?.logo ?? null;

test('embedsDe: predicción lleva el logo del juego de autor, el escudo del favorito y el color del juego', () => {
  const [e] = embedsDe([pred({})], { juego: 'cs2', tipo: 'predicciones', nombre: nombreConLogo, logoDe });
  assert.equal(e.author.icon_url, 'https://mitzumitzukyh-code.github.io/monitor-esports/logos/logo-cs2.jpg');
  assert.equal(e.author.name, 'CS2');
  assert.equal(e.title, 'Vitality vs NAVI');
  assert.match(e.description, /→ \*\*Vitality\*\* 70%/);
  assert.equal(e.thumbnail.url, 'https://cdn.ejemplo/vitality.webp', 'el favorito es A: su escudo va de miniatura');
  assert.equal(e.color, 0xf5c400);
});

test('embedsDe: resultado pinta verde el acierto y rojo de marca el fallo, con el escudo del GANADOR', () => {
  const [acierto, fallo] = embedsDe(
    [pred({ resultado_real: 'ganaA', marcador_a: 2, marcador_b: 0 }), pred({ resultado_real: 'ganaB', marcador_a: 1, marcador_b: 2 })],
    { juego: 'lol', tipo: 'resultados', nombre: nombreConLogo, logoDe },
  );
  assert.equal(acierto.color, 0x19e68c);
  assert.equal(acierto.title, 'Vitality le ganó 2–0 a NAVI');
  assert.equal(acierto.thumbnail.url, 'https://cdn.ejemplo/vitality.webp', 'el escudo es del GANADOR');

  assert.equal(fallo.color, 0xff2638);
  assert.equal(fallo.title, 'NAVI le ganó 2–1 a Vitality');
  assert.ok(!fallo.thumbnail, 'NAVI no tiene logo: sin miniatura, sin img rota');
});

test('embedsDe: tope de 10 tarjetas por mensaje (límite de Discord); el texto sigue completo', () => {
  const muchas = Array.from({ length: 12 }, (_, i) => pred({ match_id: i, equipo_a: 1, equipo_b: 2 }));
  const embeds = embedsDe(muchas, { juego: 'dota2', tipo: 'predicciones', nombre: nombreConLogo, logoDe });
  assert.equal(embeds.length, 10);
  assert.equal(embeds[0].color, 0x9a3cff);
});

test('enviar: los embeds viajan en el cuerpo junto al texto', async () => {
  let captura = {};
  const r = await enviar('texto', {
    fetchImpl: async (url, opts) => {
      captura = { url, body: JSON.parse(opts.body) };
      return { ok: true };
    },
    webhook: 'https://discord.test/x',
    embeds: [{ title: 'tarjeta' }],
  });
  assert.equal(r.enviado, true);
  assert.deepEqual(captura.body.embeds, [{ title: 'tarjeta' }]);

  await enviar('texto sin embeds', {
    fetchImpl: async (url, opts) => {
      captura = { body: JSON.parse(opts.body) };
      return { ok: true };
    },
    webhook: 'https://discord.test/x',
  });
  assert.ok(!('embeds' in captura.body), 'sin embeds el cuerpo no lleva la clave');
});
