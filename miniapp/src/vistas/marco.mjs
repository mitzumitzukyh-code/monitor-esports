// Cabecera y barra inferior: lo que queda fijo entre pantallas.

import { NAVEGACION } from '../rutas.mjs';
import { ASSETS, icono, insignia } from './componentes.mjs';

export function barraNavegacion(activa) {
  return NAVEGACION.map(({ pantalla, etiqueta, href, icono: i }) => {
    const on = pantalla === activa;
    return `<a class="nav__item${on ? ' es-activo' : ''}${pantalla === 'pro' ? ' nav__item--pro' : ''}" href="${href}"` +
      ` data-pestana="${pantalla}"${on ? ' aria-current="page"' : ''}>${icono(i, 'icono nav__icono')}` +
      `<span class="nav__texto">${etiqueta}</span></a>`;
  }).join('');
}

export function cabecera({ demo = false, plan = null } = {}) {
  return `<a class="cabecera__marca" href="#/inicio" aria-label="Monitor eSports, inicio">` +
    `<img src="${ASSETS.simbolo}" width="32" height="32" alt="">` +
    '<span class="cabecera__nombre">Monitor <span>eSports</span></span></a>' +
    '<span class="cabecera__estado">' +
    (demo ? `<span title="Datos ficticios de demostración">${insignia('demo')}</span>` : '') +
    (plan ? insignia(plan === 'pro' ? 'pro' : 'free') : '') + '</span>';
}
