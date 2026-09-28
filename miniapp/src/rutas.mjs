// Rutas por hash: Telegram abre la Mini App en una sola URL, y con el hash no
// hace falta que el servidor reescriba rutas.

import { JUEGOS } from './datos/tipos.mjs';

/** Pestañas de la barra inferior, en orden. */
export const NAVEGACION = Object.freeze([
  { pantalla: 'inicio', etiqueta: 'Inicio', href: '#/inicio', icono: 'inicio' },
  { pantalla: 'partidos', etiqueta: 'Partidos', href: '#/partidos', icono: 'partidos' },
  { pantalla: 'historial', etiqueta: 'Historial', href: '#/historial', icono: 'historial' },
  { pantalla: 'pro', etiqueta: 'PRO', href: '#/pro', icono: 'pro' },
  { pantalla: 'mas', etiqueta: 'Más', href: '#/mas', icono: 'mas' },
]);

/** Las seis pantallas de la V1. */
export const PANTALLAS = Object.freeze(['inicio', 'partidos', 'detalle', 'historial', 'pro', 'mas']);

export const PERIODOS = Object.freeze({ hoy: 'Hoy', manana: 'Mañana', proximos: 'Próximos' });

/**
 * @typedef {object} Ruta
 * @property {'inicio'|'partidos'|'detalle'|'historial'|'pro'|'mas'} pantalla
 * @property {string} pestana   pestaña de la barra que queda marcada
 * @property {string|null} [juego]
 * @property {string} [periodo]
 * @property {number} [id]
 */

/** @returns {Ruta} */
export function leerRuta(hash = '') {
  const [camino, query = ''] = String(hash).replace(/^#/, '').split('?');
  const partes = camino.split('/').filter(Boolean);
  const params = new URLSearchParams(query);
  const juego = Object.hasOwn(JUEGOS, params.get('juego') ?? '') ? params.get('juego') : null;
  const periodo = Object.hasOwn(PERIODOS, params.get('periodo') ?? '') ? params.get('periodo') : 'proximos';

  switch (partes[0]) {
    case 'partidos': return { pantalla: 'partidos', pestana: 'partidos', juego, periodo };
    case 'partido': {
      const id = Number(partes[1]);
      return Number.isSafeInteger(id) && id > 0 && /^\d+$/.test(partes[1])
        ? { pantalla: 'detalle', pestana: 'partidos', id }
        : { pantalla: 'partidos', pestana: 'partidos', juego: null, periodo: 'proximos' };
    }
    case 'historial': return { pantalla: 'historial', pestana: 'historial', juego };
    case 'pro': return { pantalla: 'pro', pestana: 'pro' };
    case 'mas': return { pantalla: 'mas', pestana: 'mas' };
    default: return { pantalla: 'inicio', pestana: 'inicio' };
  }
}

export function hrefPartidos({ juego = null, periodo = 'proximos' } = {}) {
  const q = new URLSearchParams();
  if (juego) q.set('juego', juego);
  if (periodo !== 'proximos') q.set('periodo', periodo);
  const s = q.toString();
  return `#/partidos${s ? `?${s}` : ''}`;
}

export const hrefPartido = (id) => `#/partido/${id}`;
export const hrefHistorial = (juego = null) => `#/historial${juego ? `?juego=${juego}` : ''}`;

/** Una pantalla raíz no muestra el botón Atrás de Telegram. */
export const esRaiz = (ruta) => ruta.pantalla !== 'detalle';
