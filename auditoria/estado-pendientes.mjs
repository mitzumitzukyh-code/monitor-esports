// Diagnostica predicciones vencidas SIN alterar resultados congelados.
// Solo una partida terminada, con participantes y marcador verificables,
// constituye una calificacion atrasada. Aplazamientos y cambios de fixture
// son problemas de datos distintos, no resultados que se puedan inventar.
import { DISCIPLINAS, normalizar, esUtilizable } from '../datos/juegos/bo3.mjs';
import { fetchConReintentos } from '../datos/reintentar.mjs';

const BASE = 'https://api.bo3.gg/api/v1/matches';
const POR_PAGINA = 100;

export function clasificarPendiente(pred, cruda, ahora = Date.now()) {
  if (!cruda) return 'no_encontrado';
  if (Number(cruda.id) !== Number(pred.match_id) ||
      Number(cruda.discipline_id) !== Number(DISCIPLINAS[pred.juego])) {
    return 'dato_ajeno';
  }

  const a = Number(pred.equipo_a);
  const b = Number(pred.equipo_b);
  const realA = Number(cruda.team1_id);
  const realB = Number(cruda.team2_id);
  const mismos = (a === realA && b === realB) || (a === realB && b === realA);
  if (!mismos) return 'fixture_cambiado';

  if (cruda.status !== 'finished') {
    const nuevoInicio = Date.parse(cruda.start_date ?? '');
    if (Number.isFinite(nuevoInicio) && nuevoInicio > ahora) return 'reprogramado';
    return 'sin_resultado_confirmado';
  }

  // Exactamente las mismas condiciones de integridad que el calificador.
  if (!esUtilizable(normalizar(cruda))) return 'resultado_invalido';
  return 'terminado_sin_calificar';
}

export async function diagnosticarPendientes(pendientes, { fetchImpl = fetchConReintentos, ahora = Date.now() } = {}) {
  const categorias = [
    'terminado_sin_calificar', 'fixture_cambiado', 'reprogramado',
    'sin_resultado_confirmado', 'resultado_invalido', 'no_encontrado', 'dato_ajeno',
  ];
  const porCategoria = Object.fromEntries(categorias.map((c) => [c, []]));
  const porJuego = new Map();

  for (const p of pendientes) {
    if (!DISCIPLINAS[p.juego]) throw new Error('Juego desconocido en pendientes: ' + p.juego);
    if (!porJuego.has(p.juego)) porJuego.set(p.juego, []);
    porJuego.get(p.juego).push(p);
  }

  let lotes = 0;
  for (const [juego, filas] of porJuego) {
    for (let i = 0; i < filas.length; i += POR_PAGINA) {
      const lote = filas.slice(i, i + POR_PAGINA);
      const ids = lote.map((p) => Number(p.match_id));
      if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
        throw new Error('ID de partido invalido al diagnosticar ' + juego);
      }
      const url = BASE + '?page[limit]=' + POR_PAGINA +
        '&filter[matches.discipline_id][eq]=' + DISCIPLINAS[juego] +
        '&filter[matches.id][in]=' + ids.join(',');
      const respuesta = await fetchImpl(url, {
        headers: { 'User-Agent': 'monitor-esports/0.1 (proyecto personal)' },
      });
      if (!respuesta.ok) throw new Error('bo3.gg respondio ' + respuesta.status + ' en diagnostico ' + juego);
      const datos = await respuesta.json();
      if (!Array.isArray(datos?.results)) throw new Error('Respuesta de bo3.gg sin results en ' + juego);
      const porId = new Map(datos.results.map((m) => [Number(m.id), m]));
      for (const pred of lote) {
        const categoria = clasificarPendiente(pred, porId.get(Number(pred.match_id)), ahora);
        porCategoria[categoria].push(Number(pred.match_id));
      }
      lotes++;
    }
  }

  return { total: pendientes.length, lotes, ...porCategoria };
}
