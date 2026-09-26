begin;
-- Una sola consulta conserva el mismo snapshot MVCC en todas las tablas.
create function public.eslo_stars_respaldo() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('version',1,'capturado_en',statement_timestamp(),'tablas',jsonb_build_object(
    'eslo_stars_usuarios',coalesce((select jsonb_agg(u order by user_id) from public.eslo_stars_usuarios u),'[]'::jsonb),
    'eslo_stars_ordenes',coalesce((select jsonb_agg(o order by payload) from public.eslo_stars_ordenes o),'[]'::jsonb),
    'eslo_stars_pagos',coalesce((select jsonb_agg(p order by telegram_payment_charge_id) from public.eslo_stars_pagos p),'[]'::jsonb),
    'eslo_stars_reembolsos',coalesce((select jsonb_agg(r order by cargo) from public.eslo_stars_reembolsos r),'[]'::jsonb),
    'eslo_stars_incidencias',coalesce((select jsonb_agg(i order by update_id) from public.eslo_stars_incidencias i),'[]'::jsonb),
    'eslo_predicciones',coalesce((select jsonb_agg(p order by match_id) from public.eslo_predicciones p
      where exists(select 1 from public.eslo_stars_ordenes o where o.match_id=p.match_id)),'[]'::jsonb)
  ));
$$;
create function public.eslo_stars_diagnostico() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('ok',true,'incidencias',count(*),'ultima_incidencia',max(creada_en))
    from public.eslo_stars_incidencias;
$$;
revoke all on function public.eslo_stars_respaldo(), public.eslo_stars_diagnostico() from public,anon,authenticated;
grant execute on function public.eslo_stars_respaldo(), public.eslo_stars_diagnostico() to service_role;
commit;
