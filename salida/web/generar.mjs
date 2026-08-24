// Genera la SALA DE CONTROL a partir de disenos/A-sala-de-control.html.
//
//   node --env-file=.env salida/web/generar.mjs
//
// Escribe UN SOLO archivo: salida/web/index.html. Las fichas serie-*.html del
// panel viejo ya no se generan (y se borran si quedaran de una corrida
// anterior): el diseño nuevo no tiene vista de ficha.
//
// Cómo funciona: el diseño lleva zonas marcadas con <!--ZONA:NOMBRE--> ...
// <!--/ZONA:NOMBRE--> que en la maqueta contienen datos de ejemplo. Acá se
// reemplaza el contenido de cada zona por datos REALES de eslo_predicciones.
// El resto del archivo no se toca -- misma disciplina que con disenio.dc.html:
// el diseño manda, el generador sólo inyecta.
//
// Sin credenciales la página TAMBIÉN se genera, con las zonas vacías y las
// fuentes apagadas: es lo que permite correr este paso en CI sin secretos
// sin tumbar el pipeline.

import { readFile, writeFile, readdir, unlink, mkdir, copyFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { seleccionar } from '../../datos/supabase.mjs';
import { datosDeEquipos, slugsDePartidas, streamsDePartida } from '../../datos/juegos/bo3.mjs';
import {
  JUEGOS,
  estadisticasPorJuego,
  faseDe,
  favoritoDe,
  filaSerie,
  tarjetaJuego,
  tarjetaCalidad,
  lineaJuicio,
  cintaVeredictos,
  pestanas,
  ordenarParaLaTabla,
  fuentesHtml,
  botonVivo,
} from './sala.mjs';
import { generarPerfiles } from './perfiles.mjs';

const AQUI = new URL('./', import.meta.url);
const RAIZ = new URL('../../', import.meta.url);
const DISENIO = new URL('disenos/A-sala-de-control.html', RAIZ);
const DISENIO_PERFIL = new URL('disenos/B-perfil-de-serie.html', RAIZ);

// Ventana rodante de la tabla, igual que los avisos: lo que salió hace más
// de 24 h o falta más de 24 h no entra. Tope duro de filas para que una
// jornada loca no haga una página de 3 MB.
const VENTANA_HORAS = 24;
// 40 se quedaba CORTO: una ventana de 24 h con CS2 corriendo trae ~80 series
// y el tope las cortaba por la mitad (siempre a costa de las juzgadas, que
// son las de horas más viejas). 90 cubre el peor día sin pesar nada.
const MAX_FILAS = 90;
const CUANTOS_JUICIOS = 5;
const CUANTAS_EN_CINTA = 25;
// Cuánto antes del inicio se busca la transmisión de una serie.
const HORAS_DE_STREAM = 3;
// La última tanda de capturas de cuotas cubre todos los partidos vivos
// (comparten capturado_en): con 200 filas y "primera aparición gana" se
// obtiene la captura más reciente de cada partido, con su max_coeff histórico.
const TOPE_CUOTAS = 200;

// El cierre se vuelve a escribir COMPLETO (<!--/ZONA:X-->). Antes salía
// <!--/X--> y el HTML generado ya no se podía volver a pasar por acá: las
// zonas quedaban abiertas. Ahora la salida es re-generable.
function zona(html, nombre, contenido) {
  const patron = new RegExp(`<!--ZONA:${nombre}-->[\\s\\S]*?<!--/ZONA:${nombre}-->`);
  if (!patron.test(html)) throw new Error(`generar: el diseño no trae la zona ${nombre}`);
  return html.replace(patron, `<!--ZONA:${nombre}-->${contenido}<!--/ZONA:${nombre}-->`);
}

async function copiarLogosDelRail() {
  const destino = new URL('logos/', AQUI);
  await mkdir(destino, { recursive: true });
  let n = 0;
  for (const cfg of JUEGOS) {
    try {
      await copyFile(new URL(`disenos/${cfg.logo}`, RAIZ), new URL(cfg.logo, AQUI));
      n += 1;
    } catch { /* sin logo, la tarjeta queda sin imagen pero no revienta */ }
  }
  return n;
}

// Los iconos del sitio (favicon etc.) viven en assets/ de la raíz; el
// artefacto de Pages es SÓLO salida/web, así que se copian al generar.
// og-image.png y site.webmanifest se copiaban... no, no se copiaban: la
// página los pedía y el artefacto de Pages no los llevaba. icon-maskable
// entra porque el manifest lo nombra y sin él Android recorta el rayo.
const ICONOS = [
  'favicon.svg', 'favicon.ico', 'favicon-32.png', 'apple-touch-icon.png',
  'icon-192.png', 'icon-512.png', 'icon-maskable-512.png',
  'og-image.png', 'site.webmanifest',
];

async function copiarIconos() {
  const destino = new URL('assets/', AQUI);
  await mkdir(destino, { recursive: true });
  let n = 0;
  for (const icono of ICONOS) {
    try {
      await copyFile(new URL(`assets/${icono}`, RAIZ), new URL(icono, destino));
      n += 1;
    } catch { /* si no está, el sitio funciona igual */ }
  }
  return n;
}

// Los serie-*.html que sobren de una corrida anterior (partidos que ya no
// están en la base) se borran; los que toca generar se reescriben. Antes esta
// función los borraba TODOS porque el diseño no tenía vista de ficha -- ahora
// la ficha es la mitad del producto.
async function limpiarFichasQueSobran(vigentes) {
  const archivos = await readdir(AQUI);
  const sobran = archivos.filter((a) => /^serie-\d+\.html$/.test(a) && !vigentes.has(a));
  await Promise.all(sobran.map((a) => unlink(new URL(a, AQUI))));
  return sobran.length;
}

async function main() {
  let plantilla = await readFile(DISENIO, 'utf8');

  // --- datos ---------------------------------------------------------------
  let todas = [];
  let supabaseOk = false;
  try {
    todas = await seleccionar('eslo_predicciones', '?select=*&order=match_id.asc');
    supabaseOk = true;
  } catch (e) {
    console.log(`eslo_predicciones: sin datos (${String(e.message).slice(0, 80)}) — la página sale vacía, no rota.`);
  }

  const ahoraMs = Date.now();
  const desde = ahoraMs - VENTANA_HORAS * 3600 * 1000;
  const hasta = ahoraMs + VENTANA_HORAS * 3600 * 1000;

  // El orden no es por hora a secas: primero lo que está en curso, después
  // lo que viene por cercanía, y al final lo vencido sin calificar y lo ya
  // juzgado. Ver ordenarParaLaTabla() en sala.mjs -- antes el panel abría
  // mostrando las vencidas, que es lo más viejo y lo que menos sirve.
  const enVentana = ordenarParaLaTabla(
    todas.filter((f) => {
      const t = new Date(f.inicio_programado).getTime();
      return Number.isFinite(t) && t >= desde && t <= hasta;
    }),
    ahoraMs,
  ).slice(0, MAX_FILAS);

  // Juzgadas de la más nueva a la más vieja: las primeras 5 son los juicios
  // de la derecha; las primeras 25, al revés, son la cinta de arriba.
  const calificadas = todas
    .filter((f) => f.resultado_real)
    .sort((a, b) => new Date(b.calificada_en ?? 0) - new Date(a.calificada_en ?? 0));
  const juicios = calificadas.slice(0, CUANTOS_JUICIOS);
  const cinta = calificadas.slice(0, CUANTAS_EN_CINTA).reverse();

  // Nombres de equipo contra bo3.gg, agrupados por juego para pedir por
  // disciplina (sin el filtro devuelve vacío, ver bo3.mjs). Sólo los ids que
  // aparecen en pantalla.
  const nombres = new Map();
  const nombre = (id) => nombres.get(id)?.nombre ?? `#${id}`;
  const logoDe = (id) => nombres.get(id)?.logo ?? null;
  // TODOS los equipos de la base, no sólo los de la ventana: cada predicción
  // tiene su perfil y un perfil que dice "#16807 vs #22155" no sirve de nada.
  // Se piden por lotes de 100 por juego, así que son unas pocas peticiones.
  for (const cfg of JUEGOS) {
    const filasDeJuego = todas.filter((f) => f.juego === cfg.id);
    const ids = filasDeJuego.flatMap((f) => [f.equipo_a, f.equipo_b]).filter(Boolean);
    if (ids.length === 0) continue;
    try {
      const datos = await datosDeEquipos(ids, { juego: cfg.id });
      for (const [id, v] of datos) nombres.set(id, v);
    } catch (e) {
      console.log(`nombres ${cfg.id}: no resolvieron (${String(e.message).slice(0, 60)}) — salen los ids.`);
    }
  }

  // --- zonas ----------------------------------------------------------------
  const stats = estadisticasPorJuego(todas);

  // Cuotas de mercado: última captura por partido. Si la tabla falla, la
  // columna MERCADO sale «—» y el script de la página esconde la columna
  // entera — la página no se rompe por eso.
  const cuotas = new Map();
  try {
    const capturas = await seleccionar(
      'eslo_cuotas',
      `?select=match_id,max_coeff_a,max_coeff_b,coeff_a,coeff_b&order=capturado_en.desc&limit=${TOPE_CUOTAS}`,
    );
    for (const c of capturas) if (!cuotas.has(c.match_id)) cuotas.set(c.match_id, c);
  } catch (e) {
    console.log(`eslo_cuotas: sin datos (${String(e.message).slice(0, 60)}) — MERCADO sale «—».`);
  }

  // La serie COMPLETA de capturas, agrupada por partido: es lo que dibuja el
  // gráfico de "mercado contra motor" en cada perfil. Son decenas de miles de
  // filas (mediana de 41 capturas por partido, máximo 317) pero pesan poco --
  // cuatro columnas -- y se piden en una sola consulta paginada. El muestreo
  // para el gráfico se hace en memoria, no acá.
  const cuotasPorPartido = new Map();
  try {
    const serie = await seleccionar(
      'eslo_cuotas',
      '?select=match_id,capturado_en,prob_a,margen&order=match_id.asc,capturado_en.asc',
    );
    for (const c of serie) {
      let lista = cuotasPorPartido.get(c.match_id);
      if (!lista) { lista = []; cuotasPorPartido.set(c.match_id, lista); }
      lista.push(c);
    }
    console.log(`eslo_cuotas: ${serie.length} capturas en ${cuotasPorPartido.size} partidos`);
  } catch (e) {
    console.log(`eslo_cuotas (serie completa): ${String(e.message).slice(0, 60)} — los perfiles salen sin gráfico de mercado.`);
  }

  // Slug de bo3.gg para poder enlazar al directo. Se piden por lotes y sólo
  // los de los partidos que todavía pueden tener transmisión (la ventana):
  // pedir los 659 sería gastar peticiones en partidos de hace semanas.
  const slugs = new Map();
  for (const cfg of JUEGOS) {
    const ids = enVentana.filter((f) => f.juego === cfg.id).map((f) => f.match_id);
    if (ids.length === 0) continue;
    try {
      for (const [id, v] of await slugsDePartidas(ids, { juego: cfg.id })) slugs.set(id, v);
    } catch (e) {
      console.log(`slugs ${cfg.id}: no resolvieron (${String(e.message).slice(0, 50)}) — sin botón de directo.`);
    }
  }
  const slugDe = (id) => slugs.get(id)?.slug ?? null;

  // Los streams son UNA petición por partida (no hay filtro por lote), así
  // que sólo se piden los de las series que de verdad pueden estar al aire:
  // en curso, o que arrancan dentro de las próximas HORAS_DE_STREAM. Pedirlos
  // para las 90 de la ventana sería gastar 90 peticiones para que 84 salieran
  // vacías.
  const streams = new Map();
  const candidatas = enVentana.filter((f) => {
    if (f.resultado_real) return false;
    const fase = faseDe(f, ahoraMs);
    if (fase === 'curso') return true;
    const t = new Date(f.inicio_programado).getTime();
    return fase === 'proxima' && t - ahoraMs <= HORAS_DE_STREAM * 3600 * 1000;
  });
  for (const f of candidatas) {
    const slug = slugDe(f.match_id);
    if (!slug) continue;
    try {
      const lista = await streamsDePartida(slug);
      if (lista.length > 0) streams.set(f.match_id, lista);
    } catch (e) {
      console.log(`streams ${f.match_id}: ${String(e.message).slice(0, 50)} — ese perfil sale sin reproductor.`);
    }
  }
  const streamsDe = (id) => streams.get(id) ?? null;
  console.log(`streams: ${streams.size} series con transmisión de ${candidatas.length} candidatas`);
  // La cuota que se muestra es la del FAVORITO (el mismo equipo del
  // porcentaje de MOTOR): max_coeff (lo mejor que pagó) con respaldo en la
  // cuota puntual de la última captura.
  const cuotaDe = (f) => {
    const c = cuotas.get(f.match_id);
    if (!c) return null;
    const fav = favoritoDe(f);
    if (!fav.hay) return null;
    const bruta = fav.ladoA ? (c.max_coeff_a ?? c.coeff_a) : (c.max_coeff_b ?? c.coeff_b);
    const n = Number(bruta);
    return Number.isFinite(n) ? n : null;
  };

  const proximasPorJuego = new Map();
  for (const f of todas) {
    if (f.resultado_real) continue;
    const t = new Date(f.inicio_programado).getTime();
    if (t > ahoraMs && t <= hasta) proximasPorJuego.set(f.juego, (proximasPorJuego.get(f.juego) ?? 0) + 1);
  }

  const htmlFilas =
    enVentana.length > 0
      ? enVentana.map((f) => filaSerie(f, nombre, cuotaDe, logoDe)).join('\n')
      : '<tr class="vacia"><td colspan="6" class="mono" style="text-align:center; color:var(--apag); padding:22px">sin series en la ventana de 24 horas</td></tr>';

  plantilla = zona(plantilla, 'FILAS', htmlFilas);
  plantilla = zona(
    plantilla,
    'PESTANAS',
    pestanas({
      abiertas: enVentana.filter((f) => !f.resultado_real).length,
      juzgadas: enVentana.filter((f) => f.resultado_real).length,
    }),
  );
  plantilla = zona(plantilla, 'CINTA', cintaVeredictos(cinta, nombre));
  plantilla = zona(
    plantilla,
    'RAIL',
    JUEGOS.map((cfg) => tarjetaJuego(cfg, stats.get(cfg.id), proximasPorJuego.get(cfg.id) ?? 0)).join('\n    '),
  );
  plantilla = zona(
    plantilla,
    'CALIDAD',
    `<div class="calidad">\n        ${JUEGOS.map((cfg) => tarjetaCalidad(cfg, stats.get(cfg.id))).join('\n        ')}\n      </div>`,
  );
  plantilla = zona(
    plantilla,
    'JUICIOS',
    juicios.length > 0
      ? juicios.map((c) => lineaJuicio(c, nombre)).join('\n      ')
      : '<p class="juicio"><span class="marca" style="color:var(--aviso)">·</span><span>— todavía no hay series juzgadas —</span></p>',
  );

  const ultimaActividad = Math.max(
    0,
    ...todas.map((f) => Math.max(new Date(f.creada_en ?? 0).getTime(), new Date(f.calificada_en ?? 0).getTime())),
  );
  const vivo = supabaseOk && ultimaActividad > 0 && ahoraMs - ultimaActividad < 60 * 60 * 1000;

  plantilla = zona(
    plantilla,
    'FUENTES',
    fuentesHtml({
      supabaseOk,
      discordOk: Boolean(process.env.DISCORD_WEBHOOK),
      telegramOk: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    }),
  );
  plantilla = zona(plantilla, 'VIVO', botonVivo(vivo));

  // Ya no se parchea ni el banner ni el <title>: el diseño v2 es la página
  // publicada, con su bloque de SEO completo. Lo que se toca, se toca por
  // zona.
  await writeFile(new URL('index.html', AQUI), plantilla);

  // --- un perfil por serie ---------------------------------------------------
  const perfiles = await generarPerfiles({
    todas,
    stats,
    cuotasPorPartido,
    nombre,
    logoDe,
    slugDe,
    streamsDe,
    destino: AQUI,
    disenio: DISENIO_PERFIL,
    ahoraMs,
  });
  // Sólo se borra si de verdad hubo datos: en una corrida sin credenciales
  // `todas` viene vacía, y sin este guardia el paso de limpieza barrería los
  // 659 perfiles y dejaría la tabla llena de enlaces rotos.
  const sobraron = supabaseOk ? await limpiarFichasQueSobran(perfiles.archivos) : 0;
  const iconos = await copiarIconos();
  const logos = await copiarLogosDelRail();

  console.log(`index.html (sala de control) · ${enVentana.length} series en ventana · ${juicios.length} juicios · ${iconos} iconos · ${logos} logos`);
  console.log(`perfiles: ${perfiles.escritos} escritos · ${perfiles.conStream} con directo · ${perfiles.conMercado} con gráfico de mercado · ${perfiles.verificados} con el número recalculado · ${sobraron} borrados por viejos`);
  for (const cfg of JUEGOS) {
    const s = stats.get(cfg.id);
    console.log(
      `${cfg.etiqueta}: juzgadas ${s?.juzgadas ?? 0} · brier ${s?.brier != null ? s.brier.toFixed(4) : '—'} · próximas 24h ${proximasPorJuego.get(cfg.id) ?? 0}`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

export { zona, main as generarPanel };
