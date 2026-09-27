-- Engagement del bot: historial dinámico, FREE diario, favoritos, alertas previas y resumen PRO.
-- No recalcula ni modifica probabilidades existentes. predicha_en sólo registra la hora
-- de creación de nuevas predicciones; la regla del motor sigue siendo write-once.
begin;

alter table public.eslo_predicciones add column if not exists predicha_en timestamptz;

create table public.eslo_stars_favoritos (
  user_id bigint not null references public.eslo_stars_usuarios(user_id) on delete cascade,
  match_id bigint not null references public.eslo_predicciones(match_id) on delete cascade,
  creado_en timestamptz not null default now(),
  primary key (user_id, match_id)
);
create index eslo_stars_favoritos_match on public.eslo_stars_favoritos(match_id);

create table public.eslo_stars_gratis_diario (
  user_id bigint not null references public.eslo_stars_usuarios(user_id) on delete cascade,
  dia date not null,
  match_id bigint not null references public.eslo_predicciones(match_id),
  asignado_en timestamptz not null default now(),
  primary key (user_id, dia)
);

create table public.eslo_stars_alertas_envios (
  user_id bigint not null references public.eslo_stars_usuarios(user_id) on delete cascade,
  match_id bigint not null references public.eslo_predicciones(match_id) on delete cascade,
  estado text not null check (estado in ('reservado','enviado','descartado')),
  reservado_en timestamptz not null default now(),
  enviado_en timestamptz,
  primary key (user_id, match_id)
);

create table public.eslo_stars_resumen_envios (
  user_id bigint not null references public.eslo_stars_usuarios(user_id) on delete cascade,
  dia date not null,
  estado text not null check (estado in ('reservado','enviado','descartado')),
  reservado_en timestamptz not null default now(),
  enviado_en timestamptz,
  primary key (user_id, dia)
);

alter table public.eslo_stars_favoritos enable row level security;
alter table public.eslo_stars_gratis_diario enable row level security;
alter table public.eslo_stars_alertas_envios enable row level security;
alter table public.eslo_stars_resumen_envios enable row level security;
revoke all on public.eslo_stars_favoritos, public.eslo_stars_gratis_diario,
  public.eslo_stars_alertas_envios, public.eslo_stars_resumen_envios from public, anon, authenticated;
grant select, insert, update, delete on public.eslo_stars_favoritos, public.eslo_stars_gratis_diario,
  public.eslo_stars_alertas_envios, public.eslo_stars_resumen_envios to service_role;

create function public.eslo_stars_engagement(p_accion text, p_datos jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  uid bigint := nullif(p_datos->>'user_id','')::bigint;
  mid bigint := nullif(p_datos->>'match_id','')::bigint;
  filas integer;
  elegido bigint;
  premium boolean;
  v_juego text := nullif(p_datos->>'juego','');
  v_prob double precision := nullif(p_datos->>'prob_a','')::double precision;
  v_conf double precision;
  v_low double precision;
  v_high double precision;
  dia date := (now() at time zone 'Etc/GMT+4')::date;
  pedido_dia date;
  inicio_dia timestamptz;
  fin_dia timestamptz;
  ayer_inicio timestamptz;
  ayer_fin timestamptz;
begin
  if p_accion = 'metricas' then
    if v_juego is not null and v_juego not in ('cs2','dota2','lol','valorant') then
      return jsonb_build_object('error','juego');
    end if;
    if v_prob is not null and (v_prob < 0 or v_prob > 1) then
      return jsonb_build_object('error','probabilidad');
    end if;
    if v_prob is not null then
      v_conf := greatest(v_prob, 1-v_prob);
      v_low := case when v_conf >= 0.9 then 0.9 else floor(v_conf * 10.0) / 10.0 end;
      v_high := case when v_low >= 0.9 then 1.000001 else v_low + 0.1 end;
    end if;
    return jsonb_build_object(
      'total', (select count(*) from public.eslo_predicciones p
        where p.resultado_real in ('ganaA','ganaB') and p.prob_a between 0 and 1
          and (v_juego is null or p.juego=v_juego)),
      'aciertos', (select count(*) from public.eslo_predicciones p
        where p.resultado_real in ('ganaA','ganaB') and p.prob_a between 0 and 1
          and (v_juego is null or p.juego=v_juego)
          and ((p.prob_a >= 0.5 and p.resultado_real='ganaA') or (p.prob_a < 0.5 and p.resultado_real='ganaB'))),
      'porcentaje', (select round(100.0 * count(*) filter (where
          (p.prob_a >= 0.5 and p.resultado_real='ganaA') or (p.prob_a < 0.5 and p.resultado_real='ganaB'))
          / nullif(count(*),0), 1)
        from public.eslo_predicciones p
        where p.resultado_real in ('ganaA','ganaB') and p.prob_a between 0 and 1
          and (v_juego is null or p.juego=v_juego)),
      'por_juego', coalesce((select jsonb_agg(jsonb_build_object('juego',q.juego,'n',q.n,'aciertos',q.aciertos,
          'porcentaje',round(100.0*q.aciertos/nullif(q.n,0),1)) order by q.juego)
        from (select p.juego, count(*)::integer n,
          count(*) filter (where (p.prob_a >= 0.5 and p.resultado_real='ganaA') or
            (p.prob_a < 0.5 and p.resultado_real='ganaB'))::integer aciertos
          from public.eslo_predicciones p
          where p.resultado_real in ('ganaA','ganaB') and p.prob_a between 0 and 1
            and p.juego in ('cs2','dota2','lol','valorant')
          group by p.juego) q), '[]'::jsonb),
      'banda', case when v_prob is null then null else (select jsonb_build_object(
          'n',count(*),'aciertos',count(*) filter (where
            (p.prob_a >= 0.5 and p.resultado_real='ganaA') or (p.prob_a < 0.5 and p.resultado_real='ganaB')),
          'porcentaje',round(100.0 * count(*) filter (where
            (p.prob_a >= 0.5 and p.resultado_real='ganaA') or (p.prob_a < 0.5 and p.resultado_real='ganaB'))
            / nullif(count(*),0),1),
          'desde',v_low,'hasta',case when v_high > 1 then 1 else v_high end)
        from public.eslo_predicciones p
        where p.resultado_real in ('ganaA','ganaB') and p.prob_a between 0 and 1
          and (v_juego is null or p.juego=v_juego)
          and greatest(p.prob_a::double precision,1-p.prob_a::double precision) >= v_low
          and greatest(p.prob_a::double precision,1-p.prob_a::double precision) < v_high) end
    );
  end if;

  if p_accion = 'preparar_alertas' then
    return jsonb_build_object('ok',true,'items',coalesce((select jsonb_agg(jsonb_build_object(
      'user_id',f.user_id,'match_id',f.match_id) order by p.inicio_programado,f.user_id)
      from public.eslo_stars_favoritos f
      join public.eslo_stars_usuarios u using(user_id)
      join public.eslo_predicciones p using(match_id)
      where u.premium_expira_en > now() and p.inicio_programado > now()
        and p.inicio_programado <= now()+interval '60 minutes'
        and not exists(select 1 from public.eslo_stars_alertas_envios e
          where e.user_id=f.user_id and e.match_id=f.match_id)), '[]'::jsonb));
  end if;

  if p_accion = 'preparar_resumen' then
    inicio_dia := dia::timestamp at time zone 'Etc/GMT+4';
    fin_dia := (dia + 1)::timestamp at time zone 'Etc/GMT+4';
    ayer_inicio := (dia - 1)::timestamp at time zone 'Etc/GMT+4';
    ayer_fin := inicio_dia;
    return jsonb_build_object(
      'ok',true,'dia',dia,
      'destinatarios',coalesce((select jsonb_agg(u.user_id order by u.user_id)
        from public.eslo_stars_usuarios u where u.premium_expira_en > now()
          and not exists(select 1 from public.eslo_stars_resumen_envios e where e.user_id=u.user_id and e.dia=dia)), '[]'::jsonb),
      'conteos',jsonb_build_object(
        'cs2',(select count(*) from public.eslo_predicciones p where p.juego='cs2' and p.inicio_programado>=greatest(now(),inicio_dia) and p.inicio_programado<fin_dia),
        'dota2',(select count(*) from public.eslo_predicciones p where p.juego='dota2' and p.inicio_programado>=greatest(now(),inicio_dia) and p.inicio_programado<fin_dia),
        'lol',(select count(*) from public.eslo_predicciones p where p.juego='lol' and p.inicio_programado>=greatest(now(),inicio_dia) and p.inicio_programado<fin_dia),
        'valorant',(select count(*) from public.eslo_predicciones p where p.juego='valorant' and p.inicio_programado>=greatest(now(),inicio_dia) and p.inicio_programado<fin_dia)),
      'ayer_total',(select count(*) from public.eslo_predicciones p
        where p.inicio_programado>=ayer_inicio and p.inicio_programado<ayer_fin
          and p.resultado_real in ('ganaA','ganaB') and p.prob_a between 0 and 1),
      'ayer_aciertos',(select count(*) from public.eslo_predicciones p
        where p.inicio_programado>=ayer_inicio and p.inicio_programado<ayer_fin
          and p.resultado_real in ('ganaA','ganaB') and p.prob_a between 0 and 1
          and ((p.prob_a >= 0.5 and p.resultado_real='ganaA') or (p.prob_a < 0.5 and p.resultado_real='ganaB')))
    );
  end if;

  if uid is null or uid <= 0 then return jsonb_build_object('error','usuario'); end if;
  perform pg_catalog.pg_advisory_xact_lock(uid);
  insert into public.eslo_stars_usuarios(user_id) values(uid)
    on conflict(user_id) do update set visto_en=now();
  select coalesce(premium_expira_en > now(),false) into premium
    from public.eslo_stars_usuarios where user_id=uid;

  if p_accion = 'gratis' then
    select g.match_id into elegido from public.eslo_stars_gratis_diario g where g.user_id=uid and g.dia=dia;
    if elegido is null then
      select p.match_id into elegido from public.eslo_predicciones p
        where p.inicio_programado > now() and p.inicio_programado <= now()+interval '36 hours'
          and p.prob_a between 0 and 1 and p.juego in ('cs2','dota2','lol','valorant')
        order by p.inicio_programado,p.match_id limit 1;
      if elegido is null then return jsonb_build_object('ok',false,'motivo','sin_partidos','dia',dia); end if;
      insert into public.eslo_stars_gratis_diario(user_id,dia,match_id) values(uid,dia,elegido)
        on conflict(user_id,dia) do nothing;
      select g.match_id into elegido from public.eslo_stars_gratis_diario g where g.user_id=uid and g.dia=dia;
    end if;
    return jsonb_build_object('ok',true,'dia',dia,'match_id',elegido);
  elsif p_accion = 'favoritos' then
    return jsonb_build_object('ok',true,'premium',premium,'match_ids',coalesce((select jsonb_agg(f.match_id order by p.inicio_programado,p.match_id)
      from public.eslo_stars_favoritos f join public.eslo_predicciones p using(match_id)
      where f.user_id=uid and p.inicio_programado > now()), '[]'::jsonb));
  elsif p_accion in ('favorito_agregar','favorito_quitar') then
    if mid is null or mid <= 0 then return jsonb_build_object('error','partido'); end if;
    if p_accion='favorito_quitar' then
      delete from public.eslo_stars_favoritos where user_id=uid and match_id=mid;
      return jsonb_build_object('ok',true,'favorito',false);
    end if;
    if not premium then return jsonb_build_object('error','pro'); end if;
    if not exists(select 1 from public.eslo_predicciones p where p.match_id=mid and p.inicio_programado>now()) then
      return jsonb_build_object('error','partido');
    end if;
    insert into public.eslo_stars_favoritos(user_id,match_id) values(uid,mid) on conflict do nothing;
    return jsonb_build_object('ok',true,'favorito',true);
  elsif p_accion = 'reservar_alerta' then
    if mid is null or not premium or not exists(select 1 from public.eslo_stars_favoritos f
      join public.eslo_predicciones p using(match_id) where f.user_id=uid and f.match_id=mid
        and p.inicio_programado>now() and p.inicio_programado<=now()+interval '60 minutes') then
      return jsonb_build_object('ok',false,'motivo','no_elegible');
    end if;
    insert into public.eslo_stars_alertas_envios(user_id,match_id,estado) values(uid,mid,'reservado') on conflict do nothing;
    get diagnostics filas=row_count;
    return jsonb_build_object('ok',filas=1,'motivo',case when filas=1 then null else 'duplicado' end);
  elsif p_accion = 'confirmar_alerta' then
    update public.eslo_stars_alertas_envios set estado='enviado',enviado_en=now()
      where user_id=uid and match_id=mid and estado='reservado';
    return jsonb_build_object('ok',true);
  elsif p_accion = 'liberar_alerta' then
    delete from public.eslo_stars_alertas_envios where user_id=uid and match_id=mid and estado='reservado';
    return jsonb_build_object('ok',true);
  elsif p_accion = 'descartar_alerta' then
    update public.eslo_stars_alertas_envios set estado='descartado'
      where user_id=uid and match_id=mid and estado='reservado';
    return jsonb_build_object('ok',true);
  elsif p_accion in ('reservar_resumen','confirmar_resumen','liberar_resumen','descartar_resumen') then
    pedido_dia := nullif(p_datos->>'dia','')::date;
    if pedido_dia is null or pedido_dia<>dia then return jsonb_build_object('ok',false,'motivo','dia'); end if;
    if p_accion='reservar_resumen' then
      if not premium then return jsonb_build_object('ok',false,'motivo','sin_pro'); end if;
      insert into public.eslo_stars_resumen_envios(user_id,dia,estado) values(uid,pedido_dia,'reservado') on conflict do nothing;
      get diagnostics filas=row_count;
      return jsonb_build_object('ok',filas=1,'motivo',case when filas=1 then null else 'duplicado' end);
    elsif p_accion='confirmar_resumen' then
      update public.eslo_stars_resumen_envios set estado='enviado',enviado_en=now()
        where user_id=uid and dia=pedido_dia and estado='reservado';
    elsif p_accion='liberar_resumen' then
      delete from public.eslo_stars_resumen_envios where user_id=uid and dia=pedido_dia and estado='reservado';
    else
      update public.eslo_stars_resumen_envios set estado='descartado'
        where user_id=uid and dia=pedido_dia and estado='reservado';
    end if;
    return jsonb_build_object('ok',true);
  end if;
  return jsonb_build_object('error','accion');
end;
$$;
revoke all on function public.eslo_stars_engagement(text,jsonb) from public,anon,authenticated;
grant execute on function public.eslo_stars_engagement(text,jsonb) to service_role;
commit;
