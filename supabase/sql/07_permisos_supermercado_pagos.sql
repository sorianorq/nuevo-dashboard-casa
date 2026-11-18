-- =====================================================================
-- Finanzas Casa · Script 07 · Escribir en Supermercado y Pagos (para revisar)
-- =====================================================================
-- Necesario para la fase 3 (nueva compra, editar, borrar) y la fase 4 (Pagos).
--
-- Qué hace: AÑADE políticas fc_* (como los scripts 04 y 05), usando
-- public.fc_allowed_owners() del script 04:
--   · supermarket_purchases (compartida): cualquier usuario con rol puede
--     crear, cambiar y borrar compras. Al crear, la fila queda a su nombre.
--   · amex_expenses (Pagos): las mismas reglas que ya tiene para ver
--     (script 04): wallet = 'amex' → cualquier usuario con rol (la Amex es
--     compartida); wallet = andrea / ricardo → su dueño y admin.
--     Una compra del Súper pagada con Amex crea aquí su gasto (purchase_id).
-- Qué NO hace: no borra ni cambia políticas existentes, ni tablas, ni datos.
-- Las políticas se suman (OR) a las que ya hay.
--
-- Requisito: scripts 04 y 05 ejecutados.
-- Ejecutar en Supabase → SQL Editor. Todo va en una transacción.
-- Se puede ejecutar dos veces sin daño. Al final hay cómo deshacerlo.
-- =====================================================================

-- 0. (Solo lectura) Antes de ejecutar, para revisar las políticas actuales:
-- select tablename, policyname, cmd, qual, with_check from pg_policies
--  where schemaname = 'public' and tablename in ('supermarket_purchases','amex_expenses')
--  order by tablename, policyname;

begin;

-- 1. Supermercado (compartido) ---------------------------------------------
drop policy if exists fc_super_insert on public.supermarket_purchases;
create policy fc_super_insert on public.supermarket_purchases for insert to authenticated
  with check (cardinality(public.fc_allowed_owners()) > 0 and user_id = auth.uid());

drop policy if exists fc_super_update on public.supermarket_purchases;
create policy fc_super_update on public.supermarket_purchases for update to authenticated
  using (cardinality(public.fc_allowed_owners()) > 0)
  with check (cardinality(public.fc_allowed_owners()) > 0);

drop policy if exists fc_super_delete on public.supermarket_purchases;
create policy fc_super_delete on public.supermarket_purchases for delete to authenticated
  using (cardinality(public.fc_allowed_owners()) > 0);

-- 2. Pagos (amex_expenses) ---------------------------------------------------
drop policy if exists fc_amex_insert on public.amex_expenses;
create policy fc_amex_insert on public.amex_expenses for insert to authenticated
  with check ((wallet = 'amex' and cardinality(public.fc_allowed_owners()) > 0
               or wallet = any (public.fc_allowed_owners()))
              and user_id = auth.uid());

drop policy if exists fc_amex_update on public.amex_expenses;
create policy fc_amex_update on public.amex_expenses for update to authenticated
  using (wallet = 'amex' and cardinality(public.fc_allowed_owners()) > 0
         or wallet = any (public.fc_allowed_owners()))
  with check (wallet = 'amex' and cardinality(public.fc_allowed_owners()) > 0
              or wallet = any (public.fc_allowed_owners()));

drop policy if exists fc_amex_delete on public.amex_expenses;
create policy fc_amex_delete on public.amex_expenses for delete to authenticated
  using (wallet = 'amex' and cardinality(public.fc_allowed_owners()) > 0
         or wallet = any (public.fc_allowed_owners()));

commit;

-- ---------------------------------------------------------------------
-- Comprobación (solo lectura): políticas añadidas por este script
-- ---------------------------------------------------------------------
select tablename, policyname, cmd
  from pg_policies
 where schemaname = 'public'
   and policyname in ('fc_super_insert','fc_super_update','fc_super_delete',
                      'fc_amex_insert','fc_amex_update','fc_amex_delete')
 order by tablename, policyname;

-- ---------------------------------------------------------------------
-- Para deshacer (si hiciera falta):
-- drop policy if exists fc_super_insert on public.supermarket_purchases;
-- drop policy if exists fc_super_update on public.supermarket_purchases;
-- drop policy if exists fc_super_delete on public.supermarket_purchases;
-- drop policy if exists fc_amex_insert on public.amex_expenses;
-- drop policy if exists fc_amex_update on public.amex_expenses;
-- drop policy if exists fc_amex_delete on public.amex_expenses;
-- ---------------------------------------------------------------------
