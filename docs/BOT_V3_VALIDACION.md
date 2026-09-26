# Bot Monitor eSports — integración v3

Estado del 26/09/2026 (afinación final PR #6). Producto: FREE sin cobros por
navegación ni términos; PRO 250 XTR cada 30 días con renovación; partido 50 XTR
sin renovación. Soporte @mitzukyhs; destino https://t.me/monitor_esports_avisos_bot.

## Cambios

- Pack `Monitor_eSports_Pack_Bot_v3.zip` recuperado del chat original.
  Se conservan los originales PUBLICO_TELEGRAM sin rediseñar. Bienvenida,
  PRO, individual y plantilla sustituyen las piezas v2.
- El selector exige juego → período → seis partidos por página → ficha.
  El regreso conserva juego, página y filtro. FREE sólo lee metadatos.
- PRO explica contenido/precio/renovación antes de condiciones. Términos v3
  requieren aceptación y botón Continuar compra; aceptar no crea acceso.
- Confirmación PRO incluye vigencia y botones Ver partidos/Mi estado.
  Individual guarda su recibo y ofrece Abrir análisis, sin activar PRO.
- Horas de 12 horas AM/PM con UTC−4 fijo, incluyendo invierno. En fechas
  concretas, si ET coincide (EDT = UTC−4), el sello muestra `UTC−4 / ET`.
  Nunca se usa «Venezuela» en la interfaz pública del bot.
- Informe PRO exclusivo: probabilidades de ambos equipos; forma hasta 10;
  últimos resultados hasta 5 G/P; H2H; fecha/hora; formato si existe;
  competición sólo si hay dato. Cabecera con Probabilidad · Forma · H2H.
  Sin ranking, mapa/veto, cuotas, ROI, análisis táctico, editorial ni
  frases de «mayor probabilidad» / recomendaciones.
- Forma se consulta por equipo y H2H en consulta separada paginable; no
  truncar antecedentes por el anterior límite de 100 filas combinadas.
- `/muestra` publica un único ejemplo cerrado real: LoL #130485,
  Unicorns Of Love Sexy Edition vs. PCIFIC Esports, 26/09/2026 3:00 PM UTC−4 / ET.
  Usa la misma `informePremium` que los informes autorizados. La imagen del
  pack queda como plantilla de respaldo y no se envía mientras exista el
  snapshot real.
- `/resultados` conserva el historial ya publicado, marcado como pruebas y
  corte estático. Sin imagen agregada ni llamada a comprar. La pieza de
  porcentajes globales no se usa como publicidad comercial.
- INTERNO_OPERADOR (diagramas FREE/PRO) queda en almacenamiento local
  privado, fuera del repo público. No incluir esa carpeta en commits,
  assets enviados o el bundle Edge.

## Validación

504 pruebas JS y 23 con Postgres local, todas correctas (527). Incluyen
recorrido FREE completo, callbacks manipulados, consentimiento sin compra,
PRO recurrente e individual completos con APIs de Telegram simuladas y SQL
real, rechazo comprador/payload/moneda/precio, idempotencia por cargo/update,
reinicio del bot, renovaciones fuera de orden, cancelación, vencimiento,
reembolso repetido y refund anterior al recibo. También permisos del ledger,
respaldo cifrado, recuperación, zona UTC−4/ET, omisión de competición ausente
y ausencia de campos inventados o de recomendación.

Las migraciones existentes no cambian ni se vuelven a aplicar. La RPC
transaccional valida y serializa pagos; sólo successful_payment activa.
Eventos subscription canceled/active/failed actualizan renovación sin
otorgar períodos nuevos. Un pago confirmado nuevo es necesario para extender.
Updates duplicados no extienden el acceso dos veces.

## Producción

Supabase Edge `esport-stars` versión 6, mismo webhook autenticado y secretos.
Cloud alojado, sin proceso ni PC local necesarios. No cambia el plan del
servicio ni se contrata infraestructura. Health correcto, solicitudes sin
secreto 403, JSON inválido 400, update vacío 200, webhook correcto, tipos
message/callback_query/pre_checkout_query/subscription y cero pendientes.

Perfil/comandos y cuatro file_id del pack v3 aplicados al bot comercial,
cargando fotos únicamente al propietario. Se conserva avatar aprobado.
Material interno y canal de pruebas no reciben publicaciones de esta tarea.
Respaldo AES-GCM antes de desplegar, descifrado y verificado localmente.

Navegación real comprobada con la cuenta del propietario: bienvenida con
imágenes v3, selector CS2, elección Mañana, lista de seis con AM/PM, ficha
FREE y regreso a CS2/Mañana. PRO muestra explicación y condiciones;
individual muestra precio 50, pago único y condiciones. Se verifican también
`/muestra` real y `/resultados` identificado como pruebas. No se aceptan
condiciones ni se crean facturas durante esa comprobación. Sin cambios en
órdenes existentes, cero pagos, reembolsos e incidencias. El conteo se
verifica antes y después; no publicar recibos, identificadores de comprador,
secretos ni respaldo descifrado.

Afinación de esta sesión (sin redeploy ni Stars): informe sin lenguaje de
recomendación; sello `UTC−4 / ET` cuando EDT coincide; CTA «Comprar análisis»;
pruebas de competición omitida y campos prohibidos. Receptor en producción
sigue en versión 6 hasta un deploy autorizado con este commit.

## Cierre pendiente con pagos reales

No existe prueba con Stars reales ni entorno TEST oficial configurado.
No se enviaron successful_payment ficticios a producción ni se editaron
accesos para fingir una prueba PRO. Antes de declarar la monetización
verificada de extremo a extremo con Telegram, el dueño debe autorizar y
realizar una compra PRO de 250 y una individual de 50 Stars, en ese orden:

1. Comprar PRO mediante el bot y comprobar recibo, vigencia e informe.
2. Cancelar renovación, comprobar que conserva acceso y autorizar su refund.
3. Ejecutar el reembolso del cargo validado con la herramienta existente;
   comprobar que vuelve a FREE (si no existen otros pagos vigentes).
4. Comprar individual, abrir el informe, comprobar que no activa PRO,
   volver a abrirlo y autorizar su refund; comprobar revocación de ese cargo.

Total a autorizar: 300 Stars en dos compras, luego ambos reembolsos.
Los pagos los confirma el propietario en Telegram; no aceptar condiciones
ni gastar desde automatización sin autorización. No prometer que todo está
cerrado en producción antes de verificar estos recibos reales.

Refund en revisión (sin devolver):
`node --env-file=.env scripts/reembolsar-stars.mjs --cargo=ID_DEL_RECIBO`.
Sólo con autorización del caso, añadir `--confirmar`. Revisar el ledger y
Telegram antes de reintentar un timeout. Mantener receptor y tablas aunque
se desactiven ventas nuevas; las renovaciones requieren cancelación aparte.

Referencias actuales: [Stars y successful_payment](https://core.telegram.org/bots/payments-stars),
[suscripciones](https://core.telegram.org/bots/api#botsubscriptionupdated),
[cancelación](https://core.telegram.org/bots/api#edituserstarsubscription),
[reembolsos](https://core.telegram.org/bots/api#refundstarpayment).
