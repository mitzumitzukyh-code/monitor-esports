# Pack aprobado de Monitor eSports

> Estado vigente: pack Bot v3, afinación PR #6 el 26/09/2026.
> Receptor desplegado: `esport-stars` versión 6. Detalle en
> `BOT_V3_VALIDACION.md` (527 pruebas: 504 JS + 23 Postgres).
> Se cargan cuatro imágenes públicas (bienvenida, PRO, individual, plantilla).
> `/muestra` usa un ejemplo real cerrado con el mismo informe PRO.
> `/resultados` es texto identificado como historial de pruebas, sin imagen
> agregada ni CTA de compra. Diagramas del operador permanecen fuera del
> repositorio público y nunca se envían al cliente.

Implementado el 26/09/2026 en **@monitor_esports_avisos_bot**. Se mantiene
el canal @monitor_esports_avisos para pruebas; este documento no autoriza
publicaciones allí. No se incluyen enlaces a una web propia.

## Archivos aplicados

Origen: `Monitor_eSports_Pack_Final_AntiIA_v2.zip`, proporcionado por el dueño.
Se conservan las imágenes originales. `avatar.jpg` es la conversión del
avatar a JPEG necesaria para `setMyProfilePhoto`.

| Archivo del repo | Original del pack | Uso |
|---|---|---|
| assets/telegram/avatar.png | 01_avatar_1024x1024.png | Avatar del perfil (vía avatar.jpg) |
| assets/telegram/bienvenida.png | 06_bienvenida_1600x900_v2.png | /start y menú principal |
| assets/telegram/pro.png | 08_pro_1080x1080.png | Planes y condiciones de PRO |
| assets/telegram/individual.png | 10_analisis_individual_1080x1080_v2.png | Elegir partido y acceso bloqueado |
| assets/telegram/muestra.png | 11_ejemplo_informe_1080x1350.png | Ejemplo identificado como plantilla |
| assets/telegram/resultados-v2.png | Edición de 12_resultados_1080x1350.png solicitada por el dueño | Historial con cierre comercial; cifras intactas |

Los controles impresos en las imágenes son decorativos. Debajo hay botones
reales de Telegram: planes, partidos, estado, ayuda, muestra e historial.
Se registra un menú de 11 comandos, por defecto y en español. Los informes
PRO y de compra individual siguen protegidos y autorizados antes de leerse.
Las fotos públicas no activan premium, aceptan condiciones ni crean compras.

`/partidos` abre CS2, Dota 2, LoL y Valorant. Cada juego tiene Hoy, Mañana y
Próximos; se consulta en servidor, se ordena por fecha/ID y se muestran seis
encuentros por página. Los botones Anterior/Siguiente conservan juego y
período. Horario indicado como UTC−4, sin país del propietario. `/partidos cs2`
(o el identificador de otro juego) abre directamente esa selección.

Al pulsar un encuentro, FREE recibe una ficha pública de equipos, horario,
formato y precios, con opciones PRO/individual. Esa ficha usa una proyección
limitada, sin probabilidades, ratings ni historial. PRO o compra individual
válida abren directamente el informe protegido con las probabilidades
guardadas, forma de hasta 10 series, últimas G/P y enfrentamientos previos.
El regreso conserva la selección. No se crea una orden sólo por navegar.

## Reaplicar el pack

Desde la raíz del repo, con las credenciales existentes en `.env` ignorado:

```sh
# Sólo verifica identidad, conversación privada y precios; no modifica Telegram.
node --env-file=.env scripts/configurar-marca-telegram.mjs --chat=8877563294

# Aplica perfil/comandos y carga cinco fotos sólo al propietario, sin cobros.
node --env-file=.env scripts/configurar-marca-telegram.mjs --chat=8877563294 --aplicar
```

El script exige que las credenciales correspondan al bot comercial y el chat
sea el del propietario/soporte @mitzukyhs. Rechaza otros bots, grupos y
precios que no coincidan con el pack aprobado. Guarda un respaldo del perfil
en `work/marca-antes-*.json` y el avance de fotos en `work/marca-carga.json`.
Cada ejecución de aplicación envía cinco fotos nuevas; ante un fallo parcial,
recuperar los file_id ya guardados y completar sólo lo que falta.

Telegram devuelve file_id reutilizables para **este bot**. Se guardan en
`salida/stars/marca.mjs`, junto al precio/renovación que representa la imagen.
Después de aplicar, guardar ese módulo en el repo y desplegar de nuevo el
receptor para que use las fotos cargadas:

```sh
node scripts/empaquetar-stars-edge.mjs > work/pack-edge.json
```

Desplegar el JSON resultante con `deploy_edge_function`, nombre `esport-stars`,
proyecto `ysqstdgjmugdlyahkhou`, entrypoint `index.mjs`. Conservar
`verify_jwt=false`: el receptor valida su propio secreto de Telegram antes
de procesar cualquier update. No mostrar el token ni cambiar el webhook.
El runtime Node usa el mismo módulo y las mismas reglas de presentación.

## Precios y actualización del contenido

Se reutilizan `TELEGRAM_PRO_STARS=250`, `TELEGRAM_MATCH_STARS=50`,
`TELEGRAM_PRO_RECURRING=true` y `TELEGRAM_PAY_SUPPORT=@mitzukyhs`.
Los demás secretos y variables no cambian; ver `TELEGRAM_STARS.md`.

Si cambian precios o renovación, el bot deja de mostrar las piezas PRO e
individual antiguas y muestra el precio correcto en texto. Para volver a
usar imágenes, preparar nuevas piezas aprobadas, ajustar los valores de
validación del script, actualizar también la descripción del perfil y
reaplicar/desplegar. Nunca cambiar los datos de `marca.mjs` para aparentar
que una imagen antigua contiene los precios nuevos.

`/muestra` indica que el ejemplo tiene campos pendientes y no es un resultado
confirmado. No se presenta como un informe premium completo disponible.
`/resultados` corresponde a 27/08–25/09/2026, UTC−4: 1.896 evaluados,
166 pendientes excluidos, ganador registrado y predicción previa al inicio
programado. Es un corte estático. Al refrescarlo, actualizar imagen y texto
juntos con estadísticas verificadas, período y criterio de exclusión.
Para reproducir el cálculo ver `ESCAPARATE_TELEGRAM.md`.
Por petición del dueño, texto e imagen cierran con una invitación a explorar
partidos; se retiró la frase sobre resultados futuros del escaparate. Las
condiciones de compra mantienen su información previa al pago. El original
`resultados.png` se conserva como respaldo visual y no se usa en nuevos envíos.

## Verificación y recuperación

515 pruebas correctas: 494 JS y 21 de SQL real local. La navegación real
se comprobó contra el receptor desplegado, sólo con la cuenta del dueño;
no se aceptaron términos, generaron facturas ni gastaron Stars. Las órdenes,
pagos, reembolsos, incidencias y acceso conservaron su estado anterior.
La lógica de predicción, renovación y activación de pagos no fue modificada.

Si Telegram rechaza un file_id, se mantiene el texto y sus botones para
conservar la navegación. Revisar que pertenezca al mismo bot y recargar sólo
el material necesario. Ante un problema de despliegue, restaurar las fuentes
anteriores del receptor y el perfil respaldado; conservar base/ledger/secreto.
No eliminar recibos ni recrear migraciones para recuperar una imagen.

Referencias oficiales verificadas:
[foto de perfil](https://core.telegram.org/bots/api#setmyprofilephoto),
[imágenes y file_id](https://core.telegram.org/bots/api#sendphoto),
[comandos](https://core.telegram.org/bots/api#setmycommands).
