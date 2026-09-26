import { esc } from '../telegram.mjs';

// Sólo presenta predicciones guardadas. No recalcula ni modifica el motor.
export function informePremium(p, historial, nombre = (id) => `#${id}`) {
  const forma = (id) => {
    const filas = historial.filter((f) => f.equipo_a === id || f.equipo_b === id).slice(0, 10);
    const victorias = filas.filter((f) => (f.resultado_real === 'ganaA' ? f.equipo_a : f.equipo_b) === id).length;
    return filas.length ? `${victorias}/${filas.length} series ganadas` : 'sin historial calificado';
  };
  const h2h = historial.filter((f) => [f.equipo_a, f.equipo_b].includes(p.equipo_a) &&
    [f.equipo_a, f.equipo_b].includes(p.equipo_b));
  return [
    `<b>Análisis PRO · partido #${p.match_id}</b>`,
    `${esc(({ cs2: 'CS2', dota2: 'Dota 2', lol: 'LoL', valorant: 'Valorant' })[p.juego] ?? p.juego)} · ${esc((p.formato ?? '').toUpperCase())}`,
    `<b>${esc(nombre(p.equipo_a))} vs. ${esc(nombre(p.equipo_b))}</b>`,
    new Date(p.inicio_programado).toLocaleString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'short', timeStyle: 'short' }) + ' · Venezuela',
    '\n<b>Probabilidades estimadas</b>',
    `${esc(nombre(p.equipo_a))}: ${Math.round(Number(p.prob_a) * 100)}%`,
    `${esc(nombre(p.equipo_b))}: ${100 - Math.round(Number(p.prob_a) * 100)}%`,
    '\n<b>Forma reciente</b>',
    `${esc(nombre(p.equipo_a))}: ${forma(p.equipo_a)}`,
    `${esc(nombre(p.equipo_b))}: ${forma(p.equipo_b)}`,
    '\n<b>Contexto</b>',
    h2h.length ? `${h2h.length} enfrentamientos previos con resultado registrado.` : 'Sin enfrentamientos previos registrados.',
    'La forma resume hasta 10 partidos anteriores con resultado registrado.',
    '\nLas predicciones son estimaciones; los resultados pueden diferir.',
  ].join('\n');
}
