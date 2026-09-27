export const PERIODO_PRO = 2592000; // Único período recurrente admitido por Telegram.
export const VERSION_TERMINOS = '2026-09-26-v3';

export function configuracionStars(env = process.env) {
  const habilitado = env.TELEGRAM_STARS_ENABLED === 'true';
  const entero = (nombre, max = 10000) => {
    const valor = Number(env[nombre]);
    if (!Number.isSafeInteger(valor) || valor < 1 || valor > max) {
      if (habilitado) throw new Error(`${nombre} debe ser un entero entre 1 y ${max}`);
      return null;
    }
    return valor;
  };
  const soporte = env.TELEGRAM_PAY_SUPPORT ?? '';
  if (habilitado && !/^(https:\/\/|@|[^\s]+@[^\s]+\.)/.test(soporte)) {
    throw new Error('Configurar TELEGRAM_PAY_SUPPORT con un contacto de soporte');
  }
  if (env.TELEGRAM_PRO_RECURRING && !['true', 'false'].includes(env.TELEGRAM_PRO_RECURRING)) {
    throw new Error('TELEGRAM_PRO_RECURRING debe ser true o false');
  }
  const puerto = Number(env.TELEGRAM_WEBHOOK_PORT ?? 8787);
  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) throw new Error('TELEGRAM_WEBHOOK_PORT debe ser un puerto válido');
  return {
    habilitado, soporte, pro: entero('TELEGRAM_PRO_STARS'),
    partido: env.TELEGRAM_MATCH_STARS ? entero('TELEGRAM_MATCH_STARS') : null,
    recurrente: env.TELEGRAM_PRO_RECURRING !== 'false',
    test: env.TELEGRAM_TEST_ENV === 'true',
    secreto: env.TELEGRAM_WEBHOOK_SECRET ?? '',
    token: env.TELEGRAM_BOT_TOKEN ?? '',
    host: env.TELEGRAM_WEBHOOK_HOST ?? '127.0.0.1',
    puerto,
  };
}
