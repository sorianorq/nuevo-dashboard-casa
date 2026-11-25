-- =====================================================================
-- Finanzas Casa · Script 16 · Quitar el bot de Telegram (opcional)
-- =====================================================================
-- El bot de Telegram se retira (decisión de Ricardo, 25/11/2026): los gastos
-- se apuntan desde la propia app (píldoras «Gasto» y «Ticket» del móvil).
--
-- Qué hace: BORRA la tabla public.telegram_pending (script 12), donde el bot
-- guardaba un gasto mientras se elegían sus botones. Solo tenía estados
-- temporales; ningún usuario de la app podía leerla.
-- Qué NO hace: NO borra ningún gasto. Los gastos apuntados desde Telegram
-- están en Movimientos (amex_expenses) y se quedan como están.
--
-- Ejecutar en Supabase → SQL Editor. Se puede ejecutar dos veces sin daño.
-- Para volver a tenerla, ejecutar otra vez el script 12.
-- =====================================================================

begin;

drop table if exists public.telegram_pending;

commit;

-- Comprobación (solo lectura): no debe salir ninguna fila.
select tablename from pg_tables where schemaname = 'public' and tablename = 'telegram_pending';
