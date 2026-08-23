// Pulido del chrome del panel, aplicado AL GENERAR sobre el cuerpo del
// diseño -- disenio.dc.html sigue siendo la copia fiel de claude.ai/design y
// no se le mete mano. Cada cambio vive acá como una transformación con su
// porqué, y si el diseño cambia tanto que un reemplazo ya no calza, pulir()
// avisa en voz alta en vez de dejar pasar el placeholder a producción.
//
// Por qué transformaciones y no editar el diseño: es la misma disciplina que
// envolverVista() -- el diseño manda, el generador adapta. Si mañana se baja
// una versión nueva del diseño, estas reglas se vuelven a aplicar solas.

// El diseño trae un usuario de mentira ("JugadorPro", campana con badge "3")
// porque viene de un mockup multiusuario. Esto es un sistema de un solo dueño
// y sin cuentas, así que ese bloque sale y queda un enlace honesto al repo,
// donde están el código, los datos y el método.
//
// Se ancla en el `<div style="...">` del contenedor y en el `</header>` que
// le sigue: no se copia el interior byte a byte (el archivo del diseño vive
// en CRLF y con svg partidos en dos líneas, y un literal así se rompe en
// cuanto alguien reformatea un atributo).
const USUARIO_FALSO = /<div style="display: flex; align-items: center; gap: 18px; justify-self: end;">[\s\S]*?<\/div>\s*<\/header>/;

const ENLACE_REPO = `
      <a href="https://github.com/mitzumitzukyh-code/monitor-esports" target="_blank" rel="noopener" style="justify-self: end; display: flex; align-items: center; gap: 8px; font-family: 'JetBrains Mono', monospace; font-size: 9.5px; font-weight: 700; letter-spacing: 0.08em; color: #6F7784; text-decoration: none; white-space: nowrap;">CÓDIGO · DATOS ↗</a>`;

// La etiqueta del diseño decía "PROBABILIDAD DEL MOTOR VS MERCADO SIN VIG"
// y se cortaba sola (nowrap contra el título largo). Dota no tiene cuotas,
// así que el texto honesto es contra qué SÍ se califica, y sin nowrap para
// que nunca vuelva a cortarse.
const ETIQUETA_CORTADA = `<div style="font-size: 10.5px; color: #4B5360; letter-spacing: 0.08em; font-weight: 600; white-space: nowrap;">PROBABILIDAD DEL MOTOR VS MERCADO SIN VIG</div>`;
const ETIQUETA_HONESTA = `<div style="font-size: 10.5px; color: #4B5360; letter-spacing: 0.08em; font-weight: 600; text-align: right;">PROBABILIDAD DEL MOTOR · CALIFICADA CONTRA EL RESULTADO</div>`;

// El chip del juego lleva ahora el logo oficial (recuperado del historial
// del repo). La imagen entra por p.logoJuego; si un día falta el archivo,
// el sc-if no dibuja nada y el chip queda de texto, igual que hoy.
const CHIP_TEXTO = `<span style="{{ p.chip }}">{{ p.juego }}</span>`;
const CHIP_CON_LOGO = `<span style="{{ p.chip }}"><sc-if value="{{ p.logoJuego }}"><img src="{{ p.logoJuego }}" alt="" style="width:11px;height:11px;border-radius:4px;margin-right:6px;display:inline-block;object-fit:cover;vertical-align:-2px;"></sc-if>{{ p.juego }}</span>`;

// La rejilla era auto-fill: con una sola tarjeta quedaba flotando en una
// columna propia mientras el resto del ancho moría vacío. auto-fit colapsa
// las pistas vacías: una tarjeta ocupa el ancho completo, cuatro reparten
// igual que antes.
const GRILLA_ANTES = `grid-template-columns: repeat(auto-fill, minmax(390px, 1fr))`;
const GRILLA_DESPUES = `grid-template-columns: repeat(auto-fit, minmax(min(100%, 430px), 1fr))`;

// El icono de menú arriba del rail no abre nada (el rail ya navega) y
// AJUSTES apunta a una vista de contacto que ya vive en el pie. Salen.
const HAMBURGUESA = /<div style="display: flex; align-items: center; justify-content: center; height: 34px; color: #6F7784;">\s*<svg width="19" height="14"[\s\S]*?<\/div>/;
const AJUSTES = /<div onClick="\{\{ goContacto \}\}" style="\{\{ railAjustes \}\}">[\s\S]*?<\/div>\n?\n?/;

function quitar(html, pieza, nombre) {
  const antes = html;
  html = html.replace(pieza, '');
  if (html === antes) throw new Error(`pulir: no encontré ${nombre}; el diseño cambió y hay que revisar esta regla`);
  return html;
}

function cambiar(html, antes, despues, nombre) {
  if (!html.includes(antes)) throw new Error(`pulir: no encontré ${nombre}; el diseño cambió y hay que revisar esta regla`);
  return html.replace(antes, despues);
}

export function pulir(cuerpo) {
  let out = cuerpo;
  if (!USUARIO_FALSO.test(out)) throw new Error('pulir: no encontré el usuario de mentira del encabezado; el diseño cambió y hay que revisar esta regla');
  out = out.replace(USUARIO_FALSO, (m) => ENLACE_REPO + m.slice(m.lastIndexOf('</header>')));
  out = quitar(out, HAMBURGUESA, 'la hamburguesa del rail');
  out = quitar(out, AJUSTES, 'el botón AJUSTES del rail');
  out = cambiar(out, ETIQUETA_CORTADA, ETIQUETA_HONESTA, 'la etiqueta cortada');
  out = cambiar(out, CHIP_TEXTO, CHIP_CON_LOGO, 'el chip del juego');
  out = cambiar(out, GRILLA_ANTES, GRILLA_DESPUES, 'la rejilla de tarjetas');
  return out;
}
