import { randomUUID } from 'node:crypto';
import { PERIODO_PRO, VERSION_TERMINOS } from './config.mjs';
import { informePremium } from './informe.mjs';
import { MUESTRA } from './muestra.mjs';
import { esc } from '../telegram.mjs';
import { JUEGOS, POR_PAGINA, PERIODOS, contextoLista, enlaceLista, ventanaPartidos,
  fechaPartido, nombreEncuentro, formatoSerie, zonaPublica } from './partidos.mjs';

const idValido = (id) => Number.isSafeInteger(id) && id > 0;
const partidoId = (s) => /^\d{1,15}$/.test(s ?? '') && idValido(Number(s)) ? Number(s) : null;
const boton = (text, callback_data) => ({ text, callback_data });
const markup = (...filas) => ({ inline_keyboard: filas });
const fecha = (iso) => fechaPartido(iso, { dateStyle: 'short', timeStyle: 'short' });

export const TERMINOS = 'Compras acceso a análisis, predicciones y estadísticas. Son estimaciones, sin resultados ni ganancias garantizadas. ' +
  'PRO dura 30 días; si eliges suscripción, Telegram cobra automáticamente cada 30 días mientras esté activa y tengas Stars. ' +
  'Puedes cancelar la renovación y conservar el período pagado. El análisis individual da acceso a ese partido. ' +
  'Ante cobros duplicados o fallos de acceso, contacta soporte con tu recibo para revisar el acceso o reembolso. ' +
  'Guardamos tu ID de Telegram, consentimiento, órdenes y recibos para gestionar compras. Telegram no atiende disputas de estas compras.';

export function crearBotStars({ config, almacen, api, nombres = async () => new Map(),
  nombresPartidos = async () => new Map(), marca = {}, ahora = () => Date.now() }) {
  const decir = (id, text, reply_markup, premium = false) => api('sendMessage', {
    chat_id: id, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true },
    ...(reply_markup ? { reply_markup } : {}), ...(premium ? { protect_content: true } : {}),
  });
  const menu = () => markup(
    [boton('Ver planes', 'planes'), boton('Ver partidos', 'partidos')],
    [boton('Mi estado', 'estado'), boton('Ayuda', 'paysupport')],
  );
  const volver = () => markup([boton('Menú principal', 'inicio')]);
  const elegirJuego = (id, individual = false) => {
    const texto = '<b>Encuentra tu próximo partido</b>\nElige un juego y consulta sus encuentros por fecha.\nHorarios AM/PM · UTC−4.';
    const botones = markup(
      [boton('CS2', 'filtro:cs2'), boton('Dota 2', 'filtro:dota2')],
      [boton('LoL', 'filtro:lol'), boton('Valorant', 'filtro:valorant')],
      [boton('Ver planes', 'planes'), boton('Menú principal', 'inicio')],
    );
    return individual ? presentar(id,
      `Un análisis · ${config.partido ?? 'precio por confirmar'} Stars. Pago único.\n\n${texto}`, 'individual', botones) : decir(id, texto, botones);
  };
  const elegirPeriodo = (id, juego) => decir(id, `<b>${JUEGOS[juego]} · Elige un período</b>\nHorarios AM/PM · UTC−4.`,
    markup(Object.entries(PERIODOS).map(([periodo,nombre]) => boton(nombre,enlaceLista({ juego,periodo }))),
      [boton('Cambiar juego','partidos'),boton('Menú principal','inicio')]));
  async function listarPartidos(id, contexto) {
    const { juego, pagina, periodo } = contexto;
    const filas = await almacen.partidos({ juego, ...ventanaPartidos(periodo, ahora()),
      offset: pagina * POR_PAGINA, limite: POR_PAGINA + 1 });
    const visibles = filas.slice(0, POR_PAGINA);
    const mapa = visibles.length ? await nombresPartidos(visibles).catch(() => new Map()) : new Map();
    const lineas = [`<b>${JUEGOS[juego]} · ${PERIODOS[periodo]}</b>`, 'Horarios AM/PM · UTC−4.'];
    let diaAnterior;
    for (const [i, p] of visibles.entries()) {
      const dia = fechaPartido(p.inicio_programado, { dateStyle: 'medium' });
      if (dia !== diaAnterior) lineas.push(`\n<b>${esc(dia)}</b>`);
      lineas.push(`${i + 1}. ${esc(fechaPartido(p.inicio_programado, { timeStyle: 'short' }))} · ${esc(nombreEncuentro(p, mapa))}`);
      diaAnterior = dia;
    }
    if (!visibles.length) lineas.push('\nNo hay encuentros en esta selección. Prueba otro día o vuelve a Próximos.');
    const paginar = [
      ...(pagina > 0 ? [boton('Anterior', enlaceLista({ ...contexto, pagina: pagina - 1 }))] : []),
      ...(filas.length > POR_PAGINA && pagina < 999 ? [boton('Siguiente', enlaceLista({ ...contexto, pagina: pagina + 1 }))] : []),
    ];
    return decir(id, lineas.join('\n'), markup(
      Object.entries(PERIODOS).map(([p, etiqueta]) => boton(`${p === periodo ? '• ' : ''}${etiqueta}`, enlaceLista({ juego, periodo: p }))),
      ...visibles.map((p, i) => [boton(`${i + 1}. ${nombreEncuentro(p, mapa).slice(0, 55)}`,
        `partido:${p.match_id}:${juego}:${pagina}:${periodo}`)]),
      ...(paginar.length ? [paginar] : []),
      [boton('Cambiar juego', 'partidos'), boton('Menú principal', 'inicio')],
    ));
  }
  async function presentar(id, text, imagen, reply_markup) {
    // Las piezas con precio sólo se muestran si coinciden con la configuración.
    const precioValido = marca.proStars === config.pro && marca.matchStars === config.partido &&
      marca.recurrente === config.recurrente;
    const foto = (!['pro','individual'].includes(imagen) || precioValido) && marca.imagenes?.[imagen];
    if (foto && text.length <= 1024) {
      try {
        return await api('sendPhoto', { chat_id: id, photo: foto, caption: text, parse_mode: 'HTML',
          ...(reply_markup ? { reply_markup } : {}) });
      } catch { /* La navegación sigue disponible si Telegram rechaza la imagen. */ }
    }
    return decir(id, text, reply_markup);
  }
  const bienvenida = (id) => presentar(id,
    '<b>Monitor eSports</b>\nPredicciones y estadísticas para entender cada partido.\n' +
    'CS2 · Dota 2 · LoL · Valorant\n\nElige una opción para continuar.', 'bienvenida', menu());
  const soporte = () => config.soporte ? `Soporte de compras: ${esc(config.soporte)}. Envía el recibo y explica el problema.` : 'Las compras aún no están habilitadas.';
  const terminos = (id, producto = 'p') => presentar(id,
    (producto === 'p' ? `PRO · ${config.pro} Stars cada 30 días.${config.recurrente ? ' Renovación automática.' : ' Pago único.'}\n` :
      `Análisis #${producto.slice(1)} · ${config.partido} Stars. Pago único, sin renovación.\n`) + `${TERMINOS}\n${soporte()}`,
    producto === 'p' ? 'pro' : 'individual', markup([
    boton('Acepto los términos', `aceptar:${VERSION_TERMINOS}:${producto}`),
  ]));
  const verPro = id => presentar(id,
    `<b>Monitor eSports PRO</b>\n${config.pro ?? 'Precio por confirmar'} Stars cada 30 días.${config.recurrente ? ' Renovación automática.' : ' Pago único, sin renovación.'}\n\n` +
    'Acceso a los informes completos de los partidos disponibles durante tu suscripción.\n' +
    'Incluye probabilidades estimadas, forma reciente, últimos resultados y H2H; fecha, hora y formato cuando esté disponible.\n\n' +
    'El acceso se activa después del pago confirmado. Cancelar detiene futuras renovaciones y conserva el período pagado.',
    'pro',markup([boton('Revisar condiciones','condiciones:p')],[boton('Ver partidos','partidos'),boton('Mi estado','estado')]));
  const planes = (id) => presentar(id, [
    '<b>Planes Monitor eSports</b>',
    'FREE: partidos, ficha básica, muestra e historial publicado. Entrar, consultar y aceptar condiciones no cobra Stars.',
    config.pro ? `PRO: probabilidades estimadas, forma reciente, últimos resultados y H2H.\n${config.pro} Stars cada 30 días.${config.recurrente ? ' Renovación automática.' : ' Pago único, sin renovación automática.'}` : 'PRO: próximamente.',
    config.partido ? `Un análisis: ${config.partido} Stars. Pago único, sin renovación.` : '',
    'Las predicciones son estimaciones.',
  ].filter(Boolean).join('\n\n'), 'pro', markup(
    [boton('Ver PRO', 'pro'), boton('Elegir partido', 'individual')],
    [boton('Ver ejemplo de informe', 'muestra'), boton('Historial de pruebas', 'resultados')],
    [boton('Menú principal', 'inicio')],
  ));

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

  async function verAnalisis(id, matchId, regresar = 'partidos') {
    if (!matchId) return decir(id, 'Usa /analisis ID. Encuentra el ID con /partidos.');
    // La autorización precede toda lectura del informe o llamada al adaptador.
    const acceso = await almacen.accion('acceso', { user_id: id, match_id: matchId });
    if (!acceso.ok) {
      const ficha = await almacen.ficha?.(matchId);
      const mapa = ficha ? await nombresPartidos([ficha]).catch(() => new Map()) : new Map();
      const datos = ficha ? [
        `<b>${esc(JUEGOS[ficha.juego] ?? ficha.juego)} · Análisis del encuentro</b>`,
        `<b>${esc(nombreEncuentro(ficha, mapa))}</b>`,
        `${fechaPartido(ficha.inicio_programado)} · ${zonaPublica(ficha.inicio_programado)}`, formatoSerie(ficha.formato), '',
      ].filter(x => x !== '').join('\n') + '\n\n' : '';
      return presentar(id, datos + 'El informe completo requiere PRO o compra individual.\n' +
        'Incluye probabilidades estimadas, forma reciente, últimos resultados y H2H.\n\n' +
        (config.partido ? `Este análisis: ${config.partido} Stars · pago único.\n` : '') +
        (config.pro ? `PRO: ${config.pro} Stars cada 30 días.${config.recurrente ? ' Renovación automática.' : ' Pago único.'}` : ''),
        'individual', markup(
          [boton('Ver PRO', 'pro'), ...(config.partido ? [boton('Comprar análisis', `comprar:${matchId}`)] : [])],
          [boton('Volver a partidos', regresar), boton('Ver ejemplo', 'muestra')],
        ));
    }
    const p = await almacen.prediccion(matchId);
    if (!p) return decir(id, 'No hay una predicción guardada para ese ID.');
    const [historial, mapa] = await Promise.all([almacen.historial(p), nombres(p).catch(() => new Map())]);
    const nombre = (teamId) => mapa.get(teamId)?.nombre ?? `#${teamId}`;
    return decir(id, informePremium(p, historial, nombre), markup(
      [boton('Volver a partidos', regresar), boton('Mi estado', 'estado')],
    ), true);
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
      return decir(id, `PRO activado · período de 30 días. Vigente hasta ${fecha(r.expira_en)} (${zonaPublica(r.expira_en)}).`,
        markup([boton('Ver partidos','partidos'),boton('Mi estado','estado')]));
    }
    if (cb) await api('answerCallbackQuery', { callback_query_id: cb.id });
    await almacen.accion('usuario', { user_id: id });
    let comando, arg;
    if (cb) {
      const data = cb.data ?? '';
      if (data.startsWith(`aceptar:${VERSION_TERMINOS}:`)) {
        const producto = data.split(':')[2];
        if (data.split(':').length !== 3 || (producto !== 'p' && !partidoId(producto?.slice(1))) ||
          (producto !== 'p' && !producto.startsWith('m'))) return;
        await almacen.accion('terminos', { user_id: id, version: VERSION_TERMINOS });
        return decir(id, 'Términos aceptados. Revisa el precio antes de pagar.', markup([
          boton('Continuar compra', producto === 'p' ? 'pagar_pro' : `pagar_individual:${producto.slice(1)}`),
        ]));
      }
      [comando, arg] = data.split(':');
    } else {
      [comando, arg] = (mensaje.text ?? '').trim().split(/\s+/, 2);
      comando = comando?.split('@')[0].replace(/^\//, '');
    }
    if (['start','help','inicio'].includes(comando)) return bienvenida(id);
    if (comando === 'planes') return planes(id);
    if (['support','paysupport','soporte'].includes(comando)) return decir(id, soporte(), volver());
    if (['muestra','ejemplo'].includes(comando)) return MUESTRA ? decir(id,
      '<b>Ejemplo real · partido cerrado</b>\nUna muestra pública del formato actual, con datos registrados.\n\n' +
      informePremium(MUESTRA.partido,MUESTRA.historial,teamId => MUESTRA.nombres[teamId] ?? `#${teamId}`),
      markup([boton('Ver partidos disponibles','partidos'),boton('Ver planes','planes')])) : presentar(id,
      '<b>Plantilla visual · valores demostrativos</b>\nLos porcentajes, forma y H2H de esta imagen son ejemplos de diseño; no son datos verificados de ese partido.', 'muestra',
      markup([boton('Ver partidos disponibles', 'partidos'), boton('Ver planes', 'planes')]));
    if (['resultados','historial'].includes(comando)) return decir(id,
      '<b>Historial de pruebas · corte estático</b>\nMaterial de validación publicado, separado de los planes comerciales.\n' +
      '27 AGO–25 SEP 2026 · UTC−4\n1.896 partidos evaluados.\n\n' +
      'CS2: 755/1.289 · 58,6%\nDota 2: 122/190 · 64,2%\nLoL: 204/296 · 68,9%\nValorant: 63/121 · 52,1%\n\n' +
      'Porcentaje de predicciones acertadas sobre partidos con resultado registrado. Los 166 pendientes quedan fuera del cálculo.\n' +
      'Predicciones registradas antes del inicio programado. Estas cifras describen esas pruebas y no son una tasa general de rendimiento del servicio.', volver());
    if (['terms','terminos'].includes(comando)) return terminos(id);
    if (comando === 'pro') return verPro(id);
    if (comando === 'pagar_pro') return comprar(id, 'pro');
    if (comando === 'condiciones' && cb && arg === 'p') return terminos(id);
    if (comando === 'comprar') {
      const matchId = partidoId(arg);
      if (!matchId) return decir(id, 'Usa /comprar ID. Encuentra el ID con /partidos.');
      return terminos(id, `m${matchId}`);
    }
    if (comando === 'pagar_individual' && cb) {
      const matchId = partidoId(arg);
      return matchId ? comprar(id,'partido',matchId) : elegirJuego(id);
    }
    if (comando === 'analisis') return verAnalisis(id, partidoId(arg));
    if (comando === 'juego' && cb) {
      const partes = cb.data.split(':');
      const contexto = partes.length === 4 ? contextoLista(...partes.slice(1)) : null;
      return contexto ? listarPartidos(id, contexto) : elegirJuego(id);
    }
    if (comando === 'partido' && cb) {
      const partes = cb.data.split(':');
      const contexto = partes.length === 5 ? contextoLista(...partes.slice(2)) : null;
      const matchId = partidoId(arg);
      return contexto && matchId ? verAnalisis(id, matchId, enlaceLista(contexto)) : elegirJuego(id);
    }
    if (comando === 'filtro' && cb) return Object.hasOwn(JUEGOS,arg ?? '') ? elegirPeriodo(id,arg) : elegirJuego(id);
    if (comando === 'partidos' || comando === 'individual') {
      const contexto = arg ? contextoLista(arg) : null;
      return contexto ? elegirPeriodo(id,contexto.juego) : elegirJuego(id, comando === 'individual');
    }
    if (comando === 'estado' || comando === 'cancelar') {
      const estado = await almacen.accion('estado', { user_id: id });
      if (comando === 'cancelar') {
        const pendientes = estado.suscripciones.filter(s => !s.cancelada);
        if (!pendientes.length) return decir(id,'No tienes una renovación automática activa para cancelar.',menu());
        for (const s of pendientes) {
          await api('editUserStarSubscription', { user_id: id, telegram_payment_charge_id: s.cargo, is_canceled: true });
          const r = await almacen.accion('cancelar', { user_id: id, payload: s.payload, telegram_payment_charge_id: s.cargo });
          if (!r.ok) throw Error('Cancelación pendiente de persistir');
        }
        return decir(id, 'Renovación automática cancelada. Conservas PRO hasta el final del período pagado. /estado');
      }
      return decir(id, estado.premium ? `PRO activo hasta ${fecha(estado.expira_en)} (${zonaPublica(estado.expira_en)}).\n` +
        (estado.suscripciones.some((s) => s.state === 'active' && !s.cancelada) ? 'Renovación automática activa. /cancelar para detenerla.' :
          estado.suscripciones.some((s) => s.state === 'failed') ? 'El último intento de renovación falló. Revisa tu suscripción y Stars en Telegram.' :
            'Renovación automática desactivada o pago único.') :
        'Plan FREE. PRO no está activo. Tus análisis individuales comprados siguen disponibles.', menu());
    }
    return bienvenida(id);
  }
  return { procesar };
}
