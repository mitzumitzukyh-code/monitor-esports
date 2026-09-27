import { readFile } from 'node:fs/promises';

const clamp = (p) => Math.min(1 - 1e-12, Math.max(1e-12, Number(p)));
const resultadoA = (r) => r === 'ganaA' ? 1 : r === 'ganaB' ? 0 : null;

export function brier(prob, real) {
  return (Number(prob) - Number(real)) ** 2;
}

export function logLoss(prob, real) {
  const p = clamp(prob);
  const y = Number(real);
  return -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
}

export function validarRegistro(r) {
  const y = resultadoA(r?.resultado_real);
  const pm = Number(r?.prob_modelo);
  const px = Number(r?.prob_mercado);
  const capt = Date.parse(r?.capturada_en);
  const ini = Date.parse(r?.inicio_programado);
  if (!Number.isSafeInteger(Number(r?.match_id)) || Number(r.match_id) <= 0) return false;
  if (!['cs2','dota2','lol','valorant'].includes(r?.juego)) return false;
  if (![pm, px].every(p => Number.isFinite(p) && p >= 0 && p <= 1)) return false;
  if (y === null || !Number.isFinite(capt) || !Number.isFinite(ini) || capt >= ini) return false;
  return true;
}

function resumen(filas) {
  if (!filas.length) return { n: 0, modelo: null, mercado: null, delta: null };
  let bm=0,bx=0,lm=0,lx=0,am=0,ax=0;
  for (const r of filas) {
    const y = resultadoA(r.resultado_real);
    bm += brier(r.prob_modelo, y);
    bx += brier(r.prob_mercado, y);
    lm += logLoss(r.prob_modelo, y);
    lx += logLoss(r.prob_mercado, y);
    am += ((r.prob_modelo >= 0.5) === (y === 1)) ? 1 : 0;
    ax += ((r.prob_mercado >= 0.5) === (y === 1)) ? 1 : 0;
  }
  const n=filas.length;
  return {
    n,
    modelo:{ brier:bm/n, log_loss:lm/n, acierto:am/n },
    mercado:{ brier:bx/n, log_loss:lx/n, acierto:ax/n },
    delta:{ brier:(bm-bx)/n, log_loss:(lm-lx)/n, acierto:(am-ax)/n },
  };
}

export function compararMercado(registros) {
  const validos = registros.filter(validarRegistro);
  const porJuego = {};
  for (const juego of ['cs2','dota2','lol','valorant']) {
    porJuego[juego] = resumen(validos.filter(r => r.juego === juego));
  }
  return {
    total: resumen(validos),
    por_juego: porJuego,
    descartados: registros.length - validos.length,
    fuentes: [...new Set(validos.map(r => r.fuente).filter(Boolean))].sort(),
  };
}

export function parsearRegistros(texto) {
  const s=String(texto ?? '').trim();
  if (!s) return [];
  if (s.startsWith('[')) return JSON.parse(s);
  return s.split(/\r?\n/).filter(Boolean).map((linea,i)=>{
    try { return JSON.parse(linea); }
    catch { throw new Error(`JSONL inválido en línea ${i+1}`); }
  });
}

function pct(x){ return x == null ? '—' : `${(x*100).toFixed(1)}%`; }
function num(x){ return x == null ? '—' : x.toFixed(4); }

export function textoBenchmark(r) {
  const t=r.total;
  const ganador = !t.n ? 'sin muestra' :
    t.delta.brier < 0 ? 'Monitor menor Brier' :
      t.delta.brier > 0 ? 'Mercado menor Brier' : 'Brier empatado';
  const lineas=[
    '📐 Benchmark externo · Monitor vs mercado',
    `Muestra válida: ${t.n} · descartados: ${r.descartados}`,
    `Fuentes: ${r.fuentes.join(', ') || 'sin fuente'}`,
    '',
    `Monitor · Brier ${num(t.modelo?.brier)} · LogLoss ${num(t.modelo?.log_loss)} · Acierto ${pct(t.modelo?.acierto)}`,
    `Mercado · Brier ${num(t.mercado?.brier)} · LogLoss ${num(t.mercado?.log_loss)} · Acierto ${pct(t.mercado?.acierto)}`,
    `Δ Monitor−Mercado · Brier ${num(t.delta?.brier)} · LogLoss ${num(t.delta?.log_loss)} · Acierto ${pct(t.delta?.acierto)}`,
    `Lectura descriptiva: ${ganador}.`,
    '',
    'Sólo compara snapshots tomados antes del inicio del partido. No ejecuta operaciones.',
  ];
  return lineas.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const archivo=process.argv[2];
  if (!archivo) throw new Error('Uso: node juez/benchmark-mercado.mjs <archivo.json|jsonl>');
  const registros=parsearRegistros(await readFile(archivo,'utf8'));
  console.log(textoBenchmark(compararMercado(registros)));
}
