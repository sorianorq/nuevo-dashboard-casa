-- =====================================================================
-- Finanzas Casa · Script 14 · Flujo de dinero (para revisar)
-- =====================================================================
-- Petición de Ricardo (24/11/2026): un diagrama, estilo draw.io, con el
-- flujo de dinero entre las cuentas, compartido por Andrea y Ricardo.
--
-- Qué hace: CREA la tabla public.money_flow (una fila, id = 'casa', con
-- el diagrama en JSON: cuentas, flechas, importes, días y notas).
--   · RLS: cualquier usuario con rol en la app (como Supermercado,
--     script 07) puede verla, crearla y cambiarla. Nadie la puede borrar.
-- Qué NO hace: no cambia ninguna otra tabla, política ni dato.
--
-- Requisito: script 04 (public.fc_allowed_owners()).
-- Ejecutar en Supabase → SQL Editor. Se puede ejecutar dos veces sin daño.
-- Al final hay cómo deshacerlo.
-- =====================================================================

begin;

create table if not exists public.money_flow (
  id text primary key default 'casa' check (id = 'casa'),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) default auth.uid()
);

alter table public.money_flow enable row level security;

drop policy if exists fc_flow_select on public.money_flow;
create policy fc_flow_select on public.money_flow for select to authenticated
  using (cardinality(public.fc_allowed_owners()) > 0);

drop policy if exists fc_flow_insert on public.money_flow;
create policy fc_flow_insert on public.money_flow for insert to authenticated
  with check (cardinality(public.fc_allowed_owners()) > 0);

drop policy if exists fc_flow_update on public.money_flow;
create policy fc_flow_update on public.money_flow for update to authenticated
  using (cardinality(public.fc_allowed_owners()) > 0)
  with check (cardinality(public.fc_allowed_owners()) > 0);

commit;

-- Comprobación: debe devolver 3 políticas.
-- select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'money_flow';

-- Deshacer:
-- drop table if exists public.money_flow;
