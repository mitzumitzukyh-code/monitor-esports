-- Aplicar sólo al entorno elegido por el operador. No toca el motor ni sus tablas.
begin;
create table public.eslo_stars_usuarios (
  user_id bigint primary key check (user_id > 0),
  creado_en timestamptz not null default now(),
  visto_en timestamptz not null default now(),
  terminos_version text,
  terminos_en timestamptz,
  premium_activado_en timestamptz,
  premium_expira_en timestamptz
);
create table public.eslo_stars_ordenes (
  payload text primary key check (length(payload) between 1 and 128),
  user_id bigint not null references public.eslo_stars_usuarios,
  producto text not null check (producto in ('pro', 'partido')),
  match_id bigint references public.eslo_predicciones(match_id),
  amount integer not null check (amount between 1 and 10000),
  recurrente boolean not null,
  terminos_version text not null,
  creada_en timestamptz not null default now(),
  vence_en timestamptz not null default (now() + interval '30 minutes'),
  precheckout_id text,
  aprobada_en timestamptz,
  pagada_en timestamptz,
  cargo_inicial text,
  cancelada boolean not null default false,
  subscription_state text not null default 'active' check (subscription_state in ('active','canceled','failed')),
  subscription_update_id bigint not null default -1,
  subscription_actualizada_en timestamptz,
  check ((producto = 'partido' and match_id is not null and not recurrente)
      or (producto = 'pro' and match_id is null))
);
create index eslo_stars_ordenes_usuario on public.eslo_stars_ordenes(user_id);
create table public.eslo_stars_pagos (
  telegram_payment_charge_id text primary key,
  provider_payment_charge_id text not null,
  update_id bigint not null unique,
  payload text not null references public.eslo_stars_ordenes,
  user_id bigint not null references public.eslo_stars_usuarios,
  currency text not null check (currency = 'XTR'),
  amount integer not null,
  pagado_en timestamptz not null,
  recibido_en timestamptz not null default now(),
  activado_en timestamptz not null,
  expira_en timestamptz,
  reembolsado_en timestamptz,
  recurrente boolean not null,
  primer_recurrente boolean not null
);
create index eslo_stars_pagos_usuario on public.eslo_stars_pagos(user_id, expira_en);
-- Tombstone: un refund puede llegar antes que el update de compra.
create table public.eslo_stars_reembolsos (
  cargo text primary key, user_id bigint not null, payload text not null,
  amount integer not null, recibido_en timestamptz not null default now()
);
create table public.eslo_stars_incidencias (
  update_id bigint primary key, user_id bigint, cargo text,
  motivo text not null, creada_en timestamptz not null default now()
);
alter table public.eslo_stars_usuarios enable row level security;
alter table public.eslo_stars_ordenes enable row level security;
alter table public.eslo_stars_pagos enable row level security;
alter table public.eslo_stars_reembolsos enable row level security;
alter table public.eslo_stars_incidencias enable row level security;
revoke all on public.eslo_stars_usuarios, public.eslo_stars_ordenes, public.eslo_stars_pagos,
  public.eslo_stars_reembolsos, public.eslo_stars_incidencias from public, anon, authenticated;
grant select, insert, update, delete on public.eslo_stars_usuarios, public.eslo_stars_ordenes,
  public.eslo_stars_pagos, public.eslo_stars_reembolsos, public.eslo_stars_incidencias to service_role;

-- SECURITY INVOKER: únicamente service_role recibe permiso para ejecutar.
create function public.eslo_stars(p_accion text, p_datos jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  uid bigint := (p_datos->>'user_id')::bigint;
  orden public.eslo_stars_ordenes%rowtype;
  pago public.eslo_stars_pagos%rowtype;
  usuario public.eslo_stars_usuarios%rowtype;
  inicio timestamptz;
  fin timestamptz;
  reembolso timestamptz;
  v_cargo text := p_datos->>'telegram_payment_charge_id';
  es_recurrente boolean := coalesce((p_datos->>'is_recurring')::boolean, false);
  es_primero boolean := coalesce((p_datos->>'is_first_recurring')::boolean, false);
  acceso boolean;
begin
  if uid is null or uid <= 0 then return jsonb_build_object('error','usuario'); end if;
  -- Serializa compras/renovaciones/reembolsos del mismo usuario, incluso
  -- cuando dos procesos de webhook reciben updates simultáneos.
  perform pg_catalog.pg_advisory_xact_lock(uid);
  insert into public.eslo_stars_usuarios(user_id) values (uid)
    on conflict(user_id) do update set visto_en = now();
  select * into usuario from public.eslo_stars_usuarios where user_id = uid;

  if p_accion = 'usuario' then
    return jsonb_build_object('ok',true);
  elsif p_accion = 'terminos' then
    update public.eslo_stars_usuarios set terminos_version = p_datos->>'version', terminos_en = now() where user_id = uid;
    return jsonb_build_object('ok',true);
  elsif p_accion = 'incidencia' then
    insert into public.eslo_stars_incidencias(update_id,user_id,cargo,motivo)
      values ((p_datos->>'update_id')::bigint,uid,v_cargo,p_datos->>'motivo') on conflict do nothing;
    return jsonb_build_object('ok',true);
  elsif p_accion in ('estado','acceso') then
    acceso := coalesce(usuario.premium_expira_en > now(), false);
    if p_accion = 'acceso' then
      return jsonb_build_object('ok', acceso or exists (
        select 1 from public.eslo_stars_pagos p join public.eslo_stars_ordenes o using(payload)
        where p.user_id = uid and o.producto = 'partido' and o.match_id = (p_datos->>'match_id')::bigint
          and p.reembolsado_en is null));
    end if;
    return jsonb_build_object('premium',acceso,'activado_en',usuario.premium_activado_en,
      'expira_en',usuario.premium_expira_en,'terminos_version',usuario.terminos_version,
      'suscripciones',coalesce((select jsonb_agg(jsonb_build_object('payload',o.payload,
        'cargo',o.cargo_inicial,'cancelada',o.cancelada,'state',o.subscription_state)) from public.eslo_stars_ordenes o
        where o.user_id=uid and o.recurrente and o.cargo_inicial is not null
        and exists(select 1 from public.eslo_stars_pagos p where p.payload=o.payload
          and p.reembolsado_en is null and p.expira_en > now())), '[]'::jsonb));
  elsif p_accion = 'crear' then
    if usuario.terminos_version is distinct from p_datos->>'terminos_version' then
      return jsonb_build_object('error','terminos');
    end if;
    if p_datos->>'producto' = 'pro' and (usuario.premium_expira_en > now() or exists(
      select 1 from public.eslo_stars_ordenes o where o.user_id=uid and o.producto='pro'
      and o.pagada_en is null and o.vence_en > now())) then
      return jsonb_build_object('error','pro_activo_o_pendiente');
    end if;
    if p_datos->>'producto' = 'partido' then
      if not exists(select 1 from public.eslo_predicciones where match_id=(p_datos->>'match_id')::bigint) then
        return jsonb_build_object('error','partido');
      end if;
      if usuario.premium_expira_en > now() or exists(select 1 from public.eslo_stars_pagos p
        join public.eslo_stars_ordenes o using(payload) where p.user_id=uid
        and o.match_id=(p_datos->>'match_id')::bigint and p.reembolsado_en is null) then
        return jsonb_build_object('error','ya_comprado');
      end if;
    end if;
    insert into public.eslo_stars_ordenes(payload,user_id,producto,match_id,amount,recurrente,terminos_version)
      values(p_datos->>'payload',uid,p_datos->>'producto',(p_datos->>'match_id')::bigint,
        (p_datos->>'amount')::integer,(p_datos->>'recurrente')::boolean,p_datos->>'terminos_version');
    return jsonb_build_object('ok',true);
  end if;

  select * into orden from public.eslo_stars_ordenes where payload=p_datos->>'payload' for update;
  if orden.payload is null or orden.user_id <> uid then return jsonb_build_object('error','orden'); end if;
  if p_accion = 'suscripcion' then
    if not orden.recurrente or p_datos->>'state' not in ('active','canceled','failed') then
      return jsonb_build_object('error','suscripcion');
    end if;
    -- Telegram puede elegir un nuevo inicio aleatorio tras una semana sin
    -- updates. La comparación de orden sólo vale en la ventana reciente.
    if (p_datos->>'update_id')::bigint = orden.subscription_update_id or
      ((p_datos->>'update_id')::bigint < orden.subscription_update_id and orden.subscription_actualizada_en > now()-interval '7 days') then
      return jsonb_build_object('ok',true,'duplicado',true);
    end if;
    update public.eslo_stars_ordenes set subscription_state=p_datos->>'state',
      cancelada=(p_datos->>'state'='canceled'),subscription_update_id=(p_datos->>'update_id')::bigint,
      subscription_actualizada_en=now()
      where payload=orden.payload;
    -- active no equivale a pago; canceled/failed conservan el período pagado.
    return jsonb_build_object('ok',true);
  elsif p_accion = 'fallo_factura' then
    update public.eslo_stars_ordenes set vence_en=now() where payload=orden.payload;
    return jsonb_build_object('ok',true);
  elsif p_accion = 'cancelar' then
    if orden.cargo_inicial is distinct from v_cargo then return jsonb_build_object('error','cargo'); end if;
    update public.eslo_stars_ordenes set cancelada=true,subscription_state='canceled' where payload=orden.payload;
    return jsonb_build_object('ok',true);
  end if;
  if p_datos->>'currency' is distinct from 'XTR' or
    (p_datos->>'total_amount')::integer is distinct from orden.amount then
    return jsonb_build_object('error','importe');
  end if;
  if p_accion = 'aprobar' then
    if orden.vence_en <= now() or orden.pagada_en is not null then return jsonb_build_object('error','vencida'); end if;
    if usuario.terminos_version is distinct from orden.terminos_version then return jsonb_build_object('error','terminos'); end if;
    if orden.producto='pro' and usuario.premium_expira_en > now() then return jsonb_build_object('error','ya_comprado'); end if;
    if orden.producto='partido' and (usuario.premium_expira_en > now() or exists (
      select 1 from public.eslo_stars_pagos p join public.eslo_stars_ordenes o using(payload)
      where p.user_id=uid and o.match_id=orden.match_id and p.reembolsado_en is null)) then
      return jsonb_build_object('error','ya_comprado');
    end if;
    -- Una misma orden no admite dos checkout distintos antes del primer pago.
    if orden.precheckout_id is not null and orden.precheckout_id <> p_datos->>'precheckout_id' then
      return jsonb_build_object('error','checkout_duplicado');
    end if;
    update public.eslo_stars_ordenes set precheckout_id=p_datos->>'precheckout_id',aprobada_en=coalesce(aprobada_en,now())
      where payload=orden.payload;
    return jsonb_build_object('ok',true);
  elsif p_accion = 'reembolso' then
    select * into pago from public.eslo_stars_pagos where telegram_payment_charge_id=v_cargo;
    if pago.telegram_payment_charge_id is not null and (pago.user_id <> uid or pago.payload <> orden.payload) then
      return jsonb_build_object('error','cargo');
    end if;
    insert into public.eslo_stars_reembolsos(cargo,user_id,payload,amount) values(v_cargo,uid,orden.payload,orden.amount)
      on conflict do nothing;
    update public.eslo_stars_pagos set reembolsado_en=coalesce(reembolsado_en,now()) where telegram_payment_charge_id=v_cargo;
  elsif p_accion = 'pago' then
    select * into pago from public.eslo_stars_pagos where telegram_payment_charge_id=v_cargo;
    if pago.telegram_payment_charge_id is not null then
      if pago.user_id <> uid or pago.payload <> orden.payload then return jsonb_build_object('error','cargo'); end if;
      return jsonb_build_object('ok',true,'duplicado',true);
    end if;
    if exists(select 1 from public.eslo_stars_pagos where update_id=(p_datos->>'update_id')::bigint) then
      return jsonb_build_object('error','update_duplicado');
    end if;
    if orden.aprobada_en is null then return jsonb_build_object('error','sin_checkout'); end if;
    if orden.recurrente <> es_recurrente or (es_primero and not es_recurrente) then
      return jsonb_build_object('error','recurrencia');
    end if;
    if orden.pagada_en is null and orden.recurrente and not es_primero then
      return jsonb_build_object('error','falta_pago_inicial','reintentar',true);
    end if;
    if orden.pagada_en is not null and (not orden.recurrente or es_primero) then
      return jsonb_build_object('error','orden_pagada');
    end if;
    inicio := to_timestamp((p_datos->>'date')::bigint);
    if orden.recurrente then
      fin := to_timestamp((p_datos->>'subscription_expiration_date')::bigint);
      if fin is null or fin <= inicio or fin > inicio + interval '31 days' then
        return jsonb_build_object('error','expiracion');
      end if;
    elsif orden.producto='pro' then
      fin := greatest(inicio,coalesce(usuario.premium_expira_en,inicio)) + interval '30 days';
    else fin := null;
    end if;
    select recibido_en into reembolso from public.eslo_stars_reembolsos
      where eslo_stars_reembolsos.cargo = v_cargo and user_id=uid and payload=orden.payload;
    insert into public.eslo_stars_pagos(telegram_payment_charge_id,provider_payment_charge_id,update_id,payload,
      user_id,currency,amount,pagado_en,activado_en,expira_en,reembolsado_en,recurrente,primer_recurrente)
      values(v_cargo,p_datos->>'provider_payment_charge_id',(p_datos->>'update_id')::bigint,orden.payload,
        uid,'XTR',orden.amount,inicio,inicio,fin,reembolso,es_recurrente,es_primero);
    update public.eslo_stars_ordenes set pagada_en=coalesce(pagada_en,inicio),cargo_inicial=coalesce(cargo_inicial,v_cargo),
      subscription_state=case when subscription_state='failed' and
        (subscription_actualizada_en is null or inicio >= subscription_actualizada_en)
        then 'active' else subscription_state end
      where payload=orden.payload;
  else return jsonb_build_object('error','accion');
  end if;
  update public.eslo_stars_usuarios set
    premium_activado_en=(select min(p.activado_en) from public.eslo_stars_pagos p
      join public.eslo_stars_ordenes o using(payload) where p.user_id=uid and o.producto='pro' and p.reembolsado_en is null),
    premium_expira_en=(select max(p.expira_en) from public.eslo_stars_pagos p
      join public.eslo_stars_ordenes o using(payload) where p.user_id=uid and o.producto='pro' and p.reembolsado_en is null)
    where user_id=uid;
  return jsonb_build_object('ok',true,'expira_en',fin,'reembolsado',reembolso is not null,'producto',orden.producto,'match_id',orden.match_id);
end;
$$;
revoke all on function public.eslo_stars(text,jsonb) from public,anon,authenticated;
grant execute on function public.eslo_stars(text,jsonb) to service_role;
commit;
