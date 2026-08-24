// Escribe un serie-<match_id>.html por cada predicción de la base.
//
// La división es la misma de siempre: perfil.mjs no toca ni red ni disco (son
// funciones puras que devuelven HTML y se prueban con números a mano), y este
// archivo es el que lee el diseño, rellena las zonas y escribe.
//
// Por qué un archivo por partido y no una página con ?id=: cada serie queda
// con una URL propia que se puede compartir y guardar, funciona sin
// JavaScript y no se muere cuando el partido sale de la ventana de 24 h. El
// archivo público del proyecto es el producto -- que un link a una predicción
// de hace un mes siga abriendo es parte del punto.

import { readFile, writeFile } from 'node:fs/promises';
import { JUEGOS, faseDe } from './sala.mjs';
import {
  cabeza,
  encabezado,
  verificacion,
  bloqueVerificacion,
  graficoRatings,
  graficoMercado,
  bloqueVeredicto,
  historialDeEquipo,
  bloqueForma,
  bloqueStream,
} from './perfil.mjs';

function zona(html, nombre, contenido) {
  const patron = new RegExp(`<!--ZONA:${nombre}-->[\\s\\S]*?<!--/ZONA:${nombre}-->`);
  if (!patron.test(html)) throw new Error(`perfiles: el diseño no trae la zona ${nombre}`);
  return html.replace(patron, `<!--ZONA:${nombre}-->${contenido}<!--/ZONA:${nombre}-->`);
}

const POR_JUEGO = new Map(JUEGOS.map((j) => [j.id, j]));

export function unPerfil(plantilla, f, { todas, stats, capturas, nombre, logoDe, slugDe, streamsDe = null, ahoraMs }) {
  const cfg = POR_JUEGO.get(f.juego);
  const nombreA = nombre(f.equipo_a);
  const nombreB = nombre(f.equipo_b);
  const v = verificacion(f);
  const fase = faseDe(f, ahoraMs);

  let html = plantilla;
  html = zona(html, 'CABEZA', `\n${cabeza(f, nombreA, nombreB)}\n`);
  html = zona(html, 'ENCABEZADO', encabezado(f, {
    nombreA,
    nombreB,
    etiqueta: cfg?.etiqueta ?? String(f.juego).toUpperCase(),
    chip: cfg?.chip ?? '',
    logoDe,
    slug: slugDe ? slugDe(f.match_id) : null,
    fase,
  }));
  // El directo va antes que todo lo demás: si la serie está al aire, es lo
  // que la persona vino a ver. Sólo aparece si de verdad hay canal.
  const streams = streamsDe ? streamsDe(f.match_id) : null;
  const stream = bloqueStream(streams, { enCurso: fase === 'curso' });
  html = zona(html, 'STREAM', stream
    ? `<section class="directo-seccion"><h2>El directo<small>lo que está transmitiendo el torneo ahora mismo</small></h2>${stream}</section>`
    : '');

  html = zona(html, 'VERIFICACION', bloqueVerificacion(v, nombreA, nombreB));
  html = zona(html, 'RATINGS', graficoRatings(v, nombreA, nombreB));

  const mercado = graficoMercado(capturas, f);
  html = zona(html, 'MERCADO', mercado || (
    '<p class="sin-dato">De esta serie no hay capturas de cuotas guardadas, así que no hay ' +
    'con qué comparar. Las cuotas nunca entran al cálculo — sirven sólo para contrastar.</p>'
  ));

  const veredicto = bloqueVeredicto(f, stats.get(f.juego), nombreA, nombreB);
  html = zona(html, 'VEREDICTO', veredicto || (
    '<p class="sin-dato">Todavía no se ha jugado o no se ha calificado. Cuando termine, acá ' +
    'sale el resultado y el puntaje de Brier de esta predicción — acierte o no.</p>'
  ));

  const formaA = bloqueForma(historialDeEquipo(todas, f.equipo_a, { excluir: f.match_id }), f.equipo_a, nombreA, nombre);
  const formaB = bloqueForma(historialDeEquipo(todas, f.equipo_b, { excluir: f.match_id }), f.equipo_b, nombreB, nombre);
  html = zona(html, 'FORMA', formaA + formaB);

  return { html, tieneMercado: Boolean(mercado), verificado: Boolean(v && v.exacta), tieneStream: Boolean(stream) };
}

export async function generarPerfiles({
  todas,
  stats,
  cuotasPorPartido,
  nombre,
  logoDe,
  slugDe,
  streamsDe = null,
  destino,
  disenio,
  ahoraMs = Date.now(),
}) {
  const plantilla = await readFile(disenio, 'utf8');
  const archivos = new Set();
  let escritos = 0;
  let conMercado = 0;
  let verificados = 0;
  let conStream = 0;

  for (const f of todas) {
    if (!f.match_id) continue;
    const { html, tieneMercado, verificado, tieneStream } = unPerfil(plantilla, f, {
      todas,
      stats,
      capturas: cuotasPorPartido.get(f.match_id) ?? [],
      nombre,
      logoDe,
      slugDe,
      streamsDe,
      ahoraMs,
    });
    const archivo = `serie-${f.match_id}.html`;
    await writeFile(new URL(archivo, destino), html);
    archivos.add(archivo);
    escritos += 1;
    if (tieneMercado) conMercado += 1;
    if (verificado) verificados += 1;
    if (tieneStream) conStream += 1;
  }

  return { archivos, escritos, conMercado, verificados, conStream };
}
