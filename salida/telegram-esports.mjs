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
import { nombresDeEquipos } from '../datos/juegos/bo3.mjs';
import { enviar, esc } from './telegram.mjs';
import {
  TIERS_QUE_SE_AVISAN,
  HORAS_DE_ANTICIPACION,
  mensajePredicciones,
  mensajeResultados,
  calcularMetricas,
} from './discord-esports.mjs';

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
  const nombres = idsEquipos.length ? await nombresDeEquipos(idsEquipos, { juego, fetchImpl }) : new Map();
  const nombre = (id) => nombres.get(id) ?? `#${id}`;

  const enviados = [];

  const msgPred = mensajePredicciones(nuevasPredichas, nombre, juego);
  if (msgPred) {
    const r = await enviar(discordAHtml(msgPred), { fetchImpl });
    enviados.push({ tipo: 'predicciones', cuantas: nuevasPredichas.length, ...r });
    if (r.enviado) {
      await marcar(nuevasPredichas.map((p) => p.match_id), 'avisado_telegram_prediccion_en', { fetchImpl: fetchImplSupabase });
    }
  }

  const metricas = calcularMetricas(todas.filter((p) => p.resultado_real));
  const msgRes = mensajeResultados(nuevasCalificadas, nombre, juego, metricas);
  if (msgRes) {
    const r = await enviar(discordAHtml(msgRes), { fetchImpl });
    enviados.push({ tipo: 'resultados', cuantas: nuevasCalificadas.length, ...r });
    if (r.enviado) {
      await marcar(nuevasCalificadas.map((c) => c.match_id), 'avisado_telegram_resultado_en', { fetchImpl: fetchImplSupabase });
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
