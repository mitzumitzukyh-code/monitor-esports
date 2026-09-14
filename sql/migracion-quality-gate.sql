-- Historial del Quality Gate de publicación.
-- Una fila por predicción y versión de reglas. No modifica la predicción.
-- Sirve para medir prospectivamente qué habría publicado cada versión y por qué.

create table if not exists public.eslo_quality_gate (
  match_id bigint not null,
  gate_version text not null,
  juego text not null,
  decision text not null check (decision in ('pass', 'reject')),
  reasons jsonb not null default '[]'::jsonb,
  evaluated_at timestamptz not null default now(),
  inicio_programado timestamptz not null,
  tier text,
  prob_a numeric,
  prob_b numeric,
  confidence numeric,
  rd_max numeric,
  hours_to_start numeric,
  primary key (match_id, gate_version)
);

create index if not exists eslo_quality_gate_decision_idx
  on public.eslo_quality_gate (gate_version, decision, evaluated_at desc);

create index if not exists eslo_quality_gate_game_idx
  on public.eslo_quality_gate (juego, gate_version, evaluated_at desc);

alter table public.eslo_quality_gate enable row level security;

-- El monitor escribe desde GitHub Actions con la service_role. RLS se omite para
-- ese rol, pero PostgreSQL igual exige privilegios de tabla explícitos.
grant select, insert, update on table public.eslo_quality_gate to service_role;

comment on table public.eslo_quality_gate is
  'Registro prospectivo de decisiones del Quality Gate; no altera predicciones ni resultados.';
