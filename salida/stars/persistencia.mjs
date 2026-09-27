import { rpc, seleccionar } from '../../datos/supabase.mjs';
import { JUEGOS } from './partidos.mjs';

const CAMPOS_PUBLICOS = 'match_id,juego,equipo_a,equipo_b,inicio_programado,formato';

export function almacenStars({ fetchImpl = fetch } = {}) {
  const accion = (nombre, datos) => rpc('eslo_stars', { p_accion: nombre, p_datos: datos }, { fetchImpl });
  const engagement = (nombre, datos = {}) => rpc('eslo_stars_engagement', { p_accion: nombre, p_datos: datos }, { fetchImpl });
  const limite = (userId) => rpc('eslo_stars_rate_limit', { p_user_id: userId }, { fetchImpl });
  return {
    accion,
    engagement,
    limite,
    metricas: (juego = null, prob_a = null) => engagement('metricas', {
      ...(juego ? { juego } : {}),
      ...(prob_a != null && Number.isFinite(Number(prob_a)) ? { prob_a: Number(prob_a) } : {}),
    }),
    resultados: ({ desde, hasta, limite = 100 } = {}) => {
      if (![desde, hasta].every(x => Number.isFinite(Date.parse(x)))) throw new Error('Fecha no válida');
      if (!Number.isInteger(limite) || limite < 1 || limite > 100) throw new Error('Límite no válido');
      return seleccionar('eslo_predicciones',
        '?select=match_id,juego,equipo_a,equipo_b,inicio_programado,resultado_real,prob_a,marcador_a,marcador_b' +
        `&inicio_programado=gte.${encodeURIComponent(desde)}&inicio_programado=lt.${encodeURIComponent(hasta)}` +
        '&resultado_real=in.(ganaA,ganaB)&order=inicio_programado.asc,match_id.asc' +
        `&limit=${limite}`, { fetchImpl });
    },
    comprasIndividuales: async (userId) => {
      if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error('Usuario no válido');
      const [ordenes, pagos] = await Promise.all([
        seleccionar('eslo_stars_ordenes',
          `?select=payload,match_id,pagada_en&user_id=eq.${userId}&producto=eq.partido&pagada_en=not.is.null&order=pagada_en.desc&limit=50`,
          { fetchImpl }),
        seleccionar('eslo_stars_pagos',
          `?select=payload&user_id=eq.${userId}&reembolsado_en=is.null&limit=100`, { fetchImpl }),
      ]);
      const activos = new Set(pagos.map(p => p.payload));
      return [...new Set(ordenes.filter(o => activos.has(o.payload)).map(o => Number(o.match_id))
        .filter(id => Number.isSafeInteger(id) && id > 0))];
    },
    predicciones: async (ids = []) => {
      const limpios = [...new Set(ids.map(Number).filter(id => Number.isSafeInteger(id) && id > 0))].slice(0, 50);
      if (!limpios.length) return [];
      return seleccionar('eslo_predicciones',
        `?select=*&match_id=in.(${limpios.join(',')})&order=inicio_programado.asc,match_id.asc`, { fetchImpl });
    },
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
