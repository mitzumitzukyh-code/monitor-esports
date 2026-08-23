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

// En la ficha, la columna de mercado dice "MERCADO SIN VIG" -- misterioso y
// heredado del mockup. El motivo real de que salga «—» es que no hay cuotas
// de Dota guardadas: eso es lo que dice ahora.
const ETIQUETA_FICHA = `<div style="font-size: 8.5px; font-weight: 700; letter-spacing: 0.12em; color: #6F7784;">MERCADO SIN VIG</div>`;
const ETIQUETA_FICHA_HONESTA = `<div style="font-size: 8.5px; font-weight: 700; letter-spacing: 0.12em; color: #6F7784;">MERCADO · SIN CUOTAS</div>`;

// El chip del juego lleva ahora el logo oficial (recuperado del historial
// del repo). La imagen entra por p.logoJuego; si un día falta el archivo,
// el sc-if no dibuja nada y el chip queda de texto, igual que hoy.
const CHIP_TEXTO = `<span style="{{ p.chip }}">{{ p.juego }}</span>`;
const CHIP_CON_LOGO = `<span style="{{ p.chip }}"><sc-if value="{{ p.logoJuego }}"><img src="{{ p.logoJuego }}" alt="" style="width:11px;height:11px;border-radius:4px;margin-right:6px;display:inline-block;object-fit:cover;vertical-align:-2px;"></sc-if>{{ p.juego }}</span>`;

// La rejilla era auto-fill: con una sola tarjeta quedaba flotando en una
// columna propia mientras el resto del ancho moría vacío. auto-fit colapsa
// las pistas vacías, pero con UNA tarjeta la estira al ancho completo y el
// contenido se ve perdido. Se fija el ancho de la tarjeta (430px, que es lo
// que el diseño tenía en mente) y se centra el grupo.
const GRILLA_ANTES = `grid-template-columns: repeat(auto-fill, minmax(390px, 1fr))`;
const GRILLA_DESPUES = `grid-template-columns: repeat(auto-fit, minmax(min(100%, 430px), 430px)); justify-content: center;`;

// Los escudos son una caja con iniciales; el logo real entra como <img>
// encima y si no carga se elimina solo (onerror) y vuelve la inicial. Sin
// esto, un logo roto dejaba el cuadro vacío -- exactamente lo que se veía en
// producción con el CDN viejo de Valve ya muerto.
const ESCUDO = (varNombre, keyInicial, keyLogo) => {
  const antes = `<div style="\{\{ ${varNombre} \}\}">\{\{ ${keyInicial} \}\}</div>`;
  const despues = `<div style="\{\{ ${varNombre} \}\}; position: relative; overflow: hidden;"><span>\{\{ ${keyInicial} \}\}</span><sc-if value="\{\{ ${keyLogo} \}\}"><img src="\{\{ ${keyLogo} \}\}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" onerror="this.remove()"></sc-if></div>`;
  return [antes, despues];
};

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

// Tarjeta (`p.*`), fila de tabla (`r.*`) y ficha (`m*`): los tres lugares
// donde el diseño dibuja un escudo con iniciales.
const ESCUDOS = [
  ESCUDO('p.escudoA', 'p.inicialA', 'p.logoA'),
  ESCUDO('p.escudoB', 'p.inicialB', 'p.logoB'),
  ESCUDO('r.escudoA', 'r.inicialA', 'r.logoA'),
  ESCUDO('r.escudoB', 'r.inicialB', 'r.logoB'),
  ESCUDO('mEscudoA', 'mInicialA', 'mLogoA'),
  ESCUDO('mEscudoB', 'mInicialB', 'mLogoB'),
];

export function pulir(cuerpo) {
  let out = cuerpo;
  if (!USUARIO_FALSO.test(out)) throw new Error('pulir: no encontré el usuario de mentira del encabezado; el diseño cambió y hay que revisar esta regla');
  out = out.replace(USUARIO_FALSO, (m) => ENLACE_REPO + m.slice(m.lastIndexOf('</header>')));
  out = quitar(out, HAMBURGUESA, 'la hamburguesa del rail');
  out = quitar(out, AJUSTES, 'el botón AJUSTES del rail');
  out = cambiar(out, ETIQUETA_CORTADA, ETIQUETA_HONESTA, 'la etiqueta cortada');
  out = cambiar(out, ETIQUETA_FICHA, ETIQUETA_FICHA_HONESTA, 'la etiqueta MERCADO SIN VIG de la ficha');
  out = cambiar(out, CHIP_TEXTO, CHIP_CON_LOGO, 'el chip del juego');
  out = cambiar(out, GRILLA_ANTES, GRILLA_DESPUES, 'la rejilla de tarjetas');
  for (const [antes, despues] of ESCUDOS) out = cambiar(out, antes, despues, `el escudo de ${antes}`);
  return out;
}
