# Market Calibration Shadow v1 — protocolo prospectivo

Estado: **congelado para observación prospectiva**  
Versión: `market-calibration-shadow-v1`  
Gate fuente: `quality-gate-v1`  
Evaluador: `prospective-evaluator-v1`  
Inicio del experimento: `2026-09-14T14:46:33Z`

## Objetivo

Comprobar si la diferencia entre la probabilidad del modelo y la probabilidad implícita de referencia sin margen (`model_market_delta_pp`) contiene señal prospectiva útil para **calibrar y evaluar el modelo**.

Este experimento es observacional. No modifica Telegram, Discord, `quality-gate-v1`, las predicciones almacenadas ni la lógica de publicación.

## Población

Sólo se observa un partido cuando:

1. existe un registro `quality-gate-v1` con `decision=pass`;
2. el partido aún no ha comenzado;
3. la predicción sigue sin resultado en el momento de la observación;
4. existe un snapshot de referencia válido y previo al inicio;
5. los `team_id` del snapshot son exactamente los mismos de la predicción, aunque el orden A/B esté invertido.

Los equipos ajenos nunca se remapean por nombre ni por heurística.

## Observación canónica

Cada ejecución de GitHub Actions produce un artefacto de auditoría. Además, las observaciones `status=ok` se registran en `public.eslo_market_calibration_shadow` con clave primaria `(match_id, calibration_version)`.

Para cada `match_id`, la observación canónica es **la primera observación cronológica con `status=ok`** de esa versión. La persistencia usa semántica first-write-wins: una observación posterior no reemplaza la fila canónica.

Los artefactos conservan la evidencia de ejecución; la tabla canónica es el registro operativo que consume el evaluador prospectivo.

## Probabilidad de referencia y de-vig

La probabilidad de referencia se calcula con `coeff_a` y `coeff_b` pertenecientes al mismo snapshot/proveedor:

- `raw_a = 1 / odds_a`
- `raw_b = 1 / odds_b`
- `devig_a = raw_a / (raw_a + raw_b)`
- `devig_b = raw_b / (raw_a + raw_b)`
- `overround = raw_a + raw_b - 1`

`max_coeff_a` y `max_coeff_b` se conservan únicamente como dato auxiliar. No se mezclan para construir la probabilidad de referencia porque pueden proceder de precios incompatibles entre sí.

## Delta

Para el lado elegido por el modelo:

`model_market_delta_pp = (P_modelo - P_referencia_devig) * 100`

Las bandas quedan congeladas antes de evaluar resultados:

- `<-5pp`
- `-5..-2pp`
- `-2..0pp`
- `0..2pp`
- `2..5pp`
- `5..8pp`
- `8pp+`

Las bandas son etiquetas descriptivas. No son reglas de PASS/REJECT.

## Evaluador prospectivo v1

`prospective-evaluator-v1` sólo puntúa filas canónicas cuyo resultado se incorporó **después** de `observed_at`.

Controles de integridad:

- el `match_id` debe existir en `eslo_predicciones`;
- `pick_team_id` debe seguir correspondiendo al lado A/B almacenado;
- el resultado debe ser `ganaA` o `ganaB`;
- si `calificada_en <= observed_at`, la fila se marca como `result_precedes_observation` y no entra en métricas;
- una fila pendiente nunca recibe Brier provisional.

Para el lado elegido por el modelo se define `y=1` si ganó y `y=0` si perdió:

- `Brier_modelo = (P_modelo - y)^2`
- `Brier_referencia = (P_referencia_devig - y)^2`
- `Brier_diff = Brier_modelo - Brier_referencia`

Interpretación congelada: `Brier_diff < 0` favorece al modelo; `Brier_diff > 0` favorece a la referencia.

## Bandas de calibración del modelo

Antes de observar resultados prospectivos se congelan estas bandas para `P_modelo`:

- `<55%`
- `55-60%`
- `60-65%`
- `65-70%`
- `70-75%`
- `75%+`

`quality-gate-v1` normalmente limita la cohorte a 55–75%; las bandas externas son guardas de integridad/versionado y no una ampliación del gate.

## Métricas prospectivas predefinidas

El evaluador reportará como mínimo:

- N canónico, N resuelto, N pendiente y anomalías de integridad;
- accuracy del lado elegido por el modelo;
- Brier medio del modelo;
- Brier medio de la referencia de-vig;
- diferencia `Brier_modelo - Brier_referencia`;
- tasa observada y gap de calibración por banda de probabilidad;
- desempeño por banda de delta;
- estabilidad por fecha/cohorte de observación.

La comparación principal será **modelo vs referencia de-vig en observaciones prospectivas**, no el ajuste retrospectivo de una regla que maximice resultados pasados.

## Hitos de lectura

Los estados quedan congelados así:

- N < 30: `PRE_N30_INTEGRITY_ONLY` — sólo integridad;
- N = 30–49: `N30_INTEGRITY_CHECKPOINT`;
- N = 50–99: `N50_EXPLORATORY`;
- N >= 100: `N100_OPERATIONAL_READ`.

No se moverán las fronteras de las bandas de `v1` para mejorar resultados observados. Si en el futuro se prueba otra definición, debe tener un nombre/versionado nuevo y comenzar su propia cohorte prospectiva.

## Snapshot inicial

La primera ejecución válida de `market-calibration-shadow-v1` fue GitHub Actions run `34857806915` sobre el commit `441359d741a202eea3ead5584c2e0715b246bdbc`.

Resultado inicial:

- evaluadas: 3
- calibrables: 3
- `status=ok`: 3
- las 3 observaciones cayeron en `<-5pp`

Deltas iniciales registrados antes de conocer sus resultados:

- `match_id=124878`: `-8.29pp`
- `match_id=127256`: `-24.20pp`
- `match_id=129126`: `-7.02pp`

Las tres filas iniciales fueron sembradas en la tabla canónica conservando exactamente `observed_at` y las probabilidades del primer artefacto. En el momento de congelar `prospective-evaluator-v1`, las tres seguían sin `resultado_real`.

N=3 no permite concluir superioridad o inferioridad del modelo. Estas filas se conservan como comienzo de la cohorte prospectiva y no deben usarse para rediseñar las bandas de esta versión.

## Integridad y límites

`market-calibration-shadow-v1` no debe incluir en la observación prospectiva:

- `resultado_real`;
- ROI;
- EV;
- stake;
- una decisión comercial de publicación;
- una etiqueta de apuesta/recomendación.

`prospective-evaluator-v1` puede leer `resultado_real` únicamente después de que la observación canónica ya existe, y sólo para scoring estadístico. No genera ROI, EV, stake ni modifica decisiones de publicación.

Cualquier cambio metodológico material requiere una nueva versión (`v2`, `v3`, etc.) para preservar la comparabilidad de la cohorte original.
