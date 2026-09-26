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
    historial: (p) => seleccionar('eslo_predicciones',
      `?select=equipo_a,equipo_b,resultado_real,prob_a,inicio_programado&juego=eq.${encodeURIComponent(p.juego)}` +
      `&inicio_programado=lt.${encodeURIComponent(p.inicio_programado)}&resultado_real=not.is.null` +
      `&or=(equipo_a.in.(${p.equipo_a},${p.equipo_b}),equipo_b.in.(${p.equipo_a},${p.equipo_b}))` +
      '&order=inicio_programado.desc,match_id.desc&limit=100', { fetchImpl }),
  };
}
