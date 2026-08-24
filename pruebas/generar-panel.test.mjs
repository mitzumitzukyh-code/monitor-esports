// Pruebas de los pedazos de generar.mjs que ya fallaron una vez en la web
// publicada. Cada una está atada a un bug real, con el bug escrito al lado:
// si alguien las borra, que sepa qué está desarmando.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anotarFilas, rotulosHonestos, CLIENTE, marcarVistas, documento } from '../salida/web/generar.mjs';
import { estiloATexto, renderizar } from '../salida/web/plantilla.mjs';

// El estilo tal como lo escribe el renderizador, no como lo escribiría una
// persona: sin espacio después de los dos puntos. Ese detalle fue el bug.
const ESTILO_FILA = estiloATexto({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.7fr) 92px 60px 190px 96px 92px 96px',
  gap: '10px',
  cursor: 'pointer',
});

const fila = (juego, edge, pa, cierra) => ({ juego, _edge: edge, _pa: pa, cierra });

// --- anotarFilas ---------------------------------------------------------

// BUG: el patrón exigía `grid-template-columns: minmax(` CON espacio, y
// estiloATexto() lo escribe sin espacio. No casaba ninguna fila, no daba
// error, y el filtro y el orden de Predicciones quedaron muertos en la web
// publicada.
test('anotarFilas casa el estilo tal como lo escribe estiloATexto (sin espacio)', () => {
  const html = `<div data-accion="ficha:99" style="${ESTILO_FILA}">x</div>`;
  const out = anotarFilas(html, [fila('DOTA 2', 0.2, 61.5, '2026-08-01')]);
  assert.ok(out.includes('data-fila'), 'la fila tiene que quedar marcada');
  assert.ok(out.includes('data-juego="DOTA 2"'));
  assert.ok(out.includes('data-cierra="2026-08-01"'));
  assert.ok(out.includes('data-accion="ficha:99"'), 'el enlace a la ficha se conserva');
});

test('anotarFilas sigue casando si algún día el estilo lleva espacio', () => {
  const conEspacio = ESTILO_FILA.replace('grid-template-columns:', 'grid-template-columns: ');
  const out = anotarFilas(`<div data-accion="ficha:7" style="${conEspacio}">x</div>`, [fila('DOTA 2', 0, 50, 'd')]);
  assert.ok(out.includes('data-fila'));
});

// BUG: data-edge y data-motor salían con el MISMO valor (_pa), así que
// ordenar por VENTAJA daba exactamente el mismo orden que por MOTOR.
test('la ventaja y la probabilidad del motor son columnas distintas', () => {
  const html = `<div data-accion="ficha:1" style="${ESTILO_FILA}">x</div>`;
  const out = anotarFilas(html, [fila('DOTA 2', 0.31, 88.1, 'd')]);
  assert.ok(out.includes('data-edge="0.31"'));
  assert.ok(out.includes('data-motor="88.1"'));
});

test('anotarFilas no toca lo que no es una fila de la tabla', () => {
  const html = '<div data-accion="ficha:5" style="display: flex; cursor: pointer;">chip</div>';
  assert.equal(anotarFilas(html, [fila('DOTA 2', 1, 1, 'd')]), html);
});

test('anotarFilas escapa lo que mete en los atributos', () => {
  const html = `<div data-accion="ficha:1" style="${ESTILO_FILA}">x</div>`;
  const out = anotarFilas(html, [fila('DO"TA', 0, 0, '<x>')]);
  assert.ok(!out.includes('data-juego="DO"TA"'), 'una comilla no puede cerrar el atributo');
  assert.ok(out.includes('&quot;'));
});

test('anotarFilas aguanta más filas en el HTML que en los datos', () => {
  const html = `<div data-accion="ficha:1" style="${ESTILO_FILA}">a</div><div data-accion="ficha:2" style="${ESTILO_FILA}">b</div>`;
  const out = anotarFilas(html, [fila('DOTA 2', 0, 0, 'd')]);
  assert.equal((out.match(/data-fila/g) || []).length, 1);
  assert.ok(out.includes('data-accion="ficha:2"'), 'la fila sin datos se deja intacta');
});

// --- rótulos -------------------------------------------------------------

// BUG: el diseño trae «MAYOR DESVÍO VS MERCADO» escrito a mano, y Dota no
// tiene cuotas en ninguna tabla. No hay casa contra la cual desviarse.
test('el panel de desvío no habla de un mercado que no existe', () => {
  const out = rotulosHonestos('<div>MAYOR DESVÍO VS MERCADO</div><p>Donde más se separa el motor de la casa.</p>', true);
  assert.ok(!out.includes('VS MERCADO'));
  assert.ok(!out.includes('de la casa'));
  assert.ok(out.includes('MAYOR DESVÍO VS LA BASE'));
});

// BUG: sin credenciales la rejilla cae a las últimas series YA JUGADAS, pero
// el título seguía diciendo «PRÓXIMAS SERIES».
test('sin próximas, el título deja de prometer próximas', () => {
  const html = '<h1>PRÓXIMAS SERIES</h1><span>Análisis y probabilidades actualizadas</span>';
  const out = rotulosHonestos(html, false);
  assert.ok(!out.includes('PRÓXIMAS SERIES'));
  assert.ok(out.includes('ÚLTIMAS SERIES JUZGADAS'));
  assert.ok(out.includes('Supabase no respondió'));
});

test('con próximas de verdad, el título del diseño se respeta', () => {
  const html = '<h1>PRÓXIMAS SERIES</h1><span>Análisis y probabilidades actualizadas</span>';
  const out = rotulosHonestos(html, true);
  assert.ok(out.includes('PRÓXIMAS SERIES'));
  assert.ok(out.includes('Análisis y probabilidades actualizadas'));
});

// --- el script del cliente ------------------------------------------------

// BUG: al arrancar se pedía siempre la vista 'home'. En una ficha la única
// vista que existe es 'match', así que ir() rebotaba a index.html y la ficha
// no se podía ni abrir.
test('el arranque no pide una vista que la página no tiene', () => {
  assert.ok(!/var inicial = \(location\.hash\|\|'#home'\)/.test(CLIENTE), 'el arranque ya no fuerza #home');
  assert.ok(CLIENTE.includes("if (!existe(inicial))"), 'el arranque comprueba que la vista exista');
});

// BUG: pulsar INICIO dentro de una ficha ocultaba TODAS las vistas y dejaba
// la página en blanco.
test('navegar a una vista que no está en esta página lleva al índice', () => {
  assert.ok(CLIENTE.includes("location.href = 'index.html#' + v"));
});

// BUG: las filas traen `display:grid` en el atributo style, que le gana a la
// regla [hidden]{display:none} del navegador. El filtro ponía el atributo y
// la fila se seguía viendo.
test('las vistas y las filas ocultas se esconden con !important', () => {
  const doc = documento({ cuerpo: '', estiloDisenio: '', titulo: 't', conCliente: false });
  assert.match(doc, /\[data-vista\]\[hidden\], \[data-fila\]\[hidden\] \{ display: none !important; \}/);
});

test('el documento declara UTF-8 antes de cualquier texto', () => {
  // Perder el charset ya rompió una vez el sitio: `CORRECCIÓN` sin comillas
  // dentro del script del diseño se volvía mojibake y reventaba el parseo.
  const doc = documento({ cuerpo: '', estiloDisenio: '', titulo: 't', conCliente: false });
  assert.ok(doc.indexOf('<meta charset="utf-8">') < doc.indexOf('<title>'));
});

// --- marcarVistas --------------------------------------------------------

test('cada vista del diseño queda con su ancla data-vista', () => {
  const t = '<sc-if value="{{ viewHome }}">H</sc-if><sc-if value="{{ viewMatch }}">M</sc-if>';
  const out = marcarVistas(t);
  assert.ok(out.includes('data-vista="home"'));
  assert.ok(out.includes('data-vista="match"'));
  assert.equal(renderizar(out, { viewHome: true, viewMatch: false }), '<div data-vista="home" style="display: contents">H</div>');
});
