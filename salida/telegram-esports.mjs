// Avisos por Telegram: el espejo de salida/discord-esports.mjs.
//
// Los MENSAJES son los mismos -- se reutilizan los constructores de
// discord-esports.mjs, que son puros y probados. Lo que cambia:
//   1. el transporte (salida/telegram.mjs, HTML en vez de markdown),
//   2. las columnas de "ya avisado": Discord y Telegram NO comparten
//      registro -- si compartieran, el primero que avisara marcaria la fila
//      y el otro canal nunca mandaria nada. Por eso existen las columnas
//      avisado_telegram_* (ver sql/migracion-telegram.sql).
//   3. la forma: UN MENSAJE POR PARTIDA, con la previa del perfil de esa
//      serie. Telegram no tiene embeds, pero su previa de enlace tiene la
//      misma anatomía que la tarjeta de Discord -- nombre del sitio,
//      título, descripción y miniatura -- y el perfil ya declara los og:
//      que la describen. Discord manda N embeds en un mensaje; Telegram
//      sólo admite una previa por mensaje, así que son N mensajes.
//      Nada de sendPhoto: ahí toda imagen ocupa el ancho completo y era lo
//      que se veía enorme.
//
//   node --env-file=.env salida/telegram-esports.mjs dota2 cs2 lol valorant

import { seleccionar, parchear } from '../datos/supabase.mjs';
import { datosDeEquipos } from '../datos/juegos/bo3.mjs';
import { enviar, esc } from './telegram.mjs';
import {
  TIERS_QUE_SE_AVISAN,
  HORAS_DE_ANTICIPACION,
  NOMBRE_JUEGO,
  calcularMetricas,
} from './discord-esports.mjs';
import { perfilUrl } from './web/sala.mjs';
import { diaEnPalabras, enVenezuela, hora12 } from './formato.mjs';

// Los constructores son de Discord y usan su markdown (**negrita**,
// `codigo`). Telegram recibe HTML: se escapa TODO primero y despues se
// convierten los pocos marcadores que los mensajes usan.
function discordAHtml(s) {
  return esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/_([^_\n]+)_/g, '<i>$1</i>');
}

// La línea de una partida por venir: la misma que arma Discord para su
// resumen, pero sola, porque cada mensaje de Telegram se tiene que entender
// sin el anterior. La TARJETA de abajo repite el enfrentamiento y el número
// -- igual que en Discord, donde el texto lista y el embed muestra.
export function lineaPrediccion(p, { juego, nombre, ahora = new Date() }) {
  const pa = Number(p.prob_a);
  const favA = pa >= 0.5;
  const fav = favA ? nombre(p.equipo_a) : nombre(p.equipo_b);
  const otro = favA ? nombre(p.equipo_b) : nombre(p.equipo_a);
  const prob = Math.round((favA ? pa : 1 - pa) * 100);
  const rdMax = Math.max(Number(p.rd_a) || 0, Number(p.rd_b) || 0);
  const aviso = rdMax >= 150 ? ' — poco historial, mucha incertidumbre' : prob <= 55 ? ' — muy parejo' : '';
  const { fecha, hora } = enVenezuela(p.inicio_programado);
  const dia = diaEnPalabras(fecha, ahora);
  return `🔮 <b>${esc(NOMBRE_JUEGO[juego] ?? juego)}</b> · ${esc(dia.toLowerCase())}` +
    `
<code>${esc(hora12(hora))}</code>  <b>${esc(fav)}</b> ${prob}% vs ${esc(otro)} ${100 - prob}%${esc(aviso)}`;
}

// La de una ya jugada: quién ganó, por cuánto, y si le atinamos.
export function lineaResultado(c, { juego, nombre }) {
  const pa = Number(c.prob_a);
  const favA = pa >= 0.5;
  const ganoA = c.resultado_real === 'ganaA';
  const acerto = favA === ganoA;
  const ganador = ganoA ? nombre(c.equipo_a) : nombre(c.equipo_b);
  const perdedor = ganoA ? nombre(c.equipo_b) : nombre(c.equipo_a);
  const favorito = favA ? nombre(c.equipo_a) : nombre(c.equipo_b);
  const prob = Math.round((favA ? pa : 1 - pa) * 100);
  const marcador = c.marcador_a == null
    ? ''
    : ` ${ganoA ? `${c.marcador_a}–${c.marcador_b}` : `${c.marcador_b}–${c.marcador_a}`}`;
  const comentario = acerto ? `le dábamos ${prob}%` : `íbamos con ${favorito}, ${prob}%`;
  return `${acerto ? '✅' : '❌'} <b>${esc(NOMBRE_JUEGO[juego] ?? juego)}</b>` +
    `
<b>${esc(ganador)}</b>${esc(marcador)} le ganó a ${esc(perdedor)} · ${esc(comentario)}`;
}

// Telegram tumba a un bot que dispara mensajes seguidos a un mismo canal
// (~20 por minuto). Con un respiro entre uno y otro, además, llegan en
// orden.
const RESPIRO_MS = 1200;
const respirar = (ms = RESPIRO_MS) => new Promise((r) => setTimeout(r, ms));

// Tope de tarjetas por tanda. Lo que pase de ahí se resume en una línea:
// veinte mensajes seguidos no los lee nadie.
const TOPE_TARJETAS = 8;

async function marcar(matchIds, columna, { fetchImpl } = {}) {
  if (matchIds.length === 0) return;
  await parchear('eslo_predicciones', `?match_id=in.(${matchIds.join(',')})`, { [columna]: new Date().toISOString() }, { fetchImpl });
}

export async function avisarTelegram(juego = 'cs2', { fetchImpl, fetchImplSupabase } = {}) {
  const todas = await seleccionar(
    'eslo_predicciones',
    `?select=*&juego=eq.${juego}&order=match_id.asc`,
    { fetchImpl: fetchImplSupabase },
  );

  const ahoraMs = Date.now();
  const deTier = (p) => TIERS_QUE_SE_AVISAN.has(String(p.tier ?? '').toLowerCase());

  // Mismo criterio que Discord: sólo lo que no empezó y cae dentro de las
  // próximas 24 h. Lo de pasado mañana se avisa cuando se acerque.
  const limite = ahoraMs + HORAS_DE_ANTICIPACION * 3600 * 1000;
  const nuevasPredichas = todas.filter((p) => {
    if (p.avisado_telegram_prediccion_en || p.resultado_real || !deTier(p)) return false;
    const arranca = new Date(p.inicio_programado).getTime();
    return arranca > ahoraMs && arranca <= limite;
  });
  const nuevasCalificadas = todas.filter((p) => p.resultado_real && !p.avisado_telegram_resultado_en && deTier(p));

  const idsEquipos = [...nuevasPredichas, ...nuevasCalificadas].flatMap((p) => [p.equipo_a, p.equipo_b]);
  const equipos = idsEquipos.length ? await datosDeEquipos(idsEquipos, { juego, fetchImpl }) : new Map();
  const nombre = (id) => equipos.get(id)?.nombre ?? `#${id}`;

  const enviados = [];
  const ahora = new Date();

  // Cada partida sale en su propio mensaje, con la previa de SU perfil: el
  // perfil declara og:site_name (el juego), og:title (el enfrentamiento),
  // og:description (hora → favorito y su número) y og:image (el escudo del
  // protagonista), que es lo que Telegram dibuja como tarjeta.
  async function mandarTanda(filas, linea, tipo, columna) {
    const anunciadas = [];
    const tanda = filas.slice(0, TOPE_TARJETAS);
    for (const [i, f] of tanda.entries()) {
      if (i > 0) await respirar();
      const r = await enviar(linea(f), { previa: { url: perfilUrl(f.match_id) }, fetchImpl });
      enviados.push({ tipo, partida: f.match_id, ...r });
      // Sólo se marca lo que DE VERDAD salió: lo que falló reintenta el
      // próximo ciclo en vez de perderse.
      if (r.enviado) anunciadas.push(f.match_id);
    }
    if (filas.length > TOPE_TARJETAS) {
      await respirar();
      const r = await enviar(`…y ${filas.length - TOPE_TARJETAS} más. <a href="${perfilUrl(filas[0].match_id)}">Ver el panel</a>.`, { fetchImpl });
      enviados.push({ tipo: `${tipo}-resto`, cuantas: filas.length - TOPE_TARJETAS, ...r });
    }
    if (anunciadas.length) await marcar(anunciadas, columna, { fetchImpl: fetchImplSupabase });
    return anunciadas.length;
  }

  // --- predicciones ---------------------------------------------------------
  if (nuevasPredichas.length) {
    await mandarTanda(
      nuevasPredichas,
      (p) => lineaPrediccion(p, { juego, nombre, ahora }),
      'prediccion',
      'avisado_telegram_prediccion_en',
    );
  }

  // --- resultados -----------------------------------------------------------
  if (nuevasCalificadas.length) {
    await mandarTanda(
      nuevasCalificadas,
      (c) => lineaResultado(c, { juego, nombre }),
      'resultado',
      'avisado_telegram_resultado_en',
    );
    // La nota del motor cierra la tanda: es lo único que no cabe en una
    // tarjeta y es justo lo que mide si el sistema sirve.
    const metricas = calcularMetricas(todas.filter((p) => p.resultado_real));
    if (metricas?.n) {
      await respirar();
      const cierre = [
        `🎯 <b>${esc(NOMBRE_JUEGO[juego] ?? juego)} · acertamos ${metricas.aciertos} de ${metricas.n}.</b>`,
        metricas.brier < 0.25
          ? 'El sistema quedó mejor que tirar una moneda.'
          : 'El sistema quedó por debajo de tirar una moneda: los fallos fueron con mucha confianza, y eso pesa más que los aciertos ajustados.',
        ...(metricas.concluyente ? [] : [`Con ${metricas.n} partidas todavía no alcanza para saber si sirve de verdad.`]),
        '',
        `<i>Para el que quiera el número: Brier ${metricas.brier.toFixed(4)} contra 0.250 de adivinar.</i>`,
      ].join(String.fromCharCode(10));
      const r = await enviar(cierre, { fetchImpl });
      enviados.push({ tipo: 'resultados-metricas', cuantas: metricas.n, ...r });
    }
  }
  return { enviados, juego };
}

const esDirecto = process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href;
if (esDirecto) {
  const juegos = process.argv.slice(2);
  if (juegos.length === 0) {
    console.error('uso: node --env-file=.env salida/telegram-esports.mjs <juegos...>');
    process.exit(1);
  }
  for (const juego of juegos) {
    const r = await avisarTelegram(juego);
    if (r.enviados.length === 0) console.log(`${juego}: nada nuevo que avisar.`);
    for (const e of r.enviados) {
      console.log(`${juego} · ${e.tipo}${e.partida ? ' #' + e.partida : ''}${e.cuantas != null ? ': ' + e.cuantas : ''} · ${e.enviado ? 'enviado a Telegram' : 'NO enviado — ' + e.razon}`);
    }
  }
}
