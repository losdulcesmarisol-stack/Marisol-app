-- Módulo APPCC: temperaturas, limpieza, materias primas, lotes, recetas,
-- consumos de producción (stock y trazabilidad).
-- Solo añade tablas y un trigger en produccion_diaria; no cambia datos existentes.

-- ── Equipos de frío y temperaturas ───────────────────────────────────────
create table if not exists public.appcc_equipos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo text not null check (tipo in ('frio','congelacion')),
  t_min numeric(5,1),            -- null = sin mínimo (congeladores)
  t_max numeric(5,1) not null,
  orden int not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.appcc_temperaturas (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references public.appcc_equipos(id),
  fecha_hora timestamptz not null default now(),
  valor numeric(5,1) not null,
  fuera_rango boolean not null default false,
  correctora text,               -- obligatoria si fuera_rango
  fuente text not null default 'manual' check (fuente in ('manual','sensor')),
  usuario_id uuid references public.usuarios(id),
  usuario_nombre text,
  created_at timestamptz not null default now(),
  constraint correctora_si_fuera check (not fuera_rango or coalesce(trim(correctora),'') <> '')
);
create index if not exists appcc_temperaturas_fecha on public.appcc_temperaturas (fecha_hora desc);

-- ── Plan de limpieza ─────────────────────────────────────────────────────
create table if not exists public.limpieza_tareas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  cada_dias int not null check (cada_dias >= 1),
  proxima date not null default current_date,   -- fecha de referencia del ciclo
  producto text not null default '',
  procedimiento text not null default '',
  por_confirmar boolean not null default false,
  orden int not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.limpieza_incidencias (
  id uuid primary key default gen_random_uuid(),
  tarea_id uuid not null references public.limpieza_tareas(id),
  fecha date not null,
  motivo text not null,
  usuario_id uuid references public.usuarios(id),
  usuario_nombre text,
  created_at timestamptz not null default now(),
  unique (tarea_id, fecha)
);

create table if not exists public.limpieza_verificaciones (
  id uuid primary key default gen_random_uuid(),
  mes text not null unique,       -- 'AAAA-MM'
  fecha date not null default current_date,
  observaciones text not null default '',
  usuario_id uuid references public.usuarios(id),
  usuario_nombre text,
  created_at timestamptz not null default now()
);

-- ── Materias primas, recepción y lotes ───────────────────────────────────
create table if not exists public.materias_primas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  unidad text not null default 'kg' check (unidad in ('kg','L','ud')),
  stock_minimo numeric(12,3) not null default 0,
  alergenos text[] not null default '{}',
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.recepciones (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  proveedor_id uuid references public.proveedores(id),
  proveedor_nombre text not null,
  albaran text not null default '',
  foto_url text,
  usuario_id uuid references public.usuarios(id),
  usuario_nombre text,
  created_at timestamptz not null default now()
);

create table if not exists public.lotes_mp (
  id uuid primary key default gen_random_uuid(),
  recepcion_id uuid references public.recepciones(id) on delete cascade,
  materia_id uuid not null references public.materias_primas(id),
  cantidad numeric(12,3) not null check (cantidad > 0),
  lote text not null,
  caducidad date not null,
  temperatura numeric(5,1),
  estado text not null default 'aceptado' check (estado in ('aceptado','rechazado')),
  motivo text,
  created_at timestamptz not null default now()
);
create index if not exists lotes_mp_materia on public.lotes_mp (materia_id, caducidad);

-- ── Recetas (por 1 unidad de producto) ───────────────────────────────────
create table if not exists public.recetas (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id) on delete cascade,
  materia_id uuid not null references public.materias_primas(id),
  cantidad numeric(12,4) not null check (cantidad > 0),
  unique (producto_id, materia_id)
);

-- ── Lote del día y consumos de producción ────────────────────────────────
-- Lote = fecha de fabricación en 8 cifras (ddmmaaaa), como pide la normativa.
-- La app lo calcula a partir de produccion_diaria.fecha (no hace falta guardarlo).

create table if not exists public.produccion_consumos (
  id uuid primary key default gen_random_uuid(),
  produccion_id uuid not null references public.produccion_diaria(id) on delete cascade,
  materia_id uuid not null references public.materias_primas(id),
  lote_id uuid references public.lotes_mp(id),   -- null = faltó stock
  cantidad numeric(12,3) not null,
  created_at timestamptz not null default now()
);
create index if not exists produccion_consumos_prod on public.produccion_consumos (produccion_id);
create index if not exists produccion_consumos_lote on public.produccion_consumos (lote_id);

-- Stock que queda en cada lote
create or replace view public.lotes_mp_stock with (security_invoker = true) as
select l.*, l.cantidad - coalesce((select sum(c.cantidad) from public.produccion_consumos c where c.lote_id = l.id), 0) as restante
from public.lotes_mp l;

-- Al guardar la hoja de producción: descontar del stock según las recetas,
-- empezando por el lote que antes caduca.
create or replace function public.appcc_descontar_produccion()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  p record; r record; l record;
  uds numeric; falta numeric; disp numeric; q numeric;
begin
 begin  -- si algo falla aquí, la hoja de producción se guarda igualmente
  delete from produccion_consumos where produccion_id = new.id;
  for p in
    select pr.id as producto_id,
           coalesce(nullif(regexp_replace(coalesce(x->>'cocidas',''), '[^0-9.,]', '', 'g'), ''),
                    nullif(regexp_replace(coalesce(x->>'masa',''), '[^0-9.,]', '', 'g'), ''), '0') as uds_txt
    from jsonb_array_elements(coalesce(new.productos, '[]'::jsonb)) x
    join productos pr on pr.id::text = x->>'prodId' or upper(trim(pr.nombre)) = upper(trim(x->>'nombre'))
  loop
    uds := replace(p.uds_txt, ',', '.')::numeric;
    continue when uds is null or uds <= 0;
    for r in select materia_id, cantidad from recetas where producto_id = p.producto_id loop
      falta := r.cantidad * uds;
      for l in
        select s.id, s.restante from lotes_mp_stock s
        where s.materia_id = r.materia_id and s.estado = 'aceptado' and s.restante > 0
        order by s.caducidad, s.created_at
      loop
        exit when falta <= 0;
        disp := l.restante;  -- la vista ya descuenta lo consumido, incluido lo de esta misma hoja
        continue when disp <= 0;
        q := least(disp, falta);
        insert into produccion_consumos (produccion_id, materia_id, lote_id, cantidad) values (new.id, r.materia_id, l.id, q);
        falta := falta - q;
      end loop;
      if falta > 0.0005 then
        insert into produccion_consumos (produccion_id, materia_id, lote_id, cantidad) values (new.id, r.materia_id, null, falta);
      end if;
    end loop;
  end loop;
 exception when others then
  raise warning 'APPCC: no se pudo descontar el stock de la producción %: %', new.id, sqlerrm;
 end;
  return new;
end $$;
revoke all on function public.appcc_descontar_produccion() from public, anon, authenticated;

drop trigger if exists produccion_descuenta_stock on public.produccion_diaria;
create trigger produccion_descuenta_stock
  after insert or update of productos, fecha on public.produccion_diaria
  for each row execute function public.appcc_descontar_produccion();

-- ── Seguridad ────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['appcc_equipos','appcc_temperaturas','limpieza_tareas','limpieza_incidencias','limpieza_verificaciones','materias_primas','recepciones','lotes_mp','recetas','produccion_consumos']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
revoke all on public.lotes_mp_stock from anon;

-- Lo que apunta el equipo (cualquier usuario activo)
create policy equipo_ver on public.appcc_equipos for select to authenticated using (public.usuario_activo());
create policy equipo_temp on public.appcc_temperaturas for all to authenticated using (public.usuario_activo()) with check (public.usuario_activo());
create policy equipo_tareas_ver on public.limpieza_tareas for select to authenticated using (public.usuario_activo());
create policy equipo_incid on public.limpieza_incidencias for all to authenticated using (public.usuario_activo()) with check (public.usuario_activo());
create policy equipo_verif_ver on public.limpieza_verificaciones for select to authenticated using (public.usuario_activo());
create policy equipo_mp_ver on public.materias_primas for select to authenticated using (public.usuario_activo());
create policy equipo_recep on public.recepciones for all to authenticated using (public.usuario_activo()) with check (public.usuario_activo());
create policy equipo_lotes on public.lotes_mp for all to authenticated using (public.usuario_activo()) with check (public.usuario_activo());
create policy equipo_consumos_ver on public.produccion_consumos for select to authenticated using (public.usuario_activo());

-- Solo administradores: equipos, plan de limpieza, materias primas, revisión mensual y recetas
create policy admin_equipos on public.appcc_equipos for all to authenticated using (public.es_admin()) with check (public.es_admin());
create policy admin_tareas on public.limpieza_tareas for all to authenticated using (public.es_admin()) with check (public.es_admin());
create policy admin_verif on public.limpieza_verificaciones for all to authenticated using (public.es_admin()) with check (public.es_admin());
create policy admin_mp on public.materias_primas for all to authenticated using (public.es_admin()) with check (public.es_admin());
create policy admin_recetas on public.recetas for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- ── Datos iniciales ──────────────────────────────────────────────────────
insert into public.appcc_equipos (nombre, tipo, t_min, t_max, orden)
select * from (values
  ('Cámara de frío','frio',0,4,1), ('Frigorífico 1','frio',0,4,2), ('Frigorífico 2','frio',0,4,3),
  ('Congelador 1','congelacion',null,-18,4), ('Congelador 2','congelacion',null,-18,5),
  ('Congelador 3','congelacion',null,-18,6), ('Congelador 4','congelacion',null,-18,7)
) v(nombre,tipo,t_min,t_max,orden)
where not exists (select 1 from public.appcc_equipos);

insert into public.limpieza_tareas (nombre, cada_dias, producto, procedimiento, por_confirmar, orden)
select * from (values
  ('Amasadoras',1,'Detergente desengrasante de uso alimentario + desinfectante con registro HA','Desconectar. Quitar restos de masa con rasqueta. Lavar con agua caliente y detergente. Aclarar. Desinfectar a la dosis de la etiqueta. Aclarar con agua potable y secar.',false,1),
  ('Utensilios',1,'Detergente de uso alimentario + desinfectante HA (o lavavajillas a alta temperatura)','Quitar restos. Lavar con agua caliente y detergente. Aclarar. Desinfectar. Aclarar con agua potable y dejar secar al aire.',false,2),
  ('Suelos',1,'Desinfectante HA para suelos','Al terminar todo lo demás. Barrer o aspirar. Fregar con agua caliente y desinfectante a la dosis de la etiqueta. Dejar secar al aire.',false,3),
  ('Vitrinas',1,'Detergente de uso alimentario + desinfectante HA','Sin producto dentro. Lavar con detergente. Aclarar. Desinfectar. Aclarar y secar con papel de un solo uso.',false,4),
  ('Bandejas',1,'Detergente desengrasante de uso alimentario','Rascar restos. Lavar con agua caliente y desengrasante. Aclarar con agua potable y secar.',false,5),
  ('Hornos',14,'Desengrasante para hornos de uso alimentario','En frío y apagado. Aplicar el desengrasante el tiempo que diga la etiqueta. Retirar la suciedad. Aclarar muy bien con agua y secar.',false,6),
  ('Frigoríficos 1 y 2',30,'Detergente de uso alimentario + desinfectante HA','Pasar el género a otro equipo. Desconectar. Lavar con detergente y agua templada. Aclarar. Desinfectar. Aclarar, secar y conectar. Esperar a que enfríe antes de volver a llenar.',false,7),
  ('Congeladores 1 a 4',30,'Detergente de uso alimentario + desinfectante HA','Pasar el género a otro congelador. Desconectar y dejar que se suelte el hielo. Quitarlo con pala de plástico. Lavar con detergente y agua caliente. Aclarar. Desinfectar. Aclarar, secar y conectar.',false,8),
  ('Cámara de frío',30,'Detergente de uso alimentario + desinfectante HA','Vaciar, lavar, aclarar, desinfectar, aclarar y secar antes de volver a llenar.',true,9),
  ('Paredes, puertas y ventanas',60,'Detergente de uso alimentario + desinfectante HA','Sin alimentos al descubierto. De arriba abajo. Lavar con detergente, aclarar y desinfectar las zonas cercanas a donde se trabaja la masa.',false,10)
) v(nombre,cada_dias,producto,procedimiento,por_confirmar,orden)
where not exists (select 1 from public.limpieza_tareas);

insert into public.materias_primas (nombre, unidad, alergenos)
select * from (values
  ('Harina de trigo panificable','kg',array['Gluten']), ('Harina integral de trigo','kg',array['Gluten']),
  ('Levadura fresca','kg',array[]::text[]), ('Sal','kg',array[]::text[]), ('Masa madre','kg',array['Gluten']),
  ('Huevos','ud',array['Huevos']), ('Azúcar','kg',array[]::text[]), ('Aceite de oliva','L',array[]::text[]),
  ('Leche entera','L',array['Leche']), ('Mantequilla','kg',array['Leche'])
) v(nombre,unidad,alergenos)
where not exists (select 1 from public.materias_primas);
