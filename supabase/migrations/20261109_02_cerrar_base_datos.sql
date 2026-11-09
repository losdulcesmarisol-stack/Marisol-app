-- Parte 2: cerrar la base de datos. APLICAR SOLO cuando la nueva versión de la
-- app (login con la función login-pin) ya esté publicada en Netlify: la versión
-- antigua deja de funcionar en cuanto se aplica esto.

-- 1. Quitar el acceso libre de todas las tablas
drop policy if exists pub_usuarios    on public.usuarios;
drop policy if exists pub_productos   on public.productos;
drop policy if exists pub_clientes    on public.clientes;
drop policy if exists pub_ventas      on public.ventas;
drop policy if exists pub_comandas    on public.comandas;
drop policy if exists pub_proveedores on public.proveedores;
drop policy if exists pub_facturas    on public.facturas;
drop policy if exists pub_albaranes   on public.albaranes;
drop policy if exists pub_produccion  on public.produccion_diaria;

-- Sin sesión (anon) no se puede tocar ninguna tabla
revoke all on public.usuarios, public.productos, public.clientes, public.ventas, public.comandas,
  public.proveedores, public.facturas, public.albaranes, public.produccion_diaria from anon;

-- 2. Con sesión de un usuario activo: acceso de trabajo normal
do $$
declare t text;
begin
  foreach t in array array['productos','clientes','ventas','comandas','proveedores','facturas','albaranes','produccion_diaria']
  loop
    execute format('create policy %I on public.%I for all to authenticated using (public.usuario_activo()) with check (public.usuario_activo())', 'equipo_' || t, t);
  end loop;
end $$;

-- 3. Usuarios: todos ven nombres y roles (nunca el PIN); solo un admin crea o cambia usuarios
revoke all on public.usuarios from authenticated;
grant select (id, nombre, rol, activo, created_at, auth_user_id) on public.usuarios to authenticated;
grant insert (nombre, pin, rol, activo) on public.usuarios to authenticated;
grant update (nombre, pin, rol, activo) on public.usuarios to authenticated;

create policy usuarios_ver on public.usuarios for select to authenticated using (public.usuario_activo());
create policy usuarios_crear on public.usuarios for insert to authenticated with check (public.es_admin());
create policy usuarios_editar on public.usuarios for update to authenticated using (public.es_admin()) with check (public.es_admin());

-- 4. Fotos de facturas: solo con sesión se puede subir o borrar.
-- (Se siguen pudiendo VER con el enlace, como hasta ahora, para no romper las fotos ya guardadas.)
drop policy if exists facturas_upload on storage.objects;
drop policy if exists facturas_delete on storage.objects;
create policy facturas_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'facturas' and public.usuario_activo());
create policy facturas_update on storage.objects for update to authenticated
  using (bucket_id = 'facturas' and public.usuario_activo());
create policy facturas_delete on storage.objects for delete to authenticated
  using (bucket_id = 'facturas' and public.usuario_activo());
