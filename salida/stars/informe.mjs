import { esc } from '../telegram.mjs';
import { JUEGOS, fechaPartido, formatoSerie } from './partidos.mjs';

// Sólo presenta predicciones guardadas. No recalcula ni modifica el motor.
export function informePremium(p, historial, nombre = (id) => `#${id}`) {
  const resultados = historial.filter(f => ['ganaA', 'ganaB'].includes(f.resultado_real) &&
    (!f.inicio_programado || Date.parse(f.inicio_programado) < Date.parse(p.inicio_programado)))
    .sort((a,b) => Date.parse(b.inicio_programado) - Date.parse(a.inicio_programado) ||
      Number(b.match_id ?? 0) - Number(a.match_id ?? 0));
  const forma = (id) => {
    const filas = resultados.filter((f) => f.equipo_a === id || f.equipo_b === id).slice(0, 10);
    const victorias = filas.filter((f) => (f.resultado_real === 'ganaA' ? f.equipo_a : f.equipo_b) === id).length;
    const ultimas = filas.slice(0, 5).map(f => (f.resultado_real === 'ganaA' ? f.equipo_a : f.equipo_b) === id ? 'G' : 'P');
    return { total: filas.length, victorias, ultimas };
  };
  const h2h = resultados.filter((f) => [f.equipo_a, f.equipo_b].includes(p.equipo_a) &&
    [f.equipo_a, f.equipo_b].includes(p.equipo_b));
  const ganadosA = h2h.filter(f => (f.resultado_real === 'ganaA' ? f.equipo_a : f.equipo_b) === p.equipo_a).length;
  const probValida = p.prob_a != null && Number.isFinite(Number(p.prob_a)) && Number(p.prob_a) >= 0 && Number(p.prob_a) <= 1;
  const probA = Math.round(Number(p.prob_a) * 100);
  const nombreA = esc(nombre(p.equipo_a)), nombreB = esc(nombre(p.equipo_b));
  const mayorA = Number(p.prob_a) >= 0.5;
  const a = forma(p.equipo_a), b = forma(p.equipo_b), preferido = mayorA ? a : b;
  const formaTexto = f => f.total ? `${f.victorias} de ${f.total} series ganadas` : 'Sin resultados previos disponibles.';
  return [
    `<b>${esc(JUEGOS[p.juego] ?? p.juego)} · Análisis completo</b>`,
    `<b>${nombreA} vs. ${nombreB}</b>`,
    `${fechaPartido(p.inicio_programado)} · UTC−4`,
    formatoSerie(p.formato),
    p.competicion ? `Competición: ${esc(p.competicion)}` : '',
    probValida ? `\n<b>Probabilidad: ${Math.max(probA,100-probA)}% · Forma: ${preferido.total ? `${preferido.victorias}/${preferido.total}` : 'Sin datos'} · H2H: ${h2h.length ? `${ganadosA}–${h2h.length-ganadosA}` : 'Sin datos'}</b>` : '',
    probValida ? `Forma: ${mayorA ? nombreA : nombreB}. H2H en orden ${nombreA}–${nombreB}.` : '',
    '\n<b>Probabilidades estimadas</b>',
    probValida ? `${nombreA}: ${probA}%\n${nombreB}: ${100-probA}%` : 'Pendiente: probabilidad no disponible.',
    probValida ? (Number(p.prob_a) === 0.5 ? 'Probabilidades equilibradas.' :
      `Mayor probabilidad: ${mayorA ? nombreA : nombreB}.${probA === 50 ? ' Los porcentajes se muestran redondeados.' : ''}`) : '',
    '\n<b>Forma reciente</b>',
    `${nombreA}: ${formaTexto(a)}`,
    `${nombreB}: ${formaTexto(b)}`,
    '\n<b>Últimos resultados</b>',
    `${nombreA}: ${a.ultimas.join(' · ') || 'Sin datos'}`,
    `${nombreB}: ${b.ultimas.join(' · ') || 'Sin datos'}`,
    'Hasta 5 series, más reciente primero. G = ganada · P = perdida.',
    '\n<b>Enfrentamientos previos · H2H</b>',
    h2h.length ? `${h2h.length} series registradas.\n${nombreA}: ${ganadosA} ganadas · ${nombreB}: ${h2h.length - ganadosA} ganadas.` : 'Sin enfrentamientos previos registrados.',
    '\nForma: hasta 10 series anteriores con resultado registrado.',
  ].filter(Boolean).join('\n');
}
