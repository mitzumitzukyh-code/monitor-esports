-- Defensa en profundidad para eslo_cuotas.
-- Si ya existe una predicción congelada para un match_id, las cuotas futuras
-- sólo pueden corresponder a esos mismos dos participantes (el orden A/B puede
-- venir invertido). Un proveedor puede corregir/reutilizar IDs; esas filas no
-- deben entrar al histórico de calibración/ROI.

create or replace function public.guard_eslo_cuotas_fixture_identity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  p public.eslo_predicciones%rowtype;
begin
  select *
    into p
    from public.eslo_predicciones
   where match_id = new.match_id;

  if found then
    if p.juego is distinct from new.juego
       or not (
         (new.equipo_a = p.equipo_a and new.equipo_b = p.equipo_b)
         or
         (new.equipo_a = p.equipo_b and new.equipo_b = p.equipo_a)
       )
    then
      return null;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists eslo_cuotas_guard_fixture_identity on public.eslo_cuotas;

create trigger eslo_cuotas_guard_fixture_identity
before insert or update on public.eslo_cuotas
for each row
execute function public.guard_eslo_cuotas_fixture_identity();
