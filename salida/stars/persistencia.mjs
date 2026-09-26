import { rpc, seleccionar } from '../../datos/supabase.mjs';
import { JUEGOS } from './partidos.mjs';

const CAMPOS_PUBLICOS = 'match_id,juego,equipo_a,equipo_b,inicio_programado,formato';

export function almacenStars({ fetchImpl = fetch } = {}) {
  const accion = (nombre, datos) => rpc('eslo_stars', { p_accion: nombre, p_datos: datos }, { fetchImpl });
  return {
    accion,
    partidos: ({ juego, desde = new Date().toISOString(), hasta, offset = 0, limite = 10 } = {}) => {
      if (juego && !Object.hasOwn(JUEGOS, juego)) throw new Error('Juego no válido');
      if (!Number.isInteger(offset) || offset < 0 || offset > 6000 || !Number.isInteger(limite) || limite < 1 || limite > 10) {
        throw new Error('Página no válida');
      }
      if (!Number.isFinite(Date.parse(desde)) || (hasta && !Number.isFinite(Date.parse(hasta)))) throw new Error('Fecha no válida');
      return seleccionar('eslo_predicciones',
        `?select=${CAMPOS_PUBLICOS}&inicio_programado=gte.${encodeURIComponent(desde)}` +
        (hasta ? `&inicio_programado=lt.${encodeURIComponent(hasta)}` : '') +
        (juego ? `&juego=eq.${juego}` : '') +
        `&order=inicio_programado.asc,match_id.asc&limit=${limite}&offset=${offset}`, { fetchImpl });
    },
    // Una ficha FREE nunca consulta probabilidades, ratings ni contexto premium.
    ficha: async (id) => {
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Partido no válido');
      return (await seleccionar('eslo_predicciones', `?select=${CAMPOS_PUBLICOS}&match_id=eq.${id}&limit=1`, { fetchImpl }))[0] ?? null;
    },
    prediccion: async (id) => (await seleccionar('eslo_predicciones',
      `?select=*&match_id=eq.${id}&limit=1`, { fetchImpl }))[0] ?? null,
    historial: async (p) => {
      if (![p.equipo_a, p.equipo_b].every(id => Number.isSafeInteger(id) && id > 0) ||
        !Object.hasOwn(JUEGOS, p.juego) || !Number.isFinite(Date.parse(p.inicio_programado))) throw Error('Historial no válido');
      const base = `?select=match_id,equipo_a,equipo_b,resultado_real,inicio_programado&juego=eq.${p.juego}` +
        `&inicio_programado=lt.${encodeURIComponent(p.inicio_programado)}&resultado_real=in.(ganaA,ganaB)`;
      const orden = '&order=inicio_programado.desc,match_id.desc';
      // Diez resultados por equipo y todos los H2H, sin truncarlos por un límite combinado.
      const lotes = await Promise.all([
        ...[p.equipo_a,p.equipo_b].map(id => seleccionar('eslo_predicciones',
          base + `&or=(equipo_a.eq.${id},equipo_b.eq.${id})` + orden + '&limit=10', { fetchImpl })),
        seleccionar('eslo_predicciones', base +
          `&or=(and(equipo_a.eq.${p.equipo_a},equipo_b.eq.${p.equipo_b}),and(equipo_a.eq.${p.equipo_b},equipo_b.eq.${p.equipo_a}))` + orden, { fetchImpl }),
      ]);
      return [...new Map(lotes.flat().map(f => [f.match_id,f])).values()];
    },
  };
}
