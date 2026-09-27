-- Credibilidad v4: inmutabilidad a nivel DB y alertas por cambios del modelo.
-- Reutiliza favoritos/PRO del engagement existente; no duplica tablas ni FREE.
begin;

create function public.eslo_prediccion_write_once() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.match_id is distinct from old.match_id
    or new.juego is distinct from old.juego
    or new.equipo_a is distinct from old.equipo_a
    or new.equipo_b is distinct from old.equipo_b
    or new.inicio_programado is distinct from old.inicio_programado
    or new.formato is distinct from old.formato
    or new.motor is distinct from old.motor
    or new.prob_a is distinct from old.prob_a
    or new.prob_b is distinct from old.prob_b
    or new.rating_a is distinct from old.rating_a
    or new.rd_a is distinct from old.rd_a
    or new.rating_b is distinct from old.rating_b
    or new.rd_b is distinct from old.rd_b
    or new.tier is distinct from old.tier
    or new.torneo_id is distinct from old.torneo_id
    or new.predicha_en is distinct from old.predicha_en then
    raise exception 'prediccion_inmutable' using errcode='55000';
  end if;
  return new;
end;
$$;

drop trigger if exists eslo_prediccion_write_once on public.eslo_predicciones;
create trigger eslo_prediccion_write_once
before update on public.eslo_predicciones
for each row execute function public.eslo_prediccion_write_once();

revoke all on function public.eslo_prediccion_write_once() from public,anon,authenticated;
grant execute on function public.eslo_prediccion_write_once() to service_role;

create table public.eslo_stars_seguimiento_modelo (
  match_id bigint primary key references public.eslo_predicciones(match_id) on delete cascade,
  referencia_prob_a numeric not null check (referencia_prob_a between 0 and 1),
  actual_prob_a numeric not null check (actual_prob_a between 0 and 1),
  observada_en timestamptz not null default now()
);

create table public.eslo_stars_cambios_modelo (
  cambio_id bigint generated always as identity primary key,
  match_id bigint not null references public.eslo_predicciones(match_id) on delete cascade,
  anterior_prob_a numeric not null check (anterior_prob_a between 0 and 1),
  nueva_prob_a numeric not null check (nueva_prob_a between 0 and 1),
  creado_en timestamptz not null default now(),
  check (anterior_prob_a <> nueva_prob_a)
);
create index eslo_stars_cambios_modelo_match on public.eslo_stars_cambios_modelo(match_id,creado_en desc);

create table public.eslo_stars_cambios_modelo_envios (
  cambio_id bigint not null references public.eslo_stars_cambios_modelo(cambio_id) on delete cascade,
  user_id bigint not null references public.eslo_stars_usuarios(user_id) on delete cascade,
  estado text not null check (estado in ('reservado','enviado','descartado')),
  reservado_en timestamptz not null default now(),
  enviado_en timestamptz,
  primary key (cambio_id,user_id)
);

alter table public.eslo_stars_seguimiento_modelo enable row level security;
alter table public.eslo_stars_cambios_modelo enable row level security;
alter table public.eslo_stars_cambios_modelo_envios enable row level security;
revoke all on public.eslo_stars_seguimiento_modelo,public.eslo_stars_cambios_modelo,
  public.eslo_stars_cambios_modelo_envios from public,anon,authenticated;
grant select,insert,update,delete on public.eslo_stars_seguimiento_modelo,
  public.eslo_stars_cambios_modelo,public.eslo_stars_cambios_modelo_envios to service_role;
grant usage,select on sequence public.eslo_stars_cambios_modelo_cambio_id_seq to service_role;

create function public.eslo_stars_cambios(p_accion text,p_datos jsonb default '{}'::jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  fila jsonb;
  mid bigint;
  uid bigint;
  cid bigint;
  nueva numeric;
  base numeric;
  material boolean;
  filas integer;
  seg public.eslo_stars_seguimiento_modelo%rowtype;
begin
  if p_accion='observar' then
    if jsonb_typeof(p_datos->'filas') is distinct from 'array' then
      return jsonb_build_object('error','datos');
    end if;
    for fila in select value from jsonb_array_elements(p_datos->'filas') loop
      mid:=nullif(fila->>'match_id','')::bigint;
      nueva:=nullif(fila->>'prob_a','')::numeric;
      if mid is null or mid<=0 or nueva is null or nueva<0 or nueva>1 then continue; end if;
      perform pg_catalog.pg_advisory_xact_lock(mid);
      select p.prob_a into base from public.eslo_predicciones p
        where p.match_id=mid and p.inicio_programado>now() and p.prob_a between 0 and 1;
      if base is null then continue; end if;
      select * into seg from public.eslo_stars_seguimiento_modelo where match_id=mid for update;
      if seg.match_id is null then
        material:=((base>=0.5)<>(nueva>=0.5)) or abs(nueva-base)>=0.05;
        insert into public.eslo_stars_seguimiento_modelo(match_id,referencia_prob_a,actual_prob_a,observada_en)
          values(mid,case when material then nueva else base end,nueva,now());
        if material then
          insert into public.eslo_stars_cambios_modelo(match_id,anterior_prob_a,nueva_prob_a)
            values(mid,base,nueva);
        end if;
      else
        material:=((seg.referencia_prob_a>=0.5)<>(nueva>=0.5)) or abs(nueva-seg.referencia_prob_a)>=0.05;
        update public.eslo_stars_seguimiento_modelo set
          referencia_prob_a=case when material then nueva else referencia_prob_a end,
          actual_prob_a=nueva,observada_en=now() where match_id=mid;
        if material then
          insert into public.eslo_stars_cambios_modelo(match_id,anterior_prob_a,nueva_prob_a)
            values(mid,seg.referencia_prob_a,nueva);
        end if;
      end if;
    end loop;
    return jsonb_build_object('ok',true);
  end if;

  if p_accion='preparar' then
    return jsonb_build_object('ok',true,'cambios',coalesce((
      select jsonb_agg(jsonb_build_object(
        'cambio_id',c.cambio_id,'match_id',c.match_id,'anterior_prob_a',c.anterior_prob_a,
        'nueva_prob_a',c.nueva_prob_a,'creado_en',c.creado_en,'juego',p.juego,
        'equipo_a',p.equipo_a,'equipo_b',p.equipo_b,'inicio_programado',p.inicio_programado,
        'destinatarios',coalesce((select jsonb_agg(f.user_id order by f.user_id)
          from public.eslo_stars_favoritos f join public.eslo_stars_usuarios u using(user_id)
          where f.match_id=c.match_id and f.creado_en<=c.creado_en and u.premium_expira_en>now()
            and not exists(select 1 from public.eslo_stars_cambios_modelo_envios e
              where e.cambio_id=c.cambio_id and e.user_id=f.user_id)), '[]'::jsonb)
      ) order by c.cambio_id)
      from public.eslo_stars_cambios_modelo c join public.eslo_predicciones p using(match_id)
      where c.creado_en>now()-interval '6 hours' and p.inicio_programado>now()
    ),'[]'::jsonb));
  end if;

  uid:=nullif(p_datos->>'user_id','')::bigint;
  cid:=nullif(p_datos->>'cambio_id','')::bigint;
  if p_accion in ('reservar','confirmar','liberar','descartar') then
    if uid is null or uid<=0 or cid is null or cid<=0 then return jsonb_build_object('error','datos'); end if;
    perform pg_catalog.pg_advisory_xact_lock(uid);
    if p_accion='reservar' then
      if not exists(
        select 1 from public.eslo_stars_cambios_modelo c
        join public.eslo_stars_favoritos f on f.match_id=c.match_id and f.user_id=uid
        join public.eslo_stars_usuarios u on u.user_id=uid
        join public.eslo_predicciones p on p.match_id=c.match_id
        where c.cambio_id=cid and f.creado_en<=c.creado_en and u.premium_expira_en>now()
          and p.inicio_programado>now()
      ) then return jsonb_build_object('ok',false,'motivo','sin_acceso'); end if;
      insert into public.eslo_stars_cambios_modelo_envios(cambio_id,user_id,estado)
        values(cid,uid,'reservado') on conflict do nothing;
      get diagnostics filas=row_count;
      return jsonb_build_object('ok',filas=1,'motivo',case when filas=1 then null else 'duplicado' end);
    elsif p_accion='confirmar' then
      update public.eslo_stars_cambios_modelo_envios set estado='enviado',enviado_en=now()
        where cambio_id=cid and user_id=uid and estado='reservado';
    elsif p_accion='liberar' then
      delete from public.eslo_stars_cambios_modelo_envios
        where cambio_id=cid and user_id=uid and estado='reservado';
    else
      update public.eslo_stars_cambios_modelo_envios set estado='descartado'
        where cambio_id=cid and user_id=uid and estado='reservado';
    end if;
    return jsonb_build_object('ok',true);
  end if;
  return jsonb_build_object('error','accion');
end;
$$;
revoke all on function public.eslo_stars_cambios(text,jsonb) from public,anon,authenticated;
grant execute on function public.eslo_stars_cambios(text,jsonb) to service_role;

commit;
