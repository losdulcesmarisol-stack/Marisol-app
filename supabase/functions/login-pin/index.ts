// Login con PIN para la app de Panadería Marisol.
// Comprueba el PIN en el servidor (el PIN nunca llega al navegador), limita los
// intentos fallidos y devuelve un token de un solo uso con el que el navegador
// abre una sesión real de Supabase. La base de datos solo acepta peticiones con
// esa sesión.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MAX_FALLOS = 5;          // intentos fallidos permitidos...
const VENTANA_MIN = 15;        // ...en estos minutos, por usuario
const DOMINIO = "usuarios.panaderia-marisol.app"; // emails internos, nunca reciben correo

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function igual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  let usuario_id: string, pin: string;
  try {
    ({ usuario_id, pin } = await req.json());
  } catch {
    return json({ error: "Petición no válida" }, 400);
  }
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof usuario_id !== "string" || !UUID.test(usuario_id) || typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
    return json({ error: "Usuario o PIN no válidos" }, 400);
  }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Límite de intentos fallidos
  const desde = new Date(Date.now() - VENTANA_MIN * 60_000).toISOString();
  const { count: fallos } = await db.from("login_intentos").select("id", { count: "exact", head: true })
    .eq("usuario_id", usuario_id).eq("ok", false).gte("created_at", desde);
  if ((fallos ?? 0) >= MAX_FALLOS) {
    return json({ error: `Demasiados intentos. Espera ${VENTANA_MIN} minutos.` }, 429);
  }

  const { data: u } = await db.from("usuarios").select("id,nombre,rol,pin,activo,auth_user_id")
    .eq("id", usuario_id).maybeSingle();
  const ok = !!u && u.activo && igual(String(u.pin), pin);
  await db.from("login_intentos").insert({ usuario_id, ok });
  if (!ok) return json({ error: "PIN incorrecto" }, 401);

  // Cuenta de Supabase Auth asociada (se crea la primera vez)
  const email = `${u.id}@${DOMINIO}`;
  const meta = { usuario_id: u.id, nombre: u.nombre, rol: u.rol };
  let authId = u.auth_user_id as string | null;
  if (!authId) {
    const { data: creado, error } = await db.auth.admin.createUser({ email, email_confirm: true, app_metadata: meta });
    if (error) {
      // ya existía (p. ej. un intento anterior a medias): buscarla
      const { data: lista } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
      authId = lista?.users.find((x) => x.email === email)?.id ?? null;
      if (!authId) return json({ error: "No se pudo crear la sesión" }, 500);
    } else {
      authId = creado.user.id;
    }
    await db.from("usuarios").update({ auth_user_id: authId }).eq("id", u.id);
  }
  await db.auth.admin.updateUserById(authId, { app_metadata: meta });

  const { data: link, error: e2 } = await db.auth.admin.generateLink({ type: "magiclink", email });
  if (e2 || !link?.properties?.hashed_token) return json({ error: "No se pudo crear la sesión" }, 500);

  return json({ token_hash: link.properties.hashed_token, usuario: { id: u.id, nombre: u.nombre, rol: u.rol } });
});
