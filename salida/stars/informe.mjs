import { esc } from '../telegram.mjs';
import { lineaPrediccion } from '../telegram-esports.mjs';

const cifra = (x) => x == null || !Number.isFinite(Number(x)) ? 'sin dato' : Number(x).toFixed(1);

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
    lineaPrediccion(p, { juego: p.juego, nombre }),
    `Modelo guardado: ${esc(p.motor)} · ${esc(p.formato ?? 'formato sin dato')}`,
    `${esc(nombre(p.equipo_a))}: rating ${cifra(p.rating_a)} · incertidumbre RD ${cifra(p.rd_a)}`,
    `${esc(nombre(p.equipo_b))}: rating ${cifra(p.rating_b)} · incertidumbre RD ${cifra(p.rd_b)}`,
    `Forma previa: ${esc(nombre(p.equipo_a))} ${forma(p.equipo_a)}; ${esc(nombre(p.equipo_b))} ${forma(p.equipo_b)}.`,
    `Enfrentamientos previos en la muestra: ${h2h.length}.`,
    'La forma usa hasta 100 predicciones calificadas anteriores al inicio. RD más alto indica mayor incertidumbre.',
    'Son estimaciones estadísticas; los resultados pueden diferir.',
  ].join('\n');
}
