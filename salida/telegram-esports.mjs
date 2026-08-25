// Avisos por Telegram: el espejo de salida/discord-esports.mjs.
//
// Los MENSAJES son los mismos -- se reutilizan los constructores de
// discord-esports.mjs, que son puros y probados. Lo que cambia:
//   1. el transporte (salida/telegram.mjs, HTML en vez de markdown),
//   2. las columnas de "ya avisado": Discord y Telegram NO comparten
//      registro -- si compartieran, el primero que avisara marcaria la fila
//      y el otro canal nunca mandaria nada. Por eso existen las columnas
//      avisado_telegram_* (ver sql/migracion-telegram.sql).
//
//   node --env-file=.env salida/telegram-esports.mjs dota2 cs2 lol valorant

import { seleccionar, parchear } from '../datos/supabase.mjs';
import { datosDeEquipos } from '../datos/juegos/bo3.mjs';
import { enviar, enviarFotos, esc } from './telegram.mjs';
import {
  TIERS_QUE_SE_AVISAN,
  HORAS_DE_ANTICIPACION,
  mensajePredicciones,
  mensajeResultados,
  calcularMetricas,
} from './discord-esports.mjs';
import { logoDeJuegoUrl } from './web/sala.mjs';
import { enVenezuela, hora12 } from './formato.mjs';

// Los constructores son de Discord y usan su markdown (**negrita**,
// `codigo`). Telegram recibe HTML: se escapa TODO primero y despues se
// convierten los pocos marcadores que los mensajes usan.
function discordAHtml(s) {
  return esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

async function marcar(matchIds, columna, { fetchImpl } = {}) {
  if (matchIds.length === 0) return;
  await parchear('eslo_predicciones', `?match_id=in.(${matchIds.join(',')})`, { [columna]: new Date().toISOString() }, { fetchImpl });
}

// Fotos del álbum: el logo del JUEGO de primero y luego una foto por partida
// con el escudo del equipo protagonista (favorito/ganador) y la línea del
// aviso de caption. 10 por grupo y el juego ya ocupa uno: 9 partidas.
export function fotosDe(partidas, { juego, tipo, nombre, logoDe = null }) {
  const fotos = [];
  const logoJuego = logoDeJuegoUrl(juego);
  const nombreJuego = { cs2: 'CS2', lol: 'LoL', valorant: 'Valorant', dota2: 'Dota 2' }[juego] ?? juego;
  if (logoJuego) fotos.push({ url: logoJuego, caption: `🔮 <b>${esc(nombreJuego)}</b>` });

  for (const p of partidas) {
    if (fotos.length >= 10) break;
    const pa = Number(p.prob_a);
    const favA = pa >= 0.5;
    const nombreA = nombre(p.equipo_a);
    const nombreB = nombre(p.equipo_b);
    const hora = hora12(enVenezuela(p.inicio_programado).hora);

    if (tipo === 'resultados') {
      const ganoA = p.resultado_real === 'ganaA';
      const ganador = ganoA ? nombreA : nombreB;
      const perdedor = ganoA ? nombreB : nombreA;
      const acerto = favA === ganoA;
      const marcador =
        p.marcador_a == null ? '' : ` ${ganoA ? `${p.marcador_a}–${p.marcador_b}` : `${p.marcador_b}–${p.marcador_a}`}`;
      const escudo = logoDe?.(ganoA ? p.equipo_a : p.equipo_b);
      if (!escudo) continue;
      fotos.push({
        url: escudo,
        caption: `${acerto ? '✅' : '❌'} ${hora} · <b>${esc(ganador)}</b>${esc(marcador)} le ganó a ${esc(perdedor)}`,
      });
      continue;
    }

    const fav = favA ? nombreA : nombreB;
    const otro = favA ? nombreB : nombreA;
    const probFav = Math.round((favA ? pa : 1 - pa) * 100);
    const escudo = logoDe?.(favA ? p.equipo_a : p.equipo_b);
    if (!escudo) continue;
    fotos.push({
      url: escudo,
      caption: `${hora} → <b>${esc(fav)}</b> ${probFav}% vs ${esc(otro)}${probFav <= 55 ? ' — muy parejo' : ''}`,
    });
  }
  return fotos;
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
  const logoDe = (id) => equipos.get(id)?.logo ?? null;

  const enviados = [];

  const msgPred = mensajePredicciones(nuevasPredichas, nombre, juego);
  if (msgPred) {
    const r = await enviar(discordAHtml(msgPred), { fetchImpl });
    enviados.push({ tipo: 'predicciones', cuantas: nuevasPredichas.length, ...r });
    if (r.enviado) {
      await marcar(nuevasPredichas.map((p) => p.match_id), 'avisado_telegram_prediccion_en', { fetchImpl: fetchImplSupabase });
      // El álbum de logos es adorno, no el aviso: si falla (CDN caído,
      // Telegram no pudo traer la foto), NO se reintenta ni bloquea el
      // marcado -- el texto ya salió y el próximo ciclo no debe duplicarlo.
      const fotos = fotosDe(nuevasPredichas, { juego, tipo: 'predicciones', nombre, logoDe });
      if (fotos.length) {
        const rf = await enviarFotos(fotos, { fetchImpl });
        enviados.push({ tipo: 'fotos-predicciones', cuantas: fotos.length, ...rf });
      }
    }
  }

  const metricas = calcularMetricas(todas.filter((p) => p.resultado_real));
  const msgRes = mensajeResultados(nuevasCalificadas, nombre, juego, metricas);
  if (msgRes) {
    const r = await enviar(discordAHtml(msgRes), { fetchImpl });
    enviados.push({ tipo: 'resultados', cuantas: nuevasCalificadas.length, ...r });
    if (r.enviado) {
      await marcar(nuevasCalificadas.map((c) => c.match_id), 'avisado_telegram_resultado_en', { fetchImpl: fetchImplSupabase });
      const fotos = fotosDe(nuevasCalificadas, { juego, tipo: 'resultados', nombre, logoDe });
      if (fotos.length) {
        const rf = await enviarFotos(fotos, { fetchImpl });
        enviados.push({ tipo: 'fotos-resultados', cuantas: fotos.length, ...rf });
      }
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
      console.log(`${juego} · ${e.tipo}: ${e.cuantas} · ${e.enviado ? 'enviado a Telegram' : 'NO enviado — ' + e.razon}`);
    }
  }
}
