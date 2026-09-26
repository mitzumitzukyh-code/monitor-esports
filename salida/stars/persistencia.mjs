import { rpc, seleccionar } from '../../datos/supabase.mjs';

export function almacenStars({ fetchImpl = fetch } = {}) {
  const accion = (nombre, datos) => rpc('eslo_stars', { p_accion: nombre, p_datos: datos }, { fetchImpl });
  return {
    accion,
    partidos: () => seleccionar('eslo_predicciones',
      `?select=match_id,juego,inicio_programado&inicio_programado=gt.${encodeURIComponent(new Date().toISOString())}` +
      '&order=inicio_programado.asc,match_id.asc&limit=10', { fetchImpl }),
    prediccion: async (id) => (await seleccionar('eslo_predicciones',
      `?select=*&match_id=eq.${id}&limit=1`, { fetchImpl }))[0] ?? null,
    historial: (p) => seleccionar('eslo_predicciones',
      `?select=equipo_a,equipo_b,resultado_real,prob_a,inicio_programado&juego=eq.${encodeURIComponent(p.juego)}` +
      `&inicio_programado=lt.${encodeURIComponent(p.inicio_programado)}&resultado_real=not.is.null` +
      `&or=(equipo_a.in.(${p.equipo_a},${p.equipo_b}),equipo_b.in.(${p.equipo_a},${p.equipo_b}))` +
      '&order=inicio_programado.desc,match_id.desc&limit=100', { fetchImpl }),
  };
}
