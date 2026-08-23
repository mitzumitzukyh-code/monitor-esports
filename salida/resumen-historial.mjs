// Resumen histórico de un torneo cerrado: lo que el motor predijo de Dota 2,
// calificado contra lo que pasó. Se corre a mano una vez que el torneo
// termina -- no es parte del ciclo de 10 minutos.
//
//   node --env-file=.env salida/resumen-historial.mjs
//
// El mensaje sale a Discord (mismo webhook que los avisos) y queda como el
// registro público del torneo: aciertos y fallos con el mismo tamaño, que es
// la regla de la casa.

import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import { seleccionar } from '../datos/supabase.mjs';
import { enviar, recortar, calcularMetricasSimple } from './discord.mjs';

export function armarHistorial(juzgadas, huérfanas, nombre, metricas) {
  const conDetalle = juzgadas.map((c) => {
    const favA = Number(c.prob_gana_a) >= Number(c.prob_gana_b);
    const favorito = favA ? nombre(c.equipo_a) : nombre(c.equipo_b);
    const probFav = Math.round((favA ? Number(c.prob_gana_a) : Number(c.prob_gana_b)) * 100);
    const acerto = (favA ? 'ganaA' : 'ganaB') === c.resultado_real;
    const ganoA = c.resultado_real === 'ganaA';
    const campeon = ganoA ? nombre(c.equipo_a) : nombre(c.equipo_b);
    return { ...c, favorito, probFav, acerto, campeon };
  });

  const peores = conDetalle.filter((c) => !c.acerto).sort((a, b) => b.brier - a.brier).slice(0, 3);
  const mejores = conDetalle.filter((c) => c.acerto).sort((a, b) => b.probFav - a.probFav).slice(0, 3);
  const final = conDetalle.find((c) => /R05/.test(c.series_id));

  const partes = ['📜 **TI2026 · Historial completo de las predicciones de Dota 2**', ''];

  partes.push(`**${metricas.n} series predichas antes de jugarse y calificadas contra el resultado real.**`);
  partes.push(`Favorito acertado: **${metricas.aciertos} de ${metricas.n}** (${Math.round((metricas.aciertos / metricas.n) * 100)}%).`);
  partes.push('');
  partes.push(`Brier **${metricas.media.toFixed(4)}** contra ${metricas.baseMedia.toFixed(3)} de adivinar el favorito a mano. Quedó mejor, pero con esta muestra el intervalo todavía toca la moneda: **no se canta victoria**.`);
  partes.push('');

  if (final) {
    partes.push(`🏆 **La final**: le dábamos ${final.probFav}% a ${final.favorito}… y **${final.campeon}** se llevó el Aegis. ${final.acerto ? 'La llamamos bien.' : 'El golpe más duro del torneo.'}`);
    partes.push('');
  }

  if (peores.length) {
    partes.push('❌ **Peores llamadas**');
    for (const p of peores) partes.push(`· íbamos con ${p.favorito} ${p.probFav}% — ganó ${p.campeon}`);
    partes.push('');
  }

  if (mejores.length) {
    partes.push('✅ **Mejores llamadas**');
    for (const p of mejores) partes.push(`· ${p.favorito} ${p.probFav}% — ganó`);
    partes.push('');
  }

  if (huérfanas.length) {
    partes.push(`⚠️ ${huérfanas.length === 1 ? 'Quedó 1 serie sin calificar' : `Quedaron ${huérfanas.length} series sin calificar`} (${huérfanas.map((h) => h.series_id).join(', ')}): la fuente nunca recibió sus partidas restantes. Se queda pendiente, no se inventa resultado.`);
    partes.push('');
  }

  partes.push('_Cada número de esta lista quedó guardado ANTES de jugarse la serie y no se reescribe. Historial completo en el panel._');

  return recortar(partes.join('\n'));
}

export async function resumenHistorial({ fetchImpl, fetchImplSupabase } = {}) {
  const [seriesDb, predsDb, teamsDb] = await Promise.all([
    seleccionar('dota_series', '?select=*', { fetchImpl: fetchImplSupabase }),
    seleccionar('dota_predictions', '?select=*', { fetchImpl: fetchImplSupabase }),
    seleccionar('dota_teams', '?select=*', { fetchImpl: fetchImplSupabase }),
  ]);

  const nombrePorId = new Map(teamsDb.map((t) => [t.team_id, t.nombre]));
  const nombre = (id) => nombrePorId.get(id) ?? `#${id}`;
  const seriePorId = new Map(seriesDb.map((s) => [s.series_id, s]));

  const juzgadas = [];
  const huerfanas = [];
  for (const p of predsDb) {
    const s = seriePorId.get(p.series_id);
    if (p.resultado_real) juzgadas.push({ ...s, ...p });
    else huerfanas.push({ series_id: p.series_id });
  }

  const metricas = calcularMetricasSimple(juzgadas);
  const mensaje = armarHistorial(juzgadas, huerfanas, nombre, metricas);
  const r = await enviar(mensaje, { fetchImpl });
  return { mensaje, ...r, metricas };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  resumenHistorial()
    .then((r) => {
      console.log(r.mensaje);
      console.log('\n---');
      console.log(r.enviado ? 'enviado a Discord' : `NO enviado — ${r.razon}`);
    })
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    });
}
