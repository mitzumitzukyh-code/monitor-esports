# Benchmark externo: Monitor eSports vs mercado

Objetivo: comparar las probabilidades congeladas de Monitor eSports contra una probabilidad externa observada antes del partido.

## Regla principal

Este módulo es **sólo analítico**. No coloca órdenes, no mueve fondos y no automatiza apuestas.

Cada snapshot debe contener:

```json
{
  "match_id": 123,
  "juego": "cs2",
  "prob_modelo": 0.63,
  "prob_mercado": 0.57,
  "resultado_real": "ganaA",
  "capturada_en": "2026-09-27T15:00:00Z",
  "inicio_programado": "2026-09-27T16:00:00Z",
  "fuente": "BINANCE_PREDICTION"
}
```

`capturada_en` debe ser anterior a `inicio_programado`; cualquier snapshot tardío se descarta.

## Métricas

- Brier Score
- Log-loss
- Acierto de la predicción principal
- Delta Monitor − mercado
- Resultados por juego

Ejecutar:

```bash
node juez/benchmark-mercado.mjs ruta/snapshots.jsonl
```

## Binance Prediction Markets

Binance Wallet expone Prediction Markets mediante una integración con terceros y ofrece una Prediction Markets API para usuarios elegibles. La disponibilidad depende de la región y la API requiere una Prediction Account y autorizaciones de Binance.

La integración automática con Binance queda **deshabilitada por defecto** hasta disponer de credenciales de Prediction API y confirmar elegibilidad. Si se conecta en el futuro, el collector deberá ser de sólo lectura/cotización y no incluir endpoints de colocación de órdenes.

Fuente de verdad del benchmark: el snapshot observado y congelado antes del partido.
