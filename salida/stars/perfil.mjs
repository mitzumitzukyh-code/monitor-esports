export const NOMBRE_BOT = 'Monitor eSports';

export const DESCRIPCION_CORTA_BOT =
  'Predicciones, probabilidades e historial real de CS2, Dota 2, LoL y Valorant.';

export const DESCRIPCION_BOT =
  'Tu centro de análisis de eSports.\n' +
  'CS2 · Dota 2 · LoL · Valorant\n\n' +
  '🎁 FREE · Predicción diaria\n' +
  '👑 PRO · Probabilidades, alertas y análisis completos\n' +
  '🎯 Análisis individual · Elige solo el partido que te interesa\n\n' +
  '📊 Resultados reales, aciertos y fallos visibles.\n' +
  'Contexto, no solo predicciones.';

export function validarPerfilTelegram() {
  if (!NOMBRE_BOT || NOMBRE_BOT.length > 64) throw new Error('Nombre de bot inválido');
  if (DESCRIPCION_CORTA_BOT.length > 120) throw new Error('Bio corta de Telegram demasiado larga');
  if (DESCRIPCION_BOT.length > 512) throw new Error('Descripción de Telegram demasiado larga');
  return true;
}
