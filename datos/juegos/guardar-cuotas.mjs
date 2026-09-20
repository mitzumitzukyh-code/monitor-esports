// Captura las cuotas de lo que viene y las guarda. Se corre seguido desde el
// ciclo de GitHub Actions.
//
//   node --env-file=.env datos/juegos/guardar-cuotas.mjs
//   node --env-file=.env datos/juegos/guardar-cuotas.mjs cs2 lol
//
// Idempotente: la clave primaria es (match_id, capturado_en), así que correr
// dos veces seguidas no pisa nada -- agrega una captura más, que es
// justamente lo que se quiere para ver el movimiento de la cuota.

import { fileURLToPath } from 'node:url';
import { seleccionar, upsert } from '../supabase.mjs';
import { capturarCuotas } from './cuotas.mjs';
import { DISCIPLINAS } from './bo3.mjs';

export async function guardarCuotas(juegos, { fetchImpl, fetchImplSupabase } = {}) {
  const filas = await capturarCuotas(juegos, { fetchImpl });
  if (filas.length === 0) return { capturadas: 0, guardadas: 0 };

  // Si ya existe una predicción congelada para el match_id, esa identidad
  // manda. bo3.gg puede corregir o reutilizar un fixture manteniendo el mismo
  // id; guardar cuotas de los nuevos participantes bajo el pick viejo
  // contamina calibración/ROI aunque la cuota sea válida para el fixture
  // actual. Se aceptan A/B invertidos, pero nunca equipos distintos.
  const ids = [...new Set(filas.map((c) => Number(c.matchId)).filter(Number.isFinite))];
  const congeladas = ids.length
    ? await seleccionar(
        'eslo_predicciones',
        `?select=match_id,juego,equipo_a,equipo_b&match_id=in.(${ids.join(',')})`,
        { fetchImpl: fetchImplSupabase },
      )
    : [];
  const predPorId = new Map(congeladas.map((p) => [Number(p.match_id), p]));

  let descartadasFixture = 0;
  const validas = filas.filter((c) => {
    const p = predPorId.get(Number(c.matchId));
    if (!p) return true; // primera captura: el pick puede crearse en este mismo ciclo

    const mismoJuego = String(p.juego) === String(c.juego);
    const mismos =
      (Number(p.equipo_a) === Number(c.equipoA) && Number(p.equipo_b) === Number(c.equipoB)) ||
      (Number(p.equipo_a) === Number(c.equipoB) && Number(p.equipo_b) === Number(c.equipoA));

    if (mismoJuego && mismos) return true;

    descartadasFixture++;
    console.warn(
      `ODDS_FIXTURE_MISMATCH ${c.juego} #${c.matchId}: ` +
        `pred=${p.equipo_a}/${p.equipo_b} cuota=${c.equipoA}/${c.equipoB}; descartada`,
    );
    return false;
  });

  const paraBase = validas.map((c) => ({
    match_id: c.matchId,
    capturado_en: c.capturadoEn,
    juego: c.juego,
    disciplina_id: c.disciplinaId,
    equipo_a: c.equipoA,
    equipo_b: c.equipoB,
    coeff_a: c.coeffA,
    coeff_b: c.coeffB,
    prob_a: c.probA,
    prob_b: c.probB,
    margen: c.margen,
    max_coeff_a: c.maxCoeffA,
    max_coeff_b: c.maxCoeffB,
    prob_max_a: c.probMaxA,
    prob_max_b: c.probMaxB,
    margen_max: c.margenMax,
    inicio_programado: c.inicioProgramado,
    proveedor_id: c.proveedorId,
  }));

  if (paraBase.length === 0) {
    return { capturadas: filas.length, guardadas: 0, descartadasFixture };
  }

  // Defensa en profundidad: Supabase tiene además un trigger que descarta
  // cualquier fila cuyo fixture contradiga una predicción ya congelada.
  const guardadas = await upsert('eslo_cuotas', paraBase, { fetchImpl: fetchImplSupabase });
  return {
    capturadas: filas.length,
    guardadas: Array.isArray(guardadas) ? guardadas.length : paraBase.length,
    descartadasFixture,
  };
}

const esEjecutadoDirectamente = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (esEjecutadoDirectamente) {
  const pedidos = process.argv.slice(2);
  const juegos = pedidos.length ? pedidos : ['cs2', 'lol', 'valorant', 'dota2'];

  const desconocidos = juegos.filter((j) => !DISCIPLINAS[j]);
  if (desconocidos.length) {
    console.error(`juego desconocido: ${desconocidos.join(', ')}`);
    console.error(`juegos: ${Object.keys(DISCIPLINAS).join(', ')}`);
    process.exit(1);
  }

  guardarCuotas(juegos)
    .then((r) => console.log(`cuotas capturadas: ${r.capturadas} · guardadas: ${r.guardadas}` + (r.descartadasFixture ? ` · ${r.descartadasFixture} fixture mismatch descartadas` : '')))
    .catch((err) => {
      console.error(err.message);
      process.exitCode = 1;
    });
}
