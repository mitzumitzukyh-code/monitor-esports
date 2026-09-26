import process from 'node:process';

// Los módulos originales usan process.env. Deno recibe los secretos del proyecto.
globalThis.process ??= process;
const [{ configuracionStars }, { clienteTelegram }, { almacenStars }, { crearBotStars },
  { crearReceptorStars }, { datosDeEquipos }, { MARCA }, { nombresParaPartidos }] = await Promise.all([
  import('../../../salida/stars/config.mjs'), import('../../../salida/stars/api.mjs'),
  import('../../../salida/stars/persistencia.mjs'), import('../../../salida/stars/bot.mjs'),
  import('../../../salida/stars/receptor.mjs'), import('../../../datos/juegos/bo3.mjs'),
  import('../../../salida/stars/marca.mjs'), import('../../../salida/stars/catalogo.mjs'),
]);
const config = configuracionStars();
if (!config.token || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Faltan credenciales Telegram/Supabase');
}
const bot = crearBotStars({ config, almacen: almacenStars(), api: clienteTelegram(config), marca: MARCA, nombresPartidos: nombresParaPartidos,
  nombres: (p) => datosDeEquipos([p.equipo_a, p.equipo_b], { juego: p.juego }) });
Deno.serve(crearReceptorStars({ secreto: config.secreto, bot, habilitado: config.habilitado,
  registrarError: console.error }));
