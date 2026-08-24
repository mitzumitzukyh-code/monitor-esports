import test from 'node:test';
import assert from 'node:assert/strict';
import {
  esc,
  estadisticasPorJuego,
  favoritoDe,
  filaSerie,
  tarjetaJuego,
  tarjetaCalidad,
  lineaJuicio,
  cintaVeredictos,
  pestanas,
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

// --- favoritoDe ----------------------------------------------------------------
// El bug que arregla: con prob_a = 0.13 el favorito es B con 87%, no A con 13%.
test('favoritoDe: el favorito puede ser B, y su probabilidad es 1 - prob_a', () => {
  const a = favoritoDe({ prob_a: 0.699 });
  assert.deepEqual([a.hay, a.lado, Number(a.prob.toFixed(3))], [true, 'A', 0.699]);

  const b = favoritoDe({ prob_a: 0.13 });
  assert.deepEqual([b.hay, b.lado, Number(b.prob.toFixed(3))], [true, 'B', 0.87]);
});

test('favoritoDe: 50/50 exacto no tiene favorito y sin número no hay nada', () => {
  assert.equal(favoritoDe({ prob_a: 0.5 }).hay, false);
  assert.equal(favoritoDe({ prob_a: 0.5 }).prob, 0.5);
  assert.equal(favoritoDe({ prob_a: null }).prob, null);
});

// --- fila -----------------------------------------------------------------------
const NOMBRES = new Map([
  [111, { nombre: 'Team Falcons' }],
  [222, { nombre: 'Gaimin Gladiators' }],
]);
const nombre = (id) => NOMBRES.get(id)?.nombre ?? `#${id}`;

test('filaSerie: el porcentaje SIEMPRE viene con el nombre del equipo al que se le da', () => {
  const f = {
    juego: 'dota2',
    equipo_a: 111,
    equipo_b: 222,
    inicio_programado: '2026-08-25T18:30:00+00:00',
    formato: 'bo3',
    prob_a: 0.487, // el favorito es B (Gaimin) con 51.3% — muy parejo
  };
  const html = filaSerie(f, nombre);
  assert.match(html, /data-inicio="2026-08-25T18:30:00\+00:00"/);
  assert.match(html, /data-formato="bo3"/);
  assert.match(html, /data-juego="DOTA 2"/);
  assert.match(html, /class="abierta" data-grupo="abierta"/);
  assert.ok(!html.includes('data-resultado'), 'sin resultado no va data-resultado');
  assert.match(html, /<span class="prob mono">51\.3%<\/span> <span class="parejo">MUY PAREJO<\/span>/);
  // Lo que faltaba en la pantalla vieja: a quién se le da el 51.3%.
  assert.match(html, /<p class="favorito"><span class="rel">→<\/span> <b>Gaimin Gladiators<\/b><\/p>/);
  assert.match(html, /aria-label="El motor le da 51\.3 por ciento a Gaimin Gladiators"/);
  assert.match(html, /<i style="width:51\.3%"><\/i>/);
  // Y la negrita de la columna SERIE se la lleva ese mismo equipo, no el A.
  assert.match(html, /<span>Team Falcons<\/span><span class="vs">vs<\/span><b>Gaimin Gladiators<\/b>/);
});

test('filaSerie: 50/50 exacto no inventa favorito ni pone a nadie en negrita', () => {
  const html = filaSerie(
    {
      juego: 'dota2',
      equipo_a: 111,
      equipo_b: 222,
      inicio_programado: '2026-08-25T18:30:00+00:00',
      formato: 'bo3',
      prob_a: 0.5,
    },
    nombre,
  );
  assert.match(html, /<p class="favorito ninguno">sin favorito · moneda al aire<\/p>/);
  assert.match(html, /<span>Team Falcons<\/span><span class="vs">vs<\/span><span>Gaimin Gladiators<\/span>/);
  assert.ok(!html.includes('<b>'), 'sin favorito no hay protagonista');
});

test('filaSerie: 50/50 JUZGADA no se cobra como fallo — veredicto ámbar y sin data-acierto', () => {
  const html = filaSerie(
    {
      juego: 'lol',
      equipo_a: 111,
      equipo_b: 222,
      inicio_programado: '2026-08-25T12:00:00+00:00',
      formato: 'bo3',
      prob_a: 0.5,
      resultado_real: 'ganaB',
    },
    nombre,
  );
  assert.match(html, /class="juzgada"/);
  assert.match(html, /<span class="veredicto espera">· 50\/50<\/span>/);
  assert.ok(!html.includes('FALLÓ'), 'no hubo apuesta que perder: FALLÓ sería mentira');
  assert.ok(!html.includes('data-acierto'), 'sin favorito no hay acierto que registrar');
});

// --- mercado ---------------------------------------------------------------------
test('filaSerie: MERCADO muestra la cuota del FAVORITO con dos decimales; si no hay, «—»', () => {  const f = {
    juego: 'cs2',
    equipo_a: 111,
    equipo_b: 222,
    inicio_programado: '2026-08-25T16:00:00+00:00',
    formato: 'bo3',
    prob_a: 0.3, // favorito es B (Gaimin)
  };
  // La cuota que importa es la de B, no la de A: max_coeff_b.
  const conCuota = filaSerie(f, nombre, () => 1.85);
  assert.match(conCuota, /<td class="mercado mono">1\.85<\/td>/);

  const sinCuota = filaSerie(f, nombre, () => null);
  assert.match(sinCuota, /<td class="mercado mono">—<\/td>/);

  const sinColumna = filaSerie(f, nombre); // sin tercer parámetro
  assert.match(sinColumna, /<td class="mercado mono">—<\/td>/);

  // Cuota inservible (0, negativa, NaN) también es «—»: nunca un cero mentiroso.
  const rota = filaSerie(f, nombre, () => 0);
  assert.match(rota, /<td class="mercado mono">—<\/td>/);
});

// --- escudos ----------------------------------------------------------------------
test('filaSerie: escudo enlazado por equipo y respetando el orden en pantalla', () => {
  const f = {
    juego: 'cs2',
    equipo_a: 111,
    equipo_b: 222,
    inicio_programado: '2026-08-25T16:00:00+00:00',
    formato: 'bo3',
    prob_a: 0.3, // favorito B
    resultado_real: 'ganaB', // ganó B: la fila muestra B primero
    marcador_a: 0,
    marcador_b: 2,
  };
  const logos = new Map([
    [111, 'https://cdn.ejemplo/a.webp?x=1&y=2'],
    [222, 'https://cdn.ejemplo/b.webp'],
  ]);
  const html = filaSerie(f, nombre, null, (id) => logos.get(id) ?? null);
  // El escudo de B (ganador, va a la izquierda) es el de id 222.
  const escudos = html.match(/<img class="escudo" src="([^"]+)"/g) ?? [];
  assert.equal(escudos.length, 2);
  assert.match(html, /<img class="escudo" src="https:\/\/cdn\.ejemplo\/b\.webp"[^>]*><b>Gaimin Gladiators<\/b>/);
  assert.match(html, /src="https:\/\/cdn\.ejemplo\/a\.webp\?x=1&amp;y=2"/, 'el & de la URL se escapa en el atributo');
  assert.match(html, /onerror="this\.remove\(\)"/, 'si el CDN falla, la imagen se quita sola');
  assert.match(html, /referrerpolicy="no-referrer"/);
});

test('filaSerie: sin logoDe o con equipo sin logo, no hay img rota — sólo el nombre', () => {
  const f = { juego: 'cs2', equipo_a: 111, equipo_b: 222, inicio_programado: '2026-08-25T16:00:00+00:00', formato: 'bo3', prob_a: 0.7 };
  const sinFuncion = filaSerie(f, nombre);
  assert.ok(!sinFuncion.includes('escudo'));
  const conHueco = filaSerie(f, nombre, null, (id) => (id === 111 ? 'https://cdn.ejemplo/a.webp' : null));
  assert.equal((conHueco.match(/class="escudo"/g) ?? []).length, 1, 'el equipo sin logo no genera img');
  assert.match(conHueco, /<span>Gaimin Gladiators<\/span>/);
});

test('filaSerie: con resultado nace juzgada — veredicto en el HTML, ganador y marcador orientado', () => {
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
  assert.match(html, /class="juzgada" data-grupo="juzgada"/);
  assert.match(html, /data-resultado="ganaB"/);
  assert.match(html, /data-acierto="0"/, 'íbamos con A y ganó B: fallo');
  assert.match(html, /<span class="veredicto no">✗ FALLÓ<\/span>/);
  assert.match(html, /<b>FaZe<\/b><span class="vs">vs<\/span><span>NAVI &lt;A&gt;<\/span>/, 'la negrita se la lleva el GANADOR');
  assert.match(html, /<span class="marcador mono">2–0<\/span>/, 'marcador orientado al ganador, no absoluto');
  assert.match(html, /<span class="prob mono">91\.2%<\/span>/); // sin "parejo"
  assert.match(html, /<span class="rel">íbamos con<\/span> <b>NAVI &lt;A&gt;<\/b>/, 'el 91.2% era de NAVI, se dice');
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
  assert.match(html, /<span class="veredicto ok">✓ ACERTÓ<\/span>/);
  assert.match(html, /<b>Team Falcons<\/b>/);
  assert.ok(!html.includes('marcador'), 'sin marcador_a/b no se inventa uno');
});

test('filaSerie: sin probabilidad no hay barra ni favorito, sólo un guion', () => {
  const html = filaSerie(
    { juego: 'cs2', equipo_a: 111, equipo_b: 222, inicio_programado: '2026-08-25T16:00:00+00:00', formato: 'bo3', prob_a: null },
    nombre,
  );
  assert.match(html, /<span class="prob mono">—<\/span>/);
  assert.ok(!html.includes('class="barra"'), 'sin número no se dibuja una barra');
  assert.ok(!html.includes('favorito'), 'sin número no hay favorito');
});

// --- tarjetas --------------------------------------------------------------------
const CS2 = { id: 'cs2', etiqueta: 'CS2', css: '--cs2', chip: 'j-cs2', logo: 'logos/logo-cs2.jpg' };

test('tarjetaJuego: botón de verdad (se filtra con el teclado) y KPIs en es-VE', () => {
  const s = estadisticasPorJuego(FILAS).get('cs2');
  const html = tarjetaJuego(CS2, s, 5);
  assert.match(html, /^<button class="juego" type="button" aria-pressed="false" data-filtro="CS2"/);
  assert.match(html, /mejora vs moneda<\/dt><dd>±0\.0%<\/dd>/);
  assert.match(html, /juzgadas<\/dt><dd>3<\/dd>/);
  assert.match(html, /próximas \(24 h\)<\/dt><dd>5<\/dd>/);
  const vacia = tarjetaJuego(CS2, null, 0);
  assert.match(vacia, /mejora vs moneda<\/dt><dd>—<\/dd>/);
  assert.match(vacia, /juzgadas<\/dt><dd>0<\/dd>/);
});

test('tarjetaCalidad: mejor que la moneda va en verde, PEOR va en ámbar (no en rojo)', () => {
  const buena = tarjetaCalidad(CS2, { juzgadas: 242, brier: 0.2344, mejora: 0.2344 / 0.25 - 1, concluyente: true });
  assert.match(buena, /class="mejora bien">−6\.2%</);
  assert.match(buena, /class="nc si">CONCLUYENTE/);
  assert.match(buena, /n = 242/);

  const mala = tarjetaCalidad(CS2, { juzgadas: 47, brier: 0.2795, mejora: 0.2795 / 0.25 - 1, concluyente: false });
  assert.match(mala, /class="mejora mal">\+11\.8%</);
  assert.ok(!mala.includes('--acento'), 'el rojo es la marca, no el error');
  assert.match(mala, /class="nc">NO CONCLUYENTE/);

  const sinDatos = tarjetaCalidad(CS2, { juzgadas: 0, brier: null, mejora: null, concluyente: false });
  assert.match(sinDatos, /<p class="big mono">—<\/p>/);
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
  // favorito era A (equipo_a aquí = id 222 = Gaimin), ganó B (Falcons)
  assert.match(fallo, /var\(--acento\)/);
  assert.match(fallo, /íbamos con <b>Gaimin Gladiators<\/b> 61% — ganó Team Falcons/);
  assert.match(fallo, /CS2 · bo3/);
});

test('lineaJuicio: el porcentaje es el del equipo nombrado, aunque el favorito sea B', () => {
  // prob_a = 0.13 → el favorito es B (Gaimin) con 87%. La versión vieja
  // escribía "íbamos con Gaimin 13%", que no es ni el favorito ni su número.
  const html = lineaJuicio(
    { juego: 'cs2', formato: 'bo3', prob_a: 0.13, equipo_a: 111, equipo_b: 222, resultado_real: 'ganaA' },
    nombre,
  );
  assert.match(html, /íbamos con <b>Gaimin Gladiators<\/b> 87% — ganó Team Falcons/);
});

test('lineaJuicio: 50/50 exacto no se cobra como acierto ni como fallo', () => {
  const html = lineaJuicio(
    { juego: 'lol', formato: 'bo5', prob_a: 0.5, equipo_a: 111, equipo_b: 222, resultado_real: 'ganaB' },
    nombre,
  );
  assert.match(html, /50\/50 — ganó <b>Gaimin Gladiators<\/b>/);
  assert.ok(!html.includes('✓') && !html.includes('✗'));
});

// --- cinta y pestañas --------------------------------------------------------------
test('cintaVeredictos: una marca por juzgada, con el detalle en el title, y la cuenta real', () => {
  const juzgadas = [
    { juego: 'cs2', prob_a: 0.7, equipo_a: 111, equipo_b: 222, resultado_real: 'ganaA' }, // acierto
    { juego: 'cs2', prob_a: 0.3, equipo_a: 111, equipo_b: 222, resultado_real: 'ganaA' }, // fallo (fav era B)
    { juego: 'lol', prob_a: 0.5, equipo_a: 111, equipo_b: 222, resultado_real: 'ganaA' }, // 50/50: no entra
  ];
  const html = cintaVeredictos(juzgadas, nombre);
  assert.equal((html.match(/<i class="/g) ?? []).length, 2);
  assert.match(html, /ÚLTIMAS 2 JUZGADAS/);
  assert.match(html, /<b>1\/2<\/b>al favorito/);
  assert.match(html, /title="Team Falcons 70\.0% vs Gaimin Gladiators — acertó"/);
  assert.match(html, /title="Gaimin Gladiators 70\.0% vs Team Falcons — falló"/);
  assert.match(html, /aria-label="2 predicciones juzgadas: 1 aciertos y 1 fallos/);
});

test('cintaVeredictos: sin juzgadas lo dice, no dibuja una cinta vacía con número', () => {
  const html = cintaVeredictos([], nombre);
  assert.match(html, /TODAVÍA SIN JUZGAR/);
  assert.match(html, /<b>—<\/b>al favorito/);
});

test('pestanas: los contadores son las filas que de verdad se pintaron', () => {
  const html = pestanas({ abiertas: 3, juzgadas: 12 });
  assert.match(html, /data-grupo="abierta">EN VIVO Y PRÓXIMAS <em>3<\/em>/);
  assert.match(html, /data-grupo="juzgada">JUZGADAS <em>12<\/em>/);
  assert.match(html, /data-grupo="todas">TODAS <em>15<\/em>/);
  assert.equal((html.match(/aria-selected="true"/g) ?? []).length, 1);
});

// --- fuentes y botón ---------------------------------------------------------------
test('fuentesHtml: cada fuente prende según su bandera; OpenDota siempre fría', () => {
  const html = fuentesHtml({ supabaseOk: true, discordOk: false, telegramOk: true });
  const vivas = html.match(/fuente viva/g)?.length ?? 0;
  const frias = html.match(/fuente fria/g)?.length ?? 0;
  assert.equal(vivas, 3); // bo3.gg (implícita), Supabase, Telegram
  assert.equal(frias, 2); // Discord sin webhook + OpenDota
  assert.match(html, /<b>Discord<\/b><span>sin webhook configurado<\/span>/);
  assert.match(html, /<b>OpenDota<\/b><span>solo histórico<\/span>/);
});

test('botonVivo: late si hubo actividad reciente; quieto, apagado y honesto si no', () => {
  assert.match(botonVivo(true), /<p class="vivo" role="status"><i class="late" aria-hidden="true"><\/i>EN VIVO<\/p>/);
  assert.match(botonVivo(false), /<p class="vivo pausa" role="status"><i aria-hidden="true"><\/i>CICLO EN PAUSA<\/p>/);
});
