# Operación de Telegram Stars

Soporte: @mitzukyhs. No se hicieron cobros ni reembolsos reales al preparar esto.

Estado al 2026-09-26: programación activa en main. [Primera ejecución](https://github.com/mitzumitzukyh-code/monitor-esports/actions/runs/36262152987)
correcta: vigilancia y copia cifrada subida. Se descargó el artifact y se
descifró/validó con la clave privada, sin modificar producción. 494 pruebas
automatizadas correctas. Una compra completa en el entorno TEST oficial de
Telegram sigue pendiente de disponer de cuenta/bot/base separados.

## Vigilancia

El workflow `Operación Telegram Stars` revisa a los minutos 13, 33 y 53 de
cada hora: health HTTPS, bloqueo sin secreto (403), URL/errores del webhook,
base de compras y nuevas incidencias. Va al Discord privado de errores ya
existente, sin IDs ni recibos. Deduplica caídas y avisa recuperación. Si
el envío falla, no lo marca como notificado. Un cache perdido puede repetir
el aviso. GitHub cron puede retrasarse o saltarse ejecuciones: no es SLA.

```sh
node --env-file=.env scripts/vigilar-stars.mjs
node --env-file=.env scripts/vigilar-stars.mjs --probar-alerta
```
Se verificó la salud real y se envió un aviso rotulado como prueba. Las
caídas/deduplicación se prueban con mocks; no se provocó caída en producción.

## Respaldo y recuperación

Supabase Free recomienda exportar y conservar copias fuera del proyecto.
La migración operativa `20260926181029` está aplicada. La RPC de snapshot
lee en una consulta las cinco tablas Stars y predicciones referenciadas por
compras de partido. Sólo service_role puede ejecutarla. No es una copia
completa del motor, esquema base ni proyecto. No contiene credenciales.

La copia diaria se programa a las 04:17 UTC (00:17 Venezuela), se comprueba
y cifra con AES-256-GCM. Sólo el archivo cifrado va a un artifact de GitHub
con retención de 30 días. El repo es público: cifrar es obligatorio. La clave
`TELEGRAM_STARS_BACKUP_KEY` está en GitHub Secrets y `.env` ignorado. Guardar
una copia offline separada del archivo cifrado. No subirla a repo/artifacts.

```sh
node --env-file=.env scripts/respaldar-stars.mjs --archivo=work/copia.enc.json
node --env-file=.env scripts/respaldar-stars.mjs --verificar --archivo=work/copia.enc.json
```
Ya existe un respaldo inicial cifrado, descifrado y verificado fuera del repo.
También se probó restaurar un pago ficticio en Postgres local y conservar su
acceso. Los archivos no se sobrescriben. Si falla la copia o su upload, el
workflow intenta avisar al canal de errores. Revisar artifact y ejecución
cada día; el cron best-effort puede fallar. Una copia diaria puede perder
hasta un día de datos, o más si hubo fallos.

Recuperar: pausar ventas nuevas, mantener receptor de recibos, descargar
la copia elegida y crear una base vacía con el esquema base y migraciones
Stars. Preparar SQL privado, sin ejecutarlo automáticamente:
```sh
node --env-file=.env scripts/respaldar-stars.mjs --preparar-restauracion --archivo=work/copia.enc.json --salida=work/recuperacion-privada.sql
```
Contiene datos personales. Revisar y ejecutar sólo en la base vacía escogida,
nunca sobre producción poblada. Conflictos revierten la transacción. Comparar
pagos posteriores al snapshot con Telegram antes de habilitar ventas. Si el
negocio crece, revisar frecuencia, retención y copia independiente adicional.

## Procedimiento de soporte

1. Pedir recibo y explicación del problema; nunca contraseña, token, códigos
   de acceso o tarjeta. Revisar comprador/cargo/producto/importe/fechas/refund
   en las tablas privadas, sin confiar sólo en una captura.
2. Si falta acceso, revisar incidencias y cola del webhook. Conciliar el pago
   original con RPC idempotente; no inventar recibos ni alterar el motor.
   El comprador comprueba `/estado` y `/analisis ID`.
3. Para cobro duplicado o entrega fallida, revisar el caso y decidir si procede
   devolver Stars. Un pronóstico fallido no equivale a fallo de entrega.
4. Revisar el recibo sin devolver dinero:
   ```sh
   node --env-file=.env scripts/reembolsar-stars.mjs --cargo=ID_DEL_RECIBO
   ```
   Sólo después de decidir y autorizar ese caso, el operador ejecuta el mismo
   comando con `--confirmar`. Comprador y cargo salen del ledger. Requiere
   confirmación de Telegram y concilia acceso en la base. No reintentar un
   timeout a ciegas: contrastar transacciones antes. Si Telegram confirmó y
   falta conciliación, revisar update de refund pendiente.
5. Informar la resolución y registrar el caso en privado. `/cancelar` frena
   renovación, conserva el período pagado y no devuelve dinero por sí solo.
   Telegram no resuelve disputas de compras del bot.

Respuesta sugerida: “Gracias. Envíame el recibo de Telegram y qué ocurrió al
abrir /estado o /analisis. Revisaré el pago y el acceso. No necesito
contraseñas ni códigos.”

## Fuentes oficiales

- [Telegram: soporte y estabilidad](https://core.telegram.org/bots/payments-stars#live-checklist)
- [Telegram: refundStarPayment](https://core.telegram.org/bots/api#refundstarpayment)
- [Supabase: copias en Free](https://supabase.com/docs/guides/platform/backups)
- [GitHub: limitaciones de cron](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
