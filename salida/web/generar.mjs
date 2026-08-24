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
import { datosDeEquipos } from '../../datos/juegos/bo3.mjs';
import {
  JUEGOS,
  esc,
  estadisticasPorJuego,
  filaSerie,
  tarjetaJuego,
  tarjetaCalidad,
  lineaJuicio,
  fuentesHtml,
  botonVivo,
} from './sala.mjs';

const AQUI = new URL('./', import.meta.url);
const RAIZ = new URL('../../', import.meta.url);
const DISENIO = new URL('disenos/A-sala-de-control.html', RAIZ);

// Ventana rodante de la tabla, igual que los avisos: lo que salió hace más
// de 24 h o falta más de 24 h no entra. Tope duro de filas para que una
// jornada loca no haga una página de 3 MB.
const VENTANA_HORAS = 24;
const MAX_FILAS = 40;
const CUANTOS_JUICIOS = 5;

function zona(html, nombre, contenido) {
  const patron = new RegExp(`<!--ZONA:${nombre}-->[\\s\\S]*?<!--/ZONA:${nombre}-->`);
  if (!patron.test(html)) throw new Error(`generar: el diseño no trae la zona ${nombre}`);
  return html.replace(patron, `<!--ZONA:${nombre}-->${contenido}<!--/${nombre}-->`);
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
const ICONOS = ['favicon.svg', 'favicon.ico', 'favicon-32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'];

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

async function limpiarFichasViejas() {
  const archivos = await readdir(AQUI);
  await Promise.all(archivos.filter((a) => /^serie-\d+\.html$/.test(a)).map((a) => unlink(new URL(a, AQUI))));
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

  const enVentana = todas
    .filter((f) => {
      const t = new Date(f.inicio_programado).getTime();
      return Number.isFinite(t) && t >= desde && t <= hasta;
    })
    .sort((a, b) => new Date(a.inicio_programado) - new Date(b.inicio_programado))
    .slice(0, MAX_FILAS);

  const juicios = todas
    .filter((f) => f.resultado_real)
    .sort((a, b) => new Date(b.calificada_en ?? 0) - new Date(a.calificada_en ?? 0))
    .slice(0, CUANTOS_JUICIOS);

  // Nombres de equipo contra bo3.gg, agrupados por juego para pedir por
  // disciplina (sin el filtro devuelve vacío, ver bo3.mjs). Sólo los ids que
  // aparecen en pantalla.
  const nombres = new Map();
  const nombre = (id) => nombres.get(id)?.nombre ?? `#${id}`;
  for (const cfg of JUEGOS) {
    const filasDeJuego = [...enVentana, ...juicios].filter((f) => f.juego === cfg.id);
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
  const proximasPorJuego = new Map();
  for (const f of todas) {
    if (f.resultado_real) continue;
    const t = new Date(f.inicio_programado).getTime();
    if (t > ahoraMs && t <= hasta) proximasPorJuego.set(f.juego, (proximasPorJuego.get(f.juego) ?? 0) + 1);
  }

  const htmlFilas =
    enVentana.length > 0
      ? enVentana.map((f) => filaSerie(f, nombre)).join('\n      ')
      : '<tr><td colspan="7" class="mono" style="text-align:center; color:var(--apag); padding:22px">sin series en la ventana de 24 horas</td></tr>';

  plantilla = zona(plantilla, 'FILAS', htmlFilas);
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
    juicios.length > 0 ? juicios.map((c) => lineaJuicio(c, nombre)).join('\n      ') : '<div class="juicio"><span>— todavía no hay series juzgadas —</span></div>',
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

  // La maqueta se presentaba como propuesta; publicado ya, el banner dice la
  // verdad. Y el título deja de decir "A ·".
  plantilla = plantilla.replace(
    /<div class="aviso-demo">[\s\S]*?<\/div>/,
    '<div class="aviso-demo">DATOS REALES · CICLO CADA 10 MINUTOS · HORA DE VENEZUELA</div>',
  );
  plantilla = plantilla.replace(/<title>[\s\S]*?<\/title>/, '<title>Monitor eSports — Sala de Control</title>');

  await writeFile(new URL('index.html', AQUI), plantilla);

  await limpiarFichasViejas();
  const iconos = await copiarIconos();
  const logos = await copiarLogosDelRail();

  console.log(`index.html (sala de control) · ${enVentana.length} series en ventana · ${juicios.length} juicios · ${iconos} iconos · ${logos} logos`);
  for (const cfg of JUEGOS) {
    const s = stats.get(cfg.id);
    console.log(
      `${cfg.etiqueta}: juzgadas ${s?.juzgadas ?? 0} · brier ${s?.brier != null ? s.brier.toFixed(4) : '—'} · próximas 24h ${proximasPorJuego.get(cfg.id) ?? 0}`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

export { zona, main as generarPanel };
