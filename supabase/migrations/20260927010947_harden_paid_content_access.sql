-- Security hardening for paid content and Telegram abuse controls.
begin;

revoke all privileges on table
  public.absences,
  public.calibration,
  public.dota_predictions,
  public.dota_series,
  public.dota_teams,
  public.eslo_cuotas,
  public.eslo_estado,
  public.eslo_predicciones,
  public.eslo_ratings,
  public.fixtures,
  public.lineups,
  public.predictions,
  public.teams
from public, anon, authenticated;

grant select, insert, update, delete on table
  public.absences,
  public.calibration,
  public.dota_predictions,
  public.dota_series,
  public.dota_teams,
  public.eslo_cuotas,
  public.eslo_estado,
  public.eslo_predicciones,
  public.eslo_ratings,
  public.fixtures,
  public.lineups,
  public.predictions,
  public.teams
to service_role;

drop policy if exists "lectura publica" on public.absences;
drop policy if exists "lectura publica" on public.calibration;
drop policy if exists "lectura publica dota_predictions" on public.dota_predictions;
drop policy if exists "lectura publica dota_series" on public.dota_series;
drop policy if exists "lectura publica dota_teams" on public.dota_teams;
drop policy if exists "lectura publica eslo_cuotas" on public.eslo_cuotas;
drop policy if exists "lectura publica eslo_estado" on public.eslo_estado;
drop policy if exists "lectura publica eslo_predicciones" on public.eslo_predicciones;
drop policy if exists "lectura publica eslo_ratings" on public.eslo_ratings;
drop policy if exists "lectura publica" on public.fixtures;
drop policy if exists "lectura publica" on public.lineups;
drop policy if exists "lectura publica" on public.predictions;
drop policy if exists "lectura publica" on public.teams;

revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
revoke execute on function public.guard_eslo_cuotas_fixture_identity() from public, anon, authenticated;
revoke execute on function public.prevent_market_calibration_shadow_update() from public, anon, authenticated;

alter function public.guard_eslo_cuotas_fixture_identity() set search_path = '';
alter function public.prevent_market_calibration_shadow_update() set search_path = '';

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated;

create table public.eslo_stars_rate_limits (
  user_id bigint primary key check (user_id > 0),
  ventana_inicio timestamptz not null default now(),
  solicitudes integer not null default 1 check (solicitudes between 0 and 100000),
  bloqueado_hasta timestamptz
);
alter table public.eslo_stars_rate_limits enable row level security;
revoke all on public.eslo_stars_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.eslo_stars_rate_limits to service_role;

create function public.eslo_stars_rate_limit(p_user_id bigint) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  fila public.eslo_stars_rate_limits%rowtype;
  ahora timestamptz := now();
  reintentar integer;
begin
  if p_user_id is null or p_user_id <= 0 then
    return jsonb_build_object('ok',false,'motivo','usuario');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(p_user_id);
  select * into fila from public.eslo_stars_rate_limits where user_id=p_user_id for update;

  if fila.user_id is null then
    insert into public.eslo_stars_rate_limits(user_id,ventana_inicio,solicitudes)
      values(p_user_id,ahora,1);
    return jsonb_build_object('ok',true,'restantes',29);
  end if;

  if fila.bloqueado_hasta is not null and fila.bloqueado_hasta > ahora then
    reintentar := greatest(1, ceil(extract(epoch from (fila.bloqueado_hasta-ahora)))::integer);
    return jsonb_build_object('ok',false,'motivo','limite','reintentar_en',reintentar);
  end if;

  if fila.ventana_inicio <= ahora - interval '60 seconds' then
    update public.eslo_stars_rate_limits
      set ventana_inicio=ahora, solicitudes=1, bloqueado_hasta=null
      where user_id=p_user_id;
    return jsonb_build_object('ok',true,'restantes',29);
  end if;

  if fila.solicitudes >= 30 then
    update public.eslo_stars_rate_limits
      set bloqueado_hasta=ahora + interval '5 minutes'
      where user_id=p_user_id;
    return jsonb_build_object('ok',false,'motivo','limite','reintentar_en',300);
  end if;

  update public.eslo_stars_rate_limits
    set solicitudes=solicitudes+1, bloqueado_hasta=null
    where user_id=p_user_id;
  return jsonb_build_object('ok',true,'restantes',greatest(0,29-fila.solicitudes));
end;
$$;

revoke all on function public.eslo_stars_rate_limit(bigint) from public, anon, authenticated;
grant execute on function public.eslo_stars_rate_limit(bigint) to service_role;

commit;
