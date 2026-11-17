-- =====================================================================
-- Comprobación del Resumen · Balance Casa · marzo 2026
-- SOLO LECTURA (no cambia nada). Ejecutar en Supabase → SQL Editor y
-- comparar con /resumen?mes=2026-03 (pestaña Casa).
-- Reglas: especificación, apartado 6.
-- =====================================================================

-- 1. Tarjetas: ingresos, gastos, ahorro y tasa (solo flow = 'normal')
select
  round(coalesce(sum(amount) filter (where amount > 0), 0), 2)  as ingresos,
  round(coalesce(-sum(amount) filter (where amount < 0), 0), 2) as gastos,
  round(coalesce(sum(amount), 0), 2)                            as ahorro,
  round(100.0 * sum(amount) / nullif(sum(amount) filter (where amount > 0), 0), 1) as tasa_ahorro_pct,
  count(*)                                                      as movimientos
from public.transactions
where owner = 'casa'
  and flow = 'normal'
  and transaction_date between date '2026-03-01' and date '2026-03-31';

-- 2. Mes anterior (febrero) para la variación de la tasa en puntos
select
  round(100.0 * sum(amount) / nullif(sum(amount) filter (where amount > 0), 0), 1) as tasa_ahorro_feb_pct
from public.transactions
where owner = 'casa'
  and flow = 'normal'
  and transaction_date between date '2026-02-01' and date '2026-02-28';

-- 3. Gasto por concepto (marzo)
select coalesce(c.concept, '(sin concepto)') as concepto,
       round(-sum(t.amount), 2)              as gasto
from public.transactions t
left join public.andrea_concepts c on c.id = t.concept_id
where t.owner = 'casa' and t.flow = 'normal' and t.amount < 0
  and t.transaction_date between date '2026-03-01' and date '2026-03-31'
group by 1
order by 2 desc;

-- 4. Supermercado (compartido) y Amex (compartida)
select
  (select round(coalesce(sum(total), 0), 2) from public.supermarket_purchases
    where purchase_date between date '2026-03-01' and date '2026-03-31')  as supermercado_marzo,
  (select round(coalesce(sum(total), 0), 2) from public.supermarket_purchases
    where purchase_date between date '2026-02-01' and date '2026-02-28')  as supermercado_febrero,
  (select round(coalesce(sum(amount), 0), 2) from public.amex_expenses
    where wallet = 'amex' and expense_date between date '2026-03-01' and date '2026-03-31') as amex_marzo,
  (select round(coalesce(sum(amount), 0), 2) from public.amex_expenses
    where wallet = 'amex' and pending = true)                             as amex_pendiente_total;

-- 5. Diagnóstico: lo que el Resumen NO cuenta en marzo (para explicar diferencias)
select coalesce(owner, '(sin balance)') as balance, flow, count(*) as movimientos,
       round(sum(amount), 2) as suma
from public.transactions
where transaction_date between date '2026-03-01' and date '2026-03-31'
  and (owner is null or flow <> 'normal')
group by 1, 2
order by 1, 2;
