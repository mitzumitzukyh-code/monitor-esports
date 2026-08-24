import test from 'node:test';
import assert from 'node:assert/strict';
import {
  verificacion,
  ladoDelFavorito,
  bloqueVerificacion,
  graficoRatings,
  muestrear,
  graficoMercado,
  bloqueVeredicto,
  historialDeEquipo,
  bloqueForma,
  cabeza,
  enlaceDirecto,
  encabezado,
  urlDeEmbed,
  bloqueStream,
} from '../salida/web/perfil.mjs';

const nombre = (id) => ({ 1: 'Sentinels', 2: 'Disguised', 3: 'FlyQuest' }[id] ?? `#${id}`);

// Dos equipos idénticos dan 0.5 EXACTO: μA − μB = 0, así que la logística
// queda en 1/(1+e⁰) = 1/2. Es el único caso que se puede verificar sin
// calculadora, y es justo el de un equipo nuevo contra otro equipo nuevo
// (1500 ± 350 es el estado inicial de Glicko-2).
const IGUALES = {
  match_id: 10,
  juego: 'dota2',
  equipo_a: 1,
  equipo_b: 2,
  formato: 'bo3',
  inicio_programado: '2026-08-24T13:00:00+00:00',
  motor: 'glicko2',
  prob_a: 0.5,
  rating_a: 1500, rd_a: 350,
  rating_b: 1500, rd_b: 350,
};

test('verificacion: dos equipos iguales dan 50% exacto y la cuenta cuadra', () => {
  const v = verificacion(IGUALES);
  assert.equal(v.recalculado, 0.5);
  assert.equal(v.exacta, true);
  assert.equal(v.motor, 'glicko2');
});

test('verificacion: detecta cuando el número guardado NO sale de los ratings guardados', () => {
  // Mismos ratings (que dan 0.5) pero con un 0.80 guardado: alguien reescribió
  // la fila. La pantalla tiene que decirlo, no taparlo.
  const v = verificacion({ ...IGUALES, prob_a: 0.8 });
  assert.equal(v.exacta, false);
  assert.equal(v.enPantalla, false);
  assert.match(bloqueVerificacion(v, 'Sentinels', 'Disguised'), /NO cuadra/);
});

test('verificacion: sin el estado del motor no se inventa una cuenta', () => {
  assert.equal(verificacion({ ...IGUALES, rating_a: null }), null);
  assert.equal(verificacion({ ...IGUALES, rd_b: undefined }), null);
  assert.match(bloqueVerificacion(null, 'A', 'B'), /no se puede volver a calcular/);
});

test('ladoDelFavorito: 0.5 no tiene lado; por encima es A y por debajo es B', () => {
  assert.deepEqual(ladoDelFavorito({ guardado: 0.5 }), { empate: true, esA: null });
  assert.deepEqual(ladoDelFavorito({ guardado: 0.694 }), { empate: false, esA: true });
  assert.deepEqual(ladoDelFavorito({ guardado: 0.306 }), { empate: false, esA: false });
});

test('bloqueVerificacion: el número se muestra del lado del FAVORITO, no del equipo A', () => {
  // prob_a = 0.306 → el favorito es B (Disguised) con 69.4%. Antes esta caja
  // decía 30.6% justo debajo de un titular que decía 69.4%.
  const v = verificacion({ ...IGUALES, prob_a: 0.306, rating_a: 1421, rd_a: 64, rating_b: 1569, rd_b: 73 });
  const html = bloqueVerificacion(v, 'Sentinels', 'Disguised');
  assert.match(html, /guardado en la base · para Disguised/);
  assert.match(html, /69\.4%/);
  assert.ok(!html.includes('30.6%'), 'no se muestra la del lado A');
});

test('graficoRatings: el favorito va arriba y en el rojo de la marca', () => {
  const v = verificacion({ ...IGUALES, prob_a: 0.306, rating_a: 1421, rd_a: 64, rating_b: 1569, rd_b: 73 });
  const svg = graficoRatings(v, 'Sentinels', 'Disguised');
  // La primera fila dibujada (y=48) es la del favorito, y lleva el rojo.
  const primera = svg.slice(0, svg.indexOf('y1="112"'));
  assert.match(primera, /stroke="#FF2638"/);
  assert.match(primera, />Disguised</);
  assert.match(svg, /aria-label="Disguised 1569 más menos 73 contra Sentinels 1421 más menos 64"/);
});

// --- muestreo ------------------------------------------------------------------
test('muestrear: si caben todos no toca nada; si no, conserva el primero y el último', () => {
  const cinco = [1, 2, 3, 4, 5];
  assert.deepEqual(muestrear(cinco, 60), cinco);
  const cien = Array.from({ length: 100 }, (_, i) => i);
  const m = muestrear(cien, 10);
  assert.equal(m.length, 10);
  assert.equal(m[0], 0);
  assert.equal(m[9], 99);
});

// --- mercado -------------------------------------------------------------------
const capturas = (probsA) =>
  probsA.map((p, i) => ({
    capturado_en: new Date(Date.UTC(2026, 7, 24, 10 + i)).toISOString(),
    prob_a: p,
    margen: 0.05,
  }));

test('graficoMercado: sin al menos dos capturas no se dibuja nada', () => {
  assert.equal(graficoMercado([], IGUALES), '');
  assert.equal(graficoMercado(capturas([0.5]), IGUALES), '');
});

test('graficoMercado: cuando el favorito es B, la línea se voltea para poder comparar', () => {
  const f = { ...IGUALES, prob_a: 0.3 }; // favorito B con 70%
  // El mercado le da a A 0.25 y 0.35 → visto desde B es 0.75 y 0.65.
  const html = graficoMercado(capturas([0.25, 0.35]), f);
  assert.match(html, /El mercado abrió en 75\.0 % y cerró en 65\.0 %/);
  assert.match(html, /motor 70\.0%/);
  assert.match(html, /5\.0 % en promedio/);
});

// --- veredicto -----------------------------------------------------------------
const JUZGADA = {
  ...IGUALES,
  prob_a: 0.694,
  resultado_real: 'ganaA',
  marcador_a: 2,
  marcador_b: 0,
  brier: 0.0936,
};

test('bloqueVeredicto: sin resultado no hay veredicto que dar', () => {
  assert.equal(bloqueVeredicto(IGUALES, null, 'Sentinels', 'Disguised'), '');
});

test('bloqueVeredicto: acierto con marcador, Brier y comparación contra la moneda', () => {
  const html = bloqueVeredicto(JUZGADA, { brier: 0.202, juzgadas: 121 }, 'Sentinels', 'Disguised');
  assert.match(html, /class="resultado ok"/);
  assert.match(html, /le dio la ventaja a <b>Sentinels<\/b> y ganó/);
  assert.match(html, /<span class="marcador mono">2–0<\/span>/);
  assert.match(html, /0\.0936/);
  assert.match(html, /Mejor que la moneda, que saca 0\.250\. Mejor que el promedio del juego \(0\.202 en 121 series\)/);
});

test('bloqueVeredicto: un Brier peor que la moneda se dice, no se maquilla', () => {
  const html = bloqueVeredicto(
    { ...JUZGADA, resultado_real: 'ganaB', brier: 0.4816 },
    { brier: 0.202, juzgadas: 121 },
    'Sentinels',
    'Disguised',
  );
  assert.match(html, /class="resultado mal"/);
  assert.match(html, /y ganó Disguised/);
  assert.match(html, /Peor que la moneda/);
  assert.match(html, /Peor que el promedio del juego/);
});

test('bloqueVeredicto: 50/50 juzgada no se cobra como acierto ni como fallo', () => {
  const html = bloqueVeredicto({ ...IGUALES, resultado_real: 'ganaB', brier: 0.25 }, null, 'Sentinels', 'Disguised');
  assert.match(html, /class="resultado espera"/);
  assert.match(html, /El motor no se jugó por ninguno/);
});

// --- forma ---------------------------------------------------------------------
const HISTORIAL = [
  { match_id: 1, equipo_a: 1, equipo_b: 3, inicio_programado: '2026-08-20T00:00:00Z', resultado_real: 'ganaA', prob_a: 0.6 },
  { match_id: 2, equipo_a: 3, equipo_b: 1, inicio_programado: '2026-08-22T00:00:00Z', resultado_real: 'ganaA', prob_a: 0.7 },
  { match_id: 3, equipo_a: 1, equipo_b: 2, inicio_programado: '2026-08-23T00:00:00Z', resultado_real: null, prob_a: 0.5 },
  { match_id: 4, equipo_a: 2, equipo_b: 3, inicio_programado: '2026-08-21T00:00:00Z', resultado_real: 'ganaA', prob_a: 0.55 },
];

test('historialDeEquipo: sólo calificadas, de la más nueva a la más vieja, sin la serie actual', () => {
  const h = historialDeEquipo(HISTORIAL, 1, { excluir: 3 });
  assert.deepEqual(h.map((x) => x.match_id), [2, 1]);
  assert.equal(historialDeEquipo(HISTORIAL, 1, { excluir: 3, limite: 1 }).length, 1);
  assert.equal(historialDeEquipo(HISTORIAL, 99).length, 0);
});

test('bloqueForma: V/P del equipo y ✓/✗ del motor son dos cosas distintas', () => {
  const h = historialDeEquipo(HISTORIAL, 1, { excluir: 3 });
  const html = bloqueForma(h, 1, 'Sentinels', nombre);
  // match 2: gana A (FlyQuest), o sea Sentinels PERDIÓ. El motor le daba a
  // FlyQuest 70% y acertó. Al equipo 1 le tocaba el 30%.
  assert.match(html, /<li class="perdio">.*?>P<.*?FlyQuest.*?30\.0%.*?tino mono ok/s);
  // match 1: gana A (Sentinels) con 60%: ganó y el motor acertó.
  assert.match(html, /<li class="gano">.*?>V<.*?FlyQuest.*?60\.0%.*?tino mono ok/s);
  assert.match(html, /<small>1 de 2<\/small>/);
});

test('bloqueForma: sin historial lo dice, no dibuja una lista vacía', () => {
  assert.match(bloqueForma([], 9, 'Nadie', nombre), /Sin series calificadas en la base/);
});

// --- cabeza y enlaces ------------------------------------------------------------
test('cabeza: título, canónica y descripción propias de esta serie', () => {
  const html = cabeza({ ...IGUALES, prob_a: 0.306, match_id: 123696 }, 'Sentinels', 'Disguised');
  assert.match(html, /<title>Sentinels vs Disguised · Monitor eSports<\/title>/);
  assert.match(html, /serie-123696\.html/);
  assert.match(html, /69\.4% para Disguised/);
});

test('cabeza: un 50/50 no se anuncia como si hubiera favorito', () => {
  assert.match(cabeza(IGUALES, 'Sentinels', 'Disguised'), /50\/50 exacto/);
});

test('enlaceDirecto: sin slug no hay botón — no se inventa un link', () => {
  assert.equal(enlaceDirecto(null), '');
  assert.match(enlaceDirecto('a-vs-b-24-08-2026'), /href="https:\/\/bo3\.gg\/matches\/a-vs-b-24-08-2026"/);
  assert.match(enlaceDirecto('a-vs-b', { enCurso: true }), /Ver el directo/);
  assert.match(enlaceDirecto('a-vs-b', { enCurso: false }), /Ver la serie en bo3\.gg/);
});

test('encabezado: la hora va absoluta y el estado lo pone el reloj del visitante', () => {
  const html = encabezado(IGUALES, { nombreA: 'Sentinels', nombreB: 'Disguised', etiqueta: 'DOTA 2', chip: 'j-dota' });
  assert.match(html, /data-inicio="2026-08-24T13:00:00\+00:00"/);
  assert.match(html, /<span class="estado-vivo" data-formato="bo3"><\/span>/);
  assert.match(html, /sin favorito · moneda al aire/);
  assert.match(html, /MUY PAREJO/);
});

test('encabezado: una serie juzgada nace con su veredicto escrito, sin JavaScript', () => {
  const html = encabezado(JUZGADA, { nombreA: 'Sentinels', nombreB: 'Disguised', etiqueta: 'LOL', chip: 'j-lol' });
  assert.match(html, /✓ Acertó/);
  assert.ok(!html.includes('estado-vivo'), 'lo ya jugado no depende del reloj');
  assert.match(html, /<b>Sentinels<\/b>/);
});

// --- el directo ------------------------------------------------------------------
const TWITCH = { nombre: 'valorant_br', plataforma: 'twitch', embed: 'https://player.twitch.tv/?channel=valorant_br', url: 'https://www.twitch.tv/valorant_br', espectadores: 996, idioma: 'pt', oficial: true };
const YT = { nombre: 'EG x 7VEN | Game Changers', plataforma: 'youtube', embed: 'https://www.youtube.com/embed/VoZMuX_6I2A', url: 'https://www.youtube.com/watch?v=vozmux', espectadores: 48, idioma: 'pt', oficial: false };
const KICK = { nombre: 'epldota_en2', plataforma: 'kick', embed: 'https://player.kick.com/epldota_en2', url: 'https://kick.com/epldota_en2', espectadores: 852, idioma: 'en', oficial: false };

test('urlDeEmbed: Twitch exige parent o el reproductor no carga; los otros van tal cual', () => {
  const u = urlDeEmbed(TWITCH);
  assert.match(u, /parent=mitzumitzukyh-code\.github\.io/);
  assert.match(u, /parent=localhost/, 'para poder probarlo en el servidor local');
  assert.equal(u.startsWith('https://player.twitch.tv/?channel=valorant_br&'), true);
  assert.equal(urlDeEmbed(KICK), KICK.embed);
  assert.equal(urlDeEmbed(YT), YT.embed);
  assert.equal(urlDeEmbed(null), null);
  assert.equal(urlDeEmbed({ plataforma: 'kick' }), null);
});

test('bloqueStream: sin canales no se dibuja una sección vacía', () => {
  assert.equal(bloqueStream([]), '');
  assert.equal(bloqueStream(null), '');
  assert.equal(bloqueStream([{ nombre: 'x', plataforma: 'kick' }]), '', 'sin embed no sirve');
});

test('bloqueStream: el primero manda en el reproductor y queda marcado', () => {
  const html = bloqueStream([TWITCH, YT], { enCurso: true });
  assert.match(html, /<iframe id="reproductor" src="https:\/\/player\.twitch\.tv[^"]*parent=/);
  assert.match(html, /class="canal activo"/);
  // data-embed y no class="canal", que también pega con el contenedor .canales
  assert.equal((html.match(/data-embed="/g) ?? []).length, 2);
  assert.match(html, /oficial · 996 viendo · pt/);
  assert.match(html, /La serie está en curso/);
});

test('bloqueStream: cada canal es un enlace de verdad — sin JavaScript se abre en su sitio', () => {
  const html = bloqueStream([KICK]);
  assert.match(html, /href="https:\/\/kick\.com\/epldota_en2"/);
  assert.match(html, /data-embed="https:\/\/player\.kick\.com\/epldota_en2"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /852 viendo · en/);
});

test('bloqueStream: un canal sin conteo lo dice, no inventa un cero de espectadores', () => {
  assert.match(bloqueStream([{ ...KICK, espectadores: 0 }]), /sin conteo/);
});
