const ERROR_CONEXION = 'No se pudo conectar con Monitor eSports.';

function errorUsuario(mensaje, causa = null) {
  return Object.assign(new Error(causa ?? mensaje), { mensajeUsuario: mensaje });
}

export function crearFuenteApi({ baseUrl, initData, fetchImpl = fetch } = {}) {
  if (typeof baseUrl !== 'string' || !/^https:\/\//.test(baseUrl)) throw new Error('URL de Mini App API inválida');
  const rawInitData = typeof initData === 'function' ? initData : () => initData ?? '';

  async function pedir(recurso, params = {}) {
    const raw = rawInitData();
    if (!raw) throw errorUsuario('Abre Monitor eSports desde Telegram para continuar.');

    const url = new URL(baseUrl);
    url.searchParams.set('recurso', recurso);
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== '') url.searchParams.set(k, String(v));
    }

    let res;
    try {
      res = await fetchImpl(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-Telegram-Init-Data': raw,
        },
        signal: AbortSignal.timeout(7000),
      });
    } catch (e) {
      throw errorUsuario(ERROR_CONEXION, e?.message);
    }

    let cuerpo = null;
    try { cuerpo = await res.json(); } catch { /* cuerpo roto: error genérico */ }

    if (res.status === 401) throw errorUsuario('Tu sesión de Telegram venció. Cierra y vuelve a abrir la Mini App.');
    if (res.status === 429) throw errorUsuario('Demasiadas solicitudes. Espera un momento y vuelve a intentar.');
    if (!res.ok || !cuerpo || cuerpo.ok !== true) throw errorUsuario(ERROR_CONEXION);
    return cuerpo.data;
  }

  return {
    demo: false,
    escenario: null,
    perfil: () => pedir('perfil'),
    catalogo: () => pedir('catalogo'),
    inicio: () => pedir('inicio'),
    partidos: ({ juego = null, periodo = 'proximos' } = {}) => pedir('partidos', { juego, periodo }),
    partido: (id) => pedir('partido', { id }),
    historial: ({ juego = null } = {}) => pedir('historial', { juego }),
  };
}
