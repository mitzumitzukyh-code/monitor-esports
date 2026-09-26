# Handoff — monetización Telegram, 2026-09-26

Solicitud explícita del dueño: preparar monetización FREE/PRO con Stars
sin cambiar el motor. Repo correcto: `mitzumitzukyh-code/monitor-esports`.
Base de trabajo: `cca7478`, rama `feat/telegram-stars`. La copia antigua
`D:\monitor-dota2` tenía cambios propios: se preservó sin modificaciones.
No se encontró un knowledge graph o handoff vigente en este repo; este
documento deja el estado para la siguiente sesión.

Implementado: receptores Supabase Edge y Node autenticados, consentimientos, facturas PRO
recurrentes o únicas, pago individual, ledger de cargos, acceso privado,
renovaciones, eventos actuales de suscripción, cancelación, expiración y
registro de refunds/incidencias.
Reutiliza Supabase/PostgREST y módulos ES; no toca motor, juez, predicciones
ni avisos FREE. Precios obligatorios por env, compras apagadas por defecto.

Verificación: 445 pruebas existentes + 17 del bot + 4 del receptor Edge + 7
de operación + 21 de migración/RPC en Postgres local (494 en total). CI de PR incluye pruebas
sin credenciales reales. Instrucciones y límites en `TELEGRAM_STARS.md`.

El dueño pidió activar y reutilizar las credenciales existentes. Se aplicó
la migración en `ysqstdgjmugdlyahkhou` con versión remota `20260926174331`;
el nombre local coincide para evitar reintentos duplicados. Se desplegó la
función `esport-stars` con autenticación propia (verify_jwt=false) y se
registraron webhook y comandos en @monitor_esports_avisos_bot. Secretos
guardados en Supabase Edge; `.env` local ignorado por Git. Precios recomendados
y configurados: PRO 250 Stars cada 30 días, partido 50. El dueño proporcionó
@mitzukyhs para soporte. `TELEGRAM_STARS_ENABLED=true`, TEST_ENV=false.
No se contrató otro servicio ni se modificó el plan Free de Supabase.

Preparación de escaparate y operación (2026-09-26): avatar/portada con la
marca existente; bienvenida, muestra PRO de un partido terminado e historial
real de 1.896 evaluados en 30 días completos. El dueño eligió público y se
configuró el canal existente como @monitor_esports_avisos desde su cuenta
administradora. Avatar/descripcion aplicados; portada 1277, bienvenida 1278
fijada, muestra 1280 e historial 1281 publicados. Se verificaron el perfil
con enlace público y la bienvenida fijada, con captura local. No se ampliaron
permisos del bot ni se cambió el chat_id. Ver `ESCAPARATE_TELEGRAM.md`.

Migración `20260926181029` aplicada: RPC de snapshot/diagnóstico sólo servidor.
Respaldo inicial AES-GCM verificado y prueba de recuperación en Postgres local.
Clave en GitHub Secrets y `.env` privado; copia offline local preparada.
Vigilancia contra receptor/webhook/base correcta; aviso de prueba recibido
por Discord de errores existente. Workflow independiente preparado para
revisión cada 20 min y copia diaria 04:17 UTC, retención 30 días; cron de GitHub
best-effort. Programación incorporada a main. Primera ejecución manual
36262152987 correcta: vigilancia y upload de copia cifrada; el artifact
descargado también se descifró y validó localmente, sin escribir en producción.
Su estado y los artifacts están en Actions → Operación Telegram Stars.
Procedimiento y CLI de revisión de reembolsos en `OPERACION_TELEGRAM_STARS.md`.
No se realizaron reembolsos reales; --confirmar es decisión del operador.

Verificación remota: health confirma ventas habilitadas; auth fallida 403,
JSON inválido 400, update vacío autenticado 200. Webhook sin errores y cero
pendientes. Cinco tablas con RLS y sin SELECT para anon/authenticated; sólo
service_role ejecuta RPC. El aviso INFO de RLS sin políticas es intencional:
son tablas exclusivamente de servidor. Las advertencias sobre otras funciones
ya existían antes y quedan fuera de este cambio.

No se hicieron compras, cobros, mensajes de prueba a compradores ni prueba
en servidor TEST de Telegram (no hay credenciales). El flujo se probó con
facturas/updates simulados y SQL real local. Para TEST usar cuenta/bot/base
separados. No asumir que ENABLED=false detiene renovaciones existentes.

PR #3: https://github.com/mitzumitzukyh-code/monitor-esports/pull/3 fusionada
el 2026-09-26, commit 74ae8ce, tras CI correcta (494 pruebas). Monetización
y operación están en main; el receptor conserva el código ya desplegado.
El motor/juez no tienen diferencias respecto de la base de esta tarea.
Para frenar ventas nuevas, actualizar ENABLED=false en Secrets
y conservar receptor/base. No aplicar de nuevo la migración.

Los informes PRO son privados en el bot; los datos básicos existentes
continúan públicos. No incluir informes PRO en el generador estático o
canal FREE. Todo cambio del cálculo sigue sujeto a los invariantes y
backtests existentes, fuera del alcance de esta implementación.

Corrección posterior del dueño y kit de marca (2026-09-26): el espacio que
ya recibe partidos del motor es para PRUEBAS. Todo lo comercial debe dirigir
al bot @monitor_esports_avisos_bot. Esta instrucción tiene precedencia sobre
la elección de escaparate descrita arriba: no seguir publicando ventas en
el canal @monitor_esports_avisos ni asumir que existe otro canal comercial.
La separación visual preparada es BOT oscuro/lima y LAB claro/tinta. Los
posts comerciales anteriores 1277/1278/1280/1281 y perfil del canal aún deben
revisarse con esta corrección; no se borraron ni modificaron en esta entrega.

Kit nuevo creado: logo ME vectorial original, firmas, avatares BOT/LAB,
bienvenida, planes 250/50, publicidad cuadrada y vertical, muestra cerrada,
historial con metodología, soporte @mitzukyhs y guía de marca. Sin enlace a
web propia, porque el dueño aún no tiene dominio. Editables de Figma:
https://www.figma.com/design/RAYavU24Cv2Pmip1XWsA0Z . Exportaciones locales:
outputs/Monitor-eSports-Brand en la carpeta del chat; instrucciones y textos
en LEEME.md y Textos-para-publicar.md. Los materiales están preparados, aún
no aplicados a Telegram. La cuenta Starter agotó el límite de exportación
MCP; se completaron PNG/SVG localmente manteniendo la identidad y tipografías.
No se cambió motor, pagos, webhook, destinos automáticos ni configuración
de producción. Esta actualización del handoff permanece local, sin push.

## Estado vigente: pack aprobado aplicado, 2026-09-26

El dueño sustituyó el kit provisional por
`Monitor_eSports_Pack_Final_AntiIA_v2.zip` y pidió implementarlo. Se usan
los originales rojos/negros/crema, sin rediseño ni variantes BOT/LAB para
clientes. Destino comercial verificado: @monitor_esports_avisos_bot,
ID 8904052961. Canal de pruebas @monitor_esports_avisos/-1004373776020
sin nuevas publicaciones ni cambios de permisos/destino en esta entrega.
Los posts comerciales antiguos del canal siguen pendientes de revisión;
no se borraron, editaron ni fijaron posts nuevos allí.

Aplicado al bot: avatar aprobado (JPEG requerido por Telegram), descripción,
11 comandos y cinco imágenes reutilizables cargadas en la conversación
privada del propietario @mitzukyhs. `/start` muestra bienvenida con botones
reales para planes, partidos, estado y ayuda. Planes incluyen PRO 250 Stars
cada 30 días con renovación automática e individual 50 Stars pago único,
más muestra e historial. Listas de partidos con nombres, fechas y botones.
Los informes privados presentan probabilidades, forma reciente y antecedentes
sin nombres de modelos/rating/RD. No cambió ningún cálculo predictivo.

Se desplegó `esport-stars` versión 3, con el mismo receptor autenticado,
webhook, base, secretos, consentimiento y ledger. No aplicar migraciones
ni crear nuevos secretos. `salida/stars/marca.mjs` contiene file_id públicos
del pack, específicos de este bot; no contiene credenciales. Cuando los
precios o renovación dejan de coincidir con la imagen, el bot usa texto
configurado para evitar publicidad desactualizada. Ver mantenimiento y
reaplicación en `PACK_TELEGRAM.md`.

Muestra pública: plantilla del pack con campos pendientes, explícitamente
identificada como diseño, sin prometer un informe completo para ese partido.
Historial estático: 27 agosto–25 septiembre 2026 Venezuela, 1.896 evaluados;
166 pendientes excluidos. No actualizar sólo el texto dejando la imagen
con cifras antiguas. Las variantes verticales, firmas claras/oscuras y
piezas de TikTok quedan como material del pack, sin publicaciones extra.

Verificación: 483 pruebas JS + 21 Postgres local = 504 correctas. Incluyen
compra, duplicados, expiración, acceso y 10 nuevas de presentación/navegación.
En producción: perfil, comandos, health 200, rechazo sin secreto 403 y
nueve rutas de navegación por el webhook, sólo al propietario. Botones
reales de menú/planes comprobados en Telegram Web. Estado y consentimiento
del propietario sin cambios; conteos de órdenes/pagos/reembolsos/incidencias
iguales antes/después (1/0/0/0). Sin cobros, aceptaciones nuevas ni activaciones.
Respaldo previo del perfil y fuentes anteriores del receptor guardados
localmente en work, excluidos de Git. No hay entorno TEST oficial configurado.
