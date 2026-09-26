import { esc } from '../telegram.mjs';
import { JUEGOS, fechaPartido, formatoSerie } from './partidos.mjs';

// Sólo presenta predicciones guardadas. No recalcula ni modifica el motor.
export function informePremium(p, historial, nombre = (id) => `#${id}`) {
  const resultados = historial.filter(f => ['ganaA', 'ganaB'].includes(f.resultado_real));
  const forma = (id) => {
    const filas = resultados.filter((f) => f.equipo_a === id || f.equipo_b === id).slice(0, 10);
    const victorias = filas.filter((f) => (f.resultado_real === 'ganaA' ? f.equipo_a : f.equipo_b) === id).length;
    const ultimas = filas.slice(0, 5).map(f => (f.resultado_real === 'ganaA' ? f.equipo_a : f.equipo_b) === id ? 'G' : 'P');
    return filas.length ? `${victorias} de ${filas.length} series ganadas\nÚltimas: ${ultimas.join(' · ')} (más reciente primero)` : 'Sin resultados previos disponibles.';
  };
  const h2h = resultados.filter((f) => [f.equipo_a, f.equipo_b].includes(p.equipo_a) &&
    [f.equipo_a, f.equipo_b].includes(p.equipo_b));
  const ganadosA = h2h.filter(f => (f.resultado_real === 'ganaA' ? f.equipo_a : f.equipo_b) === p.equipo_a).length;
  const probA = Math.round(Number(p.prob_a) * 100);
  const nombreA = esc(nombre(p.equipo_a)), nombreB = esc(nombre(p.equipo_b));
  return [
    `<b>${esc(JUEGOS[p.juego] ?? p.juego)} · Análisis completo</b>`,
    `<b>${nombreA} vs. ${nombreB}</b>`,
    `${fechaPartido(p.inicio_programado)} · UTC−4`,
    formatoSerie(p.formato),
    '\n<b>Probabilidades estimadas</b>',
    `${nombreA}: ${probA}%`,
    `${nombreB}: ${100 - probA}%`,
    probA === 50 ? 'Probabilidades equilibradas.' : `Mayor probabilidad: ${probA > 50 ? nombreA : nombreB}.`,
    '\n<b>Forma reciente</b>',
    `${nombreA}: ${forma(p.equipo_a)}`,
    `${nombreB}: ${forma(p.equipo_b)}`,
    '\n<b>Enfrentamientos previos</b>',
    h2h.length ? `${h2h.length} series registradas.\n${nombreA}: ${ganadosA} ganadas · ${nombreB}: ${h2h.length - ganadosA} ganadas.` : 'Sin enfrentamientos previos registrados.',
    '\nForma: hasta 10 series anteriores con resultado registrado. G = ganada · P = perdida.',
  ].join('\n');
}
