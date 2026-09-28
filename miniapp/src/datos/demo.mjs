// Fuente de DEMOSTRACIÓN. Nada de esto es una predicción real.
//
// Los equipos son inventados a propósito: si una captura de la demo circula,
// no puede pasar por una probabilidad real de un partido real (regla 1 del
// proyecto: todo porcentaje que llega al usuario sale del motor). La interfaz
// muestra la marca "DEMO" mientras esta fuente esté activa.
//
// La fuente imita al servidor: aplica ella misma el acceso (FREE / PRO /
// análisis individual) y entrega `prob_a: null` en lo bloqueado, igual que
// tendrá que hacer la API real.

import { diaLocal } from '../formato.mjs';

/** @typedef {import('./tipos.mjs').Partido} Partido */
/** @typedef {import('./tipos.mjs').Perfil} Perfil */
/** @typedef {import('./tipos.mjs').Catalogo} Catalogo */

const H = 3600000;

const EQUIPOS = {
  cs2: ['Nova Rift', 'Iron Coyotes', 'Polar Unit', 'Blackforge'],
  dota2: ['Ember Sages', 'Tidal Crown', 'Obsidian Five', 'Moonfall'],
  lol: ['Arc Lions', 'Violet Dynasty', 'Kite Esports', 'Northwind'],
  valorant: ['Night Owls', 'Crimson Relay', 'Static Eight', 'Velvet Raid'],
};
const COMPETICION = {
  cs2: 'Demo Masters · Grupo A',
  dota2: 'Demo Invitational · Playoffs',
  lol: 'Demo Split · Semana 4',
  valorant: 'Demo Challengers · Etapa 2',
};

// [id, juego, a, b, horas desde ahora, formato, prob_a, resultado]
const FILAS = [
  [1101, 'cs2', 0, 1, -0.6, 'bo3', 0.58, null],
  [1102, 'dota2', 0, 1, 2, 'bo3', 0.64, null],
  [1103, 'lol', 0, 1, 3.5, 'bo1', 0.55, null],
  [1104, 'valorant', 0, 1, 5, 'bo3', 0.47, null],
  [1105, 'cs2', 2, 3, 7, 'bo1', 0.61, null],
  [1106, 'dota2', 2, 3, 26, 'bo3', 0.52, null],
  [1107, 'lol', 2, 3, 28, 'bo5', 0.69, null],
  [1108, 'valorant', 2, 3, 30, 'bo3', 0.43, null],
  [1109, 'cs2', 1, 3, 52, 'bo3', 0.57, null],
  // Cerrados: aciertos y fallos mezclados, sin maquillar.
  [1001, 'cs2', 0, 2, -5, 'bo3', 0.66, 'ganaA'],
  [1002, 'dota2', 1, 3, -7, 'bo3', 0.59, 'ganaB'],
  [1003, 'lol', 0, 3, -9, 'bo1', 0.62, 'ganaA'],
  [1004, 'valorant', 1, 2, -11, 'bo3', 0.54, 'ganaB'],
  [1005, 'cs2', 1, 3, -22, 'bo1', 0.71, 'ganaA'],
  [1006, 'dota2', 0, 2, -26, 'bo3', 0.48, 'ganaB'],
  [1007, 'lol', 1, 2, -29, 'bo3', 0.57, 'ganaA'],
  [1008, 'valorant', 0, 3, -31, 'bo3', 0.63, 'ganaB'],
  [1009, 'cs2', 0, 3, -46, 'bo3', 0.52, 'ganaA'],
  [1010, 'dota2', 1, 2, -50, 'bo1', 0.61, 'ganaA'],
];

// Pseudoaleatorio con semilla: la demo se ve igual en cada carga y en las pruebas.
function semilla(n) {
  let x = n >>> 0;
  return () => ((x = (Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0) / 2 ** 32);
}

function forma(r) {
  const total = 6 + Math.floor(r() * 5);
  const victorias = Math.floor(r() * (total + 1));
  // Las últimas 5 tienen que cuadrar con el conteo: ni más G que victorias
  // ni más P que derrotas.
  const g = Math.min(5, victorias, Math.max(victorias - (total - 5), Math.round((victorias * 5) / total)));
  const ultimas = ['G', 'G', 'G', 'G', 'G'].fill('P', g);
  for (let i = ultimas.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [ultimas[i], ultimas[j]] = [ultimas[j], ultimas[i]];
  }
  return { victorias, total, ultimas };
}

/** Partidos completos, como los guardaría el servidor. */
export function partidosDemo(ahora = Date.now()) {
  return FILAS.map(([match_id, juego, a, b, horas, formato, prob_a, resultado]) => {
    const r = semilla(match_id);
    const inicio = ahora + horas * H;
    const series = Math.floor(r() * 5);
    return {
      match_id, juego, formato, prob_a,
      equipo_a: { id: match_id * 10 + a, nombre: EQUIPOS[juego][a] },
      equipo_b: { id: match_id * 10 + b, nombre: EQUIPOS[juego][b] },
      inicio_programado: new Date(inicio).toISOString(),
      competicion: COMPETICION[juego],
      estado: resultado ? 'finalizado' : inicio <= ahora ? 'en_vivo' : 'proximo',
      ...(resultado ? { resultado_real: resultado } : {}),
      analisis: {
        formaA: forma(r), formaB: forma(r),
        h2h: { series, ganadasA: Math.floor(r() * (series + 1)) },
      },
    };
  });
}

export const ESCENARIOS = Object.freeze({
  free: 'FREE',
  pro: 'PRO',
  individual: 'FREE + análisis individual',
  vacio: 'Sin partidos',
  error: 'Error de conexión',
});

/** @returns {Perfil} */
export function perfilDemo(escenario, ahora = Date.now()) {
  if (escenario === 'pro') {
    return { plan: 'pro', pro_hasta: new Date(ahora + 23 * 24 * H).toISOString(), gratis_hoy: null, analisis_comprados: [] };
  }
  return {
    plan: 'free', pro_hasta: null,
    gratis_hoy: escenario === 'vacio' ? null : 1102,
    analisis_comprados: escenario === 'individual' ? [1107] : [],
  };
}

/** @type {Catalogo} */
export const CATALOGO_DEMO = Object.freeze({
  pro_stars: 250,
  pro_dias: 30,
  analisis_stars: 50,
  compras_habilitadas: false,
  soporte: '@mitzukyhs',
  bot: 'monitor_esports_avisos_bot',
});

/** Aplica el acceso como lo haría el servidor. */
export function conAcceso(p, perfil) {
  const acceso = p.estado === 'finalizado' ? 'auditoria'
    : perfil.plan === 'pro' ? 'pro'
      : perfil.analisis_comprados.includes(p.match_id) ? 'individual'
        : perfil.gratis_hoy === p.match_id ? 'gratis'
          : 'bloqueado';
  if (acceso === 'bloqueado') return { ...p, acceso, prob_a: null, analisis: null };
  // La predicción FREE es la probabilidad, no el análisis completo.
  if (acceso === 'gratis' || acceso === 'auditoria') return { ...p, acceso, analisis: null };
  return { ...p, acceso };
}

/**
 * @param {{ escenario?: keyof typeof ESCENARIOS, retraso?: number, ahora?: () => number }} [opciones]
 */
export function crearFuenteDemo({ escenario = 'free', retraso = 250, ahora = () => Date.now() } = {}) {
  const esperar = () => new Promise((r) => setTimeout(r, retraso));
  async function base() {
    if (retraso) await esperar();
    if (escenario === 'error') {
      throw Object.assign(new Error('demo: error simulado'), { mensajeUsuario: 'No se pudo conectar con Monitor eSports.' });
    }
    const t = ahora();
    const perfil = perfilDemo(escenario, t);
    const todos = escenario === 'vacio' ? [] : partidosDemo(t).map((p) => conAcceso(p, perfil));
    return { t, perfil, todos };
  }
  const abiertos = (lista) => lista.filter((p) => p.estado !== 'finalizado')
    .sort((a, b) => Date.parse(a.inicio_programado) - Date.parse(b.inicio_programado));
  const cerrados = (lista) => lista.filter((p) => p.estado === 'finalizado')
    .sort((a, b) => Date.parse(b.inicio_programado) - Date.parse(a.inicio_programado));

  return {
    demo: true,
    escenario,
    async perfil() { return (await base()).perfil; },
    async catalogo() { return CATALOGO_DEMO; },
    async inicio() {
      const { perfil, todos } = await base();
      return {
        perfil,
        gratis: todos.find((p) => p.match_id === perfil.gratis_hoy) ?? null,
        proximos: abiertos(todos).slice(0, 4),
        recientes: cerrados(todos).slice(0, 6),
      };
    },
    async partidos({ juego = null, periodo = 'proximos' } = {}) {
      const { t, perfil, todos } = await base();
      const hoy = diaLocal(t);
      const lista = abiertos(todos).filter((p) => (!juego || p.juego === juego) && (
        periodo === 'hoy' ? diaLocal(Date.parse(p.inicio_programado)) === hoy
          : periodo === 'manana' ? diaLocal(Date.parse(p.inicio_programado)) === hoy + 1
            : true));
      return { perfil, partidos: lista };
    },
    async partido(id) {
      const { perfil, todos } = await base();
      return { perfil, partido: todos.find((p) => p.match_id === id) ?? null };
    },
    async historial({ juego = null } = {}) {
      const { perfil, todos } = await base();
      return { perfil, partidos: cerrados(todos).filter((p) => !juego || p.juego === juego) };
    },
  };
}
