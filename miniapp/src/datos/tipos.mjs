// Contrato de datos de la Mini App, en JSDoc (el repo no usa TypeScript).
//
// Las formas copian las filas que ya maneja el bot (`salida/stars/`):
// match_id, juego, equipo_a/equipo_b, inicio_programado, formato, prob_a,
// resultado_real. Cuando se conecte la API real, sólo cambia la fuente; las
// vistas no se tocan.
//
// Regla de acceso: la fuente (hoy la demo, mañana el servidor) es la que
// decide qué puede ver el usuario. Si un partido está bloqueado, `prob_a`
// llega en null y `acceso` dice por qué. La vista NUNCA recibe el número
// para después esconderlo.

/** @typedef {'cs2' | 'dota2' | 'lol' | 'valorant'} Juego */
/** @typedef {'proximo' | 'en_vivo' | 'finalizado'} EstadoPartido */
/** @typedef {'ganaA' | 'ganaB'} Resultado */
// 'auditoria': partido ya cerrado. Igual que la web (`publicarSinPremium`),
// una predicción cerrada se publica completa para que el historial se pueda
// auditar, fallos incluidos.
/** @typedef {'pro' | 'gratis' | 'individual' | 'auditoria' | 'bloqueado'} Acceso */

/**
 * @typedef {object} Equipo
 * @property {number} id
 * @property {string} nombre
 */

/**
 * @typedef {object} Forma
 * @property {number} victorias   series ganadas en las últimas `total`
 * @property {number} total
 * @property {('G'|'P')[]} ultimas  las 5 más recientes, de nueva a vieja
 */

/**
 * @typedef {object} Analisis
 * @property {Forma} formaA
 * @property {Forma} formaB
 * @property {{ series: number, ganadasA: number }} h2h
 */

/**
 * @typedef {object} Partido
 * @property {number} match_id
 * @property {Juego} juego
 * @property {Equipo} equipo_a
 * @property {Equipo} equipo_b
 * @property {string} inicio_programado   ISO 8601
 * @property {'bo1'|'bo2'|'bo3'|'bo5'} formato
 * @property {string} [competicion]
 * @property {EstadoPartido} estado
 * @property {number | null} prob_a       null si el usuario no tiene acceso
 * @property {Acceso} acceso
 * @property {Analisis | null} analisis   sólo con acceso 'pro' o 'individual'
 * @property {Resultado} [resultado_real] sólo en finalizados
 */

/**
 * @typedef {object} Perfil
 * @property {'free' | 'pro'} plan
 * @property {string | null} pro_hasta         ISO, sólo con PRO
 * @property {number | null} gratis_hoy        match_id de la predicción FREE del día
 * @property {number[]} analisis_comprados     match_id con análisis individual
 */

/**
 * @typedef {object} Catalogo
 * @property {number} pro_stars
 * @property {number} pro_dias
 * @property {number} analisis_stars
 * @property {boolean} compras_habilitadas
 * @property {string} soporte
 * @property {string} bot
 */

export const JUEGOS = Object.freeze({ cs2: 'CS2', dota2: 'Dota 2', lol: 'LoL', valorant: 'Valorant' });
export const ORDEN_JUEGOS = Object.freeze(['cs2', 'dota2', 'lol', 'valorant']);
const ESTADOS = ['proximo', 'en_vivo', 'finalizado'];
const ACCESOS = ['pro', 'gratis', 'individual', 'auditoria', 'bloqueado'];
const FORMATOS = ['bo1', 'bo2', 'bo3', 'bo5'];

const entero = (v) => Number.isSafeInteger(v) && v > 0;
const texto = (v) => typeof v === 'string' && v.trim().length > 0;
const fecha = (v) => typeof v === 'string' && Number.isFinite(Date.parse(v));

function validarForma(f, donde) {
  const errores = [];
  if (!f || !Number.isInteger(f.victorias) || !Number.isInteger(f.total) ||
    f.victorias < 0 || f.victorias > f.total) errores.push(`${donde}: victorias/total inválidos`);
  if (!Array.isArray(f?.ultimas) || f.ultimas.length > 5 || f.ultimas.some((x) => x !== 'G' && x !== 'P')) {
    errores.push(`${donde}: ultimas inválidas`);
  } else if (!errores.length) {
    const g = f.ultimas.filter((x) => x === 'G').length;
    if (g > f.victorias || f.ultimas.length - g > f.total - f.victorias) errores.push(`${donde}: ultimas no cuadra con el conteo`);
  }
  return errores;
}

/** @returns {string[]} errores; vacío si el partido cumple el contrato */
export function validarPartido(p) {
  const e = [];
  if (!p || typeof p !== 'object') return ['partido: no es un objeto'];
  const id = `partido ${p.match_id}`;
  if (!entero(p.match_id)) e.push('partido: match_id inválido');
  if (!Object.hasOwn(JUEGOS, p.juego ?? '')) e.push(`${id}: juego desconocido`);
  for (const lado of ['equipo_a', 'equipo_b']) {
    if (!entero(p[lado]?.id) || !texto(p[lado]?.nombre)) e.push(`${id}: ${lado} inválido`);
  }
  if (p.equipo_a?.id === p.equipo_b?.id) e.push(`${id}: un equipo contra sí mismo`);
  if (!fecha(p.inicio_programado)) e.push(`${id}: inicio_programado inválido`);
  if (!FORMATOS.includes(p.formato)) e.push(`${id}: formato inválido`);
  if (!ESTADOS.includes(p.estado)) e.push(`${id}: estado inválido`);
  if (!ACCESOS.includes(p.acceso)) e.push(`${id}: acceso inválido`);
  if (p.acceso === 'bloqueado') {
    if (p.prob_a != null) e.push(`${id}: bloqueado pero trae prob_a`);
    if (p.analisis != null) e.push(`${id}: bloqueado pero trae análisis`);
  } else if (p.prob_a != null && !(Number.isFinite(p.prob_a) && p.prob_a >= 0 && p.prob_a <= 1)) {
    e.push(`${id}: prob_a fuera de [0, 1]`);
  }
  // La FREE del día y la auditoría de un cerrado dan la probabilidad, no el
  // informe completo. Una fuente que mande análisis ahí expone de más.
  if ((p.acceso === 'gratis' || p.acceso === 'auditoria') && p.analisis != null) {
    e.push(`${id}: acceso ${p.acceso} no incluye análisis`);
  }
  if (p.analisis) {
    e.push(...validarForma(p.analisis.formaA, `${id} formaA`), ...validarForma(p.analisis.formaB, `${id} formaB`));
    const h = p.analisis.h2h;
    if (!h || !Number.isInteger(h.series) || !Number.isInteger(h.ganadasA) || h.ganadasA < 0 || h.ganadasA > h.series) {
      e.push(`${id}: h2h inválido`);
    }
  }
  if (p.estado === 'finalizado' && !['ganaA', 'ganaB'].includes(p.resultado_real)) {
    e.push(`${id}: finalizado sin resultado_real`);
  }
  if (p.estado !== 'finalizado' && p.resultado_real != null) e.push(`${id}: resultado antes de terminar`);
  if (p.acceso === 'auditoria' && p.estado !== 'finalizado') e.push(`${id}: auditoría de un partido abierto`);
  return e;
}

/** @returns {string[]} */
export function validarPerfil(u) {
  const e = [];
  if (!u || !['free', 'pro'].includes(u.plan)) e.push('perfil: plan inválido');
  if (u?.plan === 'pro' && !fecha(u.pro_hasta)) e.push('perfil: PRO sin fecha de vencimiento');
  if (u?.gratis_hoy != null && !entero(u.gratis_hoy)) e.push('perfil: gratis_hoy inválido');
  if (!Array.isArray(u?.analisis_comprados) || !u.analisis_comprados.every(entero)) {
    e.push('perfil: analisis_comprados inválido');
  }
  return e;
}
