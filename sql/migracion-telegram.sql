-- Telegram como segundo canal de avisos.
--
-- Discord y Telegram NO comparten las columnas de "ya avisado": si
-- compartieran, el primero que avisara marcaria la fila y el otro canal
-- nunca mandaria nada. Cada canal lleva su propio registro.
--
-- Correr en Supabase > SQL Editor. Es idempotente (IF NOT EXISTS).

ALTER TABLE eslo_predicciones
  ADD COLUMN IF NOT EXISTS avisado_telegram_prediccion_en timestamptz,
  ADD COLUMN IF NOT EXISTS avisado_telegram_resultado_en timestamptz;
