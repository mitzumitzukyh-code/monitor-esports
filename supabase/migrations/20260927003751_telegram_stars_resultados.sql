-- Resultados automáticos agrupados para PRO. No modifica predicciones ni el motor:
-- sólo lee resultados ya calificados y registra qué bloque recibió cada usuario.
begin;
create table public.eslo_stars_resultados_bloques (
  bloque_id bigint generated always as identity primary key,
  creado_en timestamptz not null default now()
);
-- Un resultado pertenece a un único bloque: nunca se repite en otro envío.
create table public.eslo_stars_resultados_items (
  match_id bigint primary key references public.eslo_predicciones(match_id),
  bloque_id bigint not null references public.eslo_stars_resultados_bloques
);
create index eslo_stars_resultados_items_bloque on public.eslo_stars_resultados_items(bloque_id);
create table public.eslo_stars_resultados_envios (
  bloque_id bigint not null references public.eslo_stars_resultados_bloques,
  user_id bigint not null references public.eslo_stars_usuarios,
  estado text not null check (estado in ('reservado','enviado','descartado')),
  reservado_en timestamptz not null default now(),
  enviado_en timestamptz,
  primary key (bloque_id, user_id)
);
alter table public.eslo_stars_resultados_bloques enable row level security;
alter table public.eslo_stars_resultados_items enable row level security;
alter table public.eslo_stars_resultados_envios enable row level security;
revoke all on public.eslo_stars_resultados_bloques, public.eslo_stars_resultados_items,
  public.eslo_stars_resultados_envios from public, anon, authenticated;
grant select, insert, update, delete on public.eslo_stars_resultados_bloques, public.eslo_stars_resultados_items,
  public.eslo_stars_resultados_envios to service_role;

create function public.eslo_stars_resultados(p_accion text, p_datos jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  ventana interval := make_interval(secs => coalesce((p_datos->>'ventana_segundos')::integer, 1800));
  uid bigint := (p_datos->>'user_id')::bigint;
  bid bigint := (p_datos->>'bloque_id')::bigint;
  nuevo bigint;
  filas integer;
begin
  if p_accion = 'preparar' then
    -- Un solo preparador a la vez: dos ejecuciones no crean bloques paralelos.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('eslo_stars_resultados'));
    -- Se abre bloque cuando el resultado pendiente más antiguo cumplió la ventana
    -- y el último bloque tiene al menos esa antigüedad. Así nunca salen dos
    -- mensajes separados por menos de la ventana.
    if exists (
      select 1 from public.eslo_predicciones p
      where p.resultado_real in ('ganaA','ganaB') and p.prob_a is not null
        and p.calificada_en > now() - interval '2 hours'
        and not exists (select 1 from public.eslo_stars_resultados_items i where i.match_id = p.match_id)
      having min(p.calificada_en) <= now() - ventana
    ) and not exists (
      select 1 from public.eslo_stars_resultados_bloques b where b.creado_en > now() - ventana
    ) then
      insert into public.eslo_stars_resultados_bloques default values returning bloque_id into nuevo;
      insert into public.eslo_stars_resultados_items(match_id, bloque_id)
        select p.match_id, nuevo from public.eslo_predicciones p
        where p.resultado_real in ('ganaA','ganaB') and p.prob_a is not null
          and p.calificada_en > now() - interval '2 hours'
          and not exists (select 1 from public.eslo_stars_resultados_items i where i.match_id = p.match_id);
    end if;
    -- Destinatarios: PRO vigente ahora y ya vigente al cerrar el bloque (un PRO
    -- nuevo no recibe bloques anteriores). Compras individuales y FREE no figuran.
    return jsonb_build_object('ok', true, 'nuevo', nuevo, 'bloques', coalesce((
      select jsonb_agg(jsonb_build_object(
        'bloque_id', b.bloque_id, 'hasta', b.creado_en,
        'items', (select jsonb_agg(jsonb_build_object('match_id', p.match_id, 'juego', p.juego,
            'equipo_a', p.equipo_a, 'equipo_b', p.equipo_b, 'prob_a', p.prob_a,
            'resultado_real', p.resultado_real, 'inicio_programado', p.inicio_programado)
            order by p.inicio_programado, p.match_id)
          from public.eslo_stars_resultados_items i join public.eslo_predicciones p using(match_id)
          where i.bloque_id = b.bloque_id),
        'destinatarios', coalesce((select jsonb_agg(u.user_id order by u.user_id)
          from public.eslo_stars_usuarios u
          where u.premium_expira_en > now()
            and exists (select 1 from public.eslo_stars_pagos pg join public.eslo_stars_ordenes o using(payload)
              where pg.user_id = u.user_id and o.producto = 'pro' and pg.reembolsado_en is null
                and pg.activado_en <= b.creado_en and pg.expira_en > b.creado_en)
            and not exists (select 1 from public.eslo_stars_resultados_envios e
              where e.bloque_id = b.bloque_id and e.user_id = u.user_id)), '[]'::jsonb))
        order by b.bloque_id)
      from public.eslo_stars_resultados_bloques b
      where b.creado_en > now() - interval '2 hours'), '[]'::jsonb));
  end if;

  if uid is null or uid <= 0 or bid is null then return jsonb_build_object('error','datos'); end if;
  perform pg_catalog.pg_advisory_xact_lock(uid);
  if p_accion = 'reservar' then
    -- Comprobación inmediatamente anterior al envío: vencido no recibe.
    if not exists (select 1 from public.eslo_stars_usuarios where user_id = uid and premium_expira_en > now()) then
      return jsonb_build_object('ok', false, 'motivo', 'sin_pro');
    end if;
    insert into public.eslo_stars_resultados_envios(bloque_id, user_id, estado)
      values (bid, uid, 'reservado') on conflict do nothing;
    get diagnostics filas = row_count;
    return jsonb_build_object('ok', filas = 1, 'motivo', case when filas = 1 then null else 'duplicado' end);
  elsif p_accion = 'confirmar' then
    update public.eslo_stars_resultados_envios set estado = 'enviado', enviado_en = now()
      where bloque_id = bid and user_id = uid and estado = 'reservado';
    return jsonb_build_object('ok', true);
  elsif p_accion = 'liberar' then
    delete from public.eslo_stars_resultados_envios where bloque_id = bid and user_id = uid and estado = 'reservado';
    return jsonb_build_object('ok', true);
  elsif p_accion = 'descartar' then
    update public.eslo_stars_resultados_envios set estado = 'descartado'
      where bloque_id = bid and user_id = uid and estado = 'reservado';
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('error','accion');
end;
$$;
revoke all on function public.eslo_stars_resultados(text,jsonb) from public,anon,authenticated;
grant execute on function public.eslo_stars_resultados(text,jsonb) to service_role;
commit;
