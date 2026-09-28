import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CATALOGO_DEMO, ESCENARIOS, conAcceso, crearFuenteDemo, partidosDemo, perfilDemo } from '../miniapp/src/datos/demo.mjs';
import { validarPartido, validarPerfil } from '../miniapp/src/datos/tipos.mjs';
import { NAVEGACION, PANTALLAS, esRaiz, hrefPartido, leerRuta } from '../miniapp/src/rutas.mjs';
import { crearTelegram } from '../miniapp/src/telegram.mjs';
import { avatarEquipo, estadoCargando, estadoError, tarjetaPartido, tarjetaResultado } from '../miniapp/src/vistas/componentes.mjs';
import { barraNavegacion } from '../miniapp/src/vistas/marco.mjs';
import { PANTALLA, cargarPantalla, filaForma } from '../miniapp/src/vistas/pantallas.mjs';
import { API_PRODUCCION, MINIAPP, construir, revisar } from '../miniapp/scripts/construir.mjs';
import { REQUERIDOS } from '../miniapp/scripts/desempacar-assets.mjs';

const ahora = Date.parse('2026-09-28T16:00:00Z');
const fuente = (escenario = 'free') => crearFuenteDemo({ escenario, retraso: 0, ahora: () => ahora });
const ctx = (escenario, ruta) => ({ ahora, catalogo: CATALOGO_DEMO, demo: true, escenario, ruta });

async function pintar(hash, escenario = 'free') {
  const ruta = leerRuta(hash);
  const datos = await cargarPantalla(fuente(escenario), ruta);
  return { ruta, html: PANTALLA[ruta.pantalla](datos, ctx(escenario, ruta)) };
}

// Un porcentaje pintado: "64%". Sirve para comprobar que lo bloqueado no filtra cifras.
const PORCENTAJE = /\d+%/;

// ── Navegación ───────────────────────────────────────────────────────────

test('las seis pantallas de la V1 son alcanzables por ruta', async () => {
  const hashes = { inicio: '#/inicio', partidos: '#/partidos', detalle: '#/partido/1102', historial: '#/historial', pro: '#/pro', mas: '#/mas' };
  assert.deepEqual(Object.keys(hashes).sort(), [...PANTALLAS].sort());
  for (const [pantalla, hash] of Object.entries(hashes)) {
    const { ruta, html } = await pintar(hash);
    assert.equal(ruta.pantalla, pantalla, hash);
    assert.ok(html.length > 200, `${pantalla} vacía`);
  }
});

test('la barra inferior tiene Inicio / Partidos / Historial / PRO / Más y cada pestaña abre su pantalla', () => {
  assert.deepEqual(NAVEGACION.map((n) => n.etiqueta), ['Inicio', 'Partidos', 'Historial', 'PRO', 'Más']);
  for (const n of NAVEGACION) {
    assert.equal(leerRuta(n.href).pantalla, n.pantalla);
    const html = barraNavegacion(n.pantalla);
    assert.equal(html.match(/aria-current="page"/g).length, 1, 'una sola pestaña activa');
    assert.match(html, new RegExp(`href="${n.href}" data-pestana="${n.pantalla}" aria-current="page"`));
  }
});

test('el detalle marca la pestaña Partidos y muestra el botón Atrás; las raíces no', () => {
  const detalle = leerRuta('#/partido/1102');
  assert.deepEqual(detalle, { pantalla: 'detalle', pestana: 'partidos', id: 1102 });
  assert.equal(esRaiz(detalle), false);
  for (const n of NAVEGACION) assert.equal(esRaiz(leerRuta(n.href)), true);
});

test('rutas raras caen en una pantalla válida, nunca en un error', () => {
  assert.equal(leerRuta('').pantalla, 'inicio');
  assert.equal(leerRuta('#/no-existe').pantalla, 'inicio');
  assert.equal(leerRuta('#/partido/abc').pantalla, 'partidos');
  assert.equal(leerRuta('#/partido/-4').pantalla, 'partidos');
  assert.equal(leerRuta('#/partido/12e3').pantalla, 'partidos');
  // Un filtro inventado se ignora en vez de llegar al HTML.
  assert.equal(leerRuta('#/partidos?juego=<script>').juego, null);
  assert.equal(leerRuta('#/partidos?juego=lol&periodo=manana').juego, 'lol');
  assert.equal(leerRuta('#/partidos?periodo=ayer').periodo, 'proximos');
});

test('cada tarjeta de partido enlaza a su propio detalle', async () => {
  const { html } = await pintar('#/partidos');
  const ids = [...html.matchAll(/href="#\/partido\/(\d+)"/g)].map((m) => Number(m[1]));
  assert.ok(ids.length >= 5);
  for (const id of ids) assert.deepEqual(leerRuta(hrefPartido(id)), { pantalla: 'detalle', pestana: 'partidos', id });
});

// ── Datos de demo y contrato ─────────────────────────────────────────────

test('los datos de demo cumplen el contrato en todos los estados', async () => {
  for (const escenario of ['free', 'pro', 'individual', 'vacio']) {
    const perfil = perfilDemo(escenario, ahora);
    assert.deepEqual(validarPerfil(perfil), [], escenario);
    for (const p of partidosDemo(ahora)) assert.deepEqual(validarPartido(conAcceso(p, perfil)), [], `${escenario} ${p.match_id}`);
  }
});

test('el contrato rechaza un partido bloqueado que trae la probabilidad', () => {
  const [p] = partidosDemo(ahora);
  assert.deepEqual(validarPartido({ ...p, acceso: 'pro' }), []);
  assert.match(validarPartido({ ...p, acceso: 'bloqueado' }).join(), /bloqueado pero trae prob_a/);
  assert.match(validarPartido({ ...p, acceso: 'pro', prob_a: 1.4 }).join(), /fuera de \[0, 1\]/);
  assert.match(validarPartido({ ...p, acceso: 'auditoria' }).join(), /auditoría de un partido abierto/);
  const forma = { victorias: 1, total: 8, ultimas: ['G', 'G', 'P', 'P', 'P'] };
  assert.match(validarPartido({ ...p, acceso: 'pro', analisis: { ...p.analisis, formaA: forma } }).join(), /no cuadra/);
});

test('el contrato rechaza análisis en la predicción FREE y en la auditoría de un cerrado', () => {
  const todos = partidosDemo(ahora);
  const abierto = todos.find((p) => p.estado !== 'finalizado');
  const cerrado = todos.find((p) => p.estado === 'finalizado');
  assert.ok(abierto.analisis && cerrado.analisis, 'la fila base trae análisis');
  assert.match(validarPartido({ ...abierto, acceso: 'gratis' }).join(), /acceso gratis no incluye análisis/);
  assert.match(validarPartido({ ...cerrado, acceso: 'auditoria' }).join(), /acceso auditoria no incluye análisis/);
  assert.deepEqual(validarPartido({ ...abierto, acceso: 'gratis', analisis: null }), []);
  assert.deepEqual(validarPartido({ ...cerrado, acceso: 'auditoria', analisis: null }), []);
  // Con análisis siguen válidos los accesos que sí lo incluyen.
  assert.deepEqual(validarPartido({ ...abierto, acceso: 'pro' }), []);
  assert.deepEqual(validarPartido({ ...abierto, acceso: 'individual' }), []);
});

test('la fuente de demo nunca entrega análisis con acceso gratis o auditoria', async () => {
  for (const escenario of ['free', 'pro', 'individual']) {
    const f = fuente(escenario);
    const lista = [...(await f.partidos()).partidos, ...(await f.historial()).partidos];
    for (const p of lista.filter((x) => x.acceso === 'gratis' || x.acceso === 'auditoria')) {
      assert.equal(p.analisis, null, `${escenario} ${p.match_id} ${p.acceso}`);
      assert.deepEqual(validarPartido(p), []);
    }
  }
});

// ── FREE / PRO / análisis individual ─────────────────────────────────────

test('FREE: sólo la predicción del día trae probabilidad; el resto llega en null', async () => {
  const { partidos } = await fuente('free').partidos();
  const conNumero = partidos.filter((p) => p.prob_a != null);
  assert.deepEqual(conNumero.map((p) => p.match_id), [1102]);
  assert.equal(conNumero[0].acceso, 'gratis');
  assert.equal(conNumero[0].analisis, null, 'la FREE no incluye el análisis completo');
  for (const p of partidos.filter((x) => x.acceso === 'bloqueado')) {
    assert.equal(p.prob_a, null);
    assert.equal(p.analisis, null);
  }
});

test('FREE: un partido bloqueado no pinta ninguna cifra y las compras salen deshabilitadas', async () => {
  const { html } = await pintar('#/partido/1105');
  assert.match(html, /Probabilidad y análisis completo/);
  const bloqueo = html.slice(html.indexOf('class="bloqueo"'));
  assert.doesNotMatch(bloqueo.replace(/<span class="mono">\d+<\/span> Stars/g, ''), PORCENTAJE);
  assert.equal(html.match(/data-accion="comprar"[^>]*disabled/g).length, 2);
  assert.match(html, /250<\/span> Stars \/ 30 días/);
  assert.match(html, /50<\/span> Stars/);
});

test('FREE: la predicción del día muestra la barra y ofrece PRO para el análisis', async () => {
  const { html } = await pintar('#/partido/1102');
  assert.match(html, /Tu predicción FREE/);
  assert.match(html, />64%</);
  assert.match(html, />36%</);
  assert.doesNotMatch(html, /seccion__titulo">Forma reciente/);
  assert.match(html, /Más contexto para entender cada partido\./);
  assert.match(html, /Cifra de demostración: no sale del modelo/, 'la demo no se hace pasar por el motor');
  const real = PANTALLA.detalle({ partido: (await fuente('free').partido(1102)).partido }, { ...ctx('free'), demo: false });
  assert.match(real, /Estimación del modelo de rating con partidas reales/);
});

test('PRO: todos los partidos abiertos traen probabilidad y análisis', async () => {
  const { partidos } = await fuente('pro').partidos();
  assert.ok(partidos.length > 0);
  for (const p of partidos) {
    assert.equal(p.acceso, 'pro');
    assert.ok(p.prob_a != null && p.analisis);
  }
  const { html } = await pintar('#/partido/1106', 'pro');
  assert.match(html, /seccion__titulo">Forma reciente/);
  assert.match(html, /H2H/);
  assert.doesNotMatch(html, /class="bloqueo"/);
});

test('análisis individual: sólo el partido comprado abre el informe completo', async () => {
  const f = fuente('individual');
  assert.equal((await f.partido(1107)).partido.acceso, 'individual');
  assert.equal((await f.partido(1106)).partido.acceso, 'bloqueado');
  const { html } = await pintar('#/partido/1107', 'individual');
  assert.match(html, /Análisis comprado/);
  assert.match(html, /seccion__titulo">Forma reciente/);
});

test('inicio cambia según el plan: FREE ve su predicción del día, PRO ve su vencimiento', async () => {
  const free = (await pintar('#/inicio', 'free')).html;
  assert.match(free, /Tu predicción FREE de hoy/);
  assert.match(free, /1 predicción diaria/);
  assert.match(free, /Predicciones y estadísticas para entender cada partido\./);
  assert.match(free, /1 predicción gratis al día · historial visible · análisis PRO completo/);
  assert.match(free, /Datos reales/);
  assert.match(free, /Fallos visibles/);
  assert.match(free, /Ver predicción FREE|Ver partidos/);
  assert.match(free, /Ver PRO/);
  const pro = (await pintar('#/inicio', 'pro')).html;
  assert.doesNotMatch(pro, /Tu predicción FREE de hoy/);
  assert.match(pro, /Activo hasta/);
});

test('la pantalla PRO usa los precios aprobados y no activa compras', async () => {
  const { html } = await pintar('#/pro');
  assert.match(html, /250<\/span> Stars \/ 30 días/);
  assert.match(html, /50<\/span> Stars/);
  assert.match(html, /1 predicción diaria/);
  assert.match(html, /Compra solo el partido que te interesa\./);
  assert.match(html, /Probabilidades completas de cada partido/);
  assert.match(html, /Las compras desde la Mini App todavía no están activas\./);
  assert.match(html, /data-producto="pro" disabled/);
});

// ── Forma reciente ───────────────────────────────────────────────────────

const marcas = (html) => [...html.matchAll(/forma__marca--([vd])/g)].map((m) => m[1]).join('');

test('forma: el resumen sale de las últimas 5, no de victorias/total', () => {
  const html = filaForma({ nombre: 'Obsidian Five' }, { victorias: 8, total: 8, ultimas: ['G', 'G', 'G', 'G', 'G'] });
  assert.match(html, /forma__v">5V</);
  assert.match(html, /forma__d">0D</);
  assert.equal(marcas(html), 'vvvvv');
  // Lo que el total agrega va aparte, como conteo de esa ventana.
  assert.match(html, /Últimas <span class="mono">8<\/span>: <span class="mono">8V · 0D<\/span>/);
  assert.doesNotMatch(html, /8\/8|6\/6/, 'sin la fracción suelta');
});

test('forma: las marcas van de la más antigua a la más reciente', () => {
  // `ultimas` viene de la más reciente a la más vieja.
  const html = filaForma({ nombre: 'Moonfall' }, { victorias: 3, total: 8, ultimas: ['G', 'P', 'G', 'P', 'P'] });
  assert.match(html, /forma__v">2V</);
  assert.match(html, /forma__d">3D</);
  assert.equal(marcas(html), 'ddvdv');
  assert.match(html, /aria-label="Últimas 5 series, de la más antigua a la más reciente: derrota, derrota, victoria, derrota, victoria"/);
});

test('forma: sin información extra no se agrega texto secundario', () => {
  const html = filaForma({ nombre: 'Arc Lions' }, { victorias: 4, total: 5, ultimas: ['G', 'G', 'P', 'G', 'G'] });
  assert.doesNotMatch(html, /forma__extra/);
});

test('forma: sin series muestra "Sin datos" y ninguna marca', () => {
  const html = filaForma({ nombre: 'Northwind' }, { victorias: 0, total: 0, ultimas: [] });
  assert.match(html, /Sin datos/);
  assert.doesNotMatch(html, /forma__serie|forma__extra/);
});

test('forma: escapa el nombre del equipo', () => {
  assert.match(filaForma({ nombre: '<b>X</b>' }, { victorias: 0, total: 0, ultimas: [] }), /&lt;b&gt;X&lt;\/b&gt;/);
});

test('detalle: Forma reciente con subtítulo, sin rachas ni la leyenda G/P', async () => {
  const { html } = await pintar('#/partido/1106', 'pro');
  assert.match(html, /seccion__titulo">Forma reciente<\/h2><p class="seccion__bajada">Últimas 5 series<\/p>/);
  assert.equal((html.match(/class="forma__fila"/g) ?? []).length, 2);
  assert.doesNotMatch(html, /racha/i);
  assert.doesNotMatch(html, /G ganó|P perdió|class="punto/);
  assert.match(html, /seccion__titulo">Enfrentamientos previos · H2H/);
});

test('seccion sin bajada deja el marcado de siempre', async () => {
  const { html } = await pintar('#/inicio');
  assert.doesNotMatch(html, /seccion__bajada/);
  assert.match(html, /<header class="seccion__cabeza"><h2 class="seccion__titulo">Próximos partidos<\/h2>/);
});

// ── Tarjetas ─────────────────────────────────────────────────────────────

test('tarjeta de partido: escapa nombres de terceros y usa el emblema del juego', () => {
  const [base] = partidosDemo(ahora);
  const p = conAcceso({ ...base, equipo_a: { id: 1, nombre: '<img src=x onerror=alert(1)>' } }, perfilDemo('pro', ahora));
  const html = tarjetaPartido(p, { ahora });
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /assets\/games\/cs2\.svg/);
  assert.match(html, /EN VIVO/, 'la primera fila de la demo ya empezó');
});

test('logos de equipo: pinta HTTPS real y cae a monograma si no es segura', () => {
  const real = avatarEquipo({ id: 7, nombre: 'Team Aurora', logo: 'https://cdn.example.com/team.webp' });
  assert.match(real, /equipo__logo/);
  assert.match(real, /https:\/\/cdn\.example\.com\/team\.webp/);
  assert.match(real, /TA/);

  const inseguro = avatarEquipo({ id: 8, nombre: 'Bad URL', logo: 'javascript:alert(1)' });
  assert.doesNotMatch(inseguro, /<img class="equipo__logo"/);
  assert.match(inseguro, /BU/);
});

test('contrato de partido acepta logo HTTPS y rechaza logo no seguro', () => {
  const [base] = partidosDemo(ahora);
  const valido = conAcceso({
    ...base,
    equipo_a: { ...base.equipo_a, logo: 'https://cdn.example.com/a.webp' },
  }, perfilDemo('pro', ahora));
  assert.deepEqual(validarPartido(valido), []);

  const roto = {
    ...valido,
    equipo_b: { ...valido.equipo_b, logo: 'http://inseguro.test/b.webp' },
  };
  assert.ok(validarPartido(roto).some((e) => e.includes('equipo_b.logo inválido')));
});

test('tarjeta bloqueada muestra el candado PRO en vez de una cifra', () => {
  const p = conAcceso(partidosDemo(ahora).find((x) => x.match_id === 1105), perfilDemo('free', ahora));
  const html = tarjetaPartido(p, { ahora });
  assert.match(html, /insignia--bloqueado/);
  assert.doesNotMatch(html, PORCENTAJE);
});

test('historial: aciertos y fallos con el mismo componente y el conteo completo', async () => {
  const { partidos } = await fuente('free').historial();
  const ok = partidos.filter((p) => (p.prob_a >= 0.5) === (p.resultado_real === 'ganaA'));
  assert.ok(ok.length > 0 && ok.length < partidos.length, 'la demo mezcla aciertos y fallos');
  const acierto = tarjetaResultado(ok[0], { ahora });
  const fallo = tarjetaResultado(partidos.find((p) => !ok.includes(p)), { ahora });
  assert.match(acierto, /insignia--acierto/);
  assert.match(fallo, /insignia--fallo/);
  // Misma estructura: sólo cambia la insignia.
  const esqueleto = (h) => h.replace(/>[^<]*</g, '><').replace(/"[^"]*"/g, '""').replace(/<span class=""><\/span>/g, '');
  assert.equal(esqueleto(acierto).replace('equipo equipo--ganador', ''), esqueleto(fallo).replace('equipo equipo--ganador', ''));
  const { html } = await pintar('#/historial');
  assert.match(html, new RegExp(`<dt>Aciertos</dt><dd class="mono">${ok.length}</dd>`));
  assert.match(html, new RegExp(`<dt>Fallos</dt><dd class="mono">${partidos.length - ok.length}</dd>`));
  assert.doesNotMatch(html, /racha/i);
});

// ── Estados vacío / error ────────────────────────────────────────────────

test('estado de carga usa skeletons para evitar una pantalla vacía', () => {
  const html = estadoCargando();
  assert.match(html, /Cargando partidos/);
  assert.equal((html.match(/class="skeleton-card"/g) ?? []).length, 2);
});

test('estados vacío y error usan su arte y no filtran mensajes internos', async () => {
  const vacio = (await pintar('#/partidos', 'vacio')).html;
  assert.match(vacio, /assets\/states\/empty-matches\.webp/);
  const historialVacio = (await pintar('#/historial', 'vacio')).html;
  assert.match(historialVacio, /assets\/states\/empty-history\.webp/);
  await assert.rejects(fuente('error').inicio(), (e) => e.mensajeUsuario === 'No se pudo conectar con Monitor eSports.');
  const error = estadoError(undefined);
  assert.match(error, /assets\/states\/error-state\.webp/);
  assert.match(error, /data-accion="reintentar"/);
  assert.match(estadoError('<b>x</b>'), /&lt;b&gt;x&lt;\/b&gt;/);
});

test('modo demo: Más ofrece los cinco estados y la cabecera avisa que es demo', async () => {
  const { html } = await pintar('#/mas');
  for (const clave of Object.keys(ESCENARIOS)) assert.match(html, new RegExp(`data-valor="${clave}"`));
  assert.match(html, /https:\/\/t\.me\/mitzukyhs/);
  assert.match(html, /Ningún modelo de lenguaje estima probabilidades\./);
  assert.match(html, /No son apuestas seguras ni ganancias garantizadas\./);
});

// ── Adaptador de Telegram ────────────────────────────────────────────────

function ventanaFalsa(webApp) {
  const estilos = new Map();
  const abiertos = [];
  const documentElement = { dataset: {}, style: { setProperty: (k, v) => estilos.set(k, v) } };
  return { estilos, abiertos, win: { document: { documentElement }, open: (...a) => abiertos.push(a), Telegram: webApp ? { WebApp: webApp } : undefined } };
}

test('fuera de Telegram el adaptador no rompe nada', () => {
  const { win, estilos, abiertos } = ventanaFalsa(null);
  const tg = crearTelegram(win);
  assert.equal(tg.dentro, false);
  tg.iniciar();
  tg.atras(true, () => {});
  tg.vibrar();
  assert.equal(win.document.documentElement.dataset.tg, 'no');
  assert.equal(estilos.get('--safe-top'), '0px');
  assert.equal(tg.abrirTelegram('https://t.me/mitzukyhs'), true);
  assert.equal(abiertos.length, 1);
  assert.equal(tg.abrirTelegram('javascript:alert(1)'), false, 'sólo enlaces t.me');
  assert.equal(tg.abrirTelegram('https://evil.example/t.me/x'), false);
});

test('dentro de Telegram: ready, expand, colores, insets y botón Atrás', () => {
  const llamadas = [];
  const anotar = (n) => (...a) => llamadas.push([n, ...a]);
  const app = {
    platform: 'android', colorScheme: 'dark',
    isVersionAtLeast: (v) => parseFloat(v) <= 8.0,
    safeAreaInset: { top: 24, bottom: 16, left: 0, right: 0 },
    contentSafeAreaInset: { top: 46, bottom: 0, left: 0, right: 0 },
    ready: anotar('ready'), expand: anotar('expand'), onEvent: anotar('onEvent'),
    setHeaderColor: anotar('header'), setBackgroundColor: anotar('fondo'), setBottomBarColor: anotar('barra'),
    openTelegramLink: anotar('link'), HapticFeedback: { selectionChanged: anotar('haptic') },
    BackButton: { show: anotar('show'), hide: anotar('hide'), onClick: anotar('onClick'), offClick: anotar('offClick') },
  };
  const { win, estilos } = ventanaFalsa(app);
  const tg = crearTelegram(win);
  tg.iniciar();
  const nombres = llamadas.map((l) => l[0]);
  for (const n of ['ready', 'expand', 'header', 'fondo', 'barra']) assert.ok(nombres.includes(n), n);
  assert.deepEqual(llamadas.filter((l) => l[0] === 'onEvent').map((l) => l[1]).sort(),
    ['contentSafeAreaChanged', 'safeAreaChanged', 'themeChanged']);
  assert.equal(estilos.get('--safe-top'), '24px');
  assert.equal(estilos.get('--content-safe-top'), '46px');
  assert.equal(estilos.get('--safe-bottom'), '16px');

  llamadas.length = 0;
  const volver = () => {};
  tg.atras(true, volver);
  tg.atras(false);
  assert.deepEqual(llamadas.map((l) => l[0]), ['onClick', 'show', 'offClick', 'hide']);
  tg.abrirTelegram('https://t.me/monitor_esports_avisos_bot');
  assert.deepEqual(llamadas.at(-1), ['link', 'https://t.me/monitor_esports_avisos_bot']);
});

test('insets inválidos de Telegram no llegan al CSS', () => {
  const app = { platform: 'ios', isVersionAtLeast: () => false, safeAreaInset: { top: -5, bottom: 'x' }, ready() {}, expand() {} };
  const { win, estilos } = ventanaFalsa(app);
  crearTelegram(win).iniciar();
  assert.equal(estilos.get('--safe-top'), '0px');
  assert.equal(estilos.get('--safe-bottom'), '0px');
});

// ── Assets y build ───────────────────────────────────────────────────────

test('los 16 assets del paquete están en miniapp/public/assets', () => {
  assert.equal(REQUERIDOS.length, 16);
  for (const r of REQUERIDOS) assert.ok(existsSync(join(MINIAPP, 'public', 'assets', r)), r);
});

test('build: sin imports rotos, sin assets inexistentes y sin facturas', () => {
  assert.deepEqual(revisar(), []);
  const destino = mkdtempSync(join(tmpdir(), 'miniapp-'));
  try {
    construir({ destino });
    for (const f of ['index.html', 'src/main.mjs', 'src/estilos.css', 'assets/brand/logo-full.webp', 'assets/heroes/hero-home.webp']) {
      assert.ok(existsSync(join(destino, f)), f);
    }
  } finally {
    rmSync(destino, { recursive: true, force: true });
  }
});

test('build: local conserva demo y producción inyecta únicamente la API real', () => {
  const local = mkdtempSync(join(tmpdir(), 'miniapp-local-'));
  const prod = mkdtempSync(join(tmpdir(), 'miniapp-prod-'));
  try {
    const a = construir({ destino: local, apiUrl: '' });
    const b = construir({ destino: prod, apiUrl: API_PRODUCCION });
    const htmlLocal = readFileSync(join(local, 'index.html'), 'utf8');
    const htmlProd = readFileSync(join(prod, 'index.html'), 'utf8');

    assert.equal(a.apiReal, false);
    assert.match(htmlLocal, /<meta name="monitor-api-url" content="">/);

    assert.equal(b.apiReal, true);
    assert.ok(htmlProd.includes(API_PRODUCCION));
    assert.doesNotMatch(htmlProd, /<meta name="monitor-api-url" content="">/);
  } finally {
    rmSync(local, { recursive: true, force: true });
    rmSync(prod, { recursive: true, force: true });
  }
});
