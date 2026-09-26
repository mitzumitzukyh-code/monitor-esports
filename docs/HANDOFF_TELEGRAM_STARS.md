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

Verificación: 445 pruebas existentes + 17 del bot + 4 del receptor Edge + 19
de migración/RPC en Postgres local (485 en total). CI de PR incluye pruebas
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

PR #3: https://github.com/mitzumitzukyh-code/monitor-esports/pull/3. Continúa
en borrador para revisión; el receptor ya utiliza el código de esta rama.
La publicación del panel y el cron FREE no requieren fusionarla para atender
las compras. Para frenar ventas nuevas, actualizar ENABLED=false en Secrets
y conservar receptor/base. No aplicar de nuevo la migración.

Los informes PRO son privados en el bot; los datos básicos existentes
continúan públicos. No incluir informes PRO en el generador estático o
canal FREE. Todo cambio del cálculo sigue sujeto a los invariantes y
backtests existentes, fuera del alcance de esta implementación.
