# Escaparate de Monitor eSports

Se reutilizó el rayo rojo/blanco de los SVG del repo, exportado a avatar
PNG 1024 y portada 1600×900. Bienvenida: FREE/PRO, precios configurados
250/50, renovación/cancelación, soporte y enlace al bot.

Muestra pública autorizada: **un único partido terminado**, #130728, CS2,
The Last Resort–Famalicão. El favorito tenía 73% y perdió. Muestra rating,
RD y forma del informe real, sin abrir los demás informes premium. Su forma
usa partidos anteriores al inicio, pero resultados disponibles al preparar
la muestra; no se presenta como snapshot completo de aquel momento.

Período: 27/08/2026 00:00–26/09/2026 00:00 Venezuela (fin exclusivo).

| Juego | Aciertos / evaluados | Acierto | Pendientes | Brier binario |
|---|---:|---:|---:|---:|
| CS2 | 755 / 1.289 | 58,6% | 141 | 0,2434 |
| Dota 2 | 122 / 190 | 64,2% | 16 | 0,2371 |
| LoL | 204 / 296 | 68,9% | 8 | 0,2087 |
| Valorant | 63 / 121 | 52,1% | 1 | 0,2554 |

Total: 1.896 evaluados, 1.144 aciertos, 752 fallos, 166 pendientes, cero
excluidos. Todas las predicciones guardadas del período, con ganador y
probabilidad válidos y creada_en < inicio_programado. Esto verifica el
inicio programado, no demuestra independientemente la hora real de inicio.
Un partido cuenta una vez; 50/50 favorece A como en el monitor. Pendientes
no cuentan como aciertos/fallos. No hubo selección de sólo ganados.

Se reutiliza calcularMetricas sobre probabilidades guardadas. Dota usa aquí
eslo_predicciones/Glicko-2 binario; no se mezcla con las predicciones antiguas
con empate y otra escala de Brier. Valorant no supera la referencia 0,25;
el post lo aclara. Aciertos no son rentabilidad ni garantía futura.

Reproducir materiales (no publica):
```sh
node --env-file=.env scripts/preparar-escaparate.mjs --desde=2026-08-27 --hasta=2026-09-26 --ejemplo=130728 --salida=work/escaparate
```
El JSON contiene sólo estadísticas y la muestra autorizada, sin compradores.
Refrescar los textos y precios de la imagen cuando cambie la configuración.

El dueño eligió público. Canal existente configurado desde su cuenta
administradora: https://t.me/monitor_esports_avisos. Avatar y descripción
aplicados; portada, bienvenida fijada, muestra e historial publicados.
Posts: portada 1277, bienvenida 1278, muestra 1280 e historial 1281.
El bot conserva sus permisos y el chat_id numérico; no se creó otro canal.
El acceso PRO sigue validándose en privado dentro del bot. Entrar al canal
no activa premium ni cobra Stars.
