-- =====================================================================
-- Finanzas Casa · Script 11 · Borrar un concepto (para revisar)
-- =====================================================================
-- Necesario para el icono de borrar concepto en Balances (decisión de
-- Ricardo, 18/11/2026: al borrar, todo lo del concepto pasa a «Otros»).
--
-- Qué hace: CREA la función public.fc_delete_concept(concepto, destino),
-- que en una sola transacción (o todo o nada):
--   · si el concepto es un subtotal: sus conceptos quedan sueltos en el
--     bloque y se borra el subtotal (no tiene datos propios);
--   · si no: pasa al concepto destino («Otros» del mismo Balance y bloque)
--       - los movimientos del banco (transactions.concept_id),
--       - los gastos apuntados a mano (amex_expenses.concept_id),
--       - las compras del Súper (supermarket_purchases.concept_id),
--       - los importes escritos (andrea_balance): si el destino ya tiene
--         importe ese mes, se suman,
--       - los comentarios (andrea_comments): si el destino ya tiene, se
--         juntan los dos textos,
--       - el presupuesto (monthly_budgets): si el destino ya tiene ese mes,
--         se suman;
--     borra su periodicidad (andrea_periodicity) y el concepto.
-- Solo deja hacerlo en los Balances que el rol ve (fc_allowed_owners del
-- script 04). Es SECURITY DEFINER para mover también filas que quien borra
-- no ve (p. ej. un gasto con la tarjeta de Andrea apuntado a Casa) y no
-- dejar ninguna fila apuntando a un concepto que ya no existe.
-- Qué NO hace: no cambia tablas, columnas, políticas ni datos al ejecutarlo.
--
-- Requisito: script 04 ejecutado.
-- Ejecutar en Supabase → SQL Editor. Se puede ejecutar dos veces sin daño.
-- Al final hay cómo deshacerlo.
-- =====================================================================

begin;

create or replace function public.fc_delete_concept(p_concept uuid, p_target uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.andrea_concepts%rowtype;
  t public.andrea_concepts%rowtype;
  r record;
  n_tx int := 0;
  n_amex int := 0;
  n_super int := 0;
  n_amounts int := 0;
  n_comments int := 0;
  n_budgets int := 0;
  n_children int := 0;
begin
  select * into c from public.andrea_concepts where id = p_concept for update;
  if not found then
    raise exception 'El concepto no existe.';
  end if;
  if not (c.owner = any (public.fc_allowed_owners())) then
    raise exception 'Sin permiso para borrar conceptos de este Balance.';
  end if;

  -- Subtotal: sus conceptos quedan sueltos.
  if c.kind = 'subtotal' then
    update public.andrea_concepts set parent_id = null where parent_id = c.id;
    get diagnostics n_children = row_count;
    delete from public.andrea_concepts where id = c.id;
    return json_build_object('children', n_children);
  end if;

  select * into t from public.andrea_concepts where id = p_target;
  if not found or t.owner <> c.owner or t.kind = 'subtotal' or t.id = c.id or t.section <> c.section then
    raise exception 'El concepto destino no es válido.';
  end if;

  update public.transactions set concept_id = t.id where concept_id = c.id;
  get diagnostics n_tx = row_count;
  update public.amex_expenses set concept_id = t.id where concept_id = c.id;
  get diagnostics n_amex = row_count;
  update public.supermarket_purchases set concept_id = t.id where concept_id = c.id;
  get diagnostics n_super = row_count;

  -- Importes escritos (los antiguos pueden ir solo por nombre).
  for r in
    select id, year, month, amount from public.andrea_balance
     where owner = c.owner and (concept_id = c.id or (concept_id is null and concept = c.concept))
  loop
    n_amounts := n_amounts + 1;
    if exists (select 1 from public.andrea_balance
                where owner = t.owner and year = r.year and month = r.month
                  and (concept_id = t.id or (concept_id is null and concept = t.concept))) then
      update public.andrea_balance set amount = coalesce(amount, 0) + coalesce(r.amount, 0)
       where id = (select id from public.andrea_balance
                    where owner = t.owner and year = r.year and month = r.month
                      and (concept_id = t.id or (concept_id is null and concept = t.concept))
                    order by id limit 1);
      delete from public.andrea_balance where id = r.id;
    else
      update public.andrea_balance set concept_id = t.id, concept = t.concept where id = r.id;
    end if;
  end loop;

  -- Comentarios.
  for r in
    select id, year, month, comment from public.andrea_comments
     where owner = c.owner and (concept_id = c.id or (concept_id is null and concept = c.concept))
  loop
    n_comments := n_comments + 1;
    if exists (select 1 from public.andrea_comments
                where owner = t.owner and year = r.year and month = r.month
                  and (concept_id = t.id or (concept_id is null and concept = t.concept))) then
      update public.andrea_comments
         set comment = concat_ws(' · ', nullif(comment, ''), c.concept || ': ' || r.comment)
       where id = (select id from public.andrea_comments
                    where owner = t.owner and year = r.year and month = r.month
                      and (concept_id = t.id or (concept_id is null and concept = t.concept))
                    order by id limit 1);
      delete from public.andrea_comments where id = r.id;
    else
      update public.andrea_comments set concept_id = t.id, concept = t.concept where id = r.id;
    end if;
  end loop;

  -- Presupuesto.
  for r in
    select id, year, month, budget_amount from public.monthly_budgets
     where owner = c.owner and concept_id = c.id
  loop
    n_budgets := n_budgets + 1;
    if exists (select 1 from public.monthly_budgets
                where owner = t.owner and year = r.year and month = r.month and concept_id = t.id) then
      update public.monthly_budgets set budget_amount = coalesce(budget_amount, 0) + coalesce(r.budget_amount, 0)
       where id = (select id from public.monthly_budgets
                    where owner = t.owner and year = r.year and month = r.month and concept_id = t.id
                    order by id limit 1);
      delete from public.monthly_budgets where id = r.id;
    else
      update public.monthly_budgets set concept_id = t.id, category_group = t.concept where id = r.id;
    end if;
  end loop;

  delete from public.andrea_periodicity
   where owner = c.owner and (concept_id = c.id or (concept_id is null and concept = c.concept));
  delete from public.andrea_concepts where id = c.id;

  return json_build_object(
    'transactions', n_tx, 'manual', n_amex, 'purchases', n_super,
    'amounts', n_amounts, 'comments', n_comments, 'budgets', n_budgets
  );
end;
$$;

revoke all on function public.fc_delete_concept(uuid, uuid) from public;
grant execute on function public.fc_delete_concept(uuid, uuid) to authenticated;

commit;

-- Comprobación (solo lectura): debe salir una fila.
select proname, prosecdef from pg_proc where proname = 'fc_delete_concept';

-- ---------------------------------------------------------------------
-- Deshacer (solo quita la función; lo ya borrado no vuelve):
-- drop function if exists public.fc_delete_concept(uuid, uuid);
-- ---------------------------------------------------------------------
