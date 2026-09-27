import { esc } from '../telegram.mjs';
import { JUEGOS, fechaPartido, nombreEncuentro, zonaPublica } from './partidos.mjs';

export const VENTANA_RESULTADOS = 1800;
const ORDEN_JUEGOS = ['cs2', 'dota2', 'lol', 'valorant'];
const LIMITE_TEXTO = 3900;

// Misma convención que los avisos existentes: el favorito es prob_a >= 0.5.
export function aciertoPrincipal(r) {
  return (Number(r.prob_a) >= 0.5) === (r.resultado_real === 'ganaA');
}

const valido = (r) => ['ganaA', 'ganaB'].includes(r?.resultado_real) && r.prob_a != null &&
  Number.isFinite(Number(r.prob_a)) && Object.hasOwn(JUEGOS, r.juego);
const cronologico = (a, b) => (Date.parse(a.inicio_programado) || 0) - (Date.parse(b.inicio_programado) || 0) ||
  Number(a.match_id) - Number(b.match_id);

export function mensajeResultados(items, { mapa = new Map(), hasta }) {
  const filas = items.filter(valido);
  if (!filas.length) return null;
  const diaCorte = fechaPartido(hasta, { dateStyle: 'medium' });
  const hora = (iso) => fechaPartido(iso, fechaPartido(iso, { dateStyle: 'medium' }) === diaCorte
    ? { timeStyle: 'short' } : { dateStyle: 'medium', timeStyle: 'short' });
  const lineas = ['🏁 <b>Resultados recientes</b>'];
  let omitidos = 0;
  for (const juego of ORDEN_JUEGOS) {
    const delJuego = filas.filter((r) => r.juego === juego).sort(cronologico);
    if (!delJuego.length) continue;
    const bloque = [`\n<b>${JUEGOS[juego]}</b>`, ...delJuego.map((r) =>
      `${esc(hora(r.inicio_programado))} — ${esc(nombreEncuentro(r, mapa))} ${aciertoPrincipal(r) ? '✅' : '❌'}`)];
    for (const linea of bloque) {
      if (lineas.join('\n').length + linea.length > LIMITE_TEXTO) omitidos++;
      else lineas.push(linea);
    }
  }
  if (omitidos) lineas.push(`\n… y ${omitidos} resultados más.`);
  lineas.push(`\nActualizado hasta ${esc(fechaPartido(hasta, { timeStyle: 'short' }))} · ${zonaPublica(hasta)}`);
  lineas.push('✅ predicción principal correcta · ❌ incorrecta');
  return lineas.join('\n');
}

// Entrega bloques ya cerrados en SQL. Cada envío se reserva justo antes de
// mandarlo: la reserva confirma PRO vigente y bloquea duplicados.
export async function despacharResultados({ accion, api, nombresPartidos = async () => new Map(),
  pausa = () => new Promise((r) => setTimeout(r, 50)) }) {
  const { bloques = [] } = await accion('preparar', { ventana_segundos: VENTANA_RESULTADOS });
  const resumen = { bloques: 0, enviados: 0, omitidos: 0, fallidos: 0 };
  for (const b of bloques) {
    const destinatarios = (b.destinatarios ?? []).filter((id) => Number.isSafeInteger(id) && id > 0);
    if (!b.items?.length || !destinatarios.length) continue;
    const mapa = await nombresPartidos(b.items).catch(() => new Map());
    const texto = mensajeResultados(b.items, { mapa, hasta: b.hasta });
    if (!texto) continue;
    resumen.bloques++;
    for (const user_id of destinatarios) {
      const datos = { bloque_id: b.bloque_id, user_id };
      const reserva = await accion('reservar', datos);
      if (!reserva.ok) { resumen.omitidos++; continue; }
      try {
        await api('sendMessage', { chat_id: user_id, text: texto, parse_mode: 'HTML',
          link_preview_options: { is_disabled: true }, protect_content: true });
        await accion('confirmar', datos);
        resumen.enviados++;
      } catch (e) {
        // Bot bloqueado o chat inexistente no se reintenta; otros fallos sí.
        await accion(/: (400|403)$/.test(String(e?.message)) ? 'descartar' : 'liberar', datos);
        resumen.fallidos++;
      }
      await pausa();
    }
  }
  return resumen;
}
