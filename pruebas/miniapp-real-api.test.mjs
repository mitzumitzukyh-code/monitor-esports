import test from 'node:test';
import assert from 'node:assert/strict';
import { crearFuenteApi } from '../miniapp/src/datos/api.mjs';
import { crearTelegram } from '../miniapp/src/telegram.mjs';
import { accesoDe, forma, h2h, politicaAcceso } from '../supabase/functions/esport-miniapp/acceso.mjs';
import { calcularHashInitData, validarInitData } from '../supabase/functions/esport-miniapp/telegram-init.mjs';

const TOKEN = '123456789:AAabcdefghijklmnopqrstuvxyzABCDEFG';
const AHORA = Date.parse('2026-09-28T12:00:00Z');
const AUTH = Math.floor(AHORA / 1000);

async function initFirmado({ authDate = AUTH, user = { id: 987654321, first_name: 'Mitzu' }, extra = [] } = {}) {
  const pares = [
    ['auth_date', String(authDate)],
    ['query_id', 'AAH-demo-query'],
    ['user', JSON.stringify(user)],
    ...extra,
  ];
  const hash = await calcularHashInitData(pares, TOKEN);
  const p = new URLSearchParams([...pares, ['hash', hash]]);
  return p.toString();
}

test('initData: valida HMAC, edad e identidad desde la cadena firmada', async () => {
  const raw = await initFirmado();
  const s = await validarInitData(raw, { botToken: TOKEN, ahora: AHORA });
  assert.equal(s.user.id, 987654321);
  assert.equal(s.user.first_name, 'Mitzu');
  assert.equal(s.queryId, 'AAH-demo-query');
});

test('initData: rechaza manipulación, datos vencidos y claves duplicadas', async () => {
  const raw = await initFirmado();
  const manipulado = raw.replace(encodeURIComponent('Mitzu'), encodeURIComponent('Otro'));
  await assert.rejects(validarInitData(manipulado, { botToken: TOKEN, ahora: AHORA }), /firma Telegram inválida/);

  const viejo = await initFirmado({ authDate: AUTH - 301 });
  await assert.rejects(validarInitData(viejo, { botToken: TOKEN, ahora: AHORA, maxAgeSeconds: 300 }), /vencido/);

  const duplicado = raw + '&user=' + encodeURIComponent(JSON.stringify({ id: 1, first_name: 'X' }));
  await assert.rejects(validarInitData(duplicado, { botToken: TOKEN, ahora: AHORA }), /duplicado/);
});

test('initData: admite el campo signature nuevo sin volver confiable initDataUnsafe', async () => {
  const base = [
    ['auth_date', String(AUTH)],
    ['query_id', 'q'],
    ['user', JSON.stringify({ id: 77, first_name: 'A' })],
  ];
  const hash = await calcularHashInitData(base, TOKEN);
  const raw = new URLSearchParams([...base, ['signature', 'firma-ed25519-de-tercero'], ['hash', hash]]).toString();
  const s = await validarInitData(raw, { botToken: TOKEN, ahora: AHORA });
  assert.equal(s.user.id, 77);
});

const fila = {
  match_id: 42,
  prob_a: 0.64,
  inicio_programado: '2026-09-28T18:00:00Z',
  resultado_real: null,
};
const free = { plan: 'free', gratis_hoy: 42, analisis_comprados: [] };

test('acceso server-side: FREE ve probabilidad pero no análisis; otro partido queda redactado', () => {
  assert.equal(accesoDe(fila, free), 'gratis');
  assert.deepEqual(politicaAcceso(fila, free), { acceso: 'gratis', prob_a: 0.64, analisisPermitido: false });

  const bloqueado = politicaAcceso({ ...fila, match_id: 43 }, free);
  assert.equal(bloqueado.acceso, 'bloqueado');
  assert.equal(bloqueado.prob_a, null);
  assert.equal(bloqueado.analisisPermitido, false);
});

test('acceso server-side: PRO e individual abren análisis; finalizado siempre es auditoría', () => {
  const pro = { plan: 'pro', gratis_hoy: null, analisis_comprados: [] };
  assert.deepEqual(politicaAcceso(fila, pro), { acceso: 'pro', prob_a: 0.64, analisisPermitido: true });

  const individual = { plan: 'free', gratis_hoy: null, analisis_comprados: [42] };
  assert.equal(politicaAcceso(fila, individual).acceso, 'individual');
  assert.equal(politicaAcceso(fila, individual).analisisPermitido, true);

  const cerrado = politicaAcceso({ ...fila, resultado_real: 'ganaA' }, pro);
  assert.equal(cerrado.acceso, 'auditoria');
  assert.equal(cerrado.analisisPermitido, false);
});

test('análisis real: forma respeta perspectiva del equipo y H2H cuenta series', () => {
  const hist = [
    { equipo_a: 1, equipo_b: 2, resultado_real: 'ganaA', inicio_programado: '2026-09-27T10:00:00Z' },
    { equipo_a: 3, equipo_b: 1, resultado_real: 'ganaA', inicio_programado: '2026-09-26T10:00:00Z' },
    { equipo_a: 2, equipo_b: 1, resultado_real: 'ganaB', inicio_programado: '2026-09-25T10:00:00Z' },
  ];
  assert.deepEqual(forma(hist, 1), { victorias: 2, total: 3, ultimas: ['G', 'P', 'G'] });
  assert.deepEqual(h2h(hist, 1, 2), { series: 2, ganadasA: 2 });
});

test('fuente API manda initData crudo y conserva la interfaz de la demo', async () => {
  const vistas = [];
  const fetchImpl = async (url, opciones) => {
    vistas.push({ url: url.toString(), opciones });
    return new Response(JSON.stringify({ ok: true, data: { perfil: free, partidos: [] } }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  };
  const fuente = crearFuenteApi({
    baseUrl: 'https://example.supabase.co/functions/v1/esport-miniapp',
    initData: () => 'auth_date=1&hash=x',
    fetchImpl,
  });
  const r = await fuente.partidos({ juego: 'cs2', periodo: 'hoy' });
  assert.deepEqual(r.partidos, []);
  assert.equal(fuente.demo, false);
  assert.match(vistas[0].url, /recurso=partidos/);
  assert.match(vistas[0].url, /juego=cs2/);
  assert.equal(vistas[0].opciones.headers['X-Telegram-Init-Data'], 'auth_date=1&hash=x');
});

test('fuente API falla cerrado si no hay initData o el servidor rechaza la sesión', async () => {
  const sinTelegram = crearFuenteApi({ baseUrl: 'https://example.test/api', initData: '' });
  await assert.rejects(sinTelegram.perfil(), (e) => /desde Telegram/.test(e.mensajeUsuario));

  const vencida = crearFuenteApi({
    baseUrl: 'https://example.test/api',
    initData: 'x',
    fetchImpl: async () => new Response(JSON.stringify({ ok: false }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    }),
  });
  await assert.rejects(vencida.perfil(), (e) => /sesión de Telegram venció/.test(e.mensajeUsuario));
});

test('adaptador Telegram expone initData exacto sólo dentro del cliente', () => {
  const raiz = { dataset: {}, style: { setProperty() {} } };
  const app = {
    platform: 'android',
    initData: 'query_id=q&auth_date=1&hash=abc',
    isVersionAtLeast: () => false,
    ready() {}, expand() {},
  };
  const tg = crearTelegram({ document: { documentElement: raiz }, Telegram: { WebApp: app } });
  assert.equal(tg.initData(), app.initData);

  const fuera = crearTelegram({ document: { documentElement: raiz } });
  assert.equal(fuera.initData(), '');
});
