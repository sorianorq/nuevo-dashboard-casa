-- =====================================================================
-- Finanzas Casa · Script 18 · Quitar cuentas vacías
-- =====================================================================
-- Petición de Ricardo (26/11/2026): añadir y quitar cuentas a mano desde
-- la app (Movimientos › Extractos › Cuentas). Los movimientos de una
-- cuenta quitada NO se borran: la app los pasa antes a otra cuenta del
-- mismo Balance o a la «Cuenta Raw» (se crea sola), y luego la borra vacía.
--
-- Qué hace:
--   · accounts: AÑADE una política RESTRICTIVA de borrado: ninguna cuenta
--     con movimientos se puede borrar, aunque otra política (p. ej. de la
--     app anterior) lo permita. Las restrictivas se suman a todas las demás.
--   · import_templates: permite borrar las plantillas de columnas de las
--     cuentas que el usuario ve (se quitan junto con la cuenta).
-- Qué NO hace: no borra ni mueve nada por sí mismo ni quita otras políticas.
--   Comprobado el 26/11/2026: la base de datos ya dejaba borrar cuentas
--   (política anterior a esta app); este script lo limita a las vacías.
--
-- Requisito: script 04 (public.fc_allowed_owners()).
-- Ejecutar en Supabase → SQL Editor. Se puede ejecutar dos veces sin daño.
-- Al final hay cómo deshacerlo.
-- =====================================================================

begin;

drop policy if exists fc_accounts_delete on public.accounts;
drop policy if exists fc_accounts_delete_vacia on public.accounts;
create policy fc_accounts_delete_vacia on public.accounts as restrictive for delete to authenticated
  using (not exists (select 1 from public.transactions t where t.account_id = accounts.id));

drop policy if exists fc_templates_delete on public.import_templates;
create policy fc_templates_delete on public.import_templates for delete to authenticated
  using (exists (
    select 1 from public.accounts a
     where a.id = import_templates.account_id
       and (case a.ownership_scope when 'common' then 'casa' else a.ownership_scope end)
           = any (public.fc_allowed_owners())));

commit;

-- Comprobación: debe devolver 2 filas (la primera, permissive = RESTRICTIVE).
-- select tablename, policyname, permissive from pg_policies where policyname in ('fc_accounts_delete_vacia', 'fc_templates_delete');
-- Qué otras políticas de borrado tiene accounts:
-- select policyname, permissive, qual from pg_policies where tablename = 'accounts' and cmd in ('DELETE', 'ALL');

-- Deshacer:
-- drop policy if exists fc_accounts_delete_vacia on public.accounts;
-- drop policy if exists fc_templates_delete on public.import_templates;
