import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { rpc } from '../datos/supabase.mjs';
import { cifrarRespaldo, descifrarRespaldo, sqlRestauracion } from '../salida/stars/respaldo.mjs';

try {
  const argumento = (nombre) => process.argv.find((a) => a.startsWith(`${nombre}=`))?.slice(nombre.length + 1);
  const archivo = argumento('--archivo');
  if (process.argv.includes('--verificar')) {
    if (!archivo) throw Error('Indicar --archivo=RUTA');
    descifrarRespaldo(await readFile(archivo, 'utf8'), process.env.TELEGRAM_STARS_BACKUP_KEY);
    console.log('Respaldo descifrado y validado. No se modificó ninguna base.');
  } else if (process.argv.includes('--preparar-restauracion')) {
    const salida = argumento('--salida');
    if (!archivo || !salida) throw Error('Indicar --archivo=RUTA y --salida=SQL_PRIVADO');
    const copia = descifrarRespaldo(await readFile(archivo, 'utf8'), process.env.TELEGRAM_STARS_BACKUP_KEY);
    await writeFile(salida, sqlRestauracion(copia), { mode: 0o600, flag: 'wx' });
    console.log('SQL de recuperación privado preparado; no ejecutado. Contiene datos personales.');
  } else {
    const copia = await rpc('eslo_stars_respaldo', {});
    const cifrado = cifrarRespaldo(copia, process.env.TELEGRAM_STARS_BACKUP_KEY);
    descifrarRespaldo(cifrado, process.env.TELEGRAM_STARS_BACKUP_KEY);
    const destino = archivo ?? `work/respaldo-stars-${new Date().toISOString().replaceAll(':','-')}.enc.json`;
    await mkdir(dirname(resolve(destino)), { recursive: true });
    await writeFile(destino, cifrado, { mode: 0o600, flag: 'wx' });
    console.log('Respaldo cifrado creado y verificado. No contiene credenciales.');
  }
} catch (e) { console.error(e.message); process.exitCode = 1; }
