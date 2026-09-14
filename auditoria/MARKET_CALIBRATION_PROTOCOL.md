# Market Calibration Shadow v1 — protocolo prospectivo

Estado: **congelado para observación prospectiva**  
Versión: `market-calibration-shadow-v1`  
Gate fuente: `quality-gate-v1`  
Inicio del experimento: `2026-09-14T14:46:33Z`

## Objetivo

Comprobar si la diferencia entre la probabilidad del modelo y la probabilidad implícita del mercado sin margen (`model_market_delta_pp`) contiene señal prospectiva útil para **calibrar y evaluar el modelo**.

Este experimento es observacional. No modifica Telegram, Discord, `quality-gate-v1`, las predicciones almacenadas ni la lógica de publicación.

## Población

Sólo se observa un partido cuando:

1. existe un registro `quality-gate-v1` con `decision=pass`;
2. el partido aún no ha comenzado;
3. la predicción sigue sin resultado en el momento de la observación;
4. existe un snapshot de cuotas válido y previo al inicio;
5. los `team_id` de la cuota son exactamente los mismos de la predicción, aunque el orden A/B esté invertido.

Los equipos ajenos nunca se remapean por nombre ni por heurística.

## Observación canónica

Cada ejecución de GitHub Actions produce un artefacto inmutable.

Para cada `match_id`, la observación canónica es **la primera observación cronológica con `status=ok`** encontrada entre los artefactos de esta versión.

Una observación posterior nunca reemplaza la canónica, aunque la cuota posterior parezca más informativa.

## Precio y de-vig

La probabilidad de mercado se calcula con `coeff_a` y `coeff_b` pertenecientes al mismo snapshot/proveedor:

- `raw_a = 1 / odds_a`
- `raw_b = 1 / odds_b`
- `devig_a = raw_a / (raw_a + raw_b)`
- `devig_b = raw_b / (raw_a + raw_b)`
- `overround = raw_a + raw_b - 1`

`max_coeff_a` y `max_coeff_b` se conservan únicamente como dato auxiliar. No se mezclan para construir la probabilidad de mercado porque pueden proceder de precios incompatibles entre sí.

## Delta

Para el lado elegido por el modelo:

`model_market_delta_pp = (P_modelo - P_mercado_devig) * 100`

Las bandas quedan congeladas antes de evaluar resultados:

- `<-5pp`
- `-5..-2pp`
- `-2..0pp`
- `0..2pp`
- `2..5pp`
- `5..8pp`
- `8pp+`

Las bandas son etiquetas descriptivas. No son reglas de PASS/REJECT.

## Métricas prospectivas predefinidas

Cuando existan resultados, la evaluación de esta versión se hará sin cambiar los cortes anteriores y reportará como mínimo:

- N total y N por banda;
- Brier del modelo;
- Brier de la probabilidad de mercado de-vig;
- diferencia de Brier modelo menos mercado;
- accuracy del lado favorito del modelo;
- calibración observada por banda de probabilidad;
- estabilidad por fecha/cohorte;
- cobertura y número de observaciones descartadas por ausencia o invalidez de cuota.

La comparación principal será **modelo vs mercado de-vig en observaciones prospectivas**, no el ajuste retrospectivo de una regla que maximice resultados pasados.

## Hitos de lectura

Se permiten cortes descriptivos en:

- N=30 observaciones canónicas: control de integridad, no decisión de producto;
- N=50: primera lectura exploratoria;
- N=100: primera lectura con peso operativo razonable;
- posteriormente, cada +100 observaciones o por ventanas temporales predefinidas.

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

N=3 no permite concluir superioridad o inferioridad del modelo. Estas filas se conservan como comienzo de la cohorte prospectiva y no deben usarse para rediseñar las bandas de esta versión.

## Integridad

`market-calibration-shadow-v1` no debe incluir en la observación prospectiva:

- `resultado_real`;
- ROI;
- EV;
- stake;
- una decisión comercial de publicación;
- una etiqueta de apuesta/recomendación.

Cualquier cambio metodológico material requiere una nueva versión (`v2`, `v3`, etc.) para preservar la comparabilidad de la cohorte original.
