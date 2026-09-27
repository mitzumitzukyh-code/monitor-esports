import { esc } from '../telegram.mjs';
import { JUEGOS, fechaPartido, nombreEncuentro, zonaPublica } from './partidos.mjs';

export function mensajeCambioModelo(c,mapa=new Map()) {
  const anterior=Number(c?.anterior_prob_a), nueva=Number(c?.nueva_prob_a);
  if (![anterior,nueva].every(v=>Number.isFinite(v)&&v>=0&&v<=1)) return null;
  const nombreA=mapa.get(`${c.juego}:${c.equipo_a}`)?.nombre ?? `#${c.equipo_a}`;
  const nombreB=mapa.get(`${c.juego}:${c.equipo_b}`)?.nombre ?? `#${c.equipo_b}`;
  const favAntes=anterior>=0.5?nombreA:nombreB, favAhora=nueva>=0.5?nombreA:nombreB;
  const pa=Math.round(Math.max(anterior,1-anterior)*100), pn=Math.round(Math.max(nueva,1-nueva)*100);
  const cambio=favAntes!==favAhora
    ? `El favorito del modelo cambió: <b>${esc(favAntes)}</b> → <b>${esc(favAhora)}</b>.`
    : `<b>${esc(favAhora)}</b>: ${pa}% → ${pn}%.`;
  return [
    '🔔 <b>Cambio en la predicción</b>',
    `${esc(JUEGOS[c.juego]??c.juego)} · ${esc(nombreEncuentro(c,mapa))}`,
    cambio,
    `${esc(fechaPartido(c.inicio_programado))} · ${zonaPublica(c.inicio_programado)}`,
    '',
    '🔒 La predicción oficial sigue congelada; este aviso te informa que el análisis posterior cambió.',
  ].join('\n');
}

const permanente=e=>/: (400|403)$/.test(String(e?.message));

export async function despacharCambiosModelo({accion,api,nombresPartidos=async()=>new Map(),
  pausa=()=>new Promise(r=>setTimeout(r,50))}) {
  const {cambios=[]}=await accion('preparar',{});
  const out={cambios:0,enviados:0,omitidos:0,fallidos:0};
  for(const c of cambios) {
    const destinos=(c.destinatarios??[]).map(Number).filter(id=>Number.isSafeInteger(id)&&id>0);
    if(!destinos.length) continue;
    const mapa=await nombresPartidos([c]).catch(()=>new Map());
    const texto=mensajeCambioModelo(c,mapa); if(!texto) continue;
    out.cambios++;
    for(const user_id of destinos) {
      const datos={cambio_id:Number(c.cambio_id),user_id};
      const r=await accion('reservar',datos);
      if(!r?.ok){out.omitidos++;continue;}
      try{
        await api('sendMessage',{chat_id:user_id,text:texto,parse_mode:'HTML',
          link_preview_options:{is_disabled:true},protect_content:true,
          reply_markup:{inline_keyboard:[[{text:'Abrir análisis',callback_data:`analisis:${c.match_id}`}],
            [{text:'⭐ Mis partidos',callback_data:'mios'}]]}});
        await accion('confirmar',datos); out.enviados++;
      }catch(e){
        await accion(permanente(e)?'descartar':'liberar',datos); out.fallidos++;
      }
      await pausa();
    }
  }
  return out;
}
