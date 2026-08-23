// Las series PRÓXIMAS, que es lo único que el histórico versionado no puede
// saber. Sale de Supabase; sin credenciales devuelve null y el panel usa lo
// que sí tiene.
//
// QUÉ SE ENCIENDE CON CREDENCIALES, Y QUÉ NO
// Se enciende: la rejilla de "Próximas series" del Inicio, con la predicción
// ya guardada de cada una.
//
// NO se enciende la cuota ni la ventaja contra el mercado, y no es un
// pendiente: **Dota no tiene cuotas en ninguna tabla**. `eslo_cuotas` es de
// los juegos de bo3.gg (CS2, LoL, Valorant), va por `match_id` de partida y
// no por serie de Dota. Mientras el panel se genere del histórico de Dota,
// esas dos columnas salen «—» aunque el .env esté completo. Decirlo acá
// evita que alguien pierda una tarde buscando el cable que falta.

import { seleccionar } from '../../datos/supabase.mjs';

export function hayCredenciales() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// Devuelve las series que todavía no empezaron, con su predicción si la
// tienen. null si no hay credenciales o si Supabase no respondió — el panel
// se genera igual, que es lo que importa.
// `fetchImpl` existe para poder probar esto sin credenciales ni red: es el
// mismo punto de inyección que usa seleccionar().
//
// Los escudos se resuelven aparte, con OpenDota (/teams/{id} trae logo_url
// en el CDN NUEVO de Valve -- steamusercontent; el viejo steamcdn-a.akamaihd
// devuelve 404 y fue lo que dejó los cuadros vacíos en producción el
// 2026-08-23). Son 2-4 llamadas por corrida, para el presupuesto de la regla 5
// es nada. Si una falla, queda la inicial.
async function logosOpenDota(ids, fetchImpl) {
  const unicos = [...new Set((ids ?? []).filter(Boolean))];
  const logros = new Map();
  await Promise.all(unicos.map(async (id) => {
    for (let intento = 0; intento < 2; intento += 1) {
      try {
        const r = await fetchImpl(`https://api.opendota.com/api/teams/${id}`);
        if (!r.ok) continue; // 429/5xx: se reintenta una vez
        const t = await r.json();
        if (t && t.logo_url) logros.set(id, t.logo_url);
        return;
      } catch { /* sin logo: la inicial de siempre */ }
      if (intento === 0) await new Promise((resolver) => setTimeout(resolver, 400));
    }
  }));
  return logros;
}

export async function proximasSeries({ cuantas = 4, ahora = Date.now(), fetchImpl, fetchImplOpenDota } = {}) {
  if (!hayCredenciales()) return null;
  const opciones = fetchImpl ? { fetchImpl } : undefined;
  const fetchOpd = fetchImplOpenDota ?? ((url) => fetch(url));
  try {
    const [series, predicciones, equipos] = await Promise.all([
      seleccionar('dota_series', '?select=*&terminada=eq.false&order=start_time.asc', opciones),
      seleccionar('dota_predictions', '?select=*', opciones),
      seleccionar('dota_teams', '?select=*', opciones),
    ]);

    const nombre = new Map(equipos.map((e) => [e.team_id, e.nombre]));
    const predPorSerie = new Map(predicciones.map((p) => [p.series_id, p]));
    const queVienen = series
      // El feed sigue listando series que YA empezaron: es el mismo bug real
      // que documenta CLAUDE.md. Acá sólo se muestran las que faltan.
      .filter((s) => new Date(s.start_time).getTime() > ahora)
      .slice(0, cuantas);
    const logos = await logosOpenDota(queVienen.flatMap((s) => [s.equipo_a, s.equipo_b]), fetchOpd);

    return queVienen.map((s) => {
      const p = predPorSerie.get(s.series_id) ?? null;
      return {
        seriesId: s.series_id,
        torneo: s.league_name,
        formato: String(s.formato || '').toLowerCase(),
        // Los team_id hacen falta para el escudo real de cada equipo
        // (OpenDota resuelve logo_url por id); sin ellos queda la inicial.
        equipoA: s.equipo_a,
        equipoB: s.equipo_b,
        nombreA: nombre.get(s.equipo_a) ?? `#${s.equipo_a}`,
        nombreB: nombre.get(s.equipo_b) ?? `#${s.equipo_b}`,
        logoA: logos.get(s.equipo_a) ?? null,
        logoB: logos.get(s.equipo_b) ?? null,
        inicio: s.start_time,
        prediccion: p
          ? { ganaA: Number(p.prob_gana_a), empate: Number(p.prob_empate), ganaB: Number(p.prob_gana_b) }
          : null,
      };
    });
  } catch (e) {
    return { error: e.message.slice(0, 120) };
  }
}
