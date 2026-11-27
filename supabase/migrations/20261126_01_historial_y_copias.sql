-- Fase 4: historial de cambios (quién cambió qué y cuándo) y copias de seguridad diarias.
-- Solo añade cosas; no toca datos existentes.

-- ── Historial de cambios ──────────────────────────────────────────────────
create table if not exists public.historial_cambios (
  id bigserial primary key,
  cuando timestamptz not null default now(),
  tabla text not null,
  fila_id text,
  accion text not null check (accion in ('crear','cambiar','borrar')),
  usuario_id uuid,
  usuario_nombre text,
  antes jsonb,
  despues jsonb
);
create index if not exists historial_cambios_cuando on public.historial_cambios (cuando desc);
create index if not exists historial_cambios_tabla on public.historial_cambios (tabla, fila_id);

create or replace function public.apuntar_cambio() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_antes jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) - 'pin' end;
  v_despues jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) - 'pin' end;
  v_uid uuid := auth.uid();
  v_nombre text;
begin
  if tg_op = 'UPDATE' and v_antes = v_despues then return null; end if;
  if v_uid is not null then select nombre into v_nombre from usuarios where id = v_uid; end if;
  insert into historial_cambios (tabla, fila_id, accion, usuario_id, usuario_nombre, antes, despues)
  values (tg_table_name, coalesce(v_despues->>'id', v_antes->>'id', v_despues->>'producto_id', v_antes->>'producto_id'),
          case tg_op when 'INSERT' then 'crear' when 'UPDATE' then 'cambiar' else 'borrar' end,
          v_uid, coalesce(v_nombre, case when v_uid is null then 'Automático' else 'Usuario borrado' end), v_antes, v_despues);
  return null;
end $$;
revoke all on function public.apuntar_cambio() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['comandas','ventas','clientes','productos','proveedores','facturas','albaranes','usuarios','pedidos_fijos','productos_coste','produccion_diaria'] loop
    execute format('create or replace trigger historial after insert or update or delete on public.%I for each row execute function public.apuntar_cambio()', t);
  end loop;
end $$;

alter table public.historial_cambios enable row level security;
revoke all on public.historial_cambios from anon, authenticated;
grant select on public.historial_cambios to authenticated;
create policy admin_ver_historial on public.historial_cambios for select to authenticated using (public.es_admin());

-- ── Copias de seguridad ───────────────────────────────────────────────────
-- Cada noche se guarda una copia de todas las tablas de la app (sin PIN ni intentos
-- de acceso). Se guardan las de los últimos 30 días. Desde la app, un administrador
-- puede descargar cualquiera para tenerla también fuera (en el ordenador o el correo).
create table if not exists public.copias_seguridad (
  id bigserial primary key,
  creada timestamptz not null default now(),
  origen text not null default 'automática',
  filas int not null,
  datos jsonb not null
);
alter table public.copias_seguridad enable row level security;
revoke all on public.copias_seguridad from anon, authenticated;

create or replace function public.hacer_copia_seguridad(p_origen text default 'automática') returns bigint
language plpgsql security definer set search_path = public as $$
declare
  t text; v_datos jsonb := '{}'; v_tabla jsonb; v_filas int := 0; v_id bigint;
begin
  if auth.role() = 'authenticated' and not public.es_admin() then raise exception 'Solo administradores'; end if;
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname not in ('copias_seguridad','historial_cambios','login_intentos')
    order by 1
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x) - ''pin''), ''[]'') from public.%I x', t) into v_tabla;
    v_datos := v_datos || jsonb_build_object(t, v_tabla);
    v_filas := v_filas + jsonb_array_length(v_tabla);
  end loop;
  insert into copias_seguridad (origen, filas, datos) values (left(coalesce(p_origen, 'automática'), 40), v_filas, v_datos) returning id into v_id;
  delete from copias_seguridad where creada < now() - interval '30 days';
  return v_id;
end $$;
revoke all on function public.hacer_copia_seguridad(text) from public, anon;
grant execute on function public.hacer_copia_seguridad(text) to authenticated;

create or replace function public.listar_copias() returns table (id bigint, creada timestamptz, origen text, filas int, tamano text)
language sql security definer set search_path = public as $$
  select id, creada, origen, filas, pg_size_pretty(pg_column_size(datos)::bigint) from copias_seguridad
  where public.es_admin() order by creada desc;
$$;
revoke all on function public.listar_copias() from public, anon;
grant execute on function public.listar_copias() to authenticated;

create or replace function public.descargar_copia(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.es_admin() then raise exception 'Solo administradores'; end if;
  select jsonb_build_object('creada', creada, 'origen', origen, 'filas', filas, 'tablas', datos) into v from copias_seguridad where id = p_id;
  return v;
end $$;
revoke all on function public.descargar_copia(bigint) from public, anon;
grant execute on function public.descargar_copia(bigint) to authenticated;

-- Copia cada noche a las 03:17 (hora UTC 02:17; en verano es la 04:17 de España) y limpieza
-- del historial de más de 2 años el día 1 de cada mes
select cron.schedule('copia_seguridad', '17 2 * * *', $$select public.hacer_copia_seguridad('automática')$$);
select cron.schedule('historial_limpieza', '23 3 1 * *', $$delete from public.historial_cambios where cuando < now() - interval '2 years'$$);
