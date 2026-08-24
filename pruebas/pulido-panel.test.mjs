// Pruebas del pulido del panel: los helpers puros de valores.mjs y las
// transformaciones de pulir.mjs. Los números esperados salen a mano:
// distribucionMarcadores y probabilidadPartidaDesdeSerie ya tienen su prueba
// en series.test.mjs -- acá se prueba el CABLE, no la matemática.

import test from 'node:test';
import assert from 'node:assert/strict';

import { mejorMarcadorDePrediccion, fraseSeriesProximas, logoDeJuego, estadoSupabase } from '../salida/web/valores.mjs';
import { pulir } from '../salida/web/pulir.mjs';

test('mejorMarcadorDePrediccion: favorito claro en bo3 marca 2–0 o 0–2', () => {
  const aFavor = mejorMarcadorDePrediccion(0.95, 'bo3');
  const enContra = mejorMarcadorDePrediccion(0.05, 'bo3');
  assert.match(aFavor, /^2–0 \(/);
  assert.match(enContra, /^0–2 \(/);
});

test('mejorMarcadorDePrediccion: favorito moderado en bo3 también marca barrida (es la matemática, no un sesgo)', () => {
  // En un bo3 con p>0.5 el 2–0 DOMINA al 2–1 para todo p (p² > 2p²(1-p));
  // no hay zona donde el marcador cerrado sea el más probable.
  assert.match(mejorMarcadorDePrediccion(0.7, 'bo3'), /^2–0 \(/);
});

test('mejorMarcadorDePrediccion: 50/50 exacto empata los cuatro marcadores y cualquiera es respuesta', () => {
  const m = mejorMarcadorDePrediccion(0.5, 'bo3');
  assert.match(m, /^(2–0|2–1|1–2|0–2) \(2[45]\.\d %\)$/, `salio: ${m}`);
});

test('mejorMarcadorDePrediccion: bo1 se decide con un solo mapa', () => {
  assert.match(mejorMarcadorDePrediccion(0.8, 'bo1'), /^1–0 \(/);
});

test('mejorMarcadorDePrediccion: formato desconocido o dato roto sale «—», nunca inventa', () => {
  assert.equal(mejorMarcadorDePrediccion(0.6, 'bo7'), '—');
  assert.equal(mejorMarcadorDePrediccion(0.6, ''), '—');
  assert.equal(mejorMarcadorDePrediccion(null, 'bo3'), '—');
  assert.equal(mejorMarcadorDePrediccion('n/a', 'bo3'), '—');
});

test('fraseSeriesProximas concuerda sustantivo Y adjetivo', () => {
  assert.equal(fraseSeriesProximas(1), '1 serie próxima');
  assert.equal(fraseSeriesProximas(2), '2 series próximas');
  assert.equal(fraseSeriesProximas(11), '11 series próximas');
});

test('logoDeJuego: los cuatro juegos tienen logo y un juego raro no', () => {
  for (const j of ['DOTA 2', 'CS2', 'LOL', 'VALORANT']) {
    assert.match(logoDeJuego(j), /^logos\/[a-z0-9]+\.png$/);
  }
  assert.equal(logoDeJuego('R6 SIEGE'), '');
});

test('estadoSupabase: torneo cerrado NO es "sin credenciales"', () => {
  // El caso que pintaba Supabase en rojo con todo funcionando: la respuesta
  // llegó bien, simplemente ya no hay series por jugar.
  assert.deepEqual(estadoSupabase([]), { estado: 'ok', detalle: 'sin series próximas · torneo cerrado' });
  assert.deepEqual(estadoSupabase(null), { estado: 'respaldo', detalle: 'sin credenciales' });
  assert.deepEqual(estadoSupabase({ error: 'timeout' }), { estado: 'caido', detalle: 'no respondió' });
  assert.deepEqual(estadoSupabase([{ seriesId: 'x' }]), { estado: 'ok', detalle: '1 serie próxima' });
});

// --- transformaciones del chrome ------------------------------------------

function cuerpoCon(piezas) {
  return piezas.join('\n');
}

// El cuerpo mínimo lleva TODAS las piezas que pulir() exige; cada prueba de
// regla rompe sólo la suya y espera que el aviso sea el correcto.
const BLOQUE_USUARIO = [
  '    <header>',
  '      <div style="display: flex; align-items: center; gap: 18px; justify-self: end;">',
  '        <div style="position: relative; color: #A7ADB8; display: flex;">',
  '          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8.5a6 6 0 1 0-12 0c0 6-2 7.5-2 7.5h16s-2-1.5-2-7.5" /><path d="M13.7 19.5a2 2 0 0 1-3.4 0" /></svg>',
  '          <span style="position: absolute; top: -5px; right: -6px; min-width: 14px; height: 14px; border-radius: 999px; background: #FF2638; color: #05070A; font-size: 8.5px; font-weight: 800; display: flex; align-items: center; justify-content: center; padding: 0 3px;">3</span>',
  '        </div>',
  '        <div style="display: flex; align-items: center; gap: 10px;">',
  '          <div style="width: 30px; height: 30px; border-radius: 999px; border: 1px solid #343943; background: #15181E; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 800; color: #FF2638;">JP</div>',
  '          <div style="display: flex; flex-direction: column; gap: 1px;">',
  '            <div style="font-size: 12px; font-weight: 700; line-height: 1.1;">JugadorPro</div>',
  '            <div style="font-size: 10px; color: #6F7784; line-height: 1.1;">Nivel 24</div>',
  '          </div>',
  '          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6F7784" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>',
  '        </div>',
  '      </div>',
  '    </header>',
].join('\n');

const DISENIO_MINIMO = [
  '<div style="display: flex; align-items: center; justify-content: center; height: 34px; color: #6F7784;">',
  '  <svg width="19" height="14" viewBox="0 0 19 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M1 1h17M1 7h17M1 13h17" /></svg>',
  '</div>',
  '<div onClick="{{ goHome }}" style="{{ railHome }}">INICIO</div>',
  '<div onClick="{{ goContacto }}" style="{{ railAjustes }}">',
  '  <span style="font-size: 8.5px;">AJUSTES</span>',
  '</div>',
  '<div style="font-size: 10.5px; color: #4B5360; letter-spacing: 0.08em; font-weight: 600; white-space: nowrap;">PROBABILIDAD DEL MOTOR VS MERCADO SIN VIG</div>',
  '<div style="font-size: 8.5px; font-weight: 700; letter-spacing: 0.12em; color: #6F7784;">MERCADO SIN VIG</div>',
  '<span style="{{ p.chip }}">{{ p.juego }}</span>',
  '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(390px, 1fr)); gap: 16px;"></div>',
  '<div style="{{ p.escudoA }}">{{ p.inicialA }}</div>',
  '<div style="{{ p.escudoB }}">{{ p.inicialB }}</div>',
  '<div style="{{ r.escudoA }}">{{ r.inicialA }}</div>',
  '<div style="{{ r.escudoB }}">{{ r.inicialB }}</div>',
  '<div style="{{ mEscudoA }}">{{ mInicialA }}</div>',
  '<div style="{{ mEscudoB }}">{{ mInicialB }}</div>',
  BLOQUE_USUARIO,
].join('\n');

test('pulir: quita hamburguesa y AJUSTES, arregla etiqueta, chip y rejilla', () => {
  const out = pulir(DISENIO_MINIMO);

  assert.ok(!out.includes('height: 34px; color: #6F7784'), 'la hamburguesa sigue ahí');
  assert.ok(!out.includes('railAjustes'), 'AJUSTES sigue en el rail');
  assert.ok(!out.includes('MERCADO SIN VIG'), 'la etiqueta cortada sigue');
  assert.ok(out.includes('CALIFICADA CONTRA EL RESULTADO'), 'la etiqueta honesta no quedó');
  assert.ok(out.includes('<sc-if value="{{ p.logoJuego }}">'), 'el chip no quedó cableado al logo');
  assert.ok(out.includes('repeat(auto-fit, minmax(min(100%, 430px), 430px)); justify-content: center;'), 'la rejilla no quedó centrada');
});

test('pulir: los escudos llevan <img> con onerror y caen a la inicial', () => {
  const out = pulir(DISENIO_MINIMO);
  assert.ok(out.includes('<sc-if value="{{ p.logoA }}"><img src="{{ p.logoA }}"'), 'el escudo A de la tarjeta no lleva logo');
  assert.ok(out.includes('onerror="this.remove()"'), 'el onerror del escudo no quedó');
  assert.ok(out.includes('<span>{{ p.inicialA }}</span>'), 'la inicial del escudo se perdió');
  assert.ok(out.includes('<sc-if value="{{ mLogoB }}">'), 'el escudo B de la ficha no lleva logo');
});

test('pulir: si el diseño cambia y una regla ya no calza, avisa en voz alta', () => {
  const sinEtiqueta = DISENIO_MINIMO.replace(/PROBABILIDAD DEL MOTOR VS MERCADO SIN VIG/g, 'OTRA COSA');
  assert.throws(() => pulir(sinEtiqueta), /no encontré la etiqueta cortada/);
});

test('pulir: reemplaza al usuario falso por el enlace honesto al repo', () => {
  const conUsuario = DISENIO_MINIMO.replace(BLOQUE_USUARIO, BLOQUE_USUARIO);

  const out = pulir(conUsuario);
  assert.ok(!out.includes('JugadorPro'), 'el usuario de mentira sigue');
  assert.ok(!out.includes('Nivel 24'), 'el nivel falso sigue');
  assert.ok(!out.includes('>3</span>'), 'el badge falso de notificaciones sigue');
  assert.ok(out.includes('github.com/mitzumitzukyh-code/monitor-esports'), 'el enlace honesto al repo no quedó');
});

// anotarFilas (el filtro del panel viejo) murió con disenio.dc.html; la sala
// de control lleva sus pruebas en sala.test.mjs.
