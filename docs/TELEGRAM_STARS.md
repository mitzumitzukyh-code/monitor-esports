# Telegram Stars — activación de FREE y PRO

Activado el 2026-09-26 por petición del dueño, sobre main `cca7478` y rama
`feat/telegram-stars`. Migración aplicada y receptor HTTPS desplegado en
Supabase; webhook y menú del bot registrados. No se hicieron cobros reales.

## Estado operativo actual

- Bot: [@monitor_esports_avisos_bot](https://t.me/monitor_esports_avisos_bot).
- PRO: 250 Stars cada 30 días, renovación automática. Partido: 50 Stars.
- Soporte: [@mitzukyhs](https://t.me/mitzukyhs).
- Supabase existente: `ysqstdgjmugdlyahkhou`, función `esport-stars`.
- Receptor: `https://ysqstdgjmugdlyahkhou.supabase.co/functions/v1/esport-stars/telegram`.
- `/health` de la misma función confirma `compras_habilitadas: true`.
- Migración registrada: `20260926174331_telegram_stars.sql`. **Ya aplicada**.
- Credencial del bot reutilizada y secreto de webhook generado; credenciales
  Supabase de servidor disponibles en el entorno de la función. No poner
  secretos en documentación ni repositorio.

No depende de mantener encendida la PC. La función usa el plan Free existente;
no se contrató hosting ni se cambió de plan. El webhook tenía cero updates
pendientes y ningún error en la verificación. La prueba de compra completa
en el servidor oficial TEST no se realizó: no hay cuenta/bot TEST configurado.

## Producto disponible

FREE mantiene los avisos, resultados y panel público actuales. PRO abre
informes privados para todos los partidos guardados: probabilidad original,
modelo, rating, incertidumbre RD, forma previa y enfrentamientos en la
muestra. `/partidos` muestra ID próximos; `/analisis ID` abre un informe.
El producto es análisis estadístico, sin promesas de ganancias.

Los datos básicos ya publicados siguen públicos. PRO cobra por la consulta
del informe compuesto en el bot; no convierte el panel o sus datos públicos
en contenido exclusivo. No hay canal PRO ni alertas privadas nuevas en esta
versión. El informe no cambia ni recalcula predicciones.

`/pro`, `/planes`, `/estado`, `/terms`, `/paysupport`, `/cancelar`,
`/comprar ID` y botones funcionan sólo en chat privado. PRO recurrente
es una suscripción de 30 días; opcionalmente puede ser pago único de 30 días.
La compra individual, opcional, abre sólo el partido elegido, sin vencimiento
temporal mientras su predicción permanezca disponible y no se reembolse.
Se conserva el acceso cuando vence PRO. Antes de comprar se exige aceptar
los términos versionados y se muestra el precio.

## Configuración

Copiar `.env.ejemplo` a `.env` en el host del receptor. Los valores van sólo
en el servidor o su gestor de secretos, nunca en el panel público o repo.

| Variable | Uso |
|---|---|
| `SUPABASE_URL` | Proyecto existente del Monitor; base separada para pruebas |
| `SUPABASE_SERVICE_ROLE_KEY` | Credencial existente de servidor; nunca pública |
| `TELEGRAM_BOT_TOKEN` | Bot existente; en TEST, bot creado en el servidor de pruebas |
| `TELEGRAM_STARS_ENABLED` | `false` por defecto; `true` habilita facturas y checkout nuevos |
| `TELEGRAM_PRO_STARS` | Precio entero 1–10000, obligatorio al habilitar; sin precio por defecto |
| `TELEGRAM_MATCH_STARS` | Precio entero 1–10000; vacío deshabilita la compra individual |
| `TELEGRAM_PRO_RECURRING` | `true` por defecto; `false` emite factura única de PRO 30 días |
| `TELEGRAM_PAY_SUPPORT` | Contacto real del vendedor: @usuario, HTTPS o email; obligatorio al habilitar |
| `TELEGRAM_WEBHOOK_SECRET` | Secreto aleatorio de 32–256 caracteres seguros, distinto del bot token |
| `TELEGRAM_WEBHOOK_URL` | URL pública HTTPS que termine exactamente en `/telegram` |
| `TELEGRAM_WEBHOOK_HOST` | `127.0.0.1`; usar `0.0.0.0` si el host/contenedor lo requiere |
| `TELEGRAM_WEBHOOK_PORT` | Puerto interno Node, `8787` por defecto |
| `TELEGRAM_TEST_ENV` | `false`; `true` dirige todas las llamadas a `/bot<TOKEN>/test/METHOD` |
| `TELEGRAM_CHAT_ID` | Sólo avisos FREE del cron actual; no es necesario para compras privadas |

Precios de lanzamiento elegidos: PRO `250` y partido `50`.
Para cambiarlos en el alojamiento actual: editar `TELEGRAM_PRO_STARS` y
`TELEGRAM_MATCH_STARS` en Dashboard → Edge Functions → Secrets del proyecto.
Los secretos actualizados se aplican a las invocaciones nuevas; comprobar
`/planes`. Con Node, editar env y reiniciar el proceso. Las órdenes
ya emitidas conservan su precio guardado; las facturas iniciales pendientes
vencen a los 30 min. Suscripciones existentes conservan el precio original:
no se puede cambiar su importe editando una variable ni cobrar diferencia
silenciosamente. El precio nuevo se aplica a compras/suscripciones nuevas.

## Preparación y activación

1. Ejecutar pruebas locales con Node 22+:
   ```sh
   npm ci --ignore-scripts
   npm test
   npm run test:stars-db
   ```
   PGlite es dependencia sólo de desarrollo; producción usa Node y fetch.
2. Aplicar **sólo al entorno elegido** la migración
   `supabase/migrations/20260926174331_telegram_stars.sql` usando SQL Editor
   o el proceso de migraciones del proyecto. Es una migración nueva; no
   repetirla manualmente sobre tablas ya creadas. Antes, respaldar la base.
   La RPC y las cinco tablas tienen permisos sólo de servidor y RLS.
3. Completar variables y revisar términos/contacto. Mantener compras apagadas
   durante la preparación. Para generar el secreto localmente:
   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```
4. En Supabase Edge, desplegar la función desde
   `supabase/functions/esport-stars/index.mjs`. El comando
   `node scripts/empaquetar-stars-edge.mjs` genera el objeto JSON de archivos
   para `deploy_edge_function`, conservando los imports relativos. No sube
   secretos. Establecer `verify_jwt=false` sólo porque el receptor implementa
   autenticación propia mediante el secreto enviado por Telegram. Una llamada
   POST sin ese secreto devuelve 403. `/health` no revela datos privados.
   Guardar variables Telegram en Edge Functions → Secrets; `SUPABASE_URL` y
   `SUPABASE_SERVICE_ROLE_KEY` ya están disponibles en el servidor.

   Alternativa Node: mantener un proceso continuo con supervisor y reinicio:
   ```sh
   node --env-file=.env salida/stars/webhook.mjs
   ```
   Configurar el host/proxy HTTPS para reenviar `/telegram` al puerto interno
   y conservar `X-Telegram-Bot-Api-Secret-Token`. `/health` indica que el
   proceso está vivo, no que la base/API esté disponible. GitHub Actions
   conserva el cron FREE, pero no puede recibir checkout continuo: el plazo
   de Telegram es 10 s. Hace falta este receptor accesible permanentemente;
   la función Edge ya cubre este requisito.
5. Comprobar configuración sin modificar Telegram:
   ```sh
   node --env-file=.env scripts/configurar-stars.mjs
   ```
6. Con receptor disponible, registrar webhook y menú explícitamente:
   ```sh
   node --env-file=.env scripts/configurar-stars.mjs --activar-webhook
   ```
   Si ya existe otro receptor, el script lo detecta y exige la opción
   `--reemplazar-webhook` tras revisarlo. No descarta updates pendientes.
   No ejecutar junto a un consumidor de `getUpdates`: Telegram admite una
   sola modalidad de recepción. Los avisos `sendMessage` del cron continúan.
7. Se recomienda recorrer también el flujo en TEST. Una vez configurado el
   entorno elegido, poner `TELEGRAM_STARS_ENABLED=true` y reiniciar el receptor.
   No hace falta un payment provider token para Stars. En Supabase Edge basta
   actualizar el secreto ENABLED; confirmar el estado en `/health`.

Para detener ventas nuevas, poner ENABLED=false (en Edge actualizar el secreto;
en Node reiniciar). **Conservar el
receptor y la base**: seguirá procesando recibos de pagos ya realizados,
renovaciones y refunds. Esto no cancela suscripciones existentes; usar
`/cancelar` o `editUserStarSubscription` según corresponda.

## Flujo y seguridad

1. El ID del comprador viene de `from.id` del update autenticado, nunca de
   un comando/parámetro enviado por el usuario. Se guarda consentimiento.
2. Se crea una orden persistida con payload aleatorio opaco, comprador,
   producto/partido, precio, recurrencia y vencimiento. No hay premium aún.
3. Se usa `createInvoiceLink` con `subscription_period=2592000` para PRO
   recurrente, o `sendInvoice` para pagos únicos. Moneda XTR, provider vacío
   y una sola línea de precio. Fallos al enviar invalidan checkout de la orden.
4. `pre_checkout_query` compara usuario, payload, XTR, importe, consentimiento,
   vencimiento y acceso previo en servidor. Se responde dentro de 10 s; una
   base caída rechaza la compra. Un checkout aprobado no activa acceso.
5. Únicamente `successful_payment` validado registra cargo Telegram, cargo
   provider (puede ser vacío), update_id, fechas y acceso en la misma
   transacción. Se comprueban orden, precio y campos de recurrencia.
6. Cargo e update son únicos; bloqueo transaccional por usuario serializa
   reintentos. El mismo cargo recibido con otro update no prolonga acceso.
   Cada renovación guarda su cargo y la expiración suministrada por Telegram;
   updates atrasados no acortan el período más reciente. Una renovación
   anterior al recibo inicial devuelve error transitorio para reintentarse.
7. `/analisis ID` autoriza contra la base antes de leer/generar el informe.
   PRO requiere expiración posterior a `now()` de Postgres; el partido sólo
   requiere su compra no reembolsada. Los informes se envían con protección
   de contenido, sin links públicos al informe. No hay caché premium ni cron
   necesario para que la expiración cierre el acceso.

Las tablas `eslo_stars_usuarios`, `ordenes`, `pagos`, `reembolsos` e
`incidencias` están bajo prefijo `eslo_stars_`. La RPC `eslo_stars` es
SECURITY INVOKER y sólo service_role puede ejecutarla. No se modifican
políticas ni predicciones del motor. No registrar tokens ni cuerpos de updates.

## Renovación, soporte y reembolsos

Telegram admite hoy sólo períodos de suscripción de 30 días y hasta 10000
Stars por período. `/cancelar` usa el cargo inicial para cancelar la extensión
con `editUserStarSubscription`, conservando el período pagado. El usuario
también puede gestionarla en Telegram. El nuevo update `subscription`
(`BotSubscriptionUpdated`) comunica `canceled`, `active` y `failed`; se
persisten vinculados al comprador/payload. No otorgan días ni eliminan el
período ya pagado. `/estado` muestra vigencia y el último estado recibido.
El registro del webhook solicita estos eventos expresamente.

No se acumulan días al repetir un recibo ni al recibir dos expiraciones;
se conserva la mayor expiración válida. Telegram admite suscripciones
simultáneas; se evita abrir otra PRO mientras hay acceso o factura PRO
pendiente. Reactivar una suscripción antigua desde Telegram puede coexistir
con una nueva: registrar todos los cargos y revisar/cancelar duplicados en
soporte. Una nueva compra no cambia ni cancela otras por sí sola.

`/paysupport` y `/support` muestran el contacto del vendedor. El operador
revisa el recibo y, cuando proceda, realiza `refundStarPayment` con el
user_id y telegram_payment_charge_id guardados; no se ofrece reembolso
automático desde un botón del usuario. `refunded_payment` revoca sólo la
compra reembolsada, de forma idempotente. Incluso si llega antes del recibo
original se conserva un registro que evita activarlo posteriormente.

Fallos de base/transporte devuelven HTTP 500 para reintento de Telegram.
Recibos que no coinciden con una orden se guardan como incidencia y requieren
revisión del operador, sin activar acceso. Si falla la confirmación de chat
después de registrar el pago, `/estado` y `/analisis ID` recuperan el acceso.
Revisar incidencias, errores del receptor y `getWebhookInfo`; mantener
backups y reconciliar recibos ante una caída prolongada, porque Telegram
no reintenta indefinidamente. `getStarTransactions` permite contrastar
cargos; no hay job automático de conciliación en esta primera versión.

## Pruebas sin cobros

Presentación y menú del pack aprobado: ver `PACK_TELEGRAM.md`. Se reutilizan
los secretos y precios de esta configuración. La navegación pública no
altera consentimientos, compras ni acceso premium.

`pruebas/stars-bot.test.mjs` verifica facturas, consentimiento, acceso,
checkout, API TEST y autenticación del webhook. `scripts/pruebas-stars-db.mjs`
ejecuta la migración y RPC reales en Postgres local, incluyendo flujo completo
del bot, duplicados, expiración, renovación y refunds. PGlite ejecuta un solo
proceso; las peticiones concurrentes se serializan allí. El bloqueo asesor y
las restricciones del SQL protegen también procesos independientes en
Postgres; la concurrencia distribuida debe verificarse en staging si se escala.
`pruebas/stars-receptor.test.mjs` cubre el adaptador Edge: autorización,
límite de cuerpo, JSON inválido, health y reintentos. CI ejecuta todas estas
pruebas sin secretos reales ni contacto con Telegram/Supabase remoto.

Verificación remota sin compras: `/health` 200 con compras habilitadas,
webhook sin secreto 403, JSON mal formado 400 y update vacío 200. Se comprobó
el menú de Telegram y la URL de webhook registrada sin errores ni pendientes.

Para la prueba oficial, crear cuenta/bot en el servidor TEST de Telegram y
usar una base Supabase separada con las tablas base y esta migración. Un
segundo bot en el servidor normal **no** vuelve ficticios los cobros Stars.
Usar TEST_ENV=true y su token propio, registrar el receptor y recorrer:
FREE → términos → factura → checkout → recibo → estado → informe → cancelación.
No había credenciales de ese entorno en el repo, por lo que la verificación
real con Telegram queda pendiente de configuración.

## Documentación oficial verificada

- [Stars para servicios digitales, checkout, términos y soporte](https://core.telegram.org/bots/payments-stars)
- [createInvoiceLink y período/precio de suscripción](https://core.telegram.org/bots/api#createinvoicelink)
- [SuccessfulPayment y expiración](https://core.telegram.org/bots/api#successfulpayment)
- [Cancelación de suscripción](https://core.telegram.org/bots/api#edituserstarsubscription)
- [Estados de suscripción actuales](https://core.telegram.org/bots/api#botsubscriptionupdated)
- [Refunds](https://core.telegram.org/bots/api#refundstarpayment)
- [Autenticación de webhook](https://core.telegram.org/bots/api#setwebhook)
- [Entorno TEST separado](https://core.telegram.org/bots/features#dedicated-test-environment)
- [Supabase: permisos y RLS](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase: secretos de Edge Functions](https://supabase.com/docs/guides/functions/secrets)
- [Supabase: autenticación propia de webhooks](https://supabase.com/docs/guides/functions/auth)
