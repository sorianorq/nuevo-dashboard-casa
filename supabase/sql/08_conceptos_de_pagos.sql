-- =====================================================================
-- Finanzas Casa · Script 08 · Conceptos de Pagos de cualquier Balance (para revisar)
-- =====================================================================
-- Necesario para la fase 4 (Pagos · American Express).
--
-- Por qué: decisión de Ricardo (18/11/2026). Si Ricardo apunta en la Amex
-- un gasto que pagó Andrea (o al revés), el gasto va al Balance de la otra
-- persona aunque no pueda ver ese Balance. Para elegir el concepto hace
-- falta leer los NOMBRES de los conceptos de Pagos del otro, y las
-- políticas del script 04 no lo permiten (cada rol ve Casa + el suyo).
--
-- Qué hace: AÑADE una función de solo lectura, public.fc_pagos_concepts(),
-- que devuelve id, Balance, nombre, archivado y orden de los conceptos de
-- Pagos (enlazados con origen Pagos o marcados pagos_visible) de Casa,
-- Andrea y Ricardo, a cualquier usuario con rol. No da acceso a importes,
-- comentarios ni al resto del catálogo.
-- Qué NO hace: no cambia tablas, columnas, políticas ni datos.
--
-- Requisito: script 04 ejecutado (usa public.fc_allowed_owners()).
-- Ejecutar en Supabase → SQL Editor. Se puede ejecutar dos veces sin daño.
-- Al final hay cómo deshacerlo.
-- =====================================================================

begin;

create or replace function public.fc_pagos_concepts()
returns table (id uuid, owner text, concept text, archived boolean, sort_order text)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.owner, c.concept, coalesce(c.archived, false), c.sort_order::text
    from public.andrea_concepts c
   where cardinality(public.fc_allowed_owners()) > 0
     and c.owner in ('casa', 'andrea', 'ricardo')
     and c.kind = 'linked'
     and (c.link_source = 'pagos' or c.pagos_visible is true)
$$;

revoke all on function public.fc_pagos_concepts() from public;
grant execute on function public.fc_pagos_concepts() to authenticated;

commit;

-- ---------------------------------------------------------------------
-- Comprobación (solo lectura): cuántos conceptos de Pagos hay por Balance
-- (en el SQL Editor no hay sesión, así que aquí se cuenta sin la función)
-- ---------------------------------------------------------------------
select owner, count(*) as conceptos_de_pagos
  from public.andrea_concepts
 where kind = 'linked' and (link_source = 'pagos' or pagos_visible is true)
 group by owner
 order by owner;

-- ---------------------------------------------------------------------
-- Para deshacer (si hiciera falta):
-- drop function if exists public.fc_pagos_concepts();
-- ---------------------------------------------------------------------
