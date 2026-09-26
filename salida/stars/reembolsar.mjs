export async function prepararReembolso({ cargo, pago, api, accion, confirmar = false }) {
  if (!pago || pago.telegram_payment_charge_id !== cargo || pago.currency !== 'XTR' ||
    !Number.isSafeInteger(Number(pago.user_id)) || Number(pago.user_id) <= 0 ||
    !Number.isSafeInteger(Number(pago.amount)) || Number(pago.amount) <= 0 || !pago.payload) throw Error('Recibo no encontrado o inválido');
  if (pago.reembolsado_en) return { estado: 'ya_reembolsado' };
  if (!confirmar) return { estado: 'revision', usuario: pago.user_id, stars: pago.amount };
  // Un timeout no se reintenta automáticamente: verificar primero con Telegram.
  if (await api('refundStarPayment', { user_id: pago.user_id, telegram_payment_charge_id: cargo }) !== true) {
    throw Error('Telegram no confirmó el reembolso; no se modificó el acceso');
  }
  const resultado = await accion('reembolso', { user_id: pago.user_id, payload: pago.payload,
    currency: 'XTR', total_amount: pago.amount, telegram_payment_charge_id: cargo });
  if (!resultado.ok) throw Error('Telegram reembolsó, pero falta conciliar el acceso en la base');
  return { estado: 'reembolsado' };
}
