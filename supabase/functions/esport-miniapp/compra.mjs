export const VERSION_TERMINOS = '2026-09-26-v3';
export const PERIODO_PRO = 2592000;

const entero = (v) => Number.isSafeInteger(Number(v)) && Number(v) > 0 && Number(v) <= 10000;

export function configuracionCompra(get = (nombre) => globalThis.Deno?.env?.get(nombre) ?? '') {
  const habilitado = get('TELEGRAM_STARS_ENABLED') === 'true';
  const pro = Number(get('TELEGRAM_PRO_STARS'));
  const partido = Number(get('TELEGRAM_MATCH_STARS'));
  const recurrente = get('TELEGRAM_PRO_RECURRING') !== 'false';
  return {
    habilitado: habilitado && entero(pro) && entero(partido),
    pro: entero(pro) ? pro : null,
    partido: entero(partido) ? partido : null,
    recurrente,
  };
}

export function facturaTelegram({ producto, amount, payload, matchId = null, recurrente = true }) {
  if (!['pro', 'partido'].includes(producto)) throw new Error('producto inválido');
  if (!entero(amount)) throw new Error('importe inválido');
  if (typeof payload !== 'string' || payload.length < 1 || payload.length > 128) throw new Error('payload inválido');
  if (producto === 'partido' && (!Number.isSafeInteger(Number(matchId)) || Number(matchId) <= 0)) {
    throw new Error('partido inválido');
  }
  const pro = producto === 'pro';
  return {
    title: pro ? 'Monitor eSports PRO' : `Análisis #${Number(matchId)}`,
    description: pro
      ? `Informes completos durante 30 días.${recurrente ? ' Renovación automática cada 30 días.' : ' Pago único.'}`
      : `Informe estadístico del partido #${Number(matchId)}. Pago único.`,
    payload,
    currency: 'XTR',
    prices: [{ label: pro ? 'PRO 30 días' : 'Análisis de partido', amount: Number(amount) }],
    ...(pro && recurrente ? { subscription_period: PERIODO_PRO } : {}),
  };
}
