import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { crearFuenteApi } from '../miniapp/src/datos/api.mjs';
import { crearTelegram } from '../miniapp/src/telegram.mjs';
import { accesoDe, forma, h2h, politicaAcceso } from '../supabase/functions/esport-miniapp/acceso.mjs';
import { calcularHashInitData, validarInitData } from '../supabase/functions/esport-miniapp/telegram-init.mjs';
import { PERIODO_PRO, VERSION_TERMINOS, configuracionCompra, facturaTelegram } from '../supabase/functions/esport-miniapp/compra.mjs';

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

test('initData: el HMAC coincide con una implementación independiente de la fórmula oficial', async () => {
  const pares = [
    ['auth_date', String(AUTH)],
    ['query_id', 'vector-independiente'],
    ['user', JSON.stringify({ id: 123, first_name: 'A' })],
  ];
  const dataCheck = [...pares].sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  const esperado = createHmac('sha256', secret).update(dataCheck).digest('hex');
  assert.equal(await calcularHashInitData(pares, TOKEN), esperado);
});

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

test('fuente API cachea lecturas cortas y deduplica llamadas simultáneas', async () => {
  let llamadas = 0;
  const fetchImpl = async () => {
    llamadas++;
    await new Promise((r) => setTimeout(r, 5));
    return new Response(JSON.stringify({ ok: true, data: { perfil: free, partidos: [] } }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  };
  const fuente = crearFuenteApi({
    baseUrl: 'https://example.test/api',
    initData: 'auth_date=1&hash=x',
    fetchImpl,
  });

  await Promise.all([
    fuente.partidos({ juego: 'lol', periodo: 'proximos' }),
    fuente.partidos({ juego: 'lol', periodo: 'proximos' }),
  ]);
  assert.equal(llamadas, 1, 'dos cargas iguales simultáneas comparten la misma solicitud');

  await fuente.partidos({ juego: 'lol', periodo: 'proximos' });
  assert.equal(llamadas, 1, 'la lectura inmediata sale del cache');
});

test('checkout Stars: factura PRO usa XTR, un precio y suscripción de 30 días', () => {
  const f = facturaTelegram({
    producto: 'pro', amount: 250, payload: 'espro:abc', recurrente: true,
  });
  assert.equal(f.currency, 'XTR');
  assert.deepEqual(f.prices, [{ label: 'PRO 30 días', amount: 250 }]);
  assert.equal(f.subscription_period, PERIODO_PRO);
  assert.equal(Object.hasOwn(f, 'provider_token'), false, 'Stars no envía provider_token');
  assert.equal(VERSION_TERMINOS, '2026-09-26-v3');
});

test('checkout Stars: factura individual no renueva y valida partido', () => {
  const f = facturaTelegram({
    producto: 'partido', amount: 50, payload: 'espro:def', matchId: 42, recurrente: false,
  });
  assert.equal(f.currency, 'XTR');
  assert.equal(f.subscription_period, undefined);
  assert.match(f.title, /42/);
  assert.throws(() => facturaTelegram({ producto: 'partido', amount: 50, payload: 'x', matchId: 0 }), /partido/);
});

test('configuración de compra sólo se habilita con precios válidos y flag explícito', () => {
  const env = new Map([
    ['TELEGRAM_STARS_ENABLED', 'true'],
    ['TELEGRAM_PRO_STARS', '250'],
    ['TELEGRAM_MATCH_STARS', '50'],
    ['TELEGRAM_PRO_RECURRING', 'true'],
  ]);
  assert.deepEqual(configuracionCompra((k) => env.get(k) ?? ''), {
    habilitado: true, pro: 250, partido: 50, recurrente: true,
  });
  env.set('TELEGRAM_PRO_STARS', '0');
  assert.equal(configuracionCompra((k) => env.get(k) ?? '').habilitado, false);
});

test('fuente API crea checkout sólo por POST firmado y devuelve invoice_url', async () => {
  const vistas = [];
  const fuente = crearFuenteApi({
    baseUrl: 'https://example.supabase.co/functions/v1/esport-miniapp',
    initData: () => 'auth_date=1&hash=x',
    fetchImpl: async (url, opciones) => {
      vistas.push({ url: url.toString(), opciones });
      return new Response(JSON.stringify({
        ok: true,
        data: { invoice_url: 'https://t.me/$invoice_segura', producto: 'pro', amount: 250, recurrente: true },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });
  const compra = await fuente.comprar({ producto: 'pro', aceptarTerminos: true });
  assert.equal(compra.invoice_url, 'https://t.me/$invoice_segura');
  assert.match(vistas[0].url, /recurso=compra/);
  assert.equal(vistas[0].opciones.method, 'POST');
  assert.equal(vistas[0].opciones.headers['X-Telegram-Init-Data'], 'auth_date=1&hash=x');
  const body = JSON.parse(vistas[0].opciones.body);
  assert.deepEqual(body, { producto: 'pro', match_id: null, aceptar_terminos: true });
});

test('fuente API traduce órdenes duplicadas y compras apagadas a mensajes de usuario', async () => {
  for (const [error, patron] of [
    ['pro_activo_o_pendiente', /PRO activo o una compra pendiente/],
    ['ya_comprado', /Ya tienes acceso/],
    ['compras_desactivadas', /temporalmente desactivadas/],
  ]) {
    const fuente = crearFuenteApi({
      baseUrl: 'https://example.test/api',
      initData: 'x',
      fetchImpl: async () => new Response(JSON.stringify({ ok: false, error }), {
        status: 409, headers: { 'Content-Type': 'application/json' },
      }),
    });
    await assert.rejects(fuente.comprar({ producto: 'pro', aceptarTerminos: true }), (e) => patron.test(e.mensajeUsuario));
  }
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

test('Edge Function real tiene sintaxis JavaScript válida antes de desplegar', () => {
  const ruta = fileURLToPath(new URL('../supabase/functions/esport-miniapp/index.mjs', import.meta.url));
  const r = spawnSync(process.execPath, ['--check', ruta], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
});
