-- =====================================================================
-- Finanzas Casa · Script 15 · Foto del ticket en Supermercado
-- =====================================================================
-- Para leer el ticket con una foto y guardarla con la compra.
--
-- Qué hace:
--   1. supermarket_purchases: dos columnas nuevas (vacías en las compras
--      que ya hay):
--        · ticket_path  → dónde está la foto en el almacén «tickets».
--        · ticket_lines → las líneas que se leyeron del ticket
--          [{ text, amount, catId }], con la categoría que quedó al guardar.
--   2. Almacén (Storage) «tickets», PRIVADO (las fotos no tienen enlace
--      público; la app pide un enlace temporal al verlas), solo imágenes
--      JPEG/PNG/WebP de hasta 8 MB.
--   3. Permisos del almacén: igual que Supermercado (sección compartida),
--      cualquier usuario con rol (fc_allowed_owners del script 04) puede
--      subir, ver, mover y borrar fotos de ese almacén. Nada más.
-- Qué NO hace: no cambia ni borra compras, políticas ni datos existentes.
--
-- Requisito: scripts 04 y 07 ejecutados.
-- Ejecutar en Supabase → SQL Editor. Todo va en una transacción.
-- Se puede ejecutar dos veces sin daño. Al final hay cómo deshacerlo.
-- =====================================================================

begin;

-- 1. Columnas de la compra -------------------------------------------------
alter table public.supermarket_purchases
  add column if not exists ticket_path text,
  add column if not exists ticket_lines jsonb;

-- 2. Almacén privado de fotos ------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tickets', 'tickets', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 3. Permisos del almacén «tickets» -----------------------------------------
drop policy if exists fc_tickets_select on storage.objects;
create policy fc_tickets_select on storage.objects for select to authenticated
  using (bucket_id = 'tickets' and cardinality(public.fc_allowed_owners()) > 0);

drop policy if exists fc_tickets_insert on storage.objects;
create policy fc_tickets_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'tickets' and cardinality(public.fc_allowed_owners()) > 0);

drop policy if exists fc_tickets_update on storage.objects;
create policy fc_tickets_update on storage.objects for update to authenticated
  using (bucket_id = 'tickets' and cardinality(public.fc_allowed_owners()) > 0)
  with check (bucket_id = 'tickets' and cardinality(public.fc_allowed_owners()) > 0);

drop policy if exists fc_tickets_delete on storage.objects;
create policy fc_tickets_delete on storage.objects for delete to authenticated
  using (bucket_id = 'tickets' and cardinality(public.fc_allowed_owners()) > 0);

commit;

-- Comprobar (solo lectura):
-- select column_name from information_schema.columns
--  where table_schema = 'public' and table_name = 'supermarket_purchases' and column_name like 'ticket%';
-- select id, public, file_size_limit from storage.buckets where id = 'tickets';
-- select policyname, cmd from pg_policies where schemaname = 'storage' and policyname like 'fc_tickets%';

-- Deshacer (borra las fotos guardadas y lo leído de los tickets). Antes, vacía
-- y borra el almacén «tickets» desde Supabase → Storage (Supabase no deja
-- borrar fotos con SQL). Después:
-- begin;
-- drop policy if exists fc_tickets_select on storage.objects;
-- drop policy if exists fc_tickets_insert on storage.objects;
-- drop policy if exists fc_tickets_update on storage.objects;
-- drop policy if exists fc_tickets_delete on storage.objects;
-- alter table public.supermarket_purchases drop column if exists ticket_lines, drop column if exists ticket_path;
-- commit;
