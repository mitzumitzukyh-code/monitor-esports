// Arranque de la Mini App en el navegador. La lógica de cada pantalla vive en
// vistas/ (funciones puras, probadas en Node); aquí sólo se conecta todo al DOM.

import { crearFuenteApi } from './datos/api.mjs';
import { ESCENARIOS, crearFuenteDemo } from './datos/demo.mjs';
import { esRaiz, leerRuta } from './rutas.mjs';
import { crearTelegram } from './telegram.mjs';
import { dialogoCompra, estadoCargando, estadoError } from './vistas/componentes.mjs';
import { barraNavegacion, cabecera } from './vistas/marco.mjs';
import { PANTALLA, cargarPantalla } from './vistas/pantallas.mjs';

const CLAVE_ESCENARIO = 'miniapp:escenario';
const TITULOS = { inicio: 'Inicio', partidos: 'Partidos', detalle: 'Partido', historial: 'Historial', pro: 'PRO', mas: 'Más' };

const $ = (sel) => document.querySelector(sel);
const contenido = $('#contenido');
const nav = $('#navegacion');
const barra = $('#cabecera');

const tg = crearTelegram(window);
tg.iniciar();

function leerEscenario() {
  const url = new URLSearchParams(location.search).get('demo');
  if (Object.hasOwn(ESCENARIOS, url ?? '')) return url;
  try {
    const guardado = sessionStorage.getItem(CLAVE_ESCENARIO);
    if (Object.hasOwn(ESCENARIOS, guardado ?? '')) return guardado;
  } catch { /* sin almacenamiento, se usa el valor por defecto */ }
  return 'free';
}

const apiUrl = document.querySelector('meta[name="monitor-api-url"]')?.content?.trim() ?? '';
let escenario = apiUrl ? null : leerEscenario();
let fuente = apiUrl
  ? crearFuenteApi({ baseUrl: apiUrl, initData: () => tg.initData() })
  : crearFuenteDemo({ escenario });
let catalogo = null;
let turno = 0;
let primera = true;

async function mostrar() {
  const ruta = leerRuta(location.hash);
  const mio = ++turno;
  nav.innerHTML = barraNavegacion(ruta.pestana);
  tg.atras(!esRaiz(ruta), volver);
  document.title = `${TITULOS[ruta.pantalla]} · Monitor eSports`;

  // El indicador sólo aparece si la carga tarda: sin parpadeo en cada pestaña.
  const aviso = setTimeout(() => { if (mio === turno) contenido.innerHTML = estadoCargando(); }, 120);
  contenido.setAttribute('aria-busy', 'true');
  try {
    catalogo ??= await fuente.catalogo();
    const datos = await cargarPantalla(fuente, ruta);
    if (mio !== turno) return;
    contenido.innerHTML = PANTALLA[ruta.pantalla](datos, { ahora: Date.now(), catalogo, demo: fuente.demo, escenario, ruta });
    barra.innerHTML = cabecera({ demo: fuente.demo, plan: datos.perfil?.plan ?? null });
  } catch (error) {
    if (mio !== turno) return;
    // Sólo se muestran mensajes escritos para el usuario; un fallo interno
    // sale con el texto genérico y queda en la consola.
    console.error(error);
    contenido.innerHTML = estadoError(error?.mensajeUsuario);
    barra.innerHTML = cabecera({ demo: fuente.demo });
  } finally {
    clearTimeout(aviso);
    if (mio === turno) contenido.removeAttribute('aria-busy');
  }
  if (!primera) {
    window.scrollTo({ top: 0 });
    contenido.focus({ preventScroll: true });
  }
  primera = false;
}

function volver() {
  if (history.length > 1) history.back();
  else location.hash = '#/partidos';
}

function cerrarCompra() {
  const dialogo = document.querySelector('[data-compra-dialogo]');
  if (!dialogo) return;
  try { if (dialogo.open) dialogo.close(); } catch { /* navegador antiguo */ }
  dialogo.remove();
}

function abrirCompra(producto) {
  if (!catalogo?.compras_habilitadas || typeof fuente?.comprar !== 'function') {
    tg.alerta('Las compras están temporalmente desactivadas.');
    return;
  }
  cerrarCompra();
  const html = dialogoCompra(producto, catalogo);
  if (!html) {
    tg.alerta('No pudimos preparar esta compra.');
    return;
  }
  document.body.insertAdjacentHTML('beforeend', html);
  const dialogo = document.querySelector('[data-compra-dialogo]');
  if (typeof dialogo?.showModal === 'function') dialogo.showModal();
  else dialogo?.setAttribute('open', '');
}

async function confirmarCompra(boton) {
  const dialogo = boton.closest('[data-compra-dialogo]');
  if (!dialogo || dialogo.getAttribute('aria-busy') === 'true') return;
  const producto = boton.dataset.producto;
  const matchId = boton.dataset.matchId ? Number(boton.dataset.matchId) : null;
  dialogo.setAttribute('aria-busy', 'true');
  const textoOriginal = boton.textContent;
  boton.textContent = 'Preparando factura…';
  boton.disabled = true;
  try {
    const compra = await fuente.comprar({ producto, matchId, aceptarTerminos: true });
    cerrarCompra();
    const abierta = tg.abrirFactura(compra.invoice_url, (estado) => {
      if (estado === 'paid') {
        fuente.invalidar?.();
        tg.alerta('Pago recibido. Estamos activando tu acceso.');
        setTimeout(() => mostrar(), 1000);
      } else if (estado === 'pending') {
        fuente.invalidar?.();
        tg.alerta('El pago sigue procesándose. Actualizaremos tu acceso cuando Telegram lo confirme.');
        setTimeout(() => mostrar(), 1500);
      } else if (estado === 'failed') {
        tg.alerta('Telegram no pudo completar el pago. No se activó ningún acceso.');
      }
    });
    if (!abierta) throw new Error('Factura inválida');
  } catch (error) {
    console.error(error);
    if (document.body.contains(dialogo)) {
      dialogo.removeAttribute('aria-busy');
      boton.disabled = false;
      boton.textContent = textoOriginal;
    }
    tg.alerta(error?.mensajeUsuario || 'No pudimos iniciar la compra. Inténtalo otra vez.');
  }
}

// El logo del equipo viene de un CDN externo. Si falta o falla, el
// monograma que está debajo queda visible en vez de mostrar un icono roto.
document.addEventListener('error', (evento) => {
  const img = evento.target;
  if (img instanceof HTMLImageElement && img.matches('img[data-logo-equipo]')) {
    img.hidden = true;
    img.closest('.equipo__avatar')?.classList.remove('equipo__avatar--con-logo');
  }
}, true);

document.addEventListener('click', async (evento) => {
  const objetivo = evento.target.closest('[data-accion], .nav__item, .chip, .segmento__opcion');
  if (!objetivo) return;
  tg.vibrar();
  const accion = objetivo.dataset.accion;
  if (accion === 'saltar') {
    contenido.focus();
  } else if (accion === 'reintentar') {
    mostrar();
  } else if (accion === 'escenario' && fuente.demo) {
    escenario = objetivo.dataset.valor;
    try { sessionStorage.setItem(CLAVE_ESCENARIO, escenario); } catch { /* opcional */ }
    fuente = crearFuenteDemo({ escenario });
    catalogo = null;
    mostrar();
  } else if (accion === 'telegram') {
    evento.preventDefault();
    tg.abrirTelegram(objetivo.dataset.url);
  } else if (accion === 'externo') {
    evento.preventDefault();
    tg.abrirEnlace(objetivo.dataset.url);
  } else if (accion === 'comprar') {
    evento.preventDefault();
    abrirCompra(objetivo.dataset.producto);
  } else if (accion === 'cerrar-compra') {
    evento.preventDefault();
    cerrarCompra();
  } else if (accion === 'confirmar-compra') {
    evento.preventDefault();
    await confirmarCompra(objetivo);
  }
});

window.addEventListener('hashchange', mostrar);
barra.innerHTML = cabecera({ demo: fuente.demo });
mostrar();
