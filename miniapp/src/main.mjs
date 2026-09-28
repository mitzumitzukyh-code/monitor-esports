// Arranque de la Mini App en el navegador. La lógica de cada pantalla vive en
// vistas/ (funciones puras, probadas en Node); aquí sólo se conecta todo al DOM.

import { ESCENARIOS, crearFuenteDemo } from './datos/demo.mjs';
import { esRaiz, leerRuta } from './rutas.mjs';
import { crearTelegram } from './telegram.mjs';
import { estadoCargando, estadoError } from './vistas/componentes.mjs';
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

let escenario = leerEscenario();
let fuente = crearFuenteDemo({ escenario });
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

document.addEventListener('click', (evento) => {
  const objetivo = evento.target.closest('[data-accion], .nav__item, .chip, .segmento__opcion');
  if (!objetivo) return;
  tg.vibrar();
  const accion = objetivo.dataset.accion;
  if (accion === 'saltar') {
    contenido.focus();
  } else if (accion === 'reintentar') {
    mostrar();
  } else if (accion === 'escenario') {
    escenario = objetivo.dataset.valor;
    try { sessionStorage.setItem(CLAVE_ESCENARIO, escenario); } catch { /* opcional */ }
    fuente = crearFuenteDemo({ escenario });
    mostrar();
  } else if (accion === 'telegram') {
    evento.preventDefault();
    tg.abrirTelegram(objetivo.dataset.url);
  } else if (accion === 'comprar') {
    // Compras apagadas en la V1: los botones salen deshabilitados y, aunque
    // alguien los habilite desde el inspector, aquí no se abre ninguna factura.
    evento.preventDefault();
  }
});

window.addEventListener('hashchange', mostrar);
barra.innerHTML = cabecera({ demo: fuente.demo });
mostrar();
