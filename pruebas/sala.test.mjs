import test from 'node:test';
import assert from 'node:assert/strict';
import {
  esc,
  estadisticasPorJuego,
  anilloConfianza,
  filaSerie,
  tarjetaJuego,
  tarjetaCalidad,
  lineaJuicio,
  fuentesHtml,
  botonVivo,
  BASE_INGENUA,
} from '../salida/web/sala.mjs';

test('BASE_INGENUA es 0.25 para todos los juegos del mundo eslo', () => {
  assert.equal(BASE_INGENUA, 0.25);
});

test('esc: neutraliza lo que rompería el HTML, incluidas comillas de atributo', () => {
  assert.equal(esc('Team <Rojo> & "Cía"'), 'Team &lt;Rojo&gt; &amp; &quot;Cía&quot;');
});

// --- estadisticasPorJuego -----------------------------------------------------
// Caso a mano: 4 briers [0.0, 0.5, 0.25, 0.25] → media 0.25 exacto.
const FILAS = [
  { juego: 'cs2', resultado_real: 'ganaA', brier: 0 },
  { juego: 'cs2', resultado_real: 'ganaB', brier: 0.5 },
  { juego: 'cs2', resultado_real: 'ganaA', brier: 0.25 },
  { juego: 'cs2', resultado_real: null }, // pendiente: no cuenta
];

test('estadisticasPorJuego: promedia sólo las calificadas y no inventa con pendientes', () => {
  const s = estadisticasPorJuego(FILAS).get('cs2');
  assert.equal(s.n, 4);
  assert.equal(s.juzgadas, 3);
  assert.equal(s.brier.toFixed(4), '0.2500');
  assert.equal(s.mejora, 0); // 0.25/0.25 - 1
  assert.equal(s.concluyente, false); // el intervalo CONTIENE a la moneda
});

test('estadisticasPorJuego: sin juzgadas no produce Brier ni mejora', () => {
  const s = estadisticasPorJuego([{ juego: 'dota2', resultado_real: null }]).get('dota2');
  assert.equal(s.juzgadas, 0);
  assert.equal(s.brier, null);
  assert.equal(s.mejora, null);
  assert.equal(s.concluyente, false);
});

test('estadisticasPorJuego: peor que la moneda da mejora positiva', () => {
  const s = estadisticasPorJuego([
    { juego: 'val', resultado_real: 'ganaA', brier: 0.3 },
    { juego: 'val', resultado_real: 'ganaB', brier: 0.3 },
  ]).get('val');
  assert.equal(s.mejora > 0, true);
  assert.equal((s.mejora * 100).toFixed(1), '20.0'); // 0.30/0.25 - 1
});

// --- anillo -------------------------------------------------------------------
test('anilloConfianza: favorito claro va en verde, parejo en ámbar; el texto es el entero', () => {
  assert.match(anilloConfianza(0.612), /stroke="#19E68C"/);
  assert.match(anilloConfianza(0.612), />61<\/text>/);
  assert.match(anilloConfianza(0.53), /stroke="#FFB000"/);
  assert.match(anilloConfianza(0.55), /stroke="#FFB000"/); // 55% inclusive es parejo (umbral del diseño)
  assert.match(anilloConfianza(0.551), /stroke="#19E68C"/);
});

// --- fila -----------------------------------------------------------------------
const NOMBRES = new Map([
  [111, { nombre: 'Team Falcons' }],
  [222, { nombre: 'Gaimin Gladiators' }],
]);
const nombre = (id) => NOMBRES.get(id)?.nombre ?? `#${id}`;

test('filaSerie: fecha absoluta en data-inicio, favorito con un decimal, parejo marcado', () => {
  const f = {
    juego: 'dota2',
    equipo_a: 111,
    equipo_b: 222,
    inicio_programado: '2026-08-25T18:30:00+00:00',
    formato: 'bo3',
    prob_a: 0.487, // favorito es B con 51.3%... no: max(48.7, 51.3)=51.3 → PAREJO
  };
  const html = filaSerie(f, nombre);
  assert.match(html, /data-inicio="2026-08-25T18:30:00\+00:00"/);
  assert.match(html, /data-formato="bo3"/);
  assert.ok(!html.includes('data-resultado'), 'sin resultado no va data-resultado');
  assert.match(html, /<span class="prob">51\.3%<\/span> <span class="parejo">MUY PAREJO<\/span>/);
  assert.match(html, /stroke="#FFB000"/);
  assert.match(html, /<b>Team Falcons<\/b><span class="vs">VS<\/span><span>Gaimin Gladiators<\/span>/);
});

test('filaSerie: con resultado nace TERMINADA — ganador en negrita, marcador orientado y data-acierto', () => {
  const f = {
    juego: 'cs2',
    equipo_a: 1,
    equipo_b: 2,
    inicio_programado: '2026-08-24T11:00:00+00:00',
    formato: 'bo1',
    prob_a: 0.912, // íbamos con A
    resultado_real: 'ganaB', // ganó B: fallo
    marcador_a: 0,
    marcador_b: 2,
  };
  const html = filaSerie(f, (id) => (id === 1 ? 'NAVI <A>' : 'FaZe'));
  assert.match(html, /data-resultado="ganaB"/);
  assert.match(html, /data-acierto="0"/, 'íbamos con A y ganó B: fallo');
  assert.match(html, /<b>FaZe<\/b><span class="vs">VS<\/span><span>NAVI &lt;A&gt;<\/span>/, 'la negrita se la lleva el GANADOR');
  assert.match(html, /<span class="marcador mono">2–0<\/span>/, 'marcador orientado al ganador, no absoluto');
  assert.match(html, /<span class="prob">91\.2%<\/span>/); // sin "parejo"
  assert.match(html, /stroke="#19E68C"/);
});

test('filaSerie: acierto pone data-acierto=1 y sin marcador no hay span inventado', () => {
  const f = {
    juego: 'lol',
    equipo_a: 111,
    equipo_b: 222,
    inicio_programado: '2026-08-25T16:00:00+00:00',
    formato: 'bo3',
    prob_a: 0.699,
    resultado_real: 'ganaA',
  };
  const html = filaSerie(f, nombre);
  assert.match(html, /data-acierto="1"/);
  assert.match(html, /<b>Team Falcons<\/b>/);
  assert.ok(!html.includes('marcador'), 'sin marcador_a/b no se inventa uno');
});

// --- tarjetas --------------------------------------------------------------------
const CS2 = { id: 'cs2', etiqueta: 'CS2', css: '--cs2', logo: 'logos/logo-cs2.jpg' };

test('tarjetaJuego: KPIs con formato es-VE y guion cuando no hay datos', () => {
  const s = estadisticasPorJuego(FILAS).get('cs2');
  const html = tarjetaJuego(CS2, s, 5);
  assert.match(html, /mejora vs moneda<\/span><b>±?0\.0%/);
  assert.match(html, /juzgadas<\/span><b>3<\/b>/);
  assert.match(html, /próximas<\/span><b>5<\/b>/);
  const vacia = tarjetaJuego(CS2, null, 0);
  assert.match(vacia, /mejora vs moneda<\/span><b>—<\/b>/);
  assert.match(vacia, /juzgadas<\/span><b>0<\/b>/);
});

test('tarjetaCalidad: mejor que la moneda va en verde, PEOR va en ámbar (no en rojo)', () => {
  const buena = tarjetaCalidad(CS2, { juzgadas: 242, brier: 0.2344, mejora: 0.2344 / 0.25 - 1, concluyente: true });
  assert.match(buena, /class="mejora bien">−6\.2%</);
  assert.match(buena, /color:var\(--ok\)"?>CONCLUYENTE/);
  assert.match(buena, /n 242/);

  const mala = tarjetaCalidad(CS2, { juzgadas: 47, brier: 0.2795, mejora: 0.2795 / 0.25 - 1, concluyente: false });
  assert.match(mala, /class="mejora mal">\+11\.8%</);
  assert.ok(!mala.includes('--acento'), 'el rojo es la marca, no el error');
  assert.match(mala, /NO CONCLUYENTE/);

  const sinDatos = tarjetaCalidad(CS2, { juzgadas: 0, brier: null, mejora: null, concluyente: false });
  assert.match(sinDatos, /<div class="big">—<\/div>/);
  assert.match(sinDatos, /sin series juzgadas aún/);
  assert.ok(!sinDatos.includes('mejora '), 'sin datos no hay badge de mejora');
});

// --- juicio ----------------------------------------------------------------------
test('lineaJuicio: acierto ✓ con el favorito; fallo ✗ dice contra quién íbamos y quién ganó', () => {
  const acierto = lineaJuicio(
    { juego: 'lol', formato: 'bo3', prob_a: 0.59, equipo_a: 111, equipo_b: 222, resultado_real: 'ganaA' },
    nombre,
  );
  assert.match(acierto, /var\(--ok\)/);
  assert.match(acierto, /✓<\/span><span><b>Team Falcons<\/b> 59% — ganó<\/span>/);

  const fallo = lineaJuicio(
    { juego: 'cs2', formato: 'bo3', prob_a: 0.61, equipo_a: 222, equipo_b: 111, resultado_real: 'ganaB' },
    nombre,
  );
  // favorito era A (equipo_b aquí = id 222 = Gaimin), ganó B (Falcons)
  assert.match(fallo, /var\(--acento\)/);
  assert.match(fallo, /íbamos con <b>Gaimin Gladiators<\/b> 61% — ganó Team Falcons/);
  assert.match(fallo, /CS2 · bo3/);
});

// --- fuentes y botón ---------------------------------------------------------------
test('fuentesHtml: cada fuente prende según su bandera; OpenDota siempre fría', () => {
  const html = fuentesHtml({ supabaseOk: true, discordOk: false, telegramOk: true });
  const vivas = html.match(/fuente viva/g)?.length ?? 0;
  const frias = html.match(/fuente fria/g)?.length ?? 0;
  assert.equal(vivas, 3); // bo3.gg (implícita), Supabase, Telegram
  assert.equal(frias, 2); // Discord sin webhook + OpenDota
  assert.match(html, /Discord<\/div><div class="det">sin webhook configurado/);
  assert.match(html, /OpenDota[\s\S]*solo histórico/);
});

test('botonVivo: late si hubo actividad reciente; quieto y honesto si no', () => {
  assert.match(botonVivo(true), /<i class="late"><\/i>EN VIVO/);
  assert.match(botonVivo(false), /<i><\/i>CICLO EN PAUSA/);
});
