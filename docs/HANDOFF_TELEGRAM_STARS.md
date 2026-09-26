# Handoff — monetización Telegram, 2026-09-26

Solicitud explícita del dueño: preparar monetización FREE/PRO con Stars
sin cambiar el motor. Repo correcto: `mitzumitzukyh-code/monitor-esports`.
Base de trabajo: `cca7478`, rama `feat/telegram-stars`. La copia antigua
`D:\monitor-dota2` tenía cambios propios: se preservó sin modificaciones.
No se encontró un knowledge graph o handoff vigente en este repo; este
documento deja el estado para la siguiente sesión.

Implementado: receptor Node autenticado, consentimientos, facturas PRO
recurrentes o únicas, pago individual, ledger de cargos, acceso privado,
renovaciones, eventos actuales de suscripción, cancelación, expiración y
registro de refunds/incidencias.
Reutiliza Supabase/PostgREST y módulos ES; no toca motor, juez, predicciones
ni avisos FREE. Precios obligatorios por env, compras apagadas por defecto.

Verificación: 445 pruebas existentes + 17 del bot + 19 de migración/RPC en
Postgres local (481 en total). CI de PR incluye pruebas sin credenciales reales. Instrucciones y
limitaciones en `TELEGRAM_STARS.md`. No ejecutado: migración remota, registro
de webhook, deploy, compras Stars ni prueba en el servidor TEST de Telegram.

Para activar falta: aplicar migración al entorno elegido, proporcionar
precios y contacto de soporte, un secreto de webhook, host Node continuo
con HTTPS y credenciales Telegram/Supabase del servidor. Reutilizar las
credenciales existentes cuando se elija producción; para TEST usar bot/base
separados. No asumir que ENABLED=false detiene renovaciones existentes.

Los informes PRO son privados en el bot; los datos básicos existentes
continúan públicos. No incluir informes PRO en el generador estático o
canal FREE. Todo cambio del cálculo sigue sujeto a los invariantes y
backtests existentes, fuera del alcance de esta implementación.
