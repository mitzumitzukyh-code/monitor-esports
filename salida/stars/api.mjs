// API de pagos sin reintentos de sendInvoice: un timeout no debe crear dos facturas.
export function clienteTelegram({ token, test = false }, fetchImpl = fetch) {
  return async (metodo, datos) => {
    const res = await fetchImpl(`https://api.telegram.org/bot${token}/${test ? 'test/' : ''}${metodo}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos), signal: AbortSignal.timeout(metodo === 'answerPreCheckoutQuery' ? 4000 : 6000),
    });
    const cuerpo = await res.json();
    if (!res.ok || cuerpo.ok !== true) throw new Error(`Telegram ${metodo}: ${res.status}`);
    return cuerpo.result;
  };
}
