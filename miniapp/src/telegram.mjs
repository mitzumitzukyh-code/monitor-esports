// Adaptador fino sobre window.Telegram.WebApp.
//
// Todo lo de Telegram pasa por aquí. Fuera de Telegram (navegador normal,
// pruebas) el adaptador sigue funcionando y no hace nada: la app se tiene que
// poder abrir y revisar sin el cliente de Telegram.
//
// La identidad y la creación de facturas se validan SIEMPRE en el servidor.
// Este adaptador sólo abre la factura nativa que entrega Telegram.

const COLOR_FONDO = '#05070A';
const COLOR_PANEL = '#080A0E';

/** Valida un número de inset que venga de Telegram. */
const px = (v) => (Number.isFinite(v) && v >= 0 ? `${Math.round(v)}px` : '0px');

/**
 * @param {Window & { Telegram?: any }} [win]
 */
export function crearTelegram(win = globalThis.window) {
  const app = win?.Telegram?.WebApp;
  // El script de Telegram define WebApp también fuera de Telegram; lo que
  // delata un cliente real es que traiga plataforma.
  const dentro = Boolean(app && app.platform && app.platform !== 'unknown');
  const version = (v) => Boolean(app?.isVersionAtLeast?.(v));
  const raiz = win?.document?.documentElement;
  let alVolver = null;

  function aplicarInsets() {
    if (!raiz) return;
    const s = app?.safeAreaInset ?? {}, c = app?.contentSafeAreaInset ?? {};
    for (const lado of ['top', 'bottom', 'left', 'right']) {
      raiz.style.setProperty(`--safe-${lado}`, px(s[lado]));
      raiz.style.setProperty(`--content-safe-${lado}`, px(c[lado]));
    }
  }

  function aplicarTema() {
    if (!raiz) return;
    raiz.dataset.tg = dentro ? 'si' : 'no';
    raiz.dataset.esquema = app?.colorScheme === 'light' ? 'light' : 'dark';
    // La marca es oscura siempre (diseño aprobado). Lo que sí se adapta a
    // Telegram es el marco: cabecera, fondo y barra inferior del cliente
    // quedan del mismo color que la app para que no se vea un corte.
    if (!dentro) return;
    try {
      if (version('6.1')) { app.setHeaderColor(COLOR_FONDO); app.setBackgroundColor(COLOR_FONDO); }
      if (version('7.10')) app.setBottomBarColor(COLOR_PANEL);
    } catch { /* un cliente viejo no rompe la app */ }
  }

  return {
    dentro,
    plataforma: dentro ? app.platform : 'navegador',

    iniciar() {
      aplicarTema();
      aplicarInsets();
      if (!dentro) return;
      app.ready();
      app.expand();
      app.onEvent?.('themeChanged', aplicarTema);
      app.onEvent?.('safeAreaChanged', aplicarInsets);
      app.onEvent?.('contentSafeAreaChanged', aplicarInsets);
    },

    /** Muestra u oculta el botón Atrás nativo. */
    atras(visible, accion) {
      if (!dentro || !version('6.1')) return;
      if (alVolver) app.BackButton.offClick(alVolver);
      alVolver = null;
      if (visible) {
        alVolver = accion;
        app.BackButton.onClick(alVolver);
        app.BackButton.show();
      } else {
        app.BackButton.hide();
      }
    },

    vibrar() {
      if (dentro && version('6.1')) app.HapticFeedback?.selectionChanged?.();
    },

    /** Abre un enlace t.me dentro de Telegram, o en otra pestaña fuera. */
    abrirTelegram(url) {
      if (!/^https:\/\/t\.me\/[A-Za-z0-9_/?=]+$/.test(url)) return false;
      if (dentro && version('6.1')) app.openTelegramLink(url);
      else win?.open?.(url, '_blank', 'noopener');
      return true;
    },


    /** Abre páginas públicas propias fuera del WebView sin exponer navegación arbitraria. */
    abrirEnlace(url) {
      let destino;
      try { destino = new URL(url); } catch { return false; }
      if (destino.protocol !== 'https:' || destino.hostname !== 'monitor-esports.vercel.app') return false;
      if (dentro && version('6.1') && typeof app.openLink === 'function') app.openLink(destino.toString());
      else win?.open?.(destino.toString(), '_blank', 'noopener');
      return true;
    },

    /** Abre una factura de Telegram Stars. El enlace viene firmado por Bot API. */
    abrirFactura(url, alCerrar = () => {}) {
      if (!/^https:\/\/t\.me\/(?:\$|invoice\/)[A-Za-z0-9_-]+$/.test(url)) return false;
      if (dentro && version('6.1') && typeof app.openInvoice === 'function') {
        app.openInvoice(url, (estado) => alCerrar(estado));
        return true;
      }
      if (dentro && version('6.1') && typeof app.openTelegramLink === 'function') {
        app.openTelegramLink(url);
        return true;
      }
      win?.open?.(url, '_blank', 'noopener');
      return true;
    },

    alerta(texto) {
      if (dentro && version('6.2') && typeof app.showAlert === 'function') app.showAlert(String(texto));
      else win?.alert?.(String(texto));
    },

    /** Cadena firmada que se manda al backend para validación. */
    initData() {
      return dentro && typeof app?.initData === 'string' ? app.initData : '';
    },

    // Sólo presentación local. Nunca usar initDataUnsafe para autorizar acceso.
    usuario() {
      const u = app?.initDataUnsafe?.user;
      return u ? { nombre: u.first_name ?? '', id: u.id } : null;
    },
  };
}
