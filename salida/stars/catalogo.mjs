import { datosDeEquipos } from '../../datos/juegos/bo3.mjs';

// Agrupa los nombres por juego: como máximo una consulta por disciplina.
export async function nombresParaPartidos(filas, buscar = datosDeEquipos) {
  const grupos = new Map();
  for (const p of filas) {
    if (!grupos.has(p.juego)) grupos.set(p.juego, new Set());
    for (const id of [p.equipo_a, p.equipo_b]) if (id) grupos.get(p.juego).add(id);
  }
  const mapa = new Map();
  await Promise.all([...grupos].map(async ([juego, ids]) => {
    try {
      const nombres = await buscar([...ids], { juego });
      for (const [id, nombre] of nombres) mapa.set(`${juego}:${id}`, nombre);
    } catch { /* La lista de partidos sigue funcionando si no hay nombres. */ }
  }));
  return mapa;
}
