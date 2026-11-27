-- Claves de servicios externos (Google Vision, Anthropic) guardadas cifradas en Vault.
-- Un administrador las pega en la app; solo las funciones del servidor pueden leerlas.
create or replace function public.guardar_clave_servicio(p_nombre text, p_valor text) returns void
language plpgsql security definer set search_path = public, vault as $$
declare v_id uuid; v_val text := nullif(btrim(coalesce(p_valor, '')), '');
begin
  if not public.es_admin() then raise exception 'Solo administradores'; end if;
  if p_nombre not in ('GOOGLE_VISION_KEY', 'ANTHROPIC_API_KEY') then raise exception 'Clave no permitida'; end if;
  if v_val is not null and (length(v_val) < 20 or length(v_val) > 300 or v_val ~ '\s') then raise exception 'La clave no parece válida'; end if;
  select id into v_id from vault.secrets where name = p_nombre;
  if v_val is null then
    if v_id is not null then delete from vault.secrets where id = v_id; end if;
  elsif v_id is null then
    perform vault.create_secret(v_val, p_nombre, 'Clave de servicio de la app');
  else
    perform vault.update_secret(v_id, v_val);
  end if;
end $$;
revoke all on function public.guardar_clave_servicio(text, text) from public, anon;
grant execute on function public.guardar_clave_servicio(text, text) to authenticated;

create or replace function public.claves_servicio_estado() returns table (nombre text, configurada boolean, actualizada timestamptz)
language sql security definer set search_path = public, vault as $$
  select n, s.id is not null, s.updated_at
  from unnest(array['GOOGLE_VISION_KEY','ANTHROPIC_API_KEY']) n left join vault.secrets s on s.name = n
  where public.es_admin();
$$;
revoke all on function public.claves_servicio_estado() from public, anon;
grant execute on function public.claves_servicio_estado() to authenticated;

create or replace function public.leer_clave_servicio(p_nombre text) returns text
language sql security definer set search_path = public, vault as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_nombre and p_nombre in ('GOOGLE_VISION_KEY','ANTHROPIC_API_KEY');
$$;
revoke all on function public.leer_clave_servicio(text) from public, anon, authenticated;
grant execute on function public.leer_clave_servicio(text) to service_role;
