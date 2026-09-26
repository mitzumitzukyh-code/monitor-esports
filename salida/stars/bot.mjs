import { randomUUID } from 'node:crypto';
import { PERIODO_PRO, VERSION_TERMINOS } from './config.mjs';
import { informePremium } from './informe.mjs';
import { esc } from '../telegram.mjs';

const idValido = (id) => Number.isSafeInteger(id) && id > 0;
const partidoId = (s) => /^\d{1,15}$/.test(s ?? '') && idValido(Number(s)) ? Number(s) : null;
const boton = (text, callback_data) => ({ text, callback_data });
const markup = (...filas) => ({ inline_keyboard: filas });
const fecha = (iso) => new Date(iso).toLocaleString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'short', timeStyle: 'short' });

export const TERMINOS = 'Compras acceso a análisis, predicciones y estadísticas. Son estimaciones, sin resultados ni ganancias garantizadas. ' +
  'PRO dura 30 días; si eliges suscripción, Telegram cobra automáticamente cada 30 días mientras esté activa y tengas Stars. ' +
  'Puedes cancelar la renovación y conservar el período pagado. El análisis individual da acceso a ese partido. ' +
  'Ante cobros duplicados o fallos de acceso, contacta soporte con tu recibo para revisar el acceso o reembolso. ' +
  'Guardamos tu ID de Telegram, consentimiento, órdenes y recibos para gestionar compras. Telegram no atiende disputas de estas compras.';

export function crearBotStars({ config, almacen, api, nombres = async () => new Map() }) {
  const decir = (id, text, reply_markup, premium = false) => api('sendMessage', {
    chat_id: id, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true },
    ...(reply_markup ? { reply_markup } : {}), ...(premium ? { protect_content: true } : {}),
  });
  const soporte = () => config.soporte ? `Soporte de compras: ${esc(config.soporte)}. Envía el recibo y explica el problema.` : 'Las compras aún no están habilitadas.';
  const terminos = (id, producto = 'p') => decir(id, `${TERMINOS}\n${soporte()}`, markup([
    boton('Acepto los términos', `aceptar:${VERSION_TERMINOS}:${producto}`),
  ]));
  const planes = (id) => decir(id, [
    'FREE: avisos, predicciones seleccionadas y resultados del canal actual.',
    config.pro ? `PRO: informes detallados de los partidos · ${config.pro} Stars / 30 días.${config.recurrente ? ' Renovación automática.' : ' Pago único, sin renovación automática.'}` : 'PRO: próximamente.',
    config.partido ? `Análisis individual: ${config.partido} Stars. Usa /analisis ID.` : '',
    'Incluye el modelo guardado, rating, incertidumbre y forma previa. /partidos muestra los ID.',
    'Análisis estadístico; los resultados pueden diferir.',
  ].filter(Boolean).join('\n'), markup([boton('Ver PRO', 'pro'), boton('Mi estado', 'estado')]));

  async function comprar(id, producto, matchId = null) {
    if (!config.habilitado) return decir(id, 'Las compras aún no están habilitadas. FREE sigue disponible.');
    const amount = producto === 'pro' ? config.pro : config.partido;
    if (!amount) return decir(id, 'El análisis individual todavía no está disponible. Usa /pro.');
    const estado = await almacen.accion('estado', { user_id: id });
    if (estado.terminos_version !== VERSION_TERMINOS) return terminos(id, producto === 'pro' ? 'p' : `m${matchId}`);
    const payload = `espro:${randomUUID()}`;
    const r = await almacen.accion('crear', { user_id: id, payload, producto, match_id: matchId,
      amount, recurrente: producto === 'pro' && config.recurrente, terminos_version: VERSION_TERMINOS });
    if (r.error) return decir(id, r.error === 'pro_activo_o_pendiente'
      ? 'Ya tienes PRO o una factura pendiente. Revisa /estado y la factura anterior; vence en 30 min.'
      : r.error === 'ya_comprado' ? 'Ya tienes acceso. Usa /analisis ID.' : 'No se pudo crear la compra. Revisa el partido y /terms.');
    const factura = {
      title: producto === 'pro' ? 'eSport Monitor PRO' : `Análisis #${matchId}`,
      description: producto === 'pro' ? `Informes estadísticos durante 30 días.${config.recurrente ? ' Renovación automática cada 30 días.' : ' Pago único.'}` : `Informe estadístico del partido #${matchId}. Pago único.`,
      payload, provider_token: '', currency: 'XTR', prices: [{ label: producto === 'pro' ? 'PRO 30 días' : 'Análisis de partido', amount }],
    };
    try {
      if (producto === 'pro' && config.recurrente) {
        const enlace = await api('createInvoiceLink', { ...factura, subscription_period: PERIODO_PRO });
        await decir(id, `PRO · ${amount} Stars cada 30 días. Renovación automática.`, markup([{ text: 'Suscribirme con Stars', url: enlace }]));
      } else {
        await api('sendInvoice', { ...factura, chat_id: id, start_parameter: 'planes', protect_content: true });
      }
    } catch (e) {
      // Incluso ante timeout, cualquier factura creada queda inválida para checkout.
      await almacen.accion('fallo_factura', { user_id: id, payload });
      throw e;
    }
  }

  async function verAnalisis(id, matchId) {
    if (!matchId) return decir(id, 'Usa /analisis ID. Encuentra el ID con /partidos.');
    // La autorización precede toda lectura del informe o llamada al adaptador.
    const acceso = await almacen.accion('acceso', { user_id: id, match_id: matchId });
    if (!acceso.ok) return decir(id, 'Este informe requiere PRO o compra individual.', markup([
      boton('Ver PRO', 'pro'), ...(config.partido ? [boton('Comprar este análisis', `comprar:${matchId}`)] : []),
    ]));
    const p = await almacen.prediccion(matchId);
    if (!p) return decir(id, 'No hay una predicción guardada para ese ID.');
    const [historial, mapa] = await Promise.all([almacen.historial(p), nombres(p).catch(() => new Map())]);
    const nombre = (teamId) => mapa.get(teamId)?.nombre ?? `#${teamId}`;
    return decir(id, informePremium(p, historial, nombre), undefined, true);
  }

  async function procesar(update) {
    if (!Number.isSafeInteger(update?.update_id) || update.update_id < 0) return;
    const subscription = update.subscription;
    if (subscription) {
      if (!idValido(subscription.user?.id) || typeof subscription.invoice_payload !== 'string' ||
        !['active','canceled','failed'].includes(subscription.state)) return;
      const r = await almacen.accion('suscripcion', { user_id: subscription.user.id,
        payload: subscription.invoice_payload, state: subscription.state, update_id: update.update_id });
      if (r.error) await almacen.accion('incidencia', { user_id: subscription.user.id,
        update_id: update.update_id, motivo: r.error });
      return;
    }
    const q = update.pre_checkout_query;
    if (q) {
      if (typeof q.id !== 'string' || !idValido(q.from?.id)) return;
      let ok = false;
      try {
        if (config.habilitado && q.currency === 'XTR' && idValido(q.total_amount) && typeof q.invoice_payload === 'string') {
          ok = (await almacen.accion('aprobar', { user_id: q.from.id, payload: q.invoice_payload,
            currency: q.currency, total_amount: q.total_amount, precheckout_id: q.id })).ok === true;
        }
      } catch { /* Una base caída debe rechazar el cobro dentro de los 10 s. */ }
      await api('answerPreCheckoutQuery', { pre_checkout_query_id: q.id, ok,
        ...(!ok ? { error_message: 'No se pudo validar la compra. Usa /pro o /planes para intentarlo de nuevo.' } : {}) });
      return;
    }
    const mensaje = update.message;
    const cb = update.callback_query;
    const origen = mensaje ?? cb?.message;
    // El refund es un mensaje de servicio: el receptor privado identifica
    // al comprador aunque su emisor sea el bot. La orden valida ese ID.
    const id = mensaje?.refunded_payment ? mensaje.chat?.id : mensaje?.from?.id ?? cb?.from?.id;
    if (!idValido(id) || origen?.chat?.type !== 'private' || origen.chat.id !== id) return;
    if (mensaje?.successful_payment || mensaje?.refunded_payment) {
      const p = mensaje.successful_payment ?? mensaje.refunded_payment;
      const datos = { user_id: id, update_id: update.update_id, payload: p.invoice_payload,
        currency: p.currency, total_amount: p.total_amount, telegram_payment_charge_id: p.telegram_payment_charge_id,
        provider_payment_charge_id: p.provider_payment_charge_id ?? '', date: mensaje.date,
        is_recurring: p.is_recurring === true, is_first_recurring: p.is_first_recurring === true,
        subscription_expiration_date: p.subscription_expiration_date };
      const valido = p.currency === 'XTR' && idValido(p.total_amount) && typeof p.invoice_payload === 'string' &&
        typeof p.telegram_payment_charge_id === 'string' && p.telegram_payment_charge_id.length > 0 &&
        idValido(mensaje.date) && (!p.is_recurring || idValido(p.subscription_expiration_date));
      const r = valido ? await almacen.accion(mensaje.successful_payment ? 'pago' : 'reembolso', datos) : { error: 'formato' };
      if (r.reintentar) throw new Error('Pago inicial aún pendiente: reintentar update');
      if (r.error) {
        await almacen.accion('incidencia', { user_id: id, update_id: update.update_id,
          telegram_payment_charge_id: p.telegram_payment_charge_id, motivo: r.error });
        await decir(id, `Recibo pendiente de revisión; conserva el comprobante. ${soporte()}`);
        return;
      }
      if (r.duplicado) return;
      if (mensaje.refunded_payment || r.reembolsado) return decir(id, 'Reembolso registrado. El acceso de esa compra quedó retirado. Usa /estado.');
      if (r.producto === 'partido') return decir(id, `Análisis activado. Usa /analisis ${r.match_id}.`, markup([boton('Abrir análisis', `analisis:${r.match_id}`)]));
      return decir(id, `PRO activado hasta ${fecha(r.expira_en)} (Venezuela). Usa /partidos y /analisis ID.`);
    }
    if (cb) await api('answerCallbackQuery', { callback_query_id: cb.id });
    await almacen.accion('usuario', { user_id: id });
    let comando, arg;
    if (cb) {
      const data = cb.data ?? '';
      if (data.startsWith(`aceptar:${VERSION_TERMINOS}:`)) {
        const producto = data.split(':')[2];
        if (producto !== 'p' && !/^m\d{1,15}$/.test(producto)) return;
        await almacen.accion('terminos', { user_id: id, version: VERSION_TERMINOS });
        return decir(id, 'Términos aceptados. Revisa el precio antes de pagar.', markup([
          boton('Continuar compra', producto === 'p' ? 'pagar_pro' : `comprar:${producto.slice(1)}`),
        ]));
      }
      [comando, arg] = data.split(':');
    } else {
      [comando, arg] = (mensaje.text ?? '').trim().split(/\s+/, 2);
      comando = comando?.split('@')[0].replace(/^\//, '');
    }
    if (['start','help','planes'].includes(comando)) return planes(id);
    if (['support','paysupport','soporte'].includes(comando)) return decir(id, soporte());
    if (['terms','terminos'].includes(comando)) return terminos(id);
    if (['pro','pagar_pro'].includes(comando)) return comprar(id, 'pro');
    if (comando === 'comprar') {
      const matchId = partidoId(arg);
      if (!matchId) return decir(id, 'Usa /comprar ID. Encuentra el ID con /partidos.');
      return comprar(id, 'partido', matchId);
    }
    if (comando === 'analisis') return verAnalisis(id, partidoId(arg));
    if (comando === 'partidos') {
      const filas = await almacen.partidos();
      return decir(id, filas.length ? 'Partidos disponibles:\n' + filas.map((p) => `#${p.match_id} · ${esc(p.juego)} · ${fecha(p.inicio_programado)}\n/analisis ${p.match_id}`).join('\n') : 'No hay partidos próximos guardados.');
    }
    if (comando === 'estado' || comando === 'cancelar') {
      const estado = await almacen.accion('estado', { user_id: id });
      if (comando === 'cancelar') {
        for (const s of estado.suscripciones.filter((s) => !s.cancelada)) {
          await api('editUserStarSubscription', { user_id: id, telegram_payment_charge_id: s.cargo, is_canceled: true });
          await almacen.accion('cancelar', { user_id: id, payload: s.payload, telegram_payment_charge_id: s.cargo });
        }
        return decir(id, 'Renovación automática cancelada. Conservas PRO hasta el final del período pagado. /estado');
      }
      return decir(id, estado.premium ? `PRO activo hasta ${fecha(estado.expira_en)} (Venezuela).\n` +
        (estado.suscripciones.some((s) => s.state === 'active' && !s.cancelada) ? 'Renovación automática activa. /cancelar para detenerla.' :
          estado.suscripciones.some((s) => s.state === 'failed') ? 'El último intento de renovación falló. Revisa tu suscripción y Stars en Telegram.' :
            'Renovación automática desactivada o pago único.') :
        'Plan FREE. PRO no está activo. Tus análisis individuales comprados siguen disponibles con /analisis ID.');
    }
    return decir(id, 'Usa /planes, /pro, /estado o /partidos. Soporte: /paysupport.');
  }
  return { procesar };
}
