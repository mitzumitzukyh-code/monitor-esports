// Formato de pantalla. Misma convención horaria que el bot
// (`salida/stars/partidos.mjs`): UTC−4 fijo. Se duplica a propósito para que
// la Mini App no dependa de código de servidor; si una cambia, cambiar la otra.

const DESFASE = 4 * 60 * 60 * 1000;
const ZONA = 'Etc/GMT+4';

/** Escapa texto para meterlo en HTML. Los nombres de equipo vienen de terceros. */
export function esc(valor) {
  return String(valor ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

/** Porcentaje entero para mostrar. Nunca redondea hacia un titular más vendedor. */
export function pct(prob) {
  return `${Math.round(prob * 100)}%`;
}

export function hora(iso) {
  const f = new Date(iso);
  return Number.isFinite(f.getTime())
    ? f.toLocaleTimeString('en-US', { timeZone: ZONA, hour: 'numeric', minute: '2-digit', hour12: true })
    : 'Pendiente';
}

export function dia(iso, ahora = Date.now()) {
  const f = new Date(iso);
  if (!Number.isFinite(f.getTime())) return 'Pendiente';
  const d = diaLocal(f.getTime()), hoy = diaLocal(ahora);
  if (d === hoy) return 'Hoy';
  if (d === hoy + 1) return 'Mañana';
  if (d === hoy - 1) return 'Ayer';
  return f.toLocaleDateString('es', { timeZone: ZONA, weekday: 'short', day: 'numeric', month: 'short' });
}

export const fechaCorta = (iso, ahora) => `${dia(iso, ahora)} · ${hora(iso)}`;

/** Número de día calendario en UTC−4. */
export function diaLocal(ms) {
  return Math.floor((ms - DESFASE) / 86400000);
}

export const ZONA_PUBLICA = 'UTC−4';

export function formatoSerie(formato) {
  const n = /^bo([1235])$/i.exec(formato ?? '')?.[1];
  return n ? `Bo${n}` : '';
}

export function formatoSerieLargo(formato) {
  const n = /^bo([1235])$/i.exec(formato ?? '')?.[1];
  return n ? `Serie al mejor de ${n}` : '';
}
