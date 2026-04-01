-- ============================================================
-- PRODUCTOS MARISOL — Setup completo base de datos v3
-- ============================================================
-- INSTRUCCIONES:
-- 1. Ve a tu proyecto en supabase.com
-- 2. Haz clic en "SQL Editor" en el menú izquierdo
-- 3. Haz clic en "New query"
-- 4. Pega TODO este contenido
-- 5. Haz clic en "Run" (botón verde)
-- ============================================================

-- ============================================================
-- 1. USUARIOS
-- ============================================================
create table if not exists usuarios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  pin text not null,
  rol text not null check (rol in ('admin','empleado')),
  activo boolean default true,
  created_at timestamptz default now()
);

-- Usuarios por defecto (PIN admin: 1234 / PIN empleado: 0000)
insert into usuarios (nombre, pin, rol) values
  ('Marisol', '1234', 'admin'),
  ('Empleado', '0000', 'empleado')
on conflict do nothing;

-- ============================================================
-- 2. PRODUCTOS
-- ============================================================
create table if not exists productos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  categoria text not null default 'Pan',
  precio numeric(10,2) not null,
  icono text default '🥖',
  unidad text default 'unidad',
  activo boolean default true,
  created_at timestamptz default now()
);

-- ============================================================
-- 3. CLIENTES (con campos para albaranes)
-- ============================================================
create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text,
  tipo text default 'particular',
  notas text,
  direccion text,
  nif text,
  precios_especiales jsonb default '{}',
  activo boolean default true,
  created_at timestamptz default now()
);

-- ============================================================
-- 4. VENTAS
-- ============================================================
create table if not exists ventas (
  id uuid primary key default gen_random_uuid(),
  fecha_registro date not null default current_date,
  hora_registro time not null default current_time,
  fecha_entrega date not null,
  cliente_id uuid references clientes(id) on delete set null,
  cliente_nombre text not null default 'Directo',
  items jsonb not null default '[]',
  total numeric(10,2) not null,
  tipo text default 'cobrado',
  created_at timestamptz default now()
);

-- ============================================================
-- 5. COMANDAS
-- ============================================================
create table if not exists comandas (
  id uuid primary key default gen_random_uuid(),
  fecha_registro date not null default current_date,
  hora_registro time not null default current_time,
  fecha_entrega date not null,
  cliente_id uuid references clientes(id) on delete set null,
  cliente_nombre text not null default 'Directo',
  items jsonb not null default '[]',
  total numeric(10,2) not null,
  estado text not null default 'pendiente' check (estado in ('pendiente','cobrada')),
  fecha_cobro date,
  created_at timestamptz default now()
);

-- ============================================================
-- 6. PROVEEDORES
-- ============================================================
create table if not exists proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text,
  email text,
  direccion text,
  nif text,
  notas text,
  activo boolean default true,
  created_at timestamptz default now()
);

-- ============================================================
-- 7. FACTURAS DE PROVEEDORES (con foto/PDF)
-- ============================================================
create table if not exists facturas (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid references proveedores(id) on delete cascade,
  proveedor_nombre text not null,
  numero_factura text,
  fecha_factura date not null default current_date,
  fecha_vencimiento date,
  items jsonb not null default '[]',
  total numeric(10,2) not null default 0,
  estado text default 'pendiente' check (estado in ('pendiente','pagada')),
  foto_url text,
  notas text,
  created_at timestamptz default now()
);

-- ============================================================
-- 8. ALBARANES
-- ============================================================
create table if not exists albaranes (
  id uuid primary key default gen_random_uuid(),
  numero text not null,
  cliente_id uuid references clientes(id) on delete set null,
  cliente_nombre text not null,
  fecha date not null default current_date,
  items jsonb not null default '[]',
  subtotal numeric(10,2) not null default 0,
  iva numeric(5,2) not null default 21,
  total numeric(10,2) not null default 0,
  notas text,
  estado text default 'pendiente' check (estado in ('pendiente','pagado')),
  created_at timestamptz default now()
);

-- ============================================================
-- 9. ROW LEVEL SECURITY (RLS)
-- Necesario para que la app pueda leer y escribir datos
-- ============================================================
alter table usuarios    enable row level security;
alter table productos   enable row level security;
alter table clientes    enable row level security;
alter table ventas      enable row level security;
alter table comandas    enable row level security;
alter table proveedores enable row level security;
alter table facturas    enable row level security;
alter table albaranes   enable row level security;

-- Políticas de acceso público
-- (la app gestiona los roles internamente con PIN)
do $$ begin

  if not exists (select 1 from pg_policies where tablename='usuarios' and policyname='pub_usuarios') then
    create policy "pub_usuarios" on usuarios for all using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where tablename='productos' and policyname='pub_productos') then
    create policy "pub_productos" on productos for all using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where tablename='clientes' and policyname='pub_clientes') then
    create policy "pub_clientes" on clientes for all using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where tablename='ventas' and policyname='pub_ventas') then
    create policy "pub_ventas" on ventas for all using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where tablename='comandas' and policyname='pub_comandas') then
    create policy "pub_comandas" on comandas for all using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where tablename='proveedores' and policyname='pub_proveedores') then
    create policy "pub_proveedores" on proveedores for all using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where tablename='facturas' and policyname='pub_facturas') then
    create policy "pub_facturas" on facturas for all using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where tablename='albaranes' and policyname='pub_albaranes') then
    create policy "pub_albaranes" on albaranes for all using (true) with check (true);
  end if;

end $$;

-- ============================================================
-- 10. STORAGE PARA FOTOS DE FACTURAS
-- Permite subir y ver imágenes/PDFs de facturas
-- ============================================================
insert into storage.buckets (id, name, public)
values ('facturas', 'facturas', true)
on conflict (id) do nothing;

-- Política para subir fotos (si no existe ya)
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename='objects' and policyname='facturas_upload'
  ) then
    create policy "facturas_upload" on storage.objects
      for insert with check (bucket_id = 'facturas');
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename='objects' and policyname='facturas_read'
  ) then
    create policy "facturas_read" on storage.objects
      for select using (bucket_id = 'facturas');
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename='objects' and policyname='facturas_delete'
  ) then
    create policy "facturas_delete" on storage.objects
      for delete using (bucket_id = 'facturas');
  end if;
end $$;

-- ============================================================
-- ¡LISTO! Tablas creadas:
-- ✅ usuarios        — login con PIN y roles
-- ✅ productos       — catálogo con emojis
-- ✅ clientes        — con NIF y dirección para albaranes
-- ✅ ventas          — ventas cobradas al momento
-- ✅ comandas        — pedidos pendientes de cobro
-- ✅ proveedores     — gestión de proveedores
-- ✅ facturas        — facturas con foto/PDF
-- ✅ albaranes       — albaranes imprimibles
-- ✅ storage         — almacén de fotos de facturas
-- ============================================================
-- PIN por defecto:
--   Marisol (admin)  → 1234
--   Empleado         → 0000
-- Puedes cambiarlos desde ⚙️ Usuarios dentro de la app
-- ============================================================
