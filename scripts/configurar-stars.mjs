import { configuracionStars } from '../salida/stars/config.mjs';
import { clienteTelegram } from '../salida/stars/api.mjs';

const config = configuracionStars();
if (!config.token) throw new Error('Falta TELEGRAM_BOT_TOKEN');
if (!/^[A-Za-z0-9_-]{32,256}$/.test(config.secreto)) throw new Error('Falta un TELEGRAM_WEBHOOK_SECRET válido');
const api = clienteTelegram(config);
// Consultar esquema sin crear usuarios ni modificar producción.
// SELECT de una tabla privada requiere service_role y confirma la migración.
const { seleccionar } = await import('../datos/supabase.mjs');
await seleccionar('eslo_stars_usuarios', '?select=user_id&limit=1');
await seleccionar('eslo_stars_incidencias', '?select=update_id&limit=1');
await api('getMe', {});
const antes = await api('getWebhookInfo', {});
console.log(`Credenciales y tablas verificadas. Entorno Telegram: ${config.test ? 'TEST' : 'PRODUCCIÓN'}. Updates pendientes: ${antes.pending_update_count}.`);
if (!process.argv.includes('--activar-webhook')) {
  console.log('Comprobación terminada. Para registrar el receptor, usar --activar-webhook.');
  process.exit(0);
}
const url = new URL(process.env.TELEGRAM_WEBHOOK_URL ?? '');
if (url.protocol !== 'https:' || url.pathname !== '/telegram' || url.search || url.username || url.password) {
  throw new Error('TELEGRAM_WEBHOOK_URL debe ser https://TU-HOST/telegram');
}
if (antes.url && antes.url !== url.href && !process.argv.includes('--reemplazar-webhook')) {
  throw new Error('Ya existe otro receptor. Revisarlo y usar --reemplazar-webhook si corresponde.');
}
// Nunca descartar recibos pendientes. Los reintentos son seguros por charge ID.
await api('setWebhook', { url: url.href, secret_token: config.secreto,
  allowed_updates: ['message','callback_query','pre_checkout_query','subscription'], drop_pending_updates: false, max_connections: 4 });
await api('setMyCommands', { commands: [
  { command: 'planes', description: 'FREE y PRO' }, { command: 'pro', description: 'Comprar acceso PRO con Stars' },
  { command: 'estado', description: 'Ver mi acceso' }, { command: 'partidos', description: 'Ver ID de próximos partidos' },
  { command: 'analisis', description: 'Abrir informe: /analisis ID' }, { command: 'cancelar', description: 'Cancelar renovación automática' },
  { command: 'terms', description: 'Condiciones de compra' }, { command: 'paysupport', description: 'Ayuda con compras' },
] });
console.log('Receptor y menú registrados. Verificar /planes y /estado en privado.');
