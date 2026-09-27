-- Credibilidad y seguimiento de Monitor eSports.
-- No altera el motor ni reescribe eslo_predicciones. Crea una copia inmutable
-- de cada predicción válida y guarda por separado el seguimiento posterior.
begin;

create table public.eslo_stars_predicciones_fijas (
  match_id bigint primary key references public.eslo_predicciones(match_id) on delete restrict,
  juego text not null check (juego in ('cs2','dota2','lol','valorant')),
  equipo_a bigint not null,
  equipo_b bigint not null,
  inicio_programado timestamptz not null,
  formato text,
  tier text,
  motor text not null,
  prob_a numeric not null check (prob_a between 0 and 1),
  prob_b numeric not null check (prob_b between 0 and 1),
  creada_en timestamptz not null,
  congelada_en timestamptz not null default now(),
  check (equipo_a <> equipo_b),
  check (creada_en < inicio_programado)
);

insert into public.eslo_stars_predicciones_fijas(
  match_id,juego,equipo_a,equipo_b,inicio_programado,formato,tier,motor,
  prob_a,prob_b,creada_en,congelada_en
)
select p.match_id,p.juego,p.equipo_a,p.equipo_b,p.inicio_programado,p.formato,p.tier,p.motor,
  p.prob_a,p.prob_b,p.creada_en,now()
from public.eslo_predicciones p
where p.juego in ('cs2','dota2','lol','valorant')
  and p.equipo_a <> p.equipo_b
  and p.prob_a between 0 and 1 and p.prob_b between 0 and 1
  and p.creada_en < p.inicio_programado
on conflict (match_id) do nothing;

create table public.eslo_stars_gratis_diario (
  dia date primary key,
  match_id bigint not null unique references public.eslo_stars_predicciones_fijas(match_id) on delete restrict,
  seleccionado_en timestamptz not null default now()
);

create table public.eslo_stars_favoritos (
  user_id bigint not null references public.eslo_stars_usuarios(user_id) on delete cascade,
  match_id bigint not null references public.eslo_stars_predicciones_fijas(match_id) on delete cascade,
  creado_en timestamptz not null default now(),
  primary key (user_id, match_id)
);
create index eslo_stars_favoritos_match on public.eslo_stars_favoritos(match_id);

-- referencia_prob_a = último valor desde el cual ya se avisó un cambio.
-- actual_prob_a = lectura más reciente; nunca sustituye la predicción fija.
create table public.eslo_stars_seguimiento (
  match_id bigint primary key references public.eslo_stars_predicciones_fijas(match_id) on delete cascade,
  referencia_prob_a numeric not null check (referencia_prob_a between 0 and 1),
  actual_prob_a numeric not null check (actual_prob_a between 0 and 1),
  observada_en timestamptz not null
);

create table public.eslo_stars_cambios (
  cambio_id bigint generated always as identity primary key,
  match_id bigint not null references public.eslo_stars_predicciones_fijas(match_id) on delete cascade,
  anterior_prob_a numeric not null check (anterior_prob_a between 0 and 1),
  nueva_prob_a numeric not null check (nueva_prob_a between 0 and 1),
  creado_en timestamptz not null default now(),
  check (anterior_prob_a <> nueva_prob_a)
);
create index eslo_stars_cambios_match on public.eslo_stars_cambios(match_id, creado_en desc);

create table public.eslo_stars_cambios_envios (
  cambio_id bigint not null references public.eslo_stars_cambios(cambio_id) on delete cascade,
  user_id bigint not null references public.eslo_stars_usuarios(user_id) on delete cascade,
  estado text not null check (estado in ('reservado','enviado','descartado')),
  reservado_en timestamptz not null default now(),
  enviado_en timestamptz,
  primary key (cambio_id, user_id)
);

alter table public.eslo_stars_predicciones_fijas enable row level security;
alter table public.eslo_stars_gratis_diario enable row level security;
alter table public.eslo_stars_favoritos enable row level security;
alter table public.eslo_stars_seguimiento enable row level security;
alter table public.eslo_stars_cambios enable row level security;
alter table public.eslo_stars_cambios_envios enable row level security;

revoke all on public.eslo_stars_predicciones_fijas, public.eslo_stars_gratis_diario,
  public.eslo_stars_favoritos, public.eslo_stars_seguimiento, public.eslo_stars_cambios,
  public.eslo_stars_cambios_envios from public, anon, authenticated;
grant select, insert, update, delete on public.eslo_stars_predicciones_fijas,
  public.eslo_stars_gratis_diario, public.eslo_stars_favoritos, public.eslo_stars_seguimiento,
  public.eslo_stars_cambios, public.eslo_stars_cambios_envios to service_role;
grant usage, select on sequence public.eslo_stars_cambios_cambio_id_seq to service_role;

-- Cada INSERT válido se copia una sola vez. Las actualizaciones de resultados
-- en eslo_predicciones no pueden cambiar esta copia.
create function public.eslo_stars_congelar_prediccion() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.juego in ('cs2','dota2','lol','valorant')
    and new.equipo_a <> new.equipo_b
    and new.prob_a between 0 and 1 and new.prob_b between 0 and 1
    and new.creada_en < new.inicio_programado then
    insert into public.eslo_stars_predicciones_fijas(
      match_id,juego,equipo_a,equipo_b,inicio_programado,formato,tier,motor,
      prob_a,prob_b,creada_en,congelada_en
    ) values (
      new.match_id,new.juego,new.equipo_a,new.equipo_b,new.inicio_programado,new.formato,new.tier,new.motor,
      new.prob_a,new.prob_b,new.creada_en,now()
    ) on conflict (match_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger eslo_stars_congelar_prediccion
after insert on public.eslo_predicciones
for each row execute function public.eslo_stars_congelar_prediccion();

-- Defensa extra: ni service_role puede editar/borrar por accidente una fila
-- congelada mediante DML normal. El historial sólo crece.
create function public.eslo_stars_bloquear_prediccion_fija() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'prediccion_fija_inmutable' using errcode = '55000';
end;
$$;
create trigger eslo_stars_prediccion_fija_inmutable
before update or delete on public.eslo_stars_predicciones_fijas
for each row execute function public.eslo_stars_bloquear_prediccion_fija();

revoke all on function public.eslo_stars_congelar_prediccion() from public, anon, authenticated;
revoke all on function public.eslo_stars_bloquear_prediccion_fija() from public, anon, authenticated;
grant execute on function public.eslo_stars_congelar_prediccion() to service_role;
grant execute on function public.eslo_stars_bloquear_prediccion_fija() to service_role;

create function public.eslo_stars_credibilidad(p_accion text, p_datos jsonb default '{}'::jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  uid bigint;
  mid bigint;
  cid bigint;
  fija public.eslo_stars_predicciones_fijas%rowtype;
  seg public.eslo_stars_seguimiento%rowtype;
  fila jsonb;
  nueva numeric;
  material boolean;
  filas integer;
  dia_local date := (now() - interval '4 hours')::date;
begin
  if p_accion = 'historial' then
    return jsonb_build_object(
      'ok', true,
      'desde', (select min(f.creada_en) from public.eslo_stars_predicciones_fijas f
        join public.eslo_predicciones p using(match_id) where p.resultado_real in ('ganaA','ganaB')),
      'hasta', (select max(p.calificada_en) from public.eslo_stars_predicciones_fijas f
        join public.eslo_predicciones p using(match_id) where p.resultado_real in ('ganaA','ganaB')),
      'filas', coalesce((
        select jsonb_agg(jsonb_build_object(
          'juego',q.juego,'banda',q.banda,'n',q.n,'aciertos',q.aciertos
        ) order by array_position(array['cs2','dota2','lol','valorant'],q.juego),
          array_position(array['alta','media','baja'],q.banda))
        from (
          select f.juego,
            case when greatest(f.prob_a,f.prob_b) >= 0.70 then 'alta'
                 when greatest(f.prob_a,f.prob_b) >= 0.56 then 'media'
                 else 'baja' end as banda,
            count(*)::integer as n,
            count(*) filter (where
              (f.prob_a >= 0.5 and p.resultado_real='ganaA') or
              (f.prob_a < 0.5 and p.resultado_real='ganaB'))::integer as aciertos
          from public.eslo_stars_predicciones_fijas f
          join public.eslo_predicciones p using(match_id)
          where p.resultado_real in ('ganaA','ganaB')
          group by f.juego,2
        ) q
      ), '[]'::jsonb)
    );
  end if;

  if p_accion = 'gratis' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('eslo_stars_gratis:' || dia_local::text));
    select f.* into fija
    from public.eslo_stars_gratis_diario g
    join public.eslo_stars_predicciones_fijas f using(match_id)
    where g.dia=dia_local;

    if fija.match_id is null then
      select f.* into fija
      from public.eslo_stars_predicciones_fijas f
      where f.inicio_programado > now()
        and (f.inicio_programado - interval '4 hours')::date = dia_local
      order by f.inicio_programado, f.match_id
      limit 1;
      if fija.match_id is not null then
        insert into public.eslo_stars_gratis_diario(dia,match_id) values(dia_local,fija.match_id)
        on conflict (dia) do nothing;
        select f.* into fija from public.eslo_stars_gratis_diario g
          join public.eslo_stars_predicciones_fijas f using(match_id) where g.dia=dia_local;
      end if;
    end if;
    return jsonb_build_object('ok',true,'dia',dia_local,'prediccion',
      case when fija.match_id is null then null else to_jsonb(fija) end);
  end if;

  mid := nullif(p_datos->>'match_id','')::bigint;

  if p_accion = 'calibracion' then
    if mid is null or mid <= 0 then return jsonb_build_object('error','partido'); end if;
    select * into fija from public.eslo_stars_predicciones_fijas where match_id=mid;
    if fija.match_id is null then return jsonb_build_object('error','partido'); end if;
    return (
      select jsonb_build_object('ok',true,'juego',fija.juego,
        'banda',case when greatest(fija.prob_a,fija.prob_b)>=0.70 then 'alta'
                     when greatest(fija.prob_a,fija.prob_b)>=0.56 then 'media' else 'baja' end,
        'n',count(*)::integer,
        'aciertos',count(*) filter (where
          (x.prob_a >= 0.5 and p.resultado_real='ganaA') or
          (x.prob_a < 0.5 and p.resultado_real='ganaB'))::integer)
      from public.eslo_stars_predicciones_fijas x
      join public.eslo_predicciones p using(match_id)
      where x.juego=fija.juego and p.resultado_real in ('ganaA','ganaB')
        and (case when greatest(x.prob_a,x.prob_b)>=0.70 then 'alta'
                  when greatest(x.prob_a,x.prob_b)>=0.56 then 'media' else 'baja' end)
          = (case when greatest(fija.prob_a,fija.prob_b)>=0.70 then 'alta'
                  when greatest(fija.prob_a,fija.prob_b)>=0.56 then 'media' else 'baja' end)
    );
  end if;

  if p_accion = 'observar' then
    if jsonb_typeof(p_datos->'filas') is distinct from 'array' then
      return jsonb_build_object('error','datos');
    end if;
    for fila in select value from jsonb_array_elements(p_datos->'filas') loop
      mid := nullif(fila->>'match_id','')::bigint;
      nueva := nullif(fila->>'prob_a','')::numeric;
      if mid is null or mid <= 0 or nueva is null or nueva < 0 or nueva > 1 then
        continue;
      end if;
      perform pg_catalog.pg_advisory_xact_lock(mid);
      select * into fija from public.eslo_stars_predicciones_fijas
        where match_id=mid and inicio_programado > now();
      if fija.match_id is null then continue; end if;

      select * into seg from public.eslo_stars_seguimiento where match_id=mid for update;
      if seg.match_id is null then
        material := ((fija.prob_a >= 0.5) <> (nueva >= 0.5)) or abs(nueva-fija.prob_a) >= 0.05;
        insert into public.eslo_stars_seguimiento(match_id,referencia_prob_a,actual_prob_a,observada_en)
          values(mid,case when material then nueva else fija.prob_a end,nueva,now());
        if material then
          insert into public.eslo_stars_cambios(match_id,anterior_prob_a,nueva_prob_a)
            values(mid,fija.prob_a,nueva);
        end if;
      else
        material := ((seg.referencia_prob_a >= 0.5) <> (nueva >= 0.5)) or abs(nueva-seg.referencia_prob_a) >= 0.05;
        update public.eslo_stars_seguimiento set
          referencia_prob_a=case when material then nueva else referencia_prob_a end,
          actual_prob_a=nueva,observada_en=now() where match_id=mid;
        if material then
          insert into public.eslo_stars_cambios(match_id,anterior_prob_a,nueva_prob_a)
            values(mid,seg.referencia_prob_a,nueva);
        end if;
      end if;
    end loop;
    return jsonb_build_object('ok',true);
  end if;

  uid := nullif(p_datos->>'user_id','')::bigint;
  if p_accion in ('favorito_agregar','favorito_quitar','favoritos') then
    if uid is null or uid <= 0 then return jsonb_build_object('error','usuario'); end if;
    perform pg_catalog.pg_advisory_xact_lock(uid);
    if not exists(select 1 from public.eslo_stars_usuarios u
      where u.user_id=uid and u.premium_expira_en > now()) then
      return jsonb_build_object('error','pro');
    end if;
    if p_accion = 'favoritos' then
      return jsonb_build_object('ok',true,'partidos',coalesce((
        select jsonb_agg(to_jsonb(f) order by f.inicio_programado,f.match_id)
        from public.eslo_stars_favoritos v
        join public.eslo_stars_predicciones_fijas f using(match_id)
        where v.user_id=uid and f.inicio_programado > now()
      ),'[]'::jsonb));
    end if;
    if mid is null or mid <= 0 or not exists(select 1 from public.eslo_stars_predicciones_fijas
      where match_id=mid and inicio_programado > now()) then
      return jsonb_build_object('error','partido');
    end if;
    if p_accion = 'favorito_agregar' then
      insert into public.eslo_stars_favoritos(user_id,match_id) values(uid,mid) on conflict do nothing;
      return jsonb_build_object('ok',true);
    end if;
    delete from public.eslo_stars_favoritos where user_id=uid and match_id=mid;
    return jsonb_build_object('ok',true);
  end if;

  if p_accion = 'cambios_preparar' then
    return jsonb_build_object('ok',true,'cambios',coalesce((
      select jsonb_agg(jsonb_build_object(
        'cambio_id',c.cambio_id,'match_id',c.match_id,'anterior_prob_a',c.anterior_prob_a,
        'nueva_prob_a',c.nueva_prob_a,'creado_en',c.creado_en,
        'juego',f.juego,'equipo_a',f.equipo_a,'equipo_b',f.equipo_b,
        'inicio_programado',f.inicio_programado,
        'destinatarios',coalesce((select jsonb_agg(v.user_id order by v.user_id)
          from public.eslo_stars_favoritos v
          join public.eslo_stars_usuarios u using(user_id)
          where v.match_id=c.match_id and v.creado_en <= c.creado_en
            and u.premium_expira_en > now()
            and not exists(select 1 from public.eslo_stars_cambios_envios e
              where e.cambio_id=c.cambio_id and e.user_id=v.user_id)), '[]'::jsonb)
      ) order by c.cambio_id)
      from public.eslo_stars_cambios c
      join public.eslo_stars_predicciones_fijas f using(match_id)
      where c.creado_en > now()-interval '6 hours' and f.inicio_programado > now()
    ),'[]'::jsonb));
  end if;

  if p_accion in ('cambio_reservar','cambio_confirmar','cambio_liberar','cambio_descartar') then
    cid := nullif(p_datos->>'cambio_id','')::bigint;
    if uid is null or uid <= 0 or cid is null or cid <= 0 then return jsonb_build_object('error','datos'); end if;
    perform pg_catalog.pg_advisory_xact_lock(uid);
    if p_accion = 'cambio_reservar' then
      if not exists(select 1 from public.eslo_stars_cambios c
        join public.eslo_stars_favoritos v on v.match_id=c.match_id and v.user_id=uid
        join public.eslo_stars_usuarios u on u.user_id=uid
        join public.eslo_stars_predicciones_fijas f on f.match_id=c.match_id
        where c.cambio_id=cid and v.creado_en <= c.creado_en
          and u.premium_expira_en > now() and f.inicio_programado > now()) then
        return jsonb_build_object('ok',false,'motivo','sin_acceso');
      end if;
      insert into public.eslo_stars_cambios_envios(cambio_id,user_id,estado)
        values(cid,uid,'reservado') on conflict do nothing;
      get diagnostics filas = row_count;
      return jsonb_build_object('ok',filas=1,'motivo',case when filas=1 then null else 'duplicado' end);
    elsif p_accion = 'cambio_confirmar' then
      update public.eslo_stars_cambios_envios set estado='enviado',enviado_en=now()
        where cambio_id=cid and user_id=uid and estado='reservado';
      return jsonb_build_object('ok',true);
    elsif p_accion = 'cambio_liberar' then
      delete from public.eslo_stars_cambios_envios
        where cambio_id=cid and user_id=uid and estado='reservado';
      return jsonb_build_object('ok',true);
    else
      update public.eslo_stars_cambios_envios set estado='descartado'
        where cambio_id=cid and user_id=uid and estado='reservado';
      return jsonb_build_object('ok',true);
    end if;
  end if;

  return jsonb_build_object('error','accion');
end;
$$;

revoke all on function public.eslo_stars_credibilidad(text,jsonb) from public, anon, authenticated;
grant execute on function public.eslo_stars_credibilidad(text,jsonb) to service_role;

commit;
