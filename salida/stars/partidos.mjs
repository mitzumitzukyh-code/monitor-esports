export const JUEGOS = { cs2: 'CS2', dota2: 'Dota 2', lol: 'LoL', valorant: 'Valorant' };
export const POR_PAGINA = 6;
export const PERIODOS = { hoy: 'Hoy', manana: 'Mañana', proximos: 'Próximos' };
const DESFASE = 4 * 60 * 60 * 1000;

// Horario de publicación UTC−4, sin mostrar una ubicación del propietario.
export function fechaPartido(iso, opciones = { dateStyle: 'medium', timeStyle: 'short' }) {
  const fecha = new Date(iso);
  if (!Number.isFinite(fecha.getTime())) return 'Pendiente';
  const { dateStyle, timeStyle } = opciones;
  const partes = [];
  if (dateStyle) partes.push(fecha.toLocaleDateString('es', { timeZone: 'Etc/GMT+4', dateStyle }));
  if (timeStyle) partes.push(fecha.toLocaleTimeString('en-US', { timeZone: 'Etc/GMT+4', timeStyle, hour12: true }));
  return partes.join(' · ');
}

export function contextoLista(juego, pagina = '0', periodo = 'proximos') {
  if (!Object.hasOwn(JUEGOS, juego ?? '') || !/^\d{1,3}$/.test(String(pagina)) ||
    !Object.hasOwn(PERIODOS, periodo)) return null;
  return { juego, pagina: Number(pagina), periodo };
}

export const enlaceLista = ({ juego, pagina = 0, periodo = 'proximos' }) => `juego:${juego}:${pagina}:${periodo}`;

export function ventanaPartidos(periodo, ahora = Date.now()) {
  const local = new Date(ahora - DESFASE);
  const inicio = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + DESFASE;
  const manana = inicio + 86400000;
  return periodo === 'hoy' ? { desde: new Date(ahora).toISOString(), hasta: new Date(manana).toISOString() } :
    periodo === 'manana' ? { desde: new Date(manana).toISOString(), hasta: new Date(manana + 86400000).toISOString() } :
      { desde: new Date(ahora).toISOString() };
}

export function nombreEncuentro(p, mapa) {
  const a = mapa.get(`${p.juego}:${p.equipo_a}`)?.nombre;
  const b = mapa.get(`${p.juego}:${p.equipo_b}`)?.nombre;
  return a && b ? `${a} vs. ${b}` : `Encuentro #${p.match_id}`;
}

export function formatoSerie(formato) {
  const cantidad = /^bo([135])$/i.exec(formato ?? '')?.[1];
  return cantidad ? `Serie al mejor de ${cantidad}` : '';
}
