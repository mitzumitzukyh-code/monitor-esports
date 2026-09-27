export const NOMBRE_BOT = 'Monitor eSports';

export const DESCRIPCION_CORTA_BOT =
  'Predicciones y estadísticas de CS2, Dota 2, LoL y Valorant. FREE diario, PRO mensual y análisis individuales.';

export const DESCRIPCION_BOT =
  'Predicciones, probabilidades y resultados para entender cada partido de eSports.\n' +
  'CS2 · Dota 2 · LoL · Valorant\n\n' +
  '🎁 FREE diario · 👑 PRO mensual · 🎯 análisis individuales.\n' +
  'Contexto, no solo predicciones.';

export function validarPerfilTelegram() {
  if (!NOMBRE_BOT || NOMBRE_BOT.length > 64) throw new Error('Nombre de bot inválido');
  if (DESCRIPCION_CORTA_BOT.length > 120) throw new Error('Bio corta de Telegram demasiado larga');
  if (DESCRIPCION_BOT.length > 512) throw new Error('Descripción de Telegram demasiado larga');
  return true;
}
