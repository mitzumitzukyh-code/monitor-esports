create table if not exists public.eslo_market_calibration_shadow (
  match_id bigint not null,
  calibration_version text not null,
  source_gate_version text not null,
  observed_at timestamptz not null,
  juego text not null,
  tier text,
  inicio_programado timestamptz not null,
  status text not null check (status = 'ok'),
  pick_side text not null check (pick_side in ('A','B')),
  pick_team_id bigint not null,
  model_probability numeric not null check (model_probability >= 0 and model_probability <= 1),
  provider_odds_pick numeric,
  best_observed_odds_pick numeric,
  market_probability_raw numeric not null check (market_probability_raw > 0 and market_probability_raw < 1),
  market_probability_devig numeric not null check (market_probability_devig > 0 and market_probability_devig < 1),
  market_overround numeric,
  model_market_delta_pp numeric not null,
  delta_band text not null,
  quote_captured_at timestamptz not null,
  quote_age_minutes numeric not null,
  quote_provider_id bigint,
  team_order_relation text not null check (team_order_relation in ('mismo','invertido')),
  inserted_at timestamptz not null default now(),
  primary key (match_id, calibration_version)
);

create index if not exists eslo_market_calibration_shadow_version_observed_idx
  on public.eslo_market_calibration_shadow (calibration_version, observed_at);

create index if not exists eslo_market_calibration_shadow_band_idx
  on public.eslo_market_calibration_shadow (calibration_version, delta_band);

alter table public.eslo_market_calibration_shadow enable row level security;
revoke all on table public.eslo_market_calibration_shadow from anon, authenticated;
grant select, insert on table public.eslo_market_calibration_shadow to service_role;
